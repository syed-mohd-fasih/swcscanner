"use client"

import { CheckCircle2Icon, CloudUploadIcon, LoaderIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { carrierDayProgress, receivingLookup } from "@/app/actions/operator"
import { resolveScans, type RawScan } from "@/carriers"
import { useCarrier } from "@/components/providers/config-provider"
import { VerificationDialog, type ReceiptEntry } from "@/components/receiving/verification-dialog"
import { ScanInput } from "@/components/scanner/scan-input"
import { PageHeader } from "@/components/shared/page-header"
import { SessionPicker } from "@/components/shared/session-picker"
import { Ltr, LoadingState } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CarrierDayProgress } from "@/server/data/stats"
import type { ScanLookup } from "@/server/services/receiving"
import { useWorkSession } from "@/hooks/use-work-session"
import { errorText, failureText } from "@/lib/errors"
import { fmt, useI18n } from "@/lib/i18n/client"

const RECENT_MAX = 20

/**
 * Receiving: choose carrier + date, then scan. Barcodes are parsed on the
 * phone first (non-item barcodes never reach the server); each real scan is
 * one exact server lookup.
 */
export function ReceivingWorkspace() {
  const { t } = useI18n()
  const { session, setSession, loaded } = useWorkSession("receiving")
  const [editing, setEditing] = useState(false)
  const [lookup, setLookup] = useState<ScanLookup | null>(null)
  const [checking, setChecking] = useState(false)
  const carrier = useCarrier(session?.carrierCode)
  const recentKey = session ? `swc:recent:receiving:${session.carrierCode}:${session.date}` : null
  const [recent, setRecent] = useRecent(recentKey)
  const [progress, setProgress] = useState<CarrierDayProgress | null>(null)

  // one cached count per session start (shared server cache, ≤ 1 min old)
  useEffect(() => {
    if (!session) return
    let live = true
    carrierDayProgress({ carrierCode: session.carrierCode, date: session.date })
      .then((r) => live && r.ok && setProgress(r.value))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [session])

  const onScan = useCallback(
    async (scans: RawScan[]) => {
      if (!carrier || !session || checking) return false
      const resolved = resolveScans(carrier, scans)
      // only non-item barcodes in view (e.g. DHL routing code): keep scanning
      if (resolved.kind === "ignored") return false
      if (resolved.kind === "wrong_barcode") return void toast.warning(t.scanner.scanPdf417)
      if (resolved.kind === "unreadable") return void toast.error(t.scanner.unreadable)
      setChecking(true)
      try {
        const result = await receivingLookup({ carrierCode: carrier.carrierCode, scans, sessionDate: session.date })
        if (!result.ok) return void toast.error(errorText(t, result.error))
        if (result.value.parse.kind === "parsed") setLookup(result.value)
      } catch (e) {
        toast.error(navigator.onLine ? failureText(t, e) : t.receiving.lookupOffline)
      } finally {
        setChecking(false)
      }
    },
    [carrier, session, checking, t]
  )

  const onRecorded = useCallback(
    (entry: ReceiptEntry) => {
      setRecent((list) => [entry, ...list.filter((e) => e.key !== entry.key)].slice(0, RECENT_MAX))
      setProgress((p) =>
        p && {
          receivedOnDate: p.receivedOnDate + (entry.kind === "received" ? 1 : 0),
          stillExpected: Math.max(0, p.stillExpected - (entry.wasExpected ? 1 : 0)),
        }
      )
    },
    [setRecent]
  )

  if (!loaded) return <LoadingState />

  if (!session || editing) {
    return (
      <SessionPicker
        title={t.receiving.startSession}
        carrierLabel={t.receiving.sessionCarrier}
        withDate
        initial={session}
        onStart={(s) => {
          setSession(s)
          setProgress(null)
          setEditing(false)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t.receiving.title}
        description={
          progress ? fmt(t.receiving.progress, { received: progress.receivedOnDate, expected: progress.stillExpected }) : undefined
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Ltr>{carrier?.name ?? session.carrierCode}</Ltr> · <Ltr>{session.date}</Ltr> · {t.receiving.changeSession}
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-2">
          {checking && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              {t.receiving.checking}
            </p>
          )}
          <ScanInput
            mode={carrier?.parser === "fedexPdf417" ? "pdf417" : "linear"}
            paused={lookup !== null || checking}
            onScan={onScan}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t.receiving.recent}</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.receiving.noRecent}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {recent.map((entry) => (
                  <li key={entry.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      {entry.queued ? (
                        <CloudUploadIcon className="size-4 shrink-0 text-muted-foreground" aria-label={t.sync.waiting} />
                      ) : (
                        <CheckCircle2Icon className="size-4 shrink-0 text-primary" />
                      )}
                      <Ltr className="truncate font-medium">{entry.itemId}</Ltr>
                      {entry.kind === "unidentified" && <Badge variant="outline">{t.states.receiving.unidentified}</Badge>}
                    </span>
                    <Ltr className="text-muted-foreground tabular-nums">{entry.piece}</Ltr>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <VerificationDialog
        lookup={lookup}
        carrierCode={session.carrierCode}
        sessionDate={session.date}
        onClose={() => setLookup(null)}
        onRecorded={onRecorded}
      />
    </div>
  )
}

/** This session's receipts, kept in the tab (no server reads). */
function useRecent(key: string | null) {
  const [state, setState] = useState<{ key: string | null; list: ReceiptEntry[] }>({ key: null, list: [] })
  let list = state.list
  if (state.key !== key) {
    list = read(key)
    setState({ key, list })
  }
  const set = useCallback(
    (update: (list: ReceiptEntry[]) => ReceiptEntry[]) =>
      setState((s) => {
        const next = update(s.list)
        try {
          if (s.key) sessionStorage.setItem(s.key, JSON.stringify(next))
        } catch {
          // storage unavailable — the list still shows for this visit
        }
        return { key: s.key, list: next }
      }),
    []
  )
  return [list, set] as const
}

function read(key: string | null): ReceiptEntry[] {
  if (!key || typeof window === "undefined") return []
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "[]") as ReceiptEntry[]
  } catch {
    return []
  }
}
