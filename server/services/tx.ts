import "server-only"

import type { MutationContext } from "@/domain/items/factory"
import type { Item } from "@/domain/items/types"
import { nowIso } from "@/domain/shared/dates"
import { err, ok, type Result } from "@/domain/shared/result"
import { adminDb } from "@/lib/firebase/admin"
import { col } from "@/server/db"

/** Who is acting, and the client operation ID (idempotency key, a ULID). */
export type Op = { actorId: string; opId: string }

export function contextFor(op: Op): MutationContext {
  return { actorId: op.actorId, now: nowIso() }
}

export const notFound = (what = "Piece"): Result<never> => err("NOT_FOUND", `${what} not found.`)

/**
 * Read pieces, apply a domain rule, write the result — atomically. Two
 * operators receiving the same piece: exactly one transaction wins, the other
 * re-reads and gets the domain error (the duplicate guard).
 *
 * Replays: if every piece already carries this opId, the operation was
 * applied before (lost response, retry queue) and is answered as success.
 * Cost: one read per piece, one write per changed piece.
 */
export async function updateItems(
  ids: string[],
  op: Op,
  apply: (pieces: Item[], ctx: MutationContext) => Result<Item[]>
): Promise<Result<Item[]>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return err("INVALID_INPUT", "Select at least one piece.")
  if (unique.length > 450) return err("INVALID_INPUT", "Too many pieces at once (max 450).")
  return adminDb().runTransaction(async (tx) => {
    const refs = unique.map((id) => col.items().doc(id))
    const snaps = await tx.getAll(...refs)
    if (snaps.some((s) => !s.exists)) return notFound()
    const pieces = snaps.map((s) => s.data() as Item)
    if (pieces.every((p) => p.lastOpId === op.opId)) return ok(pieces)

    const result = apply(pieces, contextFor(op))
    if (!result.ok) return result
    for (const after of result.value) {
      tx.set(col.items().doc(after.internalItemId), { ...after, lastOpId: op.opId })
    }
    return ok(result.value.map((after) => ({ ...after, lastOpId: op.opId })))
  })
}

/** Single-piece form of updateItems. */
export async function updateItem(
  id: string,
  op: Op,
  apply: (piece: Item, ctx: MutationContext) => Result<Item>
): Promise<Result<Item>> {
  const res = await updateItems([id], op, ([piece], ctx) => {
    const r = apply(piece, ctx)
    return r.ok ? ok([r.value]) : r
  })
  return res.ok ? ok(res.value[0]) : res
}
