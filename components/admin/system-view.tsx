"use client"

import { useCallback, useEffect, useState } from "react"

import { useSession, useSyncStatus } from "@/components/providers/session-provider"
import { InfoList } from "@/components/shared/fields"
import { useConfirm } from "@/components/shared/mutation-confirm-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { Ltr } from "@/components/shared/states"
import { useOutboxCounts } from "@/components/sync/sync-status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DB_NAME, getDb } from "@/lib/db/schema"
import { isEmulatorMode } from "@/lib/firebase/client"
import { useI18n } from "@/lib/i18n/client"
import { useLocalQuery } from "@/hooks/use-local-query"
import { remote } from "@/repositories/firestore/remote"
import { syncRepository } from "@/repositories/indexeddb"

/** Development/admin diagnostics. */
export function SystemView() {
  const { t } = useI18n()
  const { sync } = useSession()
  const status = useSyncStatus()
  const counts = useOutboxCounts()
  const confirm = useConfirm()
  const [backend, setBackend] = useState<"checking" | "ok" | "down">("checking")

  const local = useLocalQuery(async () => {
    const db = await getDb()
    return {
      items: await db.count("items"),
      manifests: await db.count("manifests"),
      locations: await db.count("locations"),
      configVersions: (await syncRepository.getMeta<Record<string, string>>("configVersions")) ?? {},
      pulls: (await db.getAllKeys("meta")).filter((k) => String(k).startsWith("pull:")).length,
    }
  }, []).data

  const probe = useCallback(() => {
    remote
      .configVersions()
      .then(() => setBackend("ok"))
      .catch(() => setBackend("down"))
  }, [])
  useEffect(probe, [probe])
  const check = () => {
    setBackend("checking")
    probe()
  }

  async function clearDevice() {
    if (!(await confirm({ description: t.system.confirmClear, irreversible: true }))) return
    ;(await getDb()).close()
    indexedDB.deleteDatabase(DB_NAME)
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.system.title} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.system.backend}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <InfoList
              rows={[
                {
                  label: t.system.backend,
                  value: (
                    <Badge variant={backend === "down" ? "destructive" : "secondary"}>
                      {backend === "ok" ? t.system.reachable : backend === "down" ? t.system.unreachable : t.app.loading}
                    </Badge>
                  ),
                },
                { label: t.system.emulator, value: isEmulatorMode ? t.app.yes : t.app.no },
                { label: t.sync.online, value: status.online ? t.app.yes : t.app.no },
              ]}
            />
            <Button variant="outline" onClick={check}>
              {t.app.retry}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.system.indexedDb}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <InfoList
              rows={[
                { label: t.system.localItems, value: local?.items },
                { label: t.manifests.title, value: local?.manifests },
                { label: t.locations.title, value: local?.locations },
                {
                  label: t.system.outbox,
                  value: <Ltr>{`pending ${counts.pending} · syncing ${counts.syncing} · failed ${counts.failed}`}</Ltr>,
                },
                {
                  label: t.system.lastSync,
                  value: <Ltr>{status.lastSyncAt ?? t.sync.never}</Ltr>,
                },
                {
                  label: t.system.configVersions,
                  value: <Ltr className="text-xs break-all">{JSON.stringify(local?.configVersions ?? {})}</Ltr>,
                },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void sync.flush()}>{t.system.flush}</Button>
              <Button variant="destructive" onClick={() => void clearDevice()}>
                {t.system.clearLocal}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
