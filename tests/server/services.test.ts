import { beforeEach, describe, expect, it } from "vitest"

import { createItem } from "@/domain/items/factory"
import type { Item } from "@/domain/items/types"
import { newId } from "@/domain/shared/ids"
import { adminDb } from "@/lib/firebase/admin"
import { col } from "@/server/db"
import { createManifest, deleteExpectedPieces } from "@/server/services/manifests"
import { confirmPiece, lookupReceivingScan, recordUnidentifiedPiece } from "@/server/services/receiving"
import { assignReleaseOutcome, releaseScanPiece } from "@/server/services/release"
import { storePieces } from "@/server/services/storage"
import { mergeIntoExpected } from "@/server/services/unidentified"

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!
const HOST = process.env.FIRESTORE_EMULATOR_HOST!
const ctx = { actorId: "admin", now: "2026-10-09T08:00:00.000Z" }
const op = (actorId = "op1") => ({ actorId, opId: newId() })
const receipt = { path: "store_later" as const, dateOfReceival: "2026-10-09" }

async function seedPiece(overrides: Partial<Item> = {}): Promise<Item> {
  const item = createItem({ itemId: "T-1", pieceNumber: 1, pieceTotal: 1, carrierCode: "TNT", manifestId: "M1", ...overrides }, ctx)
  await col.items().doc(item.internalItemId).set(item)
  return item
}

const read = async (id: string) => (await col.items().doc(id).get()).data() as Item | undefined

beforeEach(async () => {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" })
  await col.carriers().doc("TNT").set({ carrierCode: "TNT", name: "TNT", parser: "generic1d", idPattern: null, active: true, createdAt: ctx.now, updatedAt: ctx.now })
  await col.locations().doc("WH1-A-1").set({ locationId: "WH1-A-1", warehouse: "WH1", rack: "A", position: "1", active: true, createdAt: ctx.now, updatedAt: ctx.now })
  await col.manifests().doc("M1").set({ manifestId: "M1", manifestName: "TNT-10-9-2026-K1", truckId: "K1", carrierCode: "TNT", date: "2026-10-09", notes: null, createdAt: ctx.now, updatedAt: ctx.now, version: 1 })
})

describe("receiving", () => {
  it("looks a scan up and returns manifest headers", async () => {
    await seedPiece()
    const r = await lookupReceivingScan("TNT", [{ raw: "t-1", format: "linear" }], "2026-10-09")
    expect(r.ok && r.value.groups[0].pieces).toHaveLength(1)
    expect(r.ok && r.value.manifests.M1.manifestName).toBe("TNT-10-9-2026-K1")
  })

  it("receives a piece once; a second operator gets the duplicate error", async () => {
    const piece = await seedPiece()
    const first = await confirmPiece(piece.internalItemId, receipt, op("op1"))
    expect(first.ok).toBe(true)
    const second = await confirmPiece(piece.internalItemId, receipt, op("op2"))
    expect(second).toMatchObject({ ok: false, error: { code: "PIECE_ALREADY_CONFIRMED" } })
  })

  it("parallel receipts of one piece: exactly one succeeds", async () => {
    const piece = await seedPiece()
    const results = await Promise.all([1, 2, 3].map((n) => confirmPiece(piece.internalItemId, receipt, op(`op${n}`))))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect((await read(piece.internalItemId))?.version).toBe(2)
  })

  it("a replayed operation (lost response) succeeds without writing twice", async () => {
    const piece = await seedPiece()
    const same = op()
    expect((await confirmPiece(piece.internalItemId, receipt, same)).ok).toBe(true)
    const replay = await confirmPiece(piece.internalItemId, receipt, same)
    expect(replay).toMatchObject({ ok: true, value: { receivingState: "received", version: 2 } })
    expect((await read(piece.internalItemId))?.version).toBe(2)
  })

  it("records an unidentified piece once per operation, and rejects a duplicate piece number", async () => {
    const input = {
      ...receipt,
      label: { itemId: "UNK-1", carrierCode: "TNT", shipper: null, consignee: null, weight: null, description: null },
      pieceNumber: 1,
      pieceTotal: 2,
    }
    const same = op()
    const a = await recordUnidentifiedPiece(input, same)
    const replay = await recordUnidentifiedPiece(input, same)
    expect(a.ok && replay.ok && a.value.internalItemId === replay.value.internalItemId).toBe(true)
    const dup = await recordUnidentifiedPiece(input, op())
    expect(dup).toMatchObject({ ok: false, error: { code: "PIECE_ALREADY_CONFIRMED" } })
  })
})

