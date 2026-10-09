"use client"

import { CalendarIcon, TruckIcon } from "lucide-react"
import { useState } from "react"

import { useCarriers } from "@/components/providers/config-provider"
import { DateInput } from "@/components/shared/fields"
import { EmptyState, Ltr } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { todayBusinessDate } from "@/domain/shared/dates"
import type { WorkSession } from "@/hooks/use-work-session"
import { useI18n } from "@/lib/i18n/client"

/**
 * One tap starts the session: a large button per carrier. The date defaults
 * to today and only opens for editing on request.
 */
export function SessionPicker({
  title,
  carrierLabel,
  withDate,
  initial,
  onStart,
}: {
  title: string
  carrierLabel: string
  withDate: boolean
  initial: WorkSession | null
  onStart: (session: WorkSession) => void
}) {
  const { t } = useI18n()
  const { data: carriers } = useCarriers()
  const [date, setDate] = useState(initial?.date ?? todayBusinessDate())
  const [editDate, setEditDate] = useState(false)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{carrierLabel}</p>
      </div>
      {withDate && (
        <div className="flex items-center gap-2 text-sm">
          <CalendarIcon className="size-4 text-muted-foreground" />
          {editDate ? (
            <div className="flex-1">
              <DateInput id="session-date" value={date} onChange={setDate} />
            </div>
          ) : (
            <>
              <span>
                {t.receiving.sessionDate}: <Ltr className="font-medium">{date}</Ltr>
              </span>
              <Button variant="link" size="sm" className="h-auto px-1" onClick={() => setEditDate(true)}>
                {t.app.edit}
              </Button>
            </>
          )}
        </div>
      )}
      {carriers.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {carriers.map((c) => (
            <Button
              key={c.carrierCode}
              variant={initial?.carrierCode === c.carrierCode ? "default" : "outline"}
              className="h-20 flex-col gap-1 rounded-2xl text-base"
              disabled={!date}
              onClick={() => onStart({ carrierCode: c.carrierCode, date })}
            >
              <TruckIcon className="size-5" />
              <span className="font-semibold">{c.name}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
