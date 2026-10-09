"use server"

import { revalidateTag } from "next/cache"
import { z } from "zod"

import { PARSER_IDS, type Carrier } from "@/domain/carriers/types"
import { INVESTIGATION_STATUSES, RELEASE_OUTCOMES, type Item } from "@/domain/items/types"
import type { WarehouseLocation } from "@/domain/locations/types"
import type { Manifest } from "@/domain/manifests/types"
import { ok, type Result } from "@/domain/shared/result"
import { toExportRows, type ExportRow } from "@/services/export"
import { CONFIG_TAGS, getLocations } from "@/server/data/config"
import { receivedBetween, searchExpected } from "@/server/data/items"
import { getManifests, MANIFESTS_TAG } from "@/server/data/manifests"
import { guarded, zDate, zId, zOpId, zText } from "@/server/guard"
import * as config from "@/server/services/config"
import { archiveExported } from "@/server/services/export"
import { correctItem, createManifest, deleteExpectedPieces } from "@/server/services/manifests"
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

export async function addLocationsAction(input: unknown): Promise<Result<WarehouseLocation[]>> {
  const spec = z.object({ warehouse: z.string().max(8), rack: z.string().max(2), position: z.string().max(4) })
  return guarded("ADMIN", z.object({ specs: z.array(spec).min(1).max(2000) }), input, async (d) => {
    const r = await config.addLocations(d.specs)
    if (r.ok) revalidateTag(CONFIG_TAGS.locations, { expire: 0 })
    return r
  })
}

export async function setLocationActiveAction(input: unknown): Promise<Result<WarehouseLocation>> {
  return guarded("ADMIN", z.object({ locationId: zId, active: z.boolean() }), input, async (d) => {
    const r = await config.setLocationActive(d.locationId, d.active)
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

// ── export / archive ──────────────────────────────────────────────────────

export type ExportPreview = {
  rows: ExportRow[]
  /** per row: id, carrier and release state (for client-side filters and archive) */
  meta: { internalItemId: string; carrierCode: string; releaseState: Item["releaseState"] }[]
  truncated: boolean
}

/** Pieces received in a date range. Cost: one read per piece (+ manifests). */
export async function exportPreviewAction(input: unknown): Promise<Result<ExportPreview>> {
  return guarded("ADMIN", z.object({ from: zDate, to: zDate }), input, async (d) => {
    const { rows: items, hasMore } = await receivedBetween(d.from, d.to)
    const manifests = await getManifests(items.map((i) => i.manifestId).filter((m): m is string => !!m))
    const locations = new Map((await getLocations()).map((l) => [l.locationId, l]))
    return ok({
      rows: toExportRows(items, manifests, locations),
      meta: items.map((i) => ({ internalItemId: i.internalItemId, carrierCode: i.carrierCode, releaseState: i.releaseState })),
      truncated: hasMore,
    })
  })
}

export async function archiveAction(input: unknown): Promise<Result<number>> {
  return guarded("ADMIN", z.object({ internalItemIds: z.array(zId).min(1).max(5000) }), input, (d) =>
    archiveExported(d.internalItemIds)
  )
}
