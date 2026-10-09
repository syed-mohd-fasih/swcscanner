import { AppShell } from "@/components/layout/app-shell"
import { ConfigProvider } from "@/components/providers/config-provider"
import { SessionProvider } from "@/components/providers/session-provider"
import { requireRole } from "@/lib/auth/dal"
import { getCarriers, getLocations } from "@/server/data/config"
import { getUsage, peakShare } from "@/server/data/usage"

/** Every signed-in role. Admin-only screens add their own check in (admin). */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireRole("OPERATOR")
  const [carriers, locations, usage] = await Promise.all([
    getCarriers(),
    getLocations(),
    user.role === "ADMIN" ? getUsage() : null,
  ])
  // admins see a banner once any free-plan limit is 80% used (never blocks)
  const share = usage ? peakShare(usage) : 0
  return (
    <SessionProvider user={user}>
      <ConfigProvider carriers={carriers} locations={locations}>
        <AppShell usageWarning={share >= 0.8 ? Math.round(share * 100) : null}>{children}</AppShell>
      </ConfigProvider>
    </SessionProvider>
  )
}
