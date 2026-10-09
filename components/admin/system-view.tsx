"use client"

import { RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"

import { useRetryQueue } from "@/components/providers/session-provider"
import { InfoList } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { Ltr } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fmt, useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"
import type { Usage, UsageMeter } from "@/server/data/usage"

/** Admin: free-plan usage today (like an AI usage meter) and this phone. */
export function SystemView({ usage, projectId, emulator }: { usage: Usage; projectId: string; emulator: boolean }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const confirm = useConfirm()
  const queue = useRetryQueue()
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === "ar" ? "ar-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" })

  async function resetDevice() {
    if (!(await confirm({ description: t.system.confirmClear, destructive: true }))) return
    try {
      for (const store of [localStorage, sessionStorage])
        for (const key of Object.keys(store)) if (key.startsWith("swc:")) store.removeItem(key)
    } catch {
      // storage unavailable
    }
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.system.title} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>{t.usage.title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t.usage.help}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.refresh()} aria-label={t.app.refresh}>
            <RefreshCwIcon />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {usage.available ? (
            <>
              <Meter label={t.usage.reads} meter={usage.reads} />
              <Meter label={t.usage.writes} meter={usage.writes} />
              <Meter label={t.usage.deletes} meter={usage.deletes} />
              <Meter
                label={`${t.usage.storage}${usage.storage.estimated ? ` (${t.usage.estimated})` : ""}`}
                meter={usage.storage}
                bytes
              />
              <p className="text-xs text-muted-foreground">
                {fmt(t.usage.resetsAt, { time: time(usage.resetsAt) })} · {fmt(t.usage.checkedAt, { time: time(usage.checkedAt) })}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {usage.reason === "emulator" ? t.usage.emulator : usage.reason === "permission" ? t.usage.permission : t.usage.unavailable}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.system.device}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InfoList
            rows={[
              { label: t.system.backend, value: emulator ? t.system.emulator : <Ltr>{`${t.system.cloud}: ${projectId}`}</Ltr> },
              { label: t.system.waiting, value: <Ltr>{queue.length}</Ltr> },
            ]}
          />
          <Button variant="outline" className="self-start" onClick={() => void resetDevice()}>
            {t.system.clearLocal}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Meter({ label, meter, bytes = false }: { label: string; meter: UsageMeter; bytes?: boolean }) {
  const share = meter.limit > 0 ? meter.used / meter.limit : 0
  const pct = Math.min(100, Math.round(share * 100))
  const show = (n: number) => (bytes ? formatBytes(n) : n.toLocaleString("en-US"))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <Ltr className="text-muted-foreground tabular-nums">
          {show(meter.used)} / {show(meter.limit)} · {pct}%
        </Ltr>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div
          className={cn("h-full rounded-full", share >= 0.8 ? "bg-destructive" : share >= 0.6 ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${Math.round(n / 1024)} KB`
}
