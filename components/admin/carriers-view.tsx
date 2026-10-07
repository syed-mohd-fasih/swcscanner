"use client"

import { PlusIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useSession } from "@/components/providers/session-provider"
import { DataTable, type Column } from "@/components/shared/data-table"
import { Field, useCarriers } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { Ltr, LoadingState } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PARSER_IDS, type Carrier, type ParserId } from "@/domain/carriers/types"
import { fmt, useI18n } from "@/lib/i18n/client"
import { compileIdPattern } from "@/carriers"
import { saveCarrier } from "@/services/config"
import { pullConfig } from "@/sync/pull"

/** Carrier list: code (manifest names), name, and which barcode parser applies. */
export function CarriersView() {
  const { t } = useI18n()
  const { ready } = useSession()
  const { data: carriers, loading } = useCarriers(false)
  const [editing, setEditing] = useState<Carrier | "new" | null>(null)

  useEffect(() => {
    if (ready) pullConfig().catch(() => {})
  }, [ready])

  const columns: Column<Carrier>[] = [
    { key: "code", header: t.fields.code, cell: (c) => <Ltr className="font-medium">{c.carrierCode}</Ltr> },
    { key: "name", header: t.fields.name, cell: (c) => <Ltr>{c.name}</Ltr> },
    { key: "parser", header: t.fields.parser, cell: (c) => t.carriers[c.parser] },
    {
      key: "active",
      header: t.fields.status,
      cell: (c) => <Badge variant={c.active ? "secondary" : "destructive"}>{c.active ? t.fields.active : t.locations.inactive}</Badge>,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t.carriers.title}
        actions={
          <Button onClick={() => setEditing("new")}>
            <PlusIcon />
            {t.carriers.add}
          </Button>
        }
      />
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable columns={columns} rows={carriers ?? []} rowKey={(c) => c.carrierCode} onRowClick={(c) => setEditing(c)} />
      )}
      {editing && <CarrierDialog carrier={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function CarrierDialog({ carrier, onClose }: { carrier: Carrier | null; onClose: () => void }) {
  const { t } = useI18n()
  const { sync } = useSession()
  const confirm = useConfirm()
  const [code, setCode] = useState(carrier?.carrierCode ?? "")
  const [name, setName] = useState(carrier?.name ?? "")
  const [parser, setParser] = useState<ParserId>(carrier?.parser ?? "generic1d")
  const [active, setActive] = useState(carrier?.active ?? true)
  const [idPattern, setIdPattern] = useState(carrier?.idPattern ?? "")
  const [sample, setSample] = useState("")
  const compiled = compileIdPattern(idPattern)
  const patternInvalid = !!idPattern.trim() && !compiled

  async function save() {
    if (!(await confirm({ description: fmt(t.carriers.confirmSave, { code: code.toUpperCase() }) }))) return
    const result = await saveCarrier({ carrierCode: code, name, parser, idPattern, active })
    if (!result.ok) return void toast.error(result.error.message)
    void sync.flush()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{carrier ? carrier.name : t.carriers.add}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label={t.fields.code} htmlFor="c-code">
            <Input id="c-code" dir="ltr" className="h-11 uppercase" maxLength={6} disabled={!!carrier} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label={t.fields.name} htmlFor="c-name">
            <Input id="c-name" dir="ltr" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t.fields.parser}>
            <Select value={parser} onValueChange={(v) => setParser(v as ParserId)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARSER_IDS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t.carriers[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t.carriers.idPattern} htmlFor="c-pattern">
            <Input
              id="c-pattern"
              dir="ltr"
              className="h-11 font-mono"
              placeholder="^\d{10}$"
              aria-invalid={patternInvalid}
              value={idPattern}
              onChange={(e) => setIdPattern(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">{t.carriers.idPatternHelp}</span>
          </Field>
          {compiled && (
            <Field label={t.carriers.testBarcode} htmlFor="c-sample">
              <div className="flex items-center gap-2">
                <Input id="c-sample" dir="ltr" className="h-11" value={sample} onChange={(e) => setSample(e.target.value)} />
                {sample && (
                  <span className={compiled.test(sample.trim()) ? "text-emerald-600" : "text-destructive"}>
                    {compiled.test(sample.trim()) ? "✓" : "✗"}
                  </span>
                )}
              </div>
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {t.fields.active}
          </label>
          <Button size="lg" disabled={!code || !name || patternInvalid} onClick={() => void save()}>
            {t.app.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
