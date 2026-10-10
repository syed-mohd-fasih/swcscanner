import ExcelJS from "exceljs"
import JSZip from "jszip"
import { beforeEach, describe, expect, it } from "vitest"

import { createItem } from "@/domain/items/factory"
import type { Item } from "@/domain/items/types"
import { adminDb } from "@/lib/firebase/admin"
import { col } from "@/server/db"
import { deleteExported, deleteManifest, exportWorkbook } from "@/server/services/export"
import { updateManifest } from "@/server/services/manifests"

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!
const HOST = process.env.FIRESTORE_EMULATOR_HOST!
const ctx = { actorId: "admin", now: "2026-10-09T08:00:00.000Z" }
const by = { exportedBy: "Admin", appVersion: "0.0.0-test" }

async function seedManifest(id: string, name: string) {
  await col.manifests().doc(id).set({ manifestId: id, manifestName: name, truckId: "K1", carrierCode: "TNT", date: "2026-10-09", notes: "fragile", pieceCount: 0, createdAt: ctx.now, updatedAt: ctx.now, version: 1 })
}

async function seedPiece(overrides: Partial<Item> = {}): Promise<Item> {
  const item = createItem({ itemId: "T-1", pieceNumber: 1, pieceTotal: 1, carrierCode: "TNT", manifestId: "M1", ...overrides }, ctx)
  const full = { ...item, ...overrides }
  await col.items().doc(full.internalItemId).set(full)
  return full
}

const exists = async (path: "items" | "manifests", id: string) => (await col[path]().doc(id).get()).exists

async function readBook(base64: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(base64, "base64") as unknown as ArrayBuffer)
  return wb
}

beforeEach(async () => {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" })
  await col.locations().doc("WH1-A-1").set({ locationId: "WH1-A-1", warehouse: "WH1", rack: "A", position: "1", active: true, createdAt: ctx.now, updatedAt: ctx.now })
  await seedManifest("M1", "TNT-10-9-2026-K1")
  await seedManifest("M2", "TNT-10-9-2026-K2")
})

describe("export workbook", () => {
  it("has a summary sheet, one sheet per manifest, and an unidentified sheet", async () => {
    await seedPiece({ itemId: "A", pieceTotal: 2 })
    await seedPiece({ itemId: "A", pieceNumber: 2, pieceTotal: 2, receivingState: "received", storageState: "stored", locationId: "WH1-A-1", dateOfReceival: "2026-10-09", receivedAt: ctx.now })
    await seedPiece({ itemId: "B", manifestId: "M2", receivingState: "received", releaseState: "released", storageState: "stored" })
    await seedPiece({ itemId: "U", manifestId: null, receivingState: "unidentified" })

    const r = await exportWorkbook({ manifestIds: ["M1", "M2"], includeUnidentified: true }, by)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toMatchObject({ pieces: 4, sheets: 3, counts: { notReceived: 1, inWarehouse: 2, done: 1 } })
    expect(r.value.snapshot).toHaveLength(4)

    const wb = await readBook(r.value.fileBase64)
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Export", "TNT-10-9-2026-K1", "TNT-10-9-2026-K2", "Unidentified", "Lists"])
    expect(wb.getWorksheet("Lists")!.state).toBe("hidden")

    const summary = wb.getWorksheet("Export")!
    expect(String(summary.getCell("A1").value)).toContain("تصدير")
    const link = summary.getCell("A13").value as ExcelJS.CellHyperlinkValue
    expect(link).toMatchObject({ text: "TNT-10-9-2026-K1", hyperlink: "#'TNT-10-9-2026-K1'!A1" })
    const pieces = summary.getCell("E13").value as ExcelJS.CellFormulaValue
    expect(pieces.formula).toBe("COUNTA('TNT-10-9-2026-K1'!$A$11:$A$20000)")

    const m1 = wb.getWorksheet("TNT-10-9-2026-K1")!
    expect(m1.getCell("A10").value).toBe("Item ID") // table header
    const rows = [m1.getRow(11), m1.getRow(12)]
    expect(rows.map((row) => row.getCell(9).value)).toEqual(["Not received", "Received"])
    expect(rows[1].getCell(10).value).toBe("Stored")
    expect(rows[1].getCell(12).value).toBe("WH1 / A-1")
    expect(rows[1].getCell(13).value).toBeInstanceOf(Date)
    // dropdowns and colours reach below the data, for rows added by hand
    const xml = await (await JSZip.loadAsync(Buffer.from(r.value.fileBase64, "base64"))).file("xl/worksheets/sheet2.xml")!.async("string")
    expect(xml).toContain('sqref="I11:I20000"><formula1>Lists!$A$2:$A$4</formula1>')
    expect(xml).toContain('<conditionalFormatting sqref="K11:K20000">')
    expect(xml).toContain("<tableParts")
  })

  it("single-manifest export is one sheet (plus the hidden lists)", async () => {
    await seedPiece()
    const r = await exportWorkbook({ manifestIds: ["M1"], includeUnidentified: false }, { ...by, single: true })
    expect(r.ok && r.value.fileName).toMatch(/^TNT-10-9-2026-K1_.*\.xlsx$/)
    if (!r.ok) return
    const wb = await readBook(r.value.fileBase64)
    expect(wb.worksheets.map((w) => w.name)).toEqual(["TNT-10-9-2026-K1", "Lists"])
  })

  it("refuses an unknown manifest", async () => {
    expect(await exportWorkbook({ manifestIds: ["nope"], includeUnidentified: false }, by)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } })
  })
})

