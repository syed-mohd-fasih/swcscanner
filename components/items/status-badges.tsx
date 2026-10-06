"use client"

import { FlagIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { Item, ReceivingState, ReleaseState, StorageState } from "@/domain/items/types"
import { useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

const tone = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300",
  good: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warn: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
  bad: "border-transparent bg-red-500/15 text-red-700 dark:text-red-300",
  accent: "border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-300",
}

function StateBadge({ label, kind }: { label: string; kind: keyof typeof tone }) {
  return (
    <Badge variant="outline" className={cn("font-medium", tone[kind])}>
      {label}
    </Badge>
  )
}

export function ReceivingStatus({ state }: { state: ReceivingState }) {
  const { t } = useI18n()
  const kind = state === "received" ? "good" : state === "unidentified" ? "warn" : "neutral"
  return <StateBadge label={t.states.receiving[state]} kind={kind} />
}

export function StorageStatus({ state }: { state: StorageState | null }) {
  const { t } = useI18n()
  if (!state) return <StateBadge label={t.states.storage.none} kind="neutral" />
  return <StateBadge label={t.states.storage[state]} kind={state === "stored" ? "info" : "accent"} />
}

export function ReleaseOutcome({ state }: { state: ReleaseState }) {
  const { t } = useI18n()
  const kind: Record<ReleaseState, keyof typeof tone> = {
    not_released: "neutral",
    release_scanned: "info",
    released: "good",
    repossessed: "warn",
    seized: "bad",
  }
  return <StateBadge label={t.states.release[state]} kind={kind[state]} />
}

export function MismatchBadge() {
  const { t } = useI18n()
  return (
    <Badge variant="destructive" className="gap-1">
      <FlagIcon className="size-3" />
      {t.states.mismatch}
    </Badge>
  )
}

/** The independent lifecycle dimensions, side by side — never one status. */
export function ItemStatus({ item, className }: { item: Item; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      <ReceivingStatus state={item.receivingState} />
      {item.receivingState !== "expected" && <StorageStatus state={item.storageState} />}
      {item.receivingState !== "expected" && <ReleaseOutcome state={item.releaseState} />}
      {item.quantityMismatch && <MismatchBadge />}
    </div>
  )
}
