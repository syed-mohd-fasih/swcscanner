import "server-only"

import type { Item } from "@/domain/items/types"
import { pieceCounts, type PieceCounts } from "@/domain/manifests/rules"
import type { Manifest } from "@/domain/manifests/types"
import { err, ok, type Result } from "@/domain/shared/result"
import { adminDb } from "@/lib/firebase/admin"
import { buildWorkbook, type ExportSheet } from "@/services/export"
import { getLocations } from "@/server/data/config"
import { itemsByManifest, itemsWithoutManifest } from "@/server/data/items"
import { getManifests } from "@/server/data/manifests"
import { chunk, col } from "@/server/db"

/** One export, then one delete: stays far below the free 20k deletes a day. */
export const MAX_EXPORT_PIECES = 5000
/** Firestore allows 500 writes per transaction. */
const TX = 450

export type ExportSelection = { manifestIds: string[]; includeUnidentified: boolean }
/** what was exported, so the delete afterwards removes exactly that */
export type ExportSnapshot = { id: string; version: number }[]

export type ExportFile = {
  fileBase64: string
  fileName: string
  snapshot: ExportSnapshot
  pieces: number
  sheets: number
  counts: PieceCounts
}


/**
 * Every piece of the chosen manifests (any status), plus unidentified pieces
 * without a manifest when asked. Cost: one read per piece and per manifest.
 */
export async function exportWorkbook(
  selection: ExportSelection,
  by: { exportedBy: string; appVersion: string; single?: boolean }
): Promise<Result<ExportFile>> {
  const manifests = await getManifests(selection.manifestIds)
  const missing = selection.manifestIds.filter((id) => !manifests.has(id))
  if (missing.length) return err("NOT_FOUND", "A manifest was not found. It may have been deleted.")

  const sheets: ExportSheet[] = []
  let pieces = 0
  for (const id of selection.manifestIds) {
    const items = await itemsByManifest(id)
    pieces += items.length
    if (pieces > MAX_EXPORT_PIECES) return tooLarge()
    sheets.push({ manifest: manifests.get(id)!, items })
  }
  if (selection.includeUnidentified) {
    const items = await itemsWithoutManifest(MAX_EXPORT_PIECES + 1)
    pieces += items.length
    if (pieces > MAX_EXPORT_PIECES) return tooLarge()
    sheets.push({ manifest: null, items })
  }
  if (sheets.length === 0) return err("INVALID_INPUT", "Choose at least one manifest.")

  const exportedAt = new Date()
  const file = await buildWorkbook({
    sheets,
    locations: new Map((await getLocations()).map((l) => [l.locationId, l])),
    exportedAt,
    exportedBy: by.exportedBy,
    appVersion: by.appVersion,
    single: by.single,
  })
  const stamp = new Date(exportedAt.getTime() + 3 * 3600_000).toISOString().slice(0, 16).replace("T", "_").replace(":", "-")
  const base = by.single && sheets[0].manifest ? sheets[0].manifest.manifestName.replace(/[^\w.-]+/g, "-") : "swc-export"
  return ok({
    fileBase64: file.toString("base64"),
    fileName: `${base}_${stamp}.xlsx`,
    snapshot: sheets.flatMap((s) => s.items.map((i) => ({ id: i.internalItemId, version: i.version }))),
    pieces,
    sheets: sheets.length,
    counts: pieceCounts(sheets.flatMap((s) => s.items)),
  })
}

const tooLarge = () =>
  err("EXPORT_TOO_LARGE", `Too many pieces for one export (max ${MAX_EXPORT_PIECES}). Choose fewer manifests.`)

export type DeleteReport = {
  deletedPieces: number
  deletedManifests: number
  /** pieces that changed after the export: kept, export again */
  changedPieces: number
  /** manifests kept because pieces remain under them */
  keptManifests: string[]
}

/**
 * Permanently delete what an export contained. A piece is deleted only if it
 * is unchanged since the export (same version) and still belongs to the
 * exported selection; anything else is kept and reported. A manifest is
 * deleted once no pieces remain under it. Safe to repeat.
 */
export async function deleteExported(selection: ExportSelection, snapshot: ExportSnapshot): Promise<Result<DeleteReport>> {
  const manifestIds = new Set(selection.manifestIds)
  const belongs = (i: Item) => (i.manifestId ? manifestIds.has(i.manifestId) : selection.includeUnidentified)
  const versions = new Map(snapshot.map((s) => [s.id, s.version]))
  let deletedPieces = 0
  let changedPieces = 0

  for (const part of chunk([...versions.keys()], TX)) {
    const r = await adminDb().runTransaction(async (tx) => {
      const snaps = await tx.getAll(...part.map((id) => col.items().doc(id)))
      let deleted = 0
      let changed = 0
      for (const s of snaps) {
        if (!s.exists) continue // deleted by an earlier attempt
        const item = s.data() as Item
        if (item.version !== versions.get(s.id) || !belongs(item)) {
          changed++
          continue
        }
        tx.delete(s.ref)
        deleted++
      }
      return { deleted, changed }
    })
    deletedPieces += r.deleted
    changedPieces += r.changed
  }

  const report = await deleteEmptyManifests(selection.manifestIds)
  return ok({ deletedPieces, changedPieces, ...report })
}

/** Remove manifests with no pieces left; report the others. */
async function deleteEmptyManifests(ids: string[]): Promise<Pick<DeleteReport, "deletedManifests" | "keptManifests">> {
  let deletedManifests = 0
  const keptManifests: string[] = []
  const manifests = await getManifests(ids)
  for (const id of ids) {
    const left = await col.items().where("manifestId", "==", id).limit(1).select().get()
    if (!left.empty) {
      keptManifests.push(manifests.get(id)?.manifestName ?? id)
      continue
    }
    if (manifests.has(id)) {
      await col.manifests().doc(id).delete()
      deletedManifests++
    }
  }
  return { deletedManifests, keptManifests }
}

/**
 * Admin: delete a manifest and every piece under it, whatever their status,
 * without exporting. Cost: one read and one delete per piece. Safe to repeat.
 */
export async function deleteManifest(manifestId: string): Promise<Result<{ deletedPieces: number; manifest: Manifest | null }>> {
  const manifest = (await getManifests([manifestId])).get(manifestId) ?? null
  let deletedPieces = 0
  for (;;) {
    const page = await col.items().where("manifestId", "==", manifestId).limit(TX).select().get()
    if (page.empty) break
    const batch = adminDb().batch()
    for (const d of page.docs) batch.delete(d.ref)
    await batch.commit()
    deletedPieces += page.size
  }
  if (manifest) await col.manifests().doc(manifestId).delete()
  return ok({ deletedPieces, manifest })
}
