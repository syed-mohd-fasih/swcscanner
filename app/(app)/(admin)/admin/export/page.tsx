import { ExportView } from "@/components/admin/export-view"
import { requireRole } from "@/lib/auth/dal"
import { listManifests } from "@/server/data/manifests"
import { getNoManifestCount, withProgress } from "@/server/data/stats"

/** Pick manifests to export (newest first, search by name). */
export default async function ExportPage({ searchParams }: PageProps<"/admin/export">) {
  await requireRole("ADMIN")
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q : ""
  const [{ rows, hasMore }, unidentified] = await Promise.all([listManifests({ search: q, limit: 50 }), getNoManifestCount()])
  return <ExportView rows={await withProgress(rows)} hasMore={hasMore} query={q} unidentified={unidentified} />
}
