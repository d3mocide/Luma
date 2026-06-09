import { useState, useRef, useEffect, useId } from 'react'
import { Camera, ImagePlus, X, CheckCircle2, Heart, Plus, Search, Shield, Wheat, Dumbbell, Sprout, Flame, CheckCircle } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { api, csrfHeaders } from '../../lib/api'
import { toNutrients, scaleByRatio, scaleNutrients } from '../../lib/nutrients'
import {
  type PortionUnit,
  type HouseholdMeasure,
  PORTION_UNITS,
  PORTION_UNIT_LABELS,
  PRESETS_BY_UNIT,
  unitToGrams,
  densityForFood,
  defaultQtyForUnit,
} from '../../lib/portions'
import type { DraftItem } from './types'

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
]

type FoodResult = {
  id: string
  name: string
  brand?: string
  serving_size_g?: number
  nutrients_per_100g: Record<string, number>
  household_measures?: HouseholdMeasure[]
}

function gramsForUnit(food: FoodResult, unit: string, qty: number): number {
  if (unit.startsWith('hm:')) {
    const m = food.household_measures?.[Number(unit.slice(3))]
    return m ? qty * m.grams : qty
  }
  return unitToGrams(qty, unit as PortionUnit, {
    density: densityForFood(food.name),
    servingSizeG: food.serving_size_g,
  })
}

type PhotoState = 'idle' | 'preview' | 'processing' | 'done' | 'error'

type Props = {
  onAddItems: (items: DraftItem[]) => void
}

