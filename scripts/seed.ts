/**
 * Seed the Firebase emulators with realistic development data.
 *   bun run emulators   (separate terminal)
 *   bun run seed
 * Wipes the emulator's Auth + Firestore first. Refuses to run without the
 * emulator env vars, so it can never touch a real project.
 */
import { initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

import type { Carrier } from "@/domain/carriers/types"
import { createItem, touch, type MutationContext } from "@/domain/items/factory"
import type { Item } from "@/domain/items/types"
import { locationIdFor, type WarehouseLocation } from "@/domain/locations/types"
import { expandManifestLine, generateManifestName } from "@/domain/manifests/rules"
import type { Manifest, ManifestLine } from "@/domain/manifests/types"
import { confirmReceipt, storePiece } from "@/domain/receiving/rules"
import { assignOutcome, releaseScan } from "@/domain/release/rules"
import { todayBusinessDate } from "@/domain/shared/dates"
import { newId } from "@/domain/shared/ids"
import { usernameToEmail, type AppUser, type Role } from "@/domain/users/types"

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-swcscanner"
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
if (!FS_HOST || !AUTH_HOST) {
  console.error("Emulator env vars missing — refusing to seed. Use: bun run seed")
  process.exit(1)
}

initializeApp({ projectId: PROJECT })
const auth = getAuth()
const db = getFirestore()

const now = () => new Date().toISOString()
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return todayBusinessDate(d)
}
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

async function wipe() {
  await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" })
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" })
}

async function seedUser(name: string, username: string, password: string, role: Role): Promise<string> {
  const user = await auth.createUser({ email: usernameToEmail(username), password, displayName: name })
  await auth.setCustomUserClaims(user.uid, { role, username, name })
  const profile: AppUser = { uid: user.uid, name, username, role, disabled: false }
  await db.collection("users").doc(user.uid).set(profile)
  return user.uid
}

const CARRIERS: Omit<Carrier, "createdAt" | "updatedAt">[] = [
  { carrierCode: "FDX", name: "FedEx", parser: "fedexPdf417", active: true },
  { carrierCode: "TNT", name: "TNT", parser: "generic1d", active: true },
  { carrierCode: "ARX", name: "Aramex", parser: "generic1d", active: true },
  { carrierCode: "DHL", name: "DHL", parser: "generic1d", active: true },
]

/** Warehouse → lettered rack → position number (as printed on the rack). */
function locations(): WarehouseLocation[] {
  const out: WarehouseLocation[] = []
  const add = (warehouse: string, racks: string, positions: number) => {
    for (const rack of racks)
      for (let p = 1; p <= positions; p++) {
        const position = String(p)
        out.push({ locationId: locationIdFor(warehouse, rack, position), warehouse, rack, position, active: true, createdAt: now(), updatedAt: now() })
      }
  }
  add("WH1", "ABC", 10)
  add("WH2", "A", 5)
  return out
}

function manifest(carrierCode: string, date: string, truckId: string, notes: string | null = null): Manifest {
  return {
    manifestId: newId(),
    manifestName: generateManifestName(carrierCode, date, truckId),
    truckId,
    carrierCode,
    date,
    notes,
    createdAt: now(),
    updatedAt: now(),
    version: 1,
  }
}

function line(itemId: string, carrierCode: string, quantity: number, extra: Partial<ManifestLine> = {}): ManifestLine {
  return {
    itemId,
    carrierCode,
    quantity,
    shipper: extra.shipper ?? "GLOBAL SUPPLY LLC",
    consignee: extra.consignee ?? "AL-SABAH TRADING CO",
    weight: extra.weight ?? 2.5 * quantity,
    description: extra.description ?? "General cargo",
  }
}

