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

// Module-level so a remounted tile joins a stream that is still running and never re-starts a
// (date, generatedAt) key that an earlier mount already handled.
const inflight = new Map<string, Promise<void>>()
const autoStarted = new Set<string>()

// Hard cap on automatic (non-click) streams per date per page load: guards against billing
// loops if the server keeps reporting a just-saved recap as stale.
const MAX_AUTO_STREAMS = 2
const autoStreams = new Map<string, number>()

// Reuse a stream already running for this date (e.g. after navigating away and back).
function joinOrStartStream(date: string, onChunk: (t: string) => void): Promise<void> {
  let run = inflight.get(date)
  if (!run) {
    run = streamPost("/ai/recommendation", { date }, onChunk).finally(() => inflight.delete(date))
    inflight.set(date, run)
  }
  return run
}

// Claims the single automatic stream for this (date, generatedAt) key, within the per-date cap.
function claimAutoStream(date: string, key: string): boolean {
  if (inflight.has(date) || autoStarted.has(key)) return false
  autoStarted.add(key)
  const used = autoStreams.get(date) ?? 0
  if (used >= MAX_AUTO_STREAMS) return false
  autoStreams.set(date, used + 1)
  return true
}

export function CoachTile({
  enabled,
  importing = false,
}: Readonly<{ enabled: boolean; importing?: boolean }>) {
  const qc = useQueryClient()
  const date = localDate()
  const [streamed, setStreamed] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [failed, setFailed] = useState(false)
  const streamedRef = useRef("")

  const { data, isFetching, isError, refetch } = useQuery<RecapResponse>({
    queryKey: ["recap", date],
    queryFn: () => api.get(`/ai/recommendation?date=${date}`),
    enabled,
  })

  const generate = useCallback(async () => {
    setStreamed("")
    streamedRef.current = ""
    setFailed(false)
    setStreaming(true)
    const run = joinOrStartStream(date, (t) => {
      streamedRef.current += t
      setStreamed((p) => p + t)
    })
    try {
      await run
      await qc.invalidateQueries({ queryKey: ["recap", date] })
      // Blank stream and nothing saved server-side: don't spin on "Writing your recap…" forever.
      if (!streamedRef.current.trim() && !qc.getQueryData<RecapResponse>(["recap", date])?.recap)
        setFailed(true)
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

  // Remounted while a stream for this date is running: show its progress, no new POST.
  useEffect(() => {
    if (inflight.has(date)) void generate()
  }, [date, generate])

  const needsStream = !!data?.hasKey && (!data.recap || data.recap.stale)
  useEffect(() => {
    // Guard per (date, generatedAt): no loop if a save fails, one retry per new stale recap,
    // and no double stream under StrictMode or remount. Decide only on settled data.
    if (!enabled || !needsStream || key === null || isFetching) return
    if (claimAutoStream(date, key)) void generate()
  }, [enabled, needsStream, key, isFetching, date, generate])

  return (
    <Card data-testid="coach-tile">
      <div className="flex items-center justify-between">
        <MetricLabel color="coach">Coach · Today</MetricLabel>
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
        <RecapBody
          data={data}
          enabled={enabled}
          importing={importing}
          isError={isError}
          failed={failed}
          streaming={streaming}
          streamed={streamed}
          onRetry={() => void refetch()}
        />
      </div>
    </Card>
  )
}

// Placeholder while there is no recap text yet: sync/import gate first, then fetch/generation.
function pendingText(enabled: boolean, importing: boolean, hasData: boolean): string {
  if (!enabled) return importing ? "Waiting for Garmin import…" : "Syncing…"
  return hasData ? "Writing your recap…" : "Loading…"
}

function RecapBody({
  data,
  enabled,
  importing,
  isError,
  failed,
  streaming,
  streamed,
  onRetry,
}: Readonly<{
  data: RecapResponse | undefined
  enabled: boolean
  importing: boolean
  isError: boolean
  failed: boolean
  streaming: boolean
  streamed: string
  onRetry: () => void
}>) {
  if (data && !data.hasKey) {
    return (
      <p>
        Add your Claude API key in{" "}
        <Link href="/settings" className="font-medium underline">
          Settings
        </Link>
      </p>
    )
  }
  if (isError && !data) {
    return (
      <p className="text-destructive">
        Couldn't load your recap.{" "}
        <button type="button" className="underline" onClick={onRetry}>
          Retry
        </button>
      </p>
    )
  }
  if (failed) return <p className="text-destructive">Recap generation failed. Try refreshing.</p>
  const shown = streamed || data?.recap?.content
  if (!shown) {
    return <p className="text-muted-foreground">{pendingText(enabled, importing, !!data)}</p>
  }
  const updating = streaming && !streamed
  return (
    <div
      className={`[&_h3]:text-lg [&_h3]:font-extrabold [&_h3]:tracking-tight [&_h3]:text-foreground ${updating ? "opacity-50" : ""}`}
    >
      <Markdown>{shown.replace(/^(→ .+)$/m, "**$1**")}</Markdown>
      {updating && <p className="mt-2 text-xs text-muted-foreground">Updating…</p>}
    </div>
  )
}
