"use client"

import { LoaderIcon, RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { listReleaseReady, releaseLookup } from "@/app/actions/operator"
import { resolveScans, type RawScan } from "@/carriers"
import { ItemStatus } from "@/components/items/status-badges"
import { LocationBadge } from "@/components/locations/location-selector"
import { useCarrier, useLocationMap } from "@/components/providers/config-provider"
import { ScanInput } from "@/components/scanner/scan-input"
import { PageHeader } from "@/components/shared/page-header"
import { matchesSearch, SearchBar } from "@/components/shared/search-filter"
import { SessionPicker } from "@/components/shared/session-picker"
import { EmptyState, Ltr, LoadingState } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Item } from "@/domain/items/types"
import type { WarehouseLocation } from "@/domain/locations/types"
import { useWorkSession } from "@/hooks/use-work-session"
import { errorText, failureText } from "@/lib/errors"
import { useI18n } from "@/lib/i18n/client"
import { submitOp } from "@/lib/submit-op"
import { cn } from "@/lib/utils"
import type { ReleaseLookup } from "@/server/services/release"

/**
 * Release: find → gather physically → scan → verify → confirm release scan.
 * The admin assigns the final outcome afterwards; nothing here bypasses the scan.
 */
export function ReleaseWorkspace() {
  const { t } = useI18n()
  const { session, setSession, loaded } = useWorkSession("release")
  const [editing, setEditing] = useState(false)
  const [lookup, setLookup] = useState<ReleaseLookup | null>(null)
  const [checking, setChecking] = useState(false)
  const [query, setQuery] = useState("")
  const carrier = useCarrier(session?.carrierCode)
  const locations = useLocationMap()
  // the picking list: loaded once per session (one read per ready piece)
  const [eligible, setEligible] = useState<Item[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!session) return
    let live = true
    listReleaseReady({ carrierCode: session.carrierCode })
      .then((r) => live && setEligible(r.ok ? r.value.rows : []))
      .catch(() => live && setEligible([]))
    return () => {
      live = false
    }
  }, [session, reloadKey])

  const onScan = useCallback(
    async (scans: RawScan[]) => {
      if (!carrier || checking) return false
      const resolved = resolveScans(carrier, scans)
      if (resolved.kind === "ignored") return false
      if (resolved.kind === "wrong_barcode") return void toast.warning(t.scanner.scanPdf417)
      if (resolved.kind === "unreadable") return void toast.error(t.scanner.unreadable)
      setChecking(true)
      try {
        const result = await releaseLookup({ carrierCode: carrier.carrierCode, scans })
        if (!result.ok) return void toast.error(errorText(t, result.error))
        if (result.value.parse.kind === "parsed") setLookup(result.value)
      } catch (e) {
        toast.error(navigator.onLine ? failureText(t, e) : t.receiving.lookupOffline)
      } finally {
        setChecking(false)
      }
    },
    [carrier, checking, t]
  )

  // gathering list sorted by location so the operator walks the shelves in order
  const gatherList = useMemo(() => {
    const key = (i: Item) => (i.locationId ? i.locationId : "~")
    return (eligible ?? [])
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
          setEligible(null)
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
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Ltr>{carrier?.name ?? session.carrierCode}</Ltr> · {t.receiving.changeSession}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)} aria-label={t.app.refresh}>
              <RefreshCwIcon />
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-2">
          {checking && (
            <p className="flex items-center gap-2 text-sm font-medium text-info-ink animate-in fade-in-0">
              <LoaderIcon className="size-4 animate-spin" />
              {t.receiving.checking}
            </p>
          )}
          <ScanInput
            mode={carrier?.parser === "fedexPdf417" ? "pdf417" : "linear"}
            paused={lookup !== null || checking}
            onScan={onScan}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              {t.release.eligible} {eligible && <>({eligible.length})</>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SearchBar value={query} onChange={setQuery} />
            {eligible === null ? (
              <LoadingState label={t.release.preparing} />
            ) : gatherList.length === 0 ? (
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
      <ReleaseScanDialog
        lookup={lookup}
        locations={locations}
        onClose={() => setLookup(null)}
        onScanned={(id) => setEligible((list) => list && list.filter((i) => i.internalItemId !== id))}
      />
    </div>
  )
}

function ReleaseScanDialog({
  lookup,
  locations,
  onClose,
  onScanned,
}: {
  lookup: ReleaseLookup | null
  locations: Map<string, WarehouseLocation>
  onClose: () => void
  onScanned: (internalItemId: string) => void
}) {
  const { t } = useI18n()
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
    setBusy(true)
    const outcome = await submitOp(
      t,
      "releaseScan",
      { internalItemId: piece.internalItemId },
      `${piece.itemId} ${piece.pieceNumber}/${piece.pieceTotal}`,
      t.release.scanned
    )
    setBusy(false)
    if (outcome.status === "failed") return
    onScanned(piece.internalItemId)
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
                    "surface flex w-full flex-col gap-1.5 p-3 text-start transition-all duration-150",
                    active && "border-primary bg-primary/5 ring-2 ring-primary/40",
                    ok && !active && "hover:shadow-md active:scale-[0.99]",
                    !ok && "cursor-not-allowed opacity-70"
                  )}
                >
                  <span className="flex items-center justify-between gap-2 font-semibold">
                    <span>
                      {t.fields.piece} <Ltr>{item.pieceNumber}/{item.pieceTotal}</Ltr>
                    </span>
                    <Badge variant={ok ? "success" : "neutral"}>{ok ? t.release.eligible : t.release.notEligible}</Badge>
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
