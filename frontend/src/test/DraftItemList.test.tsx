import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DraftItemList } from '../components/log-sheet/DraftItemList'
import { nutrientSourceForFood } from '../components/log-sheet/types'
import { toNutrients } from '../lib/nutrients'
import type { DraftItem } from '../components/log-sheet/types'

function makeItem(overrides: Partial<DraftItem> = {}): DraftItem {
  return {
    name: 'Almond milk',
    quantity: 1,
    unit: 'cup',
    estimated_weight_g: 240,
    nutrients: toNutrients({ calories: 40, protein_g: 1 }),
    ...overrides,
  }
}

const noop = () => {}

describe('nutrientSourceForFood', () => {
  it('maps USDA Reference brand to reference', () => {
    expect(nutrientSourceForFood('usda', 'USDA Reference')).toBe('reference')
  })
  it('maps source values', () => {
    expect(nutrientSourceForFood('usda')).toBe('usda')
    expect(nutrientSourceForFood('off')).toBe('off')
    expect(nutrientSourceForFood('user')).toBe('user')
  })
  it('returns undefined for unknown source', () => {
    expect(nutrientSourceForFood(undefined)).toBeUndefined()
    expect(nutrientSourceForFood('mystery')).toBeUndefined()
  })
})

describe('DraftItemList provenance + replace', () => {
  it('shows an Estimated badge for estimate items', () => {
    render(
      <DraftItemList
        draftItems={[makeItem({ nutrient_source: 'estimate' })]}
        onRemoveItem={noop} onUpdateWeight={noop} onUpdateName={noop}
      />,
    )
    expect(screen.getByText('Estimated')).toBeInTheDocument()
  })

  it('shows a USDA badge for reference items', () => {
    render(
      <DraftItemList
        draftItems={[makeItem({ nutrient_source: 'reference' })]}
        onRemoveItem={noop} onUpdateWeight={noop} onUpdateName={noop}
      />,
    )
    expect(screen.getByText('USDA')).toBeInTheDocument()
  })

  it('offers Fix only for estimate items when onReplaceItem is provided', () => {
    const onReplace = vi.fn()
    render(
      <DraftItemList
        draftItems={[makeItem({ nutrient_source: 'estimate' })]}
        onRemoveItem={noop} onUpdateWeight={noop} onUpdateName={noop}
        onReplaceItem={onReplace}
      />,
    )
    const fix = screen.getByText('Fix')
    fireEvent.click(fix)
    expect(onReplace).toHaveBeenCalledWith(0)
  })

  it('does not offer Fix for DB-sourced items', () => {
    render(
      <DraftItemList
        draftItems={[makeItem({ nutrient_source: 'usda' })]}
        onRemoveItem={noop} onUpdateWeight={noop} onUpdateName={noop}
        onReplaceItem={vi.fn()}
      />,
    )
    expect(screen.queryByText('Fix')).not.toBeInTheDocument()
  })

  it('does not offer Fix when no replace handler is wired', () => {
    render(
      <DraftItemList
        draftItems={[makeItem({ nutrient_source: 'estimate' })]}
        onRemoveItem={noop} onUpdateWeight={noop} onUpdateName={noop}
      />,
    )
    expect(screen.queryByText('Fix')).not.toBeInTheDocument()
  })
})

describe('DraftItemList nutrition editor', () => {
  it('shows the edit affordance only when onUpdateNutrition is wired', () => {
    const { rerender } = render(
      <DraftItemList
        draftItems={[makeItem()]}
        onRemoveItem={noop} onUpdateWeight={noop} onUpdateName={noop}
      />,
    )
    expect(screen.queryByLabelText('Edit nutrition for Almond milk')).not.toBeInTheDocument()

    rerender(
      <DraftItemList
        draftItems={[makeItem()]}
        onRemoveItem={noop} onUpdateWeight={noop} onUpdateName={noop}
        onUpdateNutrition={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Edit nutrition for Almond milk')).toBeInTheDocument()
  })

  it('expands the editor and persists via Done when save is on', () => {
    const onSave = vi.fn()
    render(
      <DraftItemList
        draftItems={[makeItem()]}
        onRemoveItem={noop} onUpdateWeight={noop} onUpdateName={noop}
        onUpdateNutrition={vi.fn()} onSaveToLibrary={onSave}
      />,
    )
    // Editor is collapsed until the affordance is tapped.
    expect(screen.queryByText('Save to my foods')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Edit nutrition for Almond milk'))
    expect(screen.getByText('Save to my foods')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Done'))
    expect(onSave).toHaveBeenCalledWith(0)
  })

  it('does not persist when save-to-library is toggled off', () => {
    const onSave = vi.fn()
    render(
      <DraftItemList
        draftItems={[makeItem()]}
        onRemoveItem={noop} onUpdateWeight={noop} onUpdateName={noop}
        onUpdateNutrition={vi.fn()} onSaveToLibrary={onSave}
      />,
    )
    fireEvent.click(screen.getByLabelText('Edit nutrition for Almond milk'))
    fireEvent.click(screen.getByText('Save to my foods')) // toggle off
    fireEvent.click(screen.getByText('Done'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('emits edited nutrients back as the per-serving value changes', () => {
    const onUpdate = vi.fn()
    // 240g item at 40 kcal total → 16.67 kcal/100g.
    render(
      <DraftItemList
        draftItems={[makeItem({ estimated_weight_g: 240, nutrients: toNutrients({ calories: 40 }) })]}
        onRemoveItem={noop} onUpdateWeight={noop} onUpdateName={noop}
        onUpdateNutrition={onUpdate}
      />,
    )
    fireEvent.click(screen.getByLabelText('Edit nutrition for Almond milk'))
    // Editor seeds serving=240g, per-serving calories=40. Bump to 80.
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '80' } })
    const last = onUpdate.mock.calls.at(-1)!
    expect(last[0]).toBe(0)
    expect(Math.round(last[1].nutrients.calories)).toBe(80)
    expect(last[1].estimated_weight_g).toBe(240)
  })
})
