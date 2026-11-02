import { eq, getTableName } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"
import type { DB } from "../db/index.js"
import { activities } from "../db/schema.js"
import { purgeLegacyData } from "./purge.js"

function makeDb() {
  const deleted: { table: string; where: unknown }[] = []
  const counts: Record<string, number> = {
    activities: 3,
    chat_history: 5,
    chat_sessions: 2,
    daily_recommendations: 4,
    weekly_reports: 1,
  }
  const tx = {
    delete: vi.fn((table: Parameters<typeof getTableName>[0]) => {
      const name = getTableName(table)
      const entry: { table: string; where: unknown } = { table: name, where: undefined }
      deleted.push(entry)
      const chain = {
        where: vi.fn((w: unknown) => {
          entry.where = w
          return chain
        }),
        returning: vi.fn(async () =>
          Array.from({ length: counts[name] ?? 0 }, () => ({ id: "x" }))
        ),
      }
      return chain
    }),
  }
  const transaction = vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
  return { db: { transaction } as unknown as DB, transaction, deleted }
}

describe("purgeLegacyData", () => {
  it("deletes exactly the legacy tables inside one transaction and returns counts", async () => {
    const { db, transaction, deleted } = makeDb()
    const result = await purgeLegacyData(db)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(deleted.map((d) => d.table).sort()).toEqual([
      "activities",
      "chat_history",
      "chat_sessions",
      "daily_recommendations",
      "weekly_reports",
    ])
    expect(result).toEqual({
      activities: 3,
      chatSessions: 2,
      chatHistory: 5,
      recaps: 4,
      weeklyReports: 1,
    })
  })

  it("restricts activities deletion to source = 'strava' and others are unconditional", async () => {
    const { db, deleted } = makeDb()
    await purgeLegacyData(db)
    const where = deleted.find((d) => d.table === "activities")?.where as Parameters<
      PgDialect["sqlToQuery"]
    >[0]
    const dialect = new PgDialect()
    expect(dialect.sqlToQuery(where)).toEqual(dialect.sqlToQuery(eq(activities.source, "strava")))
    expect(dialect.sqlToQuery(where).params).toEqual(["strava"])
    expect(dialect.sqlToQuery(where).sql).toContain('"source"')
    for (const d of deleted.filter((x) => x.table !== "activities")) {
      expect(d.where).toBeUndefined()
    }
  })

  it("never touches users, api_keys, user_profiles", async () => {
    const { db, deleted } = makeDb()
    await purgeLegacyData(db)
    const names = deleted.map((d) => d.table)
    for (const t of ["users", "api_keys", "user_profiles"]) expect(names).not.toContain(t)
  })
})
