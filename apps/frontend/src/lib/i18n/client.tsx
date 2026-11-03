"use client"

import { LANG_COOKIE, type Lang } from "@fitcoach/shared"
import { createContext, useContext } from "react"
import { getDict, localeOf } from "."

// Only `lang` crosses the server/client boundary (dictionaries hold functions); it is resolved on
// the server, so client code never re-resolves from navigator.language and hydration matches.
const LangContext = createContext<Lang>("en")

export function I18nProvider({
  lang,
  children,
}: Readonly<{ lang: Lang; children: React.ReactNode }>) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export function useI18n() {
  const lang = useContext(LangContext)
  return { lang, t: getDict(lang), locale: localeOf(lang) }
}

/** Client only: "auto" removes the cookie so the browser language applies again. */
export function setLangCookie(lang: Lang | "auto"): void {
  document.cookie =
    lang === "auto"
      ? `${LANG_COOKIE}=; max-age=0; path=/; samesite=lax`
      : `${LANG_COOKIE}=${lang}; max-age=31536000; path=/; samesite=lax`
}
