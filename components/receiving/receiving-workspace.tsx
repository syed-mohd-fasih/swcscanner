"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import type { RawScan } from "@/carriers"
import { ItemStatus } from "@/components/items/status-badges"
import { useSession } from "@/components/providers/session-provider"
import { VerificationDialog } from "@/components/receiving/verification-dialog"
import { ScanInput } from "@/components/scanner/scan-input"
import { PageHeader } from "@/components/shared/page-header"
import { SessionPicker } from "@/components/shared/session-picker"
import { Ltr, LoadingState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLocalQuery } from "@/hooks/use-local-query"
import { useWorkSession } from "@/hooks/use-work-session"
import { useWorkspacePull } from "@/hooks/use-workspace-pull"
import { useI18n } from "@/lib/i18n/client"
import { carrierRepository } from "@/repositories/indexeddb"
import { lookupReceivingScan, recentReceipts, type ScanLookup } from "@/services/receiving"
import { pullReceivingWorkspace } from "@/sync/pull"

const REFRESH_MS = 60_000

/**
 * Receiving: choose carrier + date, download that carrier's open items once,
 * then every scan is a local lookup (no network per scan).
 */
export function ReceivingWorkspace() {
  const { t } = useI18n()
  const { ready } = useSession()
  const { session, setSession, loaded } = useWorkSession("receiving")
  const [editing, setEditing] = useState(false)
  const [lookup, setLookup] = useState<ScanLookup | null>(null)

  const carrier = useLocalQuery(
    () => (session ? carrierRepository.get(session.carrierCode) : Promise.resolve(undefined)),
    [session?.carrierCode]
  ).data
  const recent = useLocalQuery(() => recentReceipts(), []).data ?? []

  // initial full pull for the session carrier, then cheap deltas
  const preparing = useWorkspacePull(
    ready && session ? session.carrierCode : null,
    (full) => pullReceivingWorkspace(session!.carrierCode, full),
    { refreshMs: REFRESH_MS, onError: () => toast.warning(t.receiving.prepareFailed) }
  )

  const onScan = useCallback(
    async (scan: RawScan) => {
      if (!carrier || !session) return
      const result = await lookupReceivingScan(carrier, scan, session.date)
      if (result.parse.kind === "wrong_barcode") return void toast.warning(t.scanner.scanPdf417)
      if (result.parse.kind === "unreadable") return void toast.error(t.scanner.unreadable)
      setLookup(result)
    },
    [carrier, session, t]
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
          setEditing(false)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t.receiving.title}
        actions={
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Ltr>{carrier?.name ?? session.carrierCode}</Ltr> · <Ltr>{session.date}</Ltr> · {t.receiving.changeSession}
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-2">
          {preparing && <LoadingState label={t.receiving.preparing} />}
          <ScanInput
            mode={carrier?.parser === "fedexPdf417" ? "pdf417" : "linear"}
            paused={lookup !== null}
            onScan={(s) => void onScan(s)}
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
                {recent.map((item) => (
                  <li key={item.internalItemId}>
                    <Link href={`/items/${item.internalItemId}`} className="flex flex-col gap-1 py-2">
                      <span className="flex items-center justify-between gap-2 text-sm font-medium">
                        <Ltr className="truncate">{item.itemId}</Ltr>
                        <Ltr className="text-muted-foreground">
                          {item.pieceNumber}/{item.pieceTotal}
                        </Ltr>
                      </span>
                      <ItemStatus item={item} />
                    </Link>
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
      />
    </div>
  )
}
