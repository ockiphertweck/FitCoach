import type { Lang } from "@fitcoach/shared"
import { de } from "./de"
import { type Dict, en } from "./en"

export type { Dict }

export function getDict(lang: Lang): Dict {
  return lang === "de" ? de : en
}

export function localeOf(lang: Lang): "de-DE" | "en-GB" {
  return lang === "de" ? "de-DE" : "en-GB"
}

// API keeps returning its English messages / codes; the frontend translates the known ones.
const API_ERRORS: Record<string, keyof Dict["errors"]> = {
  "Invalid email or password": "invalidCredentials",
  "User already exists. FitCoach is single-user.": "userExists",
  "Recap generation failed": "recapFailed",
  key_invalid: "keyInvalid",
  "No Claude API key configured. Add one in Settings.": "noApiKey",
  not_connected: "notConnected",
  "Activity not found": "activityNotFound",
  "Session not found": "sessionNotFound",
  "User not found": "userNotFound",
}

export function translateApiError(message: string, t: Dict): string {
  return t.errors[Object.hasOwn(API_ERRORS, message) ? API_ERRORS[message] : "generic"]
}
