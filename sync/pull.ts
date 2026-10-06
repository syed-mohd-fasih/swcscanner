import type { Item } from "@/domain/items/types"
import type { Manifest } from "@/domain/manifests/types"
import { getDb } from "@/lib/db/schema"
import { fetchDoc, remote } from "@/repositories/firestore/remote"
import { localCache, syncRepository } from "@/repositories/indexeddb"

/**
 * Backend → IndexedDB. Reads are deliberately coarse (one query per session
 * workspace, then deltas) so scanning never waits on the network.
 */

/** IDs with unsynced local changes must not be overwritten by older server data. */
async function idsWithLocalChanges(entityType: "items" | "manifests"): Promise<Set<string>> {
  const db = await getDb()
  const all = await db.getAll("outbox")
  return new Set(all.filter((m) => m.entityType === entityType).map((m) => m.entityId))
}

async function mergeServerItems(items: Item[]): Promise<void> {
  const dirty = await idsWithLocalChanges("items")
  const db = await getDb()
  const fresh: Item[] = []
  for (const item of items) {
    if (dirty.has(item.internalItemId)) continue
    const local = await db.get("items", item.internalItemId)
    if (local && local.version > item.version) continue
    fresh.push(item)
  }
  await localCache.put("items", fresh)
}

async function mergeServerManifests(manifests: Manifest[]): Promise<void> {
  const dirty = await idsWithLocalChanges("manifests")
  await localCache.put(
    "manifests",
    manifests.filter((m) => !dirty.has(m.manifestId))
  )
}

/** Make sure every manifest referenced by these items is cached locally. */
async function ensureManifests(items: Item[]): Promise<void> {
  const db = await getDb()
  const ids = [...new Set(items.map((i) => i.manifestId).filter((id): id is string => !!id))]
  const missing: string[] = []
  for (const id of ids) if (!(await db.get("manifests", id))) missing.push(id)
  if (missing.length) await mergeServerManifests(await remote.manifestsByIds(missing))
}

function latestUpdate(items: Item[], previous?: string): string | undefined {
  return items.reduce<string | undefined>(
    (max, i) => (!max || i.updatedAt > max ? i.updatedAt : max),
    previous
  )
}

/**
 * Locations and carriers are configuration: refetch only when the version
 * stamp in `config/versions` changed (one document read otherwise).
 */
export async function pullConfig(): Promise<{ locations: boolean; carriers: boolean }> {
  const versions = (await remote.configVersions()) ?? {}
  const local = (await syncRepository.getMeta<Record<string, string>>("configVersions")) ?? {}
  const changed = { locations: false, carriers: false }

  const locationCount = await (await getDb()).count("locations")
  if (versions.locations !== local.locations || locationCount === 0) {
    await localCache.replaceAll("locations", await remote.locations())
    changed.locations = true
  }
  const carrierCount = await (await getDb()).count("carriers")
  if (versions.carriers !== local.carriers || carrierCount === 0) {
    await localCache.replaceAll("carriers", await remote.carriers())
    changed.carriers = true
  }
  await syncRepository.setMeta("configVersions", versions)
  return changed
}

/**
 * Receiving workspace for a carrier. First call is a full pull of pieces
 * still expected or unidentified; later calls fetch only changes.
 */
export async function pullReceivingWorkspace(carrierCode: string, full = false): Promise<void> {
  const key = `pull:items:${carrierCode}`
  const since = await syncRepository.getMeta<string>(key)

  if (full || !since) {
    // snapshot before fetching: a change that syncs mid-pull is still protected
    const dirtyBefore = await idsWithLocalChanges("items")
    const items = await remote.receivingItems(carrierCode)
    await mergeServerItems(items)
    await ensureManifests(items)
    await dropVanished(carrierCode, items, dirtyBefore)
    await syncRepository.setMeta(key, latestUpdate(items, since) ?? new Date(0).toISOString())
    return
  }
  const changed = await remote.itemsChangedSince(carrierCode, since)
  await mergeServerItems(changed)
  await ensureManifests(changed)
  if (changed.length) await syncRepository.setMeta(key, latestUpdate(changed, since))
}

/** Release workspace for a carrier: received pieces not yet release-scanned. */
export async function pullReleaseWorkspace(carrierCode: string): Promise<void> {
  const items = await remote.releaseItems(carrierCode)
  await mergeServerItems(items)
  await ensureManifests(items)
}

/**
 * Store workspace: every received piece still waiting for a location.
 * Local copies that the server no longer lists as waiting (stored on another
 * device) are dropped from the cache unless they have unsynced changes.
 */
export async function pullStorageWorkspace(): Promise<void> {
  const dirtyBefore = await idsWithLocalChanges("items")
  const items = await remote.awaitingStorage()
  await mergeServerItems(items)
  await ensureManifests(items)
  const keep = new Set(items.map((i) => i.internalItemId))
  const dirty = new Set([...dirtyBefore, ...(await idsWithLocalChanges("items"))])
  const db = await getDb()
  const stale = (await db.getAll("items"))
    .filter(
      (i) =>
        i.receivingState !== "expected" &&
        i.storageState === null &&
        i.releaseState === "not_released" &&
        !keep.has(i.internalItemId) &&
        !dirty.has(i.internalItemId)
    )
    .map((i) => i.internalItemId)
  await localCache.remove("items", stale)
}

/**
 * After a full receiving pull, local open pieces of that carrier the server
 * no longer lists (merged, deleted, received elsewhere) are dropped — unless
 * they carry unsynced local changes.
 */
async function dropVanished(carrierCode: string, serverItems: Item[], dirtyBefore: Set<string>): Promise<void> {
  const keep = new Set(serverItems.map((i) => i.internalItemId))
  const dirty = new Set([...dirtyBefore, ...(await idsWithLocalChanges("items"))])
  const db = await getDb()
  const local = await db.getAll("items")
  const stale = local
    .filter(
      (i) =>
        i.carrierCode === carrierCode &&
        (i.receivingState === "expected" || i.receivingState === "unidentified") &&
        !keep.has(i.internalItemId) &&
        !dirty.has(i.internalItemId)
    )
    .map((i) => i.internalItemId)
  await localCache.remove("items", stale)
}

/** Admin views (desktop, online): pull what the screen needs on open. */
export const adminPull = {
  async manifests() {
    const since = await syncRepository.getMeta<string>("pull:manifests")
    const manifests = await remote.manifests(since)
    await mergeServerManifests(manifests)
    const latest = manifests.reduce<string | undefined>(
      (max, m) => (!max || m.updatedAt > max ? m.updatedAt : max),
      since
    )
    if (latest) await syncRepository.setMeta("pull:manifests", latest)
  },
  async manifestItems(manifestId: string) {
    await mergeServerItems(await remote.itemsByManifest(manifestId))
  },
  async releaseScanned() {
    const items = await remote.itemsByReleaseState("release_scanned")
    await mergeServerItems(items)
    await ensureManifests(items)
  },
  async unidentified() {
    await mergeServerItems(await remote.itemsByReceivingState("unidentified"))
  },
  async item(internalItemId: string) {
    const item = await fetchDoc<Item>("items", internalItemId)
    if (item) {
      await mergeServerItems([item])
      await ensureManifests([item])
    }
  },
}
