"use client"

import { PageHeader } from "@/components/page-header"
import { type ActivityItem, ActivityRow } from "@/components/summary/activity-row"
import { CoachTile } from "@/components/summary/coach-tile"
import { FormScale, formLabel } from "@/components/summary/form-scale"
import { MetricTile } from "@/components/summary/metric-tile"
import { RecoveryTiles, type WellnessData } from "@/components/summary/recovery-tiles"
import { Card, MetricLabel } from "@/components/ui/card"
import { api } from "@/lib/api"
import { syncNow, useGarminSync } from "@/lib/garmin"
import { useI18n } from "@/lib/i18n/client"
import { localDate } from "@/lib/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

interface TrainingLoad {
  atl: number
  ctl: number
  tsb: number
}

export default function HomePage() {
  const { t } = useI18n()
  const garminErrors = {
    key_invalid: t.home.keyInvalid,
    rate_limited: t.home.garminBusy,
    garmin_unavailable: t.home.garminBusy,
  } as const
  const qc = useQueryClient()
  const date = localDate()
  const { status, settled } = useGarminSync()
  const connected = status?.connected !== false
  const { data: wellness, isLoading: wellnessLoading } = useQuery<WellnessData>({
    queryKey: ["wellness", date],
    queryFn: () => api.get(`/wellness?date=${date}`),
    enabled: settled && connected,
  })
  const importing = status?.status === "importing"
  const [syncing, setSyncing] = useState(false)
  const busy = status?.status === "importing" || status?.status === "syncing"
  const { data: stats } = useQuery<TrainingLoad>({
    queryKey: ["stats"],
    queryFn: () => api.get("/activities/stats"),
  })

  const { data: recentData } = useQuery<{ items: ActivityItem[]; total: number }>({
    queryKey: ["recent-activities"],
    queryFn: () => api.get("/activities?limit=5"),
  })

  return (
    <div className="space-y-3">
      <PageHeader
        title={t.home.title}
        action={
          status?.connected && (
            <button
              type="button"
              aria-label={t.home.syncWithGarmin}
              title={t.home.syncWithGarmin}
              disabled={!settled || busy || syncing}
              onClick={() => {
                setSyncing(true)
                void syncNow(qc).finally(() => setSyncing(false))
              }}
              className="rounded-full p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${syncing || busy ? "animate-spin" : ""}`} />
            </button>
          )
        }
      />
      {settled && status && !status.connected ? (
        <Link href="/settings" className="block">
          <Card className="text-sm font-medium">{t.home.connectGarmin}</Card>
        </Link>
      ) : (
        <>
          {status?.lastError && garminErrors[status.lastError] && (
            <p className="text-sm text-destructive">
              {garminErrors[status.lastError]}
              {status.lastError === "key_invalid" && (
                <>
                  {" "}
                  <Link href="/settings" className="underline">
                    {t.home.settings}
                  </Link>
                </>
              )}
            </p>
          )}
          <RecoveryTiles
            data={wellness}
            loading={!settled || wellnessLoading}
            importing={importing}
          />
        </>
      )}

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <div data-testid="main-col" className="space-y-3">
          <CoachTile
            enabled={settled && !!status && status.status !== "importing"}
            importing={importing}
          />
          <Card>
            <div className="flex items-center justify-between pb-1">
              <h2 className="font-semibold">{t.home.recent}</h2>
              <Link href="/activities" className="text-sm text-primary">
                {t.home.showAll}
              </Link>
            </div>
            {recentData?.items.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t.home.noActivities}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {recentData?.items.map((a) => (
                  <ActivityRow key={a.id} activity={a} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div data-testid="load-col" className="space-y-3 lg:self-start">
          <MetricTile
            label={t.home.fatigue}
            color="fatigue"
            value={stats?.atl}
            caption={t.home.load7}
          />
          <MetricTile
            label={t.home.fitness}
            color="fitness"
            value={stats?.ctl}
            caption={t.home.load42}
          />
          <Card>
            <div className="flex items-baseline justify-between">
              <MetricLabel color="form">{t.home.form}</MetricLabel>
              {stats && <span className="text-sm font-semibold">{formLabel(stats.tsb, t)}</span>}
            </div>
            <p className="mt-1 text-4xl font-bold tabular-nums">{stats?.tsb ?? "—"}</p>
            <div className="mt-3">
              <FormScale tsb={stats?.tsb ?? 0} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