export function ScanTab({ onAddItems }: Props) {
  const [scanMode, setScanMode] = useState<'barcode' | 'photo'>('barcode')

  // --- Barcode State ---
  const [isScanning, setIsScanning]     = useState(true)
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [barcodeError, setBarcodeError] = useState('')
  const [pending, setPending]           = useState<FoodResult | null>(null)
  const [pendingQty, setPendingQty]     = useState('')
  const [pendingUnit, setPendingUnit]   = useState<string>('g')
  
  const qtyRef = useRef<HTMLInputElement>(null)
  const uid = useId()
  const scannerDomId = `scan-tab-barcode-scanner-${uid.replace(/:/g, '')}`

  // --- Photo State ---
  const [photoState, setPhotoState] = useState<PhotoState>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [photoErrorMsg, setPhotoErrorMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Clean up barcode state when switching tabs inside Scan
  useEffect(() => {
    if (scanMode === 'photo') {
      setIsScanning(false)
      setPending(null)
      setBarcodeError('')
      setBarcodeLoading(false)
    } else {
      setIsScanning(true)
      setPending(null)
      setBarcodeError('')
      setBarcodeLoading(false)
    }
  }, [scanMode])

  // --- Barcode HTML5Qrcode logic ---
  useEffect(() => {
    if (scanMode !== 'barcode' || !isScanning) return

    const scanner = new Html5Qrcode(scannerDomId, { formatsToSupport: BARCODE_FORMATS, verbose: false })
    let fired = false
    let startResolved = false
    let stopRequested = false

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 130 } },
        async (code: string) => {
          if (fired) return
          fired = true
          setBarcodeError('')
          setBarcodeLoading(true)
          setIsScanning(false)
          try {
            const food = await api.post<Record<string, unknown>>('/log/meal/barcode', { barcode: code })
            setPending({
              id: food.id as string,
              name: food.name as string,
              brand: food.brand as string | undefined,
              serving_size_g: food.serving_size_g as number | undefined,
              nutrients_per_100g: food.nutrients_per_100g as Record<string, number>,
              household_measures: food.household_measures as HouseholdMeasure[] | undefined,
            })
            const hasMeasures = ((food.household_measures as any)?.length ?? 0) > 0
            setPendingUnit(hasMeasures ? 'hm:0' : 'g')
            setPendingQty(String(hasMeasures ? 1 : Math.round((food.serving_size_g as number) || 100)))
            setTimeout(() => qtyRef.current?.select(), 60)
          } catch {
            setBarcodeError('Product not found')
          } finally {
            setBarcodeLoading(false)
          }
        },
        () => {},
      )
      .then(() => {
        startResolved = true
        if (stopRequested) scanner.stop().catch(() => {})
      })
      .catch(() => {
        if (!stopRequested) {
          setIsScanning(false)
        }
      })

    return () => {
      stopRequested = true
      if (startResolved) scanner.stop().catch(() => {})
    }
  }, [scanMode, isScanning, scannerDomId])

  // --- Barcode portion confirm ---
  function confirmBarcodeAdd() {
    if (!pending) return
    const qty = Math.max(0, parseFloat(pendingQty) || 0)
    const grams = Math.max(1, Math.round(gramsForUnit(pending, pendingUnit, qty)))
    const unitLabel = pendingUnit.startsWith('hm:')
      ? (pending.household_measures?.[Number(pendingUnit.slice(3))]?.label ?? 'serving')
      : pendingUnit

    onAddItems([{
      name: pending.name,
      brand: pending.brand,
      quantity: qty,
      unit: unitLabel,
      estimated_weight_g: grams,
      nutrients: scaleNutrients(pending.nutrients_per_100g, grams),
    }])

    setPending(null)
    setPendingQty('')
    setPendingUnit('g')
    setIsScanning(true)
  }

  function changeBarcodeUnit(unit: string) {
    setPendingUnit(unit)
    const qty = unit.startsWith('hm:') ? 1 : defaultQtyForUnit(unit as PortionUnit, pending?.serving_size_g)
    setPendingQty(String(qty))
  }

  const pendingMeasures = pending?.household_measures ?? []
  const pendingQtyNum = parseFloat(pendingQty) || 0
  const pendingG = pending ? gramsForUnit(pending, pendingUnit, pendingQtyNum) : 0
  const pendingKcal = pending ? Math.round((pending.nutrients_per_100g.calories || 0) * (pendingG / 100)) : 0
  const pendingProtein = pending ? ((pending.nutrients_per_100g.protein_g || 0) * (pendingG / 100)).toFixed(1) : '0'
  const pendingPresets = pendingUnit.startsWith('hm:') ? [0.5, 1, 2, 3] : PRESETS_BY_UNIT[pendingUnit as PortionUnit]

  // --- Photo methods ---
  function handlePhotoFile(f: File) {
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setPhotoState('preview')
    setPhotoErrorMsg('')
  }

  function handlePhotoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handlePhotoFile(f)
  }

  function compressImage(file: File, maxW = 1024, maxH = 1024, quality = 0.8): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > maxW) {
              height = Math.round((height * maxW) / width)
              width = maxW
            }
          } else {
            if (height > maxH) {
              width = Math.round((width * maxH) / height)
              height = maxH
            }
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Canvas context unavailable'))
            return
          }

          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob)
              } else {
                reject(new Error('Canvas toBlob failed'))
              }
            },
            'image/jpeg',
            quality
          )
        }
        img.onerror = (err) => reject(err)
      }
      reader.onerror = (err) => reject(err)
    })
  }

  async function handleAnalyzePhoto() {
    if (!file) return
    setPhotoState('processing')
    setPhotoErrorMsg('')

    try {
      const compressedBlob = await compressImage(file)
      const form = new FormData()
      form.append('file', compressedBlob, 'photo.jpg')

      const resp = await fetch('/api/v1/log/meal/photo', {
        method: 'POST',
        credentials: 'include',
        headers: await csrfHeaders(),
        body: form,
      })

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()

      if (!data.items?.length) {
        setPhotoErrorMsg("Couldn't identify food in this photo. Try a clearer image or use Search.")
        setPhotoState('error')
        return
      }

      const mapped: DraftItem[] = (data.items as DraftItem[]).map((item) => ({
        name: item.name,
        brand: item.brand,
        quantity: item.quantity,
        unit: item.unit,
        estimated_weight_g: item.estimated_weight_g ?? 100.0,
        nutrients: toNutrients(item.nutrients),
      }))
      onAddItems(mapped)
      setPhotoState('done')
    } catch {
      setPhotoErrorMsg('Photo analysis failed. Check your connection and try again.')
      setPhotoState('error')
    }
  }

  function resetPhoto() {
    setPhotoState('idle')
    setPreviewUrl(null)
    setFile(null)
    setPhotoErrorMsg('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Premium Segmented Toggle */}
      <div style={{ display: 'flex', padding: 3, background: 'var(--glass-1)', borderRadius: 10, border: '1px solid var(--glass-edge)' }}>
        <button
          type="button"
          onClick={() => setScanMode('barcode')}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 150ms',
            background: scanMode === 'barcode' ? 'var(--glass-3)' : 'transparent',
            color: scanMode === 'barcode' ? 'var(--sky-300)' : 'var(--fg-quiet)',
          }}
        >
          Barcode
        </button>
        <button
          type="button"
          onClick={() => setScanMode('photo')}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 150ms',
            background: scanMode === 'photo' ? 'var(--glass-3)' : 'transparent',
            color: scanMode === 'photo' ? 'var(--sky-300)' : 'var(--fg-quiet)',
          }}
        >
          Photo
        </button>
      </div>

      {/* --- BARCODE MODE --- */}
      {scanMode === 'barcode' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pending ? (
            <div className="glass-inset" style={{ padding: 14, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pending.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{pending.brand || 'Open Food Facts'}</div>
                </div>
                <button
                  onClick={() => { setPending(null); setPendingQty(''); setPendingUnit('g'); setIsScanning(true) }}
                  style={{ color: 'var(--fg-quiet)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}
                  aria-label="Cancel"
                >
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  ref={qtyRef}
                  type="number"
                  min={0}
                  step="any"
                  value={pendingQty}
                  onChange={(e) => setPendingQty(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmBarcodeAdd()}
                  className="field-input"
                  style={{
                    width: 60, textAlign: 'center', borderRadius: 8, padding: '7px 6px',
                    fontSize: 15, fontWeight: 700, border: '1px solid var(--glass-edge)',
                    fontFamily: 'var(--font-mono)', color: 'var(--fg-primary)',
                  }}
                />
                <select
                  value={pendingUnit}
                  onChange={(e) => changeBarcodeUnit(e.target.value)}
                  className="field-input"
                  style={{
                    borderRadius: 8, padding: '7px 8px', fontSize: 12, flexShrink: 0, maxWidth: 150,
                    border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
                    color: 'var(--fg-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  }}
                >
                  {pendingMeasures.map((m, i) => (
                    <option key={`hm:${i}`} value={`hm:${i}`} style={{ background: 'var(--bg-2)', color: 'var(--fg-primary)' }}>
                      {m.label} ({Math.round(m.grams)}g)
                    </option>
                  ))}
                  {PORTION_UNITS.map((u) => (
                    <option key={u} value={u} style={{ background: 'var(--bg-2)', color: 'var(--fg-primary)' }}>
                      {PORTION_UNIT_LABELS[u]}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                  {pendingPresets.map((p) => {
                    const active = pendingQtyNum === p
                    return (
                      <button
                        key={p}
                        onClick={() => setPendingQty(String(p))}
                        style={{
                          flex: 1, padding: '5px 2px', borderRadius: 7, fontSize: 10,
                          fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 150ms',
                          background: active ? 'rgba(56,189,248,0.15)' : 'var(--glass-1)',
                          border: active ? '1px solid rgba(56,189,248,0.4)' : '1px solid var(--glass-edge)',
                          color: active ? 'var(--sky-300)' : 'var(--fg-secondary)',
                        }}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
              </div>

              {pendingG > 0 && (
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', paddingLeft: 2 }}>
                  {pendingUnit !== 'g' && (
                    <>= <span className="num" style={{ color: 'var(--fg-secondary)' }}>{Math.round(pendingG)}</span> g · </>
                  )}
                  ≈ <span className="num" style={{ color: 'var(--fg-secondary)' }}>{pendingKcal}</span> kcal ·{' '}
                  <span className="num" style={{ color: 'var(--fg-secondary)' }}>{pendingProtein}g</span> protein
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={confirmBarcodeAdd}
                disabled={!pendingQty || pendingG <= 0}
                style={{ padding: '9px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Plus size={14} />
                Add to meal
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="eyebrow">Point at barcode</span>
                {!isScanning && (
                  <button
                    type="button"
                    onClick={() => { setBarcodeError(''); setIsScanning(true) }}
                    style={{ fontSize: 12, color: 'var(--sky-400)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Rescan
                  </button>
                )}
              </div>
              {isScanning && (
                <>
                  <div id={scannerDomId} style={{ borderRadius: 12, overflow: 'hidden', minHeight: 220, background: '#000' }} />
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--fg-quiet)', textAlign: 'center' }}>
                    Hold steady over the barcode
                  </p>
                </>
              )}
              {barcodeLoading && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 13 }}>
                  Looking up product…
                </div>
              )}
              {barcodeError && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--bad)', textAlign: 'center' }}>{barcodeError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- PHOTO MODE --- */}
      {scanMode === 'photo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handlePhotoInputChange}
          />

          {photoState === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                className="btn btn-primary"
                style={{ padding: '14px 20px', fontSize: 14, gap: 10, justifyContent: 'center' }}
                onClick={() => { fileRef.current?.click() }}
              >
                <Camera size={17} /> Take a photo
              </button>
              <button
                className="btn"
                style={{ padding: '12px 20px', fontSize: 13, gap: 10, justifyContent: 'center' }}
                onClick={() => {
                  if (fileRef.current) {
                    fileRef.current.removeAttribute('capture')
                    fileRef.current.click()
                    fileRef.current.setAttribute('capture', 'environment')
                  }
                }}
              >
                <ImagePlus size={15} /> Choose from library
              </button>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-quiet)', textAlign: 'center', lineHeight: 1.5 }}>
                Luma will identify food items and estimate nutrition using vision AI.
              </p>
            </div>
          )}

          {(photoState === 'preview' || photoState === 'processing') && previewUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--glass-edge)' }}>
                <img
                  src={previewUrl}
                  alt="Food photo preview"
                  style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }}
                />
                {photoState === 'preview' && (
                  <button
                    onClick={resetPhoto}
                    style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: '50%', background: 'rgba(9,11,16,0.7)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--fg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {photoState === 'preview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '13px 20px', fontSize: 14, justifyContent: 'center' }}
                    onClick={handleAnalyzePhoto}
                  >
                    <Camera size={15} /> Analyze with Luma
                  </button>
                  <button className="btn" style={{ padding: '10px 20px', fontSize: 13, justifyContent: 'center' }} onClick={resetPhoto}>
                    Retake
                  </button>
                </div>
              )}

              {photoState === 'processing' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px 0' }}>
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>Identifying food items…</span>
                </div>
              )}
            </div>
          )}

          {photoState === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '8px 0' }}>
              <CheckCircle size={36} color="var(--good)" />
              <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-secondary)', textAlign: 'center' }}>
                Items added — review and adjust portions below, then save.
              </p>
              <button className="btn" style={{ fontSize: 13, padding: '8px 18px' }} onClick={resetPhoto}>
                Add another photo
              </button>
            </div>
          )}

          {photoState === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '8px 0' }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--bad)', textAlign: 'center', lineHeight: 1.5 }}>
                {photoErrorMsg}
              </p>
              <button className="btn" style={{ fontSize: 13, padding: '8px 18px' }} onClick={resetPhoto}>
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
