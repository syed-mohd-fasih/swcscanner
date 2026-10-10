export type DomainErrorCode =
  | "PIECE_ALREADY_CONFIRMED"
  | "PIECE_NOT_ELIGIBLE"
  | "LOCATION_REQUIRED"
  | "LOCATION_NOT_ALLOWED"
  | "LOCATION_INVALID"
  | "INVALID_PIECE"
  | "INVALID_QUANTITY"
  | "NOT_RELEASE_SCANNED"
  | "OVERRIDE_REQUIRED"
  | "NOT_UNIDENTIFIED"
  | "NOT_EXPECTED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "EXPORT_TOO_LARGE"

export type DomainError = {
  code: DomainErrorCode
  message: string
  /** internalItemIds the error refers to, when relevant */
  itemIds?: string[]
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })

export const err = (
  code: DomainErrorCode,
  message: string,
  itemIds?: string[]
): Result<never> => ({ ok: false, error: { code, message, itemIds } })
