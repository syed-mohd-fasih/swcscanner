import type { Item } from "@/domain/items/types"
import { isAwaitingStorage, storePiece } from "@/domain/receiving/rules"
import { err, ok, type Result } from "@/domain/shared/result"
import { itemRepository, localWriter } from "@/repositories/indexeddb"
import { activeLocationValidator, mutationContext } from "@/services/context"

/** Received pieces (any carrier) that still need a location. */
export async function listAwaitingStorage(): Promise<Item[]> {
  const [received, unidentified] = await Promise.all([
    itemRepository.listByReceivingState("received"),
    itemRepository.listByReceivingState("unidentified"),
  ])
  return [...received, ...unidentified].filter(isAwaitingStorage)
}

/**
 * The separate store step: put one or more received pieces at one predefined
 * location (pieces of a shipment are usually shelved together). All-or-nothing.
 */
export async function storePieces(
  internalItemIds: string[],
  locationId: string,
  actorId: string
): Promise<Result<Item[]>> {
  if (internalItemIds.length === 0) return err("PIECE_NOT_ELIGIBLE", "Select at least one piece.")
  const pieces = await itemRepository.getMany(internalItemIds)
  const ctx = mutationContext(actorId)
  const isValid = await activeLocationValidator()
  const stored: Item[] = []
  for (const piece of pieces) {
    const result = storePiece(piece, locationId, ctx, isValid)
    if (!result.ok) return result
    stored.push(result.value)
  }
  const before = new Map(pieces.map((p) => [p.internalItemId, p]))
  await localWriter.commit({
    items: { update: stored.map((after) => ({ before: before.get(after.internalItemId)!, after })) },
  })
  return ok(stored)
}
