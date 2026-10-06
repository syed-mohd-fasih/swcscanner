/**
 * Tiny change signal so UI hooks re-read local data after any write or pull.
 * Also broadcast across tabs of the same device.
 */
type Listener = () => void

const listeners = new Set<Listener>()
let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null
  if (!channel) {
    channel = new BroadcastChannel("swc-local-db")
    channel.onmessage = () => listeners.forEach((l) => l())
  }
  return channel
}

export function notifyLocalChange() {
  listeners.forEach((l) => l())
  getChannel()?.postMessage("changed")
}

export function subscribeLocalChange(listener: Listener): () => void {
  getChannel()
  listeners.add(listener)
  return () => listeners.delete(listener)
}
