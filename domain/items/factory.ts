import type { Item } from "@/domain/items/types"
import { newId } from "@/domain/shared/ids"

/** Who is acting and when — passed into every domain mutation. */
export type MutationContext = {
  actorId: string
  /** technical ISO timestamp */
  now: string
}

type NewItemInput = Pick<Item, "itemId" | "pieceNumber" | "pieceTotal" | "carrierCode"> &
  Partial<Omit<Item, "internalItemId" | "createdAt" | "updatedAt" | "version">>

export function createItem(input: NewItemInput, ctx: MutationContext): Item {
  return {
    internalItemId: newId(),
    manifestId: null,
    shipper: null,
    consignee: null,
    weight: null,
    description: null,
    receivingState: "expected",
    storageState: null,
    releaseState: "not_released",
    locationId: null,
    dateOfReceival: null,
    dateOfRelease: null,
    quantityMismatch: null,
    investigation: null,
    identifiedByOverride: false,
    mergedFromInternalItemId: null,
    receivedBy: null,
    storedBy: null,
    releaseScannedBy: null,
    outcomeBy: null,
    receivedAt: null,
    storedAt: null,
    releaseScannedAt: null,
    outcomeAt: null,
    ...input,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    version: 1,
  }
}

/** Apply a patch as a new version of the item. */
export function touch(item: Item, patch: Partial<Item>, ctx: MutationContext): Item {
  return { ...item, ...patch, updatedAt: ctx.now, version: item.version + 1 }
}
