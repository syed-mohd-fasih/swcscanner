import { createItem, type MutationContext } from "@/domain/items/factory"
import type { Item } from "@/domain/items/types"
import type { ManifestLine, ManifestSummary } from "@/domain/manifests/types"
import { isAwaitingStorage } from "@/domain/receiving/rules"
import type { BusinessDate } from "@/domain/shared/dates"
import { err, ok, type Result } from "@/domain/shared/result"

/** `<CODE>-<M-D-Y>-<TruckId>`, e.g. `FDX-10-5-2026-KWT1234` */
export function generateManifestName(
  carrierCode: string,
  date: BusinessDate,
  truckId: string
): string {
  const [y, m, d] = date.split("-").map(Number)
  const parts = [carrierCode.trim().toUpperCase(), `${m}-${d}-${y}`]
  if (truckId.trim()) parts.push(truckId.trim())
  return parts.join("-")
}

/** One manifest line with quantity N becomes N expected pieces, 1/N … N/N. */
export function expandManifestLine(
  line: ManifestLine,
  manifestId: string,
  ctx: MutationContext
): Result<Item[]> {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    return err("INVALID_QUANTITY", `Quantity must be a whole number ≥ 1 (got ${line.quantity}).`)
  }
  const itemId = line.itemId.trim()
  const pieces = Array.from({ length: line.quantity }, (_, i) =>
    createItem(
      {
        itemId,
        pieceNumber: i + 1,
        pieceTotal: line.quantity,
        carrierCode: line.carrierCode,
        manifestId,
        shipper: line.shipper,
        consignee: line.consignee,
        weight: line.weight,
        description: line.description,
      },
      ctx
    )
  )
  return ok(pieces)
}

export function summarizeManifest(items: Item[]): ManifestSummary {
  const s: ManifestSummary = {
    expected: items.length,
    received: 0,
    notReceived: 0,
    awaitingStorage: 0,
    stored: 0,
    directRelease: 0,
    releaseScanned: 0,
    released: 0,
    repossessed: 0,
    seized: 0,
    flagged: 0,
  }
  for (const item of items) {
    if (item.receivingState === "expected") s.notReceived++
    else s.received++
    if (isAwaitingStorage(item)) s.awaitingStorage++
    if (item.storageState === "stored") s.stored++
    if (item.storageState === "direct_release") s.directRelease++
    if (item.releaseState === "release_scanned") s.releaseScanned++
    if (item.releaseState === "released") s.released++
    if (item.releaseState === "repossessed") s.repossessed++
    if (item.releaseState === "seized") s.seized++
    if (item.quantityMismatch) s.flagged++
  }
  return s
}
