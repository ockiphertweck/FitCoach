import { describe, expect, it } from "vitest"
import { parseLang, resolveLanguage } from "./lang"

describe("resolveLanguage", () => {
  it("cookie wins over Accept-Language", () => {
    expect(resolveLanguage("de", "en-US")).toBe("de")
    expect(resolveLanguage("en", "de-DE")).toBe("en")
  })
  it("maps German variants to de", () => {
    expect(resolveLanguage(undefined, "de-AT,de;q=0.9")).toBe("de")
    expect(resolveLanguage(undefined, "de-CH")).toBe("de")
  })
  it("first supported language in header order wins", () => {
    expect(resolveLanguage(undefined, "fr-FR,de;q=0.8")).toBe("de")
    expect(resolveLanguage(undefined, "en-US,de;q=0.9")).toBe("en")
  })
  it("falls back to en", () => {
    expect(resolveLanguage(undefined, "fr")).toBe("en")
    expect(resolveLanguage(undefined, "")).toBe("en")
    expect(resolveLanguage(undefined, null)).toBe("en")
  })
  it("invalid cookie means automatic", () => {
    expect(resolveLanguage("fr", "de-DE")).toBe("de")
  })
})

describe("parseLang", () => {
  it("returns null for empty or invalid values", () => {
    expect(parseLang("")).toBeNull()
    expect(parseLang(undefined)).toBeNull()
    expect(parseLang("fr")).toBeNull()
    expect(parseLang("de")).toBe("de")
  })
})
