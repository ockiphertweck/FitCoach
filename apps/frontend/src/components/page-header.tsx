"use client"

import { Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { type ReactNode, useEffect, useState } from "react"

const today = () =>
  new Date()
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })
    .replace(",", "")
    .toUpperCase()

export function PageHeader({
  title,
  subtitle,
  action,
}: { title: string; subtitle?: string; action?: ReactNode }) {
  const [now, setNow] = useState<string>()
  useEffect(() => setNow(today()), [])
  const onSettings = usePathname().startsWith("/settings")
  return (
    <header className="flex items-end justify-between gap-3 pb-4 pt-2">
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">
          {subtitle ?? now ?? "\u00A0"}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {action}
        {!onSettings && (
          <Link
            href="/settings"
            aria-label="Settings"
            className="md:hidden rounded-full p-2 text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-5 w-5" />
          </Link>
        )}
      </div>
    </header>
  )
}
