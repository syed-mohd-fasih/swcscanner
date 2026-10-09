"use client"

import {
  ChevronRightIcon,
  HelpCircleIcon,
  PackageCheckIcon,
  PackageOpenIcon,
  ScanLineIcon,
  SendIcon,
  TruckIcon,
  WarehouseIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { dashboardStats } from "@/app/actions/operator"
import { useSession } from "@/components/providers/session-provider"
import { PageHeader } from "@/components/shared/page-header"
import { todayBusinessDate } from "@/domain/shared/dates"
import { useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"
import type { DashboardStats } from "@/server/data/stats"

type Tile = { label: string; value: number | undefined; href?: string; icon: LucideIcon; tone?: string }

/**
 * What needs doing, first: each tile opens the screen where it is done.
 * Counts are shared server-side counts, refreshed at most once a minute.
 */
export function DashboardView() {
  const { t } = useI18n()
  const { isAdmin } = useSession()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    dashboardStats({ today: todayBusinessDate() })
      .then((r) => live && (r.ok ? setStats(r.value) : setFailed(true)))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  const tiles: Tile[] = [
    { label: t.dashboard.awaitingStorage, value: stats?.awaitingStorage, href: "/storage", icon: WarehouseIcon, tone: "text-sky-600 dark:text-sky-400" },
    { label: t.dashboard.awaitingReleaseScan, value: stats?.awaitingReleaseScan, href: "/release", icon: PackageOpenIcon },
    { label: t.dashboard.receivedToday, value: stats?.receivedToday, href: "/receiving", icon: ScanLineIcon },
    { label: t.dashboard.unidentified, value: stats?.unidentified, href: "/unidentified", icon: HelpCircleIcon, tone: "text-amber-600 dark:text-amber-400" },
    ...(isAdmin
      ? [{ label: t.dashboard.awaitingOutcome, value: stats?.awaitingOutcome, href: "/admin/release", icon: PackageCheckIcon }]
      : []),
    { label: t.dashboard.expected, value: stats?.expected, href: isAdmin ? "/manifests" : undefined, icon: TruckIcon },
    { label: t.dashboard.directRelease, value: stats?.directRelease, icon: SendIcon },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.dashboard.title} description={t.dashboard.serverStats} />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => {
          const body = (
            <span
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-3",
                tile.href && "transition-colors hover:bg-muted/50 active:bg-muted"
              )}
            >
              <tile.icon className={cn("size-5 shrink-0 text-muted-foreground", tile.tone)} />
              <span className="min-w-0 flex-1 text-sm">{tile.label}</span>
              <span className={cn("text-2xl font-semibold tabular-nums", tile.tone)}>
                {tile.value ?? (failed ? "—" : "…")}
              </span>
              {tile.href && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />}
            </span>
          )
          return (
            <li key={tile.label}>
              {tile.href ? (
                <Link href={tile.href} className="block">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
