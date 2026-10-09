"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"

import { Callout } from "@/components/shared/callout"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useI18n } from "@/lib/i18n/client"

export type ConfirmOptions = {
  /** defaults to "Are you sure?" */
  title?: string
  description?: string
  /** extra read-only details (what will change, the date, counts…) */
  details?: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
  /** shows the red "This action is irreversible." warning */
  irreversible?: boolean
}

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * The single "Are you sure?" mechanism. Every state-changing action awaits
 * `confirm()` before calling a service; navigation and filters never do.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts = {}) => {
    resolver.current?.(false)
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => !open && settle(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title ?? t.confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {options?.description ?? t.confirm.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {options?.details && <div className="text-sm">{options.details}</div>}
          {options?.irreversible && (
            <Callout tone="danger" className="font-semibold">
              {t.confirm.irreversible}
            </Callout>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>{t.app.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant={options?.destructive || options?.irreversible ? "destructive" : "default"}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? t.app.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider")
  return ctx
}
