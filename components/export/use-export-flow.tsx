"use client"

import { toast } from "sonner"

import { deleteExportedAction, exportManifestsAction } from "@/app/actions/admin"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import type { PieceCounts } from "@/domain/manifests/rules"
import { fmt, useI18n } from "@/lib/i18n/client"
import { callAction } from "@/lib/submit-op"
import { cn } from "@/lib/utils"

export type ExportSelection = { manifestIds: string[]; includeUnidentified: boolean }
export type ExportOutcome = "deleted" | "kept" | "failed"

/**
 * Export → save the .xlsx → offer to delete exactly what was exported.
 * The server builds the file; the phone only saves it.
 */
export function useExportFlow() {
  const { t } = useI18n()
  const confirm = useConfirm()

  return async function run(selection: ExportSelection, opts: { single?: boolean } = {}): Promise<ExportOutcome> {
    const toastId = toast.loading(t.export.preparing)
    const file = await callAction(t, () => exportManifestsAction({ ...selection, single: opts.single }))
    toast.dismiss(toastId)
    if (!file) return "failed"
    saveFile(file.fileName, file.fileBase64)
    toast.success(fmt(t.export.downloaded, { name: file.fileName }))

    const remove = await confirm({
      title: t.export.deleteTitle,
      description: fmt(t.export.deleteQuestion, { n: file.pieces }),
      details: <PieceCountList counts={file.counts} />,
      confirmLabel: t.export.deleteNow,
      cancelLabel: t.export.keep,
      irreversible: true,
    })
    if (!remove) return "kept"

    const report = await callAction(t, () => deleteExportedAction({ ...selection, snapshot: file.snapshot }))
    if (!report) return "failed"
    toast.success(fmt(t.export.deleted, { n: report.deletedPieces, m: report.deletedManifests }))
    if (report.changedPieces > 0) toast.warning(fmt(t.export.changedKept, { n: report.changedPieces }), { duration: 10_000 })
    if (report.keptManifests.length > 0)
      toast.info(fmt(t.export.manifestsKept, { names: report.keptManifests.join(", ") }), { duration: 10_000 })
    return "deleted"
  }
}

/** What deleting removes, with pieces still on the shelves in red. */
export function PieceCountList({ counts }: { counts: PieceCounts }) {
  const { t } = useI18n()
  const rows = [
    { n: counts.inWarehouse, text: t.export.inWarehouse, tone: "tone-danger font-semibold" },
    { n: counts.notReceived, text: t.export.notReceived, tone: "tone-neutral" },
    { n: counts.done, text: t.export.done, tone: "tone-success" },
  ].filter((r) => r.n > 0)
  if (rows.length === 0) return null
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.text} className={cn("rounded-lg border px-3 py-2 text-sm", r.tone)}>
          {fmt(r.text, { n: r.n })}
        </li>
      ))}
    </ul>
  )
}

function saveFile(name: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // give the browser time to start the download before releasing the file
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
