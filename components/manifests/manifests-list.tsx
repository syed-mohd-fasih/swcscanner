"use client"

import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { useSession } from "@/components/providers/session-provider"
import { DataTable, type Column } from "@/components/shared/data-table"
import { useCarriers } from "@/components/shared/fields"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, FilterBar, matchesSearch, SearchBar } from "@/components/shared/search-filter"
import { Ltr, LoadingState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import type { Manifest } from "@/domain/manifests/types"
import { useLocalQuery } from "@/hooks/use-local-query"
import { useI18n } from "@/lib/i18n/client"
import { manifestRepository } from "@/repositories/indexeddb"
import { adminPull } from "@/sync/pull"

export function ManifestsList() {
  const { t } = useI18n()
  const { ready } = useSession()
  const router = useRouter()
  const carriers = useCarriers(false).data ?? []
  const [query, setQuery] = useState("")
  const [carrier, setCarrier] = useState(ALL)
  const { data: manifests = [], loading } = useLocalQuery(() => manifestRepository.all(), [])

  useEffect(() => {
    if (ready) adminPull.manifests().catch(() => {})
  }, [ready])

  const rows = useMemo(
    () =>
      manifests
        .filter((m) => carrier === ALL || m.carrierCode === carrier)
        .filter((m) => matchesSearch(query, m.manifestName, m.truckId, m.date))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [manifests, carrier, query]
  )

  const columns: Column<Manifest>[] = [
    { key: "name", header: t.fields.manifestName, cell: (m) => <Ltr className="font-medium">{m.manifestName}</Ltr> },
    { key: "date", header: t.fields.manifestDate, cell: (m) => <Ltr>{m.date}</Ltr> },
    { key: "carrier", header: t.fields.carrier, cell: (m) => <Ltr>{m.carrierCode}</Ltr> },
    { key: "truck", header: t.fields.truckId, cell: (m) => <Ltr>{m.truckId || "—"}</Ltr> },
  ]

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
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(m) => m.manifestId} onRowClick={(m) => router.push(`/manifests/${m.manifestId}`)} />
      )}
    </div>
  )
}
