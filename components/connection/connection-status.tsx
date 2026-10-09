"use client"

import { CloudOffIcon, LoaderIcon, TriangleAlertIcon } from "lucide-react"

import { useOnline, useRetryQueue } from "@/components/providers/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { errorText } from "@/lib/errors"
import { fmt, useI18n } from "@/lib/i18n/client"
import { dismissOp, flushQueue, retryOp } from "@/lib/retry-queue"

/**
 * Header chip: nothing when all is well; "offline" without signal; and the
 * retry queue (scans waiting for signal, or refused by the server).
 */
export function ConnectionStatus() {
  const { t } = useI18n()
  const online = useOnline()
  const queue = useRetryQueue()
  const refused = queue.filter((o) => o.error)
  const waiting = queue.length - refused.length

  if (online && queue.length === 0) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-1.5">
          {!online && (
            <Badge variant="danger" className="h-7 gap-1 px-2.5 animate-attention">
              <CloudOffIcon className="size-3" />
              {t.sync.offline}
            </Badge>
          )}
          {refused.length > 0 ? (
            <Badge variant="danger" className="h-7 gap-1 px-2.5 animate-in zoom-in-90 fade-in-0">
              <TriangleAlertIcon className="size-3" />
              {fmt(t.sync.failed, { n: refused.length })}
            </Badge>
          ) : (
            waiting > 0 && (
              <Badge variant="info" className="h-7 gap-1 px-2.5 animate-in zoom-in-90 fade-in-0">
                <LoaderIcon className="size-3 animate-spin" />
                {fmt(t.sync.pending, { n: waiting })}
              </Badge>
            )
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{online ? t.sync.title : t.sync.offlineHelp}</p>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.sync.synced}</p>
          ) : (
            <ul className="flex max-h-72 flex-col divide-y overflow-y-auto">
              {queue.map((op) => (
                <li key={op.opId} className="flex flex-col gap-1 py-2 text-sm">
                  <span dir="ltr" className="font-medium">
                    {op.label}
                  </span>
                  {op.error ? (
                    <>
                      <span className="text-destructive-ink">{errorText(t, op.error)}</span>
                      <span className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => retryOp(op.opId)}>
                          {t.sync.retryFailed}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => dismissOp(op.opId)}>
                          {t.sync.dismiss}
                        </Button>
                      </span>
                    </>
                  ) : (
                    <span className="text-info-ink">{t.sync.waiting}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {waiting > 0 && (
            <Button size="sm" disabled={!online} onClick={() => void flushQueue()}>
              {t.sync.syncNow}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
