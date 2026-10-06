import type { ManifestLine } from "@/domain/manifests/types"
import type { ManifestHeader } from "@/services/manifests"

/**
 * Manifest import. An importer turns a file into the same header + lines
 * that the manual form produces; the admin reviews them before creating.
 * Add client-specific importers to MANIFEST_IMPORTERS when formats are known.
 */
export type ImportedManifest = {
  header: Partial<ManifestHeader>
  lines: ManifestLine[]
  /** row-level problems to show the admin before anything is created */
  warnings: string[]
}

export interface ManifestImporter {
  id: string
  label: string
  /** <input accept> value, e.g. ".csv,text/csv" */
  accept: string
  parse(text: string, defaults: { carrierCode: string }): ImportedManifest
}

/** RFC-4180-ish CSV: quoted fields, escaped quotes, comma or semicolon. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "")
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ""
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++
      row.push(field)
      if (row.some((f) => f.trim())) rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim())) rows.push(row)
  return rows
}

const COLUMNS: Record<keyof Omit<ManifestLine, "carrierCode"> | "carrierCode", string[]> = {
  itemId: ["itemid", "item id", "item_id", "id", "awb", "tracking", "tracking number", "master id", "masterid"],
  carrierCode: ["carrier", "carriercode", "carrier code", "shipper code"],
  shipper: ["shipper", "sender", "from"],
  consignee: ["consignee", "receiver", "to", "customer"],
  quantity: ["quantity", "qty", "pieces", "pcs"],
  weight: ["weight", "kg", "weight (kg)"],
  description: ["description", "desc", "contents", "goods"],
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ")

/**
 * Generic CSV: first row is a header; columns are matched by common names
 * (Item ID, Shipper, Consignee, Quantity, Weight, Description, Carrier).
 * Only Item ID is required; quantity defaults to 1.
 */
export const genericCsvImporter: ManifestImporter = {
  id: "generic-csv",
  label: "CSV",
  accept: ".csv,text/csv",
  parse(text, defaults) {
    const rows = parseCsv(text)
    const warnings: string[] = []
    if (rows.length < 2) return { header: {}, lines: [], warnings: ["The file has no data rows."] }

    const headers = rows[0].map(norm)
    const col = (key: keyof typeof COLUMNS) => headers.findIndex((h) => COLUMNS[key].includes(h))
    const idx = Object.fromEntries((Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).map((k) => [k, col(k)])) as Record<
      keyof typeof COLUMNS,
      number
    >
    if (idx.itemId < 0) {
      return { header: {}, lines: [], warnings: [`No "Item ID" column. Found: ${rows[0].join(", ")}`] }
    }

    const lines: ManifestLine[] = []
    rows.slice(1).forEach((r, n) => {
      const cell = (k: keyof typeof COLUMNS) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "")
      const rowNo = n + 2
      const itemId = cell("itemId")
      if (!itemId) return void warnings.push(`Row ${rowNo}: empty Item ID — skipped.`)
      const qtyText = cell("quantity")
      const quantity = qtyText ? Number(qtyText) : 1
      if (!Number.isInteger(quantity) || quantity < 1) {
        return void warnings.push(`Row ${rowNo}: quantity "${qtyText}" is not a whole number — skipped.`)
      }
      const weightText = cell("weight").replace(/kg$/i, "").trim()
      const weight = weightText ? Number(weightText) : null
      if (weightText && Number.isNaN(weight)) warnings.push(`Row ${rowNo}: weight "${weightText}" ignored.`)
      lines.push({
        itemId,
        carrierCode: cell("carrierCode").toUpperCase() || defaults.carrierCode,
        shipper: cell("shipper") || null,
        consignee: cell("consignee") || null,
        quantity,
        weight: weight !== null && !Number.isNaN(weight) ? weight : null,
        description: cell("description") || null,
      })
    })
    return { header: {}, lines, warnings }
  },
}

export const MANIFEST_IMPORTERS: ManifestImporter[] = [genericCsvImporter]
