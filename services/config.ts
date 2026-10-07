import { compileIdPattern } from "@/carriers"
import type { Carrier, ParserId } from "@/domain/carriers/types"
import {
  locationIdFor,
  POSITION_NUMBER,
  RACK_LETTER,
  WAREHOUSE_CODE,
  type WarehouseLocation,
} from "@/domain/locations/types"
import { nowIso } from "@/domain/shared/dates"
import { err, ok, type Result } from "@/domain/shared/result"
import { carrierRepository, localWriter, locationRepository } from "@/repositories/indexeddb"

/**
 * Admin configuration datasets. Every change also stamps config/versions so
 * operator devices know to refetch (and only then).
 */

export async function addLocations(
  specs: { warehouse: string; rack: string; position: string }[]
): Promise<Result<WarehouseLocation[]>> {
  const now = nowIso()
  const existing = new Set((await locationRepository.all()).map((l) => l.locationId))
  const created: WarehouseLocation[] = []
  for (const s of specs) {
    const warehouse = s.warehouse.trim().toUpperCase()
    const rack = s.rack.trim().toUpperCase()
    // the number printed on the rack, as it is (no padding)
    const position = String(Number(s.position.trim()))
    if (!WAREHOUSE_CODE.test(warehouse)) return err("LOCATION_INVALID", "Warehouse code: 1–8 letters or digits.")
    if (!RACK_LETTER.test(rack)) return err("LOCATION_INVALID", "Rack must be a letter.")
    if (!POSITION_NUMBER.test(position)) return err("LOCATION_INVALID", "Position must be a number.")
    const locationId = locationIdFor(warehouse, rack, position)
    if (existing.has(locationId)) continue
    existing.add(locationId)
    created.push({ locationId, warehouse, rack, position, active: true, createdAt: now, updatedAt: now })
  }
  await localWriter.commit({ locations: { create: created }, configVersions: { locations: now } })
  return ok(created)
}

/** Locations are never hard-deleted once used; they are deactivated. */
export async function setLocationActive(locationId: string, active: boolean): Promise<Result<WarehouseLocation>> {
  const before = await locationRepository.get(locationId)
  if (!before) return err("LOCATION_INVALID", "Location not found.")
  const now = nowIso()
  const after = { ...before, active, updatedAt: now }
  await localWriter.commit({ locations: { update: [{ before, after }] }, configVersions: { locations: now } })
  return ok(after)
}

export async function saveCarrier(input: {
  carrierCode: string
  name: string
  parser: ParserId
  idPattern: string
  active: boolean
}): Promise<Result<Carrier>> {
  const carrierCode = input.carrierCode.trim().toUpperCase()
  if (!/^[A-Z0-9]{2,6}$/.test(carrierCode)) {
    return err("FORBIDDEN", "Carrier code must be 2–6 letters or digits.")
  }
  const idPattern = input.idPattern.trim() || null
  if (idPattern && !compileIdPattern(idPattern)) {
    return err("FORBIDDEN", "The item ID pattern is not a valid regular expression.")
  }
  const now = nowIso()
  const before = await carrierRepository.get(carrierCode)
  const after: Carrier = {
    carrierCode,
    name: input.name.trim(),
    parser: input.parser,
    idPattern,
    active: input.active,
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
  }
  await localWriter.commit({
    carriers: before ? { update: [{ before, after }] } : { create: [after] },
    configVersions: { carriers: now },
  })
  return ok(after)
}
