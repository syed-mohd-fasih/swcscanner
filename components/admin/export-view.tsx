"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import { archiveAction, exportPreviewAction, type ExportPreview } from "@/app/actions/admin"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DateInput, Field, useCarriers } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, FilterBar } from "@/components/shared/search-filter"
import { LoadingState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RELEASE_STATES } from "@/domain/items/types"
import { todayBusinessDate } from "@/domain/shared/dates"
import { fmt, useI18n } from "@/lib/i18n/client"
import { callAction } from "@/lib/submit-op"
import { download, EXPORT_FORMATS, type ExportRow } from "@/services/export"

const PREVIEW_ROWS = 50

/** Filters → preview → download; optional archive (delete) after export. */
export function ExportView() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const carriers = useCarriers(false).data ?? []
  const firstOfMonth = todayBusinessDate().slice(0, 8) + "01"
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(todayBusinessDate())
  const [carrier, setCarrier] = useState(ALL)
  const [release, setRelease] = useState(ALL)
  const [formatId, setFormatId] = useState(EXPORT_FORMATS[0].id)
  const [data, setData] = useState<ExportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [exported, setExported] = useState(false)

  // carrier / release filters apply to the fetched range on the device
  const kept = useMemo(() => {
    if (!data) return []
    return data.meta.flatMap((m, i) =>
      (carrier === ALL || m.carrierCode === carrier) && (release === ALL || m.releaseState === release) ? [i] : []
    )
  }, [data, carrier, release])
  const rows = useMemo(() => kept.map((i) => data!.rows[i]), [kept, data])

  async function preview() {
    setLoading(true)
    setExported(false)
    const fetched = await callAction(t, () => exportPreviewAction({ from, to }))
    setLoading(false)
    if (fetched) setData(fetched)
    if (fetched?.truncated) toast.warning(t.export.truncated)
  }

  async function doExport() {
    const format = EXPORT_FORMATS.find((f) => f.id === formatId)!
    if (!(await confirm({ description: fmt(t.export.confirmExport, { n: rows.length }) }))) return
    download(format, rows, `swc-export-${from}_${to}`)
    setExported(true)
  }

  async function doArchive() {
    if (!data) return
    const ids = kept.map((i) => data.meta[i].internalItemId)
    const ok = await confirm({ description: fmt(t.export.confirmArchive, { n: ids.length }), irreversible: true })
    if (!ok) return
    const archived = await callAction(t, () => archiveAction({ internalItemIds: ids }))
    if (archived === null) return
    setData(null)
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
        data && (
          <>
            <p className="text-sm text-muted-foreground">{fmt(t.export.rows, { n: rows.length })}</p>
            <DataTable columns={columns} rows={rows.slice(0, PREVIEW_ROWS)} rowKey={(r) => String(r.internalItemId)} />
          </>
        )
      )}
    </div>
  )
}
