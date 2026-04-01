"use client"

import { Activity, BarChart3, Bot, Home, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const links = [
  { href: "/", icon: Home, label: "Dashboard" },
  { href: "/coach", icon: Bot, label: "Coach" },
  { href: "/activities", icon: Activity, label: "Activities" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/settings", icon: Settings, label: "Settings" },
]

const AUTH_PATHS = ["/login", "/setup"]

export function Nav() {
  const pathname = usePathname()

  if (AUTH_PATHS.some((p) => pathname.startsWith(p))) return null

  return (
    <nav className="fixed left-0 top-0 flex h-screen w-16 flex-col items-center border-r bg-card py-4 gap-1">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
        F
      </div>
      {links.map(({ href, icon: Icon, label }) => (
        <Link
          key={href}
          href={href}
          title={label}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-accent",
            pathname === href && "bg-accent text-accent-foreground"
          )}
        >
          <Icon className="h-5 w-5" />
          <span className="sr-only">{label}</span>
        </Link>
      ))}
    </nav>
  )
}
