import type { Carrier } from "@/domain/carriers/types"
import type { Item } from "@/domain/items/types"
import type { WarehouseLocation } from "@/domain/locations/types"
import type { Manifest } from "@/domain/manifests/types"
import { newId } from "@/domain/shared/ids"
import { nowIso } from "@/domain/shared/dates"
import { getDb } from "@/lib/db/schema"
import type {
  CarrierRepository,
  ChangeSet,
  EntityChanges,
  ItemRepository,
  LocalCache,
  LocalWriter,
  LocationRepository,
  ManifestRepository,
  SyncRepository,
} from "@/repositories/interfaces"
import { notifyLocalChange } from "@/repositories/indexeddb/events"
import type { EntityType, PendingMutation } from "@/sync/queue/types"

export const itemRepository: ItemRepository = {
  async get(id) {
    return (await getDb()).get("items", id)
  },
  async getMany(ids) {
    const db = await getDb()
    const tx = db.transaction("items")
    const found = await Promise.all(ids.map((id) => tx.store.get(id)))
    return found.filter((i): i is Item => !!i)
  },
  async findByCarrierItemId(carrierCode, itemId) {
    return (await getDb()).getAllFromIndex("items", "byCarrierItemId", [carrierCode, itemId])
  },
  async findByItemId(itemId) {
    return (await getDb()).getAllFromIndex("items", "byItemId", itemId)
  },
  async listByManifest(manifestId) {
    return (await getDb()).getAllFromIndex("items", "byManifest", manifestId)
  },
  async listByReceivingState(state) {
    return (await getDb()).getAllFromIndex("items", "byReceiving", state)
  },
  async listByReleaseState(state) {
    return (await getDb()).getAllFromIndex("items", "byRelease", state)
  },
  async all() {
    return (await getDb()).getAll("items")
  },
}

export const manifestRepository: ManifestRepository = {
  async get(id) {
    return (await getDb()).get("manifests", id)
  },
  async all() {
    return (await getDb()).getAll("manifests")
  },
}

export const locationRepository: LocationRepository = {
  async get(id) {
    return (await getDb()).get("locations", id)
  },
  async all() {
    return (await getDb()).getAll("locations")
  },
  async active() {
    return (await getDb()).getAll("locations").then((all) => all.filter((l) => l.active))
  },
}

export const carrierRepository: CarrierRepository = {
  async get(code) {
    return (await getDb()).get("carriers", code)
  },
  async all() {
    return (await getDb()).getAll("carriers")
  },
}

export const syncRepository: SyncRepository = {
  async counts() {
    const db = await getDb()
    const [pending, syncing, failed] = await Promise.all([
      db.countFromIndex("outbox", "byStatus", "pending"),
      db.countFromIndex("outbox", "byStatus", "syncing"),
      db.countFromIndex("outbox", "byStatus", "failed"),
    ])
    return { pending, syncing, failed }
  },
  async list() {
    return (await getDb()).getAll("outbox")
  },
  async getMeta<T>(key: string) {
    return (await getDb()).get("meta", key) as Promise<T | undefined>
  },
  async setMeta(key, value) {
    await (await getDb()).put("meta", value, key)
  },
}

/** Fields of `after` that differ from `before` (shallow, JSON-equal). */
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
  const patch: Partial<T> = {}
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) patch[key] = after[key]
  }
  return patch
}

type Doc = Item | Manifest | WarehouseLocation | Carrier

const ID_FIELD: Record<Exclude<EntityType, "config">, string> = {
  items: "internalItemId",
  manifests: "manifestId",
  locations: "locationId",
  carriers: "carrierCode",
}

function mutation(
  entityType: EntityType,
  entityId: string,
  operation: PendingMutation["operation"],
  payload: Record<string, unknown> | null,
  baseVersion: number | null
): PendingMutation {
  return {
    id: newId(),
    entityType,
    entityId,
    operation,
    payload,
    baseVersion,
    createdAt: nowIso(),
    status: "pending",
    attempts: 0,
    retryAt: null,
    error: null,
    rejected: false,
  }
}

const versionOf = (doc: Doc) => ("version" in doc ? doc.version : null)

export const localWriter: LocalWriter = {
  async commit(changes: ChangeSet) {
    const db = await getDb()
    const tx = db.transaction(
      ["items", "manifests", "locations", "carriers", "outbox"],
      "readwrite"
    )
    const outbox = tx.objectStore("outbox")
    const queued: Promise<unknown>[] = []

    const apply = <T extends Doc>(
      entityType: Exclude<EntityType, "config">,
      set: EntityChanges<T> | undefined
    ) => {
      if (!set) return
      const store = tx.objectStore(entityType)
      const idOf = (d: T) => (d as unknown as Record<string, string>)[ID_FIELD[entityType]]
      for (const doc of set.create ?? []) {
        queued.push(store.put(doc as never))
        queued.push(outbox.put(mutation(entityType, idOf(doc), "create", { ...doc }, null)))
      }
      for (const { before, after } of set.update ?? []) {
        const patch = changedFields(before, after) as Record<string, unknown>
        if (Object.keys(patch).length === 0) continue
        queued.push(store.put(after as never))
        queued.push(
          outbox.put(mutation(entityType, idOf(after), "update", patch, versionOf(before)))
        )
      }
      for (const doc of set.delete ?? []) {
        queued.push(store.delete(idOf(doc)))
        queued.push(outbox.put(mutation(entityType, idOf(doc), "delete", null, versionOf(doc))))
      }
    }

    apply("items", changes.items)
    apply("manifests", changes.manifests)
    apply("locations", changes.locations)
    apply("carriers", changes.carriers)
    if (changes.configVersions) {
      queued.push(
        outbox.put(mutation("config", "versions", "update", changes.configVersions, null))
      )
    }

    await Promise.all([...queued, tx.done])
    notifyLocalChange()
  },
}

export const localCache: LocalCache = {
  async put(entityType, docs) {
    if (docs.length === 0) return
    const db = await getDb()
    const tx = db.transaction(entityType, "readwrite")
    await Promise.all([...docs.map((d) => tx.store.put(d as never)), tx.done])
    notifyLocalChange()
  },
  async remove(entityType, ids) {
    if (ids.length === 0) return
    const db = await getDb()
    const tx = db.transaction(entityType, "readwrite")
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
    notifyLocalChange()
  },
  async replaceAll(entityType, docs) {
    const db = await getDb()
    const tx = db.transaction(entityType, "readwrite")
    await tx.store.clear()
    await Promise.all([...docs.map((d) => tx.store.put(d as never)), tx.done])
    notifyLocalChange()
  },
}
