"use client"

import { MapPinIcon, RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { LocationSelector, useActiveLocations } from "@/components/locations/location-selector"
import { useCarriers } from "@/components/providers/config-provider"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, FilterBar, matchesSearch, SearchBar } from "@/components/shared/search-filter"
import { EmptyState, Ltr } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { Item } from "@/domain/items/types"
import { formatLocation, type WarehouseLocation } from "@/domain/locations/types"
import { fmt, useI18n } from "@/lib/i18n/client"
import { submitOp } from "@/lib/submit-op"
import { cn } from "@/lib/utils"

type Group = { key: string; itemId: string; carrierCode: string; first: Item; pieces: Item[] }

const RECENT_KEY = "swc:recent-locations"

/**
 * The store step, separate from receiving: operators put received pieces
 * away, then record where. Pieces are grouped by shipment; one location for
 * the selection, chosen in a bottom sheet with the last racks used.
 */
export function StorageView({ items: initial, hasMore }: { items: Item[]; hasMore: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const { data: carriers } = useCarriers(false)
  const { data: locations } = useActiveLocations()
  const [items, setItems] = useState(initial)
  const [source, setSource] = useState(initial)
  if (source !== initial) {
    // fresh server data (refresh) replaces the locally trimmed list
    setSource(initial)
    setItems(initial)
  }
  const [query, setQuery] = useState("")
  const [carrier, setCarrier] = useState(ALL)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sheetOpen, setSheetOpen] = useState(false)

  const groups = useMemo(() => {
    const map = new Map<string, Group>()
    for (const i of items) {
      if (carrier !== ALL && i.carrierCode !== carrier) continue
      if (!matchesSearch(query, i.itemId, i.shipper, i.consignee, i.description)) continue
      const key = `${i.manifestId ?? "u"}|${i.carrierCode}|${i.itemId}`
      const g = map.get(key) ?? { key, itemId: i.itemId, carrierCode: i.carrierCode, first: i, pieces: [] }
      g.pieces.push(i)
      map.set(key, g)
    }
    return [...map.values()]
  }, [items, carrier, query])

  const toggle = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  async function store(location: WarehouseLocation) {
    const ids = [...selected]
    const outcome = await submitOp(
      t,
      "storeAt",
      { internalItemIds: ids, locationId: location.locationId },
      `${ids.length} → ${formatLocation(location)}`,
      t.storage.stored
    )
    if (outcome.status === "failed") return
    rememberLocation(location.locationId)
    setItems((list) => list.filter((i) => !selected.has(i.internalItemId)))
    setSelected(new Set())
    setSheetOpen(false)
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      <PageHeader
        title={t.storage.title}
        description={t.storage.help}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            <RefreshCwIcon />
            {t.app.refresh}
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchBar value={query} onChange={setQuery} />
        <FilterBar
          filters={[
            {
              key: "carrier",
              label: t.fields.carrier,
              value: carrier,
              onChange: setCarrier,
              options: carriers.map((c) => ({ value: c.carrierCode, label: c.name })),
            },
          ]}
        />
      </div>

      {groups.length === 0 ? (
        <EmptyState title={t.storage.empty} />
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => {
            const ids = g.pieces.map((p) => p.internalItemId)
            const all = ids.every((id) => selected.has(id))
            return (
              <li key={g.key} className="rounded-2xl border p-3">
                <label className="flex items-start gap-3">
                  <Checkbox
                    className="mt-0.5 size-5"
                    checked={all}
                    onCheckedChange={(c) => toggle(ids, c === true)}
                    aria-label={t.storage.selectGroup}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2">
                      <Ltr className="truncate font-semibold">{g.itemId}</Ltr>
                      <Ltr className="shrink-0 text-xs text-muted-foreground">
                        {g.carrierCode} · {g.first.dateOfReceival}
                      </Ltr>
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {[g.first.consignee, g.first.description].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                </label>
                <div className="mt-2 flex flex-wrap gap-2 ps-8">
                  {g.pieces.map((p) => {
                    const on = selected.has(p.internalItemId)
                    return (
                      <button
                        key={p.internalItemId}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle([p.internalItemId], !on)}
                        className={cn(
                          "min-h-10 min-w-14 rounded-xl border px-3 text-sm font-medium tabular-nums",
                          on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                        )}
                      >
                        <Ltr>
                          {p.pieceNumber}/{p.pieceTotal}
                        </Ltr>
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {hasMore && <p className="text-center text-sm text-muted-foreground">{fmt(t.storage.hasMore, { n: initial.length })}</p>}

      {/* sticky action bar, above the phone bottom tabs */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-16 z-20 border-t bg-background/95 px-3 py-3 backdrop-blur transition md:bottom-0 md:ps-[calc(var(--sidebar-width)+0.75rem)]",
          selected.size === 0 && "pointer-events-none translate-y-4 opacity-0"
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <span className="text-sm font-medium">{fmt(t.storage.selected, { n: selected.size })}</span>
          <Button size="lg" className="h-12" onClick={() => setSheetOpen(true)}>
            <MapPinIcon />
            {t.storage.chooseLocation}
          </Button>
        </div>
      </div>

      <LocationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        count={selected.size}
        locations={locations}
        onStore={store}
      />
    </div>
  )
}

function LocationSheet({
  open,
  onOpenChange,
  count,
  locations,
  onStore,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  locations: WarehouseLocation[]
  onStore: (location: WarehouseLocation) => Promise<void>
}) {
  const { t } = useI18n()
  const [locationId, setLocationId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const recent = recentLocations()
    .map((id) => locations.find((l) => l.locationId === id))
    .filter((l): l is WarehouseLocation => !!l)
  const location = locations.find((l) => l.locationId === locationId)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>{t.storage.chooseLocation}</SheetTitle>
          <SheetDescription>{fmt(t.storage.selected, { n: count })}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {recent.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t.storage.recentLocations}</p>
              <div className="flex flex-wrap gap-2">
                {recent.map((l) => (
                  <Button
                    key={l.locationId}
                    variant={l.locationId === locationId ? "default" : "outline"}
                    className="h-11"
                    onClick={() => setLocationId(l.locationId)}
                  >
                    <Ltr>{formatLocation(l)}</Ltr>
                  </Button>
                ))}
              </div>
            </div>
          )}
          <LocationSelector value={locationId} onChange={setLocationId} />
          <Button
            size="lg"
            className="h-12"
            disabled={!location || count === 0 || busy}
            onClick={async () => {
              if (!location) return
              setBusy(true)
              await onStore(location)
              setBusy(false)
            }}
          >
            {location ? (
              <>
                {fmt(t.storage.storeN, { n: count })} · <Ltr>{formatLocation(location)}</Ltr>
              </>
            ) : (
              t.storage.store
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function recentLocations(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]
  } catch {
    return []
  }
}

function rememberLocation(locationId: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([locationId, ...recentLocations().filter((x) => x !== locationId)].slice(0, 5)))
  } catch {
    // storage unavailable
  }
}
