import type { BusinessDate } from "@/domain/shared/dates"

/**
 * An item is one physical piece. Lifecycle is tracked as independent
 * dimensions — never collapse these into a single status field.
 */
export const RECEIVING_STATES = ["expected", "received", "unidentified"] as const
export type ReceivingState = (typeof RECEIVING_STATES)[number]

/**
 * null = not yet decided: expected pieces, and received pieces awaiting the
 * separate store step. Direct release is chosen at receiving.
 */
export const STORAGE_STATES = ["stored", "direct_release"] as const
export type StorageState = (typeof STORAGE_STATES)[number]

export const RELEASE_STATES = [
  "not_released",
  "release_scanned",
  "released",
  "repossessed",
  "seized",
] as const
export type ReleaseState = (typeof RELEASE_STATES)[number]

/** Final outcomes an admin assigns after the physical release scan. */
export const RELEASE_OUTCOMES = ["released", "repossessed", "seized"] as const
export type ReleaseOutcome = (typeof RELEASE_OUTCOMES)[number]

export const INVESTIGATION_STATUSES = ["open", "investigating"] as const
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number]

export type QuantityMismatch = {
  /** total printed on the physical label, when it differs from pieceTotal */
  labelTotal: number | null
  note: string | null
}

export type Investigation = {
  status: InvestigationStatus
  note: string | null
}

export type Item = {
  /** system-generated, always unique */
  internalItemId: string
  /** carrier identifier; repeats across pieces of one shipment (FedEx: Master ID) */
  itemId: string
  pieceNumber: number
  pieceTotal: number

  manifestId: string | null
  carrierCode: string

  shipper: string | null
  consignee: string | null
  weight: number | null
  description: string | null

  receivingState: ReceivingState
  storageState: StorageState | null
  releaseState: ReleaseState

  locationId: string | null

  dateOfReceival: BusinessDate | null
  dateOfRelease: BusinessDate | null

  quantityMismatch: QuantityMismatch | null
  investigation: Investigation | null
  identifiedByOverride: boolean
  mergedFromInternalItemId: string | null

  receivedBy: string | null
  storedBy: string | null
  releaseScannedBy: string | null
  outcomeBy: string | null

  receivedAt: string | null
  storedAt: string | null
  releaseScannedAt: string | null
  outcomeAt: string | null
  createdAt: string
  updatedAt: string

  /** incremented on every write; used for conflict detection on sync */
  version: number
}

/** Fields captured from a physical label (manual entry or barcode). */
export type LabelData = {
  itemId: string
  carrierCode: string
  shipper: string | null
  consignee: string | null
  weight: number | null
  description: string | null
}
