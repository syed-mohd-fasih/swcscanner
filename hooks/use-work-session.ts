"use client"

import { useCallback, useEffect, useState } from "react"

import { todayBusinessDate } from "@/domain/shared/dates"

/** Operator's current receiving/release session, remembered on the device. */
export type WorkSession = { carrierCode: string; date: string }

export function useWorkSession(kind: "receiving" | "release") {
  const key = `swc:session:${kind}`
  const [session, setSession] = useState<WorkSession | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const stored = JSON.parse(raw) as WorkSession
        // business dates default to the current working date each new day
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from device storage
        setSession({ ...stored, date: stored.date < todayBusinessDate() ? todayBusinessDate() : stored.date })
      }
    } catch {
      // storage unavailable — start fresh
    }
    setLoaded(true)
  }, [key])

  const update = useCallback(
    (next: WorkSession | null) => {
      setSession(next)
      try {
        if (next) localStorage.setItem(key, JSON.stringify(next))
        else localStorage.removeItem(key)
      } catch {
        // ignore
      }
    },
    [key]
  )

  return { session, setSession: update, loaded }
}
