import "server-only"

import { resolveScans, type ParseOutcome, type RawScan } from "@/carriers"
import type { Item, ReleaseOutcome } from "@/domain/items/types"
import { assignOutcome, isReleaseEligible, releaseScan } from "@/domain/release/rules"
import type { BusinessDate } from "@/domain/shared/dates"
import { err, ok, type Result } from "@/domain/shared/result"
import { getCarrier } from "@/server/data/config"
import { firstMatching } from "@/server/services/receiving"
import { updateItem, updateItems, type Op } from "@/server/services/tx"

export type ReleaseLookup = {
  parse: ParseOutcome
  /** every received piece with this itemId, eligible ones flagged */
  pieces: { item: Item; eligible: boolean }[]
}

export async function lookupReleaseScan(carrierCode: string, scans: RawScan[]): Promise<Result<ReleaseLookup>> {
  const carrier = await getCarrier(carrierCode)
  if (!carrier) return err("NOT_FOUND", "Carrier not found.")
  const resolved = resolveScans(carrier, scans)
  if (resolved.kind !== "candidates") return ok({ parse: resolved, pieces: [] })
  const { scan, hits } = await firstMatching(carrier.carrierCode, resolved.candidates)
  const pieces = hits
    .filter((i) => i.receivingState !== "expected")
    .sort((a, b) => (a.manifestId ?? "").localeCompare(b.manifestId ?? "") || a.pieceNumber - b.pieceNumber)
    .map((item) => ({ item, eligible: isReleaseEligible(item) }))
  return ok({ parse: { kind: "parsed", scan }, pieces })
}

export function releaseScanPiece(internalItemId: string, op: Op): Promise<Result<Item>> {
  return updateItem(internalItemId, op, (piece, ctx) => releaseScan(piece, ctx))
}

/** Admin: bulk outcome after the physical release scan. */
export function assignReleaseOutcome(
  internalItemIds: string[],
  outcome: ReleaseOutcome,
  dateOfRelease: BusinessDate,
  overrideIdentify: boolean,
  op: Op
): Promise<Result<Item[]>> {
  return updateItems(internalItemIds, op, (pieces, ctx) =>
    assignOutcome(pieces, outcome, dateOfRelease, { overrideIdentify }, ctx)
  )
}
