import { describe, expect, it } from "vitest"

import { parseFedExPdf417 } from "@/carriers/fedex/fedexPdf417"
import { FEDEX_1D_SUBPIECE, FEDEX_MULTI_PIECE_4_OF_5, FEDEX_SINGLE_PIECE } from "@/carriers/fedex/fixtures"
import { compileIdPattern, getParser, resolveScans } from "@/carriers"
import type { Carrier } from "@/domain/carriers/types"

describe("generic1d", () => {
  it("normalizes the itemId", () => {
    const r = getParser("generic1d").parse({ raw: " gd123 456\n", format: "linear" })
    expect(r).toMatchObject({ kind: "parsed", scan: { itemId: "GD123456" } })
  })

  it("rejects empty input", () => {
    expect(getParser("generic1d").parse({ raw: "  ", format: "linear" }).kind).toBe("unreadable")
  })
})

describe("fedexPdf417", () => {
  const fedex = getParser("fedexPdf417")

  it("asks for the PDF417 when a 1D barcode is scanned", () => {
    expect(fedex.parse({ raw: FEDEX_1D_SUBPIECE, format: "linear" })).toEqual({
      kind: "wrong_barcode",
      hint: "scan_pdf417",
    })
  })

  it("parses a single-piece label to its 12-digit tracking number", () => {
    const r = fedex.parse({ raw: FEDEX_SINGLE_PIECE, format: "pdf417" })
    expect(r).toMatchObject({
      kind: "parsed",
      scan: {
        itemId: "794600001111",
        alternateIds: ["7946000011110430"],
        pieceNumber: 1,
        pieceTotal: 1,
        fields: { weight: 8, consignee: "TEST CONSIGNEE ONE", description: "SOAP DISPENSERS" },
      },
    })
  })

  it("normalizes a multi-piece label to the master (28Z) with piece position", () => {
    const r = fedex.parse({ raw: FEDEX_MULTI_PIECE_4_OF_5, format: "pdf417" })
    expect(r).toMatchObject({
      kind: "parsed",
      scan: {
        itemId: "794600009999",
        alternateIds: ["7946000099990430"],
        pieceNumber: 4,
        pieceTotal: 5,
        fields: {
          weight: 2,
          consignee: "TEST CONSIGNEE TWO — Test Automotive Trading C",
          description: "Bolt for bus",
        },
      },
    })
  })

  it("accepts payloads printed with control pictures (␞ ␝ ␜)", () => {
    const pictured = FEDEX_MULTI_PIECE_4_OF_5.replace(/[\x00-\x1f]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x2400))
    expect(fedex.parse({ raw: pictured, format: "pdf417" })).toMatchObject({
      kind: "parsed",
      scan: { itemId: "794600009999", pieceNumber: 4, pieceTotal: 5 },
    })
  })

  it("exposes the raw fields", () => {
    expect(parseFedExPdf417(FEDEX_MULTI_PIECE_4_OF_5)).toMatchObject({
      trackingNumber: "794600002222",
      trackingNumberFull: "7946000022220441",
      masterId: "794600009999",
    })
  })

  it("accepts a typed ID (short or 16-digit) as a manual fallback", () => {
    expect(fedex.parse({ raw: "794600009999", format: "manual" })).toMatchObject({
      kind: "parsed",
      scan: { itemId: "794600009999" },
    })
    expect(fedex.parse({ raw: "7946000099990430", format: "manual" })).toMatchObject({
      kind: "parsed",
      scan: { itemId: "794600009999", alternateIds: ["7946000099990430"] },
    })
  })

  it("rejects payloads that are not MH10.8.3", () => {
    expect(fedex.parse({ raw: "hello", format: "pdf417" }).kind).toBe("unreadable")
  })
})

describe("resolveScans (labels with several barcodes)", () => {
  const carrier = (parser: Carrier["parser"], idPattern: string | null = null): Carrier => ({
    carrierCode: "X",
    name: "X",
    parser,
    idPattern,
    active: true,
    createdAt: "",
    updatedAt: "",
  })
  const dhl = carrier("generic1d", String.raw`^\d{10}$`)
  const linear = (raw: string) => ({ raw, format: "linear" as const })
  // the three barcodes on a real DHL label
  const DHL_LABEL = [linear("2LKW:KWIKCO+57000001"), linear("JJD014600012794402457"), linear("5111661225")]

  it("picks the DHL waybill out of the three barcodes", () => {
    const r = resolveScans(dhl, DHL_LABEL)
    expect(r.kind === "candidates" && r.candidates.map((c) => c.itemId)).toEqual(["5111661225"])
  })

  it("ignores camera reads that only show non-item barcodes", () => {
    expect(resolveScans(dhl, [linear("JJD014600012794402457")])).toEqual({ kind: "ignored" })
  })

  it("trusts typed input even if it does not fit the pattern", () => {
    const r = resolveScans(dhl, [{ raw: "ABC-1", format: "manual" }])
    expect(r.kind === "candidates" && r.candidates[0].itemId).toBe("ABC-1")
  })

  it("without a pattern, keeps every barcode as a candidate", () => {
    const r = resolveScans(carrier("generic1d"), DHL_LABEL)
    expect(r.kind === "candidates" && r.candidates).toHaveLength(3)
  })

  it("FedEx: prefers the PDF417 when both codes are in view", () => {
    const r = resolveScans(carrier("fedexPdf417"), [linear(FEDEX_1D_SUBPIECE), { raw: FEDEX_SINGLE_PIECE, format: "pdf417" }])
    expect(r.kind === "candidates" && r.candidates[0].itemId).toBe("794600001111")
  })

  it("FedEx: only the 1D in view asks for the PDF417", () => {
    expect(resolveScans(carrier("fedexPdf417"), [linear(FEDEX_1D_SUBPIECE)])).toMatchObject({ kind: "wrong_barcode" })
  })

  it("an invalid admin pattern is ignored rather than blocking scans", () => {
    expect(compileIdPattern("([")).toBeNull()
    const r = resolveScans(carrier("generic1d", "(["), [linear("A-1")])
    expect(r.kind).toBe("candidates")
  })
})
