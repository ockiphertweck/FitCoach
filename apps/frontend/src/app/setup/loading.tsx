import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen -ml-16">
      <Skeleton className="w-full max-w-sm h-80 rounded-lg" />
    </div>
  )
}
