"use client"

import { SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useI18n } from "@/lib/i18n/client"

export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const { t } = useI18n()
  return (
    <div className="relative min-w-0 flex-1">
      <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        className="h-11 ps-9"
        placeholder={placeholder ?? t.app.search}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export type FilterOption = { value: string; label: string }

export const ALL = "__all"

/** A row of compact selects; "__all" means no filter. */
export function FilterBar({
  filters,
}: {
  filters: { key: string; label: string; value: string; options: FilterOption[]; onChange: (v: string) => void }[]
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((f) => (
        <Select key={f.key} value={f.value} onValueChange={f.onChange}>
          <SelectTrigger className="h-11 min-w-36" aria-label={f.label}>
            {/* explicit text: Radix only knows option labels once they mount */}
            <SelectValue placeholder={f.label}>
              {f.label}: {f.value === ALL ? t.app.all : (f.options.find((o) => o.value === f.value)?.label ?? f.value)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>
              {f.label}: {t.app.all}
            </SelectItem>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </div>
  )
}

/** Case-insensitive match across an item's searchable text fields. */
export function matchesSearch(query: string, ...values: (string | number | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return values.some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
}
