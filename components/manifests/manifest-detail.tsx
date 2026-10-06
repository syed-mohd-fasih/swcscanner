"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { ItemStatus } from "@/components/items/status-badges"
import { LocationBadge } from "@/components/locations/location-selector"
import { ManifestProgress } from "@/components/manifests/manifest-progress"
import { useSession } from "@/components/providers/session-provider"
import { useLocationMap } from "@/components/release/release-workspace"
import { DataTable, toggleInSet, type Column } from "@/components/shared/data-table"
import { InfoList } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, FilterBar, matchesSearch, SearchBar } from "@/components/shared/search-filter"
import { EmptyState, Ltr, LoadingState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RECEIVING_STATES, RELEASE_STATES, type Item } from "@/domain/items/types"
import { summarizeManifest } from "@/domain/manifests/rules"
import { useLocalQuery } from "@/hooks/use-local-query"
import { fmt, useI18n } from "@/lib/i18n/client"
import { itemRepository, manifestRepository } from "@/repositories/indexeddb"
import { deleteExpectedPieces } from "@/services/manifests"
import { adminPull } from "@/sync/pull"

/** Manifest = grouping + aggregate view; items keep their own lifecycle. */
export function ManifestDetail({ manifestId }: { manifestId: string }) {
  const { t } = useI18n()
  const { ready } = useSession()
  const router = useRouter()
  const confirm = useConfirm()
  const locations = useLocationMap()
  const [query, setQuery] = useState("")
  const [receiving, setReceiving] = useState(ALL)
  const [release, setRelease] = useState(ALL)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!ready) return
    adminPull.manifests().catch(() => {})
    adminPull.manifestItems(manifestId).catch(() => {})
  }, [ready, manifestId])

  const manifest = useLocalQuery(() => manifestRepository.get(manifestId), [manifestId])
  const { data: items = [] } = useLocalQuery(() => itemRepository.listByManifest(manifestId), [manifestId])
  const summary = useMemo(() => summarizeManifest(items), [items])

  const rows = useMemo(
    () =>
      items
        .filter((i) => receiving === ALL || i.receivingState === receiving)
        .filter((i) => release === ALL || i.releaseState === release)
        .filter((i) => matchesSearch(query, i.itemId, i.shipper, i.consignee, i.description))
        .sort((a, b) => a.itemId.localeCompare(b.itemId) || a.pieceNumber - b.pieceNumber),
    [items, receiving, release, query]
  )
  const byId = useMemo(() => new Map(items.map((i) => [i.internalItemId, i])), [items])

  if (manifest.loading) return <LoadingState />
  if (!manifest.data) return <EmptyState />
  const m = manifest.data

  const columns: Column<Item>[] = [
    { key: "itemId", header: t.fields.itemId, cell: (i) => <Ltr className="font-medium">{i.itemId}</Ltr> },
    { key: "piece", header: t.fields.piece, cell: (i) => <Ltr>{i.pieceNumber}/{i.pieceTotal}</Ltr> },
    { key: "consignee", header: t.fields.consignee, cell: (i) => (i.consignee ? <Ltr>{i.consignee}</Ltr> : "—"), hideOnMobile: true },
    { key: "status", header: t.fields.status, cell: (i) => <ItemStatus item={i} /> },
    {
      key: "location",
      header: t.fields.location,
      cell: (i) => (i.locationId ? <LocationBadge location={locations.get(i.locationId)} /> : "—"),
    },
  ]

  async function deleteSelected() {
    const ids = [...selected]
    if (!(await confirm({ description: fmt(t.manifests.confirmDelete, { n: ids.length }), destructive: true, irreversible: true }))) return
    const result = await deleteExpectedPieces(ids)
    if (!result.ok) return void toast.error(result.error.message)
    setSelected(new Set())
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={m.manifestName} />
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t.manifests.header}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoList
              rows={[
                { label: t.fields.carrier, value: <Ltr>{m.carrierCode}</Ltr> },
                { label: t.fields.manifestDate, value: <Ltr>{m.date}</Ltr> },
                { label: t.fields.truckId, value: m.truckId && <Ltr>{m.truckId}</Ltr> },
                { label: t.fields.notes, value: m.notes },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.manifests.progress}</CardTitle>
          </CardHeader>
          <CardContent>
            <ManifestProgress summary={summary} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchBar value={query} onChange={setQuery} />
        <FilterBar
          filters={[
            {
              key: "receiving",
              label: t.fields.status,
              value: receiving,
              onChange: setReceiving,
              options: RECEIVING_STATES.map((s) => ({ value: s, label: t.states.receiving[s] })),
            },
            {
              key: "release",
              label: t.release.title,
              value: release,
              onChange: setRelease,
              options: RELEASE_STATES.map((s) => ({ value: s, label: t.states.release[s] })),
            },
          ]}
        />
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm">{fmt(t.outcomes.selected, { n: selected.size })}</span>
          <Button variant="destructive" size="sm" onClick={() => void deleteSelected()}>
            {t.manifests.deleteUnreceived}
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(i) => i.internalItemId}
        onRowClick={(i) => router.push(`/items/${i.internalItemId}`)}
        selection={{
          selected,
          onToggle: (k) => setSelected((s) => toggleInSet(s, k)),
          onToggleAll: (keys) => setSelected((s) => (keys.every((k) => s.has(k)) ? new Set() : new Set(keys))),
          // only never-received pieces may be deleted
          isSelectable: (k) => byId.get(k)?.receivingState === "expected",
        }}
      />
    </div>
  )
}
