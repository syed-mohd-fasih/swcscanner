"use client"

import { FlagIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { InvestigationStatus, Item, ReceivingState, ReleaseState, StorageState } from "@/domain/items/types"
import { useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

/**
 * One meaning per colour, everywhere in the app:
 * neutral = not started · info = next step pending · success = done ·
 * warning = needs attention · danger = failed / final negative · accent = brand / chosen
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent"

export function StateBadge({ label, tone, className }: { label: React.ReactNode; tone: Tone; className?: string }) {
  return (
    <Badge variant={tone} className={cn("font-medium", className)}>
      {label}
    </Badge>
  )
}

export const receivingTone: Record<ReceivingState, Tone> = {
  expected: "neutral",
  received: "success",
  unidentified: "warning",
}

export const releaseTone: Record<ReleaseState, Tone> = {
  not_released: "neutral",
  release_scanned: "info",
  released: "success",
  repossessed: "warning",
  seized: "danger",
}

export function ReceivingStatus({ state }: { state: ReceivingState }) {
  const { t } = useI18n()
  return <StateBadge label={t.states.receiving[state]} tone={receivingTone[state]} />
}

export function StorageStatus({ state }: { state: StorageState | null }) {
  const { t } = useI18n()
  if (!state) return <StateBadge label={t.states.storage.none} tone="info" />
  return <StateBadge label={t.states.storage[state]} tone={state === "stored" ? "success" : "accent"} />
}

export function ReleaseOutcome({ state }: { state: ReleaseState }) {
  const { t } = useI18n()
  return <StateBadge label={t.states.release[state]} tone={releaseTone[state]} />
}

export function InvestigationBadge({ status }: { status: InvestigationStatus }) {
  const { t } = useI18n()
  return <StateBadge label={t.states.investigation[status]} tone={status === "open" ? "warning" : "info"} />
}

export function MismatchBadge() {
  const { t } = useI18n()
  return (
    <Badge variant="warning" className="gap-1">
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
