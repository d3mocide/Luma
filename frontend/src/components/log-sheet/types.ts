export type FavoriteItem = {
  id: string
  sort_order: number
  food_name: string
  brand: string | null
  quantity_g: number
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

import type { Nutrients } from '../../lib/nutrients'

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
  nutrients: Nutrients
  // Tracks which food DB record this item came from (set for barcode, search,
  // and re-adds from Recent; absent for fresh photo extractions).
  food_id?: string
  // Origin of the item so the backend can decide whether to auto-persist it.
  source?: 'barcode' | 'photo' | 'search' | 'voice' | 'plan' | 'manual'
}
