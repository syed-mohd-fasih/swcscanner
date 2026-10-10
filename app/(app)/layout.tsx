import { AppShell } from "@/components/layout/app-shell"
import { ConfigProvider } from "@/components/providers/config-provider"
import { SessionProvider } from "@/components/providers/session-provider"
import { requireRole } from "@/lib/auth/dal"
import { getCarriers, getLocations } from "@/server/data/config"
// USAGE METER (disabled): Cloud Monitoring only answers projects with billing (Blaze); this project stays on Spark. Search "USAGE METER (disabled)" to bring it back.
// import { getUsage, peakShare } from "@/server/data/usage"

/** Every signed-in role. Admin-only screens add their own check in (admin). */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireRole("OPERATOR")
  const [carriers, locations] = await Promise.all([
    getCarriers(),
    getLocations(),
    // USAGE METER (disabled):
    // user.role === "ADMIN" ? getUsage() : null,
  ])
  // USAGE METER (disabled): admins saw a banner once any free-plan limit was 80% used (never blocked)
  // const share = usage ? peakShare(usage) : 0
  return (
    <SessionProvider user={user}>
      <ConfigProvider carriers={carriers} locations={locations}>
        <AppShell /* USAGE METER (disabled): usageWarning={share >= 0.8 ? Math.round(share * 100) : null} */>{children}</AppShell>
      </ConfigProvider>
    </SessionProvider>
  )
}
