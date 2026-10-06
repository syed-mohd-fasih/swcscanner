"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useSession } from "@/components/providers/session-provider"
import { PieceSelector } from "@/components/receiving/pieces"
import { ReceiptForm, receiptDraftComplete, toReceiptInput, type ReceiptDraft } from "@/components/receiving/receipt-form"
import { Field } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { Ltr } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { LabelData } from "@/domain/items/types"
import { fmt, useI18n } from "@/lib/i18n/client"
import { recordUnidentifiedPiece } from "@/services/receiving"

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
  onDone: () => void
}) {
  const { t } = useI18n()
  const { user } = useSession()
  const confirm = useConfirm()
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
    const ok = await confirm({
      description: fmt(t.receiving.confirmUnidentifiedText, { piece: `${piece}/${total}`, itemId: label.itemId }),
    })
    if (!ok) return
    setBusy(true)
    const result = await recordUnidentifiedPiece(
      {
        ...toReceiptInput(draft),
        label: {
          itemId: label.itemId,
          carrierCode,
          shipper: label.shipper.trim() || null,
          consignee: label.consignee.trim() || null,
          weight: label.weight ? Number(label.weight) : null,
          description: label.description.trim() || null,
        },
        pieceNumber: piece,
        pieceTotal: total,
      },
      user.uid
    )
    setBusy(false)
    if (!result.ok) return void toast.error(result.error.message)
    toast.success(t.receiving.unidentifiedSaved)
    onDone()
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
      <Button size="lg" className="h-12" disabled={!valid || busy} onClick={() => void submit()}>
        {t.receiving.recordUnidentified}
      </Button>
    </div>
  )
}
