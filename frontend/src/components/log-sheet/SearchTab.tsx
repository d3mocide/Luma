import { IngredientBuilder } from './IngredientBuilder'
import type { DraftItem, Favorite } from './types'

type Props = {
  draftItems: DraftItem[]
  onAddItem: (item: DraftItem) => void
  onRemoveItem: (index: number) => void
  onUpdateWeight: (index: number, newWeight: number) => void
  onUpdateName: (index: number, name: string) => void
  favorites?: Favorite[]
  onPickFavorite?: (items: DraftItem[], name: string) => void
  onReplaceItem?: (index: number, item: DraftItem) => void
}

export function SearchTab({
  draftItems,
  onAddItem,
  onRemoveItem,
  onUpdateWeight,
  onUpdateName,
  favorites,
  onPickFavorite,
  onReplaceItem,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <IngredientBuilder
        draftItems={draftItems}
        onAddItem={onAddItem}
        onRemoveItem={onRemoveItem}
        onUpdateWeight={onUpdateWeight}
        onUpdateName={onUpdateName}
        favorites={favorites}
        onPickFavorite={onPickFavorite}
        onReplaceItem={onReplaceItem}
      />
    </div>
  )
}
