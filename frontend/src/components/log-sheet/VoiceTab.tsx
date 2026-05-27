import { useState, useRef, useEffect } from 'react'
import { Mic } from 'lucide-react'
import { api } from '../../lib/api'
import type { DraftItem } from './types'

type Props = {
  onAddItems: (items: DraftItem[]) => void
  onSwitchToPlate: () => void
}

export function VoiceTab({ onAddItems, onSwitchToPlate }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [transcription, setTranscription] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const timerRef = useRef<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      mediaRecorder.onstop = () => {
        setAudioBlob(new Blob(audioChunksRef.current, { type: 'audio/wav' }))
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
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      setIsRecording(false)
    }
  }

  const handleUploadAudio = async (blobToUpload: Blob) => {
    setIsProcessing(true)
    setTranscription('')
    try {
      const formData = new FormData()
      formData.append('file', blobToUpload, 'recording.wav')
      const data = await api.upload<{ raw_input: string; items: DraftItem[]; nutrition: unknown; confidence: number }>(
        '/log/meal/voice',
        formData,
      )
      setTranscription(data.raw_input)
      if (data.items && data.items.length > 0) {
        const mapped = data.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          estimated_weight_g: (item as unknown as Record<string, number>).estimated_weight_g || 100.0,
          nutrients: item.nutrients,
        }))
        onAddItems(mapped)
        onSwitchToPlate()
      }
    } catch (err) {
      console.error(err)
      alert('Error transcribing audio. Please try again or use manual search!')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleMockVoice = async (text: string) => {
    setIsProcessing(true)
    try {
      const mapped: DraftItem[] = [
        {
          name: text.includes('oats') ? 'Steel Cut Oats' : 'Wild Salmon Fillet',
          quantity: 1,
          unit: 'portion',
          estimated_weight_g: text.includes('oats') ? 40 : 150,
          nutrients: text.includes('oats') ? {
            calories: 150, saturated_fat_g: 0.5, soluble_fiber_g: 2.0, protein_g: 5.0,
            carbohydrates_g: 27.0, fat_g: 2.5, fiber_g: 4.0, sodium_mg: 0.0,
          } : {
            calories: 280, saturated_fat_g: 1.5, soluble_fiber_g: 0.0, protein_g: 30.0,
            carbohydrates_g: 0.0, fat_g: 15.0, fiber_g: 0.0, sodium_mg: 70.0,
          },
        },
      ]
      setTranscription(`[Mock Transcription] "${text}"`)
      onAddItems(mapped)
      onSwitchToPlate()
    } catch (e) {
      console.error(e)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="log-sheet-section log-sheet-center-stack">
      <div className="log-sheet-voice-main">
        <div className="text-center space-y-2 max-w-xs mx-auto">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Voice</div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>Describe the meal</h3>
          <p style={{ margin: '8px 0 0', color: 'var(--fg-tertiary)', lineHeight: 1.55 }}>
            Describe your meal in natural English. Luma will transcribe and calculate LDL cholesterol impact.
          </p>
        </div>

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

        {transcription && (
          <p style={{ fontSize: 12, color: 'var(--fg-tertiary)', textAlign: 'center', margin: 0 }}>
            {transcription}
          </p>
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
        <span className="eyebrow block mb-3" style={{ color: 'var(--fg-quiet)' }}>Voice presets</span>
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
  )
}
