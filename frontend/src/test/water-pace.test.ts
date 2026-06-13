import { describe, it, expect } from 'vitest'
import { hydrationNudge } from '../lib/water-pace'

const at = (hour: number, minute = 0) => {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

describe('hydrationNudge', () => {
  it('nudges when behind pace mid-afternoon', () => {
    // 3pm is halfway through the 8–22 window: expected ~1000ml of 2000.
    const msg = hydrationNudge({ totalMl: 250, goalMl: 2000, glassMl: 250, goalMet: false }, at(15))
    expect(msg).toBe('Afternoon — 1 of 8 glasses, room for more')
  })

  it('uses the morning label before noon', () => {
    const msg = hydrationNudge({ totalMl: 0, goalMl: 2000, glassMl: 250, goalMet: false }, at(11))
    expect(msg).toMatch(/^Morning —/)
  })

  it('uses the evening label after 5pm', () => {
    const msg = hydrationNudge({ totalMl: 500, goalMl: 2000, glassMl: 250, goalMet: false }, at(20))
    expect(msg).toMatch(/^Evening —/)
  })

  it('is silent when on pace', () => {
    // 3pm with 1000ml logged is exactly on pace — no nudge.
    expect(hydrationNudge({ totalMl: 1000, goalMl: 2000, glassMl: 250, goalMet: false }, at(15))).toBeNull()
  })

  it('is silent before the waking window starts', () => {
    expect(hydrationNudge({ totalMl: 0, goalMl: 2000, glassMl: 250, goalMet: false }, at(6))).toBeNull()
  })

  it('is silent once the goal is met', () => {
    expect(hydrationNudge({ totalMl: 2000, goalMl: 2000, glassMl: 250, goalMet: true }, at(15))).toBeNull()
  })

  it('scales glass counts with a larger glass size', () => {
    const msg = hydrationNudge({ totalMl: 0, goalMl: 2000, glassMl: 500, goalMet: false }, at(15))
    expect(msg).toBe('Afternoon — 0 of 4 glasses, room for more')
  })
})
