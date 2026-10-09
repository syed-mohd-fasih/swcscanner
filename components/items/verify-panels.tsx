"use client"

import { CheckCircle2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { resolveScans, type RawScan } from "@/carriers"
import { ItemDetails } from "@/components/items/item-details"
import { useCarrier } from "@/components/providers/config-provider"
import { ReceiptForm, receiptDraftComplete, toReceiptInput, type ReceiptDraft } from "@/components/receiving/receipt-form"
import { ScanInput } from "@/components/scanner/scan-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Item } from "@/domain/items/types"
import type { Manifest } from "@/domain/manifests/types"
import { isReleaseEligible } from "@/domain/release/rules"
import { todayBusinessDate } from "@/domain/shared/dates"
import { useI18n } from "@/lib/i18n/client"
import { submitOp } from "@/lib/submit-op"

/** Deep-link receiving verification for one known piece. */
export function ReceivingVerifyPanel({ item, manifest }: { item: Item | null; manifest: Manifest | null }) {
  const { t } = useI18n()
  const router = useRouter()
  const [draft, setDraft] = useState<ReceiptDraft>({ path: "store_later", dateOfReceival: todayBusinessDate() })
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!item) return
    setBusy(true)
    const outcome = await submitOp(
      t,
      "receivePiece",
      { internalItemId: item.internalItemId, receipt: toReceiptInput(draft) },
      `${item.itemId} ${item.pieceNumber}/${item.pieceTotal}`,
      t.receiving.received
    )
    setBusy(false)
    if (outcome.status === "done") router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <ItemDetails item={item} manifest={manifest} />
      {item?.receivingState === "expected" && (
        <Card>
          <CardHeader>
            <CardTitle>{t.receiving.confirmReceived}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ReceiptForm value={draft} onChange={setDraft} />
            <Button size="lg" className="h-12" disabled={!receiptDraftComplete(draft) || busy} onClick={() => void submit()}>
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
export function ReleaseVerifyPanel({ item, manifest }: { item: Item | null; manifest: Manifest | null }) {
  const { t } = useI18n()
  const router = useRouter()
  const carrier = useCarrier(item?.carrierCode)
  const [physicallyScanned, setPhysicallyScanned] = useState(false)
  const [busy, setBusy] = useState(false)

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
    setBusy(true)
    const outcome = await submitOp(
      t,
      "releaseScan",
      { internalItemId: item.internalItemId },
      `${item.itemId} ${item.pieceNumber}/${item.pieceTotal}`,
      t.release.scanned
    )
    setBusy(false)
    if (outcome.status === "done") router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <ItemDetails item={item} manifest={manifest} />
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
            <Button size="lg" className="h-12" disabled={!physicallyScanned || busy} onClick={() => void submit()}>
              {t.release.confirmScan}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
