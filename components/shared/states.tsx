"use client"

import { InboxIcon, LoaderIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/client"

export function EmptyState({ title, description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-8 text-center">
      <InboxIcon className="size-8 text-muted-foreground" />
      <p className="font-medium">{title ?? t.app.noResults}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  )
}

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
      <LoaderIcon className="size-4 animate-spin" />
      {label ?? t.app.loading}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-destructive/30 p-8 text-center">
      <TriangleAlertIcon className="size-8 text-destructive" />
      <p className="font-medium">{t.app.error}</p>
      {message && <p className="max-w-sm text-sm break-words text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {t.app.retry}
        </Button>
      )}
    </div>
  )
}

/** Carrier IDs and other data stay left-to-right inside RTL text. */
export function Ltr({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  )
}
