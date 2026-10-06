import { fedexPdf417Parser } from "@/carriers/fedex/fedexPdf417"
import { generic1dParser } from "@/carriers/generic/generic1d"
import type { CarrierParser } from "@/carriers/types"
import type { ParserId } from "@/domain/carriers/types"

const PARSERS: Record<ParserId, CarrierParser> = {
  generic1d: generic1dParser,
  fedexPdf417: fedexPdf417Parser,
}

/** The session's carrier decides which parser handles a scan. */
export function getParser(id: ParserId): CarrierParser {
  return PARSERS[id]
}

export type { CarrierParser, ParsedScan, ParseOutcome, RawScan, ScanFormat } from "@/carriers/types"
