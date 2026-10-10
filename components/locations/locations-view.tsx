"use client"

import { PencilIcon, PlusIcon, Trash2Icon, WarehouseIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { previewWarehouseAction, saveWarehouseAction } from "@/app/actions/admin"
import { useLocations } from "@/components/providers/config-provider"
import { useSession } from "@/components/providers/session-provider"
import { Callout } from "@/components/shared/callout"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, Ltr } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  MAX_POSITION,
  specOf,
  summarizeWarehouses,
  type WarehouseSpec,
  type WarehouseSummary,
} from "@/domain/locations/rules"
import { RACK_LETTER, WAREHOUSE_CODE } from "@/domain/locations/types"
import { fmt, useI18n } from "@/lib/i18n/client"
import { callAction } from "@/lib/submit-op"
import { cn } from "@/lib/utils"

/** Warehouses → racks with number ranges. Admins add, edit and delete warehouses. */
export function LocationsView() {
  const { t } = useI18n()
  const { isAdmin } = useSession()
  const { data: locations } = useLocations()
  const warehouses = useMemo(() => summarizeWarehouses(locations ?? []), [locations])
  /** null = closed; original null = adding */
  const [editing, setEditing] = useState<{ original: string | null; spec: WarehouseSpec; hasGaps?: boolean } | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t.locations.title}
        description={t.locations.help}
        actions={
          isAdmin && (
            <Button onClick={() => setEditing({ original: null, spec: { warehouse: "", racks: [{ rack: "A", from: 1, to: 10 }] } })}>
              <PlusIcon />
              {t.locations.addWarehouse}
            </Button>
          )
        }
      />
      {warehouses.length === 0 ? (
        <EmptyState title={t.locations.none} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {warehouses.map((w) => (
            <WarehouseCard
              key={w.warehouse}
              summary={w}
              editable={isAdmin}
              onEdit={() => setEditing({ original: w.warehouse, spec: specOf(w), hasGaps: w.racks.some((r) => r.gaps.length > 0) })}
            />
          ))}
        </div>
      )}
      {editing && (
        <WarehouseDialog original={editing.original} initial={editing.spec} hasGaps={!!editing.hasGaps} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function WarehouseCard({ summary: w, editable, onEdit }: { summary: WarehouseSummary; editable: boolean; onEdit: () => void }) {
  const { t } = useI18n()
  const router = useRouter()
  const confirm = useConfirm()

  async function remove() {
    const edit = { original: w.warehouse, spec: { warehouse: w.warehouse, racks: [] } }
    const preview = await callAction(t, () => previewWarehouseAction(edit))
    if (!preview) return
    const ok = await confirm({
      description: fmt(t.locations.confirmDelete, { w: w.warehouse, n: w.positions }),
      details: preview.keptDisabled > 0 && <Callout tone="warning">{fmt(t.locations.keptWarning, { n: preview.keptDisabled })}</Callout>,
      confirmLabel: t.locations.deleteWarehouse,
      destructive: true,
      irreversible: true,
    })
    if (!ok) return
    if (await callAction(t, () => saveWarehouseAction(edit), t.locations.deleted)) router.refresh()
  }

  return (
    <section className="surface flex flex-col gap-3 p-4">
      <header className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary-ink">
          <WarehouseIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Ltr className="block text-lg font-semibold">{w.warehouse}</Ltr>
          <span className="text-xs text-muted-foreground">
            {fmt(t.locations.positions, { n: w.positions })}
            {w.disabled > 0 && ` · ${fmt(t.locations.disabledKept, { n: w.disabled })}`}
          </span>
        </div>
        {editable && (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label={t.locations.editWarehouse} title={t.locations.editWarehouse}>
              <PencilIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive-ink hover:bg-destructive/10"
              onClick={() => void remove()}
              aria-label={t.locations.deleteWarehouse}
              title={t.locations.deleteWarehouse}
            >
              <Trash2Icon />
            </Button>
          </div>
        )}
      </header>
      <ul className="flex flex-col divide-y rounded-xl border bg-background/60">
        {w.racks.map((r) => (
          <li key={r.rack} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <Badge variant="accent" className="min-w-8 justify-center font-semibold">
              <Ltr>{r.rack}</Ltr>
            </Badge>
            {r.active > 0 ? (
              <>
                <Ltr className="text-sm font-medium tabular-nums">
                  {r.from}–{r.to}
                </Ltr>
                <span className="text-xs text-muted-foreground">{fmt(t.locations.positions, { n: r.active })}</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
            {r.gaps.length > 0 && (
              <Badge variant="warning">
                <Ltr>{fmt(t.locations.gaps, { list: r.gaps.join(", ") })}</Ltr>
              </Badge>
            )}
            {r.disabled > 0 && <Badge variant="neutral">{fmt(t.locations.disabledKept, { n: r.disabled })}</Badge>}
          </li>
        ))}
      </ul>
    </section>
  )
}

type Row = { key: number; rack: string; from: string; to: string }

function WarehouseDialog({
  original,
  initial,
  hasGaps,
  onClose,
}: {
  original: string | null
  initial: WarehouseSpec
  hasGaps: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const router = useRouter()
  const confirm = useConfirm()
  const [code, setCode] = useState(initial.warehouse)
  const [rows, setRows] = useState<Row[]>(() =>
    initial.racks.map((r, i) => ({ key: i, rack: r.rack, from: String(r.from), to: String(r.to) }))
  )
  const [busy, setBusy] = useState(false)

  const parsed = rows.map((r) => {
    const rack = r.rack.trim().toUpperCase()
    const from = Number(r.from)
    const to = Number(r.to)
    const duplicate = rows.some((o) => o.key !== r.key && o.rack.trim().toUpperCase() === rack && rack !== "")
    const rangeOk = [from, to].every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_POSITION) && from <= to
    return { ...r, rack, fromN: from, toN: to, rackOk: RACK_LETTER.test(rack) && !duplicate, duplicate, rangeOk }
  })
  const warehouse = code.trim().toUpperCase()
  const codeOk = WAREHOUSE_CODE.test(warehouse)
  const valid = codeOk && rows.length > 0 && parsed.every((p) => p.rackOk && p.rangeOk)
  const positions = parsed.reduce((n, p) => n + (p.rangeOk ? p.toN - p.fromN + 1 : 0), 0)

  const update = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const addRack = () =>
    setRows((list) => {
      const last = list.at(-1)?.rack.trim().toUpperCase() ?? ""
      const next = /^[A-Y]$/.test(last) ? String.fromCharCode(last.charCodeAt(0) + 1) : ""
      return [...list, { key: Math.max(-1, ...list.map((r) => r.key)) + 1, rack: next, from: "1", to: list.at(-1)?.to ?? "10" }]
    })

  async function save() {
    const edit = {
      original,
      spec: { warehouse, racks: parsed.map((p) => ({ rack: p.rack, from: p.fromN, to: p.toN })) },
    }
    setBusy(true)
    const preview = await callAction(t, () => previewWarehouseAction(edit))
    setBusy(false)
    if (!preview) return
    const ok = await confirm({
      description: fmt(t.locations.confirmSave, { w: warehouse, added: preview.added, removed: preview.removed + preview.keptDisabled }),
      details: preview.keptDisabled > 0 && <Callout tone="warning">{fmt(t.locations.keptWarning, { n: preview.keptDisabled })}</Callout>,
    })
    if (!ok) return
    setBusy(true)
    const saved = await callAction(t, () => saveWarehouseAction(edit), t.locations.saved)
    setBusy(false)
    if (!saved) return
    onClose()
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100svh-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{original ? t.locations.editWarehouse : t.locations.addWarehouse}</DialogTitle>
          <DialogDescription>{t.locations.help}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wh-code">{t.locations.warehouseCode}</Label>
          <Input
            id="wh-code"
            name="warehouse"
            dir="ltr"
            maxLength={8}
            placeholder="WH1"
            autoComplete="off"
            className="uppercase"
            aria-invalid={code !== "" && !codeOk}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          {/* same left-to-right order as the inputs below (and as "A-12") */}
          <div className="grid grid-cols-[4.5rem_1fr_1fr_2.75rem] gap-2 px-0.5 text-xs font-medium text-muted-foreground md:grid-cols-[4.5rem_1fr_1fr_2.25rem]" dir="ltr">
            <span>{t.locations.rackLetter}</span>
            <span>{t.locations.from}</span>
            <span>{t.locations.to}</span>
            <span />
          </div>
          <ul className="flex flex-col gap-2">
            {parsed.map((p) => (
              <li key={p.key} className="flex flex-col gap-1 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                <div className="grid grid-cols-[4.5rem_1fr_1fr_2.75rem] items-center gap-2 md:grid-cols-[4.5rem_1fr_1fr_2.25rem]" dir="ltr">
                  <Input
                    name={`rack-${p.key}`}
                    aria-label={t.locations.rackLetter}
                    maxLength={2}
                    autoComplete="off"
                    className="text-center font-semibold uppercase"
                    aria-invalid={p.rack !== "" && !p.rackOk}
                    value={rows.find((r) => r.key === p.key)!.rack}
                    onChange={(e) => update(p.key, { rack: e.target.value })}
                  />
                  <Input
                    name={`from-${p.key}`}
                    aria-label={t.locations.from}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_POSITION}
                    aria-invalid={!p.rangeOk}
                    value={p.from}
                    onChange={(e) => update(p.key, { from: e.target.value })}
                  />
                  <Input
                    name={`to-${p.key}`}
                    aria-label={t.locations.to}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_POSITION}
                    aria-invalid={!p.rangeOk}
                    value={p.to}
                    onChange={(e) => update(p.key, { to: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive-ink"
                    onClick={() => setRows((list) => list.filter((r) => r.key !== p.key))}
                    aria-label={t.locations.removeRack}
                    title={t.locations.removeRack}
                  >
                    <XIcon />
                  </Button>
                </div>
                {p.duplicate && <p className="text-xs text-destructive-ink">{fmt(t.locations.duplicateRack, { rack: p.rack })}</p>}
                {!p.rangeOk && <p className="text-xs text-destructive-ink">{fmt(t.locations.badRange, { max: MAX_POSITION })}</p>}
              </li>
            ))}
          </ul>
          <Button variant="outline" className="self-start" onClick={addRack}>
            <PlusIcon />
            {t.locations.addRack}
          </Button>
          {rows.length === 0 && <Callout tone="warning">{t.locations.noRacks}</Callout>}
          {hasGaps && <p className="text-xs text-muted-foreground">{t.locations.gapsFill}</p>}
        </div>

        <p className={cn("text-sm font-medium", valid ? "text-primary-ink" : "text-muted-foreground")}>
          <Ltr className="font-semibold">{warehouse || "—"}</Ltr> · {fmt(t.locations.total, { r: rows.length, n: positions })}
        </p>

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
