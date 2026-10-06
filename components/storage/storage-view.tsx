"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ItemStatus } from "@/components/items/status-badges"
import { LocationSelector, useActiveLocations } from "@/components/locations/location-selector"
import { useSession } from "@/components/providers/session-provider"
import { DataTable, toggleInSet, type Column } from "@/components/shared/data-table"
import { useCarriers } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, FilterBar, matchesSearch, SearchBar } from "@/components/shared/search-filter"
import { EmptyState, Ltr, LoadingState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { Item } from "@/domain/items/types"
import { formatLocation } from "@/domain/locations/types"
import { useLocalQuery } from "@/hooks/use-local-query"
import { useWorkspacePull } from "@/hooks/use-workspace-pull"
import { fmt, useI18n } from "@/lib/i18n/client"
import { listAwaitingStorage, storePieces } from "@/services/storage"
import { pullStorageWorkspace } from "@/sync/pull"

/**
 * The store step, separate from receiving: operators put received pieces
 * away, then record where. Pick pieces from the list, choose one location.
 */
export function StorageView() {
  const { t } = useI18n()
  const { ready, user } = useSession()
  const confirm = useConfirm()
  const carriers = useCarriers(false).data ?? []
  const locations = useActiveLocations().data ?? []
  const [query, setQuery] = useState("")
  const [carrier, setCarrier] = useState(ALL)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [locationId, setLocationId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pulling = useWorkspacePull(ready ? "storage" : null, () => pullStorageWorkspace(), {
    refreshMs: 60_000,
  })
  const { data, loading } = useLocalQuery(() => listAwaitingStorage(), [])

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((i) => carrier === ALL || i.carrierCode === carrier)
        .filter((i) => matchesSearch(query, i.itemId, i.shipper, i.consignee, i.description))
        .sort(
          (a, b) =>
            (a.receivedAt ?? "").localeCompare(b.receivedAt ?? "") ||
            a.itemId.localeCompare(b.itemId) ||
            a.pieceNumber - b.pieceNumber
        ),
    [data, carrier, query]
  )

  const columns: Column<Item>[] = [
    { key: "itemId", header: t.fields.itemId, cell: (i) => <Ltr className="font-medium">{i.itemId}</Ltr> },
    { key: "piece", header: t.fields.piece, cell: (i) => <Ltr>{i.pieceNumber}/{i.pieceTotal}</Ltr> },
    { key: "carrier", header: t.fields.carrier, cell: (i) => <Ltr>{i.carrierCode}</Ltr> },
    { key: "consignee", header: t.fields.consignee, cell: (i) => (i.consignee ? <Ltr>{i.consignee}</Ltr> : "—"), hideOnMobile: true },
    { key: "date", header: t.fields.dateOfReceival, cell: (i) => <Ltr>{i.dateOfReceival ?? "—"}</Ltr> },
    { key: "status", header: t.fields.status, cell: (i) => <ItemStatus item={i} />, hideOnMobile: true },
  ]

  async function store() {
    const location = locations.find((l) => l.locationId === locationId)
    if (!location || selected.size === 0) return
    const ok = await confirm({
      description: fmt(t.storage.confirmText, { n: selected.size, location: formatLocation(location) }),
    })
    if (!ok) return
    setBusy(true)
    const result = await storePieces([...selected], location.locationId, user.uid)
    setBusy(false)
    if (!result.ok) return void toast.error(result.error.message)
    toast.success(t.storage.stored)
    setSelected(new Set())
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.storage.title} description={t.storage.help} />

      <Card className="sticky top-16 z-10">
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 text-sm font-medium">{t.storage.chooseLocation}</p>
            <LocationSelector value={locationId} onChange={setLocationId} />
          </div>
          <div className="flex items-center justify-between gap-3 md:justify-end">
            <span className="text-sm text-muted-foreground">{fmt(t.storage.selected, { n: selected.size })}</span>
            <Button size="lg" className="h-11" disabled={!locationId || selected.size === 0 || busy} onClick={() => void store()}>
              {t.storage.store}
            </Button>
          </div>
        </CardContent>
      </Card>

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

      {loading || (pulling && rows.length === 0) ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(i) => i.internalItemId}
          onRowClick={(i) => setSelected((s) => toggleInSet(s, i.internalItemId))}
          empty={<EmptyState title={t.storage.empty} />}
          selection={{
            selected,
            onToggle: (k) => setSelected((s) => toggleInSet(s, k)),
            onToggleAll: (keys) => setSelected((s) => (keys.every((k) => s.has(k)) ? new Set() : new Set(keys))),
          }}
        />
      )}
    </div>
  )
}
