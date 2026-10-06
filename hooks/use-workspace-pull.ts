"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Run a workspace pull once per `key` (e.g. carrier), optionally refreshing
 * on an interval. Returns true while the first pull for `key` is running.
 */
export function useWorkspacePull(
  key: string | null,
  pull: (full: boolean) => Promise<void>,
  options: { refreshMs?: number; onError?: () => void } = {}
): boolean {
  const [doneKey, setDoneKey] = useState<string | null>(null)
  const pullRef = useRef(pull)
  const optionsRef = useRef(options)
  useEffect(() => {
    pullRef.current = pull
    optionsRef.current = options
  })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    pullRef
      .current(true)
      .catch(() => optionsRef.current.onError?.())
      .finally(() => !cancelled && setDoneKey(key))
    const refreshMs = optionsRef.current.refreshMs
    const timer = refreshMs ? setInterval(() => pullRef.current(false).catch(() => {}), refreshMs) : null
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [key])

  return key !== null && doneKey !== key
}
