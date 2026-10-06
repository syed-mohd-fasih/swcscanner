import { ItemDetails } from "@/components/items/item-details"

export default async function ItemPage({ params }: PageProps<"/items/[internalItemId]">) {
  const { internalItemId } = await params
  return <ItemDetails internalItemId={internalItemId} />
}
