import { getTableName } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DB } from "../../db/index.js"
import { GarminError } from "./client.js"

// plain function (not vi.fn): vi.fn re-wraps rejected promises and surfaces them as unhandled
let getImpl: (path: string, params?: unknown) => Promise<unknown> = async () => []
const getMock = {
  reset: () => {
    getImpl = async () => []
  },
  mockImplementation: (f: typeof getImpl) => {
    getImpl = f
  },
}
vi.mock("./client.js", async (orig) => ({
  ...(await orig<typeof import("./client.js")>()),
  createGarminClient: () => ({ get: (p: string, q?: unknown) => getImpl(p, q) }),
}))
vi.mock("../encryption.js", () => ({ decrypt: () => "plain-key", encrypt: (s: string) => s }))
const anthropic = vi.hoisted(() => ({ touched: false }))
vi.mock("../anthropic-client.js", () => {
  anthropic.touched = true
  return {}
})

import { dateChunks, isSyncDue, runGarminSync, syncWindows, withUserLock } from "./sync.js"

type Op = { op: string; table: string; values?: unknown; set?: unknown; where?: unknown }

function makeDb(selects: unknown[][]) {
  const ops: Op[] = []
  const queue = [...selects]
  const chain = (op: Op, result: () => unknown) => {
    const c: Record<string, unknown> = {}
    for (const m of ["from", "limit", "onConflictDoUpdate"]) c[m] = () => c
    c.values = (v: unknown) => {
      op.values = v
      return c
    }
    c.set = (v: unknown) => {
      op.set = v
      return c
    }
    c.where = (w: unknown) => {
      op.where = w
      return c
    }
    // biome-ignore lint/suspicious/noThenProperty: fake drizzle query builders are awaitable
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(res, rej)
    return c
  }
  const tbl = (t: Parameters<typeof getTableName>[0]) => getTableName(t)
  const db = {
    select: () => chain({ op: "select", table: "" }, () => queue.shift() ?? []),
    insert: (t: Parameters<typeof getTableName>[0]) => {
      const op = { op: "insert", table: tbl(t) }
      ops.push(op)
      return chain(op, () => [])
    },
    update: (t: Parameters<typeof getTableName>[0]) => {
      const op = { op: "update", table: tbl(t) }
      ops.push(op)
      return chain(op, () => [])
    },
    delete: (t: Parameters<typeof getTableName>[0]) => {
      const op = { op: "delete", table: tbl(t) }
      ops.push(op)
      return chain(op, () => [])
    },
  }
  return { db: db as unknown as DB, ops }
}

const act = (id: number, start = "2026-11-01 08:00:00") => ({
  activityId: id,
  startTimeGMT: start,
  activityType: { typeKey: "running" },
  duration: 1800,
  distance: 5000,
})

describe("isSyncDue", () => {
  const now = new Date("2026-11-02T12:00:00Z")
  const ago = (min: number) => new Date(now.getTime() - min * 60_000)
  it("null -> due", () => expect(isSyncDue(null, now, false)).toBe(true))
  it("14 min -> not due", () => expect(isSyncDue(ago(14), now, false)).toBe(false))
  it("16 min -> due", () => expect(isSyncDue(ago(16), now, false)).toBe(true))
  it("force -> due", () => expect(isSyncDue(ago(1), now, true)).toBe(true))
})

describe("syncWindows", () => {
  const now = new Date("2026-11-02T12:00:00Z")
  it("initial: 365 days activities, 90 days wellness", () => {
    const w = syncWindows(now, null)
    expect(w.activitiesFrom.toISOString()).toBe("2025-11-02T12:00:00.000Z")
    expect(w.wellnessFrom).toBe("2026-08-04")
    expect(w.wellnessTo).toBe("2026-11-02")
  })
  it("incremental: lastSyncedAt - 2 days, last 3 days incl. today", () => {
    const w = syncWindows(now, new Date("2026-11-02T10:00:00Z"))
    expect(w.activitiesFrom.toISOString()).toBe("2026-10-31T10:00:00.000Z")
    expect(w.wellnessFrom).toBe("2026-10-31")
    expect(w.wellnessTo).toBe("2026-11-02")
  })
})

