"use client"

import { signOut } from "firebase/auth"
import { ChevronsUpDownIcon, LanguagesIcon, LogOutIcon, MoonIcon, UserIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { useSession } from "@/components/providers/session-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { getClientFirebase } from "@/lib/firebase/client"
import { useI18n } from "@/lib/i18n/client"

export function UserMenu() {
  const { user } = useSession()
  const { t, locale, setLocale } = useI18n()
  const { resolvedTheme, setTheme } = useTheme()

  async function logout() {
    await signOut(getClientFirebase().auth).catch(() => {})
    await fetch("/api/session", { method: "DELETE" })
    // full reload: nothing of the previous user's in-memory state survives
    window.location.replace("/login")
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <UserIcon />
              <span className="flex min-w-0 flex-col text-start leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.username} · {user.role === "ADMIN" ? t.nav.admin : t.nav.operator}
                </span>
              </span>
              <ChevronsUpDownIcon className="ms-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel>{t.app.language}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setLocale(locale === "ar" ? "en" : "ar")}>
              <LanguagesIcon />
              {locale === "ar" ? t.app.english : t.app.arabic}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              <MoonIcon />
              {t.app.theme}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={logout}>
              <LogOutIcon />
              {t.app.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
