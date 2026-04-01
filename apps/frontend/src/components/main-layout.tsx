"use client"

import { usePathname } from "next/navigation"

const AUTH_PATHS = ["/login", "/setup"]

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuth = AUTH_PATHS.some((p) => pathname.startsWith(p))

  return (
    <main className={`flex-1 p-6 ${isAuth ? "" : "ml-16"}`}>{children}</main>
  )
}
