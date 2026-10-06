"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { AdminNav, OperatorNav } from "@/components/layout/nav"
import { BrandIcon, isActive, operatorNav } from "@/components/layout/nav-config"
import { UserMenu } from "@/components/layout/user-menu"
import { useSession } from "@/components/providers/session-provider"
import { SyncStatus } from "@/components/sync/sync-status"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

/**
 * Mobile-first shell: a bottom tab bar for the operator's four core screens
 * on phones, the full sidebar (as a drawer on phones) for everything else.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, dir } = useI18n()
  const { isAdmin } = useSession()

  return (
    <SidebarProvider>
      <Sidebar side={dir === "rtl" ? "right" : "left"} dir={dir} collapsible="offcanvas">
        <SidebarHeader>
          <Link href="/" className="flex items-center gap-2 px-2 py-1.5 font-semibold">
            <BrandIcon className="size-5 text-primary" />
            {t.app.name}
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <OperatorNav />
          {isAdmin && <AdminNav />}
        </SidebarContent>
        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ms-1" />
          <span className="truncate font-semibold md:hidden">{t.app.name}</span>
          <div className="ms-auto">
            <SyncStatus compact />
          </div>
        </header>
        {/* SidebarInset already renders <main> */}
        <div className="mx-auto w-full max-w-6xl flex-1 px-3 pt-4 pb-24 sm:px-4 md:pb-8">{children}</div>
        <BottomBar />
      </SidebarInset>
    </SidebarProvider>
  )
}

function BottomBar() {
  const pathname = usePathname()
  const { t } = useI18n()
  const items = operatorNav.filter((i) => i.primary)
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 px-0.5 text-[11px] leading-tight",
                  active ? "text-primary" : "text-muted-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="size-5" />
                <span className="truncate">{t.nav[item.label]}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
