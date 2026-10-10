import { OutcomesView } from "@/components/release/outcomes-view"
import { requireRole } from "@/lib/auth/dal"
import { byReleaseState } from "@/server/data/items"
import { getManifests } from "@/server/data/manifests"

export default async function ReleaseOutcomesPage() {
  await requireRole("ADMIN")
  const { rows } = await byReleaseState("release_scanned")
  const manifests = await getManifests(rows.map((i) => i.manifestId).filter((m): m is string => !!m))
  const manifestNames = Object.fromEntries([...manifests].map(([id, m]) => [id, m.manifestName]))
  return <OutcomesView items={rows} manifestNames={manifestNames} />
}
