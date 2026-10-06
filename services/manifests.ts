import { touch } from "@/domain/items/factory"
import type { Item } from "@/domain/items/types"
import { expandManifestLine, generateManifestName } from "@/domain/manifests/rules"
import type { Manifest, ManifestLine } from "@/domain/manifests/types"
import type { BusinessDate } from "@/domain/shared/dates"
import { newId } from "@/domain/shared/ids"
import { err, ok, type Result } from "@/domain/shared/result"
import { itemRepository, localWriter, manifestRepository } from "@/repositories/indexeddb"
import { mutationContext } from "@/services/context"

export type ManifestHeader = {
  manifestName: string
  truckId: string
  carrierCode: string
  date: BusinessDate
  notes: string | null
}

export { generateManifestName }

/** Admin: create a manifest and expand its lines into expected pieces. */
export async function createManifest(
  header: ManifestHeader,
  lines: ManifestLine[],
  actorId: string
): Promise<Result<{ manifest: Manifest; items: Item[] }>> {
  if (lines.length === 0) return err("INVALID_QUANTITY", "Add at least one item line.")
  const ctx = mutationContext(actorId)
  const manifest: Manifest = {
    manifestId: newId(),
    manifestName: header.manifestName.trim() ||
      generateManifestName(header.carrierCode, header.date, header.truckId),
    truckId: header.truckId.trim(),
    carrierCode: header.carrierCode,
    date: header.date,
    notes: header.notes,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    version: 1,
  }
  const items: Item[] = []
  for (const line of lines) {
    const pieces = expandManifestLine(line, manifest.manifestId, ctx)
    if (!pieces.ok) return pieces
    items.push(...pieces.value)
  }
  await localWriter.commit({ manifests: { create: [manifest] }, items: { create: items } })
  return ok({ manifest, items })
}

export async function updateManifestHeader(
  manifestId: string,
  header: Partial<ManifestHeader>,
  actorId: string
): Promise<Result<Manifest>> {
  const before = await manifestRepository.get(manifestId)
  if (!before) return err("PIECE_NOT_ELIGIBLE", "Manifest not found on this device.")
  const ctx = mutationContext(actorId)
  const after: Manifest = { ...before, ...header, updatedAt: ctx.now, version: before.version + 1 }
  await localWriter.commit({ manifests: { update: [{ before, after }] } })
  return ok(after)
}

/** Admin data correction on an item's descriptive fields. */
export async function correctItem(
  internalItemId: string,
  patch: Partial<Pick<Item, "itemId" | "carrierCode" | "shipper" | "consignee" | "weight" | "description" | "locationId" | "dateOfReceival" | "dateOfRelease" | "quantityMismatch">>,
  actorId: string
): Promise<Result<Item>> {
  const before = await itemRepository.get(internalItemId)
  if (!before) return err("PIECE_NOT_ELIGIBLE", "Piece not found on this device.")
  const after = touch(before, patch, mutationContext(actorId))
  await localWriter.commit({ items: { update: [{ before, after }] } })
  return ok(after)
}

/** Admin: delete pieces that were never received (e.g. a mistyped line). */
export async function deleteExpectedPieces(internalItemIds: string[]): Promise<Result<number>> {
  const pieces = await itemRepository.getMany(internalItemIds)
  const received = pieces.filter((p) => p.receivingState !== "expected")
  if (received.length) {
    return err(
      "PIECE_NOT_ELIGIBLE",
      "Only pieces that were never received can be deleted.",
      received.map((p) => p.internalItemId)
    )
  }
  await localWriter.commit({ items: { delete: pieces } })
  return ok(pieces.length)
}
