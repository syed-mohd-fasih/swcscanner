import type { ParserId } from "@/domain/carriers/types"
import type { LabelData } from "@/domain/items/types"

/** Barcode symbology as reported by the decoder. */
export type ScanFormat = "pdf417" | "linear" | "manual"

export type RawScan = {
  raw: string
  format: ScanFormat
}

/** Normalized output every carrier parser produces for the receiving flow. */
export type ParsedScan = {
  itemId: string
  /** other spellings of the same ID to try when `itemId` has no match */
  alternateIds?: string[]
  pieceNumber: number | null
  pieceTotal: number | null
  /** label data extracted from the barcode, if any */
  fields: Partial<Omit<LabelData, "itemId" | "carrierCode">>
  raw: string
  format: ScanFormat
}

export type ParseOutcome =
  | { kind: "parsed"; scan: ParsedScan }
  /** the barcode is valid but not the one this carrier's workflow needs */
  | { kind: "wrong_barcode"; hint: "scan_pdf417" }
  | { kind: "unreadable"; reason: string }

export interface CarrierParser {
  id: ParserId
  parse(scan: RawScan): ParseOutcome
}
