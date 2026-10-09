import { SystemView } from "@/components/admin/system-view"
import { requireRole } from "@/lib/auth/dal"
import { getUsage } from "@/server/data/usage"

export default async function SystemPage() {
  await requireRole("ADMIN")
  const usage = await getUsage()
  return (
    <SystemView
      usage={usage}
      projectId={process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ""}
      emulator={process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"}
    />
  )
}
