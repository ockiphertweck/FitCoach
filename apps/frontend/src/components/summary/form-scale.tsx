export function formLabel(tsb: number) {
  return tsb > 5 ? "Fresh" : tsb < -10 ? "Fatigued" : "Balanced"
}

export function FormScale({ tsb }: { tsb: number }) {
  const pos = Math.min(1, Math.max(0, (tsb + 30) / 60)) * 100
  return (
    <div className="relative h-2 rounded-full bg-[linear-gradient(to_right,hsl(var(--destructive)),#ffcc00,hsl(var(--metric-form)),hsl(var(--metric-fitness)))]">
      <div
        data-testid="form-marker"
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-card shadow"
        style={{ left: `${pos}%` }}
      />
    </div>
  )
}
