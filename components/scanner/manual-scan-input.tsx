"use client"

import { useState } from "react"

import type { RawScan } from "@/carriers"
import { FEDEX_1D_SUBPIECE, FEDEX_MULTI_PIECE_4_OF_5, FEDEX_SINGLE_PIECE } from "@/carriers/fedex/fixtures"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n/client"

/** Fallback when the camera can't read a label: type the barcode value. */
export function ManualScanInput({ onScan, disabled }: { onScan: (scan: RawScan) => void; disabled?: boolean }) {
  const { t } = useI18n()
  const [value, setValue] = useState("")
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!value.trim()) return
        onScan({ raw: value, format: "manual" })
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
const DEV_PAYLOADS: { label: string; scan: RawScan }[] = [
  { label: "1D single (A-1001)", scan: { raw: "A-1001", format: "linear" } },
  { label: "1D multi-piece (MASTER-001)", scan: { raw: "MASTER-001", format: "linear" } },
  { label: "1D partly received (MASTER-002)", scan: { raw: "MASTER-002", format: "linear" } },
  { label: "1D same ID, 2 manifests (DUP-777)", scan: { raw: "DUP-777", format: "linear" } },
  { label: "1D unknown (UNKNOWN-555)", scan: { raw: "UNKNOWN-555", format: "linear" } },
  { label: "1D unidentified group (ARX-UNK-1)", scan: { raw: "ARX-UNK-1", format: "linear" } },
  { label: "FedEx PDF417 single", scan: { raw: FEDEX_SINGLE_PIECE, format: "pdf417" } },
  { label: "FedEx PDF417 piece 4/5", scan: { raw: FEDEX_MULTI_PIECE_4_OF_5, format: "pdf417" } },
  { label: "FedEx 1D (wrong barcode)", scan: { raw: FEDEX_1D_SUBPIECE, format: "linear" } },
]

export function DevScanPayloads({ onScan }: { onScan: (scan: RawScan) => void }) {
  const { t } = useI18n()
  if (process.env.NODE_ENV === "production") return null
  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">{t.scanner.devPayloads}</summary>
      <div className="mt-2 flex flex-wrap gap-2" dir="ltr">
        {DEV_PAYLOADS.map((p) => (
          <Button key={p.label} variant="outline" size="sm" onClick={() => onScan(p.scan)}>
            {p.label}
          </Button>
        ))}
      </div>
    </details>
  )
}
