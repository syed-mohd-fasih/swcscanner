import type { Item } from "@/domain/items/types"
import { daysBetween, type BusinessDate } from "@/domain/shared/dates"

export type PieceProgress = {
  total: number
  /** piece numbers already physically received / recorded */
  found: number[]
  /** piece numbers that may still be confirmed */
  available: number[]
}

/**
 * All pieces sharing an itemId within one manifest, or within the
 * unidentified pool for one carrier.
 */
export type CandidateGroup = {
  key: string
  kind: "manifested" | "unidentified"
  manifestId: string | null
  carrierCode: string
  itemId: string
  pieceTotal: number
  pieces: Item[]
  manifestDate: BusinessDate | null
  /** days between manifest date and session date; null for unidentified */
  distanceDays: number | null
  progress: PieceProgress
}

export function groupKey(item: Pick<Item, "manifestId" | "carrierCode" | "itemId">): string {
  return item.manifestId
    ? `m:${item.manifestId}:${item.itemId}`
    : `u:${item.carrierCode}:${item.itemId}`
}

export function pieceProgress(pieces: Item[], kind: CandidateGroup["kind"]): PieceProgress {
  const total = pieces[0]?.pieceTotal ?? 0
  const all = Array.from({ length: total }, (_, i) => i + 1)
  if (kind === "unidentified") {
    const found = pieces.map((p) => p.pieceNumber).sort((a, b) => a - b)
    return { total, found, available: all.filter((n) => !found.includes(n)) }
  }
  const found = pieces
    .filter((p) => p.receivingState !== "expected")
    .map((p) => p.pieceNumber)
    .sort((a, b) => a - b)
  const available = pieces
    .filter((p) => p.receivingState === "expected" && p.releaseState === "not_released")
    .map((p) => p.pieceNumber)
    .sort((a, b) => a - b)
  return { total, found, available }
}

/**
 * Group lookup hits and order them for the verification dialog: groups with
 * pieces still to confirm first, then by closeness of manifest date to the
 * session date; unidentified groups after manifested ones.
 */
export function rankCandidates(
  items: Item[],
  manifestDates: ReadonlyMap<string, BusinessDate>,
  sessionDate: BusinessDate
): CandidateGroup[] {
  const groups = new Map<string, Item[]>()
  for (const item of items) {
    // only manifested and unidentified pieces are receiving candidates
    if (!item.manifestId && item.receivingState !== "unidentified") continue
    const key = groupKey(item)
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }

  const result: CandidateGroup[] = []
  for (const [key, pieces] of groups) {
    pieces.sort((a, b) => a.pieceNumber - b.pieceNumber)
    const first = pieces[0]
    const kind = first.manifestId ? "manifested" : "unidentified"
    const manifestDate = first.manifestId ? (manifestDates.get(first.manifestId) ?? null) : null
    result.push({
      key,
      kind,
      manifestId: first.manifestId,
      carrierCode: first.carrierCode,
      itemId: first.itemId,
      pieceTotal: first.pieceTotal,
      pieces,
      manifestDate,
      distanceDays: manifestDate ? daysBetween(manifestDate, sessionDate) : null,
      progress: pieceProgress(pieces, kind),
    })
  }

  const rank = (g: CandidateGroup) => [
    g.kind === "manifested" ? 0 : 1,
    g.progress.available.length > 0 || g.kind === "unidentified" ? 0 : 1,
    g.distanceDays ?? Number.MAX_SAFE_INTEGER,
  ]
  return result.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]
    return a.key.localeCompare(b.key)
  })
}
