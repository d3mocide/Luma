/* ──────────────────────────────────────────────────────────────────────────
 * SAFE-AREA / VIEWPORT DIAGNOSTIC OVERLAY  (temporary — for PR #9 diagnosis)
 *
 * Purpose: stop guessing at the iOS standalone PWA "black bar at the bottom".
 * It can't be reproduced in this environment, so we instrument the running app
 * and read ground truth from the user's actual device with a single screenshot.
 *
 * Activation (any one):
 *   - URL has ?debug=1            (works in Safari browser tab)
 *   - tap the TOP-LEFT corner 5x  (works inside the installed home-screen PWA,
 *                                   where the URL is always the start_url "/")
 *
 * What it shows:
 *   1. COLORED LAYER TEST — paints <html> crimson, <body> green, .luma-bg blue.
 *      The colour of the bottom bar tells us which layer fails to reach the
 *      true screen bottom:
 *        blue   → app shell reaches the bottom (bar is NOT a coverage failure)
 *        green  → <body> reaches bottom, shell stops short
 *        crimson→ only the <html> canvas paints there (cover works; content gap)
 *        black  → nothing paints there → viewport-fit=cover is NOT covering
 *   2. LIVE READOUT — standalone state, all the viewport heights, and the real
 *      measured env(safe-area-inset-*) values.
 *
 * Remove this file + its import in main.tsx once the cause is confirmed.
 * ────────────────────────────────────────────────────────────────────────── */

const PANEL_ID = 'luma-safearea-debug'
const STYLE_ID = 'luma-safearea-debug-style'

function measureInset(side: 'top' | 'right' | 'bottom' | 'left'): number {
  const probe = document.createElement('div')
  const edge = side === 'top' || side === 'bottom' ? 'height' : 'width'
  probe.setAttribute(
    'style',
    [
      'position:fixed',
      `${side}:0`,
      'left:0',
      edge === 'height' ? 'width:1px' : 'top:0',
      `${edge}:env(safe-area-inset-${side},0px)`,
      'pointer-events:none',
      'visibility:hidden',
      'z-index:-9999',
    ].join(';'),
  )
  document.documentElement.appendChild(probe)
  const rect = probe.getBoundingClientRect()
  document.documentElement.removeChild(probe)
  return Math.round(edge === 'height' ? rect.height : rect.width)
}

