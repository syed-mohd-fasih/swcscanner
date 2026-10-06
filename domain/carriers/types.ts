export const PARSER_IDS = ["generic1d", "fedexPdf417"] as const
export type ParserId = (typeof PARSER_IDS)[number]

export type Carrier = {
  /** short code used in manifest names, e.g. "FDX" */
  carrierCode: string
  name: string
  parser: ParserId
  active: boolean
  createdAt: string
  updatedAt: string
}
