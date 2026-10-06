"use client"

import { ChevronRightIcon, FlagIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { useSession } from "@/components/providers/session-provider"
import { PieceProgress, PieceSelector } from "@/components/receiving/pieces"
import { ReceiptForm, receiptDraftComplete, toReceiptInput, type ReceiptDraft } from "@/components/receiving/receipt-form"
import { UnidentifiedForm } from "@/components/receiving/unidentified-form"
import { Field, InfoList } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { Ltr } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import type { ParsedScan } from "@/carriers"
import type { CandidateGroup } from "@/domain/receiving/candidates"
import { useLocalQuery } from "@/hooks/use-local-query"
import { fmt, useI18n } from "@/lib/i18n/client"
import { manifestRepository } from "@/repositories/indexeddb"
import { confirmPiece, flagPieceMismatch, recordUnidentifiedPiece, type ScanLookup } from "@/services/receiving"

type View = { kind: "choose" } | { kind: "group"; key: string } | { kind: "new-unidentified" }

function initialView(lookup: ScanLookup): View {
  const groups = lookup.groups
  if (groups.length === 0) return { kind: "new-unidentified" }
  if (groups.length === 1) return { kind: "group", key: groups[0].key }
  return { kind: "choose" }
}

/**
 * The receiving verification step: the operator compares system data with
 * the physical label, identifies the piece, and commits storage.
 */
export function VerificationDialog({
  lookup,
  carrierCode,
  sessionDate,
  onClose,
}: {
  lookup: ScanLookup | null
  carrierCode: string
  sessionDate: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const open = lookup?.parse.kind === "parsed"
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-1.5rem)] overflow-y-auto sm:max-w-xl">
        {open && lookup.parse.kind === "parsed" && (
          <VerificationBody
            // remount per scan so local state resets
            key={lookup.parse.scan.raw + lookup.groups.length}
            lookup={lookup}
            scan={lookup.parse.scan}
            carrierCode={carrierCode}
            sessionDate={sessionDate}
            onDone={onClose}
          />
        )}
        {!open && <DialogTitle className="sr-only">{t.receiving.itemFound}</DialogTitle>}
      </DialogContent>
    </Dialog>
  )
}

function VerificationBody({
  lookup,
  scan,
  carrierCode,
  sessionDate,
  onDone,
}: {
  lookup: ScanLookup
  scan: ParsedScan
  carrierCode: string
  sessionDate: string
  onDone: () => void
}) {
  const { t } = useI18n()
  const [view, setView] = useState<View>(() => initialView(lookup))

  if (view.kind === "new-unidentified") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t.receiving.recordUnidentified}</DialogTitle>
          <DialogDescription>
            {lookup.groups.length === 0 ? t.receiving.notFoundHelp : t.receiving.checkLabel}
          </DialogDescription>
        </DialogHeader>
        <UnidentifiedForm
          initial={{ itemId: scan.itemId, ...scan.fields, pieceNumber: scan.pieceNumber, pieceTotal: scan.pieceTotal }}
          carrierCode={carrierCode}
          sessionDate={sessionDate}
          onDone={onDone}
        />
      </>
    )
  }

  if (view.kind === "choose") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            <Ltr>{scan.itemId}</Ltr>
          </DialogTitle>
          <DialogDescription>{t.receiving.multipleMatches}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {lookup.groups.map((g) => (
            <li key={g.key}>
              <GroupChoice group={g} onChoose={() => setView({ kind: "group", key: g.key })} />
            </li>
          ))}
        </ul>
        <Button variant="outline" onClick={() => setView({ kind: "new-unidentified" })}>
          {t.receiving.notMatching}
        </Button>
      </>
    )
  }

  const group = lookup.groups.find((g) => g.key === view.key)!
  return (
    <GroupVerification
      group={group}
      scan={scan}
      sessionDate={sessionDate}
      onBack={lookup.groups.length > 1 ? () => setView({ kind: "choose" }) : undefined}
      onNotMatching={() => setView({ kind: "new-unidentified" })}
      onDone={onDone}
    />
  )
}

function useManifest(manifestId: string | null) {
  return useLocalQuery(() => (manifestId ? manifestRepository.get(manifestId) : Promise.resolve(undefined)), [manifestId]).data
}

function GroupChoice({ group, onChoose }: { group: CandidateGroup; onChoose: () => void }) {
  const { t } = useI18n()
  const manifest = useManifest(group.manifestId)
  const first = group.pieces[0]
  return (
    <button
      type="button"
      onClick={onChoose}
      className="flex w-full items-center gap-3 rounded-2xl border p-3 text-start hover:bg-muted"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {group.kind === "manifested" ? (
            <Ltr className="font-semibold">{manifest?.manifestName ?? t.states.manifest}</Ltr>
          ) : (
            <Badge variant="outline">{t.states.receiving.unidentified}</Badge>
          )}
          {group.manifestDate && <Ltr className="text-muted-foreground">{group.manifestDate}</Ltr>}
        </div>
        <span className="truncate text-muted-foreground">
          {[first.shipper, first.consignee].filter(Boolean).join(" → ") || "—"}
        </span>
        <span>
          {t.receiving.found}: <Ltr>{group.progress.found.length}/{group.progress.total}</Ltr>
        </span>
      </div>
      <ChevronRightIcon className="size-4 shrink-0 rtl:rotate-180" />
    </button>
  )
}

