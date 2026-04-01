import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Nav } from "@/components/nav"
import { PostHogProvider } from "@/components/posthog-provider"
import { QueryProvider } from "@/lib/query-client"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "FitCoach",
  description: "Self-hosted AI training coach powered by Strava and Claude",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PostHogProvider>
          <QueryProvider>
            <div className="flex min-h-screen">
              <Nav />
              <main className="ml-16 flex-1 p-6">{children}</main>
            </div>
          </QueryProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
