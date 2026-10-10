import { ManifestsList } from "@/components/manifests/manifests-list"
import { requireRole } from "@/lib/auth/dal"
import { listManifests } from "@/server/data/manifests"
import { withProgress } from "@/server/data/stats"

/** Newest manifests first (30 per page), with cached received/total counts. */
export default async function ManifestsPage({ searchParams }: PageProps<"/manifests">) {
  await requireRole("ADMIN")
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q : ""
  const carrier = typeof sp.carrier === "string" ? sp.carrier : ""
  const { rows, hasMore } = await listManifests({ search: q, carrierCode: carrier || undefined })
  return <ManifestsList rows={await withProgress(rows)} hasMore={hasMore} query={q} carrier={carrier} />
}
