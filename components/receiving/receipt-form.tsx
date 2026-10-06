"use client"

import { PackageIcon, SendIcon } from "lucide-react"

import { DateInput, Field } from "@/components/shared/fields"
import type { ReceiptInput, ReceiptPath } from "@/domain/receiving/rules"
import { useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

export type ReceiptDraft = {
  path: ReceiptPath
  dateOfReceival: string
}

export function receiptDraftComplete(d: ReceiptDraft): boolean {
  return !!d.dateOfReceival
}

export function toReceiptInput(d: ReceiptDraft): ReceiptInput {
  return { path: d.path, dateOfReceival: d.dateOfReceival }
}

/**
 * Receiving only decides the path (store later / direct release) and the
 * date of receival. The location is set later in the separate store step.
 */
export function ReceiptForm({ value, onChange }: { value: ReceiptDraft; onChange: (d: ReceiptDraft) => void }) {
  const { t } = useI18n()
  const option = (path: ReceiptPath, label: string, Icon: typeof PackageIcon) => (
    <button
      type="button"
      role="radio"
      aria-checked={value.path === path}
      onClick={() => onChange({ ...value, path })}
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-start text-sm font-medium",
        value.path === path ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      <Field label={t.receiving.storeIn}>
        <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {option("store_later", t.receiving.storeLater, PackageIcon)}
          {option("direct_release", t.receiving.directRelease, SendIcon)}
        </div>
      </Field>
      <Field label={t.fields.dateOfReceival} htmlFor="date-of-receival">
        <DateInput
          id="date-of-receival"
          value={value.dateOfReceival}
          onChange={(dateOfReceival) => onChange({ ...value, dateOfReceival })}
        />
      </Field>
    </div>
  )
}
