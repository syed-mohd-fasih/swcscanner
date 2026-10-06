/**
 * Predefined storage location: Warehouse → Rack (lettered) → Position
 * (the number printed on the rack). Displayed as "WH1 / A-12".
 */
export type WarehouseLocation = {
  locationId: string
  /** warehouse code, e.g. "WH1" */
  warehouse: string
  /** rack/shelf letter, e.g. "A" */
  rack: string
  /** position number on the rack, as printed, e.g. "12" */
  position: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export function formatLocation(loc: Pick<WarehouseLocation, "warehouse" | "rack" | "position">): string {
  return `${loc.warehouse} / ${loc.rack}-${loc.position}`
}

export function locationIdFor(warehouse: string, rack: string, position: string): string {
  return `${warehouse}-${rack}-${position}`.toUpperCase()
}

export const WAREHOUSE_CODE = /^[A-Z0-9]{1,8}$/
export const RACK_LETTER = /^[A-Z]{1,2}$/
export const POSITION_NUMBER = /^\d{1,4}$/
