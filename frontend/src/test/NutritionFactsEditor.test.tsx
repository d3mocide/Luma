import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NutritionFactsEditor, type NutritionEditorChange } from '../components/log-sheet/NutritionFactsEditor'

describe('NutritionFactsEditor', () => {
  it('seeds inputs in per-serving terms from a per-100g profile', () => {
    // 50g serving of a food that has 400 kcal / 100g → 200 kcal per serving.
    render(
      <NutritionFactsEditor
        servingSizeG={50}
        per100g={{ calories: 400, protein_g: 20 }}
        onChange={vi.fn()}
        saveToLibrary
        onSaveToLibraryChange={vi.fn()}
      />,
    )
    expect((screen.getByLabelText('Calories') as HTMLInputElement).value).toBe('200')
    expect((screen.getByLabelText('Protein') as HTMLInputElement).value).toBe('10')
  })

  it('converts an edited per-serving value back to per-100g on change', () => {
    const onChange = vi.fn<(c: NutritionEditorChange) => void>()
    render(
      <NutritionFactsEditor
        servingSizeG={50}
        per100g={{ calories: 200 }}
        onChange={onChange}
        saveToLibrary
        onSaveToLibraryChange={vi.fn()}
      />,
    )
    // Type 150 kcal for the 50g serving → 300 kcal / 100g.
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '150' } })
    const last = onChange.mock.calls.at(-1)![0]
    expect(last.servingSizeG).toBe(50)
    expect(last.per100g.calories).toBe(300)
  })

  it('holds per-serving values when the serving size changes', () => {
    const onChange = vi.fn<(c: NutritionEditorChange) => void>()
    render(
      <NutritionFactsEditor
        servingSizeG={50}
        per100g={{ calories: 400 }}  // 200 kcal per 50g serving
        onChange={onChange}
        saveToLibrary
        onSaveToLibraryChange={vi.fn()}
      />,
    )
    // Doubling the serving to 100g keeps the displayed 200 kcal → 200 kcal / 100g.
    fireEvent.change(screen.getByLabelText('Serving size in grams'), { target: { value: '100' } })
    const last = onChange.mock.calls.at(-1)![0]
    expect(last.servingSizeG).toBe(100)
    expect(last.per100g.calories).toBe(200)
    // The visible per-serving value is unchanged.
    expect((screen.getByLabelText('Calories') as HTMLInputElement).value).toBe('200')
  })

  it('clamps saturated fat to not exceed total fat', () => {
    const onChange = vi.fn<(c: NutritionEditorChange) => void>()
    render(
      <NutritionFactsEditor
        servingSizeG={100}
        per100g={{ fat_g: 10 }}
        onChange={onChange}
        saveToLibrary
        onSaveToLibraryChange={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Saturated Fat'), { target: { value: '25' } })
    expect((screen.getByLabelText('Saturated Fat') as HTMLInputElement).value).toBe('10')
  })

  it('reveals micronutrient inputs only when expanded', () => {
    render(
      <NutritionFactsEditor
        servingSizeG={100}
        per100g={{ calories: 100 }}
        onChange={vi.fn()}
        saveToLibrary
        onSaveToLibraryChange={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Vitamin C')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Add micronutrients'))
    expect(screen.getByLabelText('Vitamin C')).toBeInTheDocument()
  })

  it('auto-expands micronutrients when the food already carries them', () => {
    render(
      <NutritionFactsEditor
        servingSizeG={100}
        per100g={{ calories: 100, vitamin_c_mg: 12 }}
        onChange={vi.fn()}
        saveToLibrary
        onSaveToLibraryChange={vi.fn()}
      />,
    )
    expect((screen.getByLabelText('Vitamin C') as HTMLInputElement).value).toBe('12')
  })

  it('toggles save-to-library', () => {
    const onToggle = vi.fn()
    render(
      <NutritionFactsEditor
        servingSizeG={100}
        per100g={{ calories: 100 }}
        onChange={vi.fn()}
        saveToLibrary
        onSaveToLibraryChange={onToggle}
      />,
    )
    fireEvent.click(screen.getByText('Save to my foods'))
    expect(onToggle).toHaveBeenCalledWith(false)
  })
})
