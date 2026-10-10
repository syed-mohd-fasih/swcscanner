import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

import { usernameToEmail } from "@/domain/users/types"
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants"
import { adminAuth } from "@/lib/firebase/admin"

const body = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) })

/**
 * Sign in on the server: username + password go to Firebase Auth's REST API
 * (the emulator serves the same path), the returned ID token is exchanged for
 * an httpOnly session cookie. The browser never loads the Firebase SDK.
 */
function signInUrl(): string {
  const key = process.env.FIREBASE_API_KEY ?? process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ""
  const emulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" && process.env.FIREBASE_AUTH_EMULATOR_HOST
  const base = emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com"
  return `${base}/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`
}

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 })

  const res = await fetch(signInUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: usernameToEmail(parsed.data.username), password: parsed.data.password, returnSecureToken: true }),
  }).catch(() => null)
  if (!res) return NextResponse.json({ error: "unavailable" }, { status: 503 })
  const data = (await res.json().catch(() => ({}))) as { idToken?: string; error?: { message?: string } }
  if (!res.ok || !data.idToken) {
    const disabled = data.error?.message === "USER_DISABLED"
    return NextResponse.json({ error: disabled ? "disabled" : "invalid" }, { status: disabled ? 403 : 401 })
  }

  try {
    const decoded = await adminAuth().verifyIdToken(data.idToken)
    if (decoded.role !== "ADMIN" && decoded.role !== "OPERATOR") {
      return NextResponse.json({ error: "no_role" }, { status: 403 })
    }
    const sessionCookie = await adminAuth().createSessionCookie(data.idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
    })
    ;(await cookies()).set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    return NextResponse.json({ role: decoded.role })
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 401 })
  }
}

export async function DELETE() {
  ;(await cookies()).delete(SESSION_COOKIE)
  return NextResponse.json({ ok: true })
}
