import "server-only"

import ExcelJS from "exceljs"

import type { Item } from "@/domain/items/types"
import { formatLocation, type WarehouseLocation } from "@/domain/locations/types"
import type { Manifest } from "@/domain/manifests/types"
import { isAwaitingStorage } from "@/domain/receiving/rules"
import { en } from "@/lib/i18n/dictionaries/en"

/**
 * The export workbook. Built so it keeps working as a small app after export:
 * a bilingual "Export" sheet whose counts are live formulas, one sheet per
 * manifest with a filterable table, dropdowns for statuses and locations,
 * and the app's status colours. Item data and column names are English.
 */

export type ExportSheet = {
  /** null = unidentified pieces that never matched a manifest */
  manifest: Manifest | null
  items: Item[]
}

export type WorkbookInput = {
  sheets: ExportSheet[]
  locations: Map<string, WarehouseLocation>
  exportedAt: Date
  exportedBy: string
  appVersion: string
  /** one manifest, one sheet: no "Export" summary sheet */
  single?: boolean
}

// ── vocabulary (English, as in the app) ───────────────────────────────────

const RECEIVING = en.states.receiving
const STORAGE = en.states.storage
const RELEASE = en.states.release
const INVESTIGATION = en.states.investigation
const YES = "Yes"

const COLUMNS = [
  { key: "itemId", header: "Item ID", width: 22 },
  { key: "piece", header: "Piece", width: 8 },
  { key: "of", header: "Of", width: 7 },
  { key: "carrier", header: "Carrier", width: 10 },
  { key: "shipper", header: "Shipper", width: 22 },
  { key: "consignee", header: "Consignee", width: 22 },
  { key: "weight", header: "Weight", width: 10 },
  { key: "description", header: "Description", width: 28 },
  { key: "receiving", header: "Receiving", width: 15 },
  { key: "storage", header: "Storage", width: 17 },
  { key: "release", header: "Release", width: 20 },
  { key: "location", header: "Location", width: 14 },
  { key: "receivedDate", header: "Received date", width: 14 },
  { key: "releaseDate", header: "Release date", width: 14 },
  { key: "mismatch", header: "Mismatch", width: 11 },
  { key: "labelTotal", header: "Label total", width: 11 },
  { key: "mismatchNote", header: "Mismatch note", width: 24 },
  { key: "investigation", header: "Investigation", width: 15 },
  { key: "receivedAt", header: "Received at", width: 17 },
  { key: "storedAt", header: "Stored at", width: 17 },
  { key: "releaseScannedAt", header: "Release scanned at", width: 19 },
  { key: "outcomeAt", header: "Outcome at", width: 17 },
  { key: "notes", header: "Notes", width: 30 },
  { key: "internalId", header: "Internal ID", width: 30 },
] as const
type ColumnKey = (typeof COLUMNS)[number]["key"]

const col = (key: ColumnKey) => COLUMNS.findIndex((c) => c.key === key) + 1
const letter = (n: number) => {
  let s = ""
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
const L = (key: ColumnKey) => letter(col(key))

/** first table row on a piece sheet; the header block sits above */
const HEADER_ROW = 10
const FIRST_ROW = HEADER_ROW + 1
/** formulas, dropdowns and colours reach this far, so rows added by hand count too */
const LAST_ROW = 20_000

// ── colours (the app's tones, as Excel ARGB) ──────────────────────────────

const TONE = {
  neutral: { fill: "FFF1F3F5", font: "FF4B5563" },
  info: { fill: "FFE0F0FB", font: "FF0B5C8A" },
  success: { fill: "FFDDF4E4", font: "FF17663A" },
  warning: { fill: "FFFDF0D5", font: "FF8A5300" },
  danger: { fill: "FFFBE0DE", font: "FFA4221B" },
  accent: { fill: "FFE3E9FB", font: "FF2541B2" },
} as const
type Tone = keyof typeof TONE

const STATUS_TONES: [string, Tone][] = [
  [RECEIVING.expected, "neutral"],
  [RECEIVING.received, "success"],
  [RECEIVING.unidentified, "warning"],
  [STORAGE.none, "info"],
  [STORAGE.stored, "success"],
  [STORAGE.direct_release, "accent"],
  [RELEASE.not_released, "neutral"],
  [RELEASE.release_scanned, "info"],
  [RELEASE.released, "success"],
  [RELEASE.repossessed, "warning"],
  [RELEASE.seized, "danger"],
  [INVESTIGATION.open, "warning"],
  [INVESTIGATION.investigating, "info"],
  [YES, "warning"],
]

const BRAND = "FF2541B2"
const MUTED = "FF6B7280"
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } })

