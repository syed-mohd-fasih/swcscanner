"use client"

import { PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { CarrierSelect, DateInput, Field, useCarriers } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ManifestLine } from "@/domain/manifests/types"
import { todayBusinessDate } from "@/domain/shared/dates"
import { fmt, useI18n } from "@/lib/i18n/client"
import { genericCsvImporter } from "@/services/import"
import { createManifestAction } from "@/app/actions/admin"
import { generateManifestName } from "@/domain/manifests/rules"
import { newId } from "@/domain/shared/ids"
import { callAction } from "@/lib/submit-op"

type LineDraft = { key: number; itemId: string; carrierCode: string; shipper: string; consignee: string; quantity: string; weight: string; description: string }

let lineKey = 0
const emptyLine = (carrierCode: string): LineDraft => ({
  key: ++lineKey,
  itemId: "",
  carrierCode,
  shipper: "",
  consignee: "",
  quantity: "1",
  weight: "",
  description: "",
})

/** Admin types a manifest: shared header + one line per itemId (quantity = pieces). */
export function ManifestForm() {
  const { t } = useI18n()
  // one operation per form: a retry after a lost response cannot duplicate
  const [opId] = useState(newId)
  const router = useRouter()
  const confirm = useConfirm()
  const carriers = useCarriers().data ?? []
  const [carrierCode, setCarrierCode] = useState("")
  const [date, setDate] = useState(todayBusinessDate())
  const [truckId, setTruckId] = useState("")
  const [notes, setNotes] = useState("")
  const [customName, setCustomName] = useState<string | null>(null)
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine("")])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const generated = carrierCode && date ? generateManifestName(carrierCode, date, truckId) : ""
  const name = customName ?? generated

  const parsed = useMemo(() => {
    const out: ManifestLine[] = []
    for (const l of lines) {
      const quantity = Number(l.quantity)
      if (!l.itemId.trim() || !Number.isInteger(quantity) || quantity < 1) return null
      out.push({
        itemId: l.itemId.trim(),
        carrierCode: l.carrierCode || carrierCode,
        shipper: l.shipper.trim() || null,
        consignee: l.consignee.trim() || null,
        quantity,
        weight: l.weight ? Number(l.weight) : null,
        description: l.description.trim() || null,
      })
    }
    return out
  }, [lines, carrierCode])

  const pieces = parsed?.reduce((n, l) => n + l.quantity, 0) ?? 0
  const valid = !!carrierCode && !!date && !!parsed && parsed.length > 0

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  async function importFile(file: File) {
    const result = genericCsvImporter.parse(await file.text(), { carrierCode })
    if (result.warnings.length) {
      toast.warning(t.manifests.importProblems, {
        description: result.warnings.slice(0, 5).join(" · "),
        duration: 10_000,
      })
    }
    if (result.lines.length === 0) return
    const imported = result.lines.map((l) => ({
      ...emptyLine(l.carrierCode),
      itemId: l.itemId,
      shipper: l.shipper ?? "",
      consignee: l.consignee ?? "",
      quantity: String(l.quantity),
      weight: l.weight !== null ? String(l.weight) : "",
      description: l.description ?? "",
    }))
    // replace the untouched starter line, otherwise append
    setLines((ls) => [...ls.filter((x) => x.itemId.trim()), ...imported])
    toast.success(fmt(t.manifests.imported, { n: imported.length }))
  }

  async function submit() {
    if (!valid || !parsed) return
    if (!(await confirm({ description: fmt(t.manifests.confirmCreate, { n: pieces }) }))) return
    setBusy(true)
    const manifest = await callAction(
      t,
      () =>
        createManifestAction({
          opId,
          header: { manifestName: name, truckId, carrierCode, date, notes: notes.trim() || null },
          lines: parsed,
        }),
      t.manifests.created
    )
    setBusy(false)
    if (!manifest) return
    router.push(`/manifests/${manifest.manifestId}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.manifests.new} />
      <Card>
        <CardHeader>
          <CardTitle>{t.manifests.header}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.fields.carrier} htmlFor="m-carrier">
            <CarrierSelect
              id="m-carrier"
              value={carrierCode}
              carriers={carriers}
              onChange={(c) => {
                setCarrierCode(c)
                // lines without their own carrier follow the manifest default
                setLines((ls) => ls.map((l) => (l.carrierCode === carrierCode ? { ...l, carrierCode: c } : l)))
              }}
            />
          </Field>
          <Field label={t.fields.manifestDate} htmlFor="m-date">
            <DateInput id="m-date" value={date} onChange={setDate} />
          </Field>
          <Field label={t.fields.truckId} htmlFor="m-truck">
            <Input id="m-truck" dir="ltr" className="h-11" value={truckId} onChange={(e) => setTruckId(e.target.value)} />
          </Field>
          <Field label={t.fields.manifestName} htmlFor="m-name">
            <Input
              id="m-name"
              dir="ltr"
              className="h-11"
              value={name}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={generated}
            />
            <span className="text-xs text-muted-foreground">{t.manifests.generatedName}</span>
          </Field>
          <Field label={t.fields.notes} htmlFor="m-notes" className="sm:col-span-2 lg:col-span-4">
            <Textarea id="m-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            {t.manifests.lines} ({lines.length} · {pieces} {t.fields.pieces})
          </CardTitle>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button variant="outline" size="sm" disabled={!carrierCode} onClick={() => fileRef.current?.click()}>
              <UploadIcon />
              {t.manifests.importLines}
            </Button>
            <span className="max-w-sm text-xs text-muted-foreground">{t.manifests.importHelp}</span>
            <input
              ref={fileRef}
              type="file"
              accept={genericCsvImporter.accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (file) void importFile(file)
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {lines.map((l, index) => (
            <div key={l.key} className="surface grid grid-cols-2 gap-2 p-3 animate-in fade-in-0 slide-in-from-top-1 md:grid-cols-[2fr_1fr_1.5fr_1.5fr_0.7fr_0.8fr_2fr_auto] md:items-end">
              <Field label={`${index + 1}. ${t.fields.itemId}`} className="col-span-2 md:col-span-1">
                <Input dir="ltr" className="h-11" value={l.itemId} onChange={(e) => update(l.key, { itemId: e.target.value })} />
              </Field>
              <Field label={t.fields.carrier}>
                <CarrierSelect value={l.carrierCode || carrierCode} carriers={carriers} onChange={(c) => update(l.key, { carrierCode: c })} />
              </Field>
              <Field label={t.fields.shipper}>
                <Input dir="ltr" className="h-11" value={l.shipper} onChange={(e) => update(l.key, { shipper: e.target.value })} />
              </Field>
              <Field label={t.fields.consignee}>
                <Input dir="ltr" className="h-11" value={l.consignee} onChange={(e) => update(l.key, { consignee: e.target.value })} />
              </Field>
              <Field label={t.fields.quantity}>
                <Input dir="ltr" type="number" min={1} inputMode="numeric" className="h-11" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
              </Field>
              <Field label={t.fields.weight}>
                <Input dir="ltr" inputMode="decimal" className="h-11" value={l.weight} onChange={(e) => update(l.key, { weight: e.target.value })} />
              </Field>
              <Field label={t.fields.description} className="col-span-2 md:col-span-1">
                <Input dir="ltr" className="h-11" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
              </Field>
              <Button
                variant="ghost"
                size="icon"
                className="col-span-2 h-11 w-full md:col-span-1 md:w-11"
                aria-label={t.manifests.removeLine}
                disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setLines((ls) => [...ls, emptyLine(carrierCode)])}>
            <PlusIcon />
            {t.manifests.addLine}
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" disabled={!valid || busy} onClick={() => void submit()}>
          {t.manifests.create}
        </Button>
      </div>
    </div>
  )
}
