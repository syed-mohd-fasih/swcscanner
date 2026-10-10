"use client"

import { FileSpreadsheetIcon, HelpCircleIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

import { useExportFlow } from "@/components/export/use-export-flow"
import type { ManifestRow } from "@/components/manifests/manifests-list"
import { Callout } from "@/components/shared/callout"
import { PageHeader } from "@/components/shared/page-header"
import { SearchBar } from "@/components/shared/search-filter"
import { EmptyState, Ltr } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { fmt, useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

/** keep in step with MAX_EXPORT_PIECES on the server */
const MAX_PIECES = 5000

/**
 * Pick manifests (and unidentified pieces) → one .xlsx → offer to delete
 * what was exported. The selection survives searching.
 */
export function ExportView({
  rows,
  hasMore,
  query,
  unidentified,
}: {
  rows: ManifestRow[]
  hasMore: boolean
  query: string
  unidentified: number
}) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const run = useExportFlow()
  const [text, setText] = useState(query)
  /** manifestId → piece count */
  const [picked, setPicked] = useState<Map<string, number>>(new Map())
  const [withUnidentified, setWithUnidentified] = useState(false)
  const [busy, setBusy] = useState(false)

  // debounce typing; the server searches (indexed name prefix)
  useEffect(() => {
    if (text === query) return
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (text.trim()) next.set("q", text.trim())
      else next.delete("q")
      router.replace(`${pathname}?${next}`)
    }, 400)
    return () => clearTimeout(timer)
  })

  const toggle = (id: string, total: number, on: boolean) =>
    setPicked((p) => {
      const next = new Map(p)
      if (on) next.set(id, total)
      else next.delete(id)
      return next
    })

  const sheets = picked.size + (withUnidentified ? 1 : 0)
  const pieces = [...picked.values()].reduce((a, b) => a + b, 0) + (withUnidentified ? unidentified : 0)
  const tooMany = pieces > MAX_PIECES
  const allShown = rows.length > 0 && rows.every((r) => picked.has(r.manifest.manifestId))

  async function exportNow() {
    setBusy(true)
    const outcome = await run({ manifestIds: [...picked.keys()], includeUnidentified: withUnidentified })
    setBusy(false)
    if (outcome === "deleted") {
      setPicked(new Map())
      setWithUnidentified(false)
      router.refresh()
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <PageHeader title={t.export.title} description={t.export.help} />

      {unidentified > 0 && (
        <label className={cn("surface flex cursor-pointer items-center gap-3 p-3 transition-shadow", withUnidentified && "ring-2 ring-primary/40")}>
          <Checkbox checked={withUnidentified} onCheckedChange={(c) => setWithUnidentified(c === true)} />
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning-ink">
            <HelpCircleIcon className="size-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{t.export.unidentified}</span>
            <span className="text-xs text-muted-foreground">{fmt(t.export.unidentifiedHelp, { n: unidentified })}</span>
          </span>
        </label>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchBar value={text} onChange={setText} />
        {rows.length > 0 && (
          <Button
            variant="outline"
            onClick={() => rows.forEach((r) => toggle(r.manifest.manifestId, r.total, !allShown))}
          >
            {t.export.selectAll}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ manifest: m, received, total }) => {
            const on = picked.has(m.manifestId)
            return (
              <li key={m.manifestId}>
                <label className={cn("surface-interactive flex cursor-pointer items-center gap-3 p-3", on && "ring-2 ring-primary/40")}>
                  <Checkbox checked={on} onCheckedChange={(c) => toggle(m.manifestId, total, c === true)} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Ltr className="truncate text-start font-semibold">{m.manifestName}</Ltr>
                    <span className="text-xs text-muted-foreground">
                      <Ltr>
                        {m.carrierCode} · {m.date}
                      </Ltr>
                      {" · "}
                      {t.manifests.received}: <Ltr className="tabular-nums">{received}/{total}</Ltr>
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {hasMore && <Callout tone="info">{t.manifests.narrowSearch}</Callout>}

      {/* sticky action bar, above the phone bottom tabs */}
      <div
        aria-hidden={sheets === 0}
        inert={sheets === 0}
        className={cn(
          "fixed inset-x-0 bottom-16 z-20 border-t bg-card/95 px-3 py-3 shadow-[0_-4px_16px_-6px] shadow-foreground/15 backdrop-blur transition-all duration-300 ease-out md:bottom-0 md:ps-[calc(var(--sidebar-width)+0.75rem)]",
          sheets === 0 && "pointer-events-none translate-y-full opacity-0"
        )}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          {tooMany && <Callout tone="warning">{fmt(t.export.tooMany, { n: MAX_PIECES.toLocaleString("en-US") })}</Callout>}
          <div className="flex items-center justify-between gap-3">
            <span key={sheets} className="text-sm font-semibold text-primary-ink animate-in zoom-in-95 fade-in-0">
              {fmt(t.export.selected, { n: sheets, p: pieces })}
            </span>
            <Button size="lg" className="h-12" disabled={busy || tooMany || sheets === 0} onClick={() => void exportNow()}>
              <FileSpreadsheetIcon />
              {busy ? t.export.preparing : t.export.download}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
