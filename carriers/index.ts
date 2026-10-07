import { fedexPdf417Parser } from "@/carriers/fedex/fedexPdf417"
import { generic1dParser } from "@/carriers/generic/generic1d"
import type { CarrierParser, ParsedScan, ParseOutcome, RawScan } from "@/carriers/types"
import type { Carrier, ParserId } from "@/domain/carriers/types"

const PARSERS: Record<ParserId, CarrierParser> = {
  generic1d: generic1dParser,
  fedexPdf417: fedexPdf417Parser,
}

/** The session's carrier decides which parser handles a scan. */
export function getParser(id: ParserId): CarrierParser {
  return PARSERS[id]
}

/** Compile an admin-entered item-ID pattern; invalid patterns are ignored. */
export function compileIdPattern(pattern: string | null | undefined): RegExp | null {
  if (!pattern?.trim()) return null
  try {
    return new RegExp(pattern.trim())
  } catch {
    return null
  }
}

export type ResolvedScans =
  | { kind: "candidates"; candidates: ParsedScan[] }
  | Exclude<ParseOutcome, { kind: "parsed" }>

/**
 * A label can carry several barcodes (DHL: waybill, routing code, piece ID).
 * Parse everything the camera saw and return the usable item-ID candidates,
 * best first: PDF417 before 1D, then in decoder order. When the carrier has
 * an item-ID pattern, camera reads that don't fit it are dropped; typed
 * (manual) input is trusted as entered.
 */
export function resolveScans(carrier: Carrier, scans: RawScan[]): ResolvedScans {
  const parser = getParser(carrier.parser)
  const pattern = compileIdPattern(carrier.idPattern)
  const outcomes = scans.map((s) => parser.parse(s))
  const parsed = outcomes.flatMap((o) => (o.kind === "parsed" ? [o.scan] : []))

  if (parsed.length === 0) {
    return (
      outcomes.find((o): o is Extract<ParseOutcome, { kind: "wrong_barcode" }> => o.kind === "wrong_barcode") ??
      outcomes.find((o): o is Extract<ParseOutcome, { kind: "unreadable" }> => o.kind === "unreadable") ?? {
        kind: "unreadable",
        reason: "No barcode.",
      }
    )
  }

  const fits = (s: ParsedScan) =>
    !pattern || s.format === "manual" || [s.itemId, ...(s.alternateIds ?? [])].some((id) => pattern.test(id))
  const candidates = parsed
    .filter(fits)
    .sort((a, b) => Number(b.format === "pdf417") - Number(a.format === "pdf417"))
  return candidates.length ? { kind: "candidates", candidates } : { kind: "ignored" }
}

export type { CarrierParser, ParsedScan, ParseOutcome, RawScan, ScanFormat } from "@/carriers/types"
