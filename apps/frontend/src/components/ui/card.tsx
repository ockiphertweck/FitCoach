import { cn } from "@/lib/utils"
import * as React from "react"

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[20px] border-0 bg-card p-4 text-card-foreground shadow-none",
        className
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 pb-3", className)} {...props} />
  )
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("", className)} {...props} />
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center pt-3", className)} {...props} />
  )
)
CardFooter.displayName = "CardFooter"

const metricColors = {
  fatigue: "text-metric-fatigue",
  fitness: "text-metric-fitness",
  form: "text-metric-form",
  coach: "text-metric-coach",
  sleep: "text-metric-sleep",
  hrv: "text-metric-hrv",
  battery: "text-metric-battery",
  stress: "text-metric-stress",
  calories: "text-metric-calories",
} as const

function MetricLabel({
  color,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { color: keyof typeof metricColors }) {
  return (
    <span
      className={cn(
        "text-xs font-semibold uppercase tracking-wide",
        metricColors[color],
        className
      )}
      {...props}
    >
      <span aria-hidden="true">● </span>
      {children}
    </span>
  )
}

export { MetricLabel, Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
