"use client"

import { ChevronRightIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

import { Callout } from "@/components/shared/callout"
import { useCarriers } from "@/components/providers/config-provider"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, FilterBar, SearchBar } from "@/components/shared/search-filter"
import { EmptyState, Ltr } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import type { Manifest } from "@/domain/manifests/types"
import { useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

export type ManifestRow = { manifest: Manifest; received: number; total: number }

/**
 * Newest first. Search matches the start of the manifest name (e.g.
 * "TNT-10-8"); search and carrier live in the URL so the server filters.
 */
export function ManifestsList({
  rows,
  hasMore,
  query,
  carrier,
}: {
  rows: ManifestRow[]
  hasMore: boolean
  query: string
  carrier: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { data: carriers } = useCarriers(false)
  const [text, setText] = useState(query)

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`${pathname}?${next}`)
  }

  // debounce typing; the server does the search (indexed prefix)
  useEffect(() => {
    if (text === query) return
    const timer = setTimeout(() => setParam("q", text.trim()), 400)
    return () => clearTimeout(timer)
  })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t.manifests.title}
        actions={
          <Button asChild>
            <Link href="/manifests/new">
              <PlusIcon />
              {t.manifests.new}
            </Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchBar value={text} onChange={setText} />
        <FilterBar
          filters={[
            {
              key: "carrier",
              label: t.fields.carrier,
              value: carrier || ALL,
              onChange: (v) => setParam("carrier", v === ALL ? "" : v),
              options: carriers.map((c) => ({ value: c.carrierCode, label: c.name })),
            },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ manifest: m, received, total }) => {
            const pct = total > 0 ? Math.round((received / total) * 100) : 0
            return (
              <li key={m.manifestId}>
                <Link
                  href={`/manifests/${m.manifestId}`}
                  className="surface-interactive flex items-center gap-3 p-3"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Ltr className="truncate font-semibold">{m.manifestName}</Ltr>
                    <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span
                        className={cn(
                          "block h-full rounded-full transition-[width] duration-700 ease-out",
                          pct >= 100 ? "bg-success" : "bg-primary"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className={cn("text-xs", pct >= 100 ? "font-medium text-success-ink" : "text-muted-foreground")}>
                      {t.manifests.received}: <Ltr className="tabular-nums">{received}/{total}</Ltr>
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {hasMore && <Callout tone="info">{t.manifests.narrowSearch}</Callout>}
    </div>
  )
}
