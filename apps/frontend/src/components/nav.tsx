"use client"

import { cn } from "@/lib/utils"
import { Activity, BarChart3, Bot, Home, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const links = [
  { href: "/", icon: Home, label: "Dashboard" },
  { href: "/coach", icon: Bot, label: "Coach" },
  { href: "/activities", icon: Activity, label: "Activities" },
  { href: "/analytics", icon: BarChart3, label: "Reports" },
  { href: "/settings", icon: Settings, label: "Settings" },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 glass-strong flex items-center px-6 gap-6">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white font-bold text-sm shadow-[0_2px_14px_rgba(59,130,246,0.45)] shrink-0">
        F
      </div>

      <div className="flex items-center gap-1">
        {links.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all duration-200",
                active
                  ? "bg-primary/10 text-primary shadow-[0_0_18px_rgba(59,130,246,0.18)] border border-primary/18"
                  : "text-foreground/55 hover:text-foreground hover:bg-white/55"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
