"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { ItemStatus } from "@/components/items/status-badges"
import { LocationBadge } from "@/components/locations/location-selector"
import { useSession } from "@/components/providers/session-provider"
import { useLocationMap } from "@/components/release/release-workspace"
import { DataTable, type Column } from "@/components/shared/data-table"
import { Field, InfoList, useCarriers } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, FilterBar, matchesSearch, SearchBar } from "@/components/shared/search-filter"
import { EmptyState, Ltr, LoadingState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { INVESTIGATION_STATUSES, type InvestigationStatus, type Item } from "@/domain/items/types"
import { useLocalQuery } from "@/hooks/use-local-query"
import { fmt, useI18n } from "@/lib/i18n/client"
import { itemRepository } from "@/repositories/indexeddb"
import { mergeIntoExpected, updateInvestigation } from "@/services/unidentified"
import { adminPull, pullReceivingWorkspace } from "@/sync/pull"

/** Unidentified inventory stays here, searchable, until investigated/resolved. */
export function UnidentifiedView() {
  const { t } = useI18n()
  const { ready, isAdmin } = useSession()
  const router = useRouter()
  const locations = useLocationMap()
  const carriers = useCarriers(false).data ?? []
  const [query, setQuery] = useState("")
  const [carrier, setCarrier] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [active, setActive] = useState<Item | null>(null)
  const [pulling, setPulling] = useState(true)

  useEffect(() => {
    if (!ready) return
    adminPull
      .unidentified()
      .catch(() => {})
      .finally(() => setPulling(false))
  }, [ready])

  const { data: items = [], loading } = useLocalQuery(() => itemRepository.listByReceivingState("unidentified"), [])

  const rows = useMemo(
    () =>
      items
        .filter((i) => carrier === ALL || i.carrierCode === carrier)
        .filter((i) => status === ALL || i.investigation?.status === status)
        .filter((i) => matchesSearch(query, i.itemId, i.shipper, i.consignee, i.description, i.locationId))
        .sort((a, b) => (b.dateOfReceival ?? "").localeCompare(a.dateOfReceival ?? "") || a.itemId.localeCompare(b.itemId)),
    [items, carrier, status, query]
  )

  const columns: Column<Item>[] = [
    { key: "itemId", header: t.fields.itemId, cell: (i) => <Ltr className="font-medium">{i.itemId}</Ltr> },
    { key: "piece", header: t.fields.piece, cell: (i) => <Ltr>{i.pieceNumber}/{i.pieceTotal}</Ltr> },
    { key: "carrier", header: t.fields.carrier, cell: (i) => <Ltr>{i.carrierCode}</Ltr> },
    { key: "shipper", header: t.fields.shipper, cell: (i) => (i.shipper ? <Ltr>{i.shipper}</Ltr> : "—"), hideOnMobile: true },
    { key: "date", header: t.fields.dateOfReceival, cell: (i) => <Ltr>{i.dateOfReceival ?? "—"}</Ltr> },
    {
      key: "location",
      header: t.fields.location,
      cell: (i) => (i.locationId ? <LocationBadge location={locations.get(i.locationId)} /> : <ItemStatus item={i} />),
    },
    {
      key: "investigation",
      header: t.fields.investigation,
      cell: (i) => (i.investigation ? t.states.investigation[i.investigation.status] : "—"),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.unidentified.title} description={t.unidentified.help} />
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
            {
              key: "status",
              label: t.fields.investigation,
              value: status,
              onChange: setStatus,
              options: INVESTIGATION_STATUSES.map((s) => ({ value: s, label: t.states.investigation[s] })),
            },
          ]}
        />
      </div>
      {loading || (pulling && items.length === 0) ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(i) => i.internalItemId}
          onRowClick={(i) => (isAdmin ? setActive(i) : router.push(`/items/${i.internalItemId}`))}
          empty={<EmptyState />}
        />
      )}
      {active && <UnidentifiedAdminDialog item={active} onClose={() => setActive(null)} />}
    </div>
  )
}

