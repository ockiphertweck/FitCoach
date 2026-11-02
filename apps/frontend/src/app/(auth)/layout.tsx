export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center bg-background px-4 py-8">
      {children}
    </div>
  )
}
