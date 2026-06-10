import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Sparkles, Send, Plus, MessageSquare } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { LumaLogo } from '../components/ui/LumaLogo'
import { api, csrfHeaders, Insight } from '../lib/api'

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



export default function CoachRoute() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = tabParam === 'insights' ? 'insights' : tabParam === 'history' ? 'history' : 'chat'
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const seedSentRef = useRef(false)

  // Scroll the messages list to the bottom by moving ITS OWN scroller — never
  // scrollIntoView, which also scrolls the window/visual viewport and, with the
  // keyboard up on iOS, pans the whole fixed shell (header off-screen, nav
  // wedged under the composer).
  const scrollMessagesToEnd = (behavior: ScrollBehavior) => {
    const el = messagesRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }

  useEffect(() => {
    scrollMessagesToEnd('smooth')
  }, [messages])

  // Pre-populate input from thread_seed when navigating from an insight card
  useEffect(() => {
    const seed = (location.state as { thread_seed?: string } | null)?.thread_seed
    if (seed && !seedSentRef.current) {
      seedSentRef.current = true
      setInput(seed)
      setSearchParams({}, { replace: true })
    }
  }, [location.state, setSearchParams])

  const handleAskFromInsight = useCallback((seed: string) => {
    setInput(seed)
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

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
    setActiveThreadId(threadId)
    const data = await api.get<{ messages: Message[] }>(`/coach/threads/${threadId}`)
    setMessages(data.messages || [])
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

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
        headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
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
    setSearchParams({}, { replace: true })
  }

  const renderActions = () => {
    if (activeTab === 'insights') return null
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} onClick={startNewThread}>
          <Plus size={12}/> New
        </button>
      </div>
    )
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
        position: 'relative', zIndex: 10,
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
        {renderActions()}
      </header>

      {/* Tab bar */}
      <div className="coach-tabs-container" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 40px',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ display: 'flex' }}>
          {(['chat', 'insights', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => tab === 'chat' ? setSearchParams({}, { replace: true }) : setSearchParams({ tab }, { replace: true })}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--sky-400)' : '2px solid transparent',
                marginBottom: -1,
                background: 'none',
                cursor: 'pointer',
                color: activeTab === tab ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
                fontFamily: 'inherit',
                textTransform: 'capitalize',
                transition: 'color 0.15s',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="coach-tab-actions">
          {renderActions()}
        </div>
      </div>

      {activeTab === 'insights' ? (
        <InsightsTab onAsk={handleAskFromInsight} />
      ) : activeTab === 'history' ? (
        <HistoryTab
          threads={threadsData?.threads ?? []}
          activeThreadId={activeThreadId}
          onSelectThread={loadThread}
          onNewThread={startNewThread}
        />
      ) : (
        <>
          {/* Messages */}
          <div ref={messagesRef} className="thin-scroll coach-messages" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '32px 40px', position: 'relative', zIndex: 1 }}>
            <div className="coach-messages-container" style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

              {messages.length === 0 && <CoachIntro onSuggest={send} />}

              {messages.map((msg, i) => (
                msg.role === 'user' ? (
                  <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div className="coach-message-card-user" style={{
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
                    <div className="glass coach-message-card" style={{ padding: 18, borderRadius: '4px 20px 20px 20px', maxWidth: 600, flex: 1 }}>
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
                      <div className="coach-prose">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p style={{ margin: '0 0 0.6em', fontSize: 15, lineHeight: 1.6, color: 'var(--fg-primary)' }}>{children}</p>,
                            h1: ({ children }) => <h1 style={{ margin: '0.8em 0 0.3em', fontSize: 17, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.2, color: 'var(--fg-primary)' }}>{children}</h1>,
                            h2: ({ children }) => <h2 style={{ margin: '0.8em 0 0.3em', fontSize: 16, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.2, color: 'var(--fg-primary)' }}>{children}</h2>,
                            h3: ({ children }) => <h3 style={{ margin: '0.6em 0 0.25em', fontSize: 15, fontWeight: 600, lineHeight: 1.2, color: 'var(--fg-primary)' }}>{children}</h3>,
                            ul: ({ children }) => <ul style={{ margin: '0.4em 0 0.6em', paddingLeft: 20, color: 'var(--fg-primary)' }}>{children}</ul>,
                            ol: ({ children }) => <ol style={{ margin: '0.4em 0 0.6em', paddingLeft: 20, color: 'var(--fg-primary)' }}>{children}</ol>,
                            li: ({ children }) => <li style={{ fontSize: 15, lineHeight: 1.6, marginBottom: '0.2em' }}>{children}</li>,
                            strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--fg-primary)' }}>{children}</strong>,
                            em: ({ children }) => <em style={{ color: 'var(--fg-secondary)' }}>{children}</em>,
                            code: ({ children }) => <code style={{ fontSize: 13, fontFamily: 'var(--font-mono)', background: 'var(--surface-2)', borderRadius: 4, padding: '1px 5px', color: 'var(--fg-secondary)' }}>{children}</code>,
                            hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0.8em 0' }} />,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                        {msg.streaming && !msg.content && <span style={{ opacity: 0.4, fontSize: 15 }}>…</span>}
                        {msg.streaming && msg.content && <span className="cursor-blink" style={{ marginLeft: 2, opacity: 0.6 }}>▌</span>}
                      </div>
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
              <div className="glass-bright" style={{
                padding: '4px 4px 4px 18px',
                display: 'flex', alignItems: 'center', gap: 8, borderRadius: 18,
              }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
                  // The keyboard-open shrink reduces the messages area; re-pin
                  // the conversation to its latest message by scrolling the
                  // list's own scroller (not scrollIntoView, which would pan
                  // the shell on iOS).
                  onFocus={() => requestAnimationFrame(() => scrollMessagesToEnd('auto'))}
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
        </>
      )}
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

const SUGGESTIONS = [
  'Why did my weight spike this week?',
  'How is my LDL trending?',
  'Am I hitting my fiber targets?',
  'What meals are hurting my sat fat budget?',
  'How does my sleep affect my weight?',
  'What should I eat more of?',
]

const SEVERITY_COLOR: Record<string, string> = {
  warning: 'var(--bad)',
  info: 'var(--sky-400)',
  positive: 'var(--good)',
}

function InsightsTab({ onAsk }: { onAsk: (seed: string) => void }) {
  const { data, isLoading } = useQuery<{ insights: Insight[] }>({
    queryKey: ['insights'],
    queryFn: () => api.get('/insights?limit=50'),
  })

  const insights = data?.insights ?? []

  return (
    <div className="thin-scroll coach-tab-content" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '28px 40px', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[180, 140, 160].map((h, i) => (
              <div key={i} className="glass" style={{ height: h, borderRadius: 16, opacity: 0.4, animation: 'pulse 1.5s infinite' }}/>
            ))}
          </div>
        )}
        {!isLoading && insights.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ color: 'var(--fg-tertiary)', fontSize: 14 }}>No insights yet — check back after your first full day of logging.</p>
          </div>
        )}
        {!isLoading && insights.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {insights.map((insight) => {
              const color = SEVERITY_COLOR[insight.severity] ?? 'var(--fg-tertiary)'
              const date = new Date(insight.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              return (
                <div
                  key={insight.id}
                  className="glass"
                  style={{ padding: 20, borderRadius: 16 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>
                      {insight.severity}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{date}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4, color: 'var(--fg-primary)', fontWeight: 400 }}>
                    {insight.headline}
                  </p>
                  {insight.body && (
                    <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-secondary)' }}>
                      {insight.body}
                    </p>
                  )}
                  {insight.thread_seed && (
                    <button
                      onClick={() => onAsk(insight.thread_seed)}
                      style={{
                        marginTop: 14, padding: '6px 12px', fontSize: 12,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.25)',
                        borderRadius: 20, cursor: 'pointer', color: '#c4b5fd', fontFamily: 'inherit',
                        transition: 'background 0.15s, border-color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(167,139,250,0.18)'
                        e.currentTarget.style.borderColor = 'rgba(167,139,250,0.45)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(167,139,250,0.10)'
                        e.currentTarget.style.borderColor = 'rgba(167,139,250,0.25)'
                      }}
                    >
                      <Sparkles size={11}/> Ask Luma
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryTab({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
}: {
  threads: Thread[]
  activeThreadId: string | null
  onSelectThread: (id: string) => void
  onNewThread: () => void
}) {
  return (
    <div className="thin-scroll coach-tab-content" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '28px 40px', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {threads.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, marginBottom: 20 }}>No conversation history yet.</p>
            <button className="btn btn-primary" onClick={onNewThread}>
              <Plus size={14} /> Start a conversation
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="eyebrow">Conversations</span>
              <span style={{ fontSize: 11, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>
                {threads.length} {threads.length === 1 ? 'thread' : 'threads'}
              </span>
            </div>
            
            {threads.map((t) => {
              const isActive = t.id === activeThreadId
              const date = new Date(t.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
              
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectThread(t.id)}
                  className={isActive ? "glass-bright" : "glass"}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    padding: 20,
                    borderRadius: 16,
                    cursor: 'pointer',
                    width: '100%',
                    border: '1px solid',
                    borderColor: isActive ? 'rgba(56,189,248,0.4)' : 'var(--glass-edge)',
                    textAlign: 'left',
                    background: isActive ? 'linear-gradient(165deg, rgba(56,189,248,0.15), rgba(56,189,248,0.08))' : undefined,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'
                      e.currentTarget.style.background = 'var(--glass-3)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'var(--glass-edge)'
                      e.currentTarget.style.background = 'linear-gradient(165deg, var(--glass-2), var(--glass-1))'
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, width: '100%' }}>
                    <span style={{
                      fontSize: 16,
                      fontWeight: 500,
                      color: isActive ? 'var(--fg-primary)' : 'var(--fg-secondary)',
                      lineHeight: 1.4,
                      flex: 1,
                    }}>
                      {t.title}
                    </span>
                    {isActive && (
                      <span className="eyebrow" style={{
                        fontSize: 9,
                        color: 'var(--sky-300)',
                        background: 'rgba(56,189,248,0.15)',
                        padding: '2px 8px',
                        borderRadius: 10,
                        border: '1px solid rgba(56,189,248,0.25)',
                        flexShrink: 0,
                      }}>
                        Active
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: 'var(--fg-quiet)',
                    marginTop: 8,
                    fontFamily: 'var(--font-mono)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <MessageSquare size={13} style={{ opacity: 0.6 }} />
                    {date}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function CoachIntro({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 0 4px' }}>
      <div style={{ display: 'inline-flex', marginBottom: 18 }}>
        <LumaLogo size={64}/>
      </div>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
        <span className="serif-italic" style={{
          background: 'var(--accent-gradient-hero)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>Ask me anything</span> about your trends.
      </h2>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--fg-tertiary)' }}>
        Biometrics, sleep, weight, and meals are stored locally. External AI requests are fully anonymized — your identity never leaves this server.
      </p>
      <div className="coach-suggestions" style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 560, marginInline: 'auto' }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            style={{
              padding: '8px 14px',
              borderRadius: 20,
              border: '1px solid rgba(56,189,248,0.25)',
              background: 'rgba(56,189,248,0.07)',
              color: 'var(--fg-secondary)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s, color 0.15s',
              fontFamily: 'inherit',
              lineHeight: 1.4,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(56,189,248,0.55)'
              e.currentTarget.style.background = 'rgba(56,189,248,0.14)'
              e.currentTarget.style.color = 'var(--fg-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(56,189,248,0.25)'
              e.currentTarget.style.background = 'rgba(56,189,248,0.07)'
              e.currentTarget.style.color = 'var(--fg-secondary)'
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
