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
