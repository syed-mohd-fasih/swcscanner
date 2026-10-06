import { generic1dParser, normalizeItemId } from "@/carriers/generic/generic1d"
import type { CarrierParser, ParseOutcome, RawScan } from "@/carriers/types"

/**
 * FedEx PDF417 parser — direct barcode-data parsing, no OCR.
 *
 * Payload (ANSI MH10.8.3), verified against real FedEx Express labels:
 *   [)> RS 01 GS <f1> GS … RS 06 GS <DI elements> RS 09 GS FDX … RS EOT
 *
 * Record "01" (positional, after the "01" header):
 *   1 postal code · 2 country (ISO numeric, 414 = KW) · 3 service type
 *   4 tracking (16 digits = 12-digit tracking + 4-digit form code)
 *   5 SCAC "FDE" · 6 shipper account · 7 julian pickup day · 8 shipment id (empty)
 *   9 piece "n/total" · 10 weight "8.00KG" · 11 address validated
 *   12 address · 13 city · 14 state · 15 consignee name
 *
 * Record "06" (data-identifier elements, "<DI><value>"):
 *   11Z consignee company · 12Z phone · 14Z address line
 *   28Z master tracking (only on multi-piece labels — INFERRED, confirm)
 *   31Z 1D-barcode value (ends with the 12-digit piece tracking)
 *   99Z FS-separated: station | origin country | ? | currency | description
 */
const RS = "\x1e"
const GS = "\x1d"
const FS = "\x1c"
const EOT = "\x04"

const FIELD = {
  tracking: 4,
  piece: 9,
  weight: 10,
  consignee: 15,
} as const

const DI = {
  consigneeCompany: "11Z",
  masterTracking: "28Z",
  commodity: "99Z",
} as const

/** 99Z sub-field holding the goods description */
const COMMODITY_DESCRIPTION = 4

export type FedExPdf417Data = {
  /** 12-digit customer-facing tracking number of this piece */
  trackingNumber: string
  /** as encoded on the label (12 + 4-digit form code) */
  trackingNumberFull: string
  /** 12-digit master tracking (multi-piece shipments) */
  masterId: string | null
  masterIdFull: string | null
  pieceNumber: number | null
  pieceTotal: number | null
  /** kilograms */
  weight: number | null
  consignee: string | null
  description: string | null
}

/** 16-digit FedEx Express numbers carry a 4-digit form code after the 12-digit tracking. */
export function shortTracking(value: string): string {
  return /^\d{16}$/.test(value) ? value.slice(0, 12) : value
}

/**
 * Some decoders/scanner apps print control characters as Unicode "control
 * pictures" (␞ ␝ ␜ ␄ ␠). Map them back to the real bytes.
 */
export function fromControlPictures(raw: string): string {
  return raw
    .replace(/[␀-␟]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x2400))
    .replace(/␠/g, " ")
}

function records(raw: string): Map<string, string[]> {
  const body = fromControlPictures(raw).replace(EOT, "")
  const map = new Map<string, string[]>()
  if (!body.startsWith("[)>")) return map
  for (const record of body.slice(3).split(RS)) {
    const fields = record.split(GS)
    if (fields[0]) map.set(fields[0], fields)
  }
  return map
}

function dataIdentifiers(fields: string[] | undefined): Map<string, string> {
  const map = new Map<string, string>()
  for (const element of fields?.slice(1) ?? []) {
    const match = element.match(/^(\d{1,3}[A-Z])([\s\S]*)$/)
    if (match) map.set(match[1], match[2])
  }
  return map
}

const clean = (v: string | undefined) => (v ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim() || null

export function parseFedExPdf417(raw: string): FedExPdf417Data | null {
  const recs = records(raw)
  const main = recs.get("01")
  if (!main) return null

  const trackingNumberFull = normalizeItemId(main[FIELD.tracking] ?? "")
  if (!trackingNumberFull) return null

  const dis = dataIdentifiers(recs.get("06"))
  const masterFull = normalizeItemId(dis.get(DI.masterTracking) ?? "") || null
  const pieceMatch = (main[FIELD.piece] ?? "").trim().match(/^(\d+)\s*\/\s*(\d+)$/)
  const weightMatch = (main[FIELD.weight] ?? "").trim().match(/^(\d+(?:\.\d+)?)\s*(KG|LB)?/i)
  const weight = weightMatch
    ? weightMatch[2]?.toUpperCase() === "LB"
      ? Math.round(Number(weightMatch[1]) * 0.45359237 * 100) / 100
      : Number(weightMatch[1])
    : null

  const name = clean(main[FIELD.consignee])
  const company = clean(dis.get(DI.consigneeCompany))
  const commodity = (dis.get(DI.commodity) ?? "").split(FS)

  return {
    trackingNumber: shortTracking(trackingNumberFull),
    trackingNumberFull,
    masterId: masterFull ? shortTracking(masterFull) : null,
    masterIdFull: masterFull,
    pieceNumber: pieceMatch ? Number(pieceMatch[1]) : null,
    pieceTotal: pieceMatch ? Number(pieceMatch[2]) : null,
    weight,
    consignee: [name, company].filter(Boolean).join(" — ") || null,
    description: clean(commodity[COMMODITY_DESCRIPTION]),
  }
}

export const fedexPdf417Parser: CarrierParser = {
  id: "fedexPdf417",
  parse(scan: RawScan): ParseOutcome {
    if (scan.format === "linear") {
      // FedEx's 1D barcode carries the sub-piece ID, not the shared itemId
      return { kind: "wrong_barcode", hint: "scan_pdf417" }
    }
    const data = parseFedExPdf417(scan.raw)
    if (!data && scan.format === "manual") {
      // typed fallback: accept the long form too, look up by the short one
      const typed = generic1dParser.parse(scan)
      if (typed.kind !== "parsed") return typed
      const short = shortTracking(typed.scan.itemId)
      return {
        kind: "parsed",
        scan: { ...typed.scan, itemId: short, alternateIds: short !== typed.scan.itemId ? [typed.scan.itemId] : [] },
      }
    }
    if (!data) {
      return { kind: "unreadable", reason: "Not a recognised FedEx PDF417 payload." }
    }
    const multiPiece = (data.pieceTotal ?? 1) > 1
    // normalize to the shared-itemId model: multi-piece → master tracking
    const useMaster = multiPiece && data.masterId
    return {
      kind: "parsed",
      scan: {
        itemId: useMaster ? data.masterId! : data.trackingNumber,
        // manifests may list the 16-digit form; lookups fall back to it
        alternateIds: [useMaster ? data.masterIdFull! : data.trackingNumberFull].filter(
          (id) => id !== (useMaster ? data.masterId : data.trackingNumber)
        ),
        pieceNumber: data.pieceNumber,
        pieceTotal: data.pieceTotal,
        fields: { weight: data.weight, consignee: data.consignee, description: data.description },
        raw: scan.raw,
        format: scan.format,
      },
    }
  },
}
