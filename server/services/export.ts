import "server-only"

import type { Item } from "@/domain/items/types"
import { err, ok, type Result } from "@/domain/shared/result"
import { adminDb } from "@/lib/firebase/admin"
import { chunk, col } from "@/server/db"
import { getItems } from "@/server/data/items"

const FINAL = new Set(["released", "repossessed", "seized"])

/**
 * Remove exported records from the operational database (keeps storage far
 * below the free 1 GiB). Only pieces with a final outcome may be archived —
 * active inventory is never deleted here. Already-deleted IDs are skipped.
 */
export async function archiveExported(internalItemIds: string[]): Promise<Result<number>> {
  const items: Item[] = await getItems(internalItemIds)
  const active = items.filter((i) => !FINAL.has(i.releaseState))
  if (active.length) {
    return err(
      "PIECE_NOT_ELIGIBLE",
      "Only released, repossessed or seized pieces can be archived.",
      active.map((i) => i.internalItemId)
    )
  }
  for (const part of chunk(items, 450)) {
    const batch = adminDb().batch()
    for (const i of part) batch.delete(col.items().doc(i.internalItemId))
    await batch.commit()
  }
  return ok(items.length)
}
