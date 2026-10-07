/**
 * One-time setup of a real Firebase project (never wipes anything):
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *     bun run setup:cloud -- <admin-username> <admin-password>
 * Creates the first ADMIN (skipped if the username exists), the carriers and
 * config/versions. Locations are added afterwards by the admin (Locations).
 */
import { readFileSync } from "node:fs"

import { cert, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

import type { Carrier } from "@/domain/carriers/types"
import { usernameToEmail, type AppUser } from "@/domain/users/types"

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
const [username, password] = process.argv.slice(2)

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" || process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Emulator env vars are set — this script is for the cloud project. Use: bun run setup:cloud")
  process.exit(1)
}
if (!PROJECT || !KEY_PATH || !username || !password || password.length < 8) {
  console.error("Usage: GOOGLE_APPLICATION_CREDENTIALS=<key.json> bun run setup:cloud -- <admin-username> <password (8+ chars)>")
  process.exit(1)
}

initializeApp({ projectId: PROJECT, credential: cert(JSON.parse(readFileSync(KEY_PATH, "utf8"))) })
const auth = getAuth()
const db = getFirestore()
const now = new Date().toISOString()

const CARRIERS: Omit<Carrier, "createdAt" | "updatedAt">[] = [
  { carrierCode: "FDX", name: "FedEx", parser: "fedexPdf417", active: true },
  { carrierCode: "TNT", name: "TNT", parser: "generic1d", active: true },
  { carrierCode: "ARX", name: "Aramex", parser: "generic1d", active: true },
  // DHL labels carry 3 barcodes; the manifest uses the 10-digit waybill
  { carrierCode: "DHL", name: "DHL", parser: "generic1d", idPattern: String.raw`^\d{10}$`, active: true },
]

async function ensureAdmin() {
  const email = usernameToEmail(username)
  const existing = await auth.getUserByEmail(email).catch(() => null)
  if (existing) return console.log(`• admin "${username}" already exists — left unchanged`)
  const user = await auth.createUser({ email, password, displayName: "Admin" })
  await auth.setCustomUserClaims(user.uid, { role: "ADMIN", username, name: "Admin" })
  const profile: AppUser = { uid: user.uid, name: "Admin", username, role: "ADMIN", disabled: false }
  await db.collection("users").doc(user.uid).set(profile)
  console.log(`✓ admin "${username}" created`)
}

async function ensureCarriers() {
  const batch = db.batch()
  let added = 0
  for (const c of CARRIERS) {
    const ref = db.collection("carriers").doc(c.carrierCode)
    if ((await ref.get()).exists) continue
    batch.set(ref, { ...c, createdAt: now, updatedAt: now })
    added++
  }
  batch.set(db.collection("config").doc("versions"), { carriers: now }, { merge: true })
  await batch.commit()
  console.log(`✓ ${added} carrier(s) added (existing ones left unchanged)`)
}

async function main() {
  console.log(`Setting up Firebase project ${PROJECT} …`)
  await ensureAdmin()
  await ensureCarriers()
  const versions = db.collection("config").doc("versions")
  if (!(await versions.get()).data()?.locations) await versions.set({ locations: now }, { merge: true })
  console.log("Done. Sign in as the admin, then add warehouse locations and users.")
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
