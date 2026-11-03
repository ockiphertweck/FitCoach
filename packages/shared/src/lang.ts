import { z } from "zod"

export const LangSchema = z.enum(["de", "en"])
export type Lang = z.infer<typeof LangSchema>

export const LANG_COOKIE = "fitcoach_lang"

/** null = automatic (missing or invalid value). */
export function parseLang(value: string | undefined): Lang | null {
  const r = LangSchema.safeParse(value)
  return r.success ? r.data : null
}

export function resolveLanguage(
  cookie: string | undefined,
  acceptLanguage: string | null | undefined
): Lang {
  const fromCookie = parseLang(cookie)
  if (fromCookie) return fromCookie
  for (const part of (acceptLanguage ?? "").split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase()
    if (tag.startsWith("de")) return "de"
    if (tag.startsWith("en")) return "en"
  }
  return "en"
}
