import "server-only"

import type { DocumentSnapshot, Query } from "firebase-admin/firestore"

import { adminDb } from "@/lib/firebase/admin"

/** Flat collections, one per entity (same layout as v1). */
export const col = {
  items: () => adminDb().collection("items"),
  manifests: () => adminDb().collection("manifests"),
  locations: () => adminDb().collection("locations"),
  carriers: () => adminDb().collection("carriers"),
}

export const docData = <T>(snap: DocumentSnapshot): T | null => (snap.exists ? (snap.data() as T) : null)

export async function queryAll<T>(q: Query): Promise<T[]> {
  return (await q.get()).docs.map((d) => d.data() as T)
}

/** Count aggregation: billed as 1 read per 1,000 matching index entries. */
export async function countOf(q: Query): Promise<number> {
  return (await q.count().get()).data().count
}

/** Upper bound for "starts with" range queries (highest BMP private-use char). */
export const PREFIX_END = String.fromCharCode(0xf8ff)

/** Firestore `in` / getAll limits */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}
