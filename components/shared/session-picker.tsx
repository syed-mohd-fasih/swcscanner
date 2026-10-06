"use client"

import { useState } from "react"

import { CarrierSelect, DateInput, Field, useCarriers } from "@/components/shared/fields"
import { LoadingState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { todayBusinessDate } from "@/domain/shared/dates"
import type { WorkSession } from "@/hooks/use-work-session"
import { useI18n } from "@/lib/i18n/client"

/** Operator chooses the carrier (and date) before scanning starts. */
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
  const { data: carriers, loading } = useCarriers()
  const [carrierCode, setCarrierCode] = useState(initial?.carrierCode ?? "")
  const [date, setDate] = useState(initial?.date ?? todayBusinessDate())

  if (loading) return <LoadingState />

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (carrierCode && date) onStart({ carrierCode, date })
          }}
        >
          <Field label={carrierLabel} htmlFor="session-carrier">
            <CarrierSelect id="session-carrier" value={carrierCode} onChange={setCarrierCode} carriers={carriers ?? []} />
          </Field>
          {withDate && (
            <Field label={t.receiving.sessionDate} htmlFor="session-date">
              <DateInput id="session-date" value={date} onChange={setDate} />
            </Field>
          )}
          <Button type="submit" size="lg" className="h-12" disabled={!carrierCode || !date}>
            {title}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
