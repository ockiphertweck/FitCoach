export type Theme = "system" | "light" | "dark"

export const THEME_COOKIE = "fitcoach_theme"

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system"
}

/** Client only: persists the choice for a year and applies it immediately. */
export function setThemeCookie(theme: Theme): void {
  document.cookie = `${THEME_COOKIE}=${theme}; max-age=31536000; path=/; samesite=lax`
  const root = document.documentElement
  root.dataset.theme = theme
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  root.classList.toggle("dark", dark)
}
