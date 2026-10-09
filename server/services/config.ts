import "server-only"

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
import { adminDb } from "@/lib/firebase/admin"
import { chunk, col, docData } from "@/server/db"

/**
 * Admin configuration datasets. Callers (server actions) clear the config
 * cache tags afterwards so every screen sees the change.
 */

export async function addLocations(
  specs: { warehouse: string; rack: string; position: string }[]
): Promise<Result<WarehouseLocation[]>> {
  const now = nowIso()
  const parsed: WarehouseLocation[] = []
  for (const s of specs) {
    const warehouse = s.warehouse.trim().toUpperCase()
    const rack = s.rack.trim().toUpperCase()
    // the number printed on the rack, as it is (no padding)
    const position = String(Number(s.position.trim()))
    if (!WAREHOUSE_CODE.test(warehouse)) return err("LOCATION_INVALID", "Warehouse code: 1–8 letters or digits.")
    if (!RACK_LETTER.test(rack)) return err("LOCATION_INVALID", "Rack must be a letter.")
    if (!POSITION_NUMBER.test(position)) return err("LOCATION_INVALID", "Position must be a number.")
    parsed.push({ locationId: locationIdFor(warehouse, rack, position), warehouse, rack, position, active: true, createdAt: now, updatedAt: now })
  }
  // fresh read (admin-only, rare) so existing locations are never overwritten
  const existing = new Set((await col.locations().select().get()).docs.map((d) => d.id))
  const created = [...new Map(parsed.filter((l) => !existing.has(l.locationId)).map((l) => [l.locationId, l])).values()]
  for (const part of chunk(created, 450)) {
    const batch = adminDb().batch()
    for (const l of part) batch.create(col.locations().doc(l.locationId), l)
    await batch.commit()
  }
  return ok(created)
}

/** Locations are never hard-deleted once used; they are deactivated. */
export async function setLocationActive(locationId: string, active: boolean): Promise<Result<WarehouseLocation>> {
  const ref = col.locations().doc(locationId)
  const before = docData<WarehouseLocation>(await ref.get())
  if (!before) return err("LOCATION_INVALID", "Location not found.")
  const after = { ...before, active, updatedAt: nowIso() }
  await ref.set(after)
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
    return err("INVALID_INPUT", "Carrier code must be 2–6 letters or digits.")
  }
  const idPattern = input.idPattern.trim() || null
  if (idPattern && !compileIdPattern(idPattern)) {
    return err("INVALID_INPUT", "The item ID pattern is not a valid regular expression.")
  }
  const now = nowIso()
  const ref = col.carriers().doc(carrierCode)
  const before = docData<Carrier>(await ref.get())
  const after: Carrier = {
    carrierCode,
    name: input.name.trim(),
    parser: input.parser,
    idPattern,
    active: input.active,
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
  }
  await ref.set(after)
  return ok(after)
}
