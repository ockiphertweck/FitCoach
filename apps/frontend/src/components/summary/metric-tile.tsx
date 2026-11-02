import { Card, MetricLabel } from "@/components/ui/card"
import type { ComponentProps } from "react"

export function MetricTile({
  label,
  color,
  value,
  caption,
}: Readonly<{
  label: string
  color: ComponentProps<typeof MetricLabel>["color"]
  value: number | undefined
  caption: string
}>) {
  return (
    <Card>
      <MetricLabel color={color}>{label}</MetricLabel>
      <p className="mt-1 text-4xl font-bold tabular-nums">{value ?? "—"}</p>
      <p className="text-xs text-muted-foreground">{caption}</p>
    </Card>
  )
}
