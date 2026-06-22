// Pure analytics over a single day's nutrition map + the user's DRI. Kept free of
// React so it can be unit-tested and reused by the coverage meter, the
// deficiency/surplus callouts, and the coach hand-off seed.

import type { Dri } from './api'
import { MICRONUTRIENT_ROWS, NUTRIENT_LABELS } from './nutrient-rows'

// A micronutrient counts as "covered" once intake reaches 90% of its RDA — the
// same 10% floor grace the streak fiber check uses, so "met" reads consistently.
export const COVERAGE_MET = 0.9
// Below 50% of a min-target reads as a genuine shortfall worth surfacing.
const LOW_THRESHOLD = 0.5

export interface Coverage {
  hit: number
  total: number
}

export type FlagKind = 'low' | 'high'

export interface NutrientFlag {
  key: string
  label: string
  unit: string
  kind: FlagKind
  value: number
  target: number
  pct: number
}

type Nutrition = Record<string, number>

/** Fraction of micronutrients (with a DRI) whose intake reached the RDA floor. */
export function computeCoverage(nutrition: Nutrition, dri: Dri | null | undefined): Coverage {
  let hit = 0
  let total = 0
  for (const row of MICRONUTRIENT_ROWS) {
    const entry = dri?.[row.key]
    if (!entry || entry.rda <= 0) continue
    total += 1
    if ((nutrition[row.key] ?? 0) >= entry.rda * COVERAGE_MET) hit += 1
  }
  return { hit, total }
}

function labelFor(key: string): { label: string; unit: string } {
  const row = NUTRIENT_LABELS[key]
  return { label: row?.label ?? key, unit: row?.unit ?? '' }
}

/**
 * Surface the most actionable gaps for a day: min-targets that came up short
 * (only when *some* intake was logged, so uncaptured micros from voice/photo
 * logs don't read as a deficiency) and max-targets that were exceeded.
 */
export function computeFlags(
  nutrition: Nutrition,
  dri: Dri | null | undefined,
  maxFlags = 3,
): NutrientFlag[] {
  if (!dri) return []

  const lows: NutrientFlag[] = []
  const highs: NutrientFlag[] = []

  for (const [key, entry] of Object.entries(dri)) {
    if (!entry || entry.rda <= 0) continue
    const value = nutrition[key] ?? 0
    const pct = (value / entry.rda) * 100
    const { label, unit } = labelFor(key)

    if (entry.direction === 'min') {
      if (value > 0 && pct < LOW_THRESHOLD * 100) {
        lows.push({ key, label, unit, kind: 'low', value, target: entry.rda, pct })
      }
    } else if (entry.direction === 'max') {
      if (pct > 100) {
        highs.push({ key, label, unit, kind: 'high', value, target: entry.rda, pct })
      }
    }
  }

  lows.sort((a, b) => a.pct - b.pct)   // most deficient first
  highs.sort((a, b) => b.pct - a.pct)  // most over first

  // Interleave so a noisy set of one kind can't crowd out the other entirely.
  const out: NutrientFlag[] = []
  let i = 0
  while (out.length < maxFlags && (i < lows.length || i < highs.length)) {
    if (i < lows.length) out.push(lows[i])
    if (out.length < maxFlags && i < highs.length) out.push(highs[i])
    i += 1
  }
  return out
}

/** Build a coach thread seed from the day's gaps, for the "Ask Luma" hand-off. */
export function buildCoachSeed(dateLabel: string, flags: NutrientFlag[]): string {
  if (flags.length === 0) {
    return `Walk me through my nutrient breakdown for ${dateLabel}. Anything I should adjust?`
  }
  const low = flags.filter(f => f.kind === 'low').map(f => f.label)
  const high = flags.filter(f => f.kind === 'high').map(f => f.label)
  const parts: string[] = []
  if (low.length) parts.push(`low on ${low.join(', ')}`)
  if (high.length) parts.push(`over on ${high.join(', ')}`)
  return `On ${dateLabel} I was ${parts.join(' and ')}. What foods would help me close these gaps?`
}
