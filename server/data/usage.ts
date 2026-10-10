// USAGE METER (disabled): Cloud Monitoring only answers projects with billing (Blaze); this project stays on Spark. Search "USAGE METER (disabled)" to bring it back.
// The whole module is kept as line comments so it is out of reach.
export {}

// import "server-only"
//
// import { applicationDefault, getApp, type Credential } from "firebase-admin/app"
// import { unstable_cache } from "next/cache"
//
// import { adminDb } from "@/lib/firebase/admin"
// import { col, countOf } from "@/server/db"
//
// /**
//  * Today's Firestore usage against the free (Spark) plan, for the admin usage
//  * meter. Counts come from Cloud Monitoring (free to read, a few minutes
//  * behind; needs the service account to have the "Monitoring Viewer" role).
//  * The daily quota resets at midnight US Pacific time.
//  */
// export const SPARK_LIMITS = { reads: 50_000, writes: 20_000, deletes: 20_000, storageBytes: 1024 ** 3 } as const
//
// export type UsageMeter = { used: number; limit: number }
// export type Usage =
//   | {
//       available: true
//       reads: UsageMeter
//       writes: UsageMeter
//       deletes: UsageMeter
//       storage: UsageMeter & { estimated: boolean }
//       /** when the daily counters reset (ISO) */
//       resetsAt: string
//       checkedAt: string
//     }
//   | { available: false; reason: "emulator" | "permission" | "error" }
//
// const METRICS = {
//   reads: ["firestore.googleapis.com/document/read_ops_count", "firestore.googleapis.com/document/read_count"],
//   writes: ["firestore.googleapis.com/document/write_ops_count", "firestore.googleapis.com/document/write_count"],
//   deletes: ["firestore.googleapis.com/document/delete_ops_count", "firestore.googleapis.com/document/delete_count"],
// }
// /** rough size of one piece / manifest incl. index entries, for the storage estimate */
// const BYTES_PER_ITEM = 3 * 1024
// const BYTES_PER_MANIFEST = 1024
//
// class PermissionError extends Error {}
//
// /** Midnight in US Pacific time today, and the next one. */
// export function pacificDay(now = new Date()): { start: Date; end: Date } {
//   const parts = Object.fromEntries(
//     new Intl.DateTimeFormat("en-US", {
//       timeZone: "America/Los_Angeles",
//       year: "numeric",
//       month: "2-digit",
//       day: "2-digit",
//       hour: "2-digit",
//       minute: "2-digit",
//       second: "2-digit",
//       hourCycle: "h23",
//     })
//       .formatToParts(now)
//       .map((p) => [p.type, p.value])
//   )
//   const sinceMidnightMs = ((+parts.hour * 60 + +parts.minute) * 60 + +parts.second) * 1000 + now.getMilliseconds()
//   const start = new Date(now.getTime() - sinceMidnightMs)
//   return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
// }
//
// async function accessToken(): Promise<string> {
//   const credential: Credential = getApp().options.credential ?? applicationDefault()
//   return (await credential.getAccessToken()).access_token
// }
//
// /** Sum of a DELTA metric over [start, now] across all series; null = no series. */
// async function sumMetric(token: string, project: string, type: string, start: Date, now: Date): Promise<number | null> {
//   const seconds = Math.max(60, Math.ceil((now.getTime() - start.getTime()) / 1000))
//   const params = new URLSearchParams({
//     filter: `metric.type = "${type}"`,
//     "interval.startTime": start.toISOString(),
//     "interval.endTime": now.toISOString(),
//     "aggregation.alignmentPeriod": `${seconds}s`,
//     "aggregation.perSeriesAligner": "ALIGN_SUM",
//     "aggregation.crossSeriesReducer": "REDUCE_SUM",
//   })
//   const res = await fetch(`https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${params}`, {
//     headers: { Authorization: `Bearer ${token}` },
//   })
//   if (res.status === 403) throw new PermissionError()
//   if (!res.ok) return null // unknown metric type in this project
//   const body = (await res.json()) as { timeSeries?: { points?: { value: { int64Value?: string; doubleValue?: number } }[] }[] }
//   if (!body.timeSeries?.length) return null
//   let total = 0
//   for (const series of body.timeSeries)
//     for (const p of series.points ?? []) total += Number(p.value.int64Value ?? p.value.doubleValue ?? 0)
//   return total
// }
//
// async function firstMetric(token: string, project: string, types: string[], start: Date, now: Date): Promise<number> {
//   for (const type of types) {
//     const v = await sumMetric(token, project, type, start, now)
//     if (v !== null) return v
//   }
//   return 0 // no data points yet today
// }
//
// async function readUsage(): Promise<Usage> {
//   if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") return { available: false, reason: "emulator" }
//   const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
//   if (!project) return { available: false, reason: "error" }
//   try {
//     adminDb() // make sure the admin app is initialized
//     const token = await accessToken()
//     const now = new Date()
//     const { start, end } = pacificDay(now)
//     const [reads, writes, deletes, items, manifests] = await Promise.all([
//       firstMetric(token, project, METRICS.reads, start, now),
//       firstMetric(token, project, METRICS.writes, start, now),
//       firstMetric(token, project, METRICS.deletes, start, now),
//       countOf(col.items()),
//       countOf(col.manifests()),
//     ])
//     return {
//       available: true,
//       reads: { used: reads, limit: SPARK_LIMITS.reads },
//       writes: { used: writes, limit: SPARK_LIMITS.writes },
//       deletes: { used: deletes, limit: SPARK_LIMITS.deletes },
//       storage: { used: items * BYTES_PER_ITEM + manifests * BYTES_PER_MANIFEST, limit: SPARK_LIMITS.storageBytes, estimated: true },
//       resetsAt: end.toISOString(),
//       checkedAt: now.toISOString(),
//     }
//   } catch (e) {
//     return { available: false, reason: e instanceof PermissionError ? "permission" : "error" }
//   }
// }
//
// /** Cached 5 minutes across server instances (Monitoring lags a few minutes anyway). */
// export const getUsage = unstable_cache(readUsage, ["firestore-usage"], { revalidate: 300 })
//
// /** Highest share of any daily limit or storage, 0–1. */
// export function peakShare(u: Usage): number {
//   if (!u.available) return 0
//   return Math.max(...[u.reads, u.writes, u.deletes, u.storage].map((m) => m.used / m.limit))
// }
