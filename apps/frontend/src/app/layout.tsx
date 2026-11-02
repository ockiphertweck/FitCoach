import { PostHogProvider } from "@/components/posthog-provider"
import { QueryProvider } from "@/lib/query-client"
import { THEME_COOKIE, parseTheme } from "@/lib/theme"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import "./globals.css"

export const metadata: Metadata = {
  title: "FitCoach",
  description: "Self-hosted AI training coach powered by Garmin and Claude",
}

// Runs before first paint so "system" never flashes the wrong scheme; always present so switching to System in-session tracks the OS.
const SYSTEM_THEME_SCRIPT = `(function(){var m=matchMedia("(prefers-color-scheme: dark)"),r=document.documentElement;function a(){if(r.dataset.theme==="system")r.classList.toggle("dark",m.matches)}a();m.addEventListener("change",a)})()`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <html
      lang="en"
      className={theme === "dark" ? "dark" : undefined}
      data-theme={theme}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static constant, no user input */}
        <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />
      </head>
      <body>
        <PostHogProvider>
          <QueryProvider>{children}</QueryProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
