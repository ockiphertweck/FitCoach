import { describe, expect, it } from "vitest"
import { decrypt, encrypt } from "./encryption.js"

describe("encrypt / decrypt", () => {
  it("round-trips a plain string", () => {
    const plaintext = "hello world"
    expect(decrypt(encrypt(plaintext))).toBe(plaintext)
  })

  it("round-trips an API key", () => {
    const key = "sk-ant-api03-abc123XYZ"
    expect(decrypt(encrypt(key))).toBe(key)
  })

  it("produces different ciphertexts for the same input (random IV)", () => {
    const plaintext = "same input"
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext))
  })

  it("ciphertext has the iv:tag:data format", () => {
    const parts = encrypt("test").split(":")
    expect(parts).toHaveLength(3)
    parts.forEach((p) => expect(p.length).toBeGreaterThan(0))
  })

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("secret")
    const tampered = encrypted.slice(0, -4) + "XXXX"
    expect(() => decrypt(tampered)).toThrow()
  })

  it("throws on malformed input", () => {
    expect(() => decrypt("notvalid")).toThrow("Invalid encrypted value format")
  })

  it("round-trips unicode content", () => {
    const text = "🏃 pace: 4:30/km — Läufer"
    expect(decrypt(encrypt(text))).toBe(text)
  })
})
