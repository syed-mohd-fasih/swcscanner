"use client"

import type { RawScan } from "@/carriers"
import { DevScanPayloads, ManualScanInput } from "@/components/scanner/manual-scan-input"
import { ScannerView, type ScanMode } from "@/components/scanner/scanner-view"

/** Camera first, typed fallback below, dev payloads in development. */
export function ScanInput({
  mode,
  paused,
  onScan,
}: {
  mode: ScanMode
  paused: boolean
  onScan: (scan: RawScan) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <ScannerView mode={mode} paused={paused} onScan={onScan} />
      <ManualScanInput onScan={onScan} disabled={paused} />
      <DevScanPayloads onScan={onScan} />
    </div>
  )
}
