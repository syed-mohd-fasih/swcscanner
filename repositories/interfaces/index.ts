import type { Carrier } from "@/domain/carriers/types"
import type { Item, ReceivingState, ReleaseState } from "@/domain/items/types"
import type { WarehouseLocation } from "@/domain/locations/types"
import type { Manifest } from "@/domain/manifests/types"
import type { EntityType, PendingMutation } from "@/sync/queue/types"

/**
 * Repository boundary. UI → services → these interfaces → IndexedDB.
 * Reads are local; writes go through `LocalWriter.commit`, which updates the
 * local store and queues the outbox in one transaction.
 */
export interface ItemRepository {
  get(internalItemId: string): Promise<Item | undefined>
  getMany(internalItemIds: string[]): Promise<Item[]>
  findByCarrierItemId(carrierCode: string, itemId: string): Promise<Item[]>
  findByItemId(itemId: string): Promise<Item[]>
  listByManifest(manifestId: string): Promise<Item[]>
  listByReceivingState(state: ReceivingState): Promise<Item[]>
  listByReleaseState(state: ReleaseState): Promise<Item[]>
  all(): Promise<Item[]>
}

export interface ManifestRepository {
  get(manifestId: string): Promise<Manifest | undefined>
  all(): Promise<Manifest[]>
}

export interface LocationRepository {
  get(locationId: string): Promise<WarehouseLocation | undefined>
  all(): Promise<WarehouseLocation[]>
  active(): Promise<WarehouseLocation[]>
}

export interface CarrierRepository {
  get(carrierCode: string): Promise<Carrier | undefined>
  all(): Promise<Carrier[]>
}

export type SyncCounts = { pending: number; syncing: number; failed: number }

export interface SyncRepository {
  counts(): Promise<SyncCounts>
  list(): Promise<PendingMutation[]>
  getMeta<T>(key: string): Promise<T | undefined>
  setMeta(key: string, value: unknown): Promise<void>
}

export type EntityChanges<T> = {
  create?: T[]
  update?: { before: T; after: T }[]
  delete?: T[]
}

/** A set of local changes applied atomically and queued for sync. */
export type ChangeSet = {
  items?: EntityChanges<Item>
  manifests?: EntityChanges<Manifest>
  locations?: EntityChanges<WarehouseLocation>
  carriers?: EntityChanges<Carrier>
  /** config/versions fields to set (merge), e.g. { locations: "<iso>" } */
  configVersions?: Record<string, string>
}

export interface LocalWriter {
  commit(changes: ChangeSet): Promise<void>
}

/** Writes server data into the local cache without queueing anything. */
export interface LocalCache {
  put(entityType: Exclude<EntityType, "config">, docs: unknown[]): Promise<void>
  remove(entityType: Exclude<EntityType, "config">, ids: string[]): Promise<void>
  /** replace a whole collection (configuration datasets) */
  replaceAll(entityType: "locations" | "carriers", docs: unknown[]): Promise<void>
}
