import { requireRole } from "@/lib/auth/dal"

/**
 * Server-side admin boundary: operators are redirected before render.
 * (Data writes are additionally enforced by the Firestore rules.)
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN")
  return children
}
