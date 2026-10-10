"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { addLocationsAction, setLocationActiveAction } from "@/app/actions/admin"
import { useLocations } from "@/components/providers/config-provider"

import { useSession } from "@/components/providers/session-provider"
import { Field } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { Callout } from "@/components/shared/callout"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, Ltr } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { locationIdFor, RACK_LETTER, WAREHOUSE_CODE, type WarehouseLocation } from "@/domain/locations/types"
import { fmt, useI18n } from "@/lib/i18n/client"
import { callAction } from "@/lib/submit-op"
import { cn } from "@/lib/utils"

/** POSITION_NUMBER allows up to 4 digits */
const MAX_POSITION = 9999
/** one add = one write per location; keeps a single add far below the daily write limit */
const MAX_PER_ADD = 500
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
      {isAdmin && <AddLocationsForm existing={locations ?? []} />}
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

function AddLocationsForm({ existing }: { existing: WarehouseLocation[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const confirm = useConfirm()
  const [form, setForm] = useState({ warehouse: "", rack: "", positionFrom: "1", positionTo: "10" })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // one rack at a time: rack labels need not follow the alphabet, but the
  // numbers on a rack always run continuously
  const specs = useMemo(() => {
    const out: { warehouse: string; rack: string; position: string }[] = []
    const warehouse = form.warehouse.trim().toUpperCase()
    const rack = form.rack.trim().toUpperCase()
    const [p1, p2] = [form.positionFrom, form.positionTo].map((v) => Number(v))
    if (!WAREHOUSE_CODE.test(warehouse) || !RACK_LETTER.test(rack)) return out
    if ([p1, p2].some((n) => !Number.isInteger(n) || n < 1 || n > MAX_POSITION) || p2 < p1) return out
    if (p2 - p1 + 1 > MAX_PER_ADD) return out
    // only positions not already there
    const have = new Set(existing.map((l) => l.locationId))
    for (let p = p1; p <= p2; p++)
      if (!have.has(locationIdFor(warehouse, rack, String(p)))) out.push({ warehouse, rack, position: String(p) })
    return out
  }, [form, existing])
  const preview = specs.length > 0 ? `${specs[0].warehouse} / ${specs[0].rack}-${specs[0].position} … ${specs.at(-1)!.rack}-${specs.at(-1)!.position}` : null

  async function submit() {
    if (specs.length === 0) return
    if (!(await confirm({ description: fmt(t.locations.confirmAdd, { n: specs.length }) }))) return
    const created = await callAction(t, () => addLocationsAction({ specs }))
    if (!created) return
    toast.success(`${t.items.corrected} (${created.length})`)
    setForm((f) => ({ ...f, rack: "" }))
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.locations.add}</CardTitle>
        <p className="text-sm text-muted-foreground">{t.locations.addHelp}</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" dir="ltr">
          <Field label={t.fields.warehouse} htmlFor="l-w">
            <Input id="l-w" name="warehouse" maxLength={8} placeholder="WH1" autoComplete="off" className="uppercase" value={form.warehouse} onChange={set("warehouse")} />
          </Field>
          <Field label={t.fields.rack} htmlFor="l-r">
            <Input id="l-r" name="rack" maxLength={2} placeholder="A" autoComplete="off" className="uppercase" value={form.rack} onChange={set("rack")} />
          </Field>
          <Field label={t.locations.positionFrom} htmlFor="l-p1">
            <Input id="l-p1" name="positionFrom" type="number" inputMode="numeric" min={1} max={MAX_POSITION} value={form.positionFrom} onChange={set("positionFrom")} />
          </Field>
          <Field label={t.locations.positionTo} htmlFor="l-p2">
            <Input id="l-p2" name="positionTo" type="number" inputMode="numeric" min={1} max={MAX_POSITION} value={form.positionTo} onChange={set("positionTo")} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button disabled={specs.length === 0} onClick={() => void submit()}>
            {t.app.add} ({specs.length})
          </Button>
          {Number(form.positionTo) - Number(form.positionFrom) + 1 > MAX_PER_ADD && (
            <Callout tone="warning" className="w-full">{fmt(t.locations.tooMany, { n: MAX_PER_ADD })}</Callout>
          )}
          {preview && (
            <Ltr className="text-sm font-medium text-primary-ink animate-in fade-in-0">{preview}</Ltr>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
