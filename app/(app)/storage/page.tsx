import { StorageView } from "@/components/storage/storage-view"
import { requireRole } from "@/lib/auth/dal"
import { awaitingStorage } from "@/server/data/items"

export default async function StoragePage() {
  await requireRole("OPERATOR")
  const { rows, hasMore } = await awaitingStorage()
  return <StorageView items={rows} hasMore={hasMore} />
}
