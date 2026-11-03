"use client"

import { ErrorBoundary } from "@/components/error-boundary"
import { useI18n } from "@/lib/i18n/client"

export default function ErrorPage({
  error,
  reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n()
  return <ErrorBoundary error={error} reset={reset} title={t.errors.pageFailed} />
}
