"use client"

import type { BarcodeFormat } from "barcode-detector/ponyfill"
import { CameraIcon, CameraOffIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import type { RawScan } from "@/carriers"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/client"

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string; format: string }[]> }
type DetectorClass = {
  new (options: { formats: BarcodeFormat[] }): Detector
  getSupportedFormats?: () => Promise<string[]>
}

/**
 * The phone's built-in barcode reader when it covers the needed formats
 * (Android Chrome); otherwise the ZXing WASM ponyfill, loaded only then
 * (self-hosted decoder, see scripts/copy-wasm.ts — no CDN at scan time).
 */
async function createDetector(formats: BarcodeFormat[]): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector
  if (native?.getSupportedFormats) {
    const supported = await native.getSupportedFormats().catch(() => [] as string[])
    if (formats.every((f) => supported.includes(f))) return new native({ formats })
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill")
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing/zxing_reader.wasm" : prefix + path),
    },
  })
  return new BarcodeDetector({ formats })
}

const LINEAR: BarcodeFormat[] = ["code_128", "code_39", "code_93", "codabar", "ean_13", "ean_8", "itf", "upc_a", "upc_e"]

export type ScanMode = "linear" | "pdf417"

/** Called with every barcode decoded together; resolve false for "ignored". */
export type ScanHandler = (scans: RawScan[]) => void | boolean | Promise<void | boolean>

const SAME_VALUE_COOLDOWN_MS = 2000
const DETECT_INTERVAL_MS = 120

function feedback() {
  try {
    navigator.vibrate?.(60)
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 1200
    gain.gain.value = 0.08
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.08)
    osc.onended = () => void ctx.close()
  } catch {
    // feedback is best-effort
  }
}

type CameraError = "insecure" | "denied" | "unavailable"

/**
 * Phone-camera barcode scanner (BarcodeDetector API). Starts by itself when
 * the screen opens. In "pdf417" mode linear codes are still detected so the
 * parser can tell the operator they scanned the wrong one.
 */
export function ScannerView({
  mode,
  paused,
  onScan,
}: {
  mode: ScanMode
  paused: boolean
  /** every barcode in the frame; resolve false to skip the beep (ignored read) */
  onScan: ScanHandler
}) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastRef = useRef<{ value: string; at: number } | null>(null)
  const onScanRef = useRef(onScan)
  const pausedRef = useRef(paused)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<CameraError | null>(null)

  useEffect(() => {
    onScanRef.current = onScan
    pausedRef.current = paused
  })

  /** bumps on stop/unmount so a late-arriving camera stream is released */
  const generationRef = useRef(0)

  const stop = useCallback(() => {
    generationRef.current++
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setRunning(false)
  }, [])

  const start = useCallback(async () => {
    const generation = ++generationRef.current
    setError(null)
    if (!window.isSecureContext) return setError("insecure")
    if (!navigator.mediaDevices?.getUserMedia) return setError("unavailable")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // dense PDF417 needs resolution; the browser picks the closest
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setRunning(true)
    } catch (e) {
      if (generation === generationRef.current) {
        setError((e as DOMException).name === "NotAllowedError" ? "denied" : "unavailable")
      }
    }
  }, [])

  // start right away; if the browser needs a tap first, the button shows
  useEffect(() => {
    const timer = setTimeout(() => void start(), 0)
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [start, stop])

  useEffect(() => {
    if (!running) return
    const formats: BarcodeFormat[] = mode === "pdf417" ? ["pdf417", ...LINEAR] : LINEAR
    let detector: Detector | null = null
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    createDetector(formats).then(
      (d) => (detector = d),
      () => setError("unavailable")
    )

    const tick = async () => {
      const video = videoRef.current
      if (!cancelled && detector && video && video.readyState >= 2 && !pausedRef.current) {
        try {
          const found = (await detector.detect(video)).filter((b) => b.rawValue)
          if (found.length > 0) {
            // labels can carry several barcodes (DHL); hand over all of them
            const scans: RawScan[] = found.map((b) => ({
              raw: b.rawValue,
              format: b.format === "pdf417" ? "pdf417" : "linear",
            }))
            const key = scans.map((x) => x.raw).sort().join("|")
            const now = Date.now()
            const last = lastRef.current
            if (!last || last.value !== key || now - last.at > SAME_VALUE_COOLDOWN_MS) {
              lastRef.current = { value: key, at: now }
              const accepted = await onScanRef.current(scans)
              if (accepted !== false) feedback()
            }
          }
        } catch {
          // a bad frame is not an error worth surfacing
        }
      }
      if (!cancelled) timer = setTimeout(tick, DETECT_INTERVAL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [running, mode])

  const message =
    error === "insecure" ? t.scanner.needsHttps : error === "denied" ? t.scanner.permissionDenied : error ? t.scanner.noCamera : null

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black sm:aspect-video">
        <video ref={videoRef} playsInline muted className="size-full object-cover" />
        {running && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={
                mode === "pdf417"
                  ? "h-2/5 w-4/5 rounded-xl border-2 border-white/80"
                  : "h-1/4 w-4/5 rounded-xl border-2 border-white/80"
              }
            />
          </div>
        )}
        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white">
            {message && <p className="text-sm">{message}</p>}
            <Button size="lg" onClick={() => void start()}>
              <CameraIcon />
              {t.scanner.start}
            </Button>
          </div>
        )}
        {running && paused && <div className="absolute inset-0 bg-black/50" />}
      </div>
      {running && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t.scanner.pointCamera}</p>
          <Button variant="outline" size="sm" onClick={stop}>
            <CameraOffIcon />
            {t.scanner.stop}
          </Button>
        </div>
      )}
    </div>
  )
}
