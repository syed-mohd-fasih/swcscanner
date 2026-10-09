import type { DomainError } from "@/domain/shared/result"
import type { Dictionary } from "@/lib/i18n/dictionaries/en"

/** Plain-language message for a server refusal, in the UI language. */
export function errorText(t: Dictionary, error: DomainError): string {
  return t.errors[error.code] ?? t.app.error
}

/** A server action threw (network down, new deploy, server error). */
export function failureText(t: Dictionary, e: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return t.sync.offlineHelp
  return e instanceof Error && /Server Action/i.test(e.message) ? t.errors.STALE_APP : t.app.error
}
