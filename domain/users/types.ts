export const ROLES = ["OPERATOR", "ADMIN"] as const
export type Role = (typeof ROLES)[number]

export type AppUser = {
  uid: string
  name: string
  username: string
  role: Role
  disabled: boolean
}

/** Firebase Auth only knows emails; usernames map to a hidden domain. */
export const USERNAME_EMAIL_DOMAIN = "swc.local"

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`
}

export function hasRole(userRole: Role, required: Role): boolean {
  return required === "OPERATOR" || userRole === "ADMIN"
}
