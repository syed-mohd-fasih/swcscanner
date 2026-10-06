/** Firestore collections the outbox can write. */
export type EntityType = "items" | "manifests" | "locations" | "carriers" | "config"

export type MutationStatus = "pending" | "syncing" | "failed"

/**
 * One queued local change. `id` is a ULID: it orders the queue and doubles as
 * the idempotency key for retries.
 */
export type PendingMutation = {
  id: string
  entityType: EntityType
  entityId: string
  operation: "create" | "update" | "delete"
  /** create: full document · update: changed fields only · delete: null */
  payload: Record<string, unknown> | null
  /** entity version the change was made against (conflict diagnostics) */
  baseVersion: number | null
  createdAt: string
  status: MutationStatus
  attempts: number
  /** next retry not before this ISO time */
  retryAt: string | null
  error: string | null
  /** set when the server rejected it (rules/conflict) — will not retry */
  rejected: boolean
}
