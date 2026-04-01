import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-64 w-full rounded-lg" />
      ))}
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}