describe("store and release", () => {
  it("stores, release-scans and assigns the outcome", async () => {
    const piece = await seedPiece()
    await confirmPiece(piece.internalItemId, receipt, op())
    expect((await storePieces([piece.internalItemId], "WH1-A-1", op())).ok).toBe(true)
    expect((await releaseScanPiece(piece.internalItemId, op())).ok).toBe(true)
    const out = await assignReleaseOutcome([piece.internalItemId], "released", "2026-10-09", false, op("admin"))
    expect(out).toMatchObject({ ok: true, value: [{ releaseState: "released", dateOfRelease: "2026-10-09" }] })
  })

  it("refuses an unknown or disabled location", async () => {
    const piece = await seedPiece()
    await confirmPiece(piece.internalItemId, receipt, op())
    expect(await storePieces([piece.internalItemId], "WH9-Z-9", op())).toMatchObject({ ok: false })
  })

  it("bulk store is all-or-nothing", async () => {
    const a = await seedPiece({ itemId: "A" })
    const b = await seedPiece({ itemId: "B" }) // never received
    await confirmPiece(a.internalItemId, receipt, op())
    expect((await storePieces([a.internalItemId, b.internalItemId], "WH1-A-1", op())).ok).toBe(false)
    expect((await read(a.internalItemId))?.storageState).toBeNull()
  })
})

describe("admin", () => {
  it("creates a manifest with its pieces; a replay returns the same manifest", async () => {
    const header = { manifestName: "", truckId: "K9", carrierCode: "TNT", date: "2026-10-09", notes: null }
    const lines = [{ itemId: "Z-1", carrierCode: "TNT", shipper: null, consignee: null, quantity: 3, weight: null, description: null }]
    const same = op("admin")
    const m = await createManifest(header, lines, same)
    expect(m).toMatchObject({ ok: true, value: { pieceCount: 3, manifestName: "TNT-10-9-2026-K9" } })
    await createManifest(header, lines, same)
    const pieces = await col.items().where("manifestId", "==", same.opId).get()
    expect(pieces.size).toBe(3)
  })

  it("merges an unidentified piece into an expected one (replay-safe)", async () => {
    const expected = await seedPiece({ itemId: "E-1" })
    const unidentified = await seedPiece({ itemId: "E-1", manifestId: null, receivingState: "unidentified", storageState: "stored", locationId: "WH1-A-1", dateOfReceival: "2026-10-08" })
    const same = op("admin")
    const r = await mergeIntoExpected(unidentified.internalItemId, expected.internalItemId, same)
    expect(r).toMatchObject({ ok: true, value: { receivingState: "received", locationId: "WH1-A-1" } })
    expect(await read(unidentified.internalItemId)).toBeUndefined()
    expect((await mergeIntoExpected(unidentified.internalItemId, expected.internalItemId, same)).ok).toBe(true)
  })

  it("deletes only never-received pieces", async () => {
    const a = await seedPiece()
    await confirmPiece(a.internalItemId, receipt, op())
    const b = await seedPiece({ itemId: "B" })
    expect((await deleteExpectedPieces([a.internalItemId, b.internalItemId])).ok).toBe(false)
    expect(await deleteExpectedPieces([b.internalItemId])).toMatchObject({ ok: true, value: 1 })
  })
})

// keep the admin SDK from holding the process open
process.on("exit", () => void adminDb().terminate())
