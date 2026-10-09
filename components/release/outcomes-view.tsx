"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { assignOutcomeAction } from "@/app/actions/admin"

import { ItemStatus } from "@/components/items/status-badges"
import { LocationBadge } from "@/components/locations/location-selector"
import { useLocationMap } from "@/components/providers/config-provider"
import { DataTable, toggleInSet, type Column } from "@/components/shared/data-table"
import { DateInput, Field, useCarriers } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, FilterBar, matchesSearch, SearchBar } from "@/components/shared/search-filter"
import { EmptyState, Ltr } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { Item, ReleaseOutcome } from "@/domain/items/types"
import { todayBusinessDate } from "@/domain/shared/dates"
import { newId } from "@/domain/shared/ids"
import { fmt, useI18n } from "@/lib/i18n/client"
import { callAction } from "@/lib/submit-op"

/**
 * Admin decides the final outcome for pieces operators physically
 * release-scanned. Bulk selection; the release date is shown in the confirm.
 */
export function OutcomesView({ items, manifestNames }: { items: Item[]; manifestNames: Record<string, string> }) {
  const { t } = useI18n()
  const router = useRouter()
  const confirm = useConfirm()
  const locations = useLocationMap()
  const carriers = useCarriers(false).data ?? []
  const [query, setQuery] = useState("")
  const [carrier, setCarrier] = useState(ALL)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [date, setDate] = useState(todayBusinessDate())
  const [busy, setBusy] = useState(false)


  const rows = useMemo(
    () =>
      items
        .filter((i) => carrier === ALL || i.carrierCode === carrier)
        .filter((i) => matchesSearch(query, i.itemId, i.shipper, i.consignee, manifestNames[i.manifestId ?? ""]))
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
      cell: (i) => (i.manifestId ? <Ltr>{manifestNames[i.manifestId] ?? "…"}</Ltr> : t.states.noManifest),
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
    const done = await callAction(
      t,
      () =>
        assignOutcomeAction({
          opId: newId(),
          internalItemIds: ids,
          outcome,
          dateOfRelease: date,
          overrideIdentify: unidentified.length > 0,
        }),
      t.outcomes.done
    )
    setBusy(false)
    if (!done) return
    setSelected(new Set())
    router.refresh()
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
            <Button variant="success" disabled={selected.size === 0 || busy || !date} onClick={() => void apply("released")}>
              {t.outcomes.markReleased}
            </Button>
            <Button variant="warning" disabled={selected.size === 0 || busy || !date} onClick={() => void apply("repossessed")}>
              {t.outcomes.markRepossessed}
            </Button>
            <Button variant="destructive" disabled={selected.size === 0 || busy || !date} onClick={() => void apply("seized")}>
              {t.outcomes.markSeized}
            </Button>
          </div>
        </CardContent>
      </Card>

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
    </div>
  )
}
