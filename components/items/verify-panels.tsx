"use client"

import { CheckCircle2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { resolveScans, type RawScan } from "@/carriers"
import { ItemDetails, useItem } from "@/components/items/item-details"
import { useSession } from "@/components/providers/session-provider"
import { ReceiptForm, receiptDraftComplete, toReceiptInput, type ReceiptDraft } from "@/components/receiving/receipt-form"
import { ScanInput } from "@/components/scanner/scan-input"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { isReleaseEligible } from "@/domain/release/rules"
import { todayBusinessDate } from "@/domain/shared/dates"
import { useLocalQuery } from "@/hooks/use-local-query"
import { fmt, useI18n } from "@/lib/i18n/client"
import { carrierRepository } from "@/repositories/indexeddb"
import { confirmPiece } from "@/services/receiving"
import { releaseScanPiece } from "@/services/release"

/** Deep-link receiving verification for one known piece. */
export function ReceivingVerifyPanel({ internalItemId }: { internalItemId: string }) {
  const { t } = useI18n()
  const { user } = useSession()
  const confirm = useConfirm()
  const { item } = useItem(internalItemId)
  const [draft, setDraft] = useState<ReceiptDraft>({ path: "store_later", dateOfReceival: todayBusinessDate() })

  async function submit() {
    if (!item) return
    const ok = await confirm({
      description: fmt(t.receiving.confirmReceiveText, { piece: `${item.pieceNumber}/${item.pieceTotal}`, itemId: item.itemId }),
    })
    if (!ok) return
    const result = await confirmPiece(item.internalItemId, toReceiptInput(draft), user.uid)
    if (!result.ok) return void toast.error(result.error.message)
    toast.success(t.receiving.received)
  }

  return (
    <div className="flex flex-col gap-4">
      <ItemDetails internalItemId={internalItemId} />
      {item?.receivingState === "expected" && (
        <Card>
          <CardHeader>
            <CardTitle>{t.receiving.confirmReceived}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ReceiptForm value={draft} onChange={setDraft} />
            <Button size="lg" className="h-12" disabled={!receiptDraftComplete(draft)} onClick={() => void submit()}>
              {t.receiving.confirmReceived}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Deep-link release verification. The confirm button stays disabled until
 * the physical label has been scanned and matches this item.
 */
export function ReleaseVerifyPanel({ internalItemId }: { internalItemId: string }) {
  const { t } = useI18n()
  const { user } = useSession()
  const confirm = useConfirm()
  const { item } = useItem(internalItemId)
  const carrier = useLocalQuery(
    () => (item ? carrierRepository.get(item.carrierCode) : Promise.resolve(undefined)),
    [item?.carrierCode]
  ).data
  const [physicallyScanned, setPhysicallyScanned] = useState(false)

  function onScan(scans: RawScan[]) {
    if (!carrier || !item) return false
    const resolved = resolveScans(carrier, scans)
    if (resolved.kind === "ignored") return false
    if (resolved.kind === "wrong_barcode") return void toast.warning(t.scanner.scanPdf417)
    const ids =
      resolved.kind === "candidates"
        ? resolved.candidates.flatMap((c) => [c.itemId, ...(c.alternateIds ?? [])])
        : []
    if (!ids.includes(item.itemId)) {
      return void toast.error(t.scanner.unreadable)
    }
    setPhysicallyScanned(true)
  }

  async function submit() {
    if (!item) return
    const ok = await confirm({
      description: fmt(t.release.confirmScanText, { piece: `${item.pieceNumber}/${item.pieceTotal}`, itemId: item.itemId }),
    })
    if (!ok) return
    const result = await releaseScanPiece(item.internalItemId, user.uid)
    if (!result.ok) return void toast.error(result.error.message)
    toast.success(t.release.scanned)
  }

  return (
    <div className="flex flex-col gap-4">
      <ItemDetails internalItemId={internalItemId} />
      {item && isReleaseEligible(item) && (
        <Card>
          <CardHeader>
            <CardTitle>{t.release.confirmScan}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {physicallyScanned ? (
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                <CheckCircle2Icon className="size-4" />
                {t.release.scanned}
              </p>
            ) : (
              <ScanInput
                mode={carrier?.parser === "fedexPdf417" ? "pdf417" : "linear"}
                paused={false}
                onScan={onScan}
              />
            )}
            <Button size="lg" className="h-12" disabled={!physicallyScanned} onClick={() => void submit()}>
              {t.release.confirmScan}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
