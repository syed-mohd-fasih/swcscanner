import { describe, expect, it } from "vitest"

import { planWarehouse, specOf, summarizeWarehouses, validateWarehouse } from "@/domain/locations/rules"
import { locationIdFor, type WarehouseLocation } from "@/domain/locations/types"

const now = "2026-10-10T08:00:00.000Z"
const loc = (warehouse: string, rack: string, position: number, active = true): WarehouseLocation => ({
  locationId: locationIdFor(warehouse, rack, String(position)),
  warehouse,
  rack,
  position: String(position),
  active,
  createdAt: now,
  updatedAt: now,
})
const range = (w: string, r: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => loc(w, r, from + i))

describe("warehouse spec", () => {
  it("normalises codes and sorts racks", () => {
    expect(validateWarehouse({ warehouse: " wh1 ", racks: [{ rack: "k", from: 1, to: 3 }, { rack: "a", from: 2, to: 2 }] })).toEqual({
      ok: true,
      value: { warehouse: "WH1", racks: [{ rack: "A", from: 2, to: 2 }, { rack: "K", from: 1, to: 3 }] },
    })
  })

  it("refuses duplicate racks, bad ranges and bad codes", () => {
    expect(validateWarehouse({ warehouse: "WH1", racks: [{ rack: "A", from: 1, to: 2 }, { rack: "a", from: 3, to: 4 }] }).ok).toBe(false)
    expect(validateWarehouse({ warehouse: "WH1", racks: [{ rack: "A", from: 5, to: 2 }] }).ok).toBe(false)
    expect(validateWarehouse({ warehouse: "WH1", racks: [{ rack: "A", from: 0, to: 2 }] }).ok).toBe(false)
    expect(validateWarehouse({ warehouse: "W H", racks: [] }).ok).toBe(false)
    expect(validateWarehouse({ warehouse: "WH1", racks: [{ rack: "A1", from: 1, to: 2 }] }).ok).toBe(false)
  })
})

describe("summaries", () => {
  it("groups racks with ranges, gaps and disabled spots", () => {
    const list = [...range("WH1", "A", 1, 3), loc("WH1", "A", 5), loc("WH1", "A", 9, false), ...range("WH1", "K", 1, 2), loc("WH2", "B", 1)]
    const [wh1, wh2] = summarizeWarehouses(list)
    expect(wh1).toMatchObject({ warehouse: "WH1", positions: 6, disabled: 1 })
    expect(wh1.racks[0]).toEqual({ rack: "A", from: 1, to: 5, active: 4, gaps: [4], disabled: 1 })
    expect(specOf(wh1)).toEqual({ warehouse: "WH1", racks: [{ rack: "A", from: 1, to: 5 }, { rack: "K", from: 1, to: 2 }] })
    expect(wh2.warehouse).toBe("WH2")
  })
})

describe("planning a save", () => {
  const existing = [...range("WH1", "A", 1, 5), loc("WH1", "B", 1, false)]

  it("shrinking: empty spots are deleted, occupied ones disabled", () => {
    const plan = planWarehouse(existing, { warehouse: "WH1", racks: [{ rack: "A", from: 1, to: 3 }] }, new Set(["WH1-A-5"]))
    expect(plan.enable).toEqual([])
    expect(plan.disable).toEqual(["WH1-A-5"])
    // B-1 was disabled and is now empty: deleted
    expect(plan.remove.sort()).toEqual(["WH1-A-4", "WH1-B-1"])
  })

  it("growing re-enables disabled spots and creates new ones", () => {
    const withDisabled = [...range("WH1", "A", 1, 2), loc("WH1", "A", 3, false)]
    const plan = planWarehouse(withDisabled, { warehouse: "WH1", racks: [{ rack: "A", from: 1, to: 4 }] }, new Set())
    expect(plan.enable.map((p) => p.locationId)).toEqual(["WH1-A-3", "WH1-A-4"])
    expect(plan.remove).toEqual([])
  })

  it("an occupied spot that is already disabled is left alone", () => {
    const plan = planWarehouse([loc("WH1", "A", 1), loc("WH1", "A", 2, false)], { warehouse: "WH1", racks: [{ rack: "A", from: 1, to: 1 }] }, new Set(["WH1-A-2"]))
    expect(plan).toEqual({ enable: [], disable: [], remove: [] })
  })

  it("renaming the warehouse moves every position", () => {
    const plan = planWarehouse(range("WH1", "A", 1, 2), { warehouse: "WH9", racks: [{ rack: "A", from: 1, to: 2 }] }, new Set(["WH1-A-1"]))
    expect(plan.enable.map((p) => p.locationId)).toEqual(["WH9-A-1", "WH9-A-2"])
    expect(plan.disable).toEqual(["WH1-A-1"])
    expect(plan.remove).toEqual(["WH1-A-2"])
  })
})
