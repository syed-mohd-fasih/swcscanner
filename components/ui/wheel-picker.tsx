import "@ncdai/react-wheel-picker/style.css"

import type { ComponentProps } from "react"
import * as WheelPickerPrimitive from "@ncdai/react-wheel-picker"

import { cn } from "@/lib/utils"

type WheelPickerValue = WheelPickerPrimitive.WheelPickerValue

type WheelPickerOption<T extends WheelPickerValue = string> =
  WheelPickerPrimitive.WheelPickerOption<T>

type WheelPickerClassNames = WheelPickerPrimitive.WheelPickerClassNames

function WheelPickerWrapper({
  className,
  ...props
}: ComponentProps<typeof WheelPickerPrimitive.WheelPickerWrapper>) {
  return (
    <WheelPickerPrimitive.WheelPickerWrapper
      className={cn(
        "w-full rounded-2xl border border-border/70 bg-card px-1 shadow-xs",
        "*:data-rwp:first:*:data-rwp-highlight-wrapper:rounded-s-xl",
        "*:data-rwp:last:*:data-rwp-highlight-wrapper:rounded-e-xl",
        className
      )}
      {...props}
    />
  )
}

function WheelPicker<T extends WheelPickerValue = string>({
  classNames,
  ...props
}: WheelPickerPrimitive.WheelPickerProps<T>) {
  return (
    <WheelPickerPrimitive.WheelPicker
      classNames={{
        optionItem: cn(
          "text-base text-muted-foreground/70 data-disabled:opacity-40",
          classNames?.optionItem
        ),
        highlightWrapper: cn(
          // opaque, so the wheel's own options never show through
          "bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] text-lg font-semibold text-primary-ink",
          "data-rwp-focused:bg-[color-mix(in_oklch,var(--primary)_22%,var(--card))]",
          classNames?.highlightWrapper
        ),
        highlightItem: cn(
          "data-disabled:opacity-40",
          classNames?.highlightItem
        ),
      }}
      {...props}
    />
  )
}

export { WheelPicker, WheelPickerWrapper }
export type { WheelPickerClassNames, WheelPickerOption }
