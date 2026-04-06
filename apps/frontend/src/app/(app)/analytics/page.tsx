"use client"

import { Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"
import { useMutation } from "@tanstack/react-query"
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

export default function ReportsPage() {
  const reportMutation = useMutation({
    mutationFn: () => api.post<WeeklyReport>("/ai/weekly-report"),
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Weekly Report</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          AI-generated analysis of your training week
        </p>
      </div>

      <Card>
        <CardHeader className="pt-5 px-5">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <FileText className="h-4 w-4 text-primary" />
            Generate Report
          </CardTitle>
          <CardDescription>
            Analyses your current week's distance, duration, heart rate, and training load.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-5">
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
                Generate this week&apos;s report
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
                  <div
                    key={label}
                    className="rounded-xl bg-white/30 border border-white/50 px-4 py-3"
                  >
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
  )
}
