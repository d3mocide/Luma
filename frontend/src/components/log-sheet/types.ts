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
}

import type { Nutrients } from '../../lib/nutrients'

export type DraftItem = {
  name: string
  brand?: string
  quantity: number
  unit: string
  estimated_weight_g: number
  nutrients: Nutrients
}
