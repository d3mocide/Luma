import { IngredientBuilder } from './IngredientBuilder'
import type { DraftItem } from './types'

type Props = {
  draftItems: DraftItem[]
  onAddItem: (item: DraftItem) => void
  onRemoveItem: (index: number) => void
  onUpdateWeight: (index: number, newWeight: number) => void
}

export function SearchTab({ draftItems, onAddItem, onRemoveItem, onUpdateWeight }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <IngredientBuilder
        draftItems={draftItems}
        onAddItem={onAddItem}
        onRemoveItem={onRemoveItem}
        onUpdateWeight={onUpdateWeight}
      />
    </div>
  )
}
