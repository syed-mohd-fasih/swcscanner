"use client"

import { ChevronDownIcon, ChevronRightIcon, FlagIcon } from "lucide-react"
import { useState } from "react"

import type { ParsedScan } from "@/carriers"
import { Callout } from "@/components/shared/callout"
import { PieceProgress, PieceSelector } from "@/components/receiving/pieces"
import { ReceiptForm, receiptDraftComplete, toReceiptInput, type ReceiptDraft } from "@/components/receiving/receipt-form"
import { UnidentifiedForm } from "@/components/receiving/unidentified-form"
import { Field, InfoList } from "@/components/shared/fields"
import { Ltr } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Manifest } from "@/domain/manifests/types"
import type { CandidateGroup } from "@/domain/receiving/candidates"
import { useI18n } from "@/lib/i18n/client"
import { submitOp } from "@/lib/submit-op"
import type { ScanLookup } from "@/server/services/receiving"

/** What the receiving screen shows in "recent scans" after a receipt. */
export type ReceiptEntry = {
  key: string
  itemId: string
  piece: string
  kind: "received" | "unidentified"
  queued: boolean
  /** manifested piece: one fewer still expected */
  wasExpected: boolean
}

type View = { kind: "choose" } | { kind: "group"; key: string } | { kind: "new-unidentified" }

function initialView(lookup: ScanLookup): View {
  const groups = lookup.groups
  if (groups.length === 0) return { kind: "new-unidentified" }
  if (groups.length === 1) return { kind: "group", key: groups[0].key }
  return { kind: "choose" }
}

/**
 * The receiving verification step: the operator compares system data with
 * the physical label, picks the piece and confirms — one tap, no extra
 * "are you sure" (the dialog itself is the check).
 */
export function VerificationDialog({
  lookup,
  carrierCode,
  sessionDate,
  onClose,
  onRecorded,
}: {
  lookup: ScanLookup | null
  carrierCode: string
  sessionDate: string
  onClose: () => void
  onRecorded: (entry: ReceiptEntry) => void
}) {
  const { t } = useI18n()
  const open = lookup?.parse.kind === "parsed"
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[calc(100svh-1.5rem)] overflow-y-auto pb-0 sm:max-w-xl"
        // no focus ring on the first button (and no keyboard popping up)
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {open && lookup.parse.kind === "parsed" && (
          <VerificationBody
            // remount per scan so local state resets
            key={lookup.parse.scan.raw + lookup.groups.length}
            lookup={lookup}
            scan={lookup.parse.scan}
            carrierCode={carrierCode}
            sessionDate={sessionDate}
            onDone={(entry) => {
              onRecorded(entry)
              onClose()
            }}
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
  onDone: (entry: ReceiptEntry) => void
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
      <div className="flex flex-col gap-4 pb-6">
        <DialogHeader>
          <DialogTitle>
            <Ltr>{scan.itemId}</Ltr>
          </DialogTitle>
          <DialogDescription>{t.receiving.multipleMatches}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {lookup.groups.map((g) => (
            <li key={g.key}>
              <GroupChoice
                group={g}
                manifest={g.manifestId ? lookup.manifests[g.manifestId] : undefined}
                onChoose={() => setView({ kind: "group", key: g.key })}
              />
            </li>
          ))}
        </ul>
        <Button variant="outline" onClick={() => setView({ kind: "new-unidentified" })}>
          {t.receiving.notMatching}
        </Button>
      </div>
    )
  }

  const group = lookup.groups.find((g) => g.key === view.key)!
  return (
    <GroupVerification
      group={group}
      manifest={group.manifestId ? lookup.manifests[group.manifestId] : undefined}
      scan={scan}
      sessionDate={sessionDate}
      onBack={lookup.groups.length > 1 ? () => setView({ kind: "choose" }) : undefined}
      onNotMatching={() => setView({ kind: "new-unidentified" })}
      onDone={onDone}
    />
  )
}

