import { UnidentifiedView } from "@/components/unidentified/unidentified-view"
import { requireRole } from "@/lib/auth/dal"
import { unidentified } from "@/server/data/items"

export default async function UnidentifiedPage() {
  await requireRole("OPERATOR")
  const { rows } = await unidentified()
  return <UnidentifiedView items={rows} />
}
