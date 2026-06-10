import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * KeyboardDebugOverlay — on-device telemetry for the iOS PWA keyboard / input
 * scrolling behavior.
 *
 * WHY this exists: in iOS standalone mode there is no reliable keyboard-height
 * API, and `visualViewport` resize/scroll delivery is inconsistent. Every fix
 * for the "page pans/jumps when an input is focused" bug has been built on
 * estimates (see AppShell `keyboardInset()` and the `--keyboard-inset` CSS),
 * so regressions are impossible to reason about without seeing what the device
 * actually reports. This overlay surfaces the real signals — innerHeight,
 * visualViewport metrics, inferred keyboard height, body classes, the focused
 * field's rect, and a timestamped event timeline — so the behavior can be
 * diagnosed from data instead of guessed at.
 *
 * HOW to turn it on (no URL bar needed — a PWA has none):
 *   - A small ⌨ launcher button sits in the bottom-left corner on touch
 *     devices. Tap it to open the panel; close the panel to hide it again.
 *   - On desktop (or to force it open), append `?kbdebug=1` to the URL; the
 *     state persists in localStorage. `?kbdebug=0` clears it.
 *
 * The overlay never contains a focusable text field, so it cannot itself
 * trigger or perturb the soft keyboard. All measurement is imperative (rAF +
 * direct textContent writes) to keep React re-renders out of the hot path.
 */

const OPEN_KEY = 'luma:kbdebug:open'
const MAX_LOG = 240
const Z = 2147483600

