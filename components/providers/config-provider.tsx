"use client"

import { createContext, useContext, useMemo } from "react"

import type { Carrier } from "@/domain/carriers/types"
import type { WarehouseLocation } from "@/domain/locations/types"

type Config = { carriers: Carrier[]; locations: WarehouseLocation[] }

const ConfigContext = createContext<Config>({ carriers: [], locations: [] })

/**
 * Carriers and locations, rendered once by the (app) layout from the shared
 * server cache. Admin changes refresh the layout (router.refresh()).
 */
export function ConfigProvider({ carriers, locations, children }: Config & { children: React.ReactNode }) {
  const value = useMemo(() => ({ carriers, locations }), [carriers, locations])
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}

export function useCarriers(activeOnly = true): { data: Carrier[] } {
  const { carriers } = useContext(ConfigContext)
  const data = useMemo(() => carriers.filter((c) => !activeOnly || c.active), [carriers, activeOnly])
  return { data }
}

export function useCarrier(carrierCode: string | null | undefined): Carrier | undefined {
  const { carriers } = useContext(ConfigContext)
  return carriers.find((c) => c.carrierCode === carrierCode)
}

export function useLocations(activeOnly = false): { data: WarehouseLocation[] } {
  const { locations } = useContext(ConfigContext)
  const data = useMemo(() => locations.filter((l) => !activeOnly || l.active), [locations, activeOnly])
  return { data }
}

export function useLocationMap(): Map<string, WarehouseLocation> {
  const { locations } = useContext(ConfigContext)
  return useMemo(() => new Map(locations.map((l) => [l.locationId, l])), [locations])
}
