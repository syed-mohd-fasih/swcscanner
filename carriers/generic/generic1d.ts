import type { CarrierParser, ParseOutcome, RawScan } from "@/carriers/types"

/** Carriers whose 1D barcode is the itemId shared by every piece. */
export function normalizeItemId(raw: string): string {
  // strip control chars (AIM prefixes, stray GS) and whitespace
  return raw.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, "").toUpperCase()
}

export const generic1dParser: CarrierParser = {
  id: "generic1d",
  parse(scan: RawScan): ParseOutcome {
    const itemId = normalizeItemId(scan.raw)
    if (!itemId) return { kind: "unreadable", reason: "Empty barcode." }
    return {
      kind: "parsed",
      scan: {
        itemId,
        pieceNumber: null,
        pieceTotal: null,
        fields: {},
        raw: scan.raw,
        format: scan.format,
      },
    }
  },
}
