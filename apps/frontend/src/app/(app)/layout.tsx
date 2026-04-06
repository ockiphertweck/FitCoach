import { Nav } from "@/components/nav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden relative z-10">
      <Nav />
      <main className="flex flex-col flex-1 min-h-0 overflow-y-auto w-full max-w-screen-2xl mx-auto px-6 pt-16 pb-10">
        {children}
      </main>
    </div>
  )
}
