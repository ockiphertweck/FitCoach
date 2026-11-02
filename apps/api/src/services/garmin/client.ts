import { createHash } from "node:crypto"

export type GarminErrorCode = "key_invalid" | "rate_limited" | "garmin_unavailable"

export class GarminError extends Error {
  constructor(
    public code: GarminErrorCode,
    message: string,
    public status?: number
  ) {
    super(message)
    this.name = "GarminError"
  }
}

// Base URL: DEFAULT_BASE_URL in garmin/connect-personal-api-python src/garmin_personal_api/constants.py
export const GARMIN_API_BASE = "https://personal.connectapi.garmin.com"
export const GARMIN_TOKEN_URL = `${GARMIN_API_BASE}/personalapitoken-service/personal-api/personal-api-key/token`

const REFRESH_WINDOW_MS = 3600_000

// Error messages are fixed strings built from status only: never echo response bodies, key or token.
function fromStatus(status: number): GarminError {
  if (status === 401 || status === 403)
    return new GarminError("key_invalid", `Garmin rejected credentials (${status})`, status)
  if (status === 429) return new GarminError("rate_limited", "Garmin rate limit hit (429)", status)
  return new GarminError("garmin_unavailable", `Garmin request failed (${status})`, status)
}

const unreadable = () => new GarminError("garmin_unavailable", "Garmin response unreadable")

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new GarminError("garmin_unavailable", "Garmin unreachable")
  }
}

// The token endpoint returns the bare JWT as text; expiry is its `exp` claim
// (auth.py in garmin/connect-personal-api-python). No key expiry is returned.
export async function exchangeKey(
  key: string
): Promise<{ accessToken: string; expiresAt: Date; keyExpiresAt: Date | null }> {
  const res = await send(GARMIN_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "*/*", Authorization: `ApiKey ${key}` },
  })
  if (!res.ok) throw fromStatus(res.status)
  const accessToken = (await res.text()).trim()
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString())
    if (typeof payload.exp !== "number") throw new Error()
    return { accessToken, expiresAt: new Date(payload.exp * 1000), keyExpiresAt: null }
  } catch {
    throw new GarminError("garmin_unavailable", "Garmin token response unreadable")
  }
}

const tokenCache = new Map<string, { accessToken: string; expiresAt: Date }>()

export function clearGarminTokenCache(): void {
  tokenCache.clear()
}

export function createGarminClient(key: string) {
  const cacheKey = createHash("sha256").update(key).digest("hex")

  async function token(): Promise<string> {
    const hit = tokenCache.get(cacheKey)
    if (hit && hit.expiresAt.getTime() - Date.now() > REFRESH_WINDOW_MS) return hit.accessToken
    const fresh = await exchangeKey(key)
    tokenCache.set(cacheKey, fresh)
    return fresh.accessToken
  }

  async function request(path: string, accept: string, params?: Record<string, string | number>) {
    const qs = params
      ? `?${new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]))}`
      : ""
    for (let attempt = 0; ; attempt++) {
      const res = await send(`${GARMIN_API_BASE}${path}${qs}`, {
        headers: { Accept: accept, Authorization: `Bearer ${await token()}` },
      })
      if (res.status === 401 && attempt === 0) {
        tokenCache.delete(cacheKey)
        continue
      }
      if (!res.ok) throw fromStatus(res.status)
      return res
    }
  }

  return {
    /** null = 204 / empty body (Garmin's "no data for this day"). */
    async get<T>(path: string, params?: Record<string, string | number>): Promise<T | null> {
      const res = await request(path, "application/json", params)
      try {
        const text = await res.text()
        return res.status === 204 || !text.trim() ? null : (JSON.parse(text) as T)
      } catch {
        throw unreadable()
      }
    },
    async getBytes(path: string): Promise<Uint8Array> {
      const res = await request(path, "*/*")
      try {
        return new Uint8Array(await res.arrayBuffer())
      } catch {
        throw unreadable()
      }
    },
  }
}
