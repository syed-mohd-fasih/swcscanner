"use client"

import { toast } from "sonner"

import type { Result } from "@/domain/shared/result"
import { errorText, failureText } from "@/lib/errors"
import type { Dictionary } from "@/lib/i18n/dictionaries/en"
import { runOp, type QueuedKind } from "@/lib/retry-queue"

export type OpOutcome<T> = { status: "done"; value: T } | { status: "queued" } | { status: "failed" }

/**
 * Run an operator scan action with the standard feedback: a success toast,
 * the server's reason when refused, or "kept on the phone" without signal.
 */
export async function submitOp<T>(
  t: Dictionary,
  kind: QueuedKind,
  args: Record<string, unknown>,
  label: string,
  success: string
): Promise<OpOutcome<T>> {
  try {
    const outcome = await runOp<T>(kind, args, label)
    if (outcome.status === "queued") {
      toast.info(t.sync.savedOnPhone)
      return { status: "queued" }
    }
    if (!outcome.result.ok) {
      toast.error(errorText(t, outcome.result.error))
      return { status: "failed" }
    }
    toast.success(success)
    return { status: "done", value: outcome.result.value }
  } catch (e) {
    toast.error(failureText(t, e))
    return { status: "failed" }
  }
}

/**
 * Admin and other non-queued actions: run, show the plain-language refusal
 * or failure, and return the value on success (null otherwise).
 */
export async function callAction<T>(t: Dictionary, run: () => Promise<Result<T>>, success?: string): Promise<T | null> {
  try {
    const result = await run()
    if (!result.ok) {
      toast.error(errorText(t, result.error))
      return null
    }
    if (success) toast.success(success)
    return result.value
  } catch (e) {
    toast.error(failureText(t, e))
    return null
  }
}
