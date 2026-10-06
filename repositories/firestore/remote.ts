import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore"

import type { Carrier } from "@/domain/carriers/types"
import type { Item } from "@/domain/items/types"
import type { WarehouseLocation } from "@/domain/locations/types"
import type { Manifest } from "@/domain/manifests/types"
import { getClientFirebase } from "@/lib/firebase/client"
import type { EntityType, PendingMutation } from "@/sync/queue/types"

/**
 * The persistent backend (Firestore). Only the sync engine and pull
 * functions talk to it — never components, never per scan.
 */
const db = () => getClientFirebase().db

/** Firestore allows 500 writes per batch; leave headroom. */
export const MAX_BATCH = 450

export async function applyMutations(mutations: PendingMutation[]): Promise<void> {
  const batch = writeBatch(db())
  for (const m of mutations) {
    const ref = doc(db(), m.entityType, m.entityId)
    if (m.operation === "delete") batch.delete(ref)
    else if (m.operation === "create") batch.set(ref, m.payload!)
    else if (m.entityType === "config") batch.set(ref, m.payload!, { merge: true })
    else batch.update(ref, m.payload!)
  }
  await batch.commit()
}

export async function fetchDoc<T>(entityType: EntityType, id: string): Promise<T | null> {
  const snap = await getDoc(doc(db(), entityType, id))
  return snap.exists() ? (snap.data() as T) : null
}

async function getAll<T>(name: string, ...constraints: QueryConstraint[]): Promise<T[]> {
  const snap = await getDocs(query(collection(db(), name), ...constraints))
  return snap.docs.map((d) => d.data() as T)
}

export type ConfigVersions = { locations?: string; carriers?: string }

export const remote = {
  configVersions: () => fetchDoc<ConfigVersions>("config", "versions"),
  locations: () => getAll<WarehouseLocation>("locations"),
  carriers: () => getAll<Carrier>("carriers"),

  manifests: (since?: string) =>
    since ? getAll<Manifest>("manifests", where("updatedAt", ">", since)) : getAll<Manifest>("manifests"),

  manifestsByIds: async (ids: string[]) => {
    const out: Manifest[] = []
    // `in` accepts up to 30 values
    for (let i = 0; i < ids.length; i += 30) {
      out.push(...(await getAll<Manifest>("manifests", where(documentId(), "in", ids.slice(i, i + 30)))))
    }
    return out
  },

  /** Receiving workspace for one carrier: everything still expected or unidentified. */
  receivingItems: (carrierCode: string) =>
    getAll<Item>(
      "items",
      where("carrierCode", "==", carrierCode),
      where("receivingState", "in", ["expected", "unidentified"])
    ),

  /** Release workspace for one carrier: physically received, not yet scanned. */
  releaseItems: (carrierCode: string) =>
    getAll<Item>(
      "items",
      where("carrierCode", "==", carrierCode),
      where("releaseState", "==", "not_released"),
      where("receivingState", "in", ["received", "unidentified"])
    ),

  /** Received pieces that still need a location (the separate store step). */
  awaitingStorage: () =>
    getAll<Item>(
      "items",
      where("storageState", "==", null),
      where("releaseState", "==", "not_released"),
      where("receivingState", "in", ["received", "unidentified"])
    ),

  /** Delta refresh: items of a carrier changed since the last pull. */
  itemsChangedSince: (carrierCode: string, since: string) =>
    getAll<Item>("items", where("carrierCode", "==", carrierCode), where("updatedAt", ">", since)),

  itemsByManifest: (manifestId: string) => getAll<Item>("items", where("manifestId", "==", manifestId)),
  itemsByReleaseState: (state: Item["releaseState"]) => getAll<Item>("items", where("releaseState", "==", state)),
  itemsByReceivingState: (state: Item["receivingState"]) =>
    getAll<Item>("items", where("receivingState", "==", state)),
  itemsWhere: (...constraints: QueryConstraint[]) => getAll<Item>("items", ...constraints),

  /** Aggregates are billed per 1000 index entries — cheap dashboard stats. */
  countItems: async (...constraints: QueryConstraint[]) =>
    (await getCountFromServer(query(collection(db(), "items"), ...constraints))).data().count,
}
