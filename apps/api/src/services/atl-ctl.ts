import type { Activity } from "../db/schema.js"

export interface TrainingLoadResult {
  atl: number
  ctl: number
  tsb: number
}

function sessionLoad(activity: Activity): number {
  const hours = (activity.durationSeconds ?? 0) / 3600
  let intensity: number

  if (activity.perceivedExertion !== null && activity.perceivedExertion !== undefined) {
    intensity = activity.perceivedExertion
  } else if (activity.averageHeartRate !== null && activity.averageHeartRate !== undefined) {
    intensity = activity.averageHeartRate / 10
  } else {
    intensity = 5
  }

  return hours * intensity
}

export function calculateTrainingLoad(activities: Activity[]): TrainingLoadResult {
  if (activities.length === 0) {
    return { atl: 0, ctl: 0, tsb: 0 }
  }

  const now = new Date()
  const ATL_DAYS = 7
  const CTL_DAYS = 42
  const alphaAtl = 2 / (ATL_DAYS + 1)
  const alphaCtl = 2 / (CTL_DAYS + 1)

  // Build a map of daily load for the past CTL_DAYS days
  const dailyLoad: Map<string, number> = new Map()

  for (const activity of activities) {
    const dateKey = activity.startDate.toISOString().slice(0, 10)
    dailyLoad.set(dateKey, (dailyLoad.get(dateKey) ?? 0) + sessionLoad(activity))
  }

  // Walk from CTL_DAYS ago to today, applying EWMA
  let atl = 0
  let ctl = 0

  for (let daysAgo = CTL_DAYS; daysAgo >= 0; daysAgo--) {
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    const dateKey = d.toISOString().slice(0, 10)
    const load = dailyLoad.get(dateKey) ?? 0

    atl = alphaAtl * load + (1 - alphaAtl) * atl
    ctl = alphaCtl * load + (1 - alphaCtl) * ctl
  }

  return {
    atl: Math.round(atl * 10) / 10,
    ctl: Math.round(ctl * 10) / 10,
    tsb: Math.round((ctl - atl) * 10) / 10,
  }
}
