import type { Metadata, Viewport } from "next"
import { Geist_Mono, IBM_Plex_Sans_Arabic, Outfit } from "next/font/google"

import "./globals.css"
import { ConfirmProvider } from "@/components/shared/mutation-confirm-dialog"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { dirFor } from "@/lib/i18n/config"
import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { cn } from "@/lib/utils"

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" })

// Arabic UI font; also covers Latin so item IDs render consistently
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "SWC Scanner",
  description: "Warehouse receiving and release",
  applicationName: "SWC Scanner",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f12" },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const sans = locale === "ar" ? plexArabic : outfit
  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", sans.variable)}
    >
      <body>
        <ThemeProvider>
          <I18nProvider locale={locale}>
            <TooltipProvider>
              <ConfirmProvider>{children}</ConfirmProvider>
              <Toaster position="top-center" richColors />
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
