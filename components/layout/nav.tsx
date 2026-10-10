"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { adminNav, isActive, operatorNav, type NavItem } from "@/components/layout/nav-config"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useI18n } from "@/lib/i18n/client"

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname()
  const { t } = useI18n()
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} className="h-11 text-sm md:h-8">
                <Link href={item.href} onClick={() => setOpenMobile(false)}>
                  <item.icon />
                  <span>{t.nav[item.label]}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function OperatorNav() {
  const { t } = useI18n()
  return <NavGroup label={t.nav.operator} items={operatorNav} />
}

export function AdminNav() {
  const { t } = useI18n()
  return <NavGroup label={t.nav.admin} items={adminNav} />
}
