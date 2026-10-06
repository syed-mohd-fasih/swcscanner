"use client"

import { where } from "firebase/firestore"
import Link from "next/link"
import { useEffect, useState } from "react"

import { useSession } from "@/components/providers/session-provider"
import { PageHeader } from "@/components/shared/page-header"
import { SyncStatus } from "@/components/sync/sync-status"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { todayBusinessDate } from "@/domain/shared/dates"
import { useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"
import { remote } from "@/repositories/firestore/remote"

type Stats = {
  receivedToday: number
  expected: number
  awaitingStorage: number
  awaitingReleaseScan: number
  unidentified: number
  awaitingOutcome: number
  directRelease: number
}

/**
 * Informational only. Totals come from server-side count aggregations
 * (cheap: billed per index entries, not per document).
 */
export function DashboardView() {
  const { t } = useI18n()
  const { ready, isAdmin } = useSession()
  const [stats, setStats] = useState<Stats | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!ready) return
    const today = todayBusinessDate()
    Promise.all([
      remote.countItems(where("dateOfReceival", "==", today)),
      remote.countItems(where("receivingState", "==", "expected")),
      remote.countItems(where("storageState", "==", null), where("releaseState", "==", "not_released"), where("receivingState", "in", ["received", "unidentified"])),
      remote.countItems(where("releaseState", "==", "not_released"), where("receivingState", "in", ["received", "unidentified"])),
      remote.countItems(where("receivingState", "==", "unidentified")),
      remote.countItems(where("releaseState", "==", "release_scanned")),
      remote.countItems(where("storageState", "==", "direct_release"), where("releaseState", "==", "not_released")),
    ])
      .then(([receivedToday, expected, awaitingStorage, notReleased, unidentified, awaitingOutcome, directRelease]) =>
        setStats({
          receivedToday,
          expected,
          awaitingStorage,
          // ready to gather = received, not released, and already stored/direct
          awaitingReleaseScan: notReleased - awaitingStorage,
          unidentified,
          awaitingOutcome,
          directRelease,
        })
      )
      .catch(() => setFailed(true))
  }, [ready])

  const tiles: { label: string; value: number | undefined; href?: string; tone?: string }[] = [
    { label: t.dashboard.receivedToday, value: stats?.receivedToday, href: "/receiving" },
    { label: t.dashboard.expected, value: stats?.expected, href: isAdmin ? "/manifests" : undefined },
    { label: t.dashboard.awaitingStorage, value: stats?.awaitingStorage, href: "/storage", tone: "text-sky-600 dark:text-sky-400" },
    { label: t.dashboard.awaitingReleaseScan, value: stats?.awaitingReleaseScan, href: "/release" },
    { label: t.dashboard.unidentified, value: stats?.unidentified, href: "/unidentified", tone: "text-amber-600 dark:text-amber-400" },
    { label: t.dashboard.awaitingOutcome, value: stats?.awaitingOutcome, href: isAdmin ? "/admin/release" : undefined },
    { label: t.dashboard.directRelease, value: stats?.directRelease },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.dashboard.title} description={t.dashboard.serverStats} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((tile) => {
          const body = (
            <Card className={cn("h-full", tile.href && "transition-colors hover:bg-muted/50")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-normal text-muted-foreground">{tile.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <span className={cn("text-3xl font-semibold tabular-nums", tile.tone)}>
                  {tile.value ?? (failed ? "—" : "…")}
                </span>
              </CardContent>
            </Card>
          )
          return tile.href ? (
            <Link key={tile.label} href={tile.href}>
              {body}
            </Link>
          ) : (
            <div key={tile.label}>{body}</div>
          )
        })}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t.nav.sync}</CardTitle>
        </CardHeader>
        <CardContent>
          <SyncStatus />
        </CardContent>
      </Card>
    </div>
  )
}
