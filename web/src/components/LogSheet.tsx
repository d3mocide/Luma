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
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-end md:items-stretch transition-opacity duration-300">
      {/* Sliding Sheet Panel */}
      <div className="w-full md:w-[480px] bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col h-[90vh] md:h-full mt-auto md:mt-0 rounded-t-2xl md:rounded-t-none shadow-2xl relative">
        
        {/* Header */}
        <header className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Log Meal</h2>
            <p className="text-xs text-slate-400">Cardiovascular LDL nutrition tracker</p>
          </div>
          <button
            onClick={close}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </header>

        {/* Slot Selection */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800/60 flex gap-2 overflow-x-auto">
          {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSlot(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all shrink-0 ${
                slot === s
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-slate-800">
          {(['voice', 'barcode', 'search'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-semibold capitalize transition-all border-b-2 ${
                activeTab === tab
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'search' ? 'Plate / Search' : tab}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
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
          <div className="p-4 bg-slate-950 border-t border-slate-800/90 space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Cumulative Plate Nutrition
            </h4>
            
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-slate-900 p-2 rounded text-center border border-slate-850">
                <span className="text-xs text-slate-500 block">Calories</span>
                <span className="text-sm font-extrabold text-slate-100">{Math.round(totals.calories)}</span>
              </div>
              <div className="bg-slate-900 p-2 rounded text-center border border-slate-850">
                <span className="text-xs text-slate-500 block">Sat Fat</span>
                <span className="text-sm font-extrabold text-red-400">{totals.saturated_fat_g.toFixed(1)}g</span>
              </div>
              <div className="bg-slate-900 p-2 rounded text-center border border-slate-850">
                <span className="text-xs text-slate-500 block">Sol Fiber</span>
                <span className="text-sm font-extrabold text-emerald-400">{totals.soluble_fiber_g.toFixed(1)}g</span>
              </div>
              <div className="bg-slate-900 p-2 rounded text-center border border-slate-850">
                <span className="text-xs text-slate-500 block">Protein</span>
                <span className="text-sm font-extrabold text-indigo-400">{totals.protein_g.toFixed(1)}g</span>
              </div>
            </div>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-800 text-white text-sm font-extrabold rounded-xl transition-all shadow-lg active:scale-95 mt-1"
            >
              {saveMutation.isPending ? 'Logging Meal...' : 'Save Meal Event Log'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
