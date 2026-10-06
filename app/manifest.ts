import type { MetadataRoute } from "next"

/** Installable on operators' phones (Add to Home Screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SWC Scanner",
    short_name: "SWC",
    description: "Warehouse receiving and release",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  }
}
