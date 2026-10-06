/** Business date in YYYY-MM-DD form, distinct from technical ISO timestamps. */
export type BusinessDate = string

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The device's current working date (local time), as a business date. */
export function todayBusinessDate(now: Date = new Date()): BusinessDate {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function isBusinessDate(value: string): value is BusinessDate {
  if (!BUSINESS_DATE.test(value)) return false
  const [y, m, d] = value.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

/** Whole days between two business dates (absolute). */
export function daysBetween(a: BusinessDate, b: BusinessDate): number {
  const toUtc = (v: BusinessDate) => {
    const [y, m, d] = v.split("-").map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.abs(Math.round((toUtc(a) - toUtc(b)) / 86_400_000))
}

/** Technical timestamp (ISO 8601, UTC). */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString()
}
