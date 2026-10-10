"use server"

import { revalidateTag } from "next/cache"
import { z } from "zod"

import { PARSER_IDS, type Carrier } from "@/domain/carriers/types"
import { INVESTIGATION_STATUSES, RELEASE_OUTCOMES, type Item } from "@/domain/items/types"
import type { Manifest } from "@/domain/manifests/types"
import { ok, type Result } from "@/domain/shared/result"
import pkg from "@/package.json"
import { CONFIG_TAGS } from "@/server/data/config"
import { searchExpected } from "@/server/data/items"
import { MANIFESTS_TAG } from "@/server/data/manifests"
import { guarded, zDate, zId, zOpId, zText } from "@/server/guard"
import * as config from "@/server/services/config"
import { deleteExported, deleteManifest, exportWorkbook, MAX_EXPORT_PIECES, type DeleteReport, type ExportFile } from "@/server/services/export"
import { correctItem, createManifest, deleteExpectedPieces, updateManifest } from "@/server/services/manifests"
import { assignReleaseOutcome } from "@/server/services/release"
import { mergeIntoExpected, updateInvestigation } from "@/server/services/unidentified"

/** Admin-only actions. Authorization is checked inside every action. */

const zName = z.string().trim().max(120)
const zNullableText = z.string().trim().max(200).nullable()

export async function createManifestAction(input: unknown): Promise<Result<Manifest>> {
  const schema = z.object({
    opId: zOpId,
    header: z.object({ manifestName: zName, truckId: z.string().trim().min(1).max(40), carrierCode: zId, date: zDate, notes: zText }),
    lines: z
      .array(
        z.object({
          itemId: z.string().trim().min(1).max(80),
          carrierCode: zId,
          shipper: zNullableText,
          consignee: zNullableText,
          quantity: z.number().int().min(1).max(9999),
          weight: z.number().nonnegative().max(1_000_000).nullable(),
          description: zNullableText,
        })
      )
      .min(1)
      .max(5000),
  })
  return guarded("ADMIN", schema, input, async (d, user) => {
    const r = await createManifest(d.header, d.lines, { actorId: user.uid, opId: d.opId })
    if (r.ok) revalidateTag(MANIFESTS_TAG, { expire: 0 })
    return r
  })
}

export async function correctItemAction(input: unknown): Promise<Result<Item>> {
  const schema = z.object({
    opId: zOpId,
    internalItemId: zId,
    patch: z
      .object({
        itemId: z.string().trim().min(1).max(80),
        carrierCode: zId,
        shipper: zNullableText,
        consignee: zNullableText,
        weight: z.number().nonnegative().nullable(),
        description: zNullableText,
        locationId: zId.nullable(),
        dateOfReceival: zDate.nullable(),
        dateOfRelease: zDate.nullable(),
      })
      .partial(),
    clearMismatch: z.boolean().optional(),
  })
  return guarded("ADMIN", schema, input, (d, user) =>
    correctItem(d.internalItemId, { ...d.patch, ...(d.clearMismatch ? { quantityMismatch: null } : {}) }, { actorId: user.uid, opId: d.opId })
  )
}

export async function deleteExpectedAction(input: unknown): Promise<Result<number>> {
  return guarded("ADMIN", z.object({ internalItemIds: z.array(zId).min(1).max(450) }), input, (d) =>
    deleteExpectedPieces(d.internalItemIds)
  )
}

export async function assignOutcomeAction(input: unknown): Promise<Result<Item[]>> {
  const schema = z.object({
    opId: zOpId,
    internalItemIds: z.array(zId).min(1).max(450),
    outcome: z.enum(RELEASE_OUTCOMES),
    dateOfRelease: zDate,
    overrideIdentify: z.boolean(),
  })
  return guarded("ADMIN", schema, input, (d, user) =>
    assignReleaseOutcome(d.internalItemIds, d.outcome, d.dateOfRelease, d.overrideIdentify, { actorId: user.uid, opId: d.opId })
  )
}

export async function updateInvestigationAction(input: unknown): Promise<Result<Item>> {
  const schema = z.object({ opId: zOpId, internalItemId: zId, status: z.enum(INVESTIGATION_STATUSES), note: zText })
  return guarded("ADMIN", schema, input, (d, user) =>
    updateInvestigation(d.internalItemId, d.status, d.note, { actorId: user.uid, opId: d.opId })
  )
}

