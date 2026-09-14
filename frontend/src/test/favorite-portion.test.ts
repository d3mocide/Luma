import { describe, it, expect } from 'vitest'
import { favoriteItemFromDraft, draftFromFavoriteItem } from '../components/log-sheet/types'
import type { DraftItem, FavoriteItem } from '../components/log-sheet/types'
import { draftPortion } from '../lib/portions'
import { toNutrients } from '../lib/nutrients'

function makeDraft(overrides: Partial<DraftItem> = {}): DraftItem {
  return {
    name: 'Whole milk',
    quantity: 1,
    unit: 'cup',
    unit_grams: 240,
    estimated_weight_g: 240,
    base_weight_g: 240,
    nutrients: toNutrients({ calories: 149, protein_g: 8 }),
    ...overrides,
  }
}

function makeSaved(overrides: Partial<FavoriteItem> = {}): FavoriteItem {
  return {
    id: 'fi-1',
    sort_order: 0,
    food_name: 'Whole milk',
    brand: null,
    quantity_g: 240,
    quantity: 1,
    unit: 'cup',
    nutrients: { calories: 149, protein_g: 8 },
    ...overrides,
  }
}

describe('favoriteItemFromDraft', () => {
  it('saves the measure the item was built with alongside the grams', () => {
    expect(favoriteItemFromDraft(makeDraft())).toMatchObject({
      food_name: 'Whole milk',
      quantity_g: 240,
      quantity: 1,
      unit: 'cup',
    })
  })

  it('re-derives the quantity from the current weight', () => {
    // The ½× chip halved the portion after it was added — save it as ½ cup.
    const halved = makeDraft({ estimated_weight_g: 120 })
    expect(favoriteItemFromDraft(halved)).toMatchObject({ quantity_g: 120, quantity: 0.5, unit: 'cup' })
  })

  it('saves no measure for an item entered in grams', () => {
    const grams = makeDraft({ unit: 'g', unit_grams: undefined, estimated_weight_g: 150 })
    expect(favoriteItemFromDraft(grams)).toMatchObject({ quantity_g: 150, quantity: null, unit: null })
  })

  it('saves no measure when the unit has no gram anchor', () => {
    const unanchored = makeDraft({ unit: 'plate', unit_grams: undefined })
    expect(favoriteItemFromDraft(unanchored)).toMatchObject({ quantity: null, unit: null })
  })
})

describe('draftFromFavoriteItem', () => {
  it('restores the saved unit instead of falling back to grams', () => {
    const draft = draftFromFavoriteItem(makeSaved({ quantity: 2, quantity_g: 480 }))
    expect(draft.quantity).toBe(2)
    expect(draft.unit).toBe('cup')
    expect(draft.unit_grams).toBe(240)
    expect(draft.estimated_weight_g).toBe(480)
  })

  it('falls back to grams for favorites saved before the measure was recorded', () => {
    const legacy = draftFromFavoriteItem(makeSaved({ quantity: null, unit: null }))
    expect(legacy.quantity).toBe(240)
    expect(legacy.unit).toBe('g')
    expect(legacy.unit_grams).toBeUndefined()
  })

  it('ignores a recorded measure that is itself in grams', () => {
    const inGrams = draftFromFavoriteItem(makeSaved({ quantity: 240, unit: 'g' }))
    expect(inGrams.unit).toBe('g')
    expect(inGrams.unit_grams).toBeUndefined()
  })
})

describe('portion round trip', () => {
  it('survives build → save → reopen', () => {
    const food = { name: 'Whole milk', household_measures: [{ label: '1 cup', grams: 240 }] }
    const built: DraftItem = {
      name: food.name,
      ...draftPortion(food, 'hm:0', 2),
      estimated_weight_g: 480,
      nutrients: toNutrients({ calories: 298 }),
    }

    const saved = favoriteItemFromDraft(built)
    expect(saved).toMatchObject({ quantity_g: 480, quantity: 2, unit: 'cup' })

    const reopened = draftFromFavoriteItem({ id: 'x', sort_order: 0, ...saved } as FavoriteItem)
    expect(reopened.quantity).toBe(2)
    expect(reopened.unit).toBe('cup')
    expect(reopened.estimated_weight_g).toBe(480)
  })
})
