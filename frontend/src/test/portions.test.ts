import { describe, it, expect } from 'vitest'
import { densityForFood, unitToGrams, defaultQtyForUnit, gramsForFoodUnit } from '../lib/portions'

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

describe('gramsForFoodUnit', () => {
  const oil = { name: 'olive oil', serving_size_g: 14 }

  it('applies the food density hint for volume units', () => {
    // 1 tbsp = 14.79 ml * 0.92 g/ml ≈ 13.6 g
    expect(gramsForFoodUnit(oil, 'tbsp', 1)).toBeCloseTo(13.6, 1)
  })

  it('resolves an hm:<index> household measure to grams', () => {
    const food = { name: 'milk', household_measures: [{ label: '1 cup', grams: 240 }] }
    expect(gramsForFoodUnit(food, 'hm:0', 2)).toBe(480)
  })

  it('falls back to quantity when the hm index is missing', () => {
    expect(gramsForFoodUnit({ name: 'milk' }, 'hm:5', 3)).toBe(3)
  })

  it('treats null serving_size_g as unset (defaults to 100g per serving)', () => {
    expect(gramsForFoodUnit({ name: 'soup', serving_size_g: null }, 'serving', 1)).toBe(100)
  })

  it('uses serving_size_g when present', () => {
    expect(gramsForFoodUnit({ name: 'soup', serving_size_g: 85 }, 'serving', 2)).toBe(170)
  })
})

describe('defaultQtyForUnit', () => {
  it('returns servingSizeG rounded-sm for g unit', () => {
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
