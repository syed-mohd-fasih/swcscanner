import { readFileSync } from "node:fs"

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore"
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest"

import { createItem } from "@/domain/items/factory"
import type { Item } from "@/domain/items/types"

let env: RulesTestEnvironment

const ctx = { actorId: "seed", now: "2026-10-05T00:00:00.000Z" }
const expected = (): Item => ({ ...createItem({ itemId: "X1", pieceNumber: 1, pieceTotal: 1, carrierCode: "TNT", manifestId: "M1" }, ctx), internalItemId: "piece-1" })

const operator = () => env.authenticatedContext("op1", { role: "OPERATOR" }).firestore()
const admin = () => env.authenticatedContext("ad1", { role: "ADMIN" }).firestore()

const storePatch = (version: number, locationId = "WH1-A-12", by = "op1") => ({
  storageState: "stored",
  locationId,
  storedBy: by,
  storedAt: ctx.now,
  updatedAt: ctx.now,
  version,
})

const receivePatch = (version: number, by = "op1") => ({
  receivingState: "received",
  storageState: null,
  locationId: null,
  dateOfReceival: "2026-10-05",
  receivedBy: by,
  receivedAt: ctx.now,
  updatedAt: ctx.now,
  version,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "items/piece-1"), expected())
    await setDoc(doc(c.firestore(), "locations/WH1-A-12"), { locationId: "WH1-A-12", warehouse: "WH1", rack: "A", position: "12", active: true })
  })
})

describe("items — operator", () => {
  it("receives an expected piece once (version + 1)", async () => {
    await assertSucceeds(updateDoc(doc(operator(), "items/piece-1"), receivePatch(2)))
  })

  it("cannot receive the same piece twice", async () => {
    await assertSucceeds(updateDoc(doc(operator(), "items/piece-1"), receivePatch(2)))
    await assertFails(updateDoc(doc(operator(), "items/piece-1"), receivePatch(3)))
  })

  it("rejects stale writes (wrong version)", async () => {
    await assertFails(updateDoc(doc(operator(), "items/piece-1"), receivePatch(5)))
  })

  it("cannot record receipt on behalf of someone else", async () => {
    await assertFails(updateDoc(doc(operator(), "items/piece-1"), receivePatch(2, "someone-else")))
  })

  it("cannot sneak extra fields into a receipt", async () => {
    await assertFails(updateDoc(doc(operator(), "items/piece-1"), { ...receivePatch(2), releaseState: "released" }))
  })

  it("cannot set a location while receiving", async () => {
    await assertFails(
      updateDoc(doc(operator(), "items/piece-1"), { ...receivePatch(2), storageState: "stored", locationId: "WH1-A-12" })
    )
  })

  it("stores a received piece once, at an existing location", async () => {
    await assertSucceeds(updateDoc(doc(operator(), "items/piece-1"), receivePatch(2)))
    await assertFails(updateDoc(doc(operator(), "items/piece-1"), storePatch(3, "WH9-Z-99")))
    await assertSucceeds(updateDoc(doc(operator(), "items/piece-1"), storePatch(3)))
    await assertFails(updateDoc(doc(operator(), "items/piece-1"), storePatch(4)))
  })

  it("cannot store a piece that was never received", async () => {
    await assertFails(updateDoc(doc(operator(), "items/piece-1"), storePatch(2)))
  })

  it("can flag a quantity mismatch", async () => {
    await assertSucceeds(
      updateDoc(doc(operator(), "items/piece-1"), { quantityMismatch: { labelTotal: 2, note: null }, updatedAt: ctx.now, version: 2 })
    )
  })

  it("cannot release-scan a piece that was never received", async () => {
    await assertFails(
      updateDoc(doc(operator(), "items/piece-1"), {
        releaseState: "release_scanned",
        releaseScannedBy: "op1",
        releaseScannedAt: ctx.now,
        updatedAt: ctx.now,
        version: 2,
      })
    )
  })

  it("can release-scan once stored, but cannot assign the outcome", async () => {
    await assertSucceeds(updateDoc(doc(operator(), "items/piece-1"), receivePatch(2)))
    const scan = (version: number) => ({
      releaseState: "release_scanned",
      releaseScannedBy: "op1",
      releaseScannedAt: ctx.now,
      updatedAt: ctx.now,
      version,
    })
    // still awaiting storage → not yet gatherable
    await assertFails(updateDoc(doc(operator(), "items/piece-1"), scan(3)))
    await assertSucceeds(updateDoc(doc(operator(), "items/piece-1"), storePatch(3)))
    await assertSucceeds(
      updateDoc(doc(operator(), "items/piece-1"), {
        releaseState: "release_scanned",
        releaseScannedBy: "op1",
        releaseScannedAt: ctx.now,
        updatedAt: ctx.now,
        version: 4,
      })
    )
    await assertFails(
      updateDoc(doc(operator(), "items/piece-1"), { releaseState: "released", dateOfRelease: "2026-10-05", updatedAt: ctx.now, version: 5 })
    )
  })

  it("can create unidentified pieces only", async () => {
    const unk = { ...createItem({ itemId: "U1", pieceNumber: 1, pieceTotal: 1, carrierCode: "ARX", receivingState: "unidentified", storageState: "direct_release", receivedBy: "op1" }, ctx), internalItemId: "unk-1" }
    await assertSucceeds(setDoc(doc(operator(), "items/unk-1"), unk))
    const fake = { ...expected(), internalItemId: "fake-1" }
    await assertFails(setDoc(doc(operator(), "items/fake-1"), fake))
  })

  it("cannot delete, nor write manifests/locations/carriers", async () => {
    await assertFails(deleteDoc(doc(operator(), "items/piece-1")))
    await assertFails(setDoc(doc(operator(), "manifests/m1"), { manifestId: "m1", version: 1 }))
    await assertFails(setDoc(doc(operator(), "locations/WH1-A-1"), { locationId: "WH1-A-1" }))
    await assertFails(setDoc(doc(operator(), "carriers/TNT"), { carrierCode: "TNT" }))
  })
})

describe("items — admin", () => {
  it("can assign outcomes and correct data (version + 1)", async () => {
    await assertSucceeds(updateDoc(doc(admin(), "items/piece-1"), { description: "fixed", updatedAt: ctx.now, version: 2 }))
  })

  it("is still version-checked", async () => {
    await assertFails(updateDoc(doc(admin(), "items/piece-1"), { description: "stale", updatedAt: ctx.now, version: 1 }))
  })

  it("can delete and manage configuration", async () => {
    await assertSucceeds(setDoc(doc(admin(), "locations/A-01-01"), { locationId: "A-01-01" }))
    await assertSucceeds(deleteDoc(doc(admin(), "items/piece-1")))
  })
})

describe("unauthenticated", () => {
  it("can read nothing", async () => {
    const anon = env.unauthenticatedContext().firestore()
    await assertFails(setDoc(doc(anon, "items/x"), { a: 1 }))
  })
})
