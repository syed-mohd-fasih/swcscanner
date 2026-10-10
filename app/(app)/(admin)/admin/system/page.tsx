import { SystemView } from "@/components/admin/system-view"
import { requireRole } from "@/lib/auth/dal"
// USAGE METER (disabled): Cloud Monitoring only answers projects with billing (Blaze); this project stays on Spark. Search "USAGE METER (disabled)" to bring it back.
// import { getUsage } from "@/server/data/usage"

export default async function SystemPage() {
  await requireRole("ADMIN")
  // USAGE METER (disabled): const usage = await getUsage()
  return (
    <SystemView
      // USAGE METER (disabled): usage={usage}
      projectId={process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ""}
      emulator={process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"}
    />
  )
}
