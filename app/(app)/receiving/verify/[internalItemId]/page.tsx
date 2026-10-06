import { ReceivingVerifyPanel } from "@/components/items/verify-panels"

export default async function ReceivingVerifyPage({ params }: PageProps<"/receiving/verify/[internalItemId]">) {
  const { internalItemId } = await params
  return <ReceivingVerifyPanel internalItemId={internalItemId} />
}
