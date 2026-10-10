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
import type { Tone } from "@/components/items/status-badges"
import { useSession } from "@/components/providers/session-provider"
import { PageHeader } from "@/components/shared/page-header"
import { todayBusinessDate } from "@/domain/shared/dates"
import { useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"
import type { DashboardStats } from "@/server/data/stats"

type Tile = { label: string; value: number | undefined; href?: string; icon: LucideIcon; tone: Tone }

const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-primary/12 text-primary-ink",
  info: "bg-info/15 text-info-ink",
  success: "bg-success/15 text-success-ink",
  warning: "bg-warning/20 text-warning-ink",
  danger: "bg-destructive/12 text-destructive-ink",
}

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
    { label: t.dashboard.awaitingStorage, value: stats?.awaitingStorage, href: "/storage", icon: WarehouseIcon, tone: "info" },
    { label: t.dashboard.awaitingReleaseScan, value: stats?.awaitingReleaseScan, href: "/release", icon: PackageOpenIcon, tone: "accent" },
    { label: t.dashboard.receivedToday, value: stats?.receivedToday, href: "/receiving", icon: ScanLineIcon, tone: "success" },
    { label: t.dashboard.unidentified, value: stats?.unidentified, href: "/unidentified", icon: HelpCircleIcon, tone: "warning" },
    ...(isAdmin
      ? [{ label: t.dashboard.awaitingOutcome, value: stats?.awaitingOutcome, href: "/admin/release", icon: PackageCheckIcon, tone: "info" as Tone }]
      : []),
    { label: t.dashboard.expected, value: stats?.expected, href: isAdmin ? "/manifests" : undefined, icon: TruckIcon, tone: "neutral" },
    { label: t.dashboard.directRelease, value: stats?.directRelease, icon: SendIcon, tone: "accent" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.dashboard.title} description={t.dashboard.serverStats} />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => {
          const body = (
            <span className={cn("flex min-h-16 items-center gap-3 p-3", tile.href ? "surface-interactive" : "surface")}>
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", ICON_TONE[tile.tone])}>
                <tile.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">{tile.label}</span>
              {tile.value === undefined ? (
                failed ? (
                  <span className="text-2xl text-muted-foreground">—</span>
                ) : (
                  <span className="h-7 w-8 animate-pulse rounded-md bg-muted" aria-label={t.app.loading} />
                )
              ) : (
                <span className="text-2xl font-semibold tabular-nums animate-in fade-in-0 zoom-in-95 duration-300">{tile.value}</span>
              )}
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
