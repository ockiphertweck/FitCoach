"use client"

import { usePathname } from "next/navigation"

const AUTH_PATHS = ["/login", "/setup"]

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuth = AUTH_PATHS.some((p) => pathname.startsWith(p))

  return (
    <main
      className={`flex flex-col flex-1 min-h-0 overflow-y-auto w-full max-w-screen-2xl mx-auto px-6 pb-10 ${
        isAuth ? "py-8" : "pt-16"
      }`}
    >
      {children}
    </main>
  )
}
