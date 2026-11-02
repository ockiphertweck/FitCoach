"use client"

import { cn } from "@/lib/utils"
import { Activity, BarChart3, Bot, Home, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/coach", icon: Bot, label: "Coach" },
  { href: "/activities", icon: Activity, label: "Activities" },
  { href: "/trends", icon: BarChart3, label: "Trends" },
]

export function Nav() {
  const pathname = usePathname()
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))

  const item = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-full transition-colors",
      active ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
    )

  return (
    <nav
      aria-label="Main"
      className="glass fixed z-50 flex items-center gap-1 rounded-full p-1.5 left-1/2 -translate-x-1/2 bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:bottom-auto md:top-4"
    >
      {tabs.map(({ href, icon: Icon, label }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              item(active),
              "flex-col px-3.5 py-1.5 text-[11px] md:flex-row md:px-4 md:text-sm font-medium"
            )}
          >
            <Icon className="h-5 w-5 md:h-4 md:w-4" />
            <span>{label}</span>
          </Link>
        )
      })}
      <Link
        href="/settings"
        aria-label="Settings"
        aria-current={isActive("/settings") ? "page" : undefined}
        className={cn(item(isActive("/settings")), "hidden md:flex px-3 py-2 text-sm font-medium")}
      >
        <Settings className="h-4 w-4" />
        <span className="sr-only">Settings</span>
      </Link>
    </nav>
  )
}
