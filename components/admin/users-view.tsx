"use client"

import { PlusIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { useSession } from "@/components/providers/session-provider"
import { DataTable, type Column } from "@/components/shared/data-table"
import { Field } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorState, Ltr, LoadingState } from "@/components/shared/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ROLES, type AppUser, type Role } from "@/domain/users/types"
import { fmt, useI18n } from "@/lib/i18n/client"

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? res.statusText)
  return body as T
}

/** Admin-managed users (no self-registration). Server routes use the Admin SDK. */
export function UsersView() {
  const { t } = useI18n()
  const { user: me } = useSession()
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AppUser | "new" | null>(null)

  const load = useCallback(() => {
    api<{ users: AppUser[] }>("/api/admin/users")
      .then((r) => setUsers(r.users))
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const roleLabel = (r: Role) => (r === "ADMIN" ? t.nav.admin : t.nav.operator)
  const columns: Column<AppUser>[] = [
    { key: "name", header: t.fields.name, cell: (u) => u.name },
    { key: "username", header: t.auth.username, cell: (u) => <Ltr>{u.username}</Ltr> },
    { key: "role", header: t.fields.role, cell: (u) => <Badge variant={u.role === "ADMIN" ? "accent" : "neutral"}>{roleLabel(u.role)}</Badge> },
    {
      key: "status",
      header: t.fields.status,
      cell: (u) => (u.disabled ? <Badge variant="danger">{t.users.disable}</Badge> : <Badge variant="success">{t.fields.active}</Badge>),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t.users.title}
        actions={
          <Button onClick={() => setEditing("new")}>
            <PlusIcon />
            {t.users.add}
          </Button>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !users ? (
        <LoadingState />
      ) : (
        <DataTable columns={columns} rows={users} rowKey={(u) => u.uid} onRowClick={(u) => setEditing(u)} />
      )}
      {editing && (
        <UserDialog
          user={editing === "new" ? null : editing}
          isSelf={editing !== "new" && editing.uid === me.uid}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function UserDialog({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: AppUser | null
  isSelf: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [name, setName] = useState(user?.name ?? "")
  const [username, setUsername] = useState(user?.username ?? "")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<Role>(user?.role ?? "OPERATOR")
  const [disabled, setDisabled] = useState(user?.disabled ?? false)

  async function save() {
    const ok = await confirm({
      description: fmt(user ? t.users.confirmUpdate : t.users.confirmCreate, { username: username || user?.username || "" }),
    })
    if (!ok) return
    try {
      if (user) {
        await api(`/api/admin/users/${user.uid}`, {
          method: "PATCH",
          body: JSON.stringify({
            name,
            ...(isSelf ? {} : { role, disabled }),
            ...(password ? { password } : {}),
          }),
        })
        toast.success(t.users.updated)
      } else {
        await api("/api/admin/users", { method: "POST", body: JSON.stringify({ name, username, password, role }) })
        toast.success(t.users.created)
      }
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? user.username : t.users.add}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label={t.fields.name} htmlFor="u-name">
            <Input id="u-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {!user && (
            <Field label={t.auth.username} htmlFor="u-username">
              <Input id="u-username" dir="ltr" autoCapitalize="none" className="h-11" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
          )}
          <Field label={user ? t.users.resetPassword : t.auth.password} htmlFor="u-password">
            <Input id="u-password" type="password" dir="ltr" autoComplete="new-password" className="h-11" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label={t.fields.role}>
            <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={isSelf}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r === "ADMIN" ? t.nav.admin : t.nav.operator}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {user && !isSelf && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
              {t.users.disable}
            </label>
          )}
          <Button size="lg" disabled={!name || (!user && (!username || password.length < 8))} onClick={() => void save()}>
            {t.app.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
