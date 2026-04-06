"use client"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { useMutation } from "@tanstack/react-query"
import { Dumbbell, Eye, EyeOff } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    api.get<{ setup: boolean }>("/auth/status").then(({ setup }) => {
      if (!setup) router.replace("/setup")
    })
  }, [router])

  const loginMutation = useMutation({
    mutationFn: () => api.post("/auth/login", { email, password }),
    onSuccess: () => router.replace("/"),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loginMutation.mutate()
  }

  return (
    <div className="w-full max-w-sm px-4">
      {/* Glass card */}
      <div className="rounded-2xl bg-white/60 backdrop-blur-2xl border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_24px_64px_rgba(100,120,200,0.18),0_4px_12px_rgba(0,0,0,0.06)] p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_4px_20px_rgba(59,130,246,0.45)] mb-4">
            <Dumbbell className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your FitCoach account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm text-foreground/80">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm text-foreground/80">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {loginMutation.isError && (
            <Alert variant="destructive" className="bg-red-500/10 border-red-500/20 text-red-300">
              <AlertDescription>{loginMutation.error.message}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full mt-2"
            disabled={loginMutation.isPending || !email || !password}
          >
            {loginMutation.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  )
}
