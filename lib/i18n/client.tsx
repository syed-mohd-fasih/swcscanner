"use client"

import { useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useMemo } from "react"

import { dirFor, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config"
import { ar } from "@/lib/i18n/dictionaries/ar"
import { en, type Dictionary } from "@/lib/i18n/dictionaries/en"

const dictionaries: Record<Locale, Dictionary> = { ar, en }

type I18n = {
  locale: Locale
  dir: "rtl" | "ltr"
  t: Dictionary
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const router = useRouter()
  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
      router.refresh()
    },
    [router]
  )
  const value = useMemo(
    () => ({ locale, dir: dirFor(locale), t: dictionaries[locale], setLocale }),
    [locale, setLocale]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider")
  return ctx
}

/** Fill `{name}` placeholders: fmt(t.sync.pending, { n: 3 }). */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`))
}
