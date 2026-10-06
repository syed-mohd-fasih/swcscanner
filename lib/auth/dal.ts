import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { hasRole, type Role } from "@/domain/users/types"
import { SESSION_COOKIE } from "@/lib/auth/constants"
import { adminAuth } from "@/lib/firebase/admin"

export type SessionUser = {
  uid: string
  name: string
  username: string
  role: Role
}

/**
 * Server-side authorization boundary. Verifies the Firebase session cookie
 * (checking revocation, so disabled users are cut off) once per request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value
  if (!cookie) return null
  try {
    const claims = await adminAuth().verifySessionCookie(cookie, true)
    const role = claims.role as Role | undefined
    if (role !== "ADMIN" && role !== "OPERATOR") return null
    return {
      uid: claims.uid,
      name: (claims.name as string | undefined) ?? (claims.username as string),
      username: claims.username as string,
      role,
    }
  } catch {
    return null
  }
})

export async function getCurrentRole(): Promise<Role | null> {
  return (await getCurrentUser())?.role ?? null
}

/** For pages/layouts: redirects when the user lacks the role. */
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!hasRole(user.role, role)) redirect("/")
  return user
}

/** For route handlers: returns null instead of redirecting. */
export async function authorize(role: Role): Promise<SessionUser | null> {
  const user = await getCurrentUser()
  return user && hasRole(user.role, role) ? user : null
}
