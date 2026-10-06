"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Carrier } from "@/domain/carriers/types"
import { useLocalQuery } from "@/hooks/use-local-query"
import { carrierRepository } from "@/repositories/indexeddb"
import { cn } from "@/lib/utils"

export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

/** Business date (YYYY-MM-DD). Native picker — best on phones. */
export function DateInput({
  id,
  value,
  onChange,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Input
      id={id}
      type="date"
      dir="ltr"
      className="h-11"
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function useCarriers(activeOnly = true) {
  return useLocalQuery(
    async () => (await carrierRepository.all()).filter((c) => !activeOnly || c.active).sort((a, b) => a.name.localeCompare(b.name)),
    [activeOnly]
  )
}

export function CarrierSelect({
  id,
  value,
  onChange,
  carriers,
}: {
  id?: string
  value: string
  onChange: (carrierCode: string) => void
  carriers: Carrier[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-11 w-full">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {carriers.map((c) => (
          <SelectItem key={c.carrierCode} value={c.carrierCode}>
            {c.name} <span className="text-muted-foreground">({c.carrierCode})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Read-only label/value rows (verification against the physical label). */
export function InfoList({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 font-medium break-words">{r.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  )
}
