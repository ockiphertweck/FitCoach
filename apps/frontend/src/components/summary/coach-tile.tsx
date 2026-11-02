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

// Module-level so a remounted tile joins a stream that is still running.
const inflight = new Map<string, Promise<void>>()

// Hard cap on automatic (non-click) streams per date per page load: guards against billing
// loops if the server keeps reporting a just-saved recap as stale.
const MAX_AUTO_STREAMS = 2
const autoStreams = new Map<string, number>()

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
    // Reuse a stream already running for this date (e.g. after navigating away and back).
    let run = inflight.get(date)
    if (!run) {
      run = streamPost("/ai/recommendation", { date }, (t) => setStreamed((p) => p + t)).finally(
        () => inflight.delete(date)
      )
      inflight.set(date, run)
    }
    try {
      await run
      await qc.invalidateQueries({ queryKey: ["recap", date] })
    } catch {
      setFailed(true)
    } finally {
      setStreaming(false)
    }
  }, [date, qc])

  // A new generatedAt means new stored content: show it instead of the streamed copy.
  const key = data ? `${date}:${data.recap?.generatedAt ?? "none"}` : null
  const lastKey = useRef<string | null>(null)
  useEffect(() => {
    if (key === null || key === lastKey.current) return
    lastKey.current = key
    setStreamed("")
    setFailed(false)
  }, [key])

  const needsStream = !!data?.hasKey && (!data.recap || data.recap.stale)
  useEffect(() => {
    // Guard per (date, generatedAt): no loop if a save fails, one retry per new stale recap,
    // and no double stream under StrictMode.
    if (!needsStream || key === null || started.current === key) return
    started.current = key
    const used = autoStreams.get(date) ?? 0
    if (used >= MAX_AUTO_STREAMS) return
    autoStreams.set(date, used + 1)
    void generate()
  }, [needsStream, key, date, generate])

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
