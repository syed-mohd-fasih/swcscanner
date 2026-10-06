import type { NextConfig } from "next"

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"
const authEmulator = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099"}`
const firestoreEmulator = `http://${process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"}`

const nextConfig: NextConfig = {
  // phones reach the dev server through a tunnel (cloudflared) or the LAN
  allowedDevOrigins: ["*.trycloudflare.com", "**.cfargotunnel.com", "*.ngrok-free.app", "192.168.*.*", "10.*.*.*"],

  /**
   * Emulator traffic goes through this server (same origin as the page), so a
   * single tunnel/port serves the app AND the emulators, over HTTPS when the
   * tunnel is HTTPS. Development only.
   */
  async rewrites() {
    if (!useEmulator) return []
    return [
      { source: "/identitytoolkit.googleapis.com/:path*", destination: `${authEmulator}/identitytoolkit.googleapis.com/:path*` },
      { source: "/securetoken.googleapis.com/:path*", destination: `${authEmulator}/securetoken.googleapis.com/:path*` },
      // streaming (Listen/Write channels) and REST (queries, batch writes)
      { source: "/google.firestore.v1.Firestore/:path*", destination: `${firestoreEmulator}/google.firestore.v1.Firestore/:path*` },
      { source: "/v1/projects/:path*", destination: `${firestoreEmulator}/v1/projects/:path*` },
    ]
  },
}

export default nextConfig
