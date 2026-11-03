import { LANG_COOKIE, type Lang, resolveLanguage } from "@fitcoach/shared"
import { cookies, headers } from "next/headers"
import { getDict, localeOf } from "."

export async function getLang(): Promise<Lang> {
  const [c, h] = await Promise.all([cookies(), headers()])
  return resolveLanguage(c.get(LANG_COOKIE)?.value, h.get("accept-language"))
}

export async function getI18n() {
  const lang = await getLang()
  return { lang, t: getDict(lang), locale: localeOf(lang) }
}
