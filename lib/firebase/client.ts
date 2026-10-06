import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app"
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth"
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore"

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"

type ClientFirebase = { app: FirebaseApp; auth: Auth; db: Firestore }

let instance: ClientFirebase | null = null

/**
 * Browser Firebase SDK. In emulator mode both emulators are reached through
 * the page's own origin — next.config.ts rewrites forward the traffic — so
 * localhost, the LAN and an HTTPS tunnel (cloudflared) all work with one port.
 */
export function getClientFirebase(): ClientFirebase {
  if (instance) return instance

  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      })
  const auth = getAuth(app)
  let db: Firestore

  if (useEmulator) {
    const { origin, host, protocol } = window.location
    connectAuthEmulator(auth, origin, { disableWarnings: true })
    // equivalent to connectFirestoreEmulator, but allows https (tunnels)
    db = initializeFirestore(app, { host, ssl: protocol === "https:" })
  } else {
    db = getFirestore(app)
  }

  instance = { app, auth, db }
  return instance
}

export const isEmulatorMode = useEmulator
