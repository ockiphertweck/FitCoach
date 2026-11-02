export interface StreamPoint {
  distanceKm: number
  heartrate: number | null
  speedKmh: number | null
  altitudeM: number | null
}

export interface HrZones {
  zone1: number
  zone2: number
  zone3: number
  zone4: number
  zone5: number
}

export function buildStreams(
  input: {
    distanceM: number[]
    heartrate: number[] | null
    speedMs: number[] | null
    altitudeM: number[] | null
  },
  maxHr: number | null
): { points: StreamPoint[]; hrZones: HrZones | null; maxHrUsed: number | null } {
  const { distanceM: distArr, heartrate: hrArr, speedMs: velArr, altitudeM: altArr } = input

  if (distArr.length === 0) return { points: [], hrZones: null, maxHrUsed: null }

  // Compute HR zones from full resolution before downsampling
  let hrZones: HrZones | null = null
  let maxHrUsed: number | null = null

  if (hrArr && hrArr.length > 0) {
    const effectiveMaxHr = maxHr ?? Math.round(Math.max(...hrArr) / 0.95)
    maxHrUsed = effectiveMaxHr
    const zones: HrZones = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 }
    for (const hr of hrArr) {
      const pct = hr / effectiveMaxHr
      if (pct < 0.6) zones.zone1++
      else if (pct < 0.7) zones.zone2++
      else if (pct < 0.8) zones.zone3++
      else if (pct < 0.9) zones.zone4++
      else zones.zone5++
    }
    hrZones = zones
  }

  // Build full points array then downsample to max 500
  const full: StreamPoint[] = distArr.map((d, i) => ({
    distanceKm: Math.round(d / 10) / 100,
    heartrate: hrArr ? (hrArr[i] ?? null) : null,
    speedKmh: velArr ? (velArr[i] != null ? Math.round(velArr[i] * 3.6 * 10) / 10 : null) : null,
    altitudeM: altArr ? (altArr[i] ?? null) : null,
  }))

  const step = Math.max(1, Math.ceil(full.length / 500))
  const points = full.filter((_, i) => i % step === 0)

  return { points, hrZones, maxHrUsed }
}
