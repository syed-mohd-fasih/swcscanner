import { ReleaseVerifyPanel } from "@/components/items/verify-panels"
import { requireRole } from "@/lib/auth/dal"
import { getItemView } from "@/server/data/item-view"

export default async function ReleaseVerifyPage({ params }: PageProps<"/release/verify/[internalItemId]">) {
  await requireRole("OPERATOR")
  const { internalItemId } = await params
  const { item, manifest } = await getItemView(internalItemId)
  return <ReleaseVerifyPanel item={item} manifest={manifest} />
}
