"use client"

import { PageHeader } from "@/components/page-header"
import { ActivityRow } from "@/components/summary/activity-row"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/ui/segmented"
import { api } from "@/lib/api"
import { useI18n } from "@/lib/i18n/client"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

interface Activity {
  id: string
  name: string | null
  sportType: string
  startDate: string
  durationSeconds: number | null
  distanceMeters: number | null
  averageHeartRate: number | null
  elevationMeters: number | null
  averagePaceSecondsPerKm: number | null
}

const SPORTS = ["all", "run", "ride", "swim", "walk", "hike", "workout"]
const PAGE_SIZE = 20

function groupByMonth(items: Activity[], locale: string) {
  const groups = new Map<string, Activity[]>()
  for (const a of items) {
    const key = new Date(a.startDate).toLocaleDateString(locale, { month: "long", year: "numeric" })
    groups.set(key, [...(groups.get(key) ?? []), a])
  }
  return [...groups.entries()]
}

export default function ActivitiesPage() {
  const { t, locale } = useI18n()
  const [sport, setSport] = useState("all")
  const [page, setPage] = useState(0)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  })
  if (sport !== "all") params.set("sport", sport)
  if (from) params.set("from", from)
  if (to) params.set("to", to)

  const { data, isLoading } = useQuery<{ items: Activity[]; total: number }>({
    queryKey: ["activities", sport, page, from, to],
    queryFn: () => api.get(`/activities?${params}`),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <PageHeader title={t.activities.title} subtitle={t.activities.total(data?.total ?? 0)} />

      {/* Filters */}
      <Card className="space-y-3">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <Segmented
            aria-label={t.activities.sport}
            value={sport}
            options={SPORTS.map((s) => ({
              value: s,
              label:
                s === "all" ? t.activities.all : ((t.sports as Record<string, string>)[s] ?? s),
            }))}
            onChange={(v) => {
              setSport(v)
              setPage(0)
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(0)
            }}
            className="w-36 text-sm"
            placeholder={t.activities.from}
          />
          <span className="text-muted-foreground text-sm">{t.activities.to}</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(0)
            }}
            className="w-36 text-sm"
            placeholder={t.activities.to}
          />
          {(from || to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom("")
                setTo("")
                setPage(0)
              }}
            >
              {t.activities.clear}
            </Button>
          )}
        </div>
      </Card>

      {/* List */}
      {isLoading ? (
        <Card className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-xl" />
          ))}
        </Card>
      ) : !data?.items.length ? (
        <Card>
          <p className="text-sm text-muted-foreground text-center py-8">{t.activities.none}</p>
        </Card>
      ) : (
        groupByMonth(data.items, locale).map(([month, items]) => (
          <section key={month} className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {month}
            </h2>
            <Card className="divide-y divide-border py-2">
              {items.map((a) => (
                <ActivityRow key={a.id} activity={a} wide />
              ))}
            </Card>
          </section>
        ))
      )}

      <p className="text-center text-xs text-muted-foreground">
        {t.activities.page(page + 1, totalPages || 1)}
      </p>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
