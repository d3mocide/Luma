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

export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso))
}
