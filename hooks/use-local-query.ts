"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { subscribeLocalChange } from "@/repositories/indexeddb/events"

type LocalQuery<T> = { data: T | undefined; loading: boolean; error: Error | null }

/**
 * Read from the local repositories and re-run whenever local data changes
 * (writes, pulls, other tabs). `deps` restart the query like useEffect.
 */
export function useLocalQuery<T>(query: () => Promise<T>, deps: React.DependencyList): LocalQuery<T> {
  const [state, setState] = useState<LocalQuery<T>>({ data: undefined, loading: true, error: null })
  const queryRef = useRef(query)
  useLayoutEffect(() => {
    queryRef.current = query
  })

  useEffect(() => {
    let cancelled = false
    const run = () => {
      queryRef
        .current()
        .then((data) => !cancelled && setState({ data, loading: false, error: null }))
        .catch((error: Error) => !cancelled && setState((s) => ({ ...s, loading: false, error })))
    }
    run()
    const unsubscribe = subscribeLocalChange(run)
    return () => {
      cancelled = true
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
