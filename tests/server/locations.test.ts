import { beforeEach, describe, expect, it } from "vitest"

import { createItem } from "@/domain/items/factory"
import type { WarehouseLocation } from "@/domain/locations/types"
import { adminDb } from "@/lib/firebase/admin"
import { col } from "@/server/db"
import { previewWarehouse, saveWarehouse } from "@/server/services/config"

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!
const HOST = process.env.FIRESTORE_EMULATOR_HOST!
const ctx = { actorId: "admin", now: "2026-10-10T08:00:00.000Z" }

const all = async () =>
  new Map((await col.locations().get()).docs.map((d) => [d.id, (d.data() as WarehouseLocation).active]))

async function storeAt(locationId: string) {
  const item = createItem({ itemId: "S-1", pieceNumber: 1, pieceTotal: 1, carrierCode: "TNT", manifestId: null }, ctx)
  await col.items().doc(item.internalItemId).set({ ...item, receivingState: "received", storageState: "stored", locationId })
  return item
}

beforeEach(async () => {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" })
})

const add = (warehouse: string, racks: { rack: string; from: number; to: number }[]) => saveWarehouse({ original: null, spec: { warehouse, racks } })

describe("warehouses", () => {
  it("adds a warehouse with its racks", async () => {
    expect(await add("wh1", [{ rack: "a", from: 1, to: 3 }, { rack: "K", from: 7, to: 8 }])).toMatchObject({ ok: true, value: { added: 5, removed: 0, keptDisabled: 0 } })
    expect([...(await all()).keys()].sort()).toEqual(["WH1-A-1", "WH1-A-2", "WH1-A-3", "WH1-K-7", "WH1-K-8"])
  })

  it("refuses a code that already exists", async () => {
    await add("WH1", [{ rack: "A", from: 1, to: 1 }])
    expect(await add("WH1", [{ rack: "B", from: 1, to: 1 }])).toMatchObject({ ok: false, error: { code: "WAREHOUSE_EXISTS" } })
  })

  it("shrinking keeps occupied spots disabled; widening brings them back", async () => {
    await add("WH1", [{ rack: "A", from: 1, to: 4 }])
    await storeAt("WH1-A-4")
    const shrink = { original: "WH1", spec: { warehouse: "WH1", racks: [{ rack: "A", from: 1, to: 2 }] } }
    expect(await previewWarehouse(shrink)).toMatchObject({ ok: true, value: { added: 0, removed: 1, keptDisabled: 1 } })
    expect((await all()).size).toBe(4) // preview writes nothing
    await saveWarehouse(shrink)
    expect(await all()).toEqual(new Map([["WH1-A-1", true], ["WH1-A-2", true], ["WH1-A-4", false]]))

    expect(await saveWarehouse({ original: "WH1", spec: { warehouse: "WH1", racks: [{ rack: "A", from: 1, to: 4 }] } })).toMatchObject({
      ok: true,
      value: { added: 2 },
    })
    expect((await all()).get("WH1-A-4")).toBe(true)
  })

  it("a disabled spot is deleted once it is empty", async () => {
    await add("WH1", [{ rack: "A", from: 1, to: 2 }])
    const piece = await storeAt("WH1-A-2")
    const one = { original: "WH1", spec: { warehouse: "WH1", racks: [{ rack: "A", from: 1, to: 1 }] } }
    await saveWarehouse(one)
    await col.items().doc(piece.internalItemId).delete()
    expect(await saveWarehouse(one)).toMatchObject({ ok: true, value: { removed: 1 } })
    expect([...(await all()).keys()]).toEqual(["WH1-A-1"])
  })

  it("renames a rack and the warehouse", async () => {
    await add("WH1", [{ rack: "A", from: 1, to: 2 }])
    await storeAt("WH1-A-1")
    await saveWarehouse({ original: "WH1", spec: { warehouse: "WH5", racks: [{ rack: "Z", from: 1, to: 2 }] } })
    expect(await all()).toEqual(new Map([["WH1-A-1", false], ["WH5-Z-1", true], ["WH5-Z-2", true]]))
  })

  it("deletes a warehouse (no racks); occupied spots stay disabled", async () => {
    await add("WH1", [{ rack: "A", from: 1, to: 3 }])
    await storeAt("WH1-A-3")
    expect(await saveWarehouse({ original: "WH1", spec: { warehouse: "WH1", racks: [] } })).toMatchObject({ ok: true, value: { removed: 2, keptDisabled: 1 } })
    expect(await all()).toEqual(new Map([["WH1-A-3", false]]))
  })
})

process.on("exit", () => void adminDb().terminate())
