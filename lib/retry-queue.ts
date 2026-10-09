"use client"

import { flagMismatch, receivePiece, recordUnidentified, releaseScan, storeAt } from "@/app/actions/operator"
import type { DomainError, Result } from "@/domain/shared/result"
import { newId } from "@/domain/shared/ids"

/**
 * Small retry queue for operator scan actions. When the phone has no signal
 * at the moment of a receive / store / release scan, the operation waits here
 * (localStorage) and is sent when the connection returns. Every operation
 * carries an opId, so sending it twice is harmless (the server answers a
 * repeat as success). Lookups are never queued — they need the server.
 */

const ACTIONS = { receivePiece, recordUnidentified, storeAt, releaseScan, flagMismatch } as const
export type QueuedKind = keyof typeof ACTIONS

export type QueuedOp = {
  opId: string
  kind: QueuedKind
  args: Record<string, unknown>
  /** what the operator sees, e.g. "5111661225 1/3" */
  label: string
  createdAt: string
  /** set when the server refused it (not retried automatically) */
  error?: DomainError
}

export type RunOutcome<T> = { status: "done"; result: Result<T> } | { status: "queued" }

const RETRY_MS = 15_000
/** per user: a shared phone never sends one operator's scans as another */
let key: string | null = null
let ops: QueuedOp[] = []
const listeners = new Set<() => void>()
let flushing = false
let timer: ReturnType<typeof setTimeout> | null = null

/** Called once the signed-in user is known (SessionProvider). */
export function setQueueOwner(uid: string) {
  const next = `swc:retry-queue:${uid}`
  if (next === key) return
  key = next
  let stored: QueuedOp[] = []
  try {
    stored = JSON.parse(localStorage.getItem(key) ?? "[]") as QueuedOp[]
  } catch {
    // storage unavailable
  }
  save(stored)
}

function save(next: QueuedOp[]) {
  ops = next
  try {
    if (key) localStorage.setItem(key, JSON.stringify(ops))
  } catch {
    // storage full or blocked — the queue still works for this page
  }
  for (const l of listeners) l()
  schedule()
}

/** fetch failed (no signal / server unreachable) — as opposed to a refusal */
function isNetworkError(e: unknown): boolean {
  return (typeof navigator !== "undefined" && !navigator.onLine) || e instanceof TypeError
}

/**
 * Run a scan action now; if the network fails, keep it for later. Returns
 * the server's answer, or "queued".
 */
export async function runOp<T>(kind: QueuedKind, args: Record<string, unknown>, label: string): Promise<RunOutcome<T>> {
  const op: QueuedOp = { opId: newId(), kind, args, label, createdAt: new Date().toISOString() }
  try {
    const result = (await ACTIONS[kind]({ ...args, opId: op.opId } as never)) as Result<T>
    return { status: "done", result }
  } catch (e) {
    if (!isNetworkError(e)) throw e
    save([...ops, op])
    return { status: "queued" }
  }
}

/** Send waiting operations, oldest first, one at a time. */
export async function flushQueue(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    for (const op of ops.filter((o) => !o.error)) {
      let result: Result<unknown>
      try {
        result = (await ACTIONS[op.kind]({ ...op.args, opId: op.opId } as never)) as Result<unknown>
      } catch (e) {
        if (isNetworkError(e)) break // still offline — try again later
        result = { ok: false, error: { code: "FORBIDDEN", message: e instanceof Error ? e.message : String(e) } }
      }
      save(
        result.ok
          ? ops.filter((o) => o.opId !== op.opId)
          : ops.map((o) => (o.opId === op.opId ? { ...o, error: result.ok ? undefined : result.error } : o))
      )
    }
  } finally {
    flushing = false
  }
}

export function dismissOp(opId: string) {
  save(ops.filter((o) => o.opId !== opId))
}

export function retryOp(opId: string) {
  save(ops.map((o) => (o.opId === opId ? { ...o, error: undefined } : o)))
  void flushQueue()
}

function schedule() {
  if (timer) clearTimeout(timer)
  timer = null
  if (typeof window !== "undefined" && ops.some((o) => !o.error)) {
    timer = setTimeout(() => void flushQueue(), RETRY_MS)
  }
}

export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getQueue = (): QueuedOp[] => ops
const EMPTY: QueuedOp[] = []
export const getServerQueue = (): QueuedOp[] => EMPTY

if (typeof window !== "undefined") window.addEventListener("online", () => void flushQueue())
