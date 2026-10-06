import type { BusinessDate } from "@/domain/shared/dates"

/**
 * A manifest groups expected pieces. It is a reference entity only —
 * items carry their own lifecycle and reference the manifest by ID.
 */
export type Manifest = {
  manifestId: string
  manifestName: string
  truckId: string
  /** default carrier for the manifest's items (editable per item) */
  carrierCode: string
  /** expected arrival date */
  date: BusinessDate
  notes: string | null
  createdAt: string
  updatedAt: string
  version: number
}

/** One line as typed by the admin; expands into `quantity` expected pieces. */
export type ManifestLine = {
  itemId: string
  carrierCode: string
  shipper: string | null
  consignee: string | null
  quantity: number
  weight: number | null
  description: string | null
}

/** Derived, informational aggregate — never a lifecycle gate. */
export type ManifestSummary = {
  expected: number
  received: number
  notReceived: number
  awaitingStorage: number
  stored: number
  directRelease: number
  releaseScanned: number
  released: number
  repossessed: number
  seized: number
  flagged: number
}
