"use client"

import { onAuthStateChanged } from "firebase/auth"
import { useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useState } from "react"

import type { SessionUser } from "@/lib/auth/dal"
import { getClientFirebase } from "@/lib/firebase/client"
import { applyMutations } from "@/repositories/firestore/remote"
import { SyncEngine, type SyncStatus } from "@/sync/engine/engine"
import { pullConfig } from "@/sync/pull"

type SessionContextValue = {
  user: SessionUser
  isAdmin: boolean
  /** true once the Firebase client SDK is signed in (needed for Firestore) */
  ready: boolean
  sync: SyncEngine
}

const SessionContext = createContext<SessionContextValue | null>(null)

let engine: SyncEngine | null = null
function getEngine(): SyncEngine {
  engine ??= new SyncEngine(applyMutations)
  return engine
}

/**
 * Bridges the server session (cookie) and the client SDK session (used for
 * Firestore writes). If they disagree the user must sign in again.
 */
export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const sync = getEngine()

  useEffect(() => {
    const { auth } = getClientFirebase()
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser || fbUser.uid !== user.uid) {
        setReady(false)
        await fetch("/api/session", { method: "DELETE" })
        router.replace("/login?reason=session")
        return
      }
      setReady(true)
    })
  }, [user.uid, router])

  useEffect(() => {
    if (!ready) return
    sync.start()
    // configuration datasets: one doc read unless they changed
    pullConfig().catch(() => {})
    return () => sync.stop()
  }, [ready, sync])

  return (
    <SessionContext.Provider value={{ user, isAdmin: user.role === "ADMIN", ready, sync }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error("useSession must be used inside SessionProvider")
  return ctx
}

export function useSyncStatus(): SyncStatus {
  const { sync } = useSession()
  const [status, setStatus] = useState<SyncStatus>(sync.getStatus())
  useEffect(() => sync.subscribe(setStatus), [sync])
  return status
}