async function main() {
  console.log(`Seeding emulators for ${PROJECT} …`)
  await wipe()

  const adminUid = await seedUser("Admin", "admin", "admin12345", "ADMIN")
  const operatorUid = await seedUser("Operator One", "operator", "operator123", "OPERATOR")
  const ctx: MutationContext = { actorId: adminUid, now: now() }
  const opCtx: MutationContext = { actorId: operatorUid, now: now() }
  const validLocation = () => true
  const today = todayBusinessDate()

  const manifests: Manifest[] = []
  const items: Item[] = []
  const addManifest = (m: Manifest, lines: ManifestLine[]) => {
    manifests.push(m)
    for (const l of lines) items.push(...unwrap(expandManifestLine(l, m.manifestId, ctx)))
  }
  /** receive, then (separately) store at a location — or leave awaiting / direct release */
  const receive = (itemId: string, piece: number, where: string | "later" | "direct", date = today) => {
    const i = items.findIndex((x) => x.itemId === itemId && x.pieceNumber === piece && x.receivingState === "expected")
    items[i] = unwrap(
      confirmReceipt(items[i], { path: where === "direct" ? "direct_release" : "store_later", dateOfReceival: date }, opCtx)
    )
    if (where !== "later" && where !== "direct") items[i] = unwrap(storePiece(items[i], where, opCtx, validLocation))
    return i
  }

  // Manifest A — single-piece items (today)
  const mA = manifest("TNT", today, "KWT1001", "Manifest A: single pieces")
  addManifest(mA, [
    line("A-1001", "TNT", 1, { consignee: "GULF MEDICAL CO", description: "Medical supplies" }),
    line("A-1002", "TNT", 1, { description: "Spare parts" }),
    line("A-1003", "TNT", 1, { description: "Documents" }),
    line("DUP-777", "TNT", 1, { consignee: "KUWAIT ELECTRONICS", description: "Same ID as an older manifest" }),
  ])

  // Manifest B — multi-piece shipments
  const mB = manifest("TNT", today, "KWT2002", "Manifest B: multi-piece")
  addManifest(mB, [
    line("MASTER-001", "TNT", 5, { description: "Furniture, 5 boxes" }),
    line("MASTER-002", "TNT", 4, { description: "Tiles, 4 pallets" }),
  ])
  receive("MASTER-002", 1, "WH1-A-1")
  receive("MASTER-002", 3, "later") // received, waiting for the store step
  receive("A-1002", 1, "later")

  // Older manifest sharing an itemId (clash → operator chooses)
  const mOld = manifest("TNT", daysAgo(7), "KWT0999", "Older manifest with a repeated ID")
  addManifest(mOld, [line("DUP-777", "TNT", 1, { consignee: "OLD CONSIGNEE", description: "Older shipment" })])

  // FedEx — matches the PDF417 fixtures (carriers/fedex/fixtures.ts)
  const mF = manifest("FDX", today, "KWT3003", "FedEx: scan the PDF417")
  addManifest(mF, [
    line("794600001111", "FDX", 1, { consignee: "TEST CONSIGNEE ONE", weight: 8, description: "SOAP DISPENSERS" }),
    line("794600009999", "FDX", 5, { consignee: "TEST CONSIGNEE TWO", weight: 10, description: "Bolt for bus" }),
  ])

  // Release examples (DHL, received last week)
  const mR = manifest("DHL", daysAgo(5), "KWT4004", "Release examples")
  addManifest(mR, ["R-2001", "R-2002", "R-2003", "R-2004", "R-2005", "R-2006"].map((id) => line(id, "DHL", 1)))
  const recv = (id: string, where: string) => receive(id, 1, where, daysAgo(5))
  recv("R-2001", "WH1-B-1") // received + stored + not released
  const scanned = recv("R-2002", "WH1-B-2")
  items[scanned] = unwrap(releaseScan(items[scanned], opCtx))
  for (const [id, outcome, loc] of [
    ["R-2003", "released", "WH1-B-3"],
    ["R-2004", "repossessed", "WH1-C-1"],
    ["R-2005", "seized", "WH1-C-2"],
  ] as const) {
    const i = recv(id, loc)
    items[i] = unwrap(releaseScan(items[i], opCtx))
    items[i] = unwrap(assignOutcome([items[i]], outcome, daysAgo(1), {}, ctx))[0]
  }
  recv("R-2006", "direct") // received + direct release, awaiting release scan

  // Unidentified inventory
  const unidentified = (itemId: string, carrierCode: string, piece: number, total: number, extra: Partial<Item>) =>
    createItem(
      {
        itemId,
        carrierCode,
        pieceNumber: piece,
        pieceTotal: total,
        receivingState: "unidentified",
        storageState: "stored",
        locationId: "WH2-A-1",
        storedBy: operatorUid,
        storedAt: now(),
        dateOfReceival: daysAgo(3),
        investigation: { status: "open", note: null },
        receivedBy: operatorUid,
        receivedAt: now(),
        shipper: "UNKNOWN SHIPPER",
        ...extra,
      },
      opCtx
    )
  items.push(
    unidentified("ARX-UNK-1", "ARX", 1, 3, {
      description: "Partial group: piece 1 of 3, not stored yet",
      storageState: null,
      locationId: null,
      storedBy: null,
      storedAt: null,
    }),
    unidentified("UNK-TNT-9", "TNT", 1, 1, {
      locationId: "WH2-A-2",
      investigation: { status: "investigating", note: "Supplier asked on WhatsApp" },
    }),
    unidentified("LATE-555", "TNT", 1, 1, { dateOfReceival: daysAgo(10), description: "May match a late manifest" })
  )
  // an unidentified piece already release-scanned → admin override example
  const unkScanned = unidentified("DHL-UNK-5", "DHL", 1, 1, { storageState: "direct_release", locationId: null, storedBy: null, storedAt: null })
  items.push(unwrap(releaseScan(unkScanned, opCtx)))

  // a late manifest that LATE-555 can be matched to by investigation
  const mLate = manifest("TNT", daysAgo(1), "KWT5005", "Arrived after the goods")
  addManifest(mLate, [line("LATE-555", "TNT", 1, { description: "Late manifest line" })])

  // mismatch example
  const flagIdx = items.findIndex((i) => i.itemId === "A-1003")
  items[flagIdx] = touch(items[flagIdx], { quantityMismatch: { labelTotal: 2, note: "Label says 1/2" } }, ctx)

  // ── write ───────────────────────────────────────────────────────────────
  const writes: [string, string, object][] = [
    ...CARRIERS.map((c) => ["carriers", c.carrierCode, { ...c, createdAt: now(), updatedAt: now() }] as [string, string, object]),
    ...locations().map((l) => ["locations", l.locationId, l] as [string, string, object]),
    ...manifests.map((m) => ["manifests", m.manifestId, m] as [string, string, object]),
    ...items.map((i) => ["items", i.internalItemId, i] as [string, string, object]),
    ["config", "versions", { locations: now(), carriers: now() }],
  ]
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch()
    for (const [col, id, data] of writes.slice(i, i + 400)) batch.set(db.collection(col).doc(id), data)
    await batch.commit()
  }

  console.log(`✓ ${manifests.length} manifests, ${items.length} pieces, ${CARRIERS.length} carriers, ${locations().length} locations`)
  console.log("✓ users: admin / admin12345 (ADMIN) · operator / operator123 (OPERATOR)")
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
