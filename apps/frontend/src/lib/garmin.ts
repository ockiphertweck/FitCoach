import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { api } from "./api"
import { localDate } from "./utils"

export interface GarminStatus {
  connected: boolean
  status: "idle" | "importing" | "syncing" | "error"
  lastSyncedAt: string | null
  lastError: "key_invalid" | "rate_limited" | "garmin_unavailable" | null
  keyExpiresAt: string | null
}

export const STATUS_KEY = ["garmin-status"]

export function refreshData(qc: QueryClient) {
  for (const k of ["stats", "recent-activities", "wellness", "recap"])
    void qc.invalidateQueries({ queryKey: [k] })
}

async function postSync(qc: QueryClient, force: boolean) {
  try {
    qc.setQueryData(STATUS_KEY, await api.post<GarminStatus>("/garmin/sync", { force }))
  } catch {
    // 400 = not connected, others = sync failed: either way the GET /garmin/status below is the truth.
  }
  await qc.invalidateQueries({ queryKey: STATUS_KEY })
  refreshData(qc)
}

// Same gate as the API: a tab left open (e.g. overnight) syncs again when it is shown again.
const AUTO_SYNC_MS = 15 * 60_000

// Module-level: StrictMode, remounts and visibilitychange+focus pairs share one in-flight POST.
let lastAttempt: { at: number; date: string } | undefined
let autoSyncRun: Promise<void> | undefined

/** Starts a non-forced sync when due; returns the running sync, or undefined when none is running. */
function autoSync(qc: QueryClient): Promise<void> | undefined {
  const date = localDate()
  const due =
    !lastAttempt || Date.now() - lastAttempt.at >= AUTO_SYNC_MS || lastAttempt.date !== date
  if (!autoSyncRun && due) {
    lastAttempt = { at: Date.now(), date }
    autoSyncRun = postSync(qc, false).finally(() => {
      autoSyncRun = undefined
    })
  }
  return autoSyncRun
}

export function syncNow(qc: QueryClient) {
  return postSync(qc, true)
}

export const GARMIN_NOT_CONNECTED: GarminStatus = {
  connected: false,
  status: "idle",
  lastSyncedAt: null,
  lastError: null,
  keyExpiresAt: null,
}

export function useGarminSync() {
  const qc = useQueryClient()
  const [settled, setSettled] = useState(false)

  // settled = false while a sync runs: the recap waits for fresh data (and a new date's recap
  // is never generated from yesterday's data).
  useEffect(() => {
    let alive = true
    const run = () => {
      const running = autoSync(qc)
      if (!running) return setSettled(true)
      setSettled(false)
      void running.then(() => alive && setSettled(true))
    }
    const onShow = () => document.visibilityState === "visible" && run()
    run()
    document.addEventListener("visibilitychange", onShow)
    window.addEventListener("focus", onShow)
    return () => {
      alive = false
      document.removeEventListener("visibilitychange", onShow)
      window.removeEventListener("focus", onShow)
    }
  }, [qc])

  const { data: status } = useQuery<GarminStatus>({
    queryKey: STATUS_KEY,
    queryFn: () => api.get("/garmin/status"),
    enabled: settled,
    refetchInterval: (q) => (q.state.data?.status === "importing" ? 5000 : false),
  })

  // Import just finished: pull in the new data.
  const wasImporting = useRef(false)
  useEffect(() => {
    if (wasImporting.current && status && status.status !== "importing") refreshData(qc)
    wasImporting.current = status?.status === "importing"
  }, [status, qc])

  return { status, settled }
}
