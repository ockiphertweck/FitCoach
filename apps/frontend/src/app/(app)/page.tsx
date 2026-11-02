"use client"

import { PageHeader } from "@/components/page-header"
import { type ActivityItem, ActivityRow } from "@/components/summary/activity-row"
import { CoachTile } from "@/components/summary/coach-tile"
import { FormScale, formLabel } from "@/components/summary/form-scale"
import { MetricTile } from "@/components/summary/metric-tile"
import { Button } from "@/components/ui/button"
import { Card, MetricLabel } from "@/components/ui/card"
import { api } from "@/lib/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

interface TrainingLoad {
  atl: number
  ctl: number
  tsb: number
}

export default function Summary() {
  const qc = useQueryClient()
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const { data: stats } = useQuery<TrainingLoad>({
    queryKey: ["stats"],
    queryFn: () => api.get("/activities/stats"),
  })

  const { data: recentData } = useQuery<{ items: ActivityItem[]; total: number }>({
    queryKey: ["recent-activities"],
    queryFn: () => api.get("/activities?limit=5"),
  })

  const syncMutation = useMutation({
    mutationFn: () => api.post<{ synced: number }>("/strava/sync"),
    onSuccess: (data) => {
      setSyncResult(`Synced ${data.synced} activities`)
      qc.invalidateQueries({ queryKey: ["recent-activities"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
      qc.invalidateQueries({ queryKey: ["recap"] })
    },
  })

  return (
    <div className="space-y-3">
      <PageHeader title="Summary" />
      <CoachTile />

      <div className="grid grid-cols-2 gap-3">
        <MetricTile label="Fatigue" color="fatigue" value={stats?.atl} caption="7-day load" />
        <MetricTile label="Fitness" color="fitness" value={stats?.ctl} caption="42-day load" />
      </div>

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

      <Button
        variant="secondary"
        className="w-full gap-2"
        onClick={() => syncMutation.mutate()}
        disabled={syncMutation.isPending}
      >
        <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
        Sync Strava
      </Button>
      {syncResult && <p className="text-center text-sm text-muted-foreground">{syncResult}</p>}
    </div>
  )
}
