import { describe, it, expect } from 'vitest'
import { computeCoverage, computeFlags, buildCoachSeed } from '../lib/nutrient-coverage'
import type { Dri } from '../lib/api'

const dri: Dri = {
  vitamin_c_mg:  { rda: 90,   unit: 'mg',  direction: 'min' },
  iron_mg:       { rda: 18,   unit: 'mg',  direction: 'min' },
  calcium_mg:    { rda: 1000, unit: 'mg',  direction: 'min' },
  protein_g:     { rda: 120,  unit: 'g',   direction: 'min' },
  sodium_mg:     { rda: 2300, unit: 'mg',  direction: 'max' },
  saturated_fat_g: { rda: 15, unit: 'g',   direction: 'max' },
}

describe('computeCoverage', () => {
  it('counts only micronutrients with a DRI, met at the 90% floor', () => {
    // vitamin_c 81/90 = 90% → met; iron 9/18 = 50% → missed; calcium 0 → missed.
    // protein/sodium/sat fat are not micronutrients and never enter the tally.
    const cov = computeCoverage({ vitamin_c_mg: 81, iron_mg: 9, calcium_mg: 0 }, dri)
    expect(cov).toEqual({ hit: 1, total: 3 })
  })

  it('returns zero total when no DRI is available', () => {
    expect(computeCoverage({ vitamin_c_mg: 100 }, null)).toEqual({ hit: 0, total: 0 })
  })
})

describe('computeFlags', () => {
  it('flags min-targets below 50% only when some intake was logged', () => {
    // iron 5/18 = 28% with intake → low. calcium 0 → uncaptured, not flagged.
    const flags = computeFlags({ iron_mg: 5, calcium_mg: 0, vitamin_c_mg: 90 }, dri)
    const keys = flags.map(f => f.key)
    expect(keys).toContain('iron_mg')
    expect(keys).not.toContain('calcium_mg')
    expect(keys).not.toContain('vitamin_c_mg') // 100% → fine
  })

  it('flags max-targets exceeded', () => {
    const flags = computeFlags({ sodium_mg: 3000 }, dri)
    const sodium = flags.find(f => f.key === 'sodium_mg')
    expect(sodium?.kind).toBe('high')
    expect(Math.round(sodium!.pct)).toBe(130)
  })

  it('caps the number of flags and interleaves low/high', () => {
    const flags = computeFlags(
      { iron_mg: 1, vitamin_c_mg: 5, sodium_mg: 5000, saturated_fat_g: 40 },
      dri,
      3,
    )
    expect(flags).toHaveLength(3)
    expect(flags.some(f => f.kind === 'low')).toBe(true)
    expect(flags.some(f => f.kind === 'high')).toBe(true)
  })

  it('returns nothing without a DRI', () => {
    expect(computeFlags({ iron_mg: 1 }, undefined)).toEqual([])
  })
})

describe('buildCoachSeed', () => {
  it('summarises low and high gaps', () => {
    const flags = computeFlags({ iron_mg: 5, sodium_mg: 3000 }, dri)
    const seed = buildCoachSeed('June 18, 2026', flags)
    expect(seed).toContain('June 18, 2026')
    expect(seed).toContain('low on')
    expect(seed).toContain('over on')
  })

  it('falls back to a generic prompt with no gaps', () => {
    expect(buildCoachSeed('June 18, 2026', [])).toContain('nutrient breakdown')
  })
})
