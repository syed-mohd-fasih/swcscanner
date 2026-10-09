import "server-only"

import { unstable_cache } from "next/cache"

import type { BusinessDate } from "@/domain/shared/dates"
import { col, countOf } from "@/server/db"

/**
 * Counts for dashboards and progress lines. Each count is a Firestore count
 * query (1 read per 1,000 matches), shared across users and cached for a
 * minute — numbers can lag up to 60 s, which is fine for overview screens.
 */
const MINUTE = 60

export type DashboardStats = {
  receivedToday: number
  expected: number
  awaitingStorage: number
  awaitingReleaseScan: number
  unidentified: number
  awaitingOutcome: number
  directRelease: number
}

export const getDashboardStats = unstable_cache(
  async (today: BusinessDate): Promise<DashboardStats> => {
    const items = col.items()
    const open = items.where("releaseState", "==", "not_released").where("receivingState", "in", ["received", "unidentified"])
    const [receivedToday, expected, awaitingStorage, notReleased, unidentified, awaitingOutcome, directRelease] = await Promise.all([
      countOf(items.where("dateOfReceival", "==", today)),
      countOf(items.where("receivingState", "==", "expected")),
      countOf(items.where("storageState", "==", null).where("releaseState", "==", "not_released").where("receivingState", "in", ["received", "unidentified"])),
      countOf(open),
      countOf(items.where("receivingState", "==", "unidentified")),
      countOf(items.where("releaseState", "==", "release_scanned")),
      countOf(items.where("storageState", "==", "direct_release").where("releaseState", "==", "not_released")),
    ])
    return {
      receivedToday,
      expected,
      awaitingStorage,
      awaitingReleaseScan: notReleased - awaitingStorage,
      unidentified,
      awaitingOutcome,
      directRelease,
    }
  },
  ["dashboard-stats"],
  { revalidate: MINUTE, tags: ["stats"] }
)

export type CarrierDayProgress = { receivedOnDate: number; stillExpected: number }

/** Receiving header: "TNT · today: 12 received · 28 still expected". */
export const getCarrierDayProgress = unstable_cache(
  async (carrierCode: string, date: BusinessDate): Promise<CarrierDayProgress> => {
    const items = col.items().where("carrierCode", "==", carrierCode)
    const [receivedOnDate, stillExpected] = await Promise.all([
      countOf(items.where("dateOfReceival", "==", date)),
      countOf(items.where("receivingState", "==", "expected")),
    ])
    return { receivedOnDate, stillExpected }
  },
  ["carrier-day-progress"],
  { revalidate: MINUTE, tags: ["stats"] }
)

/** Received pieces per manifest (progress bars in the manifest list). */
export const getManifestReceived = unstable_cache(
  async (manifestId: string): Promise<number> =>
    countOf(col.items().where("manifestId", "==", manifestId).where("receivingState", "==", "received")),
  ["manifest-received"],
  { revalidate: MINUTE, tags: ["stats"] }
)

/** Fallback denominator for manifests created before pieceCount existed. */
export const getManifestPieceCount = unstable_cache(
  async (manifestId: string): Promise<number> => countOf(col.items().where("manifestId", "==", manifestId)),
  ["manifest-piece-count"],
  { revalidate: 10 * MINUTE, tags: ["stats"] }
)
