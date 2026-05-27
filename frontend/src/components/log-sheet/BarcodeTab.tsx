import { useState } from 'react'
import { api } from '../../lib/api'
import type { DraftItem } from './types'

type Props = {
  onAddItem: (item: DraftItem) => void
  onSwitchToPlate: () => void
}

export function BarcodeTab({ onAddItem, onSwitchToPlate }: Props) {
  const [barcode, setBarcode] = useState('')
  const [barcodeError, setBarcodeError] = useState('')

  const handleBarcodeLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!barcode.trim()) return
    setBarcodeError('')
    try {
      const food: Record<string, unknown> = await api.post('/log/meal/barcode', { barcode: barcode.trim() })
      const n = food.nutrients_per_100g as Record<string, number>
      const serving = (food.serving_size_g as number) || 100.0
      const added: DraftItem = {
        name: food.name as string,
        brand: food.brand as string | undefined,
        quantity: 1,
        unit: 'portion',
        estimated_weight_g: serving,
        nutrients: {
          calories: n.calories * (serving / 100.0),
          saturated_fat_g: n.saturated_fat_g * (serving / 100.0),
          soluble_fiber_g: n.soluble_fiber_g * (serving / 100.0),
          protein_g: n.protein_g * (serving / 100.0),
          carbohydrates_g: n.carbohydrates_g * (serving / 100.0),
          fat_g: n.fat_g * (serving / 100.0),
          fiber_g: n.fiber_g * (serving / 100.0),
          sodium_mg: n.sodium_mg * (serving / 100.0),
        },
      }
      onAddItem(added)
      setBarcode('')
      onSwitchToPlate()
    } catch (err: unknown) {
      setBarcodeError((err as Error).message || 'Product not found')
    }
  }

  return (
    <div className="space-y-6 py-4">
      <form onSubmit={handleBarcodeLookup} className="space-y-3">
        <label className="eyebrow block">Barcode</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="e.g. 0021000612239"
            className="field-input flex-1 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
            style={{ border: '1px solid var(--glass-edge)' }}
          />
          <button type="submit" className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm rounded-lg transition-colors">
            Find
          </button>
        </div>
        {barcodeError && <p className="text-xs text-red-400">{barcodeError}</p>}
      </form>

      <div className="border-t border-slate-800 pt-6">
        <span className="eyebrow block mb-3">Presets</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setBarcode('028400070566')}
            className="p-2.5 text-center rounded-lg border transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--fg-secondary)' }}
          >
            Quaker Oats
          </button>
          <button
            onClick={() => setBarcode('5411188110825')}
            className="p-2.5 text-center rounded-lg border transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--fg-secondary)' }}
          >
            Alpro Soy Milk
          </button>
        </div>
      </div>
    </div>
  )
}
