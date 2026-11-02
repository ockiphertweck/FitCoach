import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { api } from "./api"

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

// Module-level: StrictMode / remounts POST at most once per page load.
let initialSync: Promise<void> | undefined

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

  useEffect(() => {
    initialSync ??= postSync(qc, false)
    void initialSync.then(() => setSettled(true))
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
