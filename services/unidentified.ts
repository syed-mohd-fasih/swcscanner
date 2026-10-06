import type { InvestigationStatus, Item } from "@/domain/items/types"
import type { Result } from "@/domain/shared/result"
import { mergeUnidentified, setInvestigation } from "@/domain/unidentified/rules"
import { itemRepository, localWriter } from "@/repositories/indexeddb"
import { mutationContext, notFound } from "@/services/context"

export async function updateInvestigation(
  internalItemId: string,
  status: InvestigationStatus,
  note: string | null,
  actorId: string
): Promise<Result<Item>> {
  const piece = await itemRepository.get(internalItemId)
  if (!piece) return notFound("Piece")
  const result = setInvestigation(piece, status, note, mutationContext(actorId))
  if (!result.ok) return result
  await localWriter.commit({ items: { update: [{ before: piece, after: result.value }] } })
  return result
}

/** Admin: associate an unidentified piece with an expected manifest piece. */
export async function mergeIntoExpected(
  unidentifiedId: string,
  expectedId: string,
  actorId: string
): Promise<Result<Item>> {
  const [unidentified, expected] = await Promise.all([
    itemRepository.get(unidentifiedId),
    itemRepository.get(expectedId),
  ])
  if (!unidentified || !expected) return notFound("Piece")
  const result = mergeUnidentified(unidentified, expected, mutationContext(actorId))
  if (!result.ok) return result
  await localWriter.commit({
    items: {
      update: [{ before: expected, after: result.value.updated }],
      delete: [unidentified],
    },
  })
  return { ok: true, value: result.value.updated }
}
