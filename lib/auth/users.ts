import "server-only"

import { usernameToEmail, type AppUser, type Role } from "@/domain/users/types"
import { adminAuth, adminDb } from "@/lib/firebase/admin"

/**
 * User administration via the Admin SDK. The role (plus display fields) lives
 * in custom claims so Firestore rules and session cookies can read it; a
 * profile copy in `users/{uid}` serves listing.
 */
export async function createUser(input: {
  name: string
  username: string
  password: string
  role: Role
}): Promise<AppUser> {
  const username = input.username.trim().toLowerCase()
  const record = await adminAuth().createUser({
    email: usernameToEmail(username),
    password: input.password,
    displayName: input.name,
  })
  await adminAuth().setCustomUserClaims(record.uid, {
    role: input.role,
    username,
    name: input.name,
  })
  const user: AppUser = {
    uid: record.uid,
    name: input.name,
    username,
    role: input.role,
    disabled: false,
  }
  await adminDb().collection("users").doc(record.uid).set(user)
  return user
}

export async function updateUser(
  uid: string,
  patch: { name?: string; role?: Role; disabled?: boolean; password?: string }
): Promise<AppUser> {
  const ref = adminDb().collection("users").doc(uid)
  const current = (await ref.get()).data() as AppUser | undefined
  if (!current) throw new Error("User not found")

  const next: AppUser = {
    ...current,
    name: patch.name ?? current.name,
    role: patch.role ?? current.role,
    disabled: patch.disabled ?? current.disabled,
  }
  await adminAuth().updateUser(uid, {
    displayName: next.name,
    disabled: next.disabled,
    ...(patch.password ? { password: patch.password } : {}),
  })
  await adminAuth().setCustomUserClaims(uid, {
    role: next.role,
    username: next.username,
    name: next.name,
  })
  // role/disable changes must take effect now, not when the cookie expires
  if (patch.role || patch.disabled || patch.password) {
    await adminAuth().revokeRefreshTokens(uid)
  }
  await ref.set(next)
  return next
}

export async function listUsers(): Promise<AppUser[]> {
  const snap = await adminDb().collection("users").orderBy("username").get()
  return snap.docs.map((d) => d.data() as AppUser)
}
