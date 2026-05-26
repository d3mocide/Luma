import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, Mic } from 'lucide-react'
import { LumaLogo } from '../components/ui/LumaLogo'

const SUGGESTION_CHIPS = [
  "Explain last night's HRV",
  "Plan for a long run tomorrow",
  "What's driving my LDL?",
  "Lower-sodium swaps",
]

export default function CoachRoute() {
  const [messages, setMessages] = useState<Array<{ from: 'user' | 'coach'; text: string }>>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messages.length === 0) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  const send = (text: string) => {
    if (!text.trim()) return
    setMessages((prev) => [
      ...prev,
      { from: 'user', text },
      { from: 'coach', text: 'AI coaching arrives in Phase 2. Your trends, meals, and biometrics will all be in context.' },
    ])
    setInput('')
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
            <h1 className="coach-header-title" style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--fg-primary)' }}>Luma</h1>
            <div className="coach-header-subtitle" style={{ fontSize: 12, color: 'var(--fg-tertiary)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--good)', boxShadow: '0 0 6px var(--good-glow)',
              }}/>
              Grounded in your last 90 days
            </div>
          </div>
        </div>
        <button
          className="btn btn-ghost coach-new-thread-btn"
          style={{ padding: '8px 12px', fontSize: 12 }}
          onClick={() => setMessages([])}
        >
          New thread
        </button>
      </header>

      {/* Messages */}
      <div className="thin-scroll coach-messages" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '32px 40px', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {messages.length === 0 && <CoachIntro onSuggest={send}/>}

          {messages.map((msg, i) => (
            msg.from === 'user' ? (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  padding: '12px 18px',
                  maxWidth: 520,
                  background: 'linear-gradient(165deg, rgba(56,189,248,0.20), rgba(56,189,248,0.10))',
                  border: '1px solid rgba(56,189,248,0.30)',
                  borderRadius: '20px 20px 4px 20px',
                  fontSize: 15, lineHeight: 1.5,
                  color: 'var(--fg-primary)',
                }}>
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: 'linear-gradient(135deg, rgba(167,139,250,0.3), rgba(56,189,248,0.2))',
                  border: '1px solid rgba(167,139,250,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Sparkles size={14} color="#c4b5fd"/>
                </div>
                <div className="glass" style={{
                  padding: 18,
                  borderRadius: '4px 20px 20px 20px',
                  maxWidth: 600, flex: 1,
                }}>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--fg-primary)' }}>{msg.text}</p>
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
          {/* Suggestion chips */}
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
            display: 'flex', alignItems: 'center', gap: 8,
            borderRadius: 18,
          }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              placeholder="Ask Luma…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 15,
                padding: '14px 0',
              }}
            />
            <button className="btn btn-ghost" style={{ padding: 10 }}><Mic size={16}/></button>
            <button
              className="btn btn-primary"
              style={{ padding: '10px 16px', borderRadius: 14 }}
              onClick={() => send(input)}
            >
              <Send size={14}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CoachIntro({ onSuggest: _onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 0 4px' }}>
      <div style={{ display: 'inline-flex', marginBottom: 18 }}>
        <LumaLogo size={48}/>
      </div>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
        <span className="serif-italic gradient-accent-text" style={{
          background: 'linear-gradient(120deg, #c4b5fd, #fde68a)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>Ask me anything</span> about your trends.
      </h2>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--fg-tertiary)' }}>
        I see your weight, sleep, biometrics, and meals. Privacy stays here — nothing leaves your server.
      </p>
    </div>
  )
}
