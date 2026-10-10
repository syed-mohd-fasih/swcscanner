import "server-only"

import { compileIdPattern } from "@/carriers"
import type { Carrier, ParserId } from "@/domain/carriers/types"
import {
  MAX_CHANGES,
  planWarehouse,
  removedBy,
  validateWarehouse,
  type WarehousePlan,
  type WarehouseSpec,
} from "@/domain/locations/rules"
import type { WarehouseLocation } from "@/domain/locations/types"
import { nowIso } from "@/domain/shared/dates"
import { err, ok, type Result } from "@/domain/shared/result"
import { adminDb } from "@/lib/firebase/admin"
import { chunk, col, docData } from "@/server/db"

/**
 * Admin configuration datasets. Callers (server actions) clear the config
 * cache tags afterwards so every screen sees the change.
 */

export type WarehouseEdit = {
  /** the warehouse being edited; null when adding a new one */
  original: string | null
  spec: WarehouseSpec
}
export type WarehouseChange = { added: number; removed: number; keptDisabled: number }

/** All locations of one warehouse, active or not (fresh read; admin-only, rare). */
async function warehouseLocations(warehouse: string): Promise<WarehouseLocation[]> {
  return (await col.locations().where("warehouse", "==", warehouse).get()).docs.map((d) => d.data() as WarehouseLocation)
}

/** Which of these locations pieces still point to (one read per such piece). */
async function occupiedOf(locationIds: string[]): Promise<Set<string>> {
  const occupied = new Set<string>()
  for (const part of chunk(locationIds, 30)) {
    const snap = await col.items().where("locationId", "in", part).select("locationId").get()
    for (const d of snap.docs) occupied.add(d.get("locationId") as string)
  }
  return occupied
}

async function planEdit(edit: WarehouseEdit): Promise<Result<{ plan: WarehousePlan; spec: WarehouseSpec }>> {
  const valid = validateWarehouse(edit.spec)
  if (!valid.ok) return valid
  const spec = valid.value
  const original = edit.original?.trim().toUpperCase() || null
  if (spec.warehouse !== original) {
    const taken = await col.locations().where("warehouse", "==", spec.warehouse).limit(1).select().get()
    if (!taken.empty) return err("WAREHOUSE_EXISTS", `Warehouse ${spec.warehouse} already exists.`)
  }
  const existing = original ? await warehouseLocations(original) : []
  if (original && existing.length === 0) return err("NOT_FOUND", "Warehouse not found. It may have been changed.")
  const occupied = await occupiedOf(removedBy(existing, spec))
  const plan = planWarehouse(existing, spec, occupied)
  if (plan.enable.length + plan.disable.length + plan.remove.length > MAX_CHANGES) {
    return err("INVALID_INPUT", `Too many changes at once (max ${MAX_CHANGES}).`)
  }
  return ok({ plan, spec })
}

const summary = (plan: WarehousePlan): WarehouseChange => ({
  added: plan.enable.length,
  removed: plan.remove.length,
  keptDisabled: plan.disable.length,
})

/** Read-only: what a save would do (for the warning before saving). */
export async function previewWarehouse(edit: WarehouseEdit): Promise<Result<WarehouseChange>> {
  const r = await planEdit(edit)
  return r.ok ? ok(summary(r.value.plan)) : r
}

/**
 * Add, edit (ranges, rack letters, the warehouse code) or delete (no racks)
 * a warehouse. New positions are created; removed empty ones are deleted;
 * removed ones that still hold pieces are kept but disabled, so those pieces
 * keep their location and nothing new is stored there. Disabled positions
 * that have emptied are deleted on a later save.
 */
export async function saveWarehouse(edit: WarehouseEdit): Promise<Result<WarehouseChange>> {
  const r = await planEdit(edit)
  if (!r.ok) return r
  const { plan } = r.value
  const now = nowIso()
  type Write = (batch: FirebaseFirestore.WriteBatch) => void
  const writes: Write[] = [
    ...plan.enable.map<Write>((p) => (batch) =>
      batch.set(col.locations().doc(p.locationId), { ...p, active: true, createdAt: now, updatedAt: now } satisfies WarehouseLocation)
    ),
    ...plan.disable.map<Write>((id) => (batch) => batch.update(col.locations().doc(id), { active: false, updatedAt: now })),
    ...plan.remove.map<Write>((id) => (batch) => batch.delete(col.locations().doc(id))),
  ]
  for (const part of chunk(writes, 450)) {
    const batch = adminDb().batch()
    for (const write of part) write(batch)
    await batch.commit()
  }
  return ok(summary(plan))
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
