import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] gap-4">
      <Skeleton className="h-16 w-full" />
      <div className="flex-1 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-3/4" style={{ marginLeft: i % 2 === 0 ? "auto" : 0 }} />
        ))}
      </div>
      <Skeleton className="h-16 w-full" />
    </div>
  )
}
