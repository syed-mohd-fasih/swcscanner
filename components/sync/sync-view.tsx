"use client"

import { PageHeader } from "@/components/shared/page-header"
import { Ltr } from "@/components/shared/states"
import { SyncStatus } from "@/components/sync/sync-status"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLocalQuery } from "@/hooks/use-local-query"
import { useI18n } from "@/lib/i18n/client"
import { syncRepository } from "@/repositories/indexeddb"

/** Operator-visible sync status and the list of unsaved changes. */
export function SyncView() {
  const { t } = useI18n()
  const outbox = useLocalQuery(() => syncRepository.list(), []).data ?? []

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.nav.sync} />
      <Card>
        <CardContent className="pt-6">
          <SyncStatus />
        </CardContent>
      </Card>
      {outbox.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.system.outbox}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {outbox
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((m) => (
                  <li key={m.id} className="flex flex-col gap-1 py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant={m.status === "failed" ? "destructive" : "secondary"}>{m.status}</Badge>
                      <Ltr className="font-medium">
                        {m.operation} {m.entityType}/{m.entityId}
                      </Ltr>
                    </span>
                    {m.rejected && <span className="text-destructive">{t.sync.rejected}</span>}
                    {m.error && <Ltr className="break-words text-muted-foreground">{m.error}</Ltr>}
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
