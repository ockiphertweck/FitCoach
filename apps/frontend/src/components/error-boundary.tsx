"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { translateApiError } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/client"
import { AlertCircle } from "lucide-react"

interface Props {
  error: Error & { digest?: string }
  reset: () => void
  title: string
  fullScreen?: boolean
}

export function ErrorBoundary({ error, reset, title, fullScreen }: Props) {
  const { t } = useI18n()
  const inner = (
    <div
      className={`flex flex-col items-center ${fullScreen ? "" : "min-h-[400px]"} justify-center gap-4`}
    >
      <Alert variant="destructive" className="max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{translateApiError(error.message, t)}</AlertDescription>
      </Alert>
      <Button onClick={reset} variant="outline">
        {t.errors.tryAgain}
      </Button>
    </div>
  )

  if (fullScreen) {
    return <div className="flex items-center justify-center min-h-screen">{inner}</div>
  }

  return inner
}
