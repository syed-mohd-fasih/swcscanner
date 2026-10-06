"use client"

import { where } from "firebase/firestore"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { useSession } from "@/components/providers/session-provider"
import { useLocationMap } from "@/components/release/release-workspace"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DateInput, Field, useCarriers } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, FilterBar } from "@/components/shared/search-filter"
import { LoadingState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RELEASE_STATES, type Item } from "@/domain/items/types"
import { todayBusinessDate } from "@/domain/shared/dates"
import { fmt, useI18n } from "@/lib/i18n/client"
import { manifestRepository } from "@/repositories/indexeddb"
import { localCache } from "@/repositories/indexeddb"
import { remote } from "@/repositories/firestore/remote"
import { archiveExported, download, EXPORT_FORMATS, toExportRows, type ExportRow } from "@/services/export"
import { adminPull } from "@/sync/pull"

const PREVIEW_ROWS = 50

/** Filters → preview → download; optional archive (delete) after export. */
export function ExportView() {
  const { t } = useI18n()
  const { sync } = useSession()
  const confirm = useConfirm()
  const locations = useLocationMap()
  const carriers = useCarriers(false).data ?? []
  const firstOfMonth = todayBusinessDate().slice(0, 8) + "01"
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(todayBusinessDate())
  const [carrier, setCarrier] = useState(ALL)
  const [release, setRelease] = useState(ALL)
  const [formatId, setFormatId] = useState(EXPORT_FORMATS[0].id)
  const [items, setItems] = useState<Item[] | null>(null)
  const [rows, setRows] = useState<ExportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [exported, setExported] = useState(false)

  async function preview() {
    setLoading(true)
    setExported(false)
    try {
      const fetched = await remote.itemsWhere(where("dateOfReceival", ">=", from), where("dateOfReceival", "<=", to))
      const filtered = fetched
        .filter((i) => carrier === ALL || i.carrierCode === carrier)
        .filter((i) => release === ALL || i.releaseState === release)
      await localCache.put("items", filtered)
      await adminPull.manifests()
      const manifests = new Map((await manifestRepository.all()).map((m) => [m.manifestId, m]))
      setItems(filtered)
      setRows(toExportRows(filtered, manifests, locations))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function doExport() {
    const format = EXPORT_FORMATS.find((f) => f.id === formatId)!
    if (!(await confirm({ description: fmt(t.export.confirmExport, { n: rows.length }) }))) return
    download(format, rows, `swc-export-${from}_${to}`)
    setExported(true)
  }

  async function doArchive() {
    if (!items) return
    const ok = await confirm({ description: fmt(t.export.confirmArchive, { n: items.length }), irreversible: true })
    if (!ok) return
    const result = await archiveExported(items.map((i) => i.internalItemId))
    if (!result.ok) return void toast.error(result.error.message)
    void sync.flush()
    setItems([])
    setRows([])
  }

  const columns = useMemo<Column<ExportRow>[]>(
    () =>
      ["itemId", "piece", "carrier", "manifestName", "releaseState", "dateOfReceival", "dateOfRelease"].map((key) => ({
        key,
        header: key,
        cell: (r) => <span dir="ltr">{r[key] === null ? "—" : String(r[key])}</span>,
      })),
    []
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.export.title} description={t.export.help} />
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={`${t.fields.dateOfReceival} — ${t.export.from}`} htmlFor="e-from">
              <DateInput id="e-from" value={from} onChange={setFrom} />
            </Field>
            <Field label={t.export.to} htmlFor="e-to">
              <DateInput id="e-to" value={to} onChange={setTo} />
            </Field>
            <Field label={t.export.format}>
              <Select value={formatId} onValueChange={setFormatId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_FORMATS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <FilterBar
            filters={[
              { key: "carrier", label: t.fields.carrier, value: carrier, onChange: setCarrier, options: carriers.map((c) => ({ value: c.carrierCode, label: c.name })) },
              { key: "release", label: t.release.title, value: release, onChange: setRelease, options: RELEASE_STATES.map((s) => ({ value: s, label: t.states.release[s] })) },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void preview()} disabled={loading || !from || !to}>
              {t.export.preview}
            </Button>
            <Button onClick={() => void doExport()} disabled={rows.length === 0}>
              {t.export.download}
            </Button>
            <Button variant="destructive" onClick={() => void doArchive()} disabled={!exported || rows.length === 0}>
              {t.export.archive}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t.export.archiveHelp}</p>
        </CardContent>
      </Card>
      {loading ? (
        <LoadingState />
      ) : (
        items && (
          <>
            <p className="text-sm text-muted-foreground">{fmt(t.export.rows, { n: rows.length })}</p>
            <DataTable columns={columns} rows={rows.slice(0, PREVIEW_ROWS)} rowKey={(r) => String(r.internalItemId)} />
          </>
        )
      )}
    </div>
  )
}