function injectLayerColors(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    html { background: #9f1239 !important; }            /* crimson */
    body { background: #15803d !important; }            /* green   */
    .luma-bg { background: #1d4ed8 !important; }         /* blue    */
    .luma-bg::before, .luma-bg::after { display: none !important; }
  `
  document.head.appendChild(style)
}

function removeLayerColors(): void {
  document.getElementById(STYLE_ID)?.remove()
}

function measureVH(unit: 'vh' | 'svh' | 'lvh' | 'dvh'): number {
  const probe = document.createElement('div')
  probe.setAttribute(
    'style',
    `position:fixed;top:0;left:0;width:1px;height:100${unit};visibility:hidden;pointer-events:none;z-index:-9999`,
  )
  document.documentElement.appendChild(probe)
  const h = probe.getBoundingClientRect().height
  document.documentElement.removeChild(probe)
  return Math.round(h)
}

function readState() {
  const nav = navigator as unknown as { standalone?: boolean }
  const vv = window.visualViewport
  const shell = document.querySelector('.luma-bg') as HTMLElement | null
  const shellRect = shell?.getBoundingClientRect()
  const bodyRect = document.body.getBoundingClientRect()
  const insetBottom = measureInset('bottom')
  const insetTop = measureInset('top')

  const iosMatch = navigator.userAgent.match(/OS (\d+)[._](\d+)/)
  const iosVer = iosMatch ? `${iosMatch[1]}.${iosMatch[2]}` : '?'

  return {
    'iOS ver': iosVer,
    'nav.standalone': String(nav.standalone ?? 'undef'),
    'display-mode standalone': String(window.matchMedia('(display-mode: standalone)').matches),
    'window.inner H×W': `${Math.round(window.innerHeight)} × ${Math.round(window.innerWidth)}`,
    'docEl.client H×W': `${document.documentElement.clientHeight} × ${document.documentElement.clientWidth}`,
    'screen H×W': `${screen.height} × ${screen.width}`,
    'screen.availH': String(screen.availHeight),
    '100vh / 100lvh': `${measureVH('vh')} / ${measureVH('lvh')}`,
    '100svh / 100dvh': `${measureVH('svh')} / ${measureVH('dvh')}`,
    'visualViewport H': vv ? `${Math.round(vv.height)} (offTop ${Math.round(vv.offsetTop)}, scale ${vv.scale})` : 'n/a',
    'devicePixelRatio': String(window.devicePixelRatio),
    'env inset top': `${insetTop}px`,
    'env inset bottom': `${insetBottom}px`,
    'env inset L/R': `${measureInset('left')}px / ${measureInset('right')}px`,
    'body rect H': bodyRect ? `${Math.round(bodyRect.height)} (top ${Math.round(bodyRect.top)}, bot ${Math.round(bodyRect.bottom)})` : 'n/a',
    '.luma-bg rect H': shellRect ? `${Math.round(shellRect.height)} (top ${Math.round(shellRect.top)}, bot ${Math.round(shellRect.bottom)})` : 'NOT FOUND',
    'GAP innerH − shellBot': shellRect ? `${Math.round(window.innerHeight - shellRect.bottom)}px` : 'n/a',
  }
}

function buildPanel(): HTMLElement {
  const panel = document.createElement('div')
  panel.id = PANEL_ID
  panel.setAttribute(
    'style',
    [
      'position:fixed',
      'top:50px',
      'left:8px',
      'right:8px',
      'z-index:2147483647',
      'max-height:70vh',
      'overflow:auto',
      'padding:12px 14px',
      'border-radius:12px',
      'background:rgba(0,0,0,0.86)',
      'color:#e5fff0',
      'font:11px/1.5 ui-monospace,Menlo,monospace',
      'border:1px solid rgba(255,255,255,0.25)',
      'box-shadow:0 8px 30px rgba(0,0,0,0.6)',
      '-webkit-user-select:text',
      'user-select:text',
    ].join(';'),
  )
  return panel
}

function render(panel: HTMLElement): void {
  const state = readState()
  const rows = Object.entries(state)
    .map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:10px"><span style="color:#7dd3fc">${k}</span><span style="text-align:right">${v}</span></div>`)
    .join('')

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong style="color:#fbbf24">LUMA SAFE-AREA DIAG</strong>
      <div>
        <button data-act="copy" style="background:#1d4ed8;color:#fff;border:0;border-radius:6px;padding:4px 8px;margin-right:6px;font:inherit">Copy</button>
        <button data-act="close" style="background:#9f1239;color:#fff;border:0;border-radius:6px;padding:4px 8px;font:inherit">Close</button>
      </div>
    </div>
    <div style="margin-bottom:8px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,0.08)">
      Layers: <span style="color:#fb7185">html=crimson</span> · <span style="color:#4ade80">body=green</span> · <span style="color:#60a5fa">shell=blue</span>.
      Bottom-bar colour = which layer reaches the screen bottom.
    </div>
    ${rows}
  `

  panel.querySelector('[data-act="close"]')?.addEventListener('click', () => teardown())
  panel.querySelector('[data-act="copy"]')?.addEventListener('click', () => {
    const text = Object.entries(state).map(([k, v]) => `${k}: ${v}`).join('\n')
    void navigator.clipboard?.writeText(text)
  })
}

let active = false
let resizeHandler: (() => void) | null = null

function teardown(): void {
  active = false
  document.getElementById(PANEL_ID)?.remove()
  removeLayerColors()
  if (resizeHandler) {
    window.visualViewport?.removeEventListener('resize', resizeHandler)
    window.removeEventListener('resize', resizeHandler)
    window.removeEventListener('orientationchange', resizeHandler)
    resizeHandler = null
  }
}

function activate(): void {
  if (active) {
    teardown()
    return
  }
  active = true
  injectLayerColors()
  const panel = buildPanel()
  document.body.appendChild(panel)
  render(panel)
  resizeHandler = () => {
    const p = document.getElementById(PANEL_ID)
    if (p) render(p as HTMLElement)
  }
  window.visualViewport?.addEventListener('resize', resizeHandler)
  window.addEventListener('resize', resizeHandler)
  window.addEventListener('orientationchange', resizeHandler)
}

function installToggleButton(): void {
  // Visible floating button — taps in the installed standalone PWA where
  // ?debug=1 isn't available at launch. Placed up the left edge so it clears
  // the status bar/notch (top), the nav pill and the home indicator (bottom).
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = 'DBG'
  btn.setAttribute(
    'style',
    [
      'position:fixed',
      'left:12px',
      'bottom:140px',
      'width:46px',
      'height:46px',
      'border-radius:50%',
      'z-index:2147483646',
      'background:rgba(251,191,36,0.92)',
      'color:#1a0e02',
      'font:700 11px/1 ui-monospace,Menlo,monospace',
      'border:1px solid rgba(0,0,0,0.4)',
      'box-shadow:0 4px 14px rgba(0,0,0,0.5)',
      'cursor:pointer',
    ].join(';'),
  )
  btn.addEventListener('click', () => activate())
  document.body.appendChild(btn)
}

export function mountSafeAreaDebug(): void {
  const enabledByUrl = new URLSearchParams(window.location.search).get('debug') === '1'
  // Always install the visible toggle so the installed PWA can opt in.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installToggleButton)
  } else {
    installToggleButton()
  }
  if (enabledByUrl) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', activate)
    } else {
      activate()
    }
  }
}
