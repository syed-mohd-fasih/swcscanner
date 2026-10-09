import {
  Building2Icon,
  ClipboardListIcon,
  DownloadIcon,
  GaugeIcon,
  HelpCircleIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  PackageCheckIcon,
  PackageOpenIcon,
  ScanLineIcon,
  SettingsIcon,
  TruckIcon,
  WarehouseIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import type { Role } from "@/domain/users/types"
import type { Dictionary } from "@/lib/i18n/dictionaries/en"

export type NavItem = {
  href: string
  label: keyof Dictionary["nav"]
  icon: LucideIcon
  /** shown in the mobile bottom bar */
  primary?: boolean
}

/** Operator navigation — the phone-first workflow. */
export const operatorNav: NavItem[] = [
  { href: "/", label: "dashboard", icon: LayoutDashboardIcon, primary: true },
  { href: "/receiving", label: "receiving", icon: ScanLineIcon, primary: true },
  { href: "/storage", label: "storage", icon: WarehouseIcon, primary: true },
  { href: "/unidentified", label: "unidentified", icon: HelpCircleIcon, primary: true },
  { href: "/release", label: "release", icon: PackageOpenIcon, primary: true },
  { href: "/locations", label: "locations", icon: MapPinIcon },
]

/** Admin-only additions (admins also get the operator links). */
export const adminNav: NavItem[] = [
  { href: "/manifests", label: "manifests", icon: ClipboardListIcon },
  { href: "/admin/release", label: "releaseOutcomes", icon: PackageCheckIcon },
  { href: "/admin", label: "administration", icon: SettingsIcon },
  { href: "/admin/users", label: "users", icon: UsersIcon },
  { href: "/admin/carriers", label: "carriers", icon: TruckIcon },
  { href: "/admin/export", label: "export", icon: DownloadIcon },
  { href: "/admin/system", label: "system", icon: GaugeIcon },
]

/** Phone bottom-bar entry for admins (the admin hub). */
export const adminTab: NavItem = { href: "/admin", label: "admin", icon: SettingsIcon, primary: true }

export function navFor(role: Role): { operator: NavItem[]; admin: NavItem[] } {
  return { operator: operatorNav, admin: role === "ADMIN" ? adminNav : [] }
}

export const BrandIcon = Building2Icon

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  if (href === "/admin") return pathname === "/admin"
  return pathname === href || pathname.startsWith(`${href}/`)
}
