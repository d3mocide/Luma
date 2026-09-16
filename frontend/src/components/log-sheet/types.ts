export type FavoriteItem = {
  id: string
  sort_order: number
  food_name: string
  brand: string | null
  quantity_g: number
  // The measure the item was built with — 2 "cup", 4 "oz". quantity_g is still
  // the resolved weight everything computes from; these carry the unit the user
  // picked so editing the favorite shows it back. Null on favorites saved before
  // the portion was recorded, and on items that were entered in grams.
  quantity?: number | null
  unit?: string | null
  nutrients: Record<string, number>
}

export type Favorite = {
  id: string
  name: string
  created_at: string
  log_count?: number
  items: FavoriteItem[]
  tags?: string[]
}

import { toNutrients, type Nutrients } from '../../lib/nutrients'
import { gramsPerUnit, isGramUnit } from '../../lib/portions'

export type DraftItem = {
  name: string
  brand?: string
  quantity: number
  unit: string
  estimated_weight_g: number
  // Original estimate captured when the item entered the draft, used to anchor
  // the relative portion multipliers (½×/1×/2×) so they don't drift as the
  // weight is edited.
  base_weight_g?: number
  // Grams in a single `unit` of this food, captured when the portion was picked.
  // Lets the portion be shown and edited in that unit instead of collapsing to
  // grams. Absent when the item was entered in grams or has no resolvable unit.
  unit_grams?: number
  nutrients: Nutrients
  // Tracks which food DB record this item came from (set for barcode, search,
  // and re-adds from Recent; absent for fresh photo extractions).
  food_id?: string
  // Origin of the item so the backend can decide whether to auto-persist it.
  source?: 'barcode' | 'photo' | 'search' | 'voice' | 'plan' | 'manual'
  // Where the nutrient values came from after server-side resolution. DB-sourced
  // values are trustworthy; "estimate" means the LLM's own numbers were kept.
  nutrient_source?: 'reference' | 'usda' | 'user' | 'off' | 'estimate'
}

export type NutrientSource = NonNullable<DraftItem['nutrient_source']>

// Map a picked food's origin to the provenance tag carried on a draft item, so
// a food chosen from the DB (search/barcode/replace) shows the right badge.
export function nutrientSourceForFood(source?: string, brand?: string): NutrientSource | undefined {
  if (brand === 'USDA Reference') return 'reference'
  if (source === 'usda') return 'usda'
  if (source === 'off') return 'off'
  if (source === 'user') return 'user'
  return undefined
}

// ── Draft ↔ favorite item mapping ────────────────────────────────────────────
// Every surface that saves or opens a favorite goes through this pair so the
// chosen measure survives the round trip instead of collapsing to grams.

// Serialize a draft item for the favorites API. The quantity is re-derived from
// the item's current weight, so a portion edited after it was added (½× chips,
// a typed gram value) is saved as the matching count of its own unit.
export function favoriteItemFromDraft(item: DraftItem) {
  const perUnit = isGramUnit(item.unit) ? null : item.unit_grams
  const quantity = perUnit && perUnit > 0 ? item.estimated_weight_g / perUnit : null
  return {
    food_name: item.name,
    brand: item.brand ?? null,
    quantity_g: item.estimated_weight_g,
    quantity,
    unit: quantity == null ? null : item.unit,
    nutrients: item.nutrients,
  }
}

// Rehydrate a saved favorite item into a draft item, restoring the unit it was
// built with when one was recorded and falling back to grams when it wasn't.
export function draftFromFavoriteItem(i: FavoriteItem): DraftItem {
  const perUnit = isGramUnit(i.unit) ? null : gramsPerUnit(i.quantity, i.quantity_g)
  return {
    name: i.food_name,
    brand: i.brand ?? undefined,
    quantity: perUnit ? (i.quantity as number) : i.quantity_g,
    unit: perUnit ? (i.unit as string) : 'g',
    estimated_weight_g: i.quantity_g,
    base_weight_g: i.quantity_g,
    ...(perUnit ? { unit_grams: perUnit } : {}),
    nutrients: toNutrients(i.nutrients),
  }
}
