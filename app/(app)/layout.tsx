import { AppShell } from "@/components/layout/app-shell"
import { SessionProvider } from "@/components/providers/session-provider"
import { requireRole } from "@/lib/auth/dal"

/** Every signed-in role. Admin-only screens add their own check in (admin). */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireRole("OPERATOR")
  return (
    <SessionProvider user={user}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  )
}
