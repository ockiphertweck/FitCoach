import { buttonVariants } from "@/components/ui/button"
import { getI18n } from "@/lib/i18n/server"
import Link from "next/link"

export default async function NotFound() {
  const { t } = await getI18n()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">{t.errors.notFound}</h1>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        {t.errors.backHome}
      </Link>
    </div>
  )
}
