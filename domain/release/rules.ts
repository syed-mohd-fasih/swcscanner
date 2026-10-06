import { touch, type MutationContext } from "@/domain/items/factory"
import type { Item, ReleaseOutcome } from "@/domain/items/types"
import type { BusinessDate } from "@/domain/shared/dates"
import { err, ok, type Result } from "@/domain/shared/result"

/**
 * A piece can be physically release-scanned once it has been received
 * (or recorded as unidentified), has a storage path, and is not yet scanned.
 */
export function isReleaseEligible(piece: Item): boolean {
  return (
    piece.receivingState !== "expected" &&
    piece.storageState !== null &&
    piece.releaseState === "not_released"
  )
}

/** Operator's physical release scan: "this piece was gathered". */
export function releaseScan(piece: Item, ctx: MutationContext): Result<Item> {
  if (!isReleaseEligible(piece)) {
    return err(
      "PIECE_NOT_ELIGIBLE",
      `Piece ${piece.pieceNumber}/${piece.pieceTotal} of ${piece.itemId} is not eligible for a release scan.`,
      [piece.internalItemId]
    )
  }
  return ok(
    touch(
      piece,
      { releaseState: "release_scanned", releaseScannedBy: ctx.actorId, releaseScannedAt: ctx.now },
      ctx
    )
  )
}

export type OutcomeOptions = {
  /**
   * Required when any selected piece is unidentified: marks it identified
   * and releases it. Irreversible.
   */
  overrideIdentify?: boolean
}

/**
 * Admin assigns the final outcome (bulk). Every piece must have been
 * physically release-scanned — there is no bypass.
 */
export function assignOutcome(
  pieces: Item[],
  outcome: ReleaseOutcome,
  dateOfRelease: BusinessDate,
  options: OutcomeOptions,
  ctx: MutationContext
): Result<Item[]> {
  const notScanned = pieces.filter((p) => p.releaseState !== "release_scanned")
  if (notScanned.length > 0) {
    return err(
      "NOT_RELEASE_SCANNED",
      `${notScanned.length} selected piece(s) have not been physically release-scanned.`,
      notScanned.map((p) => p.internalItemId)
    )
  }
  const unidentified = pieces.filter((p) => p.receivingState === "unidentified")
  if (unidentified.length > 0 && !options.overrideIdentify) {
    return err(
      "OVERRIDE_REQUIRED",
      `${unidentified.length} selected piece(s) are unidentified and need the identify override.`,
      unidentified.map((p) => p.internalItemId)
    )
  }
  return ok(
    pieces.map((p) =>
      touch(
        p,
        {
          releaseState: outcome,
          dateOfRelease,
          outcomeBy: ctx.actorId,
          outcomeAt: ctx.now,
          ...(p.receivingState === "unidentified"
            ? { receivingState: "received" as const, identifiedByOverride: true, investigation: null }
            : {}),
        },
        ctx
      )
    )
  )
}
