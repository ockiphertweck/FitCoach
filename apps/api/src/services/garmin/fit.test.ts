import { Encoder, Profile } from "@garmin/fitsdk"
import { decode } from "@mapbox/polyline"
import { zipSync } from "fflate"
import { describe, expect, it, vi } from "vitest"
import { loadActivityStreams, parseFitActivity } from "./fit.js"

const DEG = 2 ** 31 / 180
const zip = (fit: Uint8Array) => zipSync({ "123_ACTIVITY.fit": fit })

function makeFit(n: number, withRecords = true): Uint8Array {
  const enc = new Encoder()
  enc.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: "activity",
    manufacturer: "garmin",
  } as never)
  if (withRecords)
    for (let i = 0; i < n; i++)
      enc.writeMesg({
        mesgNum: Profile.MesgNum.RECORD,
        timestamp: new Date(1_700_000_000_000 + i * 1000),
        distance: i * 10,
        heartRate: 120 + (i % 60),
        enhancedSpeed: 3,
        enhancedAltitude: 100 + i,
        positionLat: Math.round((48 + i * 0.0001) * DEG),
        positionLong: Math.round((11 + i * 0.0001) * DEG),
      } as never)
  return enc.close()
}

describe("parseFitActivity", () => {
  it("builds points, zones and a polyline from records", () => {
    const r = parseFitActivity(zip(makeFit(50)), 190)
    expect(r.points.length).toBeGreaterThan(0)
    expect(r.hrZones).not.toBeNull()
    expect(r.maxHrUsed).toBe(190)
    const coords = decode(r.polyline as string)
    expect(coords[0][0]).toBeCloseTo(48, 3)
    expect(coords[0][1]).toBeCloseTo(11, 3)
  })

  it("downsamples the polyline to at most 1000 coordinates", () => {
    const r = parseFitActivity(zip(makeFit(2500)), null)
    expect(decode(r.polyline as string).length).toBeLessThanOrEqual(1000)
  })

  it("returns an empty result for a FIT without records", () => {
    expect(parseFitActivity(zip(makeFit(0, false)), null)).toEqual({
      points: [],
      hrZones: null,
      maxHrUsed: null,
      polyline: null,
    })
  })

  it("returns an empty result for non-ZIP bytes without throwing", () => {
    const r = parseFitActivity(new Uint8Array([1, 2, 3, 4]), null)
    expect(r.points).toEqual([])
    expect(r.polyline).toBeNull()
  })
})

describe("loadActivityStreams", () => {
  const { getBytes } = vi.hoisted(() => ({ getBytes: vi.fn() }))
  vi.mock("./client.js", async (orig) => ({
    ...(await orig<typeof import("./client.js")>()),
    createGarminClient: () => ({ getBytes }),
  }))
  vi.mock("../encryption.js", () => ({ decrypt: () => "key" }))

  const fakeDb = (keyRows: unknown[]) => {
    const set = vi.fn(() => ({ where: vi.fn() }))
    return {
      db: {
        select: () => ({ from: () => ({ where: async () => keyRows }) }),
        update: () => ({ set }),
      } as never,
      set,
    }
  }
  const act = (o: object) =>
    ({ id: "a", userId: "u", source: "garmin", externalId: "123", streamData: null, ...o }) as never

  it("downloads, parses and stores once", async () => {
    getBytes.mockResolvedValue(zip(makeFit(20)))
    const { db, set } = fakeDb([{ encryptedKey: "x" }])
    const r = await loadActivityStreams(db, act({}), null)
    expect(r.points.length).toBeGreaterThan(0)
    expect(getBytes).toHaveBeenCalledWith("/download-service/files/activity/123")
    expect(set).toHaveBeenCalledOnce()
  })

  it("returns stored streamData without downloading", async () => {
    getBytes.mockClear()
    const { db } = fakeDb([])
    const r = await loadActivityStreams(
      db,
      act({ streamData: { points: [], polyline: "abc" } }),
      null
    )
    expect(r.polyline).toBe("abc")
    expect(getBytes).not.toHaveBeenCalled()
  })

  it("legacy Strava activity: summary polyline from rawData, no download", async () => {
    getBytes.mockClear()
    const { db, set } = fakeDb([{ encryptedKey: "x" }])
    const strava = (rawData: unknown) => act({ source: "strava", rawData })
    const r = await loadActivityStreams(db, strava({ map: { summary_polyline: "_p~iF" } }), null)
    expect(r).toEqual({ points: [], hrZones: null, maxHrUsed: null, polyline: "_p~iF" })
    expect((await loadActivityStreams(db, strava({ map: {} }), null)).polyline).toBeNull()
    expect((await loadActivityStreams(db, strava(null), null)).polyline).toBeNull()
    expect(getBytes).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it("returns empty and stores nothing when no key or download fails", async () => {
    const a = fakeDb([])
    expect((await loadActivityStreams(a.db, act({}), null)).points).toEqual([])
    getBytes.mockRejectedValue(new Error("boom"))
    const b = fakeDb([{ encryptedKey: "x" }])
    expect((await loadActivityStreams(b.db, act({}), null)).polyline).toBeNull()
    expect(a.set).not.toHaveBeenCalled()
    expect(b.set).not.toHaveBeenCalled()
  })
})
