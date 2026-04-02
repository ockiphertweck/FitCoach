"use client"

import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"

interface Activity {
  id: string
  name: string | null
  sportType: string
  startDate: string
  durationSeconds: number | null
  distanceMeters: number | null
  elevationMeters: number | null
  averageHeartRate: number | null
  calories: number | null
  perceivedExertion: number | null
}

const SPORTS = ["all", "run", "ride", "swim", "walk", "hike", "workout"]
const PAGE_SIZE = 20

function formatDuration(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function ActivitiesPage() {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activities</h1>
        <p className="text-muted-foreground">{data?.total ?? 0} total activities</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <Tabs value={sport} onValueChange={(v) => { setSport(v); setPage(0) }}>
          <TabsList>
            {SPORTS.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize">
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex gap-2 items-center">
          <Input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(0) }}
            className="w-36 text-sm"
            placeholder="From"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(0) }}
            className="w-36 text-sm"
            placeholder="To"
          />
          {(from || to) && (
            <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); setPage(0) }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Page {page + 1} of {totalPages || 1}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No activities found.</p>
          ) : (
            <div className="divide-y">
              {data.items.map((a) => (
                <Link
                  key={a.id}
                  href={`/activities/${a.id}`}
                  className="py-3 flex items-center justify-between gap-4 hover:bg-muted/50 -mx-4 px-4 rounded transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{a.name ?? a.sportType}</p>
                        <Badge variant="outline" className="capitalize shrink-0 text-xs">
                          {a.sportType}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.startDate).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 text-sm text-muted-foreground shrink-0">
                    {a.durationSeconds && <span>{formatDuration(a.durationSeconds)}</span>}
                    {a.distanceMeters && (
                      <span>{(a.distanceMeters / 1000).toFixed(1)} km</span>
                    )}
                    {a.elevationMeters && <span>{Math.round(a.elevationMeters)} m ↑</span>}
                    {a.averageHeartRate && <span>{a.averageHeartRate} bpm</span>}
                    {a.calories && <span>{a.calories} kcal</span>}
                    {a.perceivedExertion && (
                      <span className="font-medium">RPE {a.perceivedExertion}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
