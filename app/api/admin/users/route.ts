import { NextResponse } from "next/server"
import { z } from "zod"

import { ROLES } from "@/domain/users/types"
import { authorize } from "@/lib/auth/dal"
import { createUser, listUsers } from "@/lib/auth/users"

const createBody = z.object({
  name: z.string().trim().min(1),
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]{3,32}$/, "3–32 letters, digits, . _ -"),
  password: z.string().min(8),
  role: z.enum(ROLES),
})

export async function GET() {
  if (!(await authorize("ADMIN"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return NextResponse.json({ users: await listUsers() })
}

export async function POST(request: Request) {
  if (!(await authorize("ADMIN"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = createBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }
  try {
    return NextResponse.json({ user: await createUser(parsed.data) }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create user"
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
