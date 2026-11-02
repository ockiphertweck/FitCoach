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
import { translateApiError } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/client"
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
  const { lang, t, locale } = useI18n()
  const reportMutation = useMutation({
    mutationFn: () => api.post<WeeklyReport>("/ai/weekly-report", { lang }),
  })

  const { data: activities, isError } = useQuery<{ items: ChartActivity[] }>({
    queryKey: ["chart-activities"],
    queryFn: () => api.get("/activities?limit=200"),
  })
  const weekly = buildWeeklyChartData(activities?.items ?? [], locale)

  return (
    <div className="space-y-4">
      <PageHeader title={t.trends.title} />

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        <WeeklyChart
          title={t.trends.distance}
          dataKey="distance"
          data={weekly}
          error={isError}
          color="hsl(var(--chart-distance))"
          format={(v) => `${v.toLocaleString(locale)} km`}
        />
        <WeeklyChart
          title={t.trends.duration}
          dataKey="duration"
          data={weekly}
          error={isError}
          color="hsl(var(--chart-duration))"
          format={(v) => `${v.toLocaleString(locale)} min`}
        />
        <WeeklyChart
          title={t.trends.avgHeartRate}
          dataKey="avgHR"
          data={weekly}
          error={isError}
          color="hsl(var(--chart-hr))"
          format={(v) => `${v.toLocaleString(locale)} bpm`}
        />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <FileText className="h-4 w-4 text-primary" />
              {t.trends.weeklyReport}
            </CardTitle>
            <CardDescription>{t.trends.reportDescription}</CardDescription>
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
                  {t.trends.generating}
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  {t.trends.generate}
                </>
              )}
            </Button>

            {reportMutation.isError && (
              <p className="text-sm text-destructive">
                {translateApiError(reportMutation.error.message, t)}
              </p>
            )}

            {reportMutation.data && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    {
                      label: t.trends.distance,
                      value: `${(reportMutation.data.metrics.totalDistance / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`,
                    },
                    {
                      label: t.trends.duration,
                      value: `${Math.round(reportMutation.data.metrics.totalDuration / 60)} min`,
                    },
                    {
                      label: t.trends.sessions,
                      value: String(reportMutation.data.metrics.sessions),
                    },
                    {
                      label: t.trends.avgHr,
                      value: reportMutation.data.metrics.avgHR
                        ? `${reportMutation.data.metrics.avgHR} bpm`
                        : t.trends.notAvailable,
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
                  {t.trends.generatedAt}{" "}
                  {new Date(reportMutation.data.generatedAt).toLocaleString(locale)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
