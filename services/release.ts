import { resolveScans, type ParseOutcome, type RawScan } from "@/carriers"
import type { Carrier } from "@/domain/carriers/types"
import type { Item, ReleaseOutcome } from "@/domain/items/types"
import { assignOutcome, isReleaseEligible, releaseScan } from "@/domain/release/rules"
import type { BusinessDate } from "@/domain/shared/dates"
import type { Result } from "@/domain/shared/result"
import { itemRepository, localWriter } from "@/repositories/indexeddb"
import { mutationContext, notFound } from "@/services/context"
import { firstMatching } from "@/services/receiving"

export type ReleaseLookup = {
  parse: ParseOutcome
  /** every local piece with this itemId, eligible ones flagged */
  pieces: { item: Item; eligible: boolean }[]
}

export async function lookupReleaseScan(carrier: Carrier, scans: RawScan[]): Promise<ReleaseLookup> {
  const resolved = resolveScans(carrier, scans)
  if (resolved.kind !== "candidates") return { parse: resolved, pieces: [] }
  const { scan, hits } = await firstMatching(carrier.carrierCode, resolved.candidates)
  const parse: ParseOutcome = { kind: "parsed", scan }
  const pieces = hits
    .filter((i) => i.receivingState !== "expected")
    .sort((a, b) => (a.manifestId ?? "").localeCompare(b.manifestId ?? "") || a.pieceNumber - b.pieceNumber)
    .map((item) => ({ item, eligible: isReleaseEligible(item) }))
  return { parse, pieces }
}

export async function releaseScanPiece(internalItemId: string, actorId: string): Promise<Result<Item>> {
  const piece = await itemRepository.get(internalItemId)
  if (!piece) return notFound("Piece")
  const result = releaseScan(piece, mutationContext(actorId))
  if (!result.ok) return result
  await localWriter.commit({ items: { update: [{ before: piece, after: result.value }] } })
  return result
}

/** Admin: bulk outcome after the physical release scan. */
export async function assignReleaseOutcome(
  internalItemIds: string[],
  outcome: ReleaseOutcome,
  dateOfRelease: BusinessDate,
  overrideIdentify: boolean,
  actorId: string
): Promise<Result<Item[]>> {
  const pieces = await itemRepository.getMany(internalItemIds)
  const result = assignOutcome(pieces, outcome, dateOfRelease, { overrideIdentify }, mutationContext(actorId))
  if (!result.ok) return result
  const before = new Map(pieces.map((p) => [p.internalItemId, p]))
  await localWriter.commit({
    items: { update: result.value.map((after) => ({ before: before.get(after.internalItemId)!, after })) },
  })
  return result
}
