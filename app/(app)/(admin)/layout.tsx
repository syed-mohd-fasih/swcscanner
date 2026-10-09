import { requireRole } from "@/lib/auth/dal"

/**
 * Server-side admin boundary: operators are redirected before render.
 * Pages and server actions check the role again themselves.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN")
  return children
}
