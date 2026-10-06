"use client"

import { signInWithEmailAndPassword, signOut } from "firebase/auth"
import { LanguagesIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { usernameToEmail } from "@/domain/users/types"
import { getClientFirebase } from "@/lib/firebase/client"
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
    const { auth } = getClientFirebase()
    try {
      const cred = await signInWithEmailAndPassword(auth, usernameToEmail(username), password)
      // force refresh so the token carries the latest role claim
      const idToken = await cred.user.getIdToken(true)
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      })
      if (!res.ok) {
        await signOut(auth)
        setError(res.status === 403 ? t.auth.noRole : t.auth.invalid)
        return
      }
      router.replace("/")
      router.refresh()
    } catch (err) {
      const code = (err as { code?: string }).code
      setError(code === "auth/user-disabled" ? t.auth.disabled : t.auth.invalid)
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
