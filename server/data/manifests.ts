import "server-only"

import { unstable_cache } from "next/cache"

import type { Manifest } from "@/domain/manifests/types"
import { chunk, col, docData, PREFIX_END, queryAll } from "@/server/db"
import type { Page } from "@/server/data/items"

export const MANIFESTS_TAG = "manifests"

export async function getManifest(manifestId: string): Promise<Manifest | null> {
  return docData<Manifest>(await col.manifests().doc(manifestId).get())
}

export async function getManifests(ids: string[]): Promise<Map<string, Manifest>> {
  const unique = [...new Set(ids)]
  const out = new Map<string, Manifest>()
  for (const part of chunk(unique, 100)) {
    if (part.length === 0) continue
    const snaps = await col.manifests().firestore.getAll(...part.map((id) => col.manifests().doc(id)))
    for (const s of snaps) if (s.exists) out.set(s.id, s.data() as Manifest)
  }
  return out
}

/**
 * Newest first, paged. Search matches the start of the manifest name
 * (e.g. "TNT-10-8"), which Firestore can answer from an index.
 */
export async function listManifests(opts: { carrierCode?: string; search?: string; limit?: number }): Promise<Page<Manifest>> {
  const limit = opts.limit ?? 30
  const search = opts.search?.trim().toUpperCase()
  let q: FirebaseFirestore.Query = col.manifests()
  if (opts.carrierCode) q = q.where("carrierCode", "==", opts.carrierCode)
  q = search
    ? q.where("manifestName", ">=", search).where("manifestName", "<", search + PREFIX_END).orderBy("manifestName")
    : q.orderBy("date", "desc")
  const rows = await queryAll<Manifest>(q.limit(limit + 1))
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit }
}

/**
 * Manifest headers for scan lookups, cached across server instances (headers
 * rarely change; saves one read on every receiving scan).
 */
const getManifestCached = unstable_cache(getManifest, ["manifest-header"], { revalidate: 3600, tags: [MANIFESTS_TAG] })

export async function getManifestHeaders(ids: string[]): Promise<Map<string, Manifest>> {
  const out = new Map<string, Manifest>()
  for (const id of new Set(ids)) {
    const m = await getManifestCached(id)
    if (m) out.set(id, m)
  }
  return out
}
