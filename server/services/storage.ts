import "server-only"

import type { Item } from "@/domain/items/types"
import { storePiece } from "@/domain/receiving/rules"
import { ok, type Result } from "@/domain/shared/result"
import { getActiveLocations } from "@/server/data/config"
import { updateItems, type Op } from "@/server/services/tx"

/**
 * The separate store step: put received pieces at one predefined location.
 * All-or-nothing. The location is checked against the cached config (no read).
 */
export async function storePieces(internalItemIds: string[], locationId: string, op: Op): Promise<Result<Item[]>> {
  const active = new Set((await getActiveLocations()).map((l) => l.locationId))
  const isValid = (id: string) => active.has(id)
  return updateItems(internalItemIds, op, (pieces, ctx) => {
    const stored: Item[] = []
    for (const piece of pieces) {
      const r = storePiece(piece, locationId, ctx, isValid)
      if (!r.ok) return r
      stored.push(r.value)
    }
    return ok(stored)
  })
}
