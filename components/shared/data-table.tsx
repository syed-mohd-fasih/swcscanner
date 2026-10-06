"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/shared/states"
import { cn } from "@/lib/utils"

export type Column<T> = {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
  /** hidden in the phone card layout */
  hideOnMobile?: boolean
}

type Selection = {
  selected: Set<string>
  onToggle: (key: string) => void
  onToggleAll: (keys: string[]) => void
  isSelectable?: (key: string) => boolean
}

/**
 * Dense table on md+ screens, stacked cards on phones (no sideways scrolling
 * for operators). Optional checkbox selection for bulk actions.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selection,
  empty,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  selection?: Selection
  empty?: React.ReactNode
}) {
  if (rows.length === 0) return <>{empty ?? <EmptyState />}</>

  const keys = rows.map(rowKey)
  const selectable = selection ? keys.filter((k) => selection.isSelectable?.(k) ?? true) : []
  const allSelected = selectable.length > 0 && selectable.every((k) => selection?.selected.has(k))

  return (
    <>
      {/* phones */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const key = rowKey(row)
          const canSelect = selection && (selection.isSelectable?.(key) ?? true)
          return (
            <li
              key={key}
              className={cn(
                "flex gap-3 rounded-2xl border bg-card p-3",
                onRowClick && "cursor-pointer active:bg-muted"
              )}
              onClick={() => onRowClick?.(row)}
            >
              {selection && (
                <Checkbox
                  className="mt-1 size-5"
                  checked={selection.selected.has(key)}
                  disabled={!canSelect}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => selection.onToggle(key)}
                />
              )}
              <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {columns
                  .filter((c) => !c.hideOnMobile)
                  .map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-muted-foreground">{c.header}</dt>
                      <dd className="min-w-0 break-words">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          )
        })}
      </ul>

      {/* tablets / desktop */}
      <div className="hidden rounded-2xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {selection && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    disabled={selectable.length === 0}
                    onCheckedChange={() => selection.onToggleAll(selectable)}
                  />
                </TableHead>
              )}
              {columns.map((c) => (
                <TableHead key={c.key} className={cn("text-start", c.className)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const key = rowKey(row)
              const canSelect = selection && (selection.isSelectable?.(key) ?? true)
              return (
                <TableRow
                  key={key}
                  className={cn(onRowClick && "cursor-pointer")}
                  data-state={selection?.selected.has(key) ? "selected" : undefined}
                  onClick={() => onRowClick?.(row)}
                >
                  {selection && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selection.selected.has(key)}
                        disabled={!canSelect}
                        onCheckedChange={() => selection.onToggle(key)}
                      />
                    </TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

/** Selection state helper for DataTable bulk actions. */
export function toggleInSet(set: Set<string>, key: string): Set<string> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}
