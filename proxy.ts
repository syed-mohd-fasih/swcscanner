import { NextResponse, type NextRequest } from "next/server"

import { SESSION_COOKIE } from "@/lib/auth/constants"

/**
 * Optimistic check only: bounce requests without a session cookie to /login.
 * Real authorization happens in lib/auth/dal.ts (pages and server actions).
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/login", request.url)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  // everything except login, API routes, Next internals and static files
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico|manifest.webmanifest|zxing|.*\\.(?:png|svg|ico|wasm)$).*)"],
}
