"use client"

import { cn } from "@/lib/utils"

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  "aria-label": string
  className?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  "aria-label": ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-full bg-muted p-0.5", className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          // biome-ignore lint/a11y/useSemanticElements: styled segmented radio, native input not stylable
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3 py-1 text-sm font-medium text-muted-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            o.value === value && "bg-card text-foreground shadow-sm"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
