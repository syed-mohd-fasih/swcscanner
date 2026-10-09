import "server-only"

import type { Item } from "@/domain/items/types"
import type { Manifest } from "@/domain/manifests/types"
import { getItem } from "@/server/data/items"
import { getManifest } from "@/server/data/manifests"

/** One piece plus its manifest header (2 reads). */
export async function getItemView(internalItemId: string): Promise<{ item: Item | null; manifest: Manifest | null }> {
  const item = await getItem(internalItemId)
  const manifest = item?.manifestId ? await getManifest(item.manifestId) : null
  return { item, manifest }
}
