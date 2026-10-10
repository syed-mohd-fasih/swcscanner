"use client"

import { MapPinIcon } from "lucide-react"
import { useMemo } from "react"

import { Callout } from "@/components/shared/callout"
import { Ltr } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { WheelPicker, WheelPickerWrapper, type WheelPickerOption } from "@/components/ui/wheel-picker"
import { formatLocation, type WarehouseLocation } from "@/domain/locations/types"
import { useI18n } from "@/lib/i18n/client"
import { useLocations } from "@/components/providers/config-provider"

export function useActiveLocations() {
  return useLocations(true)
}

const sortNatural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true })
const options = (values: Iterable<string>): WheelPickerOption[] =>
  [...values].sort(sortNatural).map((v) => ({ value: v, label: v }))

/**
 * Warehouse → Rack → Position on three wheels, only from the predefined
 * dataset (operators cannot invent locations). A wheel always shows a
 * value, so a full location is always chosen: changing the warehouse or
 * rack keeps the rack/position when it exists there, else takes the first.
 */
export function LocationSelector({
  value,
  onChange,
}: {
  value: string | null
  onChange: (locationId: string | null) => void
}) {
  const { t } = useI18n()
  const { data: locations } = useActiveLocations()
  const tree = useMemo(() => buildTree(locations), [locations])
  const current = locations.find((l) => l.locationId === value) ?? locations[0]

  if (!current) return <Callout tone="warning">{t.locations.none}</Callout>
  const racks = tree.get(current.warehouse)!
  const positions = racks.get(current.rack)!

  const pick = (w: string, r: string, p: string) => {
    const wRacks = tree.get(w)
    if (!wRacks) return
    const rack = wRacks.has(r) ? r : [...wRacks.keys()].sort(sortNatural)[0]
    const pos = wRacks.get(rack)!
    const position = pos.has(p) ? p : [...pos.keys()].sort(sortNatural)[0]
    onChange(pos.get(position)!.locationId)
  }

  return (
    <div className="flex flex-col gap-1.5" dir="ltr">
      <div className="grid grid-cols-3 px-1 text-center text-xs font-medium text-muted-foreground">
        <span>{t.fields.warehouse}</span>
        <span>{t.fields.rack}</span>
        <span>{t.fields.position}</span>
      </div>
      <WheelPickerWrapper>
        <WheelPicker
          options={options(tree.keys())}
          value={current.warehouse}
          onValueChange={(w) => pick(w, current.rack, current.position)}
          optionItemHeight={40}
          visibleCount={12}
        />
        <WheelPicker
          options={options(racks.keys())}
          value={current.rack}
          onValueChange={(r) => pick(current.warehouse, r, current.position)}
          optionItemHeight={40}
          visibleCount={12}
        />
        <WheelPicker
          options={options(positions.keys())}
          value={current.position}
          onValueChange={(p) => pick(current.warehouse, current.rack, p)}
          optionItemHeight={40}
          visibleCount={12}
        />
      </WheelPickerWrapper>
    </div>
  )
}

/** warehouse → rack → position → location */
function buildTree(locations: WarehouseLocation[]) {
  const tree = new Map<string, Map<string, Map<string, WarehouseLocation>>>()
  for (const l of locations) {
    const racks = tree.get(l.warehouse) ?? new Map<string, Map<string, WarehouseLocation>>()
    const positions = racks.get(l.rack) ?? new Map<string, WarehouseLocation>()
    positions.set(l.position, l)
    racks.set(l.rack, positions)
    tree.set(l.warehouse, racks)
  }
  return tree
}

export function LocationBadge({ location }: { location: WarehouseLocation | undefined | null }) {
  if (!location) return null
  return (
    <Badge variant="accent" className="gap-1">
      <MapPinIcon className="size-3" />
      <Ltr>{formatLocation(location)}</Ltr>
    </Badge>
  )
}
