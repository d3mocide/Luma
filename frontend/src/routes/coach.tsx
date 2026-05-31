import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Send, Plus, ChevronDown } from 'lucide-react'
import { LumaLogo } from '../components/ui/LumaLogo'
import { api } from '../lib/api'

const BASE = '/api/v1'

interface Thread {
  id: string
  title: string
  created_at: string
}

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  toolCalls?: string[]
}

const SUGGESTION_CHIPS = [
  "Explain last night's HRV",
  "Plan for a long run tomorrow",
  "What's driving my LDL?",
  "Lower-sodium swaps",
]

export default function CoachRoute() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [showThreads, setShowThreads] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const { data: threadsData } = useQuery<{ threads: Thread[] }>({
    queryKey: ['coach-threads'],
    queryFn: () => api.get('/coach/threads'),
  })

  const createThread = useMutation({
    mutationFn: (title: string) => api.post<Thread>('/coach/threads', { title }),
    onSuccess: (thread) => {
      queryClient.invalidateQueries({ queryKey: ['coach-threads'] })
      setActiveThreadId(thread.id)
    },
  })

  const loadThread = useCallback(async (threadId: string) => {
    setShowThreads(false)
    setActiveThreadId(threadId)
    const data = await api.get<{ messages: Message[] }>(`/coach/threads/${threadId}`)
    setMessages(data.messages || [])
  }, [])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return
    setInput('')

    let threadId = activeThreadId
    if (!threadId) {
      const thread = await createThread.mutateAsync(text.slice(0, 60))
      threadId = thread.id
    }

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setStreaming(true)

    setMessages((prev) => [...prev, { role: 'assistant', content: '', streaming: true, toolCalls: [] }])

    try {
      const resp = await fetch(`${BASE}/coach/threads/${threadId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      if (!resp.body) throw new Error('No response body')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'token') {
              setMessages((prev) => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + event.text }
                }
                return next
              })
            } else if (event.type === 'tool_call') {
              setMessages((prev) => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') {
                  next[next.length - 1] = {
                    ...last,
                    toolCalls: [...(last.toolCalls ?? []), event.name],
                  }
                }
                return next
              })
            } else if (event.type === 'error') {
              setMessages((prev) => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: event.text || 'Coach temporarily unavailable.', streaming: false, toolCalls: [] }
                }
                return next
              })
            } else if (event.type === 'done') {
              setMessages((prev) => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') {
                  next[next.length - 1] = {
                    ...last,
                    content: last.content || 'No response — please try again.',
                    streaming: false,
                    toolCalls: [],
                  }
                }
                return next
              })
            }
          } catch {
            // ignore malformed events
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: 'Something went wrong. Please try again.', streaming: false }
        }
        return next
      })
    } finally {
      setStreaming(false)
    }
  }, [streaming, activeThreadId, createThread])

  const startNewThread = () => {
    setActiveThreadId(null)
    setMessages([])
    setShowThreads(false)
  }

  return (
    <div className="coach-page" style={{ height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Atmospheric glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(167,139,250,0.10), transparent 60%), radial-gradient(ellipse 40% 40% at 20% 0%, rgba(251,191,36,0.10), transparent 60%)',
        pointerEvents: 'none', zIndex: 0,
      }}/>

      {/* Header */}
      <header className="coach-header" style={{
        padding: '28px 40px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        position: 'relative', zIndex: 1,
      }}>
        <div className="coach-header-main" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(167,139,250,0.3), rgba(56,189,248,0.2))',
            border: '1px solid rgba(167,139,250,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(167,139,250,0.2)',
          }}>
            <Sparkles size={18} color="#c4b5fd"/>
          </div>
          <div className="coach-header-copy">
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--fg-primary)' }}>Luma</h1>
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--good)', boxShadow: '0 0 6px var(--good-glow)' }}/>
              Grounded in your last 90 days
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Thread picker */}
          {(threadsData?.threads?.length ?? 0) > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-ghost"
                style={{ padding: '8px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => setShowThreads((v) => !v)}
              >
                History <ChevronDown size={12}/>
              </button>
              {showThreads && (
                <div className="glass" style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 8,
                  minWidth: 220, borderRadius: 12, padding: 8, zIndex: 10,
                }}>
                  {threadsData?.threads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => loadThread(t.id)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        color: t.id === activeThreadId ? 'var(--fg-primary)' : 'var(--fg-secondary)',
                        fontSize: 13,
                        background: t.id === activeThreadId ? 'rgba(255,255,255,0.06)' : 'none',
                      }}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} onClick={startNewThread}>
            <Plus size={12}/> New
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="thin-scroll coach-messages" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '32px 40px', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {messages.length === 0 && <CoachIntro />}

          {messages.map((msg, i) => (
            msg.role === 'user' ? (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  padding: '12px 18px', maxWidth: 520,
                  background: 'linear-gradient(165deg, rgba(56,189,248,0.20), rgba(56,189,248,0.10))',
                  border: '1px solid rgba(56,189,248,0.30)',
                  borderRadius: '20px 20px 4px 20px',
                  fontSize: 15, lineHeight: 1.5, color: 'var(--fg-primary)',
                }}>
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: 'linear-gradient(135deg, rgba(167,139,250,0.3), rgba(56,189,248,0.2))',
                  border: '1px solid rgba(167,139,250,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Sparkles size={14} color="#c4b5fd"/>
                </div>
                <div className="glass" style={{ padding: 18, borderRadius: '4px 20px 20px 20px', maxWidth: 600, flex: 1 }}>
                  {(msg.toolCalls?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {msg.toolCalls!.map((name, j) => (
                        <span key={j} style={{
                          fontSize: 11, color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)',
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sky-400)', display: 'inline-block', animation: 'pulse 1s infinite' }}/>
                          {_toolLabel(name)}
                        </span>
                      ))}
                    </div>
                  )}
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--fg-primary)', whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                    {msg.streaming && !msg.content && <span style={{ opacity: 0.4 }}>…</span>}
                    {msg.streaming && msg.content && <span className="cursor-blink" style={{ marginLeft: 2, opacity: 0.6 }}>▌</span>}
                  </p>
                </div>
              </div>
            )
          ))}

          <div ref={bottomRef}/>
        </div>
      </div>

      {/* Composer */}
      <div className="coach-composer" style={{ padding: '20px 40px 28px', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {messages.length === 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {SUGGESTION_CHIPS.map((s, i) => (
                <button key={i} className="btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => send(s)}>
                  <Sparkles size={11} color="var(--sun-300)"/> {s}
                </button>
              ))}
            </div>
          )}
          <div className="glass-bright" style={{
            padding: '4px 4px 4px 18px',
            display: 'flex', alignItems: 'center', gap: 8, borderRadius: 18,
          }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              placeholder="Ask Luma…"
              disabled={streaming}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 15,
                padding: '14px 0', opacity: streaming ? 0.5 : 1,
              }}
            />
            <button
              className="btn btn-primary"
              style={{ padding: '10px 16px', borderRadius: 14, opacity: streaming ? 0.5 : 1 }}
              onClick={() => send(input)}
              disabled={streaming}
            >
              {streaming ? (
                <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', animation: 'pulse 1s infinite 0ms' }}/>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', animation: 'pulse 1s infinite 150ms' }}/>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', animation: 'pulse 1s infinite 300ms' }}/>
                </span>
              ) : <Send size={14}/>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function _toolLabel(name: string): string {
  const labels: Record<string, string> = {
    query_biometric_trend: 'Reading biometric trends…',
    query_nutrition_rollup: 'Calculating nutrition averages…',
    get_recent_meals: 'Loading recent meals…',
    propose_meal_swap: 'Proposing meal swap…',
    modify_plan: 'Updating meal plan…',
    get_user_goals: 'Checking your goals…',
    get_recent_alerts: 'Reviewing recent alerts…',
  }
  return labels[name] ?? `Running ${name}…`
}

function CoachIntro() {
  return (
    <div style={{ textAlign: 'center', padding: '20px 0 4px' }}>
      <div style={{ display: 'inline-flex', marginBottom: 18 }}>
        <LumaLogo size={48}/>
      </div>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
        <span className="serif-italic" style={{
          background: 'var(--accent-gradient-hero)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>Ask me anything</span> about your trends.
      </h2>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--fg-tertiary)' }}>
        I see your weight, sleep, biometrics, and meals. Privacy stays here — nothing leaves your server.
      </p>
    </div>
  )
}
