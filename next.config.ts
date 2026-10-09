import type { NextConfig } from "next"

// phones reach the dev server through a tunnel (cloudflared) or the LAN
const TUNNELS = ["*.trycloudflare.com", "**.cfargotunnel.com", "*.ngrok-free.app"]

const nextConfig: NextConfig = {
  allowedDevOrigins: [...TUNNELS, "192.168.*.*", "10.*.*.*"],
  experimental: {
    // server actions check the request origin too (in production as well)
    serverActions: { allowedOrigins: TUNNELS },
  },
}

export default nextConfig
