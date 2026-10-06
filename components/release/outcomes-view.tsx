"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { ItemStatus } from "@/components/items/status-badges"
import { LocationBadge } from "@/components/locations/location-selector"
import { useSession } from "@/components/providers/session-provider"
import { useLocationMap } from "@/components/release/release-workspace"
import { DataTable, toggleInSet, type Column } from "@/components/shared/data-table"
import { DateInput, Field, useCarriers } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, FilterBar, matchesSearch, SearchBar } from "@/components/shared/search-filter"
import { EmptyState, Ltr, LoadingState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { Item, ReleaseOutcome } from "@/domain/items/types"
import { todayBusinessDate } from "@/domain/shared/dates"
import { useLocalQuery } from "@/hooks/use-local-query"
import { fmt, useI18n } from "@/lib/i18n/client"
import { itemRepository, manifestRepository } from "@/repositories/indexeddb"
import { assignReleaseOutcome } from "@/services/release"
import { adminPull } from "@/sync/pull"

/**
 * Admin decides the final outcome for pieces operators physically
 * release-scanned. Bulk selection; the release date is shown in the confirm.
 */
export function OutcomesView() {
  const { t } = useI18n()
  const { ready, user, sync } = useSession()
  const confirm = useConfirm()
  const locations = useLocationMap()
  const carriers = useCarriers(false).data ?? []
  const [query, setQuery] = useState("")
  const [carrier, setCarrier] = useState(ALL)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [date, setDate] = useState(todayBusinessDate())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (ready) adminPull.releaseScanned().catch(() => {})
  }, [ready])

  const { data: items = [], loading } = useLocalQuery(() => itemRepository.listByReleaseState("release_scanned"), [])
  const manifestNames = useLocalQuery(async () => new Map((await manifestRepository.all()).map((m) => [m.manifestId, m.manifestName])), []).data

  const rows = useMemo(
    () =>
      items
        .filter((i) => carrier === ALL || i.carrierCode === carrier)
        .filter((i) => matchesSearch(query, i.itemId, i.shipper, i.consignee, manifestNames?.get(i.manifestId ?? "")))
        .sort((a, b) => (a.manifestId ?? "~").localeCompare(b.manifestId ?? "~") || a.itemId.localeCompare(b.itemId) || a.pieceNumber - b.pieceNumber),
    [items, carrier, query, manifestNames]
  )
  const selectedItems = items.filter((i) => selected.has(i.internalItemId))

  const columns: Column<Item>[] = [
    { key: "itemId", header: t.fields.itemId, cell: (i) => <Ltr className="font-medium">{i.itemId}</Ltr> },
    { key: "piece", header: t.fields.piece, cell: (i) => <Ltr>{i.pieceNumber}/{i.pieceTotal}</Ltr> },
    {
      key: "manifest",
      header: t.states.manifest,
      cell: (i) => (i.manifestId ? <Ltr>{manifestNames?.get(i.manifestId) ?? "…"}</Ltr> : t.states.noManifest),
    },
    { key: "status", header: t.fields.status, cell: (i) => <ItemStatus item={i} /> },
    {
      key: "location",
      header: t.fields.location,
      cell: (i) => (i.locationId ? <LocationBadge location={locations.get(i.locationId)} /> : "—"),
      hideOnMobile: true,
    },
  ]

  async function apply(outcome: ReleaseOutcome) {
    const ids = [...selected]
    const outcomeLabel = t.states.release[outcome]
    const details = (
      <p>
        {t.outcomes.releaseDate}: <Ltr className="font-semibold">{date}</Ltr>
      </p>
    )
    const ok = await confirm({
      description: fmt(t.outcomes.confirmText, { n: ids.length, outcome: outcomeLabel }),
      details,
      confirmLabel: outcomeLabel,
      destructive: outcome !== "released",
    })
    if (!ok) return

    const unidentified = selectedItems.filter((i) => i.receivingState === "unidentified")
    if (unidentified.length > 0) {
      const override = await confirm({
        title: t.outcomes.unidentifiedTitle,
        description: fmt(t.outcomes.unidentifiedText, { n: unidentified.length }),
        details,
        confirmLabel: t.outcomes.markIdentifiedAndRelease,
        irreversible: true,
      })
      if (!override) return
    }

    setBusy(true)
    const result = await assignReleaseOutcome(ids, outcome, date, unidentified.length > 0, user.uid)
    setBusy(false)
    if (!result.ok) return void toast.error(result.error.message)
    setSelected(new Set())
    void sync.flush()
    toast.success(t.outcomes.done)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.outcomes.title} description={t.outcomes.help} />
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

      <Card className="sticky top-16 z-10">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-end">
          <Field label={t.outcomes.releaseDate} htmlFor="release-date" className="sm:w-48">
            <DateInput id="release-date" value={date} onChange={setDate} />
          </Field>
          <span className="text-sm text-muted-foreground sm:mb-3">{fmt(t.outcomes.selected, { n: selected.size })}</span>
          <div className="grid grid-cols-3 gap-2 sm:ms-auto sm:flex">
            <Button disabled={selected.size === 0 || busy || !date} onClick={() => void apply("released")}>
              {t.outcomes.markReleased}
            </Button>
            <Button variant="secondary" disabled={selected.size === 0 || busy || !date} onClick={() => void apply("repossessed")}>
              {t.outcomes.markRepossessed}
            </Button>
            <Button variant="destructive" disabled={selected.size === 0 || busy || !date} onClick={() => void apply("seized")}>
              {t.outcomes.markSeized}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(i) => i.internalItemId}
          empty={<EmptyState title={t.outcomes.empty} />}
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
