import { Nav } from "@/components/nav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden relative z-10">
      <Nav />
      <main className="flex flex-col flex-1 min-h-0 overflow-y-auto w-full max-w-[640px] mx-auto px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pt-24 md:pb-10">
        {children}
      </main>
    </div>
  )
}
