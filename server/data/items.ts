import "server-only"

import { FieldPath } from "firebase-admin/firestore"

import type { Item, ReleaseState } from "@/domain/items/types"
import { isAwaitingStorage } from "@/domain/receiving/rules"
import { isReleaseEligible } from "@/domain/release/rules"
import type { BusinessDate } from "@/domain/shared/dates"
import { chunk, col, docData, PREFIX_END, queryAll } from "@/server/db"

/**
 * Item reads. Every query is exact or bounded by a limit — the free Firestore
 * plan bills one read per returned document. Indexes: firestore.indexes.json.
 */

export type Page<T> = { rows: T[]; hasMore: boolean }

async function page<T>(q: FirebaseFirestore.Query, limit: number): Promise<Page<T>> {
  const rows = await queryAll<T>(q.limit(limit + 1))
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit }
}

export async function getItem(internalItemId: string): Promise<Item | null> {
  return docData<Item>(await col.items().doc(internalItemId).get())
}

export async function getItems(ids: string[]): Promise<Item[]> {
  if (ids.length === 0) return []
  const out: Item[] = []
  for (const part of chunk(ids, 100)) {
    const snaps = await col.items().firestore.getAll(...part.map((id) => col.items().doc(id)))
    for (const s of snaps) if (s.exists) out.push(s.data() as Item)
  }
  return out
}

/** Exact scan lookup (two equality filters, no composite index needed). */
export async function findByCarrierItemId(carrierCode: string, itemId: string): Promise<Item[]> {
  return queryAll<Item>(col.items().where("carrierCode", "==", carrierCode).where("itemId", "==", itemId))
}

export async function itemsByManifest(manifestId: string): Promise<Item[]> {
  const rows = await queryAll<Item>(col.items().where("manifestId", "==", manifestId))
  return rows.sort((a, b) => a.itemId.localeCompare(b.itemId) || a.pieceNumber - b.pieceNumber)
}

/** Received pieces waiting for the store step (all carriers). */
export async function awaitingStorage(limit = 100): Promise<Page<Item>> {
  const res = await page<Item>(
    col
      .items()
      .where("storageState", "==", null)
      .where("releaseState", "==", "not_released")
      .where("receivingState", "in", ["received", "unidentified"]),
    limit
  )
  return { ...res, rows: res.rows.filter(isAwaitingStorage).sort(byReceivedAt) }
}

/** Pieces of one carrier that can be release-scanned now (the picking list). */
export async function releaseReady(carrierCode: string, limit = 150): Promise<Page<Item>> {
  const res = await page<Item>(
    col
      .items()
      .where("carrierCode", "==", carrierCode)
      .where("releaseState", "==", "not_released")
      .where("receivingState", "in", ["received", "unidentified"]),
    limit
  )
  return { ...res, rows: res.rows.filter(isReleaseEligible).sort(byReceivedAt) }
}

export async function byReleaseState(state: ReleaseState, limit = 200): Promise<Page<Item>> {
  const res = await page<Item>(col.items().where("releaseState", "==", state), limit)
  return { ...res, rows: res.rows.sort(byReceivedAt) }
}

export async function unidentified(limit = 200): Promise<Page<Item>> {
  const res = await page<Item>(col.items().where("receivingState", "==", "unidentified"), limit)
  return { ...res, rows: res.rows.sort(byReceivedAt) }
}

/** Expected pieces of a carrier whose itemId starts with `prefix` (merge search). */
export async function searchExpected(carrierCode: string, prefix: string, limit = 20): Promise<Item[]> {
  const p = prefix.trim().toUpperCase()
  let q = col.items().where("carrierCode", "==", carrierCode).where("receivingState", "==", "expected")
  if (p) q = q.where("itemId", ">=", p).where("itemId", "<", p + PREFIX_END)
  return queryAll<Item>(q.orderBy("itemId").orderBy(FieldPath.documentId()).limit(limit))
}

/** Export: pieces received within a date range (inclusive). */
export async function receivedBetween(from: BusinessDate, to: BusinessDate, limit = 5000): Promise<Page<Item>> {
  return page<Item>(col.items().where("dateOfReceival", ">=", from).where("dateOfReceival", "<=", to), limit)
}

function byReceivedAt(a: Item, b: Item): number {
  return (a.receivedAt ?? "").localeCompare(b.receivedAt ?? "") || a.pieceNumber - b.pieceNumber
}
