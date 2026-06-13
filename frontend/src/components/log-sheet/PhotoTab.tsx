import { useState, useRef } from 'react'
import { Camera, ImagePlus, X, CheckCircle2 } from 'lucide-react'
import { csrfHeaders, refreshSession } from '../../lib/api'
import { toNutrients } from '../../lib/nutrients'
import type { DraftItem } from './types'

type Props = {
  onAddItems: (items: DraftItem[]) => void
}

type State = 'idle' | 'preview' | 'processing' | 'done' | 'error'

export function PhotoTab({ onAddItems }: Props) {
  const [state, setState] = useState<State>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setState('preview')
    setErrorMsg('')
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
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

  async function handleAnalyze() {
    if (!file) return
    setState('processing')
    setErrorMsg('')

    try {
      const compressedBlob = await compressImage(file)
      const form = new FormData()
      form.append('file', compressedBlob, 'photo.jpg')

      const send = async () =>
        fetch('/api/v1/log/meal/photo', {
          method: 'POST',
          credentials: 'include',
          headers: await csrfHeaders(),
          body: form,
        })
      let resp = await send()
      if (resp.status === 401 && (await refreshSession())) resp = await send()

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()

      if (!data.items?.length) {
        setErrorMsg("Couldn't identify food in this photo. Try a clearer image or use Search.")
        setState('error')
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
      setState('done')
    } catch {
      setErrorMsg('Photo analysis failed. Check your connection and try again.')
      setState('error')
    }
  }

  function reset() {
    setState('idle')
    setPreviewUrl(null)
    setFile(null)
    setErrorMsg('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />

      {state === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            className="btn btn-primary"
            style={{ padding: '14px 20px', fontSize: 14, gap: 10 }}
            onClick={() => { fileRef.current?.click() }}
          >
            <Camera size={17} /> Take a photo
          </button>
          <button
            className="btn"
            style={{ padding: '12px 20px', fontSize: 13, gap: 10 }}
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

      {(state === 'preview' || state === 'processing') && previewUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--glass-edge)' }}>
            <img
              src={previewUrl}
              alt="Food photo preview"
              style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }}
            />
            {state === 'preview' && (
              <button
                onClick={reset}
                style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: '50%', background: 'rgba(9,11,16,0.7)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--fg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {state === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ padding: '13px 20px', fontSize: 14 }}
                onClick={handleAnalyze}
              >
                <Camera size={15} /> Analyze with Luma
              </button>
              <button className="btn" style={{ padding: '10px 20px', fontSize: 13 }} onClick={reset}>
                Retake
              </button>
            </div>
          )}

          {state === 'processing' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px 0' }}>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>Identifying food items…</span>
            </div>
          )}
        </div>
      )}

      {state === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '8px 0' }}>
          <CheckCircle2 size={36} color="var(--good)" />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-secondary)', textAlign: 'center' }}>
            Items added — review and adjust portions below, then save.
          </p>
          <button className="btn" style={{ fontSize: 13, padding: '8px 18px' }} onClick={reset}>
            Add another photo
          </button>
        </div>
      )}

      {state === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '8px 0' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--bad)', textAlign: 'center', lineHeight: 1.5 }}>
            {errorMsg}
          </p>
          <button className="btn" style={{ fontSize: 13, padding: '8px 18px' }} onClick={reset}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
