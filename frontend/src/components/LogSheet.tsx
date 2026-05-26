import { useState, useRef, useEffect } from 'react'
import { useUIStore } from '../stores'
import { api } from '../lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export default function LogSheet() {
  const isOpen = useUIStore((s) => s.logSheetOpen)
  const close = useUIStore((s) => s.closeLogSheet)
  const queryClient = useQueryClient()

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

      const res = await fetch('/api/v1/log/meal/voice', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('Voice extraction failed')
      const data = await res.json()
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
        setSearchResults(res.results || [])
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
      close()
    },
    onError: (err) => {
      console.error(err)
      alert('Failed to save meal log. Try again!')
    }
  })

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(5,8,17,0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 50,
      display: 'flex', justifyContent: 'flex-end', alignItems: 'stretch',
    }}>
      {/* Sliding Sheet Panel */}
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--bg-1)',
        borderLeft: '1px solid var(--glass-edge)',
        display: 'flex', flexDirection: 'column',
        height: '100%',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.4)',
      }}>

        {/* Header */}
        <header style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--glass-edge)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--fg-primary)' }}>Log Meal</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--fg-quiet)' }}>LDL cardiovascular tracker</p>
          </div>
          <button
            onClick={close}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--glass-2)', border: '1px solid var(--glass-edge)',
              color: 'var(--fg-quiet)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </header>

        {/* Slot Selection */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--glass-edge)',
          display: 'flex', gap: 8, overflowX: 'auto',
        }}>
          {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((s) => {
            const colors: Record<string, string> = { breakfast: '#fbbf24', lunch: '#38bdf8', dinner: '#a78bfa', snack: '#34d399' }
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
        <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-edge)' }}>
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
              {tab === 'search' ? 'Plate / Search' : tab}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          
          {/* Tab 1: Voice */}
          {activeTab === 'voice' && (
            <div className="space-y-6 py-4 flex flex-col items-center justify-center">
              <div className="text-center space-y-2 max-w-xs">
                <h3 className="text-sm font-semibold text-slate-200">AI Voice Log</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
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
                  <span className="text-3xl font-bold">{isRecording ? '■' : '🎤'}</span>
                </button>
              </div>

              {isRecording && (
                <span className="text-sm font-mono text-red-400 animate-pulse">
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

              <div className="w-full border-t border-slate-800 pt-6">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-3">
                  Quick Voice Presets (Testing)
                </span>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => handleMockVoice('One cup of cooked steel cut oatmeal with blueberries and ground flaxseeds')}
                    className="p-3 bg-slate-800 hover:bg-slate-750 text-left rounded-lg border border-slate-700/60 text-xs text-slate-300 transition-colors"
                  >
                    ✦ "1 cup steel cut oatmeal with blueberries & flax"
                  </button>
                  <button
                    onClick={() => handleMockVoice('Grilled salmon fillet with two tablespoons of olive oil and steamed broccoli')}
                    className="p-3 bg-slate-800 hover:bg-slate-750 text-left rounded-lg border border-slate-700/60 text-xs text-slate-300 transition-colors"
                  >
                    ✦ "Grilled salmon with olive oil & broccoli"
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Barcode */}
          {activeTab === 'barcode' && (
            <div className="space-y-6 py-4">
              <form onSubmit={handleBarcodeLookup} className="space-y-3">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Enter Barcode Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="e.g. 0021000612239"
                    className="flex-1 bg-slate-950 border border-slate-800 focus:border-brand-500 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
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
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-3">
                  Simulation / Mock Barcodes
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBarcode('028400070566')}
                    className="p-2.5 bg-slate-800 hover:bg-slate-750 text-center rounded-lg border border-slate-700/60 text-xs text-slate-300 transition-colors"
                  >
                    Quaker Oats
                  </button>
                  <button
                    onClick={() => setBarcode('5411188110825')}
                    className="p-2.5 bg-slate-800 hover:bg-slate-750 text-center rounded-lg border border-slate-700/60 text-xs text-slate-300 transition-colors"
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
                  className="w-full bg-slate-950 border border-slate-800 focus:border-brand-500 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none"
                />
                <span className="absolute left-3 top-2.5 text-slate-500 text-sm">🔍</span>
                {isSearching && (
                  <span className="absolute right-3 top-2.5 w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {/* Fuzzy Search Results */}
              {searchResults.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-800/80">
                  {searchResults.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => addSearchItem(food)}
                      className="w-full p-2.5 text-left hover:bg-slate-900/60 flex items-center justify-between transition-colors"
                    >
                      <div>
                        <span className="text-sm font-semibold text-slate-200 block">{food.name}</span>
                        <span className="text-xs text-slate-500">{food.brand || 'USDA Reference'}</span>
                      </div>
                      <span className="text-xs font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full">
                        {Math.round(food.nutrients_per_100g.calories)} kcal
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Draft Plate List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Plate Items ({draftItems.length})
                </h4>
                
                {draftItems.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950/35 border border-dashed border-slate-850 rounded-xl">
                    <span className="text-2xl block mb-2 opacity-50">🍽️</span>
                    <p className="text-xs text-slate-500">Your plate is currently empty</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {draftItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-2 relative group"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-bold text-slate-200 block">{item.name}</span>
                            <span className="text-xs text-slate-500">{item.brand || 'Generic'}</span>
                          </div>
                          <button
                            onClick={() => removeItem(idx)}
                            className="text-slate-500 hover:text-red-400 text-xs transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                        
                        {/* Portion adjustment slider/input */}
                        <div className="flex items-center justify-between gap-4 mt-1 bg-slate-900/60 p-2 rounded-lg">
                          <span className="text-xs text-slate-400 font-semibold">Weight:</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={Math.round(item.estimated_weight_g)}
                              onChange={(e) => updateItemWeight(idx, Math.max(1, parseInt(e.target.value) || 0))}
                              className="w-16 bg-slate-950 border border-slate-850 text-center text-xs text-slate-200 font-bold py-1 rounded focus:outline-none"
                            />
                            <span className="text-xs text-slate-500 font-bold">g</span>
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
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--glass-edge)',
            background: 'var(--bg-0)',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div className="eyebrow">Cumulative Plate Nutrition</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { l: 'Calories', v: Math.round(totals.calories), c: 'var(--fg-primary)' },
                { l: 'Sat Fat', v: `${totals.saturated_fat_g.toFixed(1)}g`, c: 'var(--bad)' },
                { l: 'Sol Fiber', v: `${totals.soluble_fiber_g.toFixed(1)}g`, c: 'var(--good)' },
                { l: 'Protein', v: `${totals.protein_g.toFixed(1)}g`, c: '#a78bfa' },
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
              {saveMutation.isPending ? 'Logging…' : 'Save Meal Log'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
