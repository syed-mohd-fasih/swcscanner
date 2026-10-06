import "server-only"

import { getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

/**
 * Server-only Admin SDK. With FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
 * set (see .env.development) it talks to the emulators and needs no credentials.
 */
function adminApp(): App {
  return (
    getApps()[0] ??
    initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-swcscanner",
    })
  )
}

export const adminAuth = () => getAuth(adminApp())
export const adminDb = () => getFirestore(adminApp())
