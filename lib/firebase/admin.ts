import "server-only"

import { cert, getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, initializeFirestore, type Firestore } from "firebase-admin/firestore"

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"

/**
 * Server-only Admin SDK.
 * - Emulator mode: FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST (see
 *   .env.development) point it at the emulators; no credentials needed.
 * - Cloud: FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (Vercel env vars), or
 *   GOOGLE_APPLICATION_CREDENTIALS = path to the service-account JSON.
 */
function adminApp(): App {
  const existing = getApps()[0]
  if (existing) return existing

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-swcscanner"
  if (useEmulator) return initializeApp({ projectId })

  // .env.development is loaded under .env.local in `next dev`; never let its
  // emulator hosts redirect a cloud-configured server
  delete process.env.FIRESTORE_EMULATOR_HOST
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  return initializeApp(
    clientEmail && privateKey ? { projectId, credential: cert({ projectId, clientEmail, privateKey }) } : { projectId },
  )
}

export const adminAuth = () => getAuth(adminApp())
let db: Firestore | undefined

/**
 * Firestore via REST in the cloud: faster cold starts on serverless than gRPC
 * (this app never uses realtime listeners).
 */
export function adminDb(): Firestore {
  if (db) return db
  const app = adminApp()
  try {
    // the emulator only speaks gRPC without credentials
    db = initializeFirestore(app, { preferRest: !useEmulator })
  } catch {
    db = getFirestore(app) // already initialized (dev hot reload)
  }
  return db
}
