"use client"

import Link from "next/link"

import { adminNav, operatorNav } from "@/components/layout/nav-config"
import { PageHeader } from "@/components/shared/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n/client"

/** Entry points to every administrative tool. */
export function AdminHome() {
  const { t } = useI18n()
  const links = [
    ...adminNav.filter((i) => i.href !== "/admin"),
    ...operatorNav.filter((i) => ["/unidentified", "/locations"].includes(i.href)),
  ]
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.admin.title} description={t.admin.help} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {links.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardContent className="flex flex-col items-start gap-3 pt-6">
                <item.icon className="size-6 text-primary" />
                <span className="font-medium">{t.nav[item.label]}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
