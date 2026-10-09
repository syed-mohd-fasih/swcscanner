import { ManifestDetail } from "@/components/manifests/manifest-detail"
import { requireRole } from "@/lib/auth/dal"
import { itemsByManifest } from "@/server/data/items"
import { getManifest } from "@/server/data/manifests"

/** One read per piece of the manifest (admin screen). */
export default async function ManifestPage({ params }: PageProps<"/manifests/[manifestId]">) {
  await requireRole("ADMIN")
  const { manifestId } = await params
  const [manifest, items] = await Promise.all([getManifest(manifestId), itemsByManifest(manifestId)])
  return <ManifestDetail manifest={manifest} items={items} />
}
