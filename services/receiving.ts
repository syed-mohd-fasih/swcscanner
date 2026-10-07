import { resolveScans, type ParsedScan, type ParseOutcome, type RawScan } from "@/carriers"
import type { Carrier } from "@/domain/carriers/types"
import type { Item, LabelData } from "@/domain/items/types"
import { rankCandidates, type CandidateGroup } from "@/domain/receiving/candidates"
import {
  confirmReceipt,
  flagQuantityMismatch,
  recordUnidentified,
  type ReceiptInput,
} from "@/domain/receiving/rules"
import type { BusinessDate } from "@/domain/shared/dates"
import { ok, type Result } from "@/domain/shared/result"
import { itemRepository, localWriter, manifestRepository } from "@/repositories/indexeddb"
import { mutationContext, notFound } from "@/services/context"

export type ScanLookup = {
  parse: ParseOutcome
  /** candidate groups (manifested first), empty when nothing matches */
  groups: CandidateGroup[]
}

/**
 * Parse every barcode in view with the session carrier's parser and look up
 * locally (no network). The first candidate that matches local items wins;
 * if none match, the best candidate opens the unidentified flow.
 */
export async function lookupReceivingScan(
  carrier: Carrier,
  scans: RawScan[],
  sessionDate: BusinessDate
): Promise<ScanLookup> {
  const resolved = resolveScans(carrier, scans)
  if (resolved.kind !== "candidates") return { parse: resolved, groups: [] }

  const { scan, hits } = await firstMatching(carrier.carrierCode, resolved.candidates)
  const parse: ParseOutcome = { kind: "parsed", scan }
  const manifestIds = [...new Set(hits.map((h) => h.manifestId).filter((m): m is string => !!m))]
  const dates = new Map<string, BusinessDate>()
  for (const id of manifestIds) {
    const m = await manifestRepository.get(id)
    if (m) dates.set(id, m.date)
  }
  return { parse, groups: rankCandidates(hits, dates, sessionDate) }
}

/** First candidate with local hits, else the best candidate with none. */
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

/** Local lookup by the scanned ID, falling back to its alternate spellings. */
export async function findScannedItems(carrierCode: string, scan: ParsedScan): Promise<Item[]> {
  for (const id of [scan.itemId, ...(scan.alternateIds ?? [])]) {
    const hits = await itemRepository.findByCarrierItemId(carrierCode, id)
    if (hits.length > 0) return hits
  }
  return []
}

export async function confirmPiece(
  internalItemId: string,
  input: ReceiptInput,
  actorId: string
): Promise<Result<Item>> {
  const piece = await itemRepository.get(internalItemId)
  if (!piece) return notFound("Piece")
  const result = confirmReceipt(piece, input, mutationContext(actorId))
  if (!result.ok) return result
  await localWriter.commit({ items: { update: [{ before: piece, after: result.value }] } })
  return result
}

export type UnidentifiedPieceInput = ReceiptInput & {
  label: LabelData
  pieceNumber: number
  pieceTotal: number
}

export async function recordUnidentifiedPiece(
  input: UnidentifiedPieceInput,
  actorId: string
): Promise<Result<Item>> {
  const group = (
    await itemRepository.findByCarrierItemId(input.label.carrierCode, input.label.itemId.trim())
  ).filter((i) => i.receivingState === "unidentified" && i.manifestId === null)
  const result = recordUnidentified(input, group, mutationContext(actorId))
  if (!result.ok) return result
  await localWriter.commit({ items: { create: [result.value] } })
  return result
}

export async function flagPieceMismatch(
  internalItemId: string,
  labelTotal: number | null,
  note: string | null,
  actorId: string
): Promise<Result<Item>> {
  const piece = await itemRepository.get(internalItemId)
  if (!piece) return notFound("Piece")
  const result = flagQuantityMismatch(piece, labelTotal, note, mutationContext(actorId))
  if (!result.ok) return result
  await localWriter.commit({ items: { update: [{ before: piece, after: result.value }] } })
  return ok(result.value)
}

/** Most recent receipts recorded on this device (for the receiving screen). */
export async function recentReceipts(limit = 15): Promise<Item[]> {
  const all = await itemRepository.all()
  return all
    .filter((i) => i.receivedAt)
    .sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""))
    .slice(0, limit)
}