// ── values ────────────────────────────────────────────────────────────────

/** Kuwait time (UTC+3, no daylight saving) as an Excel date-time */
const KUWAIT_MS = 3 * 60 * 60 * 1000
const dateTime = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + KUWAIT_MS) : null)
const businessDate = (d: string | null) => (d ? new Date(`${d}T00:00:00.000Z`) : null)

function rowFor(i: Item, locations: Map<string, WarehouseLocation>): Record<ColumnKey, ExcelJS.CellValue> {
  const location = i.locationId ? locations.get(i.locationId) : undefined
  return {
    itemId: i.itemId,
    piece: i.pieceNumber,
    of: i.pieceTotal,
    carrier: i.carrierCode,
    shipper: i.shipper,
    consignee: i.consignee,
    weight: i.weight,
    description: i.description,
    receiving: RECEIVING[i.receivingState],
    storage: i.storageState ? STORAGE[i.storageState] : isAwaitingStorage(i) ? STORAGE.none : null,
    release: RELEASE[i.releaseState],
    location: location ? formatLocation(location) : (i.locationId ?? null),
    receivedDate: businessDate(i.dateOfReceival),
    releaseDate: businessDate(i.dateOfRelease),
    mismatch: i.quantityMismatch ? YES : null,
    labelTotal: i.quantityMismatch?.labelTotal ?? null,
    mismatchNote: i.quantityMismatch?.note ?? null,
    investigation: i.investigation ? INVESTIGATION[i.investigation.status] : null,
    receivedAt: dateTime(i.receivedAt),
    storedAt: dateTime(i.storedAt),
    releaseScannedAt: dateTime(i.releaseScannedAt),
    outcomeAt: dateTime(i.outcomeAt),
    notes: null,
    internalId: i.internalItemId,
  }
}

/** live counts shared by the "Export" sheet and each sheet's summary strip */
const COUNTS: { key: string; en: string; ar: string; column: ColumnKey; value: string; tone: Tone }[] = [
  { key: "notReceived", en: RECEIVING.expected, ar: "لم تُستلم", column: "receiving", value: RECEIVING.expected, tone: "neutral" },
  { key: "received", en: RECEIVING.received, ar: "مستلمة", column: "receiving", value: RECEIVING.received, tone: "success" },
  { key: "unidentified", en: RECEIVING.unidentified, ar: "غير معروفة", column: "receiving", value: RECEIVING.unidentified, tone: "warning" },
  { key: "awaitingStorage", en: STORAGE.none, ar: "بانتظار التخزين", column: "storage", value: STORAGE.none, tone: "info" },
  { key: "stored", en: STORAGE.stored, ar: "مخزنة", column: "storage", value: STORAGE.stored, tone: "success" },
  { key: "directRelease", en: STORAGE.direct_release, ar: "تسليم مباشر", column: "storage", value: STORAGE.direct_release, tone: "accent" },
  { key: "releaseScanned", en: RELEASE.release_scanned, ar: "مُسحت للتسليم", column: "release", value: RELEASE.release_scanned, tone: "info" },
  { key: "released", en: RELEASE.released, ar: "سُلّمت", column: "release", value: RELEASE.released, tone: "success" },
  { key: "repossessed", en: RELEASE.repossessed, ar: "مُستردة", column: "release", value: RELEASE.repossessed, tone: "warning" },
  { key: "seized", en: RELEASE.seized, ar: "محجوزة", column: "release", value: RELEASE.seized, tone: "danger" },
  { key: "mismatch", en: "Mismatch", ar: "اختلاف الكمية", column: "mismatch", value: YES, tone: "warning" },
]

