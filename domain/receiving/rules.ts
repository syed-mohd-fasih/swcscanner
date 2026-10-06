import { createItem, touch, type MutationContext } from "@/domain/items/factory"
import type { Item, LabelData } from "@/domain/items/types"
import type { BusinessDate } from "@/domain/shared/dates"
import { err, ok, type Result } from "@/domain/shared/result"

/**
 * Decided at receiving: the piece is stored later (separate store step) or
 * goes straight out as a direct release. No location is set while scanning.
 */
export type ReceiptPath = "store_later" | "direct_release"

export type ReceiptInput = {
  path: ReceiptPath
  dateOfReceival: BusinessDate
}

/** Checks a locationId against the predefined (active) location dataset. */
export type LocationValidator = (locationId: string) => boolean

const storageFor = (path: ReceiptPath): Pick<Item, "storageState" | "locationId"> => ({
  storageState: path === "direct_release" ? "direct_release" : null,
  locationId: null,
})

/**
 * Confirm a manifested (expected) piece as physically received.
 * Rejects pieces that were already confirmed — the duplicate-piece guard.
 */
export function confirmReceipt(piece: Item, input: ReceiptInput, ctx: MutationContext): Result<Item> {
  if (piece.receivingState !== "expected" || piece.releaseState !== "not_released") {
    return err(
      "PIECE_ALREADY_CONFIRMED",
      `Piece ${piece.pieceNumber}/${piece.pieceTotal} of ${piece.itemId} was already confirmed.`,
      [piece.internalItemId]
    )
  }
  return ok(
    touch(
      piece,
      {
        receivingState: "received",
        ...storageFor(input.path),
        dateOfReceival: input.dateOfReceival,
        receivedBy: ctx.actorId,
        receivedAt: ctx.now,
      },
      ctx
    )
  )
}

export type UnidentifiedInput = ReceiptInput & {
  label: LabelData
  pieceNumber: number
  pieceTotal: number
}

/**
 * Record a physical piece that matches no expected item. Pieces of the same
 * unidentified shipment (same carrier + itemId) join one group; `group` holds
 * its existing pieces so duplicates are rejected and the total stays consistent.
 */
export function recordUnidentified(input: UnidentifiedInput, group: Item[], ctx: MutationContext): Result<Item> {
  const total = group[0]?.pieceTotal ?? input.pieceTotal
  if (!Number.isInteger(total) || total < 1) {
    return err("INVALID_QUANTITY", "Quantity must be a whole number ≥ 1.")
  }
  if (!Number.isInteger(input.pieceNumber) || input.pieceNumber < 1 || input.pieceNumber > total) {
    return err("INVALID_PIECE", `Piece must be between 1 and ${total}.`)
  }
  const duplicate = group.find((p) => p.pieceNumber === input.pieceNumber)
  if (duplicate) {
    return err(
      "PIECE_ALREADY_CONFIRMED",
      `Piece ${input.pieceNumber}/${total} of ${input.label.itemId} is already recorded.`,
      [duplicate.internalItemId]
    )
  }

  const item = createItem(
    {
      ...input.label,
      itemId: input.label.itemId.trim(),
      pieceNumber: input.pieceNumber,
      pieceTotal: total,
      receivingState: "unidentified",
      ...storageFor(input.path),
      dateOfReceival: input.dateOfReceival,
      investigation: { status: "open", note: null },
      // the operator said the label total differs from the group's
      quantityMismatch:
        group.length > 0 && input.pieceTotal !== total ? { labelTotal: input.pieceTotal, note: null } : null,
      receivedBy: ctx.actorId,
      receivedAt: ctx.now,
    },
    ctx
  )
  return ok(item)
}

/** Received (or unidentified) pieces waiting for the separate store step. */
export function isAwaitingStorage(piece: Item): boolean {
  return piece.receivingState !== "expected" && piece.storageState === null && piece.releaseState === "not_released"
}

/**
 * The store step: put an already-received piece at a predefined location.
 * Happens after receiving, when the goods are actually shelved.
 */
export function storePiece(
  piece: Item,
  locationId: string,
  ctx: MutationContext,
  isValidLocation: LocationValidator
): Result<Item> {
  if (!isAwaitingStorage(piece)) {
    return err(
      "PIECE_NOT_ELIGIBLE",
      `Piece ${piece.pieceNumber}/${piece.pieceTotal} of ${piece.itemId} is not waiting for storage.`,
      [piece.internalItemId]
    )
  }
  if (!locationId) return err("LOCATION_REQUIRED", "Choose a location.")
  if (!isValidLocation(locationId)) {
    return err("LOCATION_INVALID", `Unknown or inactive location "${locationId}".`)
  }
  return ok(
    touch(piece, { storageState: "stored", locationId, storedBy: ctx.actorId, storedAt: ctx.now }, ctx)
  )
}

/**
 * Flag a discrepancy between the label and the expected quantity.
 * Never alters pieceTotal — resolution is a human decision.
 */
export function flagQuantityMismatch(
  piece: Item,
  labelTotal: number | null,
  note: string | null,
  ctx: MutationContext
): Result<Item> {
  return ok(touch(piece, { quantityMismatch: { labelTotal, note } }, ctx))
}
