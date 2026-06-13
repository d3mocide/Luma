// A calm, time-of-day hydration nudge. Shows a gentle pace hint only when the
// user is meaningfully behind for this point in the day — never scolds, never
// nags before the day has really started. Returns null when no nudge is warranted.

// Waking window the daily goal is paced across (local hours).
const WINDOW_START = 8
const WINDOW_END = 22

function partOfDay(hour: number): string {
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

export function hydrationNudge(
  args: { totalMl: number; goalMl: number; glassMl: number; goalMet: boolean },
  now: Date = new Date(),
): string | null {
  const { totalMl, goalMl, glassMl, goalMet } = args
  if (goalMet || goalMl <= 0 || glassMl <= 0) return null

  const hour = now.getHours() + now.getMinutes() / 60
  if (hour < WINDOW_START || hour > WINDOW_END) return null

  const expectedPct = (hour - WINDOW_START) / (WINDOW_END - WINDOW_START)
  const expectedMl = expectedPct * goalMl
  // Only nudge once the user is behind by more than half a glass — small gaps
  // aren't worth a mention.
  if (totalMl >= expectedMl - glassMl * 0.5) return null

  const glasses = Math.round(totalMl / glassMl)
  const goalGlasses = Math.max(1, Math.round(goalMl / glassMl))
  return `${partOfDay(hour)} — ${glasses} of ${goalGlasses} glasses, room for more`
}
