import { touch, type MutationContext } from "@/domain/items/factory"
import type { InvestigationStatus, Item } from "@/domain/items/types"
import { err, ok, type Result } from "@/domain/shared/result"

export function setInvestigation(
  piece: Item,
  status: InvestigationStatus,
  note: string | null,
  ctx: MutationContext
): Result<Item> {
  if (piece.receivingState !== "unidentified") {
    return err("NOT_UNIDENTIFIED", "Only unidentified pieces have an investigation.", [
      piece.internalItemId,
    ])
  }
  return ok(touch(piece, { investigation: { status, note } }, ctx))
}

/**
 * Admin associates an unidentified piece with an expected manifest piece.
 * The expected record becomes received and inherits the physical facts
 * (location, storage, receival date and who/when) — receipt history is not
 * rewritten. The unidentified record is then deleted.
 */
export function mergeUnidentified(
  unidentified: Item,
  expected: Item,
  ctx: MutationContext
): Result<{ updated: Item; deletedInternalItemId: string }> {
  if (unidentified.receivingState !== "unidentified") {
    return err("NOT_UNIDENTIFIED", "Source piece is not unidentified.", [
      unidentified.internalItemId,
    ])
  }
  if (expected.receivingState !== "expected") {
    return err("NOT_EXPECTED", "Target piece has already been received.", [
      expected.internalItemId,
    ])
  }
  const updated = touch(
    expected,
    {
      receivingState: "received",
      storageState: unidentified.storageState,
      locationId: unidentified.locationId,
      dateOfReceival: unidentified.dateOfReceival,
      receivedBy: unidentified.receivedBy,
      receivedAt: unidentified.receivedAt,
      storedBy: unidentified.storedBy,
      storedAt: unidentified.storedAt,
      // a release scan already performed on the physical piece still stands
      releaseState: unidentified.releaseState,
      releaseScannedBy: unidentified.releaseScannedBy,
      releaseScannedAt: unidentified.releaseScannedAt,
      mergedFromInternalItemId: unidentified.internalItemId,
    },
    ctx
  )
  return ok({ updated, deletedInternalItemId: unidentified.internalItemId })
}
