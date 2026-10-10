import "server-only"

import { resolveScans, type ParsedScan, type ParseOutcome, type RawScan } from "@/carriers"
import type { Item, LabelData } from "@/domain/items/types"
import type { Manifest } from "@/domain/manifests/types"
import { rankCandidates, type CandidateGroup } from "@/domain/receiving/candidates"
import {
  confirmReceipt,
  flagQuantityMismatch,
  recordUnidentified,
  type ReceiptInput,
} from "@/domain/receiving/rules"
import type { BusinessDate } from "@/domain/shared/dates"
import { err, ok, type Result } from "@/domain/shared/result"
import { adminDb } from "@/lib/firebase/admin"
import { getCarrier } from "@/server/data/config"
import { findByCarrierItemId } from "@/server/data/items"
import { getManifestHeaders } from "@/server/data/manifests"
import { col } from "@/server/db"
import { contextFor, updateItem, type Op } from "@/server/services/tx"

export type ScanLookup = {
  parse: ParseOutcome
  /** candidate groups (manifested first), empty when nothing matches */
  groups: CandidateGroup[]
  /** headers of the manifests in `groups`, by manifestId */
  manifests: Record<string, Manifest>
}

/**
 * Parse every barcode in view with the session carrier's parser and look the
 * best one up. Cost: one read per matching piece (+1 per manifest header).
 */
export async function lookupReceivingScan(
  carrierCode: string,
  scans: RawScan[],
  sessionDate: BusinessDate
): Promise<Result<ScanLookup>> {
  const carrier = await getCarrier(carrierCode)
  if (!carrier) return err("NOT_FOUND", "Carrier not found.")
  const resolved = resolveScans(carrier, scans)
  if (resolved.kind !== "candidates") return ok({ parse: resolved, groups: [], manifests: {} })

  const { scan, hits } = await firstMatching(carrier.carrierCode, resolved.candidates)
  const manifests = await getManifestHeaders(hits.map((h) => h.manifestId).filter((m): m is string => !!m))
  const dates = new Map([...manifests].map(([id, m]) => [id, m.date]))
  return ok({
    parse: { kind: "parsed", scan },
    groups: rankCandidates(hits, dates, sessionDate),
    manifests: Object.fromEntries(manifests),
  })
}

/** First candidate with matches, else the best candidate with none. */
export async function firstMatching(
  carrierCode: string,
  candidates: ParsedScan[]
): Promise<{ scan: ParsedScan; hits: Item[] }> {
  for (const scan of candidates) {
    const hits = await findScannedItems(carrierCode, scan)
    if (hits.length > 0) return { scan, hits }
  }
  return { scan: candidates[0], hits: [] }
}

/** Lookup by the scanned ID, falling back to its alternate spellings. */
export async function findScannedItems(carrierCode: string, scan: ParsedScan): Promise<Item[]> {
  for (const id of [scan.itemId, ...(scan.alternateIds ?? [])]) {
    const hits = await findByCarrierItemId(carrierCode, id)
    if (hits.length > 0) return hits
  }
  return []
}

export function confirmPiece(internalItemId: string, input: ReceiptInput, op: Op): Promise<Result<Item>> {
  return updateItem(internalItemId, op, (piece, ctx) => confirmReceipt(piece, input, ctx))
}

export type UnidentifiedPieceInput = ReceiptInput & {
  label: LabelData
  pieceNumber: number
  pieceTotal: number
}

/**
 * Record a piece that matches no expected item. The new document's ID is the
 * opId, so a replayed operation finds its own piece instead of a duplicate.
 */
export async function recordUnidentifiedPiece(input: UnidentifiedPieceInput, op: Op): Promise<Result<Item>> {
  const itemId = input.label.itemId.trim()
  return adminDb().runTransaction(async (tx) => {
    const ref = col.items().doc(op.opId)
    const existing = await tx.get(ref)
    if (existing.exists) return ok(existing.data() as Item)

    const groupSnap = await tx.get(
      col.items().where("carrierCode", "==", input.label.carrierCode).where("itemId", "==", itemId)
    )
    const group = groupSnap.docs
      .map((d) => d.data() as Item)
      .filter((i) => i.receivingState === "unidentified" && i.manifestId === null)
    const result = recordUnidentified({ ...input, label: { ...input.label, itemId } }, group, contextFor(op))
    if (!result.ok) return result
    const piece: Item = { ...result.value, internalItemId: op.opId, lastOpId: op.opId }
    tx.create(ref, piece)
    return ok(piece)
  })
}

export function flagPieceMismatch(
  internalItemId: string,
  labelTotal: number | null,
  note: string | null,
  op: Op
): Promise<Result<Item>> {
  return updateItem(internalItemId, op, (piece, ctx) => flagQuantityMismatch(piece, labelTotal, note, ctx))
}
