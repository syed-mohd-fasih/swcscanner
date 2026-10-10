import "server-only"

import { touch } from "@/domain/items/factory"
import type { Item } from "@/domain/items/types"
import { expandManifestLine, generateManifestName } from "@/domain/manifests/rules"
import type { Manifest, ManifestHeader, ManifestLine } from "@/domain/manifests/types"
import { err, ok, type Result } from "@/domain/shared/result"
import { adminDb } from "@/lib/firebase/admin"
import { chunk, col } from "@/server/db"
import { contextFor, notFound, updateItem, type Op } from "@/server/services/tx"

const BATCH = 450

/**
 * Admin: create a manifest and expand its lines into expected pieces.
 * The manifest's ID is the opId and its document is written last, so a
 * retried operation either finds the finished manifest (success) or first
 * clears the pieces of the interrupted attempt.
 */
export async function createManifest(header: ManifestHeader, lines: ManifestLine[], op: Op): Promise<Result<Manifest>> {
  if (lines.length === 0) return err("INVALID_QUANTITY", "Add at least one item line.")
  const manifestRef = col.manifests().doc(op.opId)
  const existing = await manifestRef.get()
  if (existing.exists) return ok(existing.data() as Manifest)

  const ctx = contextFor(op)
  const items: Item[] = []
  for (const line of lines) {
    const pieces = expandManifestLine(line, op.opId, ctx)
    if (!pieces.ok) return pieces
    items.push(...pieces.value)
  }
  const manifest: Manifest = {
    manifestId: op.opId,
    manifestName: header.manifestName.trim() || generateManifestName(header.carrierCode, header.date, header.truckId),
    truckId: header.truckId.trim(),
    carrierCode: header.carrierCode,
    date: header.date,
    notes: header.notes,
    pieceCount: items.length,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    version: 1,
  }

  const db = adminDb()
  const leftovers = await col.items().where("manifestId", "==", op.opId).select().get()
  for (const part of chunk(leftovers.docs, BATCH)) {
    const batch = db.batch()
    for (const d of part) batch.delete(d.ref)
    await batch.commit()
  }
  for (const part of chunk(items, BATCH)) {
    const batch = db.batch()
    for (const item of part) batch.set(col.items().doc(item.internalItemId), { ...item, lastOpId: op.opId })
    await batch.commit()
  }
  await manifestRef.set(manifest)
  return ok(manifest)
}

export type ItemCorrection = Partial<
  Pick<
    Item,
    | "itemId"
    | "carrierCode"
    | "shipper"
    | "consignee"
    | "weight"
    | "description"
    | "locationId"
    | "dateOfReceival"
    | "dateOfRelease"
    | "quantityMismatch"
  >
>

/** Admin data correction on an item's descriptive fields. */
export function correctItem(internalItemId: string, patch: ItemCorrection, op: Op): Promise<Result<Item>> {
  return updateItem(internalItemId, op, (piece, ctx) => ok(touch(piece, patch, ctx)))
}

/** Admin: delete pieces that were never received (e.g. a mistyped line). */
export async function deleteExpectedPieces(internalItemIds: string[]): Promise<Result<number>> {
  if (internalItemIds.length === 0) return err("INVALID_INPUT", "Select at least one piece.")
  if (internalItemIds.length > BATCH) return err("INVALID_INPUT", "Too many pieces at once (max 450).")
  return adminDb().runTransaction(async (tx) => {
    const snaps = await tx.getAll(...internalItemIds.map((id) => col.items().doc(id)))
    // already deleted by an earlier attempt → nothing left to do for those
    const pieces = snaps.filter((s) => s.exists).map((s) => s.data() as Item)
    const received = pieces.filter((p) => p.receivingState !== "expected")
    if (received.length) {
      return err(
        "PIECE_NOT_ELIGIBLE",
        "Only pieces that were never received can be deleted.",
        received.map((p) => p.internalItemId)
      )
    }
    for (const p of pieces) tx.delete(col.items().doc(p.internalItemId))
    return ok(pieces.length)
  })
}

export type ManifestEdit = Pick<Manifest, "manifestName" | "truckId" | "date" | "notes">

/**
 * Admin: edit a manifest's details. The carrier is not editable: each piece
 * keeps its own carrier, and scan lookups use it.
 */
export async function updateManifest(manifestId: string, edit: ManifestEdit): Promise<Result<Manifest>> {
  return adminDb().runTransaction(async (tx) => {
    const ref = col.manifests().doc(manifestId)
    const snap = await tx.get(ref)
    if (!snap.exists) return notFound("Manifest")
    const before = snap.data() as Manifest
    const after: Manifest = {
      ...before,
      manifestName: edit.manifestName.trim() || before.manifestName,
      truckId: edit.truckId.trim(),
      date: edit.date,
      notes: edit.notes,
      updatedAt: new Date().toISOString(),
      version: before.version + 1,
    }
    tx.set(ref, after)
    return ok(after)
  })
}
