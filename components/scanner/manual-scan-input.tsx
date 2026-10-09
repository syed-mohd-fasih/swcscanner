"use client"

import { useState } from "react"

import type { RawScan } from "@/carriers"
import type { ScanHandler } from "@/components/scanner/scanner-view"
import { FEDEX_1D_SUBPIECE, FEDEX_MULTI_PIECE_4_OF_5, FEDEX_SINGLE_PIECE } from "@/carriers/fedex/fixtures"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n/client"

/** Fallback when the camera can't read a label: type the barcode value. */
export function ManualScanInput({ onScan, disabled }: { onScan: ScanHandler; disabled?: boolean }) {
  const { t } = useI18n()
  const [value, setValue] = useState("")
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!value.trim()) return
        void onScan([{ raw: value, format: "manual" }])
        setValue("")
      }}
    >
      <Input
        dir="ltr"
        className="h-11"
        placeholder={t.scanner.manualPlaceholder}
        aria-label={t.scanner.manual}
        autoCapitalize="characters"
        autoCorrect="off"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button type="submit" size="lg" className="h-11" disabled={disabled}>
        {t.scanner.process}
      </Button>
    </form>
  )
}

/**
 * Development-only test payloads (they match the seed data). Lets the whole
 * flow be exercised without a phone or real labels.
 */
const linear = (raw: string): RawScan[] => [{ raw, format: "linear" }]

const DEV_PAYLOADS: { label: string; scans: RawScan[] }[] = [
  { label: "1D single (A-1001)", scans: linear("A-1001") },
  { label: "1D multi-piece (MASTER-001)", scans: linear("MASTER-001") },
  { label: "1D partly received (MASTER-002)", scans: linear("MASTER-002") },
  { label: "1D same ID, 2 manifests (DUP-777)", scans: linear("DUP-777") },
  { label: "1D unknown (UNKNOWN-555)", scans: linear("UNKNOWN-555") },
  { label: "1D unidentified group (ARX-UNK-1)", scans: linear("ARX-UNK-1") },
  { label: "FedEx PDF417 single", scans: [{ raw: FEDEX_SINGLE_PIECE, format: "pdf417" }] },
  { label: "FedEx PDF417 piece 4/5", scans: [{ raw: FEDEX_MULTI_PIECE_4_OF_5, format: "pdf417" }] },
  { label: "FedEx 1D (wrong barcode)", scans: linear(FEDEX_1D_SUBPIECE) },
  // real DHL label: routing code, piece ID and the 10-digit waybill (the item ID)
  { label: "DHL label, 3 barcodes", scans: [...linear("2LKW:KWIKCO+57000001"), ...linear("JJD014600012794402457"), ...linear("5111661225")] },
  { label: "DHL piece barcode only (ignored)", scans: linear("JJD014600012794402457") },
]

export function DevScanPayloads({ onScan }: { onScan: ScanHandler }) {
  const { t } = useI18n()
  if (process.env.NODE_ENV === "production") return null
  return (
    <details className="surface p-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">{t.scanner.devPayloads}</summary>
      <div className="mt-2 flex flex-wrap gap-2" dir="ltr">
        {DEV_PAYLOADS.map((p) => (
          <Button key={p.label} variant="outline" size="sm" onClick={() => void onScan(p.scans)}>
            {p.label}
          </Button>
        ))}
      </div>
    </details>
  )
}
