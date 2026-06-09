import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fmt, fmtWeight, fmtSlope, fmtMinutes, getCurrentSlot } from '../lib/format'

describe('fmt', () => {
  it('returns em dash for null', () => {
    expect(fmt(null)).toBe('—')
  })

  it('returns em dash for undefined', () => {
    expect(fmt(undefined)).toBe('—')
  })

  it('formats number with default decimals', () => {
    expect(fmt(1.567)).toBe('1.6')
  })

  it('formats number with specified decimals', () => {
    expect(fmt(1.567, 2)).toBe('1.57')
  })

  it('appends unit when provided', () => {
    expect(fmt(1.5, 1, ' kg')).toBe('1.5 kg')
  })
})

describe('fmtWeight', () => {
  it('returns em dash for null', () => {
    expect(fmtWeight(null)).toBe('—')
  })

  it('returns em dash for undefined', () => {
    expect(fmtWeight(undefined)).toBe('—')
  })

  it('formats a weight with kg unit', () => {
    expect(fmtWeight(1.5)).toBe('1.5 kg')
  })
})

describe('fmtSlope', () => {
  it('returns em dash for null', () => {
    expect(fmtSlope(null)).toBe('—')
  })

  it('returns em dash for undefined', () => {
    expect(fmtSlope(undefined)).toBe('—')
  })

  it('formats positive slope with + sign', () => {
    expect(fmtSlope(0.5)).toBe('+0.50 kg/wk')
  })

  it('formats negative slope with - sign', () => {
    expect(fmtSlope(-0.5)).toBe('-0.50 kg/wk')
  })

  it('formats zero slope without sign', () => {
    expect(fmtSlope(0)).toBe('0.00 kg/wk')
  })
})

describe('fmtMinutes', () => {
  it('returns em dash for null', () => {
    expect(fmtMinutes(null)).toBe('—')
  })

  it('returns em dash for undefined', () => {
    expect(fmtMinutes(undefined)).toBe('—')
  })

  it('formats 90 minutes as 1h 30m', () => {
    expect(fmtMinutes(90)).toBe('1h 30m')
  })

  it('formats 45 minutes as 0h 45m', () => {
    expect(fmtMinutes(45)).toBe('0h 45m')
  })
})

describe('getCurrentSlot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns breakfast for hour 7', () => {
    vi.setSystemTime(new Date('2026-01-01T07:00:00'))
    expect(getCurrentSlot()).toBe('breakfast')
  })

  it('returns breakfast for hour 5 (boundary)', () => {
    vi.setSystemTime(new Date('2026-01-01T05:00:00'))
    expect(getCurrentSlot()).toBe('breakfast')
  })

  it('returns lunch for hour 12', () => {
    vi.setSystemTime(new Date('2026-01-01T12:00:00'))
    expect(getCurrentSlot()).toBe('lunch')
  })

  it('returns lunch for hour 11 (boundary)', () => {
    vi.setSystemTime(new Date('2026-01-01T11:00:00'))
    expect(getCurrentSlot()).toBe('lunch')
  })

  it('returns dinner for hour 18', () => {
    vi.setSystemTime(new Date('2026-01-01T18:00:00'))
    expect(getCurrentSlot()).toBe('dinner')
  })

  it('returns dinner for hour 16 (boundary)', () => {
    vi.setSystemTime(new Date('2026-01-01T16:00:00'))
    expect(getCurrentSlot()).toBe('dinner')
  })

  it('returns snack for hour 2 (overnight)', () => {
    vi.setSystemTime(new Date('2026-01-01T02:00:00'))
    expect(getCurrentSlot()).toBe('snack')
  })

  it('returns snack for hour 22 (late night boundary)', () => {
    vi.setSystemTime(new Date('2026-01-01T22:00:00'))
    expect(getCurrentSlot()).toBe('snack')
  })
})
