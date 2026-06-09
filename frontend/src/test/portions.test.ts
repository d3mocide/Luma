import { describe, it, expect } from 'vitest'
import { densityForFood, unitToGrams, defaultQtyForUnit } from '../lib/portions'

describe('densityForFood', () => {
  it('returns 0.92 for olive oil', () => {
    expect(densityForFood('olive oil')).toBe(0.92)
  })

  it('returns 0.92 for a generic oil name', () => {
    expect(densityForFood('canola oil')).toBe(0.92)
  })

  it('returns 1.42 for honey', () => {
    expect(densityForFood('honey')).toBe(1.42)
  })

  it('returns 1.0 for chicken breast (no density hint)', () => {
    expect(densityForFood('chicken breast')).toBe(1.0)
  })

  it('returns 1.0 for a plain food name', () => {
    expect(densityForFood('brown rice')).toBe(1.0)
  })
})

describe('unitToGrams', () => {
  it('returns same value for grams', () => {
    expect(unitToGrams(150, 'g')).toBe(150)
  })

  it('converts oz to grams', () => {
    expect(unitToGrams(1, 'oz')).toBeCloseTo(28.35, 1)
  })

  it('returns 0 for quantity of 0', () => {
    expect(unitToGrams(0, 'g')).toBe(0)
  })

  it('returns 0 for negative quantity', () => {
    expect(unitToGrams(-5, 'g')).toBe(0)
  })

  it('uses servingSizeG from opts for serving unit', () => {
    expect(unitToGrams(1, 'serving', { servingSizeG: 85 })).toBe(85)
  })

  it('defaults serving size to 100g when servingSizeG not provided', () => {
    expect(unitToGrams(1, 'serving')).toBe(100)
  })

  it('converts 2 servings using servingSizeG', () => {
    expect(unitToGrams(2, 'serving', { servingSizeG: 50 })).toBe(100)
  })
})

describe('defaultQtyForUnit', () => {
  it('returns servingSizeG rounded for g unit', () => {
    expect(defaultQtyForUnit('g', 100)).toBe(100)
  })

  it('returns 100 for g when no servingSizeG provided', () => {
    expect(defaultQtyForUnit('g')).toBe(100)
  })

  it('returns 1 for cup', () => {
    expect(defaultQtyForUnit('cup')).toBe(1)
  })

  it('returns 1 for oz', () => {
    expect(defaultQtyForUnit('oz')).toBe(1)
  })

  it('returns 1 for serving', () => {
    expect(defaultQtyForUnit('serving')).toBe(1)
  })

  it('returns 100 for ml', () => {
    expect(defaultQtyForUnit('ml')).toBe(100)
  })
})
