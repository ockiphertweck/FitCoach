"use client"

import { Markdown } from "@/components/markdown"
import { Card, MetricLabel } from "@/components/ui/card"
import { api, streamPost } from "@/lib/api"
import { localDate } from "@/lib/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

interface RecapResponse {
  hasKey: boolean
  recap: { content: string; generatedAt: string; stale: boolean } | null
}

export function CoachTile() {
  const qc = useQueryClient()
  const date = localDate()
  const started = useRef<string | null>(null)
  const [streamed, setStreamed] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [failed, setFailed] = useState(false)

  const { data } = useQuery<RecapResponse>({
    queryKey: ["recap", date],
    queryFn: () => api.get(`/ai/recommendation?date=${date}`),
  })

  const generate = useCallback(async () => {
    setStreamed("")
    setFailed(false)
    setStreaming(true)
    try {
      await streamPost("/ai/recommendation", { date }, (t) => setStreamed((p) => p + t))
      await qc.invalidateQueries({ queryKey: ["recap", date] })
    } catch {
      setFailed(true)
    } finally {
      setStreaming(false)
    }
  }, [date, qc])

  const needsStream = !!data?.hasKey && (!data.recap || data.recap.stale)
  useEffect(() => {
    // Guard: one stream per (date, mount), also under StrictMode double-mount.
    if (!needsStream || started.current === date) return
    started.current = date
    void generate()
  }, [needsStream, date, generate])

  const old = data?.recap?.content
  const shown = streamed || old
  return (
    <Card>
      <div className="flex items-center justify-between">
        <MetricLabel color="coach">Coach</MetricLabel>
        {data?.hasKey && (
          <button
            type="button"
            aria-label="Refresh recap"
            disabled={streaming}
            onClick={() => void generate()}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${streaming ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>
      <div className="mt-2 text-sm">
        {data && !data.hasKey ? (
          <p>
            Add your Claude API key in{" "}
            <Link href="/settings" className="font-medium underline">
              Settings
            </Link>
          </p>
        ) : failed ? (
          <p className="text-destructive">Recap generation failed. Try refreshing.</p>
        ) : shown ? (
          <div className={streaming && !streamed ? "opacity-50" : undefined}>
            <Markdown>{shown}</Markdown>
            {streaming && !streamed && (
              <p className="mt-2 text-xs text-muted-foreground">Updating…</p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">{data ? "Writing your recap…" : "Loading…"}</p>
        )}
      </div>
    </Card>
  )
}
