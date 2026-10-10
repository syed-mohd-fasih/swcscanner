"use client"

import { CheckIcon } from "lucide-react"

import { Ltr } from "@/components/shared/states"
import type { PieceProgress as Progress } from "@/domain/receiving/candidates"
import { useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

/** "Found [1, 3, 5] / 6" */
export function PieceProgress({ progress }: { progress: Progress }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-muted-foreground">{t.receiving.found}</span>
        <Ltr
          className={cn(
            "text-lg font-semibold tabular-nums",
            progress.found.length === progress.total ? "text-success-ink" : progress.found.length > 0 && "text-info-ink"
          )}
        >
          {progress.found.length}/{progress.total}
        </Ltr>
      </div>
      {progress.found.length > 0 && (
        <Ltr className="text-sm text-muted-foreground tabular-nums">
          [{progress.found.join(", ")}] / {progress.total}
        </Ltr>
      )}
    </div>
  )
}

/**
 * Grid of piece numbers. Already-confirmed pieces are disabled so they can
 * never be confirmed twice. Large touch targets for phones.
 */
export function PieceSelector({
  total,
  available,
  value,
  onChange,
}: {
  total: number
  available: number[]
  value: number | null
  onChange: (piece: number) => void
}) {
  const { t } = useI18n()
  if (total > 40) {
    // very large shipments: type the number instead of a huge grid
    const invalid = value !== null && !available.includes(value)
    return (
      <div className="flex items-center gap-2" dir="ltr">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={total}
          aria-label={t.receiving.whichPiece}
          aria-invalid={invalid}
          value={value ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-12 w-28 rounded-xl border bg-card px-3 text-lg tabular-nums aria-invalid:border-destructive"
        />
        <span className="text-lg tabular-nums">/ {total}</span>
        {invalid && <span className="text-sm text-destructive-ink">{t.receiving.alreadyConfirmed}</span>}
      </div>
    )
  }
  const numbers = Array.from({ length: total }, (_, i) => i + 1)
  return (
    <div role="radiogroup" aria-label={t.receiving.whichPiece} className="grid grid-cols-5 gap-2 sm:grid-cols-8" dir="ltr">
      {numbers.map((n) => {
        const enabled = available.includes(n)
        const selected = value === n
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!enabled}
            title={enabled ? undefined : t.receiving.alreadyConfirmed}
            onClick={() => onChange(n)}
            className={cn(
              "flex h-12 items-center justify-center gap-1 rounded-xl border text-sm font-semibold tabular-nums transition-all duration-150",
              selected && "scale-105 border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25",
              !selected && enabled && "bg-card shadow-xs hover:bg-muted active:scale-95",
              // already received = done (green), never pickable again
              !enabled && "tone-success cursor-not-allowed opacity-80"
            )}
          >
            {!enabled && <CheckIcon className="size-3.5" />}
            {n}/{total}
          </button>
        )
      })}
    </div>
  )
}
