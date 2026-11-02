"use client"

import { Markdown } from "@/components/markdown"
import { PageHeader } from "@/components/page-header"
import {
  type ChartActivity,
  WeeklyChart,
  buildWeeklyChartData,
} from "@/components/trends/weekly-chart"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"
import { useMutation, useQuery } from "@tanstack/react-query"
import { FileText, Loader2 } from "lucide-react"

interface WeeklyReport {
  id: string
  weekStart: string
  summary: string
  metrics: {
    totalDistance: number
    totalDuration: number
    avgHR: number | null
    sessions: number
    atl: number
    ctl: number
  }
  generatedAt: string
}

export default function TrendsPage() {
  const reportMutation = useMutation({
    mutationFn: () => api.post<WeeklyReport>("/ai/weekly-report"),
  })

  const { data: activities, isError } = useQuery<{ items: ChartActivity[] }>({
    queryKey: ["chart-activities"],
    queryFn: () => api.get("/activities?limit=200"),
  })
  const weekly = buildWeeklyChartData(activities?.items ?? [])

  return (
    <div className="space-y-4">
      <PageHeader title="Trends" />

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        <WeeklyChart
          title="Distance"
          dataKey="distance"
          data={weekly}
          error={isError}
          color="hsl(var(--chart-distance))"
          format={(v) => `${v} km`}
        />
        <WeeklyChart
          title="Duration"
          dataKey="duration"
          data={weekly}
          error={isError}
          color="hsl(var(--chart-duration))"
          format={(v) => `${v} min`}
        />
        <WeeklyChart
          title="Avg Heart Rate"
          dataKey="avgHR"
          data={weekly}
          error={isError}
          color="hsl(var(--chart-hr))"
          format={(v) => `${v} bpm`}
        />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <FileText className="h-4 w-4 text-primary" />
              Weekly Report
            </CardTitle>
            <CardDescription>
              Analyses your current week's distance, duration, heart rate, and training load.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Button
              onClick={() => reportMutation.mutate()}
              disabled={reportMutation.isPending}
              size="sm"
            >
              {reportMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Generate report
                </>
              )}
            </Button>

            {reportMutation.isError && (
              <p className="text-sm text-destructive">{reportMutation.error.message}</p>
            )}

            {reportMutation.data && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    {
                      label: "Distance",
                      value: `${(reportMutation.data.metrics.totalDistance / 1000).toFixed(1)} km`,
                    },
                    {
                      label: "Duration",
                      value: `${Math.round(reportMutation.data.metrics.totalDuration / 60)} min`,
                    },
                    { label: "Sessions", value: String(reportMutation.data.metrics.sessions) },
                    {
                      label: "Avg HR",
                      value: reportMutation.data.metrics.avgHR
                        ? `${reportMutation.data.metrics.avgHR} bpm`
                        : "N/A",
                    },
                    { label: "ATL", value: String(reportMutation.data.metrics.atl) },
                    { label: "CTL", value: String(reportMutation.data.metrics.ctl) },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-muted px-4 py-3">
                      <p className="text-muted-foreground text-xs mb-0.5">{label}</p>
                      <p className="font-semibold text-sm">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="prose prose-sm max-w-none text-foreground/85">
                  <Markdown>{reportMutation.data.summary}</Markdown>
                </div>

                <p className="text-xs text-muted-foreground">
                  Generated {new Date(reportMutation.data.generatedAt).toLocaleString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
