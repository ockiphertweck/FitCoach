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
  const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!step) return
    e.preventDefault()
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + step + options.length) % options.length]
    onChange(next.value)
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[options.indexOf(next)]?.focus()
  }

  return (
    <div
      onKeyDown={move}
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
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3 py-1 text-sm font-medium text-muted-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
            o.value === value && "bg-card text-foreground shadow-sm"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
