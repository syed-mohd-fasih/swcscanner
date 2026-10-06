import { nowIso } from "@/domain/shared/dates"
import { getDb } from "@/lib/db/schema"
import { notifyLocalChange } from "@/repositories/indexeddb/events"
import { MAX_BATCH } from "@/repositories/firestore/remote"
import { classifyError, reconcileRejected } from "@/sync/conflicts/reconcile"
import type { PendingMutation } from "@/sync/queue/types"

export type SyncStatus = {
  online: boolean
  flushing: boolean
  lastSyncAt: string | null
  lastError: string | null
}

/** Pushes a batch to the backend; injectable for tests. */
export type BatchWriter = (mutations: PendingMutation[]) => Promise<void>

const FLUSH_INTERVAL_MS = 5_000
const MAX_BACKOFF_MS = 5 * 60_000
const LAST_SYNC_KEY = "lastSyncAt"

/**
 * Outbox → Firestore. Flushes in batches on an interval, when the tab hides,
 * on demand, and when connectivity returns. Only the oldest pending change
 * per entity is sent per round, so each document receives exactly one
 * version-checked write per batch.
 */
export class SyncEngine {
  private timer: ReturnType<typeof setInterval> | null = null
  private flushing: Promise<void> | null = null
  private listeners = new Set<(s: SyncStatus) => void>()
  // `online` starts true so server and client render identically; start()
  // reads the real value from navigator once mounted
  private status: SyncStatus = {
    online: true,
    flushing: false,
    lastSyncAt: null,
    lastError: null,
  }

  constructor(private readonly write: BatchWriter) {}

  start() {
    if (this.timer) return
    this.set({ online: navigator.onLine })
    void getDb()
      .then((db) => db.get("meta", LAST_SYNC_KEY))
      .then((v) => this.set({ lastSyncAt: (v as string | undefined) ?? null }))
    void this.recoverInterrupted()
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS)
    window.addEventListener("online", this.onOnline)
    window.addEventListener("offline", this.onOffline)
    document.addEventListener("visibilitychange", this.onVisibility)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    window.removeEventListener("online", this.onOnline)
    window.removeEventListener("offline", this.onOffline)
    document.removeEventListener("visibilitychange", this.onVisibility)
  }

  subscribe(listener: (s: SyncStatus) => void): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => this.listeners.delete(listener)
  }

  getStatus() {
    return this.status
  }

  /** Flush now (admin actions, session end, "sync now" button). */
  flush(): Promise<void> {
    if (!this.status.online) return Promise.resolve()
    if (!this.flushing) {
      this.flushing = this.flushRounds().finally(() => {
        this.flushing = null
        this.set({ flushing: false })
      })
    }
    return this.flushing
  }

  /** Put a failed-but-retryable mutation back into the queue immediately. */
  async retryFailed() {
    const db = await getDb()
    const failed = await db.getAllFromIndex("outbox", "byStatus", "failed")
    const tx = db.transaction("outbox", "readwrite")
    for (const m of failed.filter((f) => !f.rejected)) {
      await tx.store.put({ ...m, status: "pending", retryAt: null })
    }
    await tx.done
    notifyLocalChange()
    return this.flush()
  }

  /** Drop server-rejected mutations after the user acknowledged them. */
  async dismissRejected() {
    const db = await getDb()
    const failed = await db.getAllFromIndex("outbox", "byStatus", "failed")
    const tx = db.transaction("outbox", "readwrite")
    for (const m of failed.filter((f) => f.rejected)) await tx.store.delete(m.id)
    await tx.done
    notifyLocalChange()
  }

  private onOnline = () => {
    this.set({ online: true })
    void this.flush()
  }
  private onOffline = () => this.set({ online: false })
  private onVisibility = () => {
    if (document.visibilityState === "hidden") void this.flush()
  }

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch }
    this.listeners.forEach((l) => l(this.status))
  }

  /** A crash mid-flush leaves entries "syncing" — return them to pending. */
  private async recoverInterrupted() {
    const db = await getDb()
    const stuck = await db.getAllFromIndex("outbox", "byStatus", "syncing")
    if (stuck.length === 0) return
    const tx = db.transaction("outbox", "readwrite")
    for (const m of stuck) await tx.store.put({ ...m, status: "pending" })
    await tx.done
  }

  private async flushRounds() {
    // keep going while full rounds succeed
    for (let round = 0; round < 20; round++) {
      const sent = await this.flushOnce()
      if (sent === 0) return
    }
  }

  /** Returns how many mutations were sent this round. */
  private async flushOnce(): Promise<number> {
    const db = await getDb()
    const pending = (await db.getAllFromIndex("outbox", "byStatus", "pending")).sort((a, b) =>
      a.id.localeCompare(b.id)
    )
    const now = nowIso()
    const blocked = new Set<string>()
    // entities with an earlier failed/unsent change must wait for it
    for (const m of await db.getAllFromIndex("outbox", "byStatus", "failed")) {
      blocked.add(`${m.entityType}/${m.entityId}`)
    }
    const batch: PendingMutation[] = []
    for (const m of pending) {
      const key = `${m.entityType}/${m.entityId}`
      if (blocked.has(key)) continue
      blocked.add(key)
      if (m.retryAt && m.retryAt > now) continue
      batch.push(m)
      if (batch.length >= MAX_BATCH) break
    }
    if (batch.length === 0) return 0

    this.set({ flushing: true })
    await this.markStatus(batch, "syncing")

    try {
      await this.write(batch)
      await this.complete(batch)
      return batch.length
    } catch (error) {
      if (classifyError(error) === "network") {
        await this.backoff(batch, error)
        this.set({ lastError: describe(error) })
        return 0
      }
      // isolate the offending mutation(s): one write at a time
      let sent = 0
      for (const m of batch) {
        try {
          await this.write([m])
          await this.complete([m])
          sent++
        } catch (single) {
          if (classifyError(single) === "network") await this.backoff([m], single)
          else await this.reject(m, single)
        }
      }
      return sent
    }
  }

  private async markStatus(batch: PendingMutation[], status: PendingMutation["status"]) {
    const db = await getDb()
    const tx = db.transaction("outbox", "readwrite")
    for (const m of batch) await tx.store.put({ ...m, status })
    await tx.done
    notifyLocalChange()
  }

  private async complete(batch: PendingMutation[]) {
    const db = await getDb()
    const at = nowIso()
    const tx = db.transaction(["outbox", "meta"], "readwrite")
    for (const m of batch) await tx.objectStore("outbox").delete(m.id)
    await tx.objectStore("meta").put(at, LAST_SYNC_KEY)
    await tx.done
    this.set({ lastSyncAt: at, lastError: null })
    notifyLocalChange()
  }

  private async backoff(batch: PendingMutation[], error: unknown) {
    const db = await getDb()
    const tx = db.transaction("outbox", "readwrite")
    for (const m of batch) {
      const attempts = m.attempts + 1
      const delay = Math.min(MAX_BACKOFF_MS, 2 ** attempts * 1000)
      await tx.store.put({
        ...m,
        status: "pending",
        attempts,
        retryAt: new Date(Date.now() + delay).toISOString(),
        error: describe(error),
      })
    }
    await tx.done
    notifyLocalChange()
  }

  private async reject(m: PendingMutation, error: unknown) {
    const db = await getDb()
    await db.put("outbox", {
      ...m,
      status: "failed",
      attempts: m.attempts + 1,
      error: describe(error),
      rejected: true,
    })
    // local copy is now wrong — replace it with the server's version
    await reconcileRejected(m)
    this.set({ lastError: describe(error) })
    notifyLocalChange()
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
