import { ReceivingVerifyPanel } from "@/components/items/verify-panels"
import { requireRole } from "@/lib/auth/dal"
import { getItemView } from "@/server/data/item-view"

export default async function ReceivingVerifyPage({ params }: PageProps<"/receiving/verify/[internalItemId]">) {
  await requireRole("OPERATOR")
  const { internalItemId } = await params
  const { item, manifest } = await getItemView(internalItemId)
  return <ReceivingVerifyPanel item={item} manifest={manifest} />
}
