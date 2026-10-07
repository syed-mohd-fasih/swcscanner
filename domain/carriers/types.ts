export const PARSER_IDS = ["generic1d", "fedexPdf417"] as const
export type ParserId = (typeof PARSER_IDS)[number]

export type Carrier = {
  /** short code used in manifest names, e.g. "FDX" */
  carrierCode: string
  name: string
  parser: ParserId
  /**
   * Optional regular expression the item-ID barcode must match, for labels
   * with several barcodes — e.g. DHL waybill: ^\d{10}$. Admin-editable.
   */
  idPattern?: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}
