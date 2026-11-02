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

const GARMIN_ERRORS = {
  key_invalid: "Garmin key invalid or expired — update it in Settings",
  rate_limited: "Garmin is busy, try again later",
  garmin_unavailable: "Garmin is busy, try again later",
} as const

export default function HomePage() {
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
        title="Home"
        action={
          status?.connected && (
            <button
              type="button"
              aria-label="Sync with Garmin"
              title="Sync with Garmin"
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
          <Card className="text-sm font-medium">Connect Garmin in Settings</Card>
        </Link>
      ) : (
        <>
          {status?.lastError && GARMIN_ERRORS[status.lastError] && (
            <p className="text-sm text-destructive">
              {GARMIN_ERRORS[status.lastError]}
              {status.lastError === "key_invalid" && (
                <>
                  {" "}
                  <Link href="/settings" className="underline">
                    Settings
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
              <h2 className="font-semibold">Recent</h2>
              <Link href="/activities" className="text-sm text-primary">
                Show all
              </Link>
            </div>
            {recentData?.items.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No activities yet</p>
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
          <MetricTile label="Fatigue" color="fatigue" value={stats?.atl} caption="7-day load" />
          <MetricTile label="Fitness" color="fitness" value={stats?.ctl} caption="42-day load" />
          <Card>
            <div className="flex items-baseline justify-between">
              <MetricLabel color="form">Form</MetricLabel>
              {stats && <span className="text-sm font-semibold">{formLabel(stats.tsb)}</span>}
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
