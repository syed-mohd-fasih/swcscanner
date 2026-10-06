import { NextResponse } from "next/server"
import { z } from "zod"

import { ROLES } from "@/domain/users/types"
import { authorize } from "@/lib/auth/dal"
import { updateUser } from "@/lib/auth/users"

const patchBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    role: z.enum(ROLES).optional(),
    disabled: z.boolean().optional(),
    password: z.string().min(8).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update")

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/users/[uid]">) {
  const admin = await authorize("ADMIN")
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { uid } = await ctx.params
  const parsed = patchBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }
  // an admin cannot lock themselves out
  if (uid === admin.uid && (parsed.data.disabled || parsed.data.role === "OPERATOR")) {
    return NextResponse.json({ error: "You cannot demote or disable yourself" }, { status: 400 })
  }
  try {
    return NextResponse.json({ user: await updateUser(uid, parsed.data) })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not update user"
    return NextResponse.json({ error: message }, { status: 404 })
  }
}
