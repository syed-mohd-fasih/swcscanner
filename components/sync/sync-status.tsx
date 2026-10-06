"use client"

import { CloudIcon, CloudOffIcon, LoaderIcon, TriangleAlertIcon } from "lucide-react"
import Link from "next/link"

import { useSession, useSyncStatus } from "@/components/providers/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useLocalQuery } from "@/hooks/use-local-query"
import { fmt, useI18n } from "@/lib/i18n/client"
import { syncRepository } from "@/repositories/indexeddb"

export function useOutboxCounts() {
  return useLocalQuery(() => syncRepository.counts(), []).data ?? {
    pending: 0,
    syncing: 0,
    failed: 0,
  }
}

export function OfflineIndicator() {
  const { online } = useSyncStatus()
  const { t } = useI18n()
  if (online) return null
  return (
    <Badge variant="destructive" className="gap-1">
      <CloudOffIcon className="size-3" />
      {t.sync.offline}
    </Badge>
  )
}

export function PendingSyncIndicator() {
  const counts = useOutboxCounts()
  const { t } = useI18n()
  if (counts.failed > 0) {
    return (
      <Badge variant="destructive" className="gap-1">
        <TriangleAlertIcon className="size-3" />
        {fmt(t.sync.failed, { n: counts.failed })}
      </Badge>
    )
  }
  const waiting = counts.pending + counts.syncing
  if (waiting === 0) return null
  return (
    <Badge variant="secondary" className="gap-1">
      <LoaderIcon className="size-3 animate-spin" />
      {fmt(t.sync.pending, { n: waiting })}
    </Badge>
  )
}

/** Header pill (compact) or full panel with actions. */
export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { t, locale } = useI18n()
  const { sync } = useSession()
  const status = useSyncStatus()
  const counts = useOutboxCounts()
  const waiting = counts.pending + counts.syncing

  if (compact) {
    return (
      <Link href="/sync" className="flex items-center gap-1.5">
        <OfflineIndicator />
        {status.online && counts.failed === 0 && waiting === 0 ? (
          <Badge variant="outline" className="gap-1">
            <CloudIcon className="size-3" />
            {t.sync.synced}
          </Badge>
        ) : (
          <PendingSyncIndicator />
        )}
      </Link>
    )
  }

  const lastSync = status.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleString(locale === "ar" ? "ar-u-nu-latn" : "en-GB")
    : t.sync.never

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.online ? "outline" : "destructive"}>
          {status.online ? t.sync.online : t.sync.offline}
        </Badge>
        <PendingSyncIndicator />
        {waiting === 0 && counts.failed === 0 && <Badge variant="outline">{t.sync.synced}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        {t.sync.lastSync}: <span dir="ltr">{lastSync}</span>
      </p>
      {status.lastError && <p className="text-sm break-words text-destructive">{status.lastError}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void sync.flush()} disabled={!status.online || status.flushing}>
          {status.flushing ? t.sync.syncing : t.sync.syncNow}
        </Button>
        {counts.failed > 0 && (
          <>
            <Button variant="outline" onClick={() => void sync.retryFailed()}>
              {t.sync.retryFailed}
            </Button>
            <Button variant="ghost" onClick={() => void sync.dismissRejected()}>
              {t.sync.dismiss}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
