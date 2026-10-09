"use client"

import { createContext, useContext, useEffect, useSyncExternalStore } from "react"

import type { SessionUser } from "@/lib/auth/dal"
import { flushQueue, getQueue, getServerQueue, setQueueOwner, subscribeQueue, type QueuedOp } from "@/lib/retry-queue"

type SessionContextValue = {
  user: SessionUser
  isAdmin: boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

/** The signed-in user (verified on the server by the (app) layout). */
export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  // anything left in the retry queue from an earlier visit goes out now
  useEffect(() => {
    setQueueOwner(user.uid)
    void flushQueue()
  }, [user.uid])
  return <SessionContext.Provider value={{ user, isAdmin: user.role === "ADMIN" }}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error("useSession must be used inside SessionProvider")
  return ctx
}

/** Operations waiting in the retry queue (no signal) or refused by the server. */
export function useRetryQueue(): QueuedOp[] {
  return useSyncExternalStore(subscribeQueue, getQueue, getServerQueue)
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb)
      window.addEventListener("offline", cb)
      return () => {
        window.removeEventListener("online", cb)
        window.removeEventListener("offline", cb)
      }
    },
    () => navigator.onLine,
    () => true
  )
}
