// Streak day-scoring — mirrors the backend in luma/services/streak.py. The Today
// flame (StreakStrip) and the per-day history (StreakHistorySheet) both grade days
// through here so they can never disagree with each other or with the server.
//
// Calories use an asymmetric band: a day still counts when intake is UNDER target
// (the point of a deficit) down to 25% below, but only 10% above. Saturated fat and
// sodium are ceilings (≤ target); soluble fiber is a floor (≥ target). A target the
// user hasn't set is 'untracked' — excluded from the tally, never counted as a miss.

export const CAL_UNDER_TOL = 0.75
export const CAL_OVER_TOL = 1.1
export const CEILING_GRACE = 1.10   // sat fat, sodium: up to 10% over cap still counts
export const FLOOR_TOLERANCE = 0.90 // soluble fiber: down to 10% under floor still counts
export const ON_TRACK_MIN = 3

export type MetricState = 'met' | 'missed' | 'untracked'

type Num = number | null | undefined

export function calorieState(logged: Num, target: Num): MetricState {
  if (target == null) return 'untracked'
  const l = logged ?? 0
  return l >= target * CAL_UNDER_TOL && l <= target * CAL_OVER_TOL ? 'met' : 'missed'
}

/** Ceiling metric (saturated fat, sodium): met within 10% grace over target. */
export function ceilingState(logged: Num, target: Num): MetricState {
  if (target == null) return 'untracked'
  return (logged ?? 0) <= target * CEILING_GRACE ? 'met' : 'missed'
}

/** Floor metric (soluble fiber): met within 10% grace under target. */
export function floorState(logged: Num, target: Num): MetricState {
  if (target == null) return 'untracked'
  return (logged ?? 0) >= target * FLOOR_TOLERANCE ? 'met' : 'missed'
}

export interface DayInputs {
  cal?: Num
  sat?: Num
  fib?: Num
  sod?: Num
}

export interface DayScore {
  cal: MetricState
  sat: MetricState
  fib: MetricState
  sod: MetricState
  targetsMet: number
  targetsPossible: number
  onTrack: boolean
}

export function scoreDay(logged: DayInputs, targets: DayInputs): DayScore {
  const cal = calorieState(logged.cal, targets.cal)
  const sat = ceilingState(logged.sat, targets.sat)
  const fib = floorState(logged.fib, targets.fib)
  const sod = ceilingState(logged.sod, targets.sod)
  const states = [cal, sat, fib, sod]
  const targetsPossible = states.filter(s => s !== 'untracked').length
  const targetsMet = states.filter(s => s === 'met').length
  const onTrack = targetsPossible > 0 && targetsMet >= Math.min(ON_TRACK_MIN, targetsPossible)
  return { cal, sat, fib, sod, targetsMet, targetsPossible, onTrack }
}
