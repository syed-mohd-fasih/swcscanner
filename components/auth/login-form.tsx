"use client"

import { LanguagesIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useI18n } from "@/lib/i18n/client"

export function LoginForm() {
  const { t, locale, setLocale } = useI18n()
  const router = useRouter()
  const params = useSearchParams()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(
    params.get("reason") === "session" ? t.auth.sessionLost : null
  )
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string }
        setError(error === "disabled" ? t.auth.disabled : error === "no_role" ? t.auth.noRole : res.status === 503 ? t.app.error : t.auth.invalid)
        return
      }
      router.replace("/")
    } catch {
      setError(t.sync.offlineHelp)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-xl">{t.app.name}</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
        >
          <LanguagesIcon />
          {locale === "ar" ? t.app.english : t.app.arabic}
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4" suppressHydrationWarning>
          <h1 className="text-lg font-medium">{t.auth.title}</h1>
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">{t.auth.username}</Label>
            <Input
              id="username"
              dir="ltr"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              className="h-11"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t.auth.password}</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              className="h-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="h-11" disabled={busy}>
            {busy ? t.app.loading : t.auth.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
