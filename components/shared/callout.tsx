import { CircleCheckIcon, InfoIcon, OctagonAlertIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type CalloutTone = "info" | "success" | "warning" | "danger"

const ICON: Record<CalloutTone, LucideIcon> = {
  info: InfoIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  danger: OctagonAlertIcon,
}

/** A short message in its meaning's colour (help, notice, problem, done). */
export function Callout({
  tone = "info",
  children,
  className,
  action,
}: {
  tone?: CalloutTone
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  const Icon = ICON[tone]
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn(
        `tone-${tone} flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm animate-in fade-in-0 duration-300`,
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}
