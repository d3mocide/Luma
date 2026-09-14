import { describe, it, expect } from 'vitest'
import {
  densityForFood, unitToGrams, defaultQtyForUnit, gramsForFoodUnit,
  isGramUnit, gramsPerUnit, formatQuantity, measureLabel, splitMeasureLabel, draftPortion,
} from '../lib/portions'

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

describe('isGramUnit', () => {
  it('treats the gram spellings as gram units', () => {
    expect(isGramUnit('g')).toBe(true)
    expect(isGramUnit('G')).toBe(true)
    expect(isGramUnit('gram')).toBe(true)
    expect(isGramUnit('grams')).toBe(true)
  })

  it('treats a missing unit as grams', () => {
    expect(isGramUnit(undefined)).toBe(true)
    expect(isGramUnit(null)).toBe(true)
    expect(isGramUnit('')).toBe(true)
  })

  it('leaves real measures alone', () => {
    expect(isGramUnit('cup')).toBe(false)
    expect(isGramUnit('oz')).toBe(false)
  })
})

describe('gramsPerUnit', () => {
  it('back-calculates grams in one unit', () => {
    expect(gramsPerUnit(2, 480)).toBe(240)
  })

  it('returns null when the quantity cannot anchor a conversion', () => {
    expect(gramsPerUnit(0, 240)).toBeNull()
    expect(gramsPerUnit(null, 240)).toBeNull()
    expect(gramsPerUnit(undefined, 240)).toBeNull()
    expect(gramsPerUnit(-1, 240)).toBeNull()
  })

  it('returns null when the weight is missing', () => {
    expect(gramsPerUnit(2, 0)).toBeNull()
    expect(gramsPerUnit(2, null)).toBeNull()
  })
})

describe('formatQuantity', () => {
  it('drops floating-point noise', () => {
    expect(formatQuantity(1.0000001)).toBe('1')
    expect(formatQuantity(0.4988)).toBe('0.5')
  })

  it('keeps meaningful fractions', () => {
    expect(formatQuantity(1.5)).toBe('1.5')
    expect(formatQuantity(0.25)).toBe('0.25')
  })
})

describe('measureLabel', () => {
  it('labels a real measure', () => {
    expect(measureLabel(2, 'cup')).toBe('2 cup')
    expect(measureLabel(0.5, 'cup')).toBe('0.5 cup')
  })

  it('is empty for grams and for missing quantities', () => {
    expect(measureLabel(240, 'g')).toBe('')
    expect(measureLabel(null, 'cup')).toBe('')
    expect(measureLabel(0, 'cup')).toBe('')
  })
})

describe('splitMeasureLabel', () => {
  it('splits the count out of a USDA household measure', () => {
    expect(splitMeasureLabel('1 cup')).toEqual({ count: 1, unit: 'cup' })
    expect(splitMeasureLabel('0.5 cup')).toEqual({ count: 0.5, unit: 'cup' })
    expect(splitMeasureLabel('3 oz')).toEqual({ count: 3, unit: 'oz' })
  })

  it('keeps multi-word remainders as the unit name', () => {
    expect(splitMeasureLabel('1 cup, chopped')).toEqual({ count: 1, unit: 'cup, chopped' })
  })

  it('defaults to a count of 1 when the label has no leading number', () => {
    expect(splitMeasureLabel('serving')).toEqual({ count: 1, unit: 'serving' })
  })
})

describe('draftPortion', () => {
  const milk = { name: 'milk', household_measures: [{ label: '1 cup', grams: 240 }] }

  it('records grams-per-unit for a plain volume unit', () => {
    const p = draftPortion({ name: 'milk' }, 'cup', 2)
    expect(p.quantity).toBe(2)
    expect(p.unit).toBe('cup')
    expect(p.unit_grams).toBeCloseTo(236.59, 2)
  })

  it('folds a household measure count into the quantity', () => {
    expect(draftPortion(milk, 'hm:0', 2)).toEqual({ quantity: 2, unit: 'cup', unit_grams: 240 })
  })

  it('normalizes a fractional household measure to a whole unit', () => {
    const half = { name: 'milk', household_measures: [{ label: '0.5 cup', grams: 120 }] }
    // 3 × "0.5 cup" is 1.5 cups — and still 360g either way.
    expect(draftPortion(half, 'hm:0', 3)).toEqual({ quantity: 1.5, unit: 'cup', unit_grams: 240 })
  })

  it('carries no unit_grams for a gram portion', () => {
    expect(draftPortion({ name: 'rice' }, 'g', 150)).toEqual({ quantity: 150, unit: 'g' })
  })

  it('falls back to a serving when the household measure index is missing', () => {
    expect(draftPortion({ name: 'milk' }, 'hm:4', 1)).toEqual({ quantity: 1, unit: 'serving' })
  })
})
