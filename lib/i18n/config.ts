export const LOCALES = ["ar", "en"] as const
export type Locale = (typeof LOCALES)[number]

/** Arabic first: most operators read Arabic. Set per device. */
export const DEFAULT_LOCALE: Locale = "ar"
export const LOCALE_COOKIE = "locale"

export function isLocale(value: string | undefined): value is Locale {
  return value === "ar" || value === "en"
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr"
}