export async function mergeAction(input: unknown): Promise<Result<Item>> {
  const schema = z.object({ opId: zOpId, unidentifiedId: zId, expectedId: zId })
  return guarded("ADMIN", schema, input, (d, user) =>
    mergeIntoExpected(d.unidentifiedId, d.expectedId, { actorId: user.uid, opId: d.opId })
  )
}

export async function searchExpectedAction(input: unknown): Promise<Result<Item[]>> {
  return guarded("ADMIN", z.object({ carrierCode: zId, prefix: z.string().max(80) }), input, async (d) =>
    ok(await searchExpected(d.carrierCode, d.prefix))
  )
}

// ── configuration ─────────────────────────────────────────────────────────

const zWarehouseEdit = z.object({
  original: z.string().trim().max(8).nullable(),
  spec: z.object({
    warehouse: z.string().trim().max(8),
    racks: z
      .array(z.object({ rack: z.string().trim().max(2), from: z.number().int(), to: z.number().int() }))
      .max(100),
  }),
})

/** Read-only: how a warehouse save would change locations. */
export async function previewWarehouseAction(input: unknown): Promise<Result<config.WarehouseChange>> {
  return guarded("ADMIN", zWarehouseEdit, input, (d) => config.previewWarehouse(d))
}

/** Add, edit or delete (no racks) a warehouse. */
export async function saveWarehouseAction(input: unknown): Promise<Result<config.WarehouseChange>> {
  return guarded("ADMIN", zWarehouseEdit, input, async (d) => {
    const r = await config.saveWarehouse(d)
    if (r.ok) revalidateTag(CONFIG_TAGS.locations, { expire: 0 })
    return r
  })
}

export async function saveCarrierAction(input: unknown): Promise<Result<Carrier>> {
  const schema = z.object({
    carrierCode: z.string().max(6),
    name: z.string().trim().min(1).max(60),
    parser: z.enum(PARSER_IDS),
    idPattern: z.string().max(200),
    active: z.boolean(),
  })
  return guarded("ADMIN", schema, input, async (d) => {
    const r = await config.saveCarrier(d)
    if (r.ok) revalidateTag(CONFIG_TAGS.carriers, { expire: 0 })
    return r
  })
}

// ── manifest edit / delete ─────────────────────────────────────────────────

export async function updateManifestAction(input: unknown): Promise<Result<Manifest>> {
  const schema = z.object({
    manifestId: zId,
    manifestName: zName,
    truckId: z.string().trim().min(1).max(40),
    date: zDate,
    notes: zText,
  })
  return guarded("ADMIN", schema, input, async ({ manifestId, ...edit }) => {
    const r = await updateManifest(manifestId, edit)
    if (r.ok) revalidateTag(MANIFESTS_TAG, { expire: 0 })
    return r
  })
}

/** Permanent: the manifest and every piece under it, whatever their status. */
export async function deleteManifestAction(input: unknown): Promise<Result<{ deletedPieces: number }>> {
  return guarded("ADMIN", z.object({ manifestId: zId }), input, async (d) => {
    const r = await deleteManifest(d.manifestId)
    revalidateTag(MANIFESTS_TAG, { expire: 0 })
    return r.ok ? ok({ deletedPieces: r.value.deletedPieces }) : r
  })
}

// ── export (.xlsx) and delete after export ────────────────────────────────

const zSelection = z.object({
  manifestIds: z.array(zId).max(200),
  includeUnidentified: z.boolean(),
})

/** Build the workbook on the server; the phone only saves the file. */
export async function exportManifestsAction(input: unknown): Promise<Result<ExportFile>> {
  const schema = zSelection.extend({ single: z.boolean().optional() })
  return guarded("ADMIN", schema, input, (d, user) =>
    exportWorkbook(d, { exportedBy: user.name || user.username, appVersion: pkg.version, single: d.single })
  )
}

/** After the admin has the file: delete exactly what it contained. */
export async function deleteExportedAction(input: unknown): Promise<Result<DeleteReport>> {
  const schema = zSelection.extend({
    snapshot: z.array(z.object({ id: zId, version: z.number().int().nonnegative() })).max(MAX_EXPORT_PIECES),
  })
  return guarded("ADMIN", schema, input, async ({ snapshot, ...selection }) => {
    const r = await deleteExported(selection, snapshot)
    revalidateTag(MANIFESTS_TAG, { expire: 0 })
    return r
  })
}
