"use client"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { translateApiError } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/client"
import { useMutation } from "@tanstack/react-query"
import { Dumbbell, Eye, EyeOff } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function SetupPage() {
  const router = useRouter()
  const { t } = useI18n()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [validationError, setValidationError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const setupMutation = useMutation({
    mutationFn: () => api.post("/auth/setup", { email, password }),
    onSuccess: () => router.replace("/"),
    onError: (err: Error) => {
      if (err.message.includes("already exists")) {
        router.replace("/login")
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError("")
    if (password !== confirm) {
      setValidationError(t.auth.passwordMismatch)
      return
    }
    if (password.length < 8) {
      setValidationError(t.auth.passwordTooShort)
      return
    }
    setupMutation.mutate()
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-[20px] bg-card p-8">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-4">
            <Dumbbell className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{t.auth.setupTitle}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.auth.setupSubtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.auth.emailPlaceholder}
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">{t.auth.password}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.auth.minPassword}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">{t.auth.confirmPassword}</Label>
            <div className="relative">
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t.auth.repeatPassword}
                required
                className="pr-10"
              />
            </div>
          </div>

          {(validationError || setupMutation.isError) && (
            <Alert variant="destructive">
              <AlertDescription>
                {validationError ||
                  (setupMutation.error && translateApiError(setupMutation.error.message, t))}
              </AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full mt-2 h-11"
            disabled={setupMutation.isPending || !email || !password || !confirm}
          >
            {setupMutation.isPending ? t.auth.creatingAccount : t.auth.createAccount}
          </Button>
        </form>
      </div>
    </div>
  )
}