describe("delete after export", () => {
  it("deletes exported pieces and the empty manifest; replay is safe", async () => {
    const a = await seedPiece()
    const b = await seedPiece({ itemId: "B", receivingState: "received", storageState: "stored" })
    const r = await exportWorkbook({ manifestIds: ["M1"], includeUnidentified: false }, by)
    if (!r.ok) throw new Error("export failed")
    const selection = { manifestIds: ["M1"], includeUnidentified: false }
    expect(await deleteExported(selection, r.value.snapshot)).toMatchObject({
      ok: true,
      value: { deletedPieces: 2, deletedManifests: 1, changedPieces: 0, keptManifests: [] },
    })
    expect(await exists("items", a.internalItemId)).toBe(false)
    expect(await exists("items", b.internalItemId)).toBe(false)
    expect(await exists("manifests", "M1")).toBe(false)
    expect(await deleteExported(selection, r.value.snapshot)).toMatchObject({ ok: true, value: { deletedPieces: 0 } })
  })

  it("keeps pieces changed after the export, and their manifest", async () => {
    const a = await seedPiece()
    const b = await seedPiece({ itemId: "B" })
    const r = await exportWorkbook({ manifestIds: ["M1"], includeUnidentified: false }, by)
    if (!r.ok) throw new Error("export failed")
    await col.items().doc(b.internalItemId).update({ receivingState: "received", version: b.version + 1 })
    const report = await deleteExported({ manifestIds: ["M1"], includeUnidentified: false }, r.value.snapshot)
    expect(report).toMatchObject({ ok: true, value: { deletedPieces: 1, changedPieces: 1, deletedManifests: 0, keptManifests: ["TNT-10-9-2026-K1"] } })
    expect(await exists("items", a.internalItemId)).toBe(false)
    expect(await exists("items", b.internalItemId)).toBe(true)
    expect(await exists("manifests", "M1")).toBe(true)
  })

  it("never deletes pieces outside the exported selection", async () => {
    const other = await seedPiece({ manifestId: "M2" })
    const report = await deleteExported({ manifestIds: ["M1"], includeUnidentified: false }, [{ id: other.internalItemId, version: other.version }])
    expect(report).toMatchObject({ ok: true, value: { deletedPieces: 0, changedPieces: 1 } })
    expect(await exists("items", other.internalItemId)).toBe(true)
  })

  it("unidentified-only export deletes only pieces without a manifest", async () => {
    const u = await seedPiece({ itemId: "U", manifestId: null, receivingState: "unidentified" })
    const kept = await seedPiece()
    const r = await exportWorkbook({ manifestIds: [], includeUnidentified: true }, by)
    if (!r.ok) throw new Error("export failed")
    expect(r.value.snapshot).toEqual([{ id: u.internalItemId, version: u.version }])
    await deleteExported({ manifestIds: [], includeUnidentified: true }, r.value.snapshot)
    expect(await exists("items", u.internalItemId)).toBe(false)
    expect(await exists("items", kept.internalItemId)).toBe(true)
  })
})

describe("manifest edit and delete", () => {
  it("deletes a manifest with all its pieces, whatever their status", async () => {
    await seedPiece()
    await seedPiece({ itemId: "B", receivingState: "received", storageState: "stored" })
    const other = await seedPiece({ manifestId: "M2" })
    expect(await deleteManifest("M1")).toMatchObject({ ok: true, value: { deletedPieces: 2 } })
    expect(await exists("manifests", "M1")).toBe(false)
    expect(await exists("items", other.internalItemId)).toBe(true)
    expect(await deleteManifest("M1")).toMatchObject({ ok: true, value: { deletedPieces: 0 } })
  })

  it("edits name, truck, date and notes but not the carrier", async () => {
    const r = await updateManifest("M1", { manifestName: " New name ", truckId: "K7", date: "2026-10-10", notes: null })
    expect(r).toMatchObject({ ok: true, value: { manifestName: "New name", truckId: "K7", date: "2026-10-10", notes: null, carrierCode: "TNT", version: 2 } })
  })
})

process.on("exit", () => void adminDb().terminate())
