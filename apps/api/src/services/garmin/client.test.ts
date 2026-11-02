import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GarminError, clearGarminTokenCache, createGarminClient, exchangeKey } from "./client.js"

const KEY = "secret-api-key-123"
const jwt = (expSec: number, tag = "a") =>
  `h.${Buffer.from(JSON.stringify({ exp: expSec, tag })).toString("base64url")}.s`
const inHours = (h: number) => Math.floor(Date.now() / 1000) + h * 3600
const res = (status: number, body = "") => new Response(body, { status })

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  clearGarminTokenCache()
})
afterEach(() => vi.unstubAllGlobals())

describe("exchangeKey", () => {
  it("sends ApiKey header and returns token + expiry", async () => {
    const exp = inHours(24)
    const token = jwt(exp)
    fetchMock.mockResolvedValueOnce(res(200, token))
    const out = await exchangeKey(KEY)
    const [url, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe("POST")
    expect(String(url)).toContain("personal-api-key/token")
    expect(init.headers.Authorization).toBe(`ApiKey ${KEY}`)
    expect(out.accessToken).toBe(token)
    expect(out.expiresAt.getTime()).toBe(exp * 1000)
    expect(out.keyExpiresAt).toBeNull()
  })

  it("maps a malformed token response to garmin_unavailable without echoing it", async () => {
    fetchMock.mockResolvedValueOnce(res(200, "not-a-jwt-body"))
    const err = await exchangeKey(KEY).catch((e) => e)
    expect(err).toMatchObject({ code: "garmin_unavailable" })
    expect(String(err)).not.toContain("not-a-jwt-body")
  })

  it.each([401, 403])("maps %i to key_invalid", async (status) => {
    fetchMock.mockResolvedValueOnce(res(status))
    await expect(exchangeKey(KEY)).rejects.toMatchObject({ code: "key_invalid" })
  })
})

describe("client.get", () => {
  const ok = (body: unknown) => res(200, JSON.stringify(body))

  it("maps 429 to rate_limited and 5xx / network error to garmin_unavailable", async () => {
    fetchMock.mockResolvedValueOnce(res(200, jwt(inHours(24)))).mockResolvedValueOnce(res(429))
    await expect(createGarminClient(KEY).get("/x")).rejects.toMatchObject({ code: "rate_limited" })
    fetchMock.mockResolvedValueOnce(res(503))
    await expect(createGarminClient(KEY).get("/x")).rejects.toMatchObject({
      code: "garmin_unavailable",
    })
    fetchMock.mockRejectedValueOnce(new Error("boom"))
    await expect(createGarminClient(KEY).get("/x")).rejects.toMatchObject({
      code: "garmin_unavailable",
    })
  })

  it("reuses the cached token for a second call (token endpoint called once)", async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, jwt(inHours(24))))
      .mockResolvedValueOnce(ok({ a: 1 }))
      .mockResolvedValueOnce(ok({ a: 2 }))
    const c = createGarminClient(KEY)
    await c.get("/x", { start: 1 })
    await c.get("/x")
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/token"))).toHaveLength(1)
    expect(String(fetchMock.mock.calls[1][0])).toContain("?start=1")
  })

  it("re-exchanges after token is within 1h of expiry", async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, jwt(inHours(0.5))))
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce(res(200, jwt(inHours(24))))
      .mockResolvedValueOnce(ok({}))
    const c = createGarminClient(KEY)
    await c.get("/x")
    await c.get("/x")
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/token"))).toHaveLength(2)
  })

  it("retries once after a 401 with a fresh token", async () => {
    const t1 = jwt(inHours(24), "1")
    const t2 = jwt(inHours(24), "2")
    fetchMock
      .mockResolvedValueOnce(res(200, t1))
      .mockResolvedValueOnce(res(401))
      .mockResolvedValueOnce(res(200, t2))
      .mockResolvedValueOnce(ok({ done: true }))
    await expect(createGarminClient(KEY).get("/x")).resolves.toEqual({ done: true })
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe(`Bearer ${t2}`)
  })

  it("returns null for a 204 or an empty body (day without data)", async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, jwt(inHours(24))))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(res(200, ""))
    const c = createGarminClient(KEY)
    await expect(c.get("/x")).resolves.toBeNull()
    await expect(c.get("/x")).resolves.toBeNull()
  })

  it("keeps the HTTP status on errors so callers can treat 404 as no data", async () => {
    fetchMock.mockResolvedValueOnce(res(200, jwt(inHours(24)))).mockResolvedValueOnce(res(404))
    const err = await createGarminClient(KEY)
      .get("/x")
      .catch((e) => e)
    expect(err).toMatchObject({ code: "garmin_unavailable", status: 404 })
  })

  it("maps a 200 with a non-JSON body to garmin_unavailable without echoing it", async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, jwt(inHours(24))))
      .mockResolvedValueOnce(res(200, "<html>secret-body</html>"))
    const err = await createGarminClient(KEY)
      .get("/x")
      .catch((e) => e)
    expect(err).toBeInstanceOf(GarminError)
    expect(err).toMatchObject({ code: "garmin_unavailable" })
    expect(String(err)).not.toContain("secret-body")
  })

  it("getBytes maps an unreadable body to garmin_unavailable", async () => {
    const broken = {
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.reject(new Error("secret-body")),
    }
    fetchMock.mockResolvedValueOnce(res(200, jwt(inHours(24)))).mockResolvedValueOnce(broken)
    const err = await createGarminClient(KEY)
      .getBytes("/f")
      .catch((e) => e)
    expect(err).toMatchObject({ code: "garmin_unavailable" })
    expect(String(err)).not.toContain("secret-body")
  })

  it("getBytes returns raw bytes", async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, jwt(inHours(24))))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
    expect(await createGarminClient(KEY).getBytes("/f")).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("error messages never contain the key or token", async () => {
    const token = jwt(inHours(24))
    fetchMock.mockResolvedValueOnce(res(200, token)).mockResolvedValue(res(500, `${token} ${KEY}`))
    const err = await createGarminClient(KEY)
      .get("/x")
      .catch((e) => e)
    expect(String(err)).not.toContain(KEY)
    expect(String(err)).not.toContain(token)
    fetchMock.mockResolvedValueOnce(res(401, KEY))
    const err2 = await exchangeKey(KEY).catch((e) => e)
    expect(String(err2)).not.toContain(KEY)
  })
})
