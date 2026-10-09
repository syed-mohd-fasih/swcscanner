"use client"

import { useState } from "react"

import { PieceSelector } from "@/components/receiving/pieces"
import { ReceiptForm, receiptDraftComplete, toReceiptInput, type ReceiptDraft } from "@/components/receiving/receipt-form"
import { Field } from "@/components/shared/fields"
import { Ltr } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { LabelData } from "@/domain/items/types"
import type { ReceiptEntry } from "@/components/receiving/verification-dialog"
import { useI18n } from "@/lib/i18n/client"
import { submitOp } from "@/lib/submit-op"

/**
 * Capture a piece that matches no expected item. The operator copies the
 * label details so a later manifest can be matched by investigation.
 */
export function UnidentifiedForm({
  initial,
  carrierCode,
  sessionDate,
  onDone,
}: {
  initial: Partial<LabelData> & { pieceNumber?: number | null; pieceTotal?: number | null }
  carrierCode: string
  sessionDate: string
  onDone: (entry: ReceiptEntry) => void
}) {
  const { t } = useI18n()
  const [label, setLabel] = useState({
    itemId: initial.itemId ?? "",
    shipper: initial.shipper ?? "",
    consignee: initial.consignee ?? "",
    weight: initial.weight != null ? String(initial.weight) : "",
    description: initial.description ?? "",
  })
  const [total, setTotal] = useState(initial.pieceTotal ?? 1)
  const [piece, setPiece] = useState<number | null>(initial.pieceNumber ?? (initial.pieceTotal ? null : 1))
  const [draft, setDraft] = useState<ReceiptDraft>({ path: "store_later", dateOfReceival: sessionDate })
  const [busy, setBusy] = useState(false)

  const valid = label.itemId.trim() && total >= 1 && piece && piece <= total && receiptDraftComplete(draft)
  const set = (key: keyof typeof label) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setLabel((l) => ({ ...l, [key]: e.target.value }))

  async function submit() {
    if (!valid || !piece) return
    const itemId = label.itemId.trim()
    setBusy(true)
    const outcome = await submitOp(
      t,
      "recordUnidentified",
      {
        piece: {
          ...toReceiptInput(draft),
          label: {
            itemId,
            carrierCode,
            shipper: label.shipper.trim() || null,
            consignee: label.consignee.trim() || null,
            weight: label.weight ? Number(label.weight) : null,
            description: label.description.trim() || null,
          },
          pieceNumber: piece,
          pieceTotal: total,
        },
      },
      `${itemId} ${piece}/${total}`,
      t.receiving.unidentifiedSaved
    )
    setBusy(false)
    if (outcome.status === "failed") return
    onDone({
      key: `unidentified:${carrierCode}:${itemId}#${piece}`,
      itemId,
      piece: `${piece}/${total}`,
      kind: "unidentified",
      queued: outcome.status === "queued",
      wasExpected: false,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.fields.itemId} htmlFor="u-item">
          <Input id="u-item" dir="ltr" className="h-11" value={label.itemId} onChange={set("itemId")} />
        </Field>
        <Field label={t.fields.carrier}>
          <Ltr className="flex h-11 items-center font-medium">{carrierCode}</Ltr>
        </Field>
        <Field label={t.fields.shipper} htmlFor="u-shipper">
          <Input id="u-shipper" dir="ltr" className="h-11" value={label.shipper} onChange={set("shipper")} />
        </Field>
        <Field label={t.fields.consignee} htmlFor="u-consignee">
          <Input id="u-consignee" dir="ltr" className="h-11" value={label.consignee} onChange={set("consignee")} />
        </Field>
        <Field label={t.fields.weight} htmlFor="u-weight">
          <Input id="u-weight" dir="ltr" inputMode="decimal" className="h-11" value={label.weight} onChange={set("weight")} />
        </Field>
        <Field label={t.fields.description} htmlFor="u-desc">
          <Input id="u-desc" dir="ltr" className="h-11" value={label.description} onChange={set("description")} />
        </Field>
        <Field label={t.fields.quantity} htmlFor="u-qty">
          <Input
            id="u-qty"
            type="number"
            inputMode="numeric"
            min={1}
            dir="ltr"
            className="h-11"
            value={total}
            onChange={(e) => {
              const n = Math.max(1, Math.floor(Number(e.target.value) || 1))
              setTotal(n)
              if (piece && piece > n) setPiece(null)
            }}
          />
        </Field>
      </div>
      <Field label={t.receiving.whichPiece}>
        <PieceSelector
          total={total}
          available={Array.from({ length: total }, (_, i) => i + 1)}
          value={piece}
          onChange={setPiece}
        />
      </Field>
      <ReceiptForm value={draft} onChange={setDraft} />
      <div className="sticky bottom-0 -mx-6 border-t bg-popover/95 px-6 py-3 backdrop-blur">
        <Button size="lg" className="h-12 w-full" disabled={!valid || busy} onClick={() => void submit()}>
          {t.receiving.recordUnidentified}
        </Button>
      </div>
    </div>
  )
}
