import type { Item } from "@/domain/items/types"
import { formatLocation, type WarehouseLocation } from "@/domain/locations/types"
import type { Manifest } from "@/domain/manifests/types"
import { err, ok, type Result } from "@/domain/shared/result"
import { itemRepository, localWriter } from "@/repositories/indexeddb"

/**
 * Export/archive. The final file format is NOT decided yet — formats are
 * pluggable: add an ExportFormat to EXPORT_FORMATS when the client confirms.
 */
export type ExportRow = Record<string, string | number | boolean | null>

export interface ExportFormat {
  id: string
  label: string
  mimeType: string
  extension: string
  serialize(rows: ExportRow[]): string
}

const csvCell = (v: ExportRow[string]) => {
  if (v === null) return ""
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Placeholder: plain CSV with a header row (UTF-8 BOM so Excel reads it). */
export const csvFormat: ExportFormat = {
  id: "csv",
  label: "CSV",
  mimeType: "text/csv;charset=utf-8",
  extension: "csv",
  serialize(rows) {
    if (rows.length === 0) return ""
    const headers = Object.keys(rows[0])
    const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))]
    return "﻿" + lines.join("\r\n")
  },
}

/** Placeholder: lossless JSON. */
export const jsonFormat: ExportFormat = {
  id: "json",
  label: "JSON",
  mimeType: "application/json",
  extension: "json",
  serialize: (rows) => JSON.stringify(rows, null, 2),
}

export const EXPORT_FORMATS: ExportFormat[] = [csvFormat, jsonFormat]

/** One flat row per physical piece, with manifest and location resolved. */
export function toExportRows(
  items: Item[],
  manifests: Map<string, Manifest>,
  locations: Map<string, WarehouseLocation>
): ExportRow[] {
  return items.map((i) => {
    const m = i.manifestId ? manifests.get(i.manifestId) : undefined
    const l = i.locationId ? locations.get(i.locationId) : undefined
    return {
      internalItemId: i.internalItemId,
      itemId: i.itemId,
      piece: `${i.pieceNumber}/${i.pieceTotal}`,
      carrier: i.carrierCode,
      manifestName: m?.manifestName ?? null,
      truckId: m?.truckId ?? null,
      shipper: i.shipper,
      consignee: i.consignee,
      weight: i.weight,
      description: i.description,
      receivingState: i.receivingState,
      storageState: i.storageState,
      releaseState: i.releaseState,
      location: l ? formatLocation(l) : null,
      dateOfReceival: i.dateOfReceival,
      dateOfRelease: i.dateOfRelease,
      quantityMismatch: i.quantityMismatch ? (i.quantityMismatch.labelTotal ?? true) : null,
      identifiedByOverride: i.identifiedByOverride,
      receivedAt: i.receivedAt,
      storedAt: i.storedAt,
      releaseScannedAt: i.releaseScannedAt,
      outcomeAt: i.outcomeAt,
    }
  })
}

export function download(format: ExportFormat, rows: ExportRow[], baseName: string) {
  const blob = new Blob([format.serialize(rows)], { type: format.mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${baseName}.${format.extension}`
  a.click()
  URL.revokeObjectURL(url)
}

const FINAL = new Set(["released", "repossessed", "seized"])

/**
 * Remove exported records from the operational database. Only pieces with a
 * final outcome may be archived — active inventory is never deleted here.
 */
export async function archiveExported(internalItemIds: string[]): Promise<Result<number>> {
  const items = await itemRepository.getMany(internalItemIds)
  const active = items.filter((i) => !FINAL.has(i.releaseState))
  if (active.length) {
    return err("PIECE_NOT_ELIGIBLE", "Only released, repossessed or seized pieces can be archived.", active.map((i) => i.internalItemId))
  }
  await localWriter.commit({ items: { delete: items } })
  return ok(items.length)
}