/** Admin: investigation notes and matching to a manifest piece. */
function UnidentifiedAdminDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { t } = useI18n()
  const { user } = useSession()
  const confirm = useConfirm()
  const router = useRouter()
  const [status, setStatus] = useState<InvestigationStatus>(item.investigation?.status ?? "open")
  const [note, setNote] = useState(item.investigation?.note ?? "")
  const [mergeQuery, setMergeQuery] = useState(item.itemId)

  useEffect(() => {
    // bring this carrier's expected pieces onto the device for matching
    pullReceivingWorkspace(item.carrierCode, true).catch(() => {})
  }, [item.carrierCode])

  const expected =
    useLocalQuery(() => itemRepository.listByReceivingState("expected"), []).data?.filter(
      (e) => e.carrierCode === item.carrierCode && matchesSearch(mergeQuery, e.itemId, e.shipper, e.consignee)
    ) ?? []

  async function saveInvestigation() {
    if (!(await confirm({}))) return
    const result = await updateInvestigation(item.internalItemId, status, note.trim() || null, user.uid)
    if (!result.ok) return void toast.error(result.error.message)
    toast.success(t.items.corrected)
    onClose()
  }

  async function merge(target: Item) {
    const ok = await confirm({
      description: fmt(t.unidentified.mergeConfirm, { itemId: target.itemId, piece: `${target.pieceNumber}/${target.pieceTotal}` }),
      irreversible: true,
    })
    if (!ok) return
    const result = await mergeIntoExpected(item.internalItemId, target.internalItemId, user.uid)
    if (!result.ok) return void toast.error(result.error.message)
    toast.success(t.unidentified.merged)
    onClose()
    router.push(`/items/${target.internalItemId}`)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-1.5rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <Ltr>{item.itemId}</Ltr> <Ltr className="text-muted-foreground">{item.pieceNumber}/{item.pieceTotal}</Ltr>
          </DialogTitle>
          <DialogDescription>{t.unidentified.help}</DialogDescription>
        </DialogHeader>
        <InfoList
          rows={[
            { label: t.fields.carrier, value: <Ltr>{item.carrierCode}</Ltr> },
            { label: t.fields.shipper, value: item.shipper && <Ltr>{item.shipper}</Ltr> },
            { label: t.fields.consignee, value: item.consignee && <Ltr>{item.consignee}</Ltr> },
            { label: t.fields.dateOfReceival, value: <Ltr>{item.dateOfReceival}</Ltr> },
          ]}
        />
        <Button variant="link" className="justify-start px-0" onClick={() => router.push(`/items/${item.internalItemId}`)}>
          {t.app.open}
        </Button>

        <section className="flex flex-col gap-3 rounded-2xl border p-3">
          <h3 className="font-medium">{t.unidentified.setStatus}</h3>
          <Field label={t.fields.status}>
            <Select value={status} onValueChange={(v) => setStatus(v as InvestigationStatus)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVESTIGATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t.states.investigation[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t.fields.note} htmlFor="inv-note">
            <Textarea id="inv-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button onClick={() => void saveInvestigation()}>{t.app.save}</Button>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border p-3">
          <h3 className="font-medium">{t.unidentified.merge}</h3>
          <p className="text-sm text-muted-foreground">{t.unidentified.mergeHelp}</p>
          <SearchBar value={mergeQuery} onChange={setMergeQuery} />
          <ul className="flex max-h-72 flex-col divide-y overflow-y-auto">
            {expected.slice(0, 50).map((e) => (
              <li key={e.internalItemId} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <Ltr className="font-medium">{e.itemId}</Ltr> <Ltr className="text-muted-foreground">{e.pieceNumber}/{e.pieceTotal}</Ltr>
                  <span className="block truncate text-muted-foreground">
                    <Ltr>{[e.shipper, e.consignee].filter(Boolean).join(" → ") || "—"}</Ltr>
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => void merge(e)}>
                  {t.receiving.choose}
                </Button>
              </li>
            ))}
            {expected.length === 0 && <li className="py-2 text-sm text-muted-foreground">{t.app.noResults}</li>}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  )
}