function isCoarsePointer(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

function readOpen(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('kbdebug')
    if (q === '1' || q === 'true') {
      localStorage.setItem(OPEN_KEY, '1')
      return true
    }
    if (q === '0' || q === 'false') {
      localStorage.removeItem(OPEN_KEY)
      return false
    }
    return localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function persistOpen(open: boolean): void {
  try {
    if (open) localStorage.setItem(OPEN_KEY, '1')
    else localStorage.removeItem(OPEN_KEY)
  } catch {
    /* ignore */
  }
}

interface Metrics {
  standalone: boolean
  innerH: number
  innerW: number
  clientH: number
  vvH: number
  vvW: number
  vvTop: number
  vvLeft: number
  vvScale: number
  vvPageTop: number
  keyboard: number
  winScrollY: number
  docScrollTop: number
  kbInset: string
  sat: string
  sab: string
  bodyClasses: string
  active: string
  activeTop: number
  activeBottom: number
}

function readMetrics(): Metrics {
  const vv = window.visualViewport
  const innerH = window.innerHeight
  const vvH = vv ? vv.height : innerH
  const vvTop = vv ? vv.offsetTop : 0
  // Keyboard height = layout viewport − visible region. vv.offsetTop is the
  // separate "pan" amount (how far iOS has scrolled the visual viewport to
  // reveal a focused field) and must NOT be folded into the keyboard height.
  const keyboard = Math.max(0, Math.round(innerH - vvH))

  const cs = getComputedStyle(document.documentElement)
  const el = document.activeElement as HTMLElement | null
  let active = '—'
  let activeTop = 0
  let activeBottom = 0
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
    active = describeEl(el)
    const r = el.getBoundingClientRect()
    activeTop = Math.round(r.top)
    activeBottom = Math.round(r.bottom)
  } else if (el && el !== document.body) {
    active = `${el.tagName.toLowerCase()} (not a field)`
  }

  return {
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS legacy standalone flag
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    innerH,
    innerW: window.innerWidth,
    clientH: document.documentElement.clientHeight,
    vvH: Math.round(vvH),
    vvW: vv ? Math.round(vv.width) : window.innerWidth,
    vvTop: Math.round(vvTop),
    vvLeft: vv ? Math.round(vv.offsetLeft) : 0,
    vvScale: vv ? Math.round(vv.scale * 100) / 100 : 1,
    vvPageTop: vv ? Math.round(vv.pageTop) : 0,
    keyboard,
    winScrollY: Math.round(window.scrollY),
    docScrollTop: Math.round(document.documentElement.scrollTop),
    kbInset: cs.getPropertyValue('--keyboard-inset').trim() || '(unset)',
    sat: cs.getPropertyValue('--sat').trim() || '(unset)',
    sab: cs.getPropertyValue('--sab').trim() || '(unset)',
    bodyClasses: document.body.className || '(none)',
    active,
    activeTop,
    activeBottom,
  }
}

function describeEl(el: Element): string {
  const h = el as HTMLElement
  const label =
    h.id ||
    h.getAttribute('name') ||
    h.getAttribute('placeholder') ||
    h.getAttribute('aria-label') ||
    ''
  return `${el.tagName.toLowerCase()}${label ? ` "${label.slice(0, 24)}"` : ''}`
}

function formatMetrics(m: Metrics): string {
  const lines = [
    `mode      ${m.standalone ? 'standalone PWA' : 'browser tab'}`,
    `inner     ${m.innerW} × ${m.innerH}   clientH ${m.clientH}`,
    `visualVP  ${m.vvW} × ${m.vvH}   top ${m.vvTop}  scale ${m.vvScale}`,
    `KEYBOARD  ${m.keyboard}px  (inner − vvH)   pan ${m.vvTop}px`,
    `kbInset   ${m.kbInset}   ← AppShell estimate`,
    `scroll    win.y ${m.winScrollY}   doc.top ${m.docScrollTop}   vv.pageTop ${m.vvPageTop}`,
    `safe-area sat ${m.sat}   sab ${m.sab}`,
    `body      ${m.bodyClasses}`,
    `focus     ${m.active}`,
    m.active !== '—' ? `field y    top ${m.activeTop}  bottom ${m.activeBottom}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

interface LogEntry {
  t: number
  kind: string
  detail: string
}

export default function KeyboardDebugOverlay() {
  // The launcher is meaningful on touch devices (the bug is iOS-only); `?kbdebug`
  // can still force the whole system on anywhere (e.g. desktop testing).
  const launcherAvailable = useMemo(() => isCoarsePointer() || readOpen(), [])
  const [open, setOpen] = useState(readOpen)
  const [showBands, setShowBands] = useState(true)
  const [, forceRender] = useState(0)

  const metricsRef = useRef<HTMLPreElement | null>(null)
  const bandVisibleRef = useRef<HTMLDivElement | null>(null)
  const bandKbRef = useRef<HTMLDivElement | null>(null)
  const logRef = useRef<LogEntry[]>([])
  const t0Ref = useRef<number>(performance.now())
  const copyBtnRef = useRef<HTMLButtonElement>(null)

  const setOpenPersist = useCallback((next: boolean) => {
    persistOpen(next)
    setOpen(next)
  }, [])

  const pushLog = useCallback((kind: string, detail: string) => {
    const entry: LogEntry = {
      t: Math.round(performance.now() - t0Ref.current),
      kind,
      detail,
    }
    const arr = logRef.current
    arr.push(entry)
    if (arr.length > MAX_LOG) arr.splice(0, arr.length - MAX_LOG)
    forceRender((n) => (n + 1) % 1_000_000)
  }, [])

  // Live metrics loop + visual band positioning. Imperative on purpose.
  useEffect(() => {
    if (!open) return
    let raf = 0
    const tick = () => {
      const m = readMetrics()
      if (metricsRef.current) metricsRef.current.textContent = formatMetrics(m)
      if (showBands) {
        if (bandVisibleRef.current) {
          bandVisibleRef.current.style.top = `${m.vvTop}px`
          bandVisibleRef.current.style.height = `${m.vvH}px`
        }
        if (bandKbRef.current) {
          bandKbRef.current.style.top = `${m.vvTop + m.vvH}px`
          bandKbRef.current.style.height = `${m.keyboard}px`
          bandKbRef.current.style.opacity = m.keyboard > 0 ? '1' : '0'
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, showBands])

  // Event instrumentation.
  useEffect(() => {
    if (!open) return

    const snap = () => {
      const m = readMetrics()
      return `vv:${m.vvH} top:${m.vvTop} kbd:${m.keyboard} win.y:${m.winScrollY}`
    }

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target
      if (t instanceof HTMLElement) pushLog('focusin', `${describeEl(t)}  | ${snap()}`)
    }
    const onFocusOut = (e: FocusEvent) => {
      const t = e.target
      if (t instanceof HTMLElement) pushLog('focusout', `${describeEl(t)}  | ${snap()}`)
    }
    const onWinResize = () => pushLog('win.resize', snap())
    const onWinScroll = () => pushLog('win.scroll', snap())

    const vv = window.visualViewport
    const onVvResize = () => pushLog('vv.resize', snap())
    const onVvScroll = () => pushLog('vv.scroll', snap())

    // Watch the body class toggled by AppShell so the timeline lines up with
    // when the app *thinks* the keyboard opened vs. when the device reacted.
    let lastClasses = document.body.className
    const mo = new MutationObserver(() => {
      const now = document.body.className
      if (now !== lastClasses) {
        pushLog('body.class', `"${now || '(none)'}"  | ${snap()}`)
        lastClasses = now
      }
    })
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('resize', onWinResize)
    window.addEventListener('scroll', onWinScroll, { passive: true })
    vv?.addEventListener('resize', onVvResize)
    vv?.addEventListener('scroll', onVvScroll)

    pushLog('init', `overlay armed  | ${snap()}`)

    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('resize', onWinResize)
      window.removeEventListener('scroll', onWinScroll)
      vv?.removeEventListener('resize', onVvResize)
      vv?.removeEventListener('scroll', onVvScroll)
      mo.disconnect()
    }
  }, [open, pushLog])

  const resetLog = useCallback(() => {
    logRef.current = []
    t0Ref.current = performance.now()
    forceRender((n) => (n + 1) % 1_000_000)
  }, [])

  const copyAll = useCallback(() => {
    const m = readMetrics()
    const header = [
      `Luma keyboard debug — ${new Date().toISOString()}`,
      `UA: ${navigator.userAgent}`,
      `DPR: ${window.devicePixelRatio}`,
      '',
      formatMetrics(m),
      '',
      '--- event timeline (ms from reset) ---',
    ].join('\n')
    const body = logRef.current
      .map((e) => `+${String(e.t).padStart(6, ' ')}ms  ${e.kind.padEnd(11, ' ')} ${e.detail}`)
      .join('\n')
    const text = `${header}\n${body}\n`

    const done = (ok: boolean) => {
      const btn = copyBtnRef.current
      if (btn) {
        const prev = btn.textContent
        btn.textContent = ok ? 'copied ✓' : 'copy failed'
        window.setTimeout(() => {
          if (copyBtnRef.current) copyBtnRef.current.textContent = prev
        }, 1400)
      }
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => done(true),
        () => done(false),
      )
    } else {
      // Fallback for older WebViews: select a temp textarea.
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        done(ok)
      } catch {
        done(false)
      }
    }
  }, [])

  // Nothing to show: not a touch device and not force-enabled.
  if (!launcherAvailable && !open) return null

  // Collapsed state: just the floating launcher button.
  if (!open) {
    return (
      <button
        type="button"
        aria-label="Open keyboard debug overlay"
        onClick={() => setOpenPersist(true)}
        style={{
          position: 'fixed',
          left: 'max(env(safe-area-inset-left, 0px), 10px)',
          bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 10px) + 76px)',
          zIndex: Z,
          width: 38,
          height: 38,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 17,
          lineHeight: 1,
          color: '#7dd3fc',
          background: 'rgba(8,12,20,0.72)',
          border: '1px solid rgba(56,189,248,0.4)',
          boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          opacity: 0.78,
        }}
      >
        ⌨
      </button>
    )
  }

  const log = logRef.current

  return (
    <>
      {/* Visual viewport bands — illustrate where the device thinks the visible
          region ends and the keyboard begins. pointer-events:none so they never
          intercept taps. */}
      {showBands && (
        <>
          <div
            ref={bandVisibleRef}
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              border: '1px solid rgba(56,189,248,0.55)',
              boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.12)',
              pointerEvents: 'none',
              zIndex: Z - 2,
            }}
          />
          <div
            ref={bandKbRef}
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              background:
                'repeating-linear-gradient(45deg, rgba(251,113,133,0.16) 0 10px, rgba(251,113,133,0.06) 10px 20px)',
              borderTop: '1px dashed rgba(251,113,133,0.7)',
              pointerEvents: 'none',
              zIndex: Z - 2,
            }}
          />
        </>
      )}

      <div
        style={{
          position: 'fixed',
          left: 8,
          right: 8,
          bottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
          zIndex: Z,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 11,
          lineHeight: 1.35,
          color: '#dbeafe',
          background: 'rgba(8,12,20,0.92)',
          border: '1px solid rgba(56,189,248,0.35)',
          borderRadius: 12,
          boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          maxHeight: '52vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header / controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 700, color: '#7dd3fc', letterSpacing: '0.02em' }}>
            ⌨ kbdebug
          </span>
          <span style={{ flex: 1 }} />
          <Btn onClick={() => setShowBands((b) => !b)}>{showBands ? 'bands✓' : 'bands'}</Btn>
          <Btn onClick={resetLog}>reset</Btn>
          <Btn onClick={copyAll} btnRef={copyBtnRef}>
            copy
          </Btn>
          <Btn onClick={() => setOpenPersist(false)} danger>
            ×
          </Btn>
        </div>

        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '8px' }}>
          <pre
            ref={metricsRef}
            style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#bfdbfe' }}
          />
          <div
            style={{
              margin: '8px 0 4px',
              color: '#7dd3fc',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: 6,
            }}
          >
            timeline · {log.length} events
          </div>
          <div>
            {log.length === 0 && (
              <div style={{ color: '#64748b' }}>tap an input field to capture events…</div>
            )}
            {log
              .slice()
              .reverse()
              .map((e, i) => (
                <div key={log.length - i} style={{ display: 'flex', gap: 6, padding: '1px 0' }}>
                  <span style={{ color: '#475569', flexShrink: 0 }}>
                    +{String(e.t).padStart(5, ' ')}
                  </span>
                  <span style={{ color: kindColor(e.kind), flexShrink: 0, width: 72 }}>
                    {e.kind}
                  </span>
                  <span style={{ color: '#cbd5e1', wordBreak: 'break-word' }}>{e.detail}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  )
}

function kindColor(kind: string): string {
  if (kind.startsWith('focus')) return '#fbbf24'
  if (kind.startsWith('vv')) return '#34d399'
  if (kind.startsWith('win')) return '#f472b6'
  if (kind === 'body.class') return '#a78bfa'
  return '#7dd3fc'
}

function Btn({
  children,
  onClick,
  danger,
  btnRef,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
  btnRef?: React.Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onClick}
      style={{
        font: 'inherit',
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: 7,
        cursor: 'pointer',
        color: danger ? '#fecaca' : '#e0f2fe',
        background: danger ? 'rgba(244,63,94,0.18)' : 'rgba(56,189,248,0.14)',
        border: `1px solid ${danger ? 'rgba(244,63,94,0.4)' : 'rgba(56,189,248,0.32)'}`,
      }}
    >
      {children}
    </button>
  )
}
