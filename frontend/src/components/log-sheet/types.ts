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
  items: FavoriteItem[]
}

export type DraftItem = {
  name: string
  brand?: string
  quantity: number
  unit: string
  estimated_weight_g: number
  nutrients: {
    calories: number
    saturated_fat_g: number
    soluble_fiber_g: number
    protein_g: number
    carbohydrates_g: number
    fat_g: number
    fiber_g: number
    sodium_mg: number
  }
}
