import "server-only"

import { z } from "zod"

import { err, type Result } from "@/domain/shared/result"
import type { Role } from "@/domain/users/types"
import { authorize, type SessionUser } from "@/lib/auth/dal"

/**
 * Every server action is an untrusted entry point: check the session role,
 * validate the input, then run. Expected failures are returned, not thrown.
 */
export async function guarded<S extends z.ZodType, T>(
  role: Role,
  schema: S,
  input: unknown,
  run: (data: z.infer<S>, user: SessionUser) => Promise<Result<T>>
): Promise<Result<T>> {
  const user = await authorize(role)
  if (!user) return err("UNAUTHORIZED", "Please sign in again.")
  const parsed = schema.safeParse(input)
  if (!parsed.success) return err("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.")
  return run(parsed.data, user)
}

export const zId = z.string().min(1).max(64)
export const zOpId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Invalid operation id.")
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.")
export const zScans = z
  .array(z.object({ raw: z.string().min(1).max(4000), format: z.enum(["pdf417", "linear", "manual"]) }))
  .min(1)
  .max(10)
export const zReceipt = z.object({ path: z.enum(["store_later", "direct_release"]), dateOfReceival: zDate })
export const zText = z.string().trim().max(500).nullable()