describe("dateChunks", () => {
  it("covers the range with no gaps or overlaps", () => {
    const c = dateChunks("2026-08-04", "2026-11-02", 28)
    expect(c[0][0]).toBe("2026-08-04")
    expect(c.at(-1)?.[1]).toBe("2026-11-02")
    for (let i = 1; i < c.length; i++) {
      const prevEnd = new Date(`${c[i - 1][1]}T00:00:00Z`).getTime()
      expect(new Date(`${c[i][0]}T00:00:00Z`).getTime() - prevEnd).toBe(86400_000)
    }
    for (const [a, b] of c) {
      const days = (Date.parse(b) - Date.parse(a)) / 86400_000 + 1
      expect(days).toBeLessThanOrEqual(28)
    }
  })
  it("single day", () =>
    expect(dateChunks("2026-11-02", "2026-11-02", 28)).toEqual([["2026-11-02", "2026-11-02"]]))
})

describe("withUserLock", () => {
  it("second concurrent call gets busy, lock frees after rejection", async () => {
    let release!: () => void
    const first = withUserLock(
      "u1",
      () =>
        new Promise<string>((r) => {
          release = () => r("ok")
        })
    )
    expect(await withUserLock("u1", async () => "x")).toBe("busy")
    expect(await withUserLock("u2", async () => "other")).toBe("other")
    release()
    expect(await first).toBe("ok")
    await expect(withUserLock("u1", () => Promise.reject(new Error("boom")))).rejects.toThrow()
    expect(await withUserLock("u1", async () => "again")).toBe("again")
  })
})

describe("runGarminSync", () => {
  beforeEach(() => getMock.reset())
  const keyRow = [{ encryptedKey: "enc" }]

  it("401 -> status error key_invalid, no activity/wellness writes", async () => {
    getMock.mockImplementation(async () => {
      throw new GarminError("key_invalid", "x")
    })
    const { db, ops } = makeDb([keyRow, [{ lastSyncedAt: null }]])
    await runGarminSync(db, "u1", { initial: true })
    const writes = ops.filter((o) => o.table === "activities" || o.table === "daily_wellness")
    expect(writes).toEqual([])
    const last = ops.filter((o) => o.table === "garmin_sync").at(-1)
    expect(last?.set).toMatchObject({ status: "error", lastError: "key_invalid" })
  })

  it("unknown errors become garmin_unavailable", async () => {
    getMock.mockImplementation(async () => {
      throw new TypeError("net")
    })
    const { db, ops } = makeDb([keyRow, [{ lastSyncedAt: null }]])
    await runGarminSync(db, "u1", { initial: false })
    expect(ops.filter((o) => o.table === "garmin_sync").at(-1)?.set).toMatchObject({
      status: "error",
      lastError: "garmin_unavailable",
    })
  })

  it("imports activities, deletes strava dupes within +-2 min, finishes idle", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path.includes("activities/search")) return [act(1), { bogus: true }]
      if (path.includes("hrv/daily")) return { hrvSummaries: [] }
      return path.includes("dailySleep") ? {} : []
    })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { db, ops } = makeDb([keyRow, [{ lastSyncedAt: null }]])
    await runGarminSync(db, "u1", { initial: true })

    expect(ops.filter((o) => o.table === "activities" && o.op === "insert")).toHaveLength(1)
    const del = ops.filter((o) => o.table === "activities" && o.op === "delete")
    expect(del).toHaveLength(1)
    const q = new PgDialect().sqlToQuery(del[0].where as Parameters<PgDialect["sqlToQuery"]>[0])
    const dates = q.params.filter((p) => typeof p === "string" && /^2026-/.test(p)).map(String)
    expect(q.params).toContain("strava")
    expect(q.params).toContain("u1")
    expect(dates).toEqual(["2026-11-01T07:58:00.000Z", "2026-11-01T08:02:00.000Z"])
    expect(warn).toHaveBeenCalledWith(JSON.stringify({ userId: "u1", code: "map_failed" }))

    const last = ops.filter((o) => o.table === "garmin_sync").at(-1)
    expect(last?.set).toMatchObject({ status: "idle", lastError: null })
    expect((last?.set as { importedAt?: Date }).importedAt).toBeInstanceOf(Date)
    expect(ops.filter((o) => o.table === "daily_wellness").length).toBeGreaterThan(0)
    warn.mockRestore()
  })

  it("never loads the Claude client", () => expect(anthropic.touched).toBe(false))
})
