"use client"

import type { ManifestSummary as Summary } from "@/domain/manifests/types"
import { useI18n } from "@/lib/i18n/client"

/** Informational aggregate — it never blocks item-level receiving/release. */
export function ManifestProgress({ summary }: { summary: Summary }) {
  const { t } = useI18n()
  const pct = summary.expected ? Math.round((summary.received / summary.expected) * 100) : 0
  const cells: [string, number][] = [
    [t.manifests.expected, summary.expected],
    [t.manifests.received, summary.received],
    [t.manifests.notReceived, summary.notReceived],
    [t.manifests.awaitingStorage, summary.awaitingStorage],
    [t.manifests.stored, summary.stored],
    [t.manifests.directRelease, summary.directRelease],
    [t.manifests.releaseScanned, summary.releaseScanned],
    [t.manifests.released, summary.released + summary.repossessed + summary.seized],
    [t.manifests.flagged, summary.flagged],
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {cells.map(([label, value]) => (
          <div key={label} className="rounded-xl border p-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
