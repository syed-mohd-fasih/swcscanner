import type { MutationContext } from "@/domain/items/factory"
import { nowIso } from "@/domain/shared/dates"
import { err, type Result } from "@/domain/shared/result"
import { locationRepository } from "@/repositories/indexeddb"
import type { LocationValidator } from "@/domain/receiving/rules"

export function mutationContext(actorId: string): MutationContext {
  return { actorId, now: nowIso() }
}

/** Validator over the locally synced (predefined) location dataset. */
export async function activeLocationValidator(): Promise<LocationValidator> {
  const ids = new Set((await locationRepository.active()).map((l) => l.locationId))
  return (id) => ids.has(id)
}

export function notFound(what: string): Result<never> {
  return err("PIECE_NOT_ELIGIBLE", `${what} not found on this device.`)
}
