"use server"

import { z } from "zod"

import type { Item } from "@/domain/items/types"
import { ok, type Result } from "@/domain/shared/result"
import { guarded, zDate, zId, zOpId, zReceipt, zScans, zText } from "@/server/guard"
import { releaseReady, type Page } from "@/server/data/items"
import { getCarrierDayProgress, getDashboardStats, type CarrierDayProgress, type DashboardStats } from "@/server/data/stats"
import {
  confirmPiece,
  flagPieceMismatch,
  lookupReceivingScan,
  recordUnidentifiedPiece,
  type ScanLookup,
} from "@/server/services/receiving"
import { lookupReleaseScan, releaseScanPiece, type ReleaseLookup } from "@/server/services/release"
import { storePieces } from "@/server/services/storage"

/**
 * Operator actions (receiving, store step, release scan). Mutations carry a
 * client opId so a retried call that already applied is answered as success.
 */

export async function receivingLookup(input: unknown): Promise<Result<ScanLookup>> {
  return guarded("OPERATOR", z.object({ carrierCode: zId, scans: zScans, sessionDate: zDate }), input, (d) =>
    lookupReceivingScan(d.carrierCode, d.scans, d.sessionDate)
  )
}

export async function receivePiece(input: unknown): Promise<Result<Item>> {
  return guarded("OPERATOR", z.object({ opId: zOpId, internalItemId: zId, receipt: zReceipt }), input, (d, user) =>
    confirmPiece(d.internalItemId, d.receipt, { actorId: user.uid, opId: d.opId })
  )
}

const zLabel = z.object({
  itemId: z.string().trim().min(1).max(80),
  carrierCode: zId,
  shipper: zText,
  consignee: zText,
  weight: z.number().nonnegative().max(1_000_000).nullable(),
  description: zText,
})

export async function recordUnidentified(input: unknown): Promise<Result<Item>> {
  const schema = z.object({
    opId: zOpId,
    piece: zReceipt.extend({ label: zLabel, pieceNumber: z.number().int().min(1), pieceTotal: z.number().int().min(1).max(9999) }),
  })
  return guarded("OPERATOR", schema, input, (d, user) => recordUnidentifiedPiece(d.piece, { actorId: user.uid, opId: d.opId }))
}

export async function flagMismatch(input: unknown): Promise<Result<Item>> {
  const schema = z.object({ opId: zOpId, internalItemId: zId, labelTotal: z.number().int().min(1).max(9999).nullable(), note: zText })
  return guarded("OPERATOR", schema, input, (d, user) =>
    flagPieceMismatch(d.internalItemId, d.labelTotal, d.note, { actorId: user.uid, opId: d.opId })
  )
}

export async function carrierDayProgress(input: unknown): Promise<Result<CarrierDayProgress>> {
  return guarded("OPERATOR", z.object({ carrierCode: zId, date: zDate }), input, async (d) =>
    ok(await getCarrierDayProgress(d.carrierCode, d.date))
  )
}

export async function storeAt(input: unknown): Promise<Result<Item[]>> {
  const schema = z.object({ opId: zOpId, internalItemIds: z.array(zId).min(1).max(450), locationId: zId })
  return guarded("OPERATOR", schema, input, (d, user) =>
    storePieces(d.internalItemIds, d.locationId, { actorId: user.uid, opId: d.opId })
  )
}

export async function releaseLookup(input: unknown): Promise<Result<ReleaseLookup>> {
  return guarded("OPERATOR", z.object({ carrierCode: zId, scans: zScans }), input, (d) => lookupReleaseScan(d.carrierCode, d.scans))
}

export async function releaseScan(input: unknown): Promise<Result<Item>> {
  return guarded("OPERATOR", z.object({ opId: zOpId, internalItemId: zId }), input, (d, user) =>
    releaseScanPiece(d.internalItemId, { actorId: user.uid, opId: d.opId })
  )
}

export async function listReleaseReady(input: unknown): Promise<Result<Page<Item>>> {
  return guarded("OPERATOR", z.object({ carrierCode: zId }), input, async (d) => ok(await releaseReady(d.carrierCode)))
}

/** Dashboard counts for the device's business date (shared cache, ≤ 1 min old). */
export async function dashboardStats(input: unknown): Promise<Result<DashboardStats>> {
  return guarded("OPERATOR", z.object({ today: zDate }), input, async (d) => ok(await getDashboardStats(d.today)))
}
