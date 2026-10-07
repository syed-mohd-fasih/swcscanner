"use client"

import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import type { RawScan } from "@/carriers"
import { ItemStatus } from "@/components/items/status-badges"
import { LocationBadge } from "@/components/locations/location-selector"
import { useSession } from "@/components/providers/session-provider"
import { ScanInput } from "@/components/scanner/scan-input"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { matchesSearch, SearchBar } from "@/components/shared/search-filter"
import { SessionPicker } from "@/components/shared/session-picker"
import { EmptyState, Ltr, LoadingState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Item } from "@/domain/items/types"
import type { WarehouseLocation } from "@/domain/locations/types"
import { isReleaseEligible } from "@/domain/release/rules"
import { useLocalQuery } from "@/hooks/use-local-query"
import { useWorkSession } from "@/hooks/use-work-session"
import { useWorkspacePull } from "@/hooks/use-workspace-pull"
import { fmt, useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"
import { carrierRepository, itemRepository, locationRepository } from "@/repositories/indexeddb"
import { lookupReleaseScan, releaseScanPiece, type ReleaseLookup } from "@/services/release"
import { pullReleaseWorkspace } from "@/sync/pull"

/**
 * Release: find → gather physically → scan → verify → confirm release scan.
 * The admin assigns the final outcome afterwards; nothing here bypasses the scan.
 */
export function ReleaseWorkspace() {
  const { t } = useI18n()
  const { ready } = useSession()
  const { session, setSession, loaded } = useWorkSession("release")
  const [editing, setEditing] = useState(false)
  const [lookup, setLookup] = useState<ReleaseLookup | null>(null)
  const [query, setQuery] = useState("")

  const carrier = useLocalQuery(
    () => (session ? carrierRepository.get(session.carrierCode) : Promise.resolve(undefined)),
    [session?.carrierCode]
  ).data
  const locations = useLocationMap()
  const eligibleQuery = useLocalQuery(
    async () =>
      session
        ? (await itemRepository.listByReleaseState("not_released")).filter(
            (i) => i.carrierCode === session.carrierCode && isReleaseEligible(i)
          )
        : [],
    [session?.carrierCode]
  ).data
  const eligible = useMemo(() => eligibleQuery ?? [], [eligibleQuery])

  const preparing = useWorkspacePull(
    ready && session ? session.carrierCode : null,
    () => pullReleaseWorkspace(session!.carrierCode),
    { onError: () => toast.warning(t.receiving.prepareFailed) }
  )

  const onScan = useCallback(
    async (scans: RawScan[]) => {
      if (!carrier) return false
      const result = await lookupReleaseScan(carrier, scans)
      if (result.parse.kind === "ignored") return false
      if (result.parse.kind === "wrong_barcode") return void toast.warning(t.scanner.scanPdf417)
      if (result.parse.kind === "unreadable") return void toast.error(t.scanner.unreadable)
      setLookup(result)
    },
    [carrier, t]
  )

  // gathering list sorted by location so the operator walks the shelves in order
  const gatherList = useMemo(() => {
    const key = (i: Item) => (i.locationId ? i.locationId : "~")
    return eligible
      .filter((i) => matchesSearch(query, i.itemId, i.shipper, i.consignee, i.locationId))
      .sort((a, b) => key(a).localeCompare(key(b), "en", { numeric: true }) || a.itemId.localeCompare(b.itemId))
  }, [eligible, query])

  if (!loaded) return <LoadingState />

  if (!session || editing) {
    return (
      <SessionPicker
        title={t.release.startSession}
        carrierLabel={t.release.sessionCarrier}
        withDate={false}
        initial={session}
        onStart={(s) => {
          setSession(s)
          setEditing(false)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t.release.title}
        description={t.release.scanToRelease}
        actions={
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Ltr>{carrier?.name ?? session.carrierCode}</Ltr> · {t.receiving.changeSession}
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-2">
          {preparing && <LoadingState label={t.release.preparing} />}
          <ScanInput
            mode={carrier?.parser === "fedexPdf417" ? "pdf417" : "linear"}
            paused={lookup !== null}
            onScan={onScan}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              {t.release.eligible} ({eligible.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SearchBar value={query} onChange={setQuery} />
            {gatherList.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="flex max-h-[60svh] flex-col divide-y overflow-y-auto">
                {gatherList.map((item) => (
                  <li key={item.internalItemId} className="flex flex-col gap-1 py-2 text-sm">
                    <span className="flex items-center justify-between gap-2 font-medium">
                      <Ltr className="truncate">{item.itemId}</Ltr>
                      <Ltr className="text-muted-foreground">
                        {item.pieceNumber}/{item.pieceTotal}
                      </Ltr>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <LocationBadge location={item.locationId ? locations.get(item.locationId) : null} />
                      <ItemStatus item={item} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <ReleaseScanDialog lookup={lookup} locations={locations} onClose={() => setLookup(null)} />
    </div>
  )
}

export function useLocationMap(): Map<string, WarehouseLocation> {
  const all = useLocalQuery(() => locationRepository.all(), []).data
  return useMemo(() => new Map((all ?? []).map((l) => [l.locationId, l])), [all])
}

function ReleaseScanDialog({
  lookup,
  locations,
  onClose,
}: {
  lookup: ReleaseLookup | null
  locations: Map<string, WarehouseLocation>
  onClose: () => void
}) {
  const { t } = useI18n()
  const { user } = useSession()
  const confirm = useConfirm()
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = lookup?.parse.kind === "parsed"
  const pieces = lookup?.pieces ?? []
  const itemId = lookup?.parse.kind === "parsed" ? lookup.parse.scan.itemId : ""
  const eligible = pieces.filter((p) => p.eligible)
  const effective = selected ?? (eligible.length === 1 ? eligible[0].item.internalItemId : null)

  async function submit() {
    const piece = pieces.find((p) => p.item.internalItemId === effective)?.item
    if (!piece) return
    const ok = await confirm({
      description: fmt(t.release.confirmScanText, { piece: `${piece.pieceNumber}/${piece.pieceTotal}`, itemId: piece.itemId }),
    })
    if (!ok) return
    setBusy(true)
    const result = await releaseScanPiece(piece.internalItemId, user.uid)
    setBusy(false)
    if (!result.ok) return void toast.error(result.error.message)
    toast.success(t.release.scanned)
    setSelected(null)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSelected(null)
          onClose()
        }
      }}
    >
      <DialogContent className="max-h-[calc(100svh-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Ltr>{itemId}</Ltr>
          </DialogTitle>
          <DialogDescription>{pieces.length === 0 ? t.release.noPieces : t.receiving.whichPiece}</DialogDescription>
        </DialogHeader>
        <ul role="radiogroup" className="flex flex-col gap-2">
          {pieces.map(({ item, eligible: ok }) => {
            const active = effective === item.internalItemId
            return (
              <li key={item.internalItemId}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!ok}
                  onClick={() => setSelected(item.internalItemId)}
                  className={cn(
                    "flex w-full flex-col gap-1.5 rounded-2xl border p-3 text-start",
                    active && "border-primary bg-primary/10",
                    !ok && "cursor-not-allowed opacity-60"
                  )}
                >
                  <span className="flex items-center justify-between gap-2 font-semibold">
                    <span>
                      {t.fields.piece} <Ltr>{item.pieceNumber}/{item.pieceTotal}</Ltr>
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {ok ? t.release.eligible : t.release.notEligible}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <LocationBadge location={item.locationId ? locations.get(item.locationId) : null} />
                    <ItemStatus item={item} />
                  </span>
                  {(item.shipper || item.consignee) && (
                    <Ltr className="text-sm text-muted-foreground">
                      {[item.shipper, item.consignee].filter(Boolean).join(" → ")}
                    </Ltr>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        {eligible.length > 0 && (
          <Button size="lg" className="h-12" disabled={!effective || busy} onClick={() => void submit()}>
            {t.release.confirmScan}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
