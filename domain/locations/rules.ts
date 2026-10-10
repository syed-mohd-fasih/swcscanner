import {
  locationIdFor,
  RACK_LETTER,
  WAREHOUSE_CODE,
  type WarehouseLocation,
} from "@/domain/locations/types"
import { err, ok, type Result } from "@/domain/shared/result"

/**
 * A warehouse as the admin edits it: racks with a continuous number range.
 * Positions stay individual records (the store step checks them); this is
 * the editing view over them.
 */
export type RackRange = { rack: string; from: number; to: number }
export type WarehouseSpec = { warehouse: string; racks: RackRange[] }

export const MAX_POSITION = 9999
/** one write per changed position; keeps a save far below the daily limit */
export const MAX_CHANGES = 2000

const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true })

/** Normalise (trim, upper-case, sort) and check a warehouse definition. */
export function validateWarehouse(spec: WarehouseSpec): Result<WarehouseSpec> {
  const warehouse = spec.warehouse.trim().toUpperCase()
  if (!WAREHOUSE_CODE.test(warehouse)) return err("LOCATION_INVALID", "Warehouse code: 1–8 letters or digits.")
  const seen = new Set<string>()
  const racks: RackRange[] = []
  for (const r of spec.racks) {
    const rack = r.rack.trim().toUpperCase()
    if (!RACK_LETTER.test(rack)) return err("LOCATION_INVALID", "Rack must be 1–2 letters.")
    if (seen.has(rack)) return err("LOCATION_INVALID", `Rack ${rack} is listed twice.`)
    seen.add(rack)
    const inRange = [r.from, r.to].every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_POSITION)
    if (!inRange || r.to < r.from) return err("LOCATION_INVALID", `Rack ${rack}: numbers must run from 1 to ${MAX_POSITION}, first ≤ last.`)
    racks.push({ rack, from: r.from, to: r.to })
  }
  racks.sort((a, b) => natural(a.rack, b.rack))
  return ok({ warehouse, racks })
}

export type RackSummary = {
  rack: string
  /** lowest and highest active position */
  from: number
  to: number
  active: number
  /** active numbers missing inside from–to */
  gaps: number[]
  /** disabled positions kept because pieces are still stored there */
  disabled: number
}
export type WarehouseSummary = { warehouse: string; racks: RackSummary[]; positions: number; disabled: number }

/** Group locations into warehouses → racks with their ranges, for display and editing. */
export function summarizeWarehouses(locations: WarehouseLocation[]): WarehouseSummary[] {
  const byWarehouse = new Map<string, Map<string, WarehouseLocation[]>>()
  for (const l of locations) {
    const racks = byWarehouse.get(l.warehouse) ?? new Map<string, WarehouseLocation[]>()
    racks.set(l.rack, [...(racks.get(l.rack) ?? []), l])
    byWarehouse.set(l.warehouse, racks)
  }
  return [...byWarehouse.entries()]
    .sort(([a], [b]) => natural(a, b))
    .map(([warehouse, racks]) => {
      const summaries = [...racks.entries()]
        .sort(([a], [b]) => natural(a, b))
        .map(([rack, list]) => {
          const numbers = list.filter((l) => l.active).map((l) => Number(l.position)).sort((a, b) => a - b)
          const from = numbers[0] ?? 0
          const to = numbers.at(-1) ?? 0
          const have = new Set(numbers)
          const gaps: number[] = []
          for (let n = from; n <= to && gaps.length < 50; n++) if (!have.has(n)) gaps.push(n)
          return { rack, from, to, active: numbers.length, gaps, disabled: list.length - numbers.length }
        })
      return {
        warehouse,
        racks: summaries,
        positions: summaries.reduce((n, r) => n + r.active, 0),
        disabled: summaries.reduce((n, r) => n + r.disabled, 0),
      }
    })
}

/** The editable ranges of an existing warehouse (racks with only disabled spots are left out). */
export function specOf(summary: WarehouseSummary): WarehouseSpec {
  return {
    warehouse: summary.warehouse,
    racks: summary.racks.filter((r) => r.active > 0).map((r) => ({ rack: r.rack, from: r.from, to: r.to })),
  }
}

export function positionsOf(spec: WarehouseSpec): { locationId: string; warehouse: string; rack: string; position: string }[] {
  return spec.racks.flatMap((r) =>
    Array.from({ length: r.to - r.from + 1 }, (_, i) => {
      const position = String(r.from + i)
      return { locationId: locationIdFor(spec.warehouse, r.rack, position), warehouse: spec.warehouse, rack: r.rack, position }
    })
  )
}

export type WarehousePlan = {
  /** positions to create, or to switch back on */
  enable: { locationId: string; warehouse: string; rack: string; position: string }[]
  /** removed positions with pieces on them: kept, switched off */
  disable: string[]
  /** removed positions that are empty: deleted */
  remove: string[]
}

/**
 * What a save changes. `existing` = every location of the warehouse being
 * edited (active or not); `occupied` = the removed ones that pieces still
 * point to.
 */
export function planWarehouse(existing: WarehouseLocation[], desired: WarehouseSpec, occupied: Set<string>): WarehousePlan {
  const current = new Map(existing.map((l) => [l.locationId, l]))
  const wanted = positionsOf(desired)
  const wantedIds = new Set(wanted.map((p) => p.locationId))
  return {
    enable: wanted.filter((p) => !current.get(p.locationId)?.active),
    disable: existing.filter((l) => !wantedIds.has(l.locationId) && occupied.has(l.locationId) && l.active).map((l) => l.locationId),
    remove: existing.filter((l) => !wantedIds.has(l.locationId) && !occupied.has(l.locationId)).map((l) => l.locationId),
  }
}

/** The locations a save would take away (candidates for the occupancy check). */
export function removedBy(existing: WarehouseLocation[], desired: WarehouseSpec): string[] {
  const wantedIds = new Set(positionsOf(desired).map((p) => p.locationId))
  return existing.filter((l) => !wantedIds.has(l.locationId)).map((l) => l.locationId)
}
