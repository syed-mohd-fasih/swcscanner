"use client"

import { LanguagesIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/client"

/**
 * Language and light/dark switchers at the far end of the page header.
 * The icon follows the `dark` class (no flash before hydration).
 */
export function HeaderSwitchers() {
  const { t, locale, setLocale } = useI18n()
  const { resolvedTheme, setTheme } = useTheme()
  const other = locale === "ar" ? t.app.english : t.app.arabic

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        className="gap-1.5 px-2.5"
        onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
        aria-label={`${t.app.language}: ${other}`}
        title={`${t.app.language}: ${other}`}
      >
        <LanguagesIcon />
        <span className="text-xs font-semibold" lang={locale === "ar" ? "en" : "ar"}>
          {locale === "ar" ? "EN" : "عربي"}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        aria-label={t.app.theme}
        title={t.app.theme}
      >
        <SunIcon className="transition-transform duration-300 dark:hidden" />
        <MoonIcon className="hidden transition-transform duration-300 dark:block" />
      </Button>
    </div>
  )
}
