"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

interface Props {
  error: Error & { digest?: string }
  reset: () => void
  title: string
  fullScreen?: boolean
}

export function ErrorBoundary({ error, reset, title, fullScreen }: Props) {
  const inner = (
    <div
      className={`flex flex-col items-center ${fullScreen ? "" : "min-h-[400px]"} justify-center gap-4`}
    >
      <Alert variant="destructive" className="max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  )

  if (fullScreen) {
    return <div className="flex items-center justify-center min-h-screen">{inner}</div>
  }

  return inner
}
