import { describe, it, expect } from 'vitest'
import { scoreDay, calorieState } from '../lib/streak'

// Mirrors backend/tests/test_streak.py — if the rule changes, change both.
const TARGETS = { cal: 2000, sat: 15, fib: 20, sod: 2300 }

describe('calorie band (asymmetric)', () => {
  it('counts intake at or moderately under target', () => {
    expect(calorieState(2000, 2000)).toBe('met')
    expect(calorieState(1750, 2000)).toBe('met') // 12.5% under
    expect(calorieState(1700, 2000)).toBe('met') // exactly 15% under
  })

  it('flags intake far under target', () => {
    expect(calorieState(919, 2000)).toBe('missed') // below the 15% floor
  })

  it('forgives 15% under but not 15% over', () => {
    expect(calorieState(2300, 2000)).toBe('missed') // 15% over
    expect(calorieState(2200, 2000)).toBe('met') // exactly 10% over
    expect(calorieState(2201, 2000)).toBe('missed')
  })

  it('is untracked when no target set', () => {
    expect(calorieState(2000, null)).toBe('untracked')
  })
})

describe('scoreDay', () => {
  it('on track at 3 of 4 (fiber missed)', () => {
    const s = scoreDay({ cal: 2000, sat: 10, fib: 0, sod: 10 }, TARGETS)
    expect(s.targetsMet).toBe(3)
    expect(s.targetsPossible).toBe(4)
    expect(s.onTrack).toBe(true)
  })

  it('not on track at 2 of 4', () => {
    const s = scoreDay({ cal: 2000, sat: 10, fib: 0, sod: 9999 }, TARGETS)
    expect(s.targetsMet).toBe(2)
    expect(s.onTrack).toBe(false)
  })

  it('excludes an unset target instead of counting it against you', () => {
    const targets = { cal: 2000, sat: 15, fib: null, sod: 2300 }
    const s = scoreDay({ cal: 2000, sat: 10, fib: 0, sod: 10 }, targets)
    expect(s.fib).toBe('untracked')
    expect(s.targetsPossible).toBe(3)
    expect(s.targetsMet).toBe(3)
    expect(s.onTrack).toBe(true)
  })

  it('requires all targets when fewer than three are set', () => {
    const targets = { cal: 2000, sat: 15, fib: null, sod: null }
    expect(scoreDay({ cal: 2000, sat: 10 }, targets).onTrack).toBe(true)
    expect(scoreDay({ cal: 2000, sat: 99 }, targets).onTrack).toBe(false)
  })

  it('is never on track with no targets configured', () => {
    const s = scoreDay({ cal: 2000 }, { cal: null, sat: null, fib: null, sod: null })
    expect(s.targetsPossible).toBe(0)
    expect(s.onTrack).toBe(false)
  })
})