const quote = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`
const range = (sheet: string, key: ColumnKey) => `${quote(sheet)}!$${L(key)}$${FIRST_ROW}:$${L(key)}$${LAST_ROW}`
const piecesFormula = (sheet: string) => `COUNTA(${range(sheet, "itemId")})`
const countFormula = (sheet: string, key: ColumnKey, value: string) => `COUNTIF(${range(sheet, key)},"${value}")`

/** what the formulas evaluate to right now (shown before Excel recalculates) */
function countNow(rows: Record<ColumnKey, ExcelJS.CellValue>[], key: ColumnKey, value: string) {
  return rows.filter((r) => r[key] === value).length
}

// ── sheet names ───────────────────────────────────────────────────────────

const RESERVED = new Set(["export", "lists", "history"])

/** Excel: at most 31 characters, none of []:*?/\, unique (case-insensitive) */
function sheetNames(sheets: ExportSheet[]): string[] {
  const used = new Set<string>()
  return sheets.map((s) => {
    const base = (s.manifest ? s.manifest.manifestName : "Unidentified").replace(/[[\]:*?/\\]/g, "-").replace(/^'+|'+$/g, "").trim() || "Manifest"
    for (let n = 1; ; n++) {
      const suffix = n === 1 ? "" : ` (${n})`
      const name = base.slice(0, 31 - suffix.length) + suffix
      if (!used.has(name.toLowerCase()) && !RESERVED.has(name.toLowerCase())) {
        used.add(name.toLowerCase())
        return name
      }
    }
  })
}

// ── workbook ──────────────────────────────────────────────────────────────

export async function buildWorkbook(input: WorkbookInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = `SWC Scanner ${input.appVersion}`
  wb.created = input.exportedAt
  // formulas carry their current result, and Excel recalculates on open
  wb.calcProperties.fullCalcOnLoad = true

  const names = sheetNames(input.sheets)
  const exportedAt = dateTime(input.exportedAt.toISOString())!
  const summary = input.single ? null : wb.addWorksheet("Export", { properties: { tabColor: { argb: BRAND } } })
  const pieceSheets = input.sheets.map((s, i) =>
    pieceSheet(wb, names[i], s, i, input, exportedAt, summary !== null)
  )
  const lists = listsSheet(wb, input.locations)
  for (const ws of pieceSheets) addDropdowns(ws.ws, lists)
  if (summary) summarySheet(summary, input, names, pieceSheets.map((p) => p.rows), exportedAt)

  return Buffer.from(await wb.xlsx.writeBuffer())
}

function pieceSheet(
  wb: ExcelJS.Workbook,
  name: string,
  sheet: ExportSheet,
  index: number,
  input: WorkbookInput,
  exportedAt: Date,
  linkBack: boolean
) {
  const m = sheet.manifest
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: m ? "FF9CA3AF" : "FFF59E0B" } },
    views: [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 1 }],
  })
  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }))

  // header block
  const title = ws.getCell("A1")
  title.value = m ? m.manifestName : "Unidentified pieces (no manifest)"
  title.font = { size: 16, bold: true, color: { argb: BRAND } }
  ws.mergeCells(1, 1, 1, 6)
  if (linkBack) {
    const back = ws.getCell(1, 8)
    back.value = { text: "← Export", hyperlink: "#'Export'!A1" }
    back.font = { color: { argb: BRAND }, underline: true }
  }
  const details: [string, ExcelJS.CellValue][] = m
    ? [
        ["Truck", m.truckId || null],
        ["Carrier", m.carrierCode],
        ["Date", businessDate(m.date)],
        ["Notes", m.notes],
      ]
    : [["About", "Pieces recorded as unidentified that were never matched to a manifest."]]
  details.push(["Exported", exportedAt])
  details.forEach(([label, value], i) => {
    const l = ws.getCell(2 + i, 1)
    l.value = label
    l.font = { color: { argb: MUTED } }
    const v = ws.getCell(2 + i, 2)
    v.value = value
    if (value instanceof Date) v.numFmt = label === "Exported" ? "yyyy-mm-dd hh:mm" : "yyyy-mm-dd"
    ws.mergeCells(2 + i, 2, 2 + i, 6)
  })

  const rows = sheet.items.map((i) => rowFor(i, input.locations))

  // live summary strip (row 7 labels, row 8 counts)
  const strip: { label: string; formula: string; result: number; tone: Tone }[] = [
    { label: "Pieces", formula: piecesFormula(name), result: rows.length, tone: "accent" },
    ...COUNTS.filter((c) => c.key !== "mismatch" || rows.some((r) => r.mismatch)).map((c) => ({
      label: c.en,
      formula: countFormula(name, c.column, c.value),
      result: countNow(rows, c.column, c.value),
      tone: c.tone,
    })),
  ]
  strip.forEach((s, i) => {
    const label = ws.getCell(7, 1 + i)
    label.value = s.label
    label.font = { size: 9, color: { argb: MUTED } }
    label.alignment = { wrapText: true, vertical: "bottom" }
    const value = ws.getCell(8, 1 + i)
    value.value = { formula: s.formula, result: s.result }
    value.font = { size: 14, bold: true, color: { argb: TONE[s.tone].font } }
    value.fill = fill(TONE[s.tone].fill)
    value.alignment = { horizontal: "center" }
  })
  ws.getRow(7).height = 28

  // the pieces, as an Excel table (filter buttons, banded rows)
  ws.addTable({
    name: `Pieces${index + 1}`,
    ref: `A${HEADER_ROW}`,
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: COLUMNS.map((c) => ({ name: c.header, filterButton: true })),
    rows: rows.length ? rows.map((r) => COLUMNS.map((c) => r[c.key])) : [COLUMNS.map(() => null)],
  })

  for (const key of ["receivedDate", "releaseDate"] as const) ws.getColumn(col(key)).numFmt = "yyyy-mm-dd"
  for (const key of ["receivedAt", "storedAt", "releaseScannedAt", "outcomeAt"] as const)
    ws.getColumn(col(key)).numFmt = "yyyy-mm-dd hh:mm"
  ws.getColumn(col("weight")).numFmt = "0.##"
  ws.getColumn(col("internalId")).font = { color: { argb: MUTED }, size: 9 }

  // status colours: exact matches, so "Not released" never looks "Released"
  let priority = 1 // unique across the sheet, as Excel expects
  for (const key of ["receiving", "storage", "release", "mismatch", "investigation"] as const) {
    const ref = `${L(key)}${FIRST_ROW}:${L(key)}${LAST_ROW}`
    ws.addConditionalFormatting({
      ref,
      rules: STATUS_TONES.map(([value, tone]) => ({
        type: "expression",
        priority: priority++,
        formulae: [`$${L(key)}${FIRST_ROW}="${value}"`],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: TONE[tone].fill } }, font: { color: { argb: TONE[tone].font } } },
      })),
    })
  }
  return { ws, rows }
}

type Lists = { [K in "receiving" | "storage" | "release" | "mismatch" | "investigation" | "location"]: string }

/** hidden sheet holding the dropdown choices */
function listsSheet(wb: ExcelJS.Workbook, locations: Map<string, WarehouseLocation>): Lists {
  const ws = wb.addWorksheet("Lists", { state: "hidden" })
  const lists: [keyof Lists, string[]][] = [
    ["receiving", Object.values(RECEIVING)],
    ["storage", Object.values(STORAGE)],
    ["release", Object.values(RELEASE)],
    ["mismatch", [YES]],
    ["investigation", Object.values(INVESTIGATION)],
    [
      "location",
      [...locations.values()]
        .filter((l) => l.active)
        .map((l) => formatLocation(l))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    ],
  ]
  const out = {} as Lists
  lists.forEach(([key, values], i) => {
    const c = letter(i + 1)
    ws.getCell(`${c}1`).value = key
    values.forEach((v, r) => (ws.getCell(`${c}${r + 2}`).value = v))
    out[key] = `Lists!$${c}$2:$${c}$${Math.max(2, values.length + 1)}`
  })
  return out
}

function addDropdowns(ws: ExcelJS.Worksheet, lists: Lists) {
  const validations = (ws as unknown as { dataValidations: { add(ref: string, v: ExcelJS.DataValidation): void } }).dataValidations
  for (const [key, source] of [
    ["receiving", lists.receiving],
    ["storage", lists.storage],
    ["release", lists.release],
    ["mismatch", lists.mismatch],
    ["investigation", lists.investigation],
    ["location", lists.location],
  ] as const) {
    validations.add(`${L(key)}${FIRST_ROW}:${L(key)}${LAST_ROW}`, {
      type: "list",
      allowBlank: true,
      formulae: [source],
      // locations may be typed when a rack is not in the list yet
      showErrorMessage: key !== "location",
      errorStyle: "stop",
      errorTitle: "Choose from the list",
      error: "Pick one of the values in the dropdown.",
    })
  }
}

function summarySheet(
  ws: ExcelJS.Worksheet,
  input: WorkbookInput,
  names: string[],
  rows: Record<ColumnKey, ExcelJS.CellValue>[][],
  exportedAt: Date
) {
  ws.views = [{ state: "frozen", ySplit: 12 }]
  ws.getColumn(1).width = 30
  for (let c = 2; c <= 5; c++) ws.getColumn(c).width = 13
  for (let c = 6; c <= 6 + COUNTS.length; c++) ws.getColumn(c).width = 12

  const title = ws.getCell("A1")
  title.value = "SWC Scanner export · تصدير ماسح SWC"
  title.font = { size: 18, bold: true, color: { argb: BRAND } }
  ws.mergeCells("A1:H1")
  const help = ws.getCell("A2")
  help.value =
    "Counts below update when statuses are changed in the manifest sheets. · الأرقام أدناه تتحدث عند تغيير الحالات في صفحات المنافست."
  help.font = { italic: true, color: { argb: MUTED } }
  ws.mergeCells("A2:Q2")

  const pieces = rows.reduce((n, r) => n + r.length, 0)
  const details: [string, string, ExcelJS.CellValue, string?][] = [
    ["Exported at", "تاريخ التصدير", exportedAt, "yyyy-mm-dd hh:mm"],
    ["Exported by", "بواسطة", input.exportedBy],
    ["App version", "إصدار التطبيق", input.appVersion],
    ["Sheets", "عدد الصفحات", names.length],
    ["Pieces", "عدد القطع", pieces],
  ]
  details.forEach(([enLabel, arLabel, value, numFmt], i) => {
    const r = 4 + i
    ws.getCell(r, 1).value = `${enLabel} · ${arLabel}`
    ws.getCell(r, 1).font = { color: { argb: MUTED } }
    const v = ws.getCell(r, 2)
    v.value = value
    v.font = { bold: true }
    v.alignment = { horizontal: "left" }
    if (numFmt) v.numFmt = numFmt
    ws.mergeCells(r, 2, r, 4)
  })

  // manifests table: header (English over Arabic), one row per sheet, totals
  const headers: { en: string; ar: string; tone?: Tone }[] = [
    { en: "Manifest", ar: "المنافست" },
    { en: "Truck", ar: "الشاحنة" },
    { en: "Carrier", ar: "شركة الشحن" },
    { en: "Date", ar: "التاريخ" },
    { en: "Pieces", ar: "القطع", tone: "accent" },
    ...COUNTS.map((c) => ({ en: c.en, ar: c.ar, tone: c.tone })),
    { en: "% done", ar: "نسبة الإنجاز", tone: "success" },
  ]
  const HEAD = 12
  headers.forEach((h, i) => {
    const cell = ws.getCell(HEAD, 1 + i)
    cell.value = `${h.en}\n${h.ar}`
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: i === 0 ? "left" : "center" }
    cell.font = { bold: true, color: { argb: h.tone ? TONE[h.tone].font : "FF111827" } }
    cell.fill = fill(h.tone ? TONE[h.tone].fill : "FFE5E7EB")
    cell.border = { bottom: { style: "thin", color: { argb: "FF9CA3AF" } } }
  })
  ws.getRow(HEAD).height = 34
  ws.getCell(HEAD - 1, 1).value = "Manifests · المنافست"
  ws.getCell(HEAD - 1, 1).font = { bold: true, size: 13 }

  const piecesCol = 5
  const doneCol = headers.length
  names.forEach((name, i) => {
    const r = HEAD + 1 + i
    const m = input.sheets[i].manifest
    const sheetRows = rows[i]
    const link = ws.getCell(r, 1)
    link.value = { text: m ? m.manifestName : "Unidentified pieces · قطع غير معروفة", hyperlink: `#${quote(name)}!A1` }
    link.font = { color: { argb: BRAND }, underline: true }
    ws.getCell(r, 2).value = m?.truckId || null
    ws.getCell(r, 3).value = m?.carrierCode ?? null
    const date = ws.getCell(r, 4)
    date.value = businessDate(m?.date ?? null)
    date.numFmt = "yyyy-mm-dd"
    ws.getCell(r, piecesCol).value = { formula: piecesFormula(name), result: sheetRows.length }
    COUNTS.forEach((c, k) => {
      ws.getCell(r, piecesCol + 1 + k).value = { formula: countFormula(name, c.column, c.value), result: countNow(sheetRows, c.column, c.value) }
    })
    const final = ["released", "repossessed", "seized"].map((key) => letter(piecesCol + 1 + COUNTS.findIndex((c) => c.key === key)) + r)
    const done = sheetRows.length ? final.reduce((n, a, k) => n + countNow(sheetRows, "release", [RELEASE.released, RELEASE.repossessed, RELEASE.seized][k]), 0) / sheetRows.length : 0
    const pct = ws.getCell(r, doneCol)
    pct.value = { formula: `IF(${letter(piecesCol)}${r}=0,0,(${final.join("+")})/${letter(piecesCol)}${r})`, result: done }
    pct.numFmt = "0%"
    for (let c = 2; c <= doneCol; c++) ws.getCell(r, c).alignment = { horizontal: "center" }
  })

  const firstRow = HEAD + 1
  const lastRow = HEAD + names.length
  const total = lastRow + 1
  ws.getCell(total, 1).value = "Total · المجموع"
  for (let c = 1; c <= doneCol; c++) {
    const cell = ws.getCell(total, c)
    cell.font = { bold: true }
    cell.border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } }
    if (c >= piecesCol && c < doneCol) {
      const l = letter(c)
      const result = rows.reduce((n, sheetRows, i) => {
        const v = ws.getCell(firstRow + i, c).value as { result?: number }
        return n + (v?.result ?? 0)
      }, 0)
      cell.value = { formula: `SUM(${l}${firstRow}:${l}${lastRow})`, result }
      cell.alignment = { horizontal: "center" }
    }
  }
  const final = ["released", "repossessed", "seized"].map((key) => letter(piecesCol + 1 + COUNTS.findIndex((c) => c.key === key)) + total)
  const totalPct = ws.getCell(total, doneCol)
  totalPct.value = { formula: `IF(${letter(piecesCol)}${total}=0,0,(${final.join("+")})/${letter(piecesCol)}${total})` }
  totalPct.numFmt = "0%"
  totalPct.alignment = { horizontal: "center" }

  // zero counts fade; "% done" gets a bar
  const countsRef = `${letter(piecesCol + 1)}${firstRow}:${letter(doneCol - 1)}${total}`
  ws.addConditionalFormatting({
    ref: countsRef,
    rules: [{ type: "cellIs", operator: "equal", priority: 1, formulae: ["0"], style: { font: { color: { argb: "FFC0C4CC" } } } }],
  })
  ws.addConditionalFormatting({
    ref: `${letter(doneCol)}${firstRow}:${letter(doneCol)}${lastRow}`,
    rules: [
      {
        type: "dataBar",
        priority: 2,
        minLength: 0,
        maxLength: 100,
        cfvo: [
          { type: "num", value: 0 },
          { type: "num", value: 1 },
        ],
        color: { argb: "FF4CAF73" },
      } as unknown as ExcelJS.ConditionalFormattingRule,
    ],
  })
}
