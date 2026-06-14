import { useState, useRef, useEffect } from 'react'
import { Mic, AlertCircle, X } from 'lucide-react'
import { api } from '../../lib/api'
import { toNutrients } from '../../lib/nutrients'
import type { DraftItem } from './types'

type Props = {
  onAddItems: (items: DraftItem[]) => void
  onSwitchToPlate: () => void
}

function VoiceErrorModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5,8,17,0.75)', backdropFilter: 'blur(8px)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass" style={{ maxWidth: 400, width: '100%', padding: 28, borderRadius: 20, position: 'relative' }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
            color: 'var(--fg-tertiary)', cursor: 'pointer', padding: 6, display: 'flex',
          }}
        >
          <X size={16} />
        </button>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <AlertCircle size={18} style={{ color: '#f87171' }} />
          </div>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)' }}>
              Voice logging failed
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.55 }}>
              {message}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 20, width: '100%', padding: '10px 0',
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-edge)',
            borderRadius: 12, color: 'var(--fg-primary)', fontSize: 14,
            fontWeight: 500, cursor: 'pointer', letterSpacing: '-0.01em',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export function VoiceTab({ onAddItems, onSwitchToPlate }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [transcription, setTranscription] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('audio/mp4')

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
      streamRef.current = stream
      audioChunksRef.current = []

      // iOS Safari only supports audio/mp4; prefer webm on browsers that support it
      const mimeType = ['audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
      mimeTypeRef.current = mimeType || 'audio/mp4'
      
      const options: MediaRecorderOptions = { audioBitsPerSecond: 32000 }
      if (mimeType) {
        options.mimeType = mimeType
      }
      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      mediaRecorder.onstop = () => {
        setAudioBlob(new Blob(audioChunksRef.current, { type: mimeTypeRef.current }))
      }
      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access denied:', err)
      setVoiceError('Microphone access was denied. You can still use the text presets below.')
    }
  }

  const stopRecording = () => {
    // Always clean up state — wrap in try/catch so iOS errors don't leave the UI stuck
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    } catch (err) {
      console.error('Error stopping MediaRecorder:', err)
    }
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop())
    } catch (err) {
      console.error('Error stopping stream tracks:', err)
    }
    streamRef.current = null
    setIsRecording(false)
  }

  const handleUploadAudio = async (blobToUpload: Blob) => {
    setIsProcessing(true)
    setTranscription('')
    try {
      const ext = blobToUpload.type.includes('mp4') ? 'm4a' : 'webm'
      const formData = new FormData()
      formData.append('file', blobToUpload, `recording.${ext}`)
      const data = await api.upload<{ raw_input: string; items: DraftItem[]; nutrition: unknown; confidence: number }> (
        '/log/meal/voice',
        formData,
      )
      setTranscription(data.raw_input)
      if (data.items && data.items.length > 0) {
        const mapped = data.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          estimated_weight_g: item.estimated_weight_g ?? 100.0,
          nutrients: toNutrients(item.nutrients),
        }))
        onAddItems(mapped)
        onSwitchToPlate()
      }
    } catch (err) {
      console.error(err)
      setVoiceError('Audio could not be transcribed — no speech detected or the recording was too short. Try again or use the Search tab.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
    {voiceError && <VoiceErrorModal message={voiceError} onClose={() => setVoiceError(null)} />}
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
            <div className="absolute inset-0 w-28 h-28 bg-red-500/10 rounded-full animate-ping pointer-events-none" />
          )}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={isRecording ? 'voice-record-btn--active' : 'voice-record-btn'}
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
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-sm font-bold rounded-lg shadow-sm transition-colors w-full"
          >
            {isProcessing ? 'Processing with Luma AI...' : 'Analyze Audio Transcription'}
          </button>
        )}
      </div>
    </div>
    </>
  )
}
