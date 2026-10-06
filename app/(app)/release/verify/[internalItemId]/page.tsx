import { ReleaseVerifyPanel } from "@/components/items/verify-panels"

export default async function ReleaseVerifyPage({ params }: PageProps<"/release/verify/[internalItemId]">) {
  const { internalItemId } = await params
  return <ReleaseVerifyPanel internalItemId={internalItemId} />
}