function GroupChoice({ group, manifest, onChoose }: { group: CandidateGroup; manifest?: Manifest; onChoose: () => void }) {
  const { t } = useI18n()
  const first = group.pieces[0]
  return (
    <button
      type="button"
      onClick={onChoose}
      className="surface-interactive flex w-full items-center gap-3 p-3 text-start"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {group.kind === "manifested" ? (
            <Ltr className="font-semibold">{manifest?.manifestName ?? t.states.manifest}</Ltr>
          ) : (
            <Badge variant="warning">{t.states.receiving.unidentified}</Badge>
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
  manifest,
  scan,
  sessionDate,
  onBack,
  onNotMatching,
  onDone,
}: {
  group: CandidateGroup
  manifest?: Manifest
  scan: ParsedScan
  sessionDate: string
  onBack?: () => void
  onNotMatching: () => void
  onDone: (entry: ReceiptEntry) => void
}) {
  const { t } = useI18n()
  const first = group.pieces[0]
  const available = group.progress.available
  const preset = scan.pieceNumber && available.includes(scan.pieceNumber) ? scan.pieceNumber : null
  const [piece, setPiece] = useState<number | null>(preset ?? (available.length === 1 ? available[0] : null))
  const [draft, setDraft] = useState<ReceiptDraft>({ path: "store_later", dateOfReceival: sessionDate })
  const [more, setMore] = useState(false)
  const [showMismatch, setShowMismatch] = useState(false)
  const [labelTotal, setLabelTotal] = useState(scan.pieceTotal && scan.pieceTotal !== group.pieceTotal ? String(scan.pieceTotal) : "")
  const [busy, setBusy] = useState(false)

  const isUnidentified = group.kind === "unidentified"
  const canConfirm = piece !== null && available.includes(piece) && receiptDraftComplete(draft)

  async function confirmReceived() {
    if (!canConfirm || piece === null) return
    const label = `${group.itemId} ${piece}/${group.pieceTotal}`
    setBusy(true)
    const outcome = isUnidentified
      ? await submitOp(
          t,
          "recordUnidentified",
          {
            piece: {
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
          },
          label,
          t.receiving.unidentifiedSaved
        )
      : await submitOp(
          t,
          "receivePiece",
          { internalItemId: group.pieces.find((p) => p.pieceNumber === piece)!.internalItemId, receipt: toReceiptInput(draft) },
          label,
          t.receiving.received
        )
    setBusy(false)
    if (outcome.status === "failed") return
    onDone({
      key: `${group.key}#${piece}`,
      itemId: group.itemId,
      piece: `${piece}/${group.pieceTotal}`,
      kind: isUnidentified ? "unidentified" : "received",
      queued: outcome.status === "queued",
      wasExpected: !isUnidentified,
    })
  }

  async function flagMismatch() {
    const target = group.pieces.find((p) => p.pieceNumber === piece) ?? group.pieces[0]
    const total = labelTotal ? Number(labelTotal) : null
    const outcome = await submitOp(
      t,
      "flagMismatch",
      { internalItemId: target.internalItemId, labelTotal: total, note: null },
      `${group.itemId} ≠ ${total ?? "?"}`,
      t.receiving.flagged
    )
    if (outcome.status !== "failed") setShowMismatch(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          <Ltr>{group.itemId}</Ltr>
          {isUnidentified && <Badge variant="warning">{t.states.receiving.unidentified}</Badge>}
        </DialogTitle>
        <DialogDescription>
          {isUnidentified ? t.receiving.existingUnidentified : <Ltr>{manifest?.manifestName ?? t.states.manifest}</Ltr>}
        </DialogDescription>
      </DialogHeader>

      <InfoList
        rows={[
          { label: t.fields.consignee, value: first.consignee && <Ltr>{first.consignee}</Ltr> },
          { label: t.fields.quantity, value: <Ltr>{group.pieceTotal}</Ltr> },
          ...(more
            ? [
                { label: t.fields.shipper, value: first.shipper && <Ltr>{first.shipper}</Ltr> },
                { label: t.fields.description, value: first.description && <Ltr>{first.description}</Ltr> },
                { label: t.fields.weight, value: first.weight !== null && <Ltr>{first.weight}</Ltr> },
                { label: t.fields.carrier, value: <Ltr>{first.carrierCode}</Ltr> },
                ...(isUnidentified ? [] : [{ label: t.receiving.manifestDate, value: <Ltr>{group.manifestDate ?? "—"}</Ltr> }]),
              ]
            : []),
        ]}
      />
      <Button variant="ghost" size="sm" className="-mt-2 self-start" onClick={() => setMore((m) => !m)}>
        <ChevronDownIcon className={more ? "rotate-180" : undefined} />
        {more ? t.receiving.lessDetails : t.receiving.moreDetails}
      </Button>

      <PieceProgress progress={group.progress} />

      {available.length === 0 ? (
        <Callout tone="success">{t.receiving.allFound}</Callout>
      ) : (
        <>
          <Field label={t.receiving.whichPiece}>
            <PieceSelector total={group.pieceTotal} available={available} value={piece} onChange={setPiece} />
          </Field>
          <ReceiptForm value={draft} onChange={setDraft} />
        </>
      )}

      <div className="flex flex-col gap-2">
        {!isUnidentified && (
          <Button variant="outline" onClick={onNotMatching}>
            {t.receiving.notMatching}
          </Button>
        )}
        {showMismatch ? (
          <div className="tone-warning flex items-end gap-2 rounded-xl border p-3 animate-in fade-in-0 slide-in-from-top-1">
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
            <Button variant="warning" className="h-11" onClick={() => void flagMismatch()}>
              <FlagIcon />
              {t.app.confirm}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" className="text-warning-ink" onClick={() => setShowMismatch(true)}>
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

      {available.length > 0 && (
        <div className="sticky bottom-0 -mx-6 border-t bg-popover/95 px-6 py-3 backdrop-blur">
          <Button size="lg" className="h-12 w-full" disabled={!canConfirm || busy} onClick={() => void confirmReceived()}>
            {isUnidentified ? t.receiving.recordUnidentified : t.receiving.confirmReceived}
            {piece !== null && <Ltr> · {piece}/{group.pieceTotal}</Ltr>}
          </Button>
        </div>
      )}
      {available.length === 0 && <div className="pb-6" />}
    </>
  )
}