function GroupVerification({
  group,
  scan,
  sessionDate,
  onBack,
  onNotMatching,
  onDone,
}: {
  group: CandidateGroup
  scan: ParsedScan
  sessionDate: string
  onBack?: () => void
  onNotMatching: () => void
  onDone: () => void
}) {
  const { t } = useI18n()
  const { user } = useSession()
  const confirm = useConfirm()
  const manifest = useManifest(group.manifestId)
  const first = group.pieces[0]
  const available = group.progress.available
  const preset = scan.pieceNumber && available.includes(scan.pieceNumber) ? scan.pieceNumber : null
  const [piece, setPiece] = useState<number | null>(preset ?? (available.length === 1 ? available[0] : null))
  const [draft, setDraft] = useState<ReceiptDraft>({ path: "store_later", dateOfReceival: sessionDate })
  const [showMismatch, setShowMismatch] = useState(false)
  const [labelTotal, setLabelTotal] = useState(scan.pieceTotal && scan.pieceTotal !== group.pieceTotal ? String(scan.pieceTotal) : "")
  const [busy, setBusy] = useState(false)

  const isUnidentified = group.kind === "unidentified"
  const canConfirm = piece !== null && available.includes(piece) && receiptDraftComplete(draft)
  const pieceLabel = `${piece}/${group.pieceTotal}`

  async function confirmReceived() {
    if (!canConfirm || piece === null) return
    const ok = await confirm({
      description: fmt(isUnidentified ? t.receiving.confirmUnidentifiedText : t.receiving.confirmReceiveText, {
        piece: pieceLabel,
        itemId: group.itemId,
      }),
    })
    if (!ok) return
    setBusy(true)
    const result = isUnidentified
      ? await recordUnidentifiedPiece(
          {
            ...toReceiptInput(draft),
            label: {
              itemId: first.itemId,
              carrierCode: first.carrierCode,
              shipper: first.shipper,
              consignee: first.consignee,
              weight: first.weight,
              description: first.description,
            },
            pieceNumber: piece,
            pieceTotal: group.pieceTotal,
          },
          user.uid
        )
      : await confirmPiece(group.pieces.find((p) => p.pieceNumber === piece)!.internalItemId, toReceiptInput(draft), user.uid)
    setBusy(false)
    if (!result.ok) return void toast.error(result.error.message)
    toast.success(isUnidentified ? t.receiving.unidentifiedSaved : t.receiving.received)
    onDone()
  }

  async function flagMismatch() {
    const target = group.pieces.find((p) => p.pieceNumber === piece) ?? group.pieces[0]
    const ok = await confirm({ description: fmt(t.receiving.confirmFlagText, { itemId: group.itemId }) })
    if (!ok) return
    const total = labelTotal ? Number(labelTotal) : null
    const result = await flagPieceMismatch(target.internalItemId, total, null, user.uid)
    if (!result.ok) return void toast.error(result.error.message)
    toast.success(t.receiving.flagged)
    setShowMismatch(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {isUnidentified ? t.receiving.existingUnidentified : t.receiving.itemFound}
        </DialogTitle>
        <DialogDescription>{t.receiving.checkLabel}</DialogDescription>
      </DialogHeader>

      <InfoList
        rows={[
          { label: t.fields.itemId, value: <Ltr>{group.itemId}</Ltr> },
          ...(isUnidentified
            ? [{ label: t.states.manifest, value: t.states.noManifest }]
            : [
                { label: t.states.manifest, value: <Ltr>{manifest?.manifestName ?? "—"}</Ltr> },
                { label: t.receiving.manifestDate, value: <Ltr>{group.manifestDate ?? "—"}</Ltr> },
              ]),
          { label: t.fields.carrier, value: <Ltr>{first.carrierCode}</Ltr> },
          { label: t.fields.shipper, value: first.shipper && <Ltr>{first.shipper}</Ltr> },
          { label: t.fields.consignee, value: first.consignee && <Ltr>{first.consignee}</Ltr> },
          { label: t.fields.weight, value: first.weight !== null && <Ltr>{first.weight}</Ltr> },
          { label: t.fields.description, value: first.description && <Ltr>{first.description}</Ltr> },
          { label: t.fields.quantity, value: <Ltr>{group.pieceTotal}</Ltr> },
        ]}
      />

      <Separator />
      <PieceProgress progress={group.progress} />

      {available.length === 0 ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{t.receiving.allFound}</p>
      ) : (
        <>
          <Field label={t.receiving.whichPiece}>
            <PieceSelector total={group.pieceTotal} available={available} value={piece} onChange={setPiece} />
          </Field>
          <ReceiptForm value={draft} onChange={setDraft} />
          <Button size="lg" className="h-12" disabled={!canConfirm || busy} onClick={() => void confirmReceived()}>
            {isUnidentified ? t.receiving.recordUnidentified : t.receiving.confirmReceived}
          </Button>
        </>
      )}

      <div className="flex flex-col gap-2">
        {!isUnidentified && (
          <Button variant="outline" onClick={onNotMatching}>
            {t.receiving.notMatching}
          </Button>
        )}
        {showMismatch ? (
          <div className="flex items-end gap-2 rounded-xl border p-3">
            <Field label={t.receiving.labelQuantity} htmlFor="label-total" className="flex-1">
              <Input
                id="label-total"
                type="number"
                inputMode="numeric"
                min={1}
                dir="ltr"
                className="h-11"
                value={labelTotal}
                onChange={(e) => setLabelTotal(e.target.value)}
              />
            </Field>
            <Button variant="destructive" className="h-11" onClick={() => void flagMismatch()}>
              <FlagIcon />
              {t.app.confirm}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setShowMismatch(true)}>
            <FlagIcon />
            {t.receiving.quantityDiffers}
          </Button>
        )}
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            {t.app.back}
          </Button>
        )}
      </div>
    </>
  )
}
