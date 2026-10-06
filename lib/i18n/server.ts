import "server-only"

import { cookies } from "next/headers"

import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config"
import { ar } from "@/lib/i18n/dictionaries/ar"
import { en, type Dictionary } from "@/lib/i18n/dictionaries/en"

const dictionaries: Record<Locale, Dictionary> = { ar, en }

/** Per-device language from the locale cookie (no URL segment). */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()]
}

export { dictionaries }
