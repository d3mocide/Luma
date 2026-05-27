import { useState, useRef, useEffect } from 'react'
import { useUIStore } from '../stores'
import { api } from '../lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Mic, Search, Utensils, X } from 'lucide-react'

type LogSheetMode = 'sheet' | 'page'

type LogSheetProps = {
  mode?: LogSheetMode
  onClose?: () => void
}

export default function LogSheet({ mode = 'sheet', onClose }: LogSheetProps) {
  const isOpen = useUIStore((s) => s.logSheetOpen)
  const close = useUIStore((s) => s.closeLogSheet)
  const queryClient = useQueryClient()
  const isPageMode = mode === 'page'
  const isVisible = isPageMode || isOpen
  const handleClose = () => {
    if (isPageMode) {
      onClose?.()
      return
    }
    close()
  }

  const [activeTab, setActiveTab] = useState<'voice' | 'barcode' | 'search'>('voice')
  const [slot, setSlot] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast')

  // Voice States
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [transcription, setTranscription] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const timerRef = useRef<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Barcode States
  const [barcode, setBarcode] = useState('')
  const [barcodeError, setBarcodeError] = useState('')

  // Search/Manual States
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Current Draft Plate Items
  const [draftItems, setDraftItems] = useState<any[]>([])

  // Voice recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      setRecordingTime(0)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRecording])

  // MediaRecorder Voice Start/Stop
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        setAudioBlob(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access denied:', err)
      alert('Microphone access denied. You can still use the mock preset voice logger below!')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      // Stop all tracks to release mic
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      setIsRecording(false)
    }
  }

  // Upload Audio
  const handleUploadAudio = async (blobToUpload: Blob) => {
    setIsProcessing(true)
    setTranscription('')
    try {
      const formData = new FormData()
      formData.append('file', blobToUpload, 'recording.wav')

      const data = await api.upload<{ raw_input: string; items: any[]; nutrition: any; confidence: number }>(
        '/log/meal/voice',
        formData,
      )
      setTranscription(data.raw_input)
      
      // Load parsed foods into the draft plate
      if (data.items && data.items.length > 0) {
        const mapped = data.items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          estimated_weight_g: item.estimated_weight_g || 100.0,
          nutrients: item.nutrients,
        }))
        setDraftItems(mapped)
        setActiveTab('search') // Switch to Plate view to inspect/edit
      }
    } catch (err) {
      console.error(err)
      alert('Error transcribing audio. Please try again or use manual search!')
    } finally {
      setIsProcessing(false)
    }
  }

  // Submit Mock Voice
  const handleMockVoice = async (text: string) => {
    setIsProcessing(true)
    try {
      // Simulate real Whisper and Llama pipeline by calling the endpoint or generating it
      // Let's create a small dummy file to satisfy the upload endpoint!
      const dummyBlob = new Blob([text], { type: 'text/plain' })
      const formData = new FormData()
      formData.append('file', dummyBlob, 'mock.wav')
      
      // Since it expects audio, let's hit our voice endpoint.
      // In the backend, faster-whisper will fail if it's not a real audio file.
      // So instead, let's call the food_extractor or simulate it in PWA!
      // This is extremely safe and robust!
      // Let's search if there's a steel cut oats food or salmon
      const mapped = [
        {
          name: text.includes('oats') ? 'Steel Cut Oats' : 'Wild Salmon Fillet',
          quantity: 1,
          unit: 'portion',
          estimated_weight_g: text.includes('oats') ? 40 : 150,
          nutrients: text.includes('oats') ? {
            calories: 150, saturated_fat_g: 0.5, soluble_fiber_g: 2.0, protein_g: 5.0, carbohydrates_g: 27.0, fat_g: 2.5, fiber_g: 4.0, sodium_mg: 0.0
          } : {
            calories: 280, saturated_fat_g: 1.5, soluble_fiber_g: 0.0, protein_g: 30.0, carbohydrates_g: 0.0, fat_g: 15.0, fiber_g: 0.0, sodium_mg: 70.0
          }
        }
      ]
      setDraftItems(mapped)
      setTranscription(`[Mock Transcription] "${text}"`)
      setActiveTab('search')
    } catch (e) {
      console.error(e)
    } finally {
      setIsProcessing(false)
    }
  }

  // Barcode Lookup
  const handleBarcodeLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!barcode.trim()) return
    setBarcodeError('')
    try {
      const food: any = await api.post('/log/meal/barcode', { barcode: barcode.trim() })
      const added = {
        name: food.name,
        brand: food.brand,
        quantity: 1,
        unit: 'portion',
        estimated_weight_g: food.serving_size_g || 100.0,
        nutrients: {
          calories: food.nutrients_per_100g.calories * ((food.serving_size_g || 100.0) / 100.0),
          saturated_fat_g: food.nutrients_per_100g.saturated_fat_g * ((food.serving_size_g || 100.0) / 100.0),
          soluble_fiber_g: food.nutrients_per_100g.soluble_fiber_g * ((food.serving_size_g || 100.0) / 100.0),
          protein_g: food.nutrients_per_100g.protein_g * ((food.serving_size_g || 100.0) / 100.0),
          carbohydrates_g: food.nutrients_per_100g.carbohydrates_g * ((food.serving_size_g || 100.0) / 100.0),
          fat_g: food.nutrients_per_100g.fat_g * ((food.serving_size_g || 100.0) / 100.0),
          fiber_g: food.nutrients_per_100g.fiber_g * ((food.serving_size_g || 100.0) / 100.0),
          sodium_mg: food.nutrients_per_100g.sodium_mg * ((food.serving_size_g || 100.0) / 100.0),
        }
      }
      setDraftItems([...draftItems, added])
      setBarcode('')
      setActiveTab('search')
    } catch (err: any) {
      setBarcodeError(err.message || 'Product not found')
    }
  }

  // Live Food Fuzzy Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const delay = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res: any = await api.get(`/foods/search?q=${encodeURIComponent(searchQuery)}`)
        const foods = Array.isArray(res) ? res : (res?.results ?? [])
        setSearchResults(foods)
      } catch (err) {
        console.error(err)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(delay)
  }, [searchQuery])

  // Add Item from Search
  const addSearchItem = (food: any) => {
    const defaultWeight = food.serving_size_g || 100.0
    const added = {
      name: food.name,
      brand: food.brand,
      quantity: 1,
      unit: 'portion',
      estimated_weight_g: defaultWeight,
      nutrients: {
        calories: food.nutrients_per_100g.calories * (defaultWeight / 100.0),
        saturated_fat_g: food.nutrients_per_100g.saturated_fat_g * (defaultWeight / 100.0),
        soluble_fiber_g: food.nutrients_per_100g.soluble_fiber_g * (defaultWeight / 100.0),
        protein_g: food.nutrients_per_100g.protein_g * (defaultWeight / 100.0),
        carbohydrates_g: food.nutrients_per_100g.carbohydrates_g * (defaultWeight / 100.0),
        fat_g: food.nutrients_per_100g.fat_g * (defaultWeight / 100.0),
        fiber_g: food.nutrients_per_100g.fiber_g * (defaultWeight / 100.0),
        sodium_mg: food.nutrients_per_100g.sodium_mg * (defaultWeight / 100.0),
      }
    }
    setDraftItems([...draftItems, added])
    setSearchQuery('')
    setSearchResults([])
  }

  // Update quantity of item in Plate
  const updateItemWeight = (index: number, newWeight: number) => {
    const updated = [...draftItems]
    const item = updated[index]
    const ratio = newWeight / item.estimated_weight_g
    
    item.estimated_weight_g = newWeight
    item.nutrients = {
      calories: item.nutrients.calories * ratio,
      saturated_fat_g: item.nutrients.saturated_fat_g * ratio,
      soluble_fiber_g: item.nutrients.soluble_fiber_g * ratio,
      protein_g: item.nutrients.protein_g * ratio,
      carbohydrates_g: item.nutrients.carbohydrates_g * ratio,
      fat_g: item.nutrients.fat_g * ratio,
      fiber_g: item.nutrients.fiber_g * ratio,
      sodium_mg: item.nutrients.sodium_mg * ratio,
    }
    setDraftItems(updated)
  }

  // Remove Item
  const removeItem = (index: number) => {
    setDraftItems(draftItems.filter((_, i) => i !== index))
  }

  // Compute live cumulative totals
  const totals = draftItems.reduce(
    (acc, cur) => {
      const n = cur.nutrients || {}
      return {
        calories: acc.calories + (n.calories || 0),
        saturated_fat_g: acc.saturated_fat_g + (n.saturated_fat_g || 0),
        soluble_fiber_g: acc.soluble_fiber_g + (n.soluble_fiber_g || 0),
        protein_g: acc.protein_g + (n.protein_g || 0),
        carbohydrates_g: acc.carbohydrates_g + (n.carbohydrates_g || 0),
        fat_g: acc.fat_g + (n.fat_g || 0),
        fiber_g: acc.fiber_g + (n.fiber_g || 0),
        sodium_mg: acc.sodium_mg + (n.sodium_mg || 0),
      }
    },
    {
      calories: 0,
      saturated_fat_g: 0,
      soluble_fiber_g: 0,
      protein_g: 0,
      carbohydrates_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sodium_mg: 0,
    }
  )

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: () =>
      api.post('/log/meal', {
        slot,
        source: activeTab,
        items: draftItems,
        nutrition: totals,
        raw_input: transcription || 'Manual Log',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      setDraftItems([])
      setTranscription('')
      handleClose()
    },
    onError: (err) => {
      console.error(err)
      alert('Failed to save meal log. Try again!')
    }
  })

  if (!isVisible) return null

  return (
    <div className="log-sheet-overlay" style={isPageMode ? {
      position: 'relative',
      inset: 'auto',
      background: 'transparent',
      backdropFilter: 'none',
      zIndex: 1,
      display: 'block',
      height: '100%',
    } : {
      position: 'fixed', inset: 0,
      background: 'rgba(5,8,17,0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 50,
      display: 'flex', justifyContent: 'flex-end', alignItems: 'stretch',
    }}>
      {/* Sliding Sheet Panel */}
      <div className="glass log-sheet-panel" style={{
        width: '100%', maxWidth: isPageMode ? 'none' : 480,
        background: 'linear-gradient(180deg, rgba(13,20,37,0.98), rgba(8,13,26,0.98))',
        borderLeft: isPageMode ? 'none' : '1px solid var(--glass-edge)',
        display: 'flex', flexDirection: 'column',
        height: '100%',
        boxShadow: isPageMode ? 'none' : '-20px 0 60px rgba(0,0,0,0.4)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div className="log-sheet-atmo" aria-hidden="true" />

        {/* Header */}
        <header className="log-sheet-header" style={{
          padding: '18px 20px 16px',
          borderBottom: '1px solid var(--glass-edge)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Meal logging</div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>Add a food item</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--fg-tertiary)', maxWidth: 32 + 'ch' }}>
              Capture a meal quickly, then tune the portion or ingredient details before saving.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="log-sheet-close btn btn-ghost"
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(251, 113, 133, 0.08)', border: '1px solid rgba(251, 113, 133, 0.22)',
              color: 'var(--bad)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 160ms ease-out, background 160ms ease-out, border-color 160ms ease-out, box-shadow 160ms ease-out',
            }}
          >
            <span className="log-sheet-close-icon" style={{ display: 'inline-flex', transition: 'transform 160ms ease-out' }}>
              <X size={14} strokeWidth={2} />
            </span>
          </button>
        </header>

        {/* Slot Selection */}
        <div className="log-sheet-slotbar" style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--glass-edge)',
          display: 'flex', gap: 8, overflowX: 'auto',
          position: 'relative',
          zIndex: 1,
        }}>
          {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((s) => {
            const colors: Record<string, string> = {
              breakfast: 'var(--sun-400)',
              lunch: 'var(--sky-400)',
              dinner: 'var(--aurora-violet)',
              snack: 'var(--good)',
            }
            const c = colors[s]
            return (
              <button
                key={s}
                onClick={() => setSlot(s)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: `1px solid ${slot === s ? `${c}60` : 'var(--glass-edge)'}`,
                  background: slot === s ? `${c}18` : 'var(--glass-1)',
                  color: slot === s ? c : 'var(--fg-tertiary)',
                  fontSize: 11, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  cursor: 'pointer', flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                  transition: 'all 150ms',
                }}
              >
                {s}
              </button>
            )
          })}
        </div>

        {/* Mode Tabs */}
        <div className="log-sheet-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--glass-edge)', position: 'relative', zIndex: 1 }}>
          {(['voice', 'barcode', 'search'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '12px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${activeTab === tab ? 'var(--sky-400)' : 'transparent'}`,
                color: activeTab === tab ? 'var(--sky-300)' : 'var(--fg-quiet)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'var(--font-sans)', textTransform: 'capitalize',
                transition: 'all 150ms',
              }}
            >
              {tab === 'search' ? 'Search' : tab}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="thin-scroll log-sheet-body" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 20px', position: 'relative', zIndex: 1 }}>
          
          {/* Tab 1: Voice */}
          {activeTab === 'voice' && (
            <div className="log-sheet-section log-sheet-center-stack">
              <div className="log-sheet-voice-main">
                <div className="text-center space-y-2 max-w-xs mx-auto">
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Voice</div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>Describe the meal</h3>
                  <p className="text-xs text-slate-400 leading-relaxed" style={{ margin: '8px 0 0', color: 'var(--fg-tertiary)', lineHeight: 1.55 }}>
                    Describe your meal in natural English. Luma will transcribe and calculate LDL cholesterol impact.
                  </p>
                </div>

                {/* Pulsing Mic Recorder */}
                <div className="relative flex items-center justify-center py-6">
                  {isRecording && (
                    <div className="absolute inset-0 w-28 h-28 bg-red-500/10 rounded-full animate-ping" />
                  )}
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                      isRecording ? 'bg-red-500 text-white' : 'bg-brand-500 text-white hover:bg-brand-600'
                    }`}
                  >
                    {isRecording
                      ? <span className="text-sm font-semibold uppercase tracking-wide">Stop</span>
                      : <Mic size={28} strokeWidth={1.5} />
                    }
                  </button>
                </div>

                {isRecording && (
                  <span className="text-sm font-mono text-red-400 animate-pulse" style={{ textAlign: 'center' }}>
                    Recording: {recordingTime}s
                  </span>
                )}

                {audioBlob && !isRecording && (
                  <button
                    onClick={() => handleUploadAudio(audioBlob)}
                    disabled={isProcessing}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-sm font-bold rounded-lg shadow transition-colors w-full"
                  >
                    {isProcessing ? 'Processing with Luma AI...' : 'Analyze Audio Transcription'}
                  </button>
                )}
              </div>

              <div className="log-sheet-voice-presets w-full border-t border-slate-800 pt-6">
                <span className="eyebrow block mb-3" style={{ color: 'var(--fg-quiet)' }}>
                  Voice presets
                </span>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => handleMockVoice('One cup of cooked steel cut oatmeal with blueberries and ground flaxseeds')}
                    className="p-3 text-left rounded-lg border transition-colors"
                    style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--fg-secondary)' }}
                  >
                    Steel cut oatmeal with blueberries and flax
                  </button>
                  <button
                    onClick={() => handleMockVoice('Grilled salmon fillet with two tablespoons of olive oil and steamed broccoli')}
                    className="p-3 text-left rounded-lg border transition-colors"
                    style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--fg-secondary)' }}
                  >
                    Grilled salmon with olive oil and broccoli
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Barcode */}
          {activeTab === 'barcode' && (
            <div className="space-y-6 py-4">
              <form onSubmit={handleBarcodeLookup} className="space-y-3">
                <label className="eyebrow block">
                  Barcode
                </label>
                <div className="flex gap-2">
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
                    className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm rounded-lg transition-colors"
                  >
                    Find
                  </button>
                </div>
                {barcodeError && <p className="text-xs text-red-400">{barcodeError}</p>}
              </form>

              <div className="border-t border-slate-800 pt-6">
                <span className="eyebrow block mb-3">
                  Presets
                </span>
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
          )}

          {/* Tab 3: Search / Plate */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              
              {/* Fuzzy Search Bar */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search oats, salmon, fruits, vegetables..."
                  className="field-input w-full rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none"
                  style={{ border: '1px solid var(--glass-edge)' }}
                />
                <span className="absolute left-3 top-2.5 text-slate-500 text-sm"><Search size={14} strokeWidth={1.5} /></span>
                {isSearching && (
                  <span className="absolute right-3 top-2.5 w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {/* Fuzzy Search Results */}
              {searchResults.length > 0 && (
                <div className="glass-inset overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-800/80">
                  {searchResults.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => addSearchItem(food)}
                      className="w-full p-2.5 text-left flex items-center justify-between transition-colors"
                      style={{ color: 'var(--fg-secondary)' }}
                    >
                      <div>
                        <span className="text-sm font-semibold block" style={{ color: 'var(--fg-primary)' }}>{food.name}</span>
                        <span className="text-xs" style={{ color: 'var(--fg-quiet)' }}>{food.brand || 'USDA reference'}</span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--sky-300)', background: 'rgba(56,189,248,0.10)' }}>
                        {Math.round(food.nutrients_per_100g.calories)} kcal
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Draft Plate List */}
              <div className="space-y-2">
                <h4 className="eyebrow block">
                  Plate Items ({draftItems.length})
                </h4>
                
                {draftItems.length === 0 ? (
                  <div className="p-8 text-center glass-inset rounded-xl" style={{ borderStyle: 'dashed' }}>
                    <span className="text-2xl block mb-2 opacity-50"><Utensils size={20} strokeWidth={1.5} /></span>
                    <p className="text-xs" style={{ color: 'var(--fg-quiet)' }}>Your plate is currently empty.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {draftItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="glass-inset rounded-xl p-3 flex flex-col gap-2 relative group"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-bold block" style={{ color: 'var(--fg-primary)' }}>{item.name}</span>
                            <span className="text-xs" style={{ color: 'var(--fg-quiet)' }}>{item.brand || 'Generic'}</span>
                          </div>
                          <button
                            onClick={() => removeItem(idx)}
                            className="text-xs transition-colors"
                            style={{ color: 'var(--fg-quiet)' }}
                          >
                            Remove
                          </button>
                        </div>
                        
                        {/* Portion adjustment slider/input */}
                        <div className="flex items-center justify-between gap-4 mt-1 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <span className="eyebrow" style={{ fontSize: 10 }}>Weight</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={Math.round(item.estimated_weight_g)}
                              onChange={(e) => updateItemWeight(idx, Math.max(1, parseInt(e.target.value) || 0))}
                              className="field-input w-16 text-center text-xs font-bold py-1 rounded focus:outline-none"
                              style={{ border: '1px solid var(--glass-edge)' }}
                            />
                            <span className="eyebrow" style={{ fontSize: 10 }}>g</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Aggregate Plate Nutrition Totals Card */}
        {draftItems.length > 0 && (
          <div className="log-sheet-footer" style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--glass-edge)',
            background: 'linear-gradient(180deg, rgba(8,13,26,0.98), rgba(5,8,17,0.98))',
            display: 'flex', flexDirection: 'column', gap: 12,
            position: 'relative',
            zIndex: 1,
          }}>
            <div className="eyebrow">Cumulative nutrition</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { l: 'Calories', v: Math.round(totals.calories), c: 'var(--fg-primary)' },
                { l: 'Sat Fat', v: `${totals.saturated_fat_g.toFixed(1)}g`, c: 'var(--bad)' },
                { l: 'Sol Fiber', v: `${totals.soluble_fiber_g.toFixed(1)}g`, c: 'var(--good)' },
                { l: 'Protein', v: `${totals.protein_g.toFixed(1)}g`, c: 'var(--aurora-violet)' },
              ].map((n) => (
                <div key={n.l} className="glass-inset" style={{ padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 2 }}>{n.l}</div>
                  <div className="num" style={{ fontSize: 14, fontWeight: 600, color: n.c }}>{n.v}</div>
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              style={{ width: '100%', padding: '13px', fontSize: 14, opacity: saveMutation.isPending ? 0.7 : 1 }}
            >
              {saveMutation.isPending ? 'Logging…' : 'Save meal log'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
