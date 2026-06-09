import { describe, it, expect } from 'vitest'
import { emptyNutrients, toNutrients, scaleNutrients, NUTRIENT_KEYS } from '../lib/nutrients'

describe('emptyNutrients', () => {
  it('returns an object with all NUTRIENT_KEYS set to 0', () => {
    const result = emptyNutrients()
    for (const key of NUTRIENT_KEYS) {
      expect(result[key]).toBe(0)
    }
  })

  it('has the same number of keys as NUTRIENT_KEYS', () => {
    const result = emptyNutrients()
    expect(Object.keys(result).length).toBe(NUTRIENT_KEYS.length)
  })
})

describe('toNutrients', () => {
  it('returns all zeros for null input', () => {
    const result = toNutrients(null)
    for (const key of NUTRIENT_KEYS) {
      expect(result[key]).toBe(0)
    }
  })

  it('returns all zeros for undefined input', () => {
    const result = toNutrients(undefined)
    for (const key of NUTRIENT_KEYS) {
      expect(result[key]).toBe(0)
    }
  })

  it('preserves present keys from partial input', () => {
    const result = toNutrients({ calories: 250, protein_g: 30 })
    expect(result.calories).toBe(250)
    expect(result.protein_g).toBe(30)
  })

  it('defaults missing keys to 0 when partial input given', () => {
    const result = toNutrients({ calories: 100 })
    expect(result.fat_g).toBe(0)
    expect(result.carbohydrates_g).toBe(0)
    expect(result.sodium_mg).toBe(0)
  })
})

describe('scaleNutrients', () => {
  it('scales 200g at 10 cal/100g to 20 cal', () => {
    const result = scaleNutrients({ calories: 10 }, 200)
    expect(result.calories).toBe(20)
  })

  it('scales proportionally for all keys', () => {
    const per100g = { calories: 100, protein_g: 20, fat_g: 5 }
    const result = scaleNutrients(per100g, 150)
    expect(result.calories).toBe(150)
    expect(result.protein_g).toBe(30)
    expect(result.fat_g).toBe(7.5)
  })

  it('defaults missing keys to 0 when scaling', () => {
    const result = scaleNutrients({ calories: 50 }, 100)
    expect(result.fat_g).toBe(0)
    expect(result.sodium_mg).toBe(0)
  })
})
