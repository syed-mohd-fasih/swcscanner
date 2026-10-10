import "server-only"

import type { InvestigationStatus, Item } from "@/domain/items/types"
import { ok, type Result } from "@/domain/shared/result"
import { mergeUnidentified, setInvestigation } from "@/domain/unidentified/rules"
import { adminDb } from "@/lib/firebase/admin"
import { col } from "@/server/db"
import { contextFor, notFound, updateItem, type Op } from "@/server/services/tx"

export function updateInvestigation(
  internalItemId: string,
  status: InvestigationStatus,
  note: string | null,
  op: Op
): Promise<Result<Item>> {
  return updateItem(internalItemId, op, (piece, ctx) => setInvestigation(piece, status, note, ctx))
}

/**
 * Admin: associate an unidentified piece with an expected manifest piece.
 * The expected piece becomes received; the unidentified record is deleted.
 */
export async function mergeIntoExpected(unidentifiedId: string, expectedId: string, op: Op): Promise<Result<Item>> {
  return adminDb().runTransaction(async (tx) => {
    const [uSnap, eSnap] = await tx.getAll(col.items().doc(unidentifiedId), col.items().doc(expectedId))
    const expected = eSnap.exists ? (eSnap.data() as Item) : null
    if (!expected) return notFound()
    if (!uSnap.exists) return expected.lastOpId === op.opId ? ok(expected) : notFound()

    const result = mergeUnidentified(uSnap.data() as Item, expected, contextFor(op))
    if (!result.ok) return result
    const updated: Item = { ...result.value.updated, lastOpId: op.opId }
    tx.set(eSnap.ref, updated)
    tx.delete(uSnap.ref)
    return ok(updated)
  })
}
