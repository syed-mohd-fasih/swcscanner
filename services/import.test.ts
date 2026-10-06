import { describe, expect, it } from "vitest"

import { genericCsvImporter, parseCsv } from "@/services/import"

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and semicolons", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ])
    expect(parseCsv("x;y\n1;2")).toEqual([
      ["x", "y"],
      ["1", "2"],
    ])
  })
})

describe("genericCsvImporter", () => {
  it("maps common column names and defaults the carrier", () => {
    const csv = "﻿AWB,Sender,Receiver,Qty,Weight,Contents\n877822502933,ACME,Gulf Co,5,10 kg,Bolts\nA-1,,,,,"
    const { lines, warnings } = genericCsvImporter.parse(csv, { carrierCode: "FDX" })
    expect(warnings).toEqual([])
    expect(lines).toEqual([
      { itemId: "877822502933", carrierCode: "FDX", shipper: "ACME", consignee: "Gulf Co", quantity: 5, weight: 10, description: "Bolts" },
      { itemId: "A-1", carrierCode: "FDX", shipper: null, consignee: null, quantity: 1, weight: null, description: null },
    ])
  })

  it("reports bad rows instead of guessing", () => {
    const { lines, warnings } = genericCsvImporter.parse("Item ID,Quantity\n,2\nX,two\nY,3", { carrierCode: "TNT" })
    expect(lines.map((l) => l.itemId)).toEqual(["Y"])
    expect(warnings).toHaveLength(2)
  })

  it("requires an item id column", () => {
    expect(genericCsvImporter.parse("Foo,Bar\n1,2", { carrierCode: "TNT" }).warnings[0]).toMatch(/Item ID/)
  })
})
