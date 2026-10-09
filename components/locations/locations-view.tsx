"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { addLocationsAction, setLocationActiveAction } from "@/app/actions/admin"
import { useLocations } from "@/components/providers/config-provider"

import { useSession } from "@/components/providers/session-provider"
import { Field } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, Ltr } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { WAREHOUSE_CODE, type WarehouseLocation } from "@/domain/locations/types"
import { fmt, useI18n } from "@/lib/i18n/client"
import { callAction } from "@/lib/submit-op"
import { cn } from "@/lib/utils"

const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true })

/** Predefined Warehouse → Shelf → Position dataset; admin-only changes. */
export function LocationsView() {
  const { t } = useI18n()
  const { isAdmin } = useSession()
  const { data: locations } = useLocations()

  const tree = useMemo(() => {
    const map = new Map<string, Map<string, WarehouseLocation[]>>()
    for (const l of locations ?? []) {
      const racks = map.get(l.warehouse) ?? new Map<string, WarehouseLocation[]>()
      racks.set(l.rack, [...(racks.get(l.rack) ?? []), l])
      map.set(l.warehouse, racks)
    }
    return map
  }, [locations])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.locations.title} />
      {isAdmin && <AddLocationsForm />}
      {tree.size === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {[...tree.keys()].sort(natural).map((w) => (
            <Card key={w}>
              <CardHeader>
                <CardTitle>
                  {t.fields.warehouse} <Ltr>{w}</Ltr>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {[...tree.get(w)!.keys()].sort(natural).map((s) => (
                  <div key={s} className="flex flex-col gap-1.5">
                    <span className="text-sm text-muted-foreground">
                      {t.fields.rack} <Ltr>{s}</Ltr>
                    </span>
                    <div className="flex flex-wrap gap-1.5" dir="ltr">
                      {tree
                        .get(w)!
                        .get(s)!
                        .sort((a, b) => natural(a.position, b.position))
                        .map((l) => (
                          <LocationChip key={l.locationId} location={l} editable={isAdmin} />
                        ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function LocationChip({ location, editable }: { location: WarehouseLocation; editable: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const confirm = useConfirm()
  const label = `${location.rack}-${location.position}`
  if (!editable) {
    return (
      <Badge variant="outline" className={cn(!location.active && "line-through opacity-60")}>
        {label}
      </Badge>
    )
  }
  return (
    <button
      type="button"
      title={location.active ? t.locations.deactivate : t.locations.activate}
      onClick={async () => {
        const ok = await confirm({
          description: fmt(t.locations.confirmToggle, { id: location.locationId }),
          confirmLabel: location.active ? t.locations.deactivate : t.locations.activate,
          destructive: location.active,
        })
        if (!ok) return
        const saved = await callAction(t, () => setLocationActiveAction({ locationId: location.locationId, active: !location.active }))
        if (saved) router.refresh()
      }}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium hover:bg-muted",
        !location.active && "border-dashed text-muted-foreground line-through"
      )}
    >
      {label}
    </button>
  )
}

function AddLocationsForm() {
  const { t } = useI18n()
  const router = useRouter()
  const confirm = useConfirm()
  const [form, setForm] = useState({ warehouse: "", rackFrom: "A", rackTo: "A", positionFrom: "1", positionTo: "1" })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const specs = useMemo(() => {
    const out: { warehouse: string; rack: string; position: string }[] = []
    const warehouse = form.warehouse.trim().toUpperCase()
    const [r1, r2] = [form.rackFrom, form.rackTo].map((v) => v.trim().toUpperCase())
    const [p1, p2] = [form.positionFrom, form.positionTo].map((v) => Number(v))
    const letter = /^[A-Z]$/
    if (!WAREHOUSE_CODE.test(warehouse) || !letter.test(r1) || !letter.test(r2) || r2 < r1) return out
    if ([p1, p2].some((n) => !Number.isInteger(n) || n < 1) || p2 < p1) return out
    for (let r = r1.charCodeAt(0); r <= r2.charCodeAt(0) && out.length <= 2000; r++)
      for (let p = p1; p <= p2; p++) out.push({ warehouse, rack: String.fromCharCode(r), position: String(p) })
    return out
  }, [form])

  async function submit() {
    if (specs.length === 0) return
    if (!(await confirm({ description: fmt(t.locations.confirmAdd, { n: specs.length }) }))) return
    const created = await callAction(t, () => addLocationsAction({ specs }))
    if (!created) return
    toast.success(`${t.items.corrected} (${created.length})`)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.locations.add}</CardTitle>
        <p className="text-sm text-muted-foreground">{t.locations.addHelp}</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" dir="ltr">
          <Field label={t.fields.warehouse} htmlFor="l-w">
            <Input id="l-w" maxLength={8} placeholder="WH1" className="h-11 uppercase" value={form.warehouse} onChange={set("warehouse")} />
          </Field>
          <Field label={t.locations.rackFrom} htmlFor="l-r1">
            <Input id="l-r1" maxLength={1} className="h-11 uppercase" value={form.rackFrom} onChange={set("rackFrom")} />
          </Field>
          <Field label={t.locations.rackTo} htmlFor="l-r2">
            <Input id="l-r2" maxLength={1} className="h-11 uppercase" value={form.rackTo} onChange={set("rackTo")} />
          </Field>
          <Field label={t.locations.positionFrom} htmlFor="l-p1">
            <Input id="l-p1" type="number" min={1} className="h-11" value={form.positionFrom} onChange={set("positionFrom")} />
          </Field>
          <Field label={t.locations.positionTo} htmlFor="l-p2">
            <Input id="l-p2" type="number" min={1} className="h-11" value={form.positionTo} onChange={set("positionTo")} />
          </Field>
        </div>
        <Button className="mt-3" disabled={specs.length === 0} onClick={() => void submit()}>
          {t.app.add} ({specs.length})
        </Button>
      </CardContent>
    </Card>
  )
}
