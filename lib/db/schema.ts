import { openDB, type DBSchema, type IDBPDatabase } from "idb"

import type { Carrier } from "@/domain/carriers/types"
import type { Item } from "@/domain/items/types"
import type { WarehouseLocation } from "@/domain/locations/types"
import type { Manifest } from "@/domain/manifests/types"
import type { PendingMutation } from "@/sync/queue/types"

/**
 * The device-local operational workspace. Every scan reads and writes here;
 * Firestore only sees batched outbox flushes.
 */
export interface SwcDB extends DBSchema {
  items: {
    key: string
    value: Item
    indexes: {
      byItemId: string
      byCarrierItemId: [string, string]
      byManifest: string
      byReceiving: string
      byRelease: string
    }
  }
  manifests: { key: string; value: Manifest }
  locations: { key: string; value: WarehouseLocation }
  carriers: { key: string; value: Carrier }
  meta: { key: string; value: unknown }
  outbox: {
    key: string
    value: PendingMutation
    indexes: { byStatus: string; byEntity: [string, string] }
  }
}

export const DB_NAME = "swc"
export const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<SwcDB>> | null = null

export function getDb(): Promise<IDBPDatabase<SwcDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SwcDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const items = db.createObjectStore("items", { keyPath: "internalItemId" })
        items.createIndex("byItemId", "itemId")
        items.createIndex("byCarrierItemId", ["carrierCode", "itemId"])
        // null manifestIds are simply not indexed (unidentified pieces)
        items.createIndex("byManifest", "manifestId")
        items.createIndex("byReceiving", "receivingState")
        items.createIndex("byRelease", "releaseState")

        db.createObjectStore("manifests", { keyPath: "manifestId" })
        db.createObjectStore("locations", { keyPath: "locationId" })
        db.createObjectStore("carriers", { keyPath: "carrierCode" })
        db.createObjectStore("meta")

        const outbox = db.createObjectStore("outbox", { keyPath: "id" })
        outbox.createIndex("byStatus", "status")
        outbox.createIndex("byEntity", ["entityType", "entityId"])
      },
    })
  }
  return dbPromise
}

/** Tests only: drop the cached connection. */
export function resetDbForTests() {
  dbPromise = null
}
