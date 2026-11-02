import { describe, expect, it, vi } from "vitest"

const created = vi.hoisted(() => ({ keys: [] as string[] }))
vi.mock("./client.js", async (orig) => ({
  ...(await orig<typeof import("./client.js")>()),
  createGarminClient: (key: string) => {
    created.keys.push(key)
    return { key }
  },
}))
vi.mock("../encryption.js", () => ({ decrypt: (s: string) => `plain:${s}` }))

import { loadGarminClient } from "./load-client.js"

const fakeDb = (rows: unknown[]) =>
  ({ select: () => ({ from: () => ({ where: async () => rows }) }) }) as never

describe("loadGarminClient", () => {
  it("returns null when no Garmin key is stored", async () => {
    expect(await loadGarminClient(fakeDb([]), "u1")).toBeNull()
  })

  it("decrypts the stored key and creates a client", async () => {
    const c = await loadGarminClient(fakeDb([{ encryptedKey: "enc" }]), "u1")
    expect(c).toEqual({ key: "plain:enc" })
    expect(created.keys).toEqual(["plain:enc"])
  })
})
