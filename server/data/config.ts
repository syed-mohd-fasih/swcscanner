import "server-only"

import { unstable_cache } from "next/cache"

import type { Carrier } from "@/domain/carriers/types"
import type { WarehouseLocation } from "@/domain/locations/types"
import { col, queryAll } from "@/server/db"

/**
 * Locations and carriers change rarely and are read on almost every screen,
 * so they are cached across server instances until an admin changes them
 * (revalidateTag in the config actions). A read costs one document per entry.
 */
export const CONFIG_TAGS = { locations: "config:locations", carriers: "config:carriers" } as const

export const getLocations = unstable_cache(
  async (): Promise<WarehouseLocation[]> =>
    (await queryAll<WarehouseLocation>(col.locations())).sort((a, b) => a.locationId.localeCompare(b.locationId, "en", { numeric: true })),
  ["config-locations"],
  { tags: [CONFIG_TAGS.locations] }
)

export const getCarriers = unstable_cache(
  async (): Promise<Carrier[]> =>
    (await queryAll<Carrier>(col.carriers())).sort((a, b) => a.name.localeCompare(b.name)),
  ["config-carriers"],
  { tags: [CONFIG_TAGS.carriers] }
)

export async function getActiveLocations(): Promise<WarehouseLocation[]> {
  return (await getLocations()).filter((l) => l.active)
}

export async function getCarrier(carrierCode: string): Promise<Carrier | null> {
  return (await getCarriers()).find((c) => c.carrierCode === carrierCode) ?? null
}
