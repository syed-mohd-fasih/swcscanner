import { fetchDoc } from "@/repositories/firestore/remote"
import { localCache } from "@/repositories/indexeddb"
import type { PendingMutation } from "@/sync/queue/types"

export type ErrorKind = "network" | "rejected"

/**
 * Network-ish failures are retried with backoff; anything the server refused
 * (rules: permission-denied, version mismatch, missing doc) is a conflict.
 */
export function classifyError(error: unknown): ErrorKind {
  const code = (error as { code?: string } | null)?.code ?? ""
  if (["unavailable", "deadline-exceeded", "resource-exhausted", "cancelled", "internal", "unknown"].includes(code)) {
    return "network"
  }
  if (!code && typeof navigator !== "undefined" && !navigator.onLine) return "network"
  return "rejected"
}

/**
 * Conflict policy (deliberately simple for the MVP): the server wins. The
 * rejected local change is kept in the outbox as "failed" for the user to
 * see, and the local record is refreshed from Firestore.
 */
export async function reconcileRejected(m: PendingMutation): Promise<void> {
  if (m.entityType === "config") return
  try {
    const server = await fetchDoc<Record<string, unknown>>(m.entityType, m.entityId)
    if (server) await localCache.put(m.entityType, [server])
    else await localCache.remove(m.entityType, [m.entityId])
  } catch {
    // offline right now — the next pull will refresh it
  }
}
