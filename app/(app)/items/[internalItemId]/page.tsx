import { ItemDetails } from "@/components/items/item-details"
import { requireRole } from "@/lib/auth/dal"
import { getItemView } from "@/server/data/item-view"

export default async function ItemPage({ params }: PageProps<"/items/[internalItemId]">) {
  await requireRole("OPERATOR")
  const { internalItemId } = await params
  const { item, manifest } = await getItemView(internalItemId)
  return <ItemDetails item={item} manifest={manifest} />
}
