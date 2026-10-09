import { DocumentReference, Firestore, Query, Transaction, WriteBatch } from "@google-cloud/firestore"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { Item } from "@/domain/items/types"
import { newId } from "@/domain/shared/ids"
import { col } from "@/server/db"
import { getDashboardStats } from "@/server/data/stats"
import { createManifest } from "@/server/services/manifests"
import { confirmPiece, lookupReceivingScan } from "@/server/services/receiving"
import { assignReleaseOutcome, lookupReleaseScan, releaseScanPiece } from "@/server/services/release"
import { storePieces } from "@/server/services/storage"

/**
 * Free-plan budget check: run one simulated day of 100 pieces through the
 * real services and count billed Firestore operations (documents read,
 * documents written). The design target is 1,000 pieces a day at TWICE the
 * estimate: ≤ 50k reads and ≤ 20k writes per day.
 */
const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!
const HOST = process.env.FIRESTORE_EMULATOR_HOST!
const counts = { reads: 0, writes: 0 }
const restore: (() => void)[] = []

function wrap<T extends object>(proto: T, name: keyof T, after: (result: unknown, args: unknown[]) => void) {
  const original = proto[name] as (...a: unknown[]) => unknown
  proto[name] = function (this: unknown, ...args: unknown[]) {
    const result = original.apply(this, args)
    if (result instanceof Promise) return result.then((r) => (after(r, args), r))
    after(result, args)
    return result
  } as T[keyof T]
  restore.push(() => (proto[name] = original as T[keyof T]))
}

const docsIn = (r: unknown): number => {
  if (Array.isArray(r)) return r.filter((s) => s?.exists).length
  const snap = r as { docs?: unknown[]; exists?: boolean; size?: number }
  if (snap?.docs) return Math.max(1, snap.docs.length) // an empty query still costs 1 read
  return 1
}

beforeAll(async () => {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" })
  const now = new Date().toISOString()
  await col.carriers().doc("TNT").set({ carrierCode: "TNT", name: "TNT", parser: "generic1d", idPattern: null, active: true, createdAt: now, updatedAt: now })
  await col.locations().doc("WH1-A-1").set({ locationId: "WH1-A-1", warehouse: "WH1", rack: "A", position: "1", active: true, createdAt: now, updatedAt: now })

  wrap(DocumentReference.prototype, "get", (r) => (counts.reads += docsIn(r)))
  wrap(Query.prototype, "get", (r) => (counts.reads += docsIn(r)))
  wrap(Firestore.prototype, "getAll", (r) => (counts.reads += docsIn(r)))
  wrap(Transaction.prototype, "get", (r) => (counts.reads += docsIn(r)))
  wrap(Transaction.prototype, "getAll", (r) => (counts.reads += docsIn(r)))
  // count queries: 1 read per 1,000 matches (always ≥ 1)
  wrap(Query.prototype, "count", (aggregate) => {
    const q = aggregate as { get: () => Promise<unknown> }
    const get = q.get.bind(q)
    q.get = () => ((counts.reads += 1), get())
  })
  // transactions and document writes go through WriteBatch internally
  for (const op of ["set", "create", "update", "delete"] as const) wrap(WriteBatch.prototype, op, () => (counts.writes += 1))
})

afterAll(() => restore.forEach((r) => r()))

describe("free-plan budget", () => {
  it("a day of 100 pieces stays within half the daily limits when scaled to 1,000", async () => {
    const PIECES = 100
    const op = () => ({ actorId: "op1", opId: newId() })
    const lines = Array.from({ length: PIECES / 5 }, (_, i) => ({
      itemId: `B-${i}`, carrierCode: "TNT", shipper: null, consignee: null, quantity: 5, weight: null, description: null,
    }))
    const manifest = await createManifest({ manifestName: "", truckId: "K1", carrierCode: "TNT", date: "2026-10-09", notes: null }, lines, op())
    expect(manifest.ok).toBe(true)

    const pieces = (await col.items().where("manifestId", "==", manifest.ok ? manifest.value.manifestId : "").get()).docs.map((d) => d.data() as Item)
    counts.reads = 0
    counts.writes = 0
    const created = PIECES // one write per expected piece (manifest creation)

    for (const p of pieces) {
      await lookupReceivingScan("TNT", [{ raw: p.itemId, format: "linear" }], "2026-10-09")
      await confirmPiece(p.internalItemId, { path: "store_later", dateOfReceival: "2026-10-09" }, op())
    }
    for (let i = 0; i < pieces.length; i += 5) {
      await storePieces(pieces.slice(i, i + 5).map((p) => p.internalItemId), "WH1-A-1", op())
    }
    for (const p of pieces) {
      await lookupReleaseScan("TNT", [{ raw: p.itemId, format: "linear" }])
      await releaseScanPiece(p.internalItemId, op())
    }
    await assignReleaseOutcome(pieces.map((p) => p.internalItemId), "released", "2026-10-09", false, op())
    for (let i = 0; i < 20; i++) await getDashboardStats("2026-10-09") // uncached in tests

    const perDay = { reads: (counts.reads * 1000) / PIECES, writes: ((counts.writes + created) * 1000) / PIECES }
    console.log(`100 pieces: ${counts.reads} reads, ${counts.writes + created} writes → 1,000/day ≈ ${perDay.reads} reads, ${perDay.writes} writes`)
    // twice the estimate must still fit the free plan
    expect(perDay.reads * 2).toBeLessThan(50_000)
    expect(perDay.writes * 2).toBeLessThan(20_000)
  })
})
