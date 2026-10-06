"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ReceivingStatus, ReleaseOutcome, StorageStatus, MismatchBadge } from "@/components/items/status-badges"
import { LocationBadge } from "@/components/locations/location-selector"
import { useSession } from "@/components/providers/session-provider"
import { Field, InfoList } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { Ltr, LoadingState, EmptyState } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Item } from "@/domain/items/types"
import { useLocalQuery } from "@/hooks/use-local-query"
import { useI18n } from "@/lib/i18n/client"
import { itemRepository, locationRepository, manifestRepository } from "@/repositories/indexeddb"
import { correctItem } from "@/services/manifests"
import { adminPull } from "@/sync/pull"

export function useItem(internalItemId: string) {
  const { ready } = useSession()
  const query = useLocalQuery(() => itemRepository.get(internalItemId), [internalItemId])
  const [fetched, setFetched] = useState(false)
  useEffect(() => {
    if (!ready || query.loading || query.data || fetched) return
    // not on this device yet — fetch the one document
    adminPull
      .item(internalItemId)
      .catch(() => {})
      .finally(() => setFetched(true))
  }, [ready, query.loading, query.data, fetched, internalItemId])
  return { item: query.data, loading: query.loading || (!query.data && !fetched) }
}

/** Item detail with the lifecycle dimensions shown independently. */
export function ItemDetails({ internalItemId }: { internalItemId: string }) {
  const { t, locale } = useI18n()
  const { isAdmin } = useSession()
  const { item, loading } = useItem(internalItemId)
  const manifest = useLocalQuery(
    () => (item?.manifestId ? manifestRepository.get(item.manifestId) : Promise.resolve(undefined)),
    [item?.manifestId]
  ).data
  const location = useLocalQuery(
    () => (item?.locationId ? locationRepository.get(item.locationId) : Promise.resolve(undefined)),
    [item?.locationId]
  ).data
  const [editing, setEditing] = useState(false)

  if (loading) return <LoadingState />
  if (!item) return <EmptyState title={t.items.notOnDevice} />

  const time = (iso: string | null) =>
    iso ? <Ltr>{new Date(iso).toLocaleString(locale === "ar" ? "ar-u-nu-latn" : "en-GB")}</Ltr> : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          <Ltr>{item.itemId}</Ltr>{" "}
          <span className="text-muted-foreground">
            <Ltr>
              {item.pieceNumber}/{item.pieceTotal}
            </Ltr>
          </span>
        </h1>
        {isAdmin && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            {t.items.correct}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.items.lifecycle}</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoList
            rows={[
              {
                label: t.states.manifest,
                value: item.manifestId ? (
                  isAdmin ? (
                    <Link className="underline" href={`/manifests/${item.manifestId}`}>
                      <Ltr>{manifest?.manifestName ?? item.manifestId}</Ltr>
                    </Link>
                  ) : (
                    <Ltr>{manifest?.manifestName ?? item.manifestId}</Ltr>
                  )
                ) : (
                  <Badge variant="outline">{t.states.noManifest}</Badge>
                ),
              },
              { label: t.fields.status, value: <ReceivingStatus state={item.receivingState} /> },
              { label: t.receiving.storeIn, value: <StorageStatus state={item.storageState} /> },
              { label: t.release.title, value: <ReleaseOutcome state={item.releaseState} /> },
              ...(item.quantityMismatch
                ? [{ label: t.states.mismatch, value: <span className="flex flex-wrap items-center gap-2"><MismatchBadge />{item.quantityMismatch.labelTotal && <Ltr>{t.receiving.labelQuantity}: {item.quantityMismatch.labelTotal}</Ltr>}</span> }]
                : []),
              ...(item.investigation
                ? [{ label: t.fields.investigation, value: `${t.states.investigation[item.investigation.status]}${item.investigation.note ? ` — ${item.investigation.note}` : ""}` }]
                : []),
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.items.details}</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoList
            rows={[
              { label: t.fields.carrier, value: <Ltr>{item.carrierCode}</Ltr> },
              { label: t.fields.shipper, value: item.shipper && <Ltr>{item.shipper}</Ltr> },
              { label: t.fields.consignee, value: item.consignee && <Ltr>{item.consignee}</Ltr> },
              { label: t.fields.weight, value: item.weight !== null && <Ltr>{item.weight}</Ltr> },
              { label: t.fields.description, value: item.description && <Ltr>{item.description}</Ltr> },
              { label: t.fields.location, value: location ? <LocationBadge location={location} /> : null },
              { label: t.fields.dateOfReceival, value: item.dateOfReceival && <Ltr>{item.dateOfReceival}</Ltr> },
              { label: t.fields.dateOfRelease, value: item.dateOfRelease && <Ltr>{item.dateOfRelease}</Ltr> },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.items.history}</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoList
            rows={[
              { label: t.fields.createdAt, value: time(item.createdAt) },
              { label: t.states.receiving.received, value: time(item.receivedAt) },
              { label: t.states.storage.stored, value: time(item.storedAt) },
              { label: t.states.release.release_scanned, value: time(item.releaseScannedAt) },
              { label: t.outcomes.title, value: time(item.outcomeAt) },
              { label: t.fields.updatedAt, value: time(item.updatedAt) },
            ]}
          />
        </CardContent>
      </Card>

      {isAdmin && editing && <CorrectionDialog item={item} onClose={() => setEditing(false)} />}
    </div>
  )
}

function CorrectionDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { t } = useI18n()
  const { user } = useSession()
  const confirm = useConfirm()
  const [form, setForm] = useState({
    itemId: item.itemId,
    shipper: item.shipper ?? "",
    consignee: item.consignee ?? "",
    weight: item.weight !== null ? String(item.weight) : "",
    description: item.description ?? "",
    dateOfReceival: item.dateOfReceival ?? "",
    clearMismatch: false,
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!(await confirm({}))) return
    const result = await correctItem(
      item.internalItemId,
      {
        itemId: form.itemId.trim(),
        shipper: form.shipper.trim() || null,
        consignee: form.consignee.trim() || null,
        weight: form.weight ? Number(form.weight) : null,
        description: form.description.trim() || null,
        dateOfReceival: form.dateOfReceival || null,
        ...(form.clearMismatch ? { quantityMismatch: null } : {}),
      },
      user.uid
    )
    if (!result.ok) return void toast.error(result.error.message)
    toast.success(t.items.corrected)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.items.correct}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["itemId", "shipper", "consignee", "weight", "description"] as const).map((k) => (
            <Field key={k} label={t.fields[k]} htmlFor={`c-${k}`}>
              <Input id={`c-${k}`} dir="ltr" className="h-11" value={form[k]} onChange={set(k)} />
            </Field>
          ))}
          <Field label={t.fields.dateOfReceival} htmlFor="c-date">
            <Input id="c-date" type="date" dir="ltr" className="h-11" value={form.dateOfReceival} onChange={set("dateOfReceival")} />
          </Field>
        </div>
        {item.quantityMismatch && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={form.clearMismatch}
              onChange={(e) => setForm((f) => ({ ...f, clearMismatch: e.target.checked }))}
            />
            {t.app.clear}: {t.states.mismatch}
          </label>
        )}
        <Button size="lg" onClick={() => void save()}>
          {t.app.save}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
