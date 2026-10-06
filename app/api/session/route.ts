import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants"
import { adminAuth } from "@/lib/firebase/admin"

const body = z.object({ idToken: z.string().min(1) })

/** Exchange a fresh Firebase ID token for an httpOnly session cookie. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  try {
    const decoded = await adminAuth().verifyIdToken(parsed.data.idToken, true)
    // only recently signed-in tokens may mint a session
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: "Sign in again" }, { status: 401 })
    }
    if (decoded.role !== "ADMIN" && decoded.role !== "OPERATOR") {
      return NextResponse.json({ error: "No role assigned" }, { status: 403 })
    }
    const sessionCookie = await adminAuth().createSessionCookie(parsed.data.idToken, {
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
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }
}

export async function DELETE() {
  ;(await cookies()).delete(SESSION_COOKIE)
  return NextResponse.json({ ok: true })
}
