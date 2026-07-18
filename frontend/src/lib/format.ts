export function fmt(value: number | null | undefined, decimals = 1, unit = ''): string {
  if (value == null) return '—'
  return `${value.toFixed(decimals)}${unit}`
}

export function fmtWeight(kg: number | null | undefined): string {
  return fmt(kg, 1, ' kg')
}

export function fmtSlope(slope: number | null | undefined): string {
  if (slope == null) return '—'
  const sign = slope > 0 ? '+' : ''
  return `${sign}${slope.toFixed(2)} kg/wk`
}

export function fmtMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h ${m}m`
}

// Like fmtMinutes but omits the hour segment under 60m — for live elapsed-time
// displays (e.g. time since last meal) where "0h 12m" reads as a glitch.
export function fmtElapsed(minutes: number | null | undefined): string {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h < 1 ? `${m}m` : `${h}h ${m}m`
}

export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso))
}

export function getCurrentSlot(): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 16) return 'lunch'
  if (hour >= 16 && hour < 22) return 'dinner'
  return 'snack'
}

