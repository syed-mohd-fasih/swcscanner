import { ManifestDetail } from "@/components/manifests/manifest-detail"

export default async function ManifestPage({ params }: PageProps<"/manifests/[manifestId]">) {
  const { manifestId } = await params
  return <ManifestDetail manifestId={manifestId} />
}
