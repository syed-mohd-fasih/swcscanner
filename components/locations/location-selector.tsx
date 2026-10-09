"use client"

import { MapPinIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Ltr } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatLocation, type WarehouseLocation } from "@/domain/locations/types"
import { useI18n } from "@/lib/i18n/client"
import { useLocations } from "@/components/providers/config-provider"

export function useActiveLocations() {
  return useLocations(true)
}

const sortNatural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true })

/**
 * Warehouse → Shelf → Position, only from the predefined (synced) dataset.
 * No free text — operators cannot invent locations.
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
  const current = locations.find((l) => l.locationId === value)
  // partial choice (warehouse/rack) is local; `value` is only set once a
  // full predefined location is chosen
  const [partial, setPartial] = useState<{ w?: string; s?: string }>({})
  const warehouse = current?.warehouse ?? partial.w
  const rack = current?.rack ?? partial.s
  const tree = useMemo(() => buildTree(locations), [locations])

  const pick = (w: string, s?: string, p?: string) => {
    setPartial({ w, s })
    const match = p
      ? locations.find((l) => l.warehouse === w && l.rack === s && l.position === p)
      : undefined
    onChange(match?.locationId ?? null)
  }

  return (
    <div className="grid grid-cols-3 gap-2" dir="ltr">
      <Field label={t.fields.warehouse}>
        <Select value={warehouse ?? ""} onValueChange={(w) => pick(w)}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {[...tree.keys()].sort(sortNatural).map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t.fields.rack}>
        <Select
          value={rack ?? ""}
          disabled={!warehouse}
          onValueChange={(s) => warehouse && pick(warehouse, s)}
        >
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {[...(tree.get(warehouse ?? "")?.keys() ?? [])].sort(sortNatural).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t.fields.position}>
        <Select
          value={current?.position ?? ""}
          disabled={!rack}
          onValueChange={(p) => warehouse && rack && pick(warehouse, rack, p)}
        >
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {[...(tree.get(warehouse ?? "")?.get(rack ?? "") ?? [])].sort(sortNatural).map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function buildTree(locations: WarehouseLocation[]) {
  const tree = new Map<string, Map<string, string[]>>()
  for (const l of locations) {
    const shelves = tree.get(l.warehouse) ?? new Map<string, string[]>()
    const positions = shelves.get(l.rack) ?? []
    positions.push(l.position)
    shelves.set(l.rack, positions)
    tree.set(l.warehouse, shelves)
  }
  return tree
}

export function LocationBadge({ location }: { location: WarehouseLocation | undefined | null }) {
  if (!location) return null
  return (
    <Badge variant="outline" className="gap-1">
      <MapPinIcon className="size-3" />
      <Ltr>{formatLocation(location)}</Ltr>
    </Badge>
  )
}
