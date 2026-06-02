import { useState, useRef, useEffect } from 'react'
import { Camera, X } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { api } from '../../lib/api'
import type { DraftItem } from './types'

const SCANNER_ID = 'barcode-scanner-view'

// Only the formats found on packaged food products — skip QR/DataMatrix/etc for perf
const FOOD_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
]

type Props = {
  onAddItem: (item: DraftItem) => void
  onSwitchToPlate: () => void
}

function mapFood(food: Record<string, unknown>): DraftItem {
  const n = food.nutrients_per_100g as Record<string, number>
  const g = (food.serving_size_g as number) || 100
  const s = g / 100
  return {
    name: food.name as string,
    brand: food.brand as string | undefined,
    quantity: 1,
    unit: 'portion',
    estimated_weight_g: g,
    nutrients: {
      calories: n.calories * s,
      saturated_fat_g: n.saturated_fat_g * s,
      soluble_fiber_g: n.soluble_fiber_g * s,
      protein_g: n.protein_g * s,
      carbohydrates_g: n.carbohydrates_g * s,
      fat_g: n.fat_g * s,
      fiber_g: n.fiber_g * s,
      sodium_mg: n.sodium_mg * s,
    },
  }
}

export function BarcodeTab({ onAddItem, onSwitchToPlate }: Props) {
  const [barcode, setBarcode] = useState('')
  const [error, setError] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // Refs so the scanner effect callback never holds a stale closure over props
  const onAddItemRef = useRef(onAddItem)
  const onSwitchRef = useRef(onSwitchToPlate)
  onAddItemRef.current = onAddItem
  onSwitchRef.current = onSwitchToPlate

  const lookup = async (code: string) => {
    setError('')
    setIsLoading(true)
    try {
      const food = await api.post<Record<string, unknown>>('/log/meal/barcode', { barcode: code })
      onAddItemRef.current(mapFood(food))
      setBarcode('')
      onSwitchRef.current()
    } catch (err: unknown) {
      setError((err as Error).message || 'Product not found')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isScanning) return
    const scanner = new Html5Qrcode(SCANNER_ID, { formatsToSupport: FOOD_FORMATS, verbose: false })
    let fired = false

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 130 } },
        (code) => {
          if (fired) return
          fired = true
          setIsScanning(false)
          setBarcode(code)
          void lookup(code)
        },
        () => {}, // per-frame decode errors are expected noise, not worth surfacing
      )
      .catch(() => setIsScanning(false))

    return () => {
      scanner.stop().catch(() => {})
    }
  }, [isScanning]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (barcode.trim()) void lookup(barcode.trim())
  }

  return (
    <div className="space-y-6 py-4">
      {isScanning ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Point at barcode</span>
            <button
              type="button"
              onClick={() => setIsScanning(false)}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X size={18} />
            </button>
          </div>
          <div
            id={SCANNER_ID}
            className="w-full rounded-xl overflow-hidden bg-black"
            style={{ minHeight: 260 }}
          />
          <p className="text-xs text-slate-500 text-center">Hold steady over the barcode</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="eyebrow block">Barcode</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsScanning(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors flex items-center gap-1.5 text-sm shrink-0"
            >
              <Camera size={15} />
              Scan
            </button>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="e.g. 0021000612239"
              className="field-input flex-1 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
              style={{ border: '1px solid var(--glass-edge)' }}
            />
            <button
              type="submit"
              disabled={isLoading || !barcode.trim()}
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm rounded-lg transition-colors shrink-0"
            >
              {isLoading ? '…' : 'Find'}
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      )}

      {!isScanning && (
        <div className="border-t border-slate-800 pt-6">
          <span className="eyebrow block mb-3">Presets</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Quaker Oats', code: '028400070566' },
              { label: 'Alpro Soy Milk', code: '5411188110825' },
            ].map(({ label, code }) => (
              <button
                key={code}
                onClick={() => void lookup(code)}
                disabled={isLoading}
                className="p-2.5 text-center rounded-lg border transition-colors disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--fg-secondary)' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
