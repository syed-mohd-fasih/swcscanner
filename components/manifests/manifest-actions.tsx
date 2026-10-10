"use client"

import { FileSpreadsheetIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { deleteManifestAction, updateManifestAction } from "@/app/actions/admin"
import { PieceCountList, useExportFlow } from "@/components/export/use-export-flow"
import { Callout } from "@/components/shared/callout"
import { DateInput, Field } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Item } from "@/domain/items/types"
import { pieceCounts } from "@/domain/manifests/rules"
import type { Manifest } from "@/domain/manifests/types"
import { fmt, useI18n } from "@/lib/i18n/client"
import { callAction } from "@/lib/submit-op"

/** Edit and Delete buttons for the manifest page header. */
export function ManifestActions({ manifest, items }: { manifest: Manifest; items: Item[] }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => setEditing(true)}>
        <PencilIcon />
        {t.manifests.edit}
      </Button>
      <Button variant="outline" className="text-destructive-ink hover:bg-destructive/10" onClick={() => setDeleting(true)}>
        <Trash2Icon />
        {t.manifests.delete}
      </Button>
      {editing && <EditDialog manifest={manifest} onClose={() => setEditing(false)} />}
      <DeleteDialog manifest={manifest} items={items} open={deleting} onOpenChange={setDeleting} />
    </div>
  )
}

function EditDialog({ manifest, onClose }: { manifest: Manifest; onClose: () => void }) {
  const { t } = useI18n()
  const router = useRouter()
  const confirm = useConfirm()
  const [form, setForm] = useState({
    manifestName: manifest.manifestName,
    truckId: manifest.truckId,
    date: manifest.date,
    notes: manifest.notes ?? "",
  })
  const [busy, setBusy] = useState(false)
  const valid = form.manifestName.trim() !== "" && form.truckId.trim() !== "" && form.date !== ""

  async function save() {
    if (!(await confirm({ description: t.manifests.confirmEdit }))) return
    setBusy(true)
    const saved = await callAction(
      t,
      () => updateManifestAction({ manifestId: manifest.manifestId, ...form, notes: form.notes.trim() || null }),
      t.manifests.saved
    )
    setBusy(false)
    if (!saved) return
    onClose()
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.manifests.editTitle}</DialogTitle>
          <DialogDescription>{t.manifests.carrierFixed}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label={t.fields.manifestName} htmlFor="me-name">
            <Input
              id="me-name"
              name="manifestName"
              dir="ltr"
              maxLength={120}
              value={form.manifestName}
              onChange={(e) => setForm((f) => ({ ...f, manifestName: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.fields.truckId} htmlFor="me-truck">
              <Input
                id="me-truck"
                name="truckId"
                dir="ltr"
                maxLength={40}
                value={form.truckId}
                onChange={(e) => setForm((f) => ({ ...f, truckId: e.target.value }))}
              />
            </Field>
            <Field label={t.fields.manifestDate} htmlFor="me-date">
              <DateInput id="me-date" value={form.date} onChange={(date) => setForm((f) => ({ ...f, date }))} />
            </Field>
          </div>
          <Field label={t.fields.notes} htmlFor="me-notes">
            <Textarea
              id="me-notes"
              name="notes"
              maxLength={500}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.app.cancel}
          </Button>
          <Button disabled={!valid || busy} onClick={() => void save()}>
            {t.app.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Two ways out: delete now, or export this manifest (one sheet) first. */
function DeleteDialog({
  manifest,
  items,
  open,
  onOpenChange,
}: {
  manifest: Manifest
  items: Item[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const router = useRouter()
  const exportFlow = useExportFlow()
  const [busy, setBusy] = useState(false)
  const counts = pieceCounts(items)

  async function deleteNow() {
    setBusy(true)
    const r = await callAction(t, () => deleteManifestAction({ manifestId: manifest.manifestId }))
    setBusy(false)
    if (!r) return
    toast.success(fmt(t.manifests.deletedManifest, { n: r.deletedPieces }))
    onOpenChange(false)
    router.replace("/manifests")
    router.refresh()
  }

  async function exportThenDelete() {
    onOpenChange(false)
    const outcome = await exportFlow({ manifestIds: [manifest.manifestId], includeUnidentified: false }, { single: true })
    if (outcome !== "deleted") return
    router.replace("/manifests")
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.manifests.deleteTitle}</DialogTitle>
          <DialogDescription>{fmt(t.manifests.deleteHelp, { n: items.length })}</DialogDescription>
        </DialogHeader>
        <PieceCountList counts={counts} />
        <Callout tone="danger" className="font-semibold">
          {t.confirm.irreversible}
        </Callout>
        <DialogFooter className="gap-2 sm:flex-col sm:items-stretch">
          <Button disabled={busy} onClick={() => void exportThenDelete()}>
            <FileSpreadsheetIcon />
            {t.manifests.exportAndDelete}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void deleteNow()}>
            <Trash2Icon />
            {t.manifests.deleteOnly}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t.app.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
