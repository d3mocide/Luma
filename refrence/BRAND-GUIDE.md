# Luma — Brand & Design Guide

> Single source of truth. Combines the **Luma Design System** (visual foundations and voice) with the **Final logo** geometry/lockups and the **Glassy Atmospheric redesign** language used in production mocks.
>
> Agents: this document is the canonical reference. Read top-to-bottom on first use; jump by anchor afterwards. Do not invent tokens, fonts, colors, or components that aren't grounded here. When in doubt, prefer the **redesign** language (Geist, glass, atmospheric bg) for new product surfaces — the original Tailwind/Inter spec is preserved as the engineering baseline.
>
> Repository note: production logo SVG assets live in `frontend/public/assets/`.

---

## Table of contents

1. [Brand essence](#1-brand-essence)
2. [Voice & content](#2-voice--content)
3. [Logo & marks](#3-logo--marks)
4. [Color](#4-color)
5. [Typography](#5-typography)
6. [Iconography](#6-iconography)
7. [Spacing, radius, elevation](#7-spacing-radius-elevation)
8. [Backgrounds & atmosphere](#8-backgrounds--atmosphere)
9. [Components](#9-components)
10. [Data viz](#10-data-viz)
11. [Layout](#11-layout)
12. [Motion](#12-motion)
13. [Two languages: clinical vs. atmospheric](#13-two-languages-clinical-vs-atmospheric)
14. [Asset inventory](#14-asset-inventory)
15. [Do / don't](#15-do--dont)

---

## 1. Brand essence

**Luma** — a friendly, self-hosted AI health companion. Diet & weight tracking PWA tuned to support weight loss and lower LDL cholesterol. Single-operator, data-sovereign.

The name evokes **light, luminance, illumination**. That drives everything.

| Trait | What it means in design |
|---|---|
| **Calm** | Soft surfaces, generous spacing, tabular numbers, no exclamation marks |
| **Helpful, never preachy** | Shows the data, suggests; never scolds or congratulates |
| **Companion, not coach app** | A friend with a clipboard, not a drill sergeant |
| **Quiet by default, bright on moments that matter** | Sky-blue UI; warm sun-amber accents for streaks, wins, gentle nudges |
| **Data-sovereign** | Engineer's-notebook restraint; the user owns their numbers |

The product is **dark-default** in the shipped codebase, but the brand reads equally well on a warm cream surface. Both modes are first-class.

---

## 2. Voice & content

### Tone rules

| Do | Don't |
|---|---|
| "Yesterday's adherence" | "Great job yesterday! 🎉" |
| "No plan yet — generate one in the Plan tab." | "Oops! Looks like you don't have a plan yet!" |
| "Ask Coach…" | "What can I help you with today?" |
| Lowercase units: `kg`, `bpm`, `ms`, `kcal` | Loud caps: `KG`, `BPM` |
| `+0.12 kg/wk` | `Up by a bit this week` |

### Casing

- **UI labels** — sentence case (`This week's plan`, `Today's plan`, `Generate plan`)
- **Section eyebrows / metric labels** — `UPPERCASE TRACKING-WIDE` (`WEIGHT`, `BIOMETRICS`, `YESTERDAY'S ADHERENCE`)
- **Buttons** — sentence case, 1–2 words (`Send`, `Log meal`, `Regenerate`)
- **Empty states** — full sentence, no exclamation marks, ends with a period

### Person

**Second person**, possessive when natural. The app doesn't claim agency — the user is the protagonist; Luma is the surface.

- ✅ "Yesterday's adherence", "Today's plan", "Your goals"
- ❌ "We've calculated…", "I think you should…"

### Brevity

| Component | Pattern | Example |
|---|---|---|
| Eyebrow | 1–2 words, UPPERCASE | `WEIGHT`, `YESTERDAY'S ADHERENCE` |
| Hero value | numeric + unit, tabular | `78.4 kg` |
| Slope | signed, 2 decimals, per-week | `−0.18 kg/wk` |
| Range pill | range token | `7d`, `30d`, `90d`, `1y` |
| Empty state | one fragment + one CTA fragment | "No plan yet — generate one in the Plan tab." |
| Phase placeholder | "X coming in Phase N." + tagline | "AI coaching coming in Phase 2." |

### Numbers — first-class citizens

Always tabular nums (`font-variant-numeric: tabular-nums`), always with explicit units, always at the right precision:

| Quantity | Precision | Example |
|---|---|---|
| Weight | 1 decimal | `78.4 kg` |
| Weight slope | 2 decimals + signed + `/wk` | `−0.18 kg/wk` |
| HRV | integer | `42 ms` |
| RHR | integer | `58 bpm` |
| Sleep duration | `Xh Ym` | `7h 24m` |
| Sleep score | integer | `82` |
| Adherence % | integer + `%` | `94%` |
| Missing data | em-dash | `—` |

### Emoji

**None.** Status is communicated by **color** (emerald = good, amber = caution, rose = over) and **typography** (signed numbers, tabular nums). Do not introduce emoji.

---

## 3. Logo & marks

The Luma mark is a **single open hill curve** with a **sun** that drops behind it. The hill is stroked; the sun is a filled circle clipped by an SVG mask along the hill's silhouette so it always sits cleanly on the horizon regardless of background.

### Geometry — `04D classic v1.0`

| Property | Value |
|---|---|
| viewBox | `0 0 32 32` |
| Hill path | `M2 26 Q10 26 14 16 Q18 6 22 16 Q26 26 30 26` |
| Hill stroke width | `1.75` |
| Hill stroke | round caps, round joins |
| Sun | `cx 20  cy 13  r 5.25` |
| Mask path (clips sun to horizon) | `M2 26 Q10 26 14 16 Q18 6 22 16 Q26 26 30 26 V34 H-2 Z` filled black on a white rect background |

### Color variants

| Variant | Hill | Sun | Use |
|---|---|---|---|
| **Dark surface** (primary) | `#0ea5e9` sky-500 | `#fbbf24` sun-400 | Product UI on `bg-slate-950` / `#050811` |
| **Light surface** | `#0284c7` sky-600 | `#d97706` sun-600 | Cream/light marketing surfaces |
| **Mono on dark** | `#f1f5f9` slate-100 | `#f1f5f9` slate-100 | Single-color reproduction, dark bg |
| **Mono on light** | `#0f172a` slate-900 | `#0f172a` slate-900 | Single-color reproduction, light bg |

### Master glyph SVG (dark)

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <defs>
    <mask id="luma-hill" maskUnits="userSpaceOnUse">
      <rect x="-2" y="-2" width="36" height="36" fill="white"/>
      <path d="M2 26 Q10 26 14 16 Q18 6 22 16 Q26 26 30 26 V34 H-2 Z" fill="black"/>
    </mask>
  </defs>
  <circle cx="20" cy="13" r="5.25" fill="#fbbf24" mask="url(#luma-hill)"/>
  <path d="M2 26 Q10 26 14 16 Q18 6 22 16 Q26 26 30 26"
        stroke="#0ea5e9" stroke-width="1.75"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

To switch variant: change the `circle fill` and the `path stroke` only — geometry never changes.

### Lockups

| Asset | Layout | File |
|---|---|---|
| **Horizontal wordmark** | glyph · `luma` set in Inter 600 -0.02em, 22px on a 160×40 viewBox | `frontend/public/assets/luma-wordmark-dark.svg` / `-light.svg` |
| **Stacked wordmark** | glyph above, `luma` centered, 100×120 viewBox | `frontend/public/assets/luma-wordmark-stacked-dark.svg` / `-light.svg` |
| **Glyph only** | the mark, 32×32 viewBox | `frontend/public/assets/luma-glyph-{dark|light|mono-light|mono-dark}.svg` |

### Scale

Always-legible at `16 / 24 / 32 / 48 / 64 / 96 px`. Below 16px the sun loses readability — use the wordmark or skip.

### Wordmark typography

The wordmark is set in lowercase `luma`, weight 600, letter-spacing `-0.02em`. In the **redesign language** the wordmark uses Geist 600; in the **clinical baseline** it uses Inter 600. Geometry never changes — only the typeface.

### Clear space

Maintain padding equal to the height of the sun (~`r 5.25` in the 32-unit grid) on all sides. Don't crop, don't recolor outside the four sanctioned variants, don't add drop shadows to the mark itself.

### App icon

When placed on an app-icon ground, the mark sits inside a `linear-gradient(180deg, #0c4a6e 0%, #020617 100%)` square with `border-radius: 10px` (at 44px tile) and a soft `box-shadow: 0 4px 12px rgba(0,0,0,0.3)`. Mark uses the dark variant.

### Luminous glyph (redesign-only alternate)

For the glassy atmospheric language, an alternate luminous glyph exists in `luma-primitives.jsx` as `<LumaLogo>` — a radial-gradient crescent from sun-amber through sky-400 to sky-500. Use **only** inside the atmospheric language; the canonical brand mark remains the 04D hill+sun above.

---

## 4. Color

Luma has **two color systems** that coexist. Both live in `var(--*)` tokens — never hard-code hex values in product code.

### 4.1 Baseline palette (engineering / clinical)

From `colors_and_type.css` — used by the shipped Tailwind app.

#### Surface — Slate scale

| Token | Hex | Role |
|---|---|---|
| `--slate-950` | `#020617` | Page background (dark default) |
| `--slate-900` | `#0f172a` | Card background |
| `--slate-800` | `#1e293b` | Inner tile, hairline border |
| `--slate-700` | `#334155` | Stronger border |
| `--slate-600` | `#475569` | Disabled fg |
| `--slate-500` | `#64748b` | Quiet fg |
| `--slate-400` | `#94a3b8` | Tertiary fg, eyebrow on dark |
| `--slate-300` | `#cbd5e1` | Secondary fg on dark |
| `--slate-200` | `#e2e8f0` | Page bg (light), hairline (light) |
| `--slate-100` | `#f1f5f9` | Primary fg on dark |
| `--slate-50` | `#f8fafc` | Surface (light) |

#### Brand — Sky (primary)

| Token | Hex | Role |
|---|---|---|
| `--sky-900` | `#0c4a6e` | Deep, app icon ground |
| `--sky-700` | `#0369a1` | — |
| `--sky-600` | `#0284c7` | Hill on light surface, primary on light |
| `--sky-500` | `#0ea5e9` | **Brand primary.** Hill, links, active states, chart lines, FAB |
| `--sky-400` | `#38bdf8` | Active text on dark, gradient stop |
| `--sky-300` | `#7dd3fc` | Hover, gradient stop |
| `--sky-200` / `100` / `50` | tints | Soft fills |

#### Brand accent — Sun (the "Lum" in Luma)

| Token | Hex | Role |
|---|---|---|
| `--sun-600` | `#d97706` | Sun on light surface |
| `--sun-500` | `#f59e0b` | Strong accent |
| `--sun-400` | `#fbbf24` | **Sun-amber.** Sun on dark, streaks, achievements, active-insight border |
| `--sun-300` / `200` / `100` / `50` | tints | Soft warmth |

#### Semantic

| Token | Hex | Role |
|---|---|---|
| `--emerald-500` / `--fg-good` | `#10b981` / `#34d399` | Good — adherence met, weight trending down |
| `--amber-400` / `--fg-warn` | `#fbbf24` | Caution — under range |
| `--rose-400` / `--fg-bad` | `#fb7185` | Alert — over range |

Use semantic colors **only for data evaluation**, never decoration.

### 4.2 Atmospheric palette (redesign / hi-fi mocks)

From `luma-styles.css` — used for marketing and the polished redesign mocks.

#### Surfaces — deep nightlit ocean

```css
--bg-0: #050811;   /* page */
--bg-1: #080d1a;   /* window inner */
--bg-2: #0d1425;   /* surface */
--bg-3: #131c33;   /* raised */
```

#### Glass tints (translucent over atmospheric backdrop)

```css
--glass-1: rgba(255, 255, 255, 0.04);
--glass-2: rgba(255, 255, 255, 0.06);
--glass-3: rgba(255, 255, 255, 0.09);
--glass-edge:        rgba(255, 255, 255, 0.12);
--glass-edge-strong: rgba(255, 255, 255, 0.18);
```

#### Text (over atmospheric bg)

```css
--fg-primary:   #f6f9ff;                       /* near-white with a sky tint */
--fg-secondary: rgba(246, 249, 255, 0.78);
--fg-tertiary:  rgba(246, 249, 255, 0.56);
--fg-quiet:     rgba(246, 249, 255, 0.38);
--fg-faint:     rgba(246, 249, 255, 0.22);
```

#### Aurora accents (sparingly — illustration, never UI states)

```css
--aurora-mint:   #5eead4;
--aurora-pink:   #f472b6;
--aurora-violet: #a78bfa;
```

#### Light mode override

Applied via `[data-theme="light"]` on any wrapper; cascades. Surfaces flip to a warm cream:

```css
--bg-0: #f6f4ef;   /* cream page */
--bg-1: #fbf9f4;
--bg-2: #ffffff;
--bg-3: #f1eee7;
--fg-primary: #0c1426;
/* glass becomes frosted white; semantic colors deepen one step */
```

### 4.3 Color usage rules

- **90% of every screen is neutral surface.** Sky is the signal; sun is the warmth; semantic is data only.
- **Avoid** sky+sun gradients in controls and long-form body copy.
- **Allowed sky+sun pairings**: the **logo mark**, the **mobile FAB**, the **desktop sidebar active sliver**, the **desktop sidebar user avatar chip**, and a **single short hero/accent text phrase per surface** (typically serif-italic).
- **Insight borders** (the only place an asymmetric colored border appears) use `border-left: 2px solid var(--sun-400)`.
- **Aurora colors** appear at most once per screen, in atmospheric backdrops or large illustrative SVGs. Never on buttons, never on text.

---

## 5. Typography

Luma uses **two type stacks**. Pick one per surface and commit — do not mix them on the same screen.

### 5.1 Clinical baseline (shipped app)

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

Load from Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

### 5.2 Atmospheric redesign

```css
--font-sans:  'Geist',           -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-mono:  'Geist Mono',      ui-monospace, monospace;
--font-serif: 'Instrument Serif', 'Times New Roman', serif;     /* italic only, for moments */
```

Load from Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
```

Body opens the small-cap stylistic sets: `font-feature-settings: 'ss01', 'ss02';`

### 5.3 Scale

| Token | px | Used on |
|---|---|---|
| `--fs-11` | 11 | Footnote, micro-label |
| `--fs-12` | 12 | Eyebrow, chip, helper |
| `--fs-14` | 14 | Body |
| `--fs-16` | 16 | Body emphasis, input |
| `--fs-18` | 18 | Subhead |
| `--fs-24` | 24 | Card headline |
| `--fs-36` | 36 | Page hero number |
| `--fs-48` | 48 | Marketing display |

Headings are **600 weight, never 700+** — calm not loud. Display uses `letter-spacing: -0.025em` to `-0.03em`. Body is `1.6` line-height; headings `1.1`–`1.2`.

### 5.4 Numerals

**Every** metric, axis label, chip, and slope uses tabular nums:

```css
font-variant-numeric: tabular-nums;
font-feature-settings: 'tnum';
```

Helper class: `.num`.

### 5.5 Italic-serif moment

In the atmospheric language only, `Instrument Serif italic` may set a *single phrase* of warmth — the dawn line above a sign-in form, a quiet aside on Today. Class: `.serif-italic`. Use sparingly — once per screen, never inside a button or label.

### 5.6 Eyebrow

```css
.eyebrow {
  font-size: 10–11px;
  font-weight: 600;
  letter-spacing: 0.14–0.16em;
  text-transform: uppercase;
  color: var(--fg-quiet);   /* or --slate-400 in baseline */
  font-family: var(--font-mono);
}
```

---

## 6. Iconography

**Lucide** — the geometric 1.5px-stroke SVG set. The shipped codebase still uses Unicode glyphs (`◎ ◫ ∿ ✦ ⚙`); the design system upgrades all new work to Lucide.

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```

| Concept | Lucide name |
|---|---|
| Today | `circle-dot` |
| Plan | `calendar-days` (or `utensils` in redesign) |
| Trends | `activity` (or `trending-up`) |
| Coach | `sparkles` |
| Settings | `settings` |
| Log meal | `plus` |
| Voice log | `mic` |
| Barcode | `scan-line` |
| Search | `search` |
| Active insight | `lightbulb` |
| Streak | `flame` |

**Rules.** Stroke 1.5px. Sizes 16 (inline) / 20 (nav) / 24 (FAB). Color inherits `currentColor` — never hard-coded fills. **No emoji. No PNG icons. No freeform illustration.** Hand-authored SVGs are allowed only when they match Lucide's stroke and geometry.

For environments without CDN, the `Icon` primitive in `luma-primitives.jsx` ships a curated inline subset.

---

## 7. Spacing, radius, elevation

### Spacing scale

| Token | px | Use |
|---|---|---|
| `--space-0` | 0 | — |
| `--space-1` | 4 | Tightest gap (icon ↔ label) |
| `--space-2` | 8 | Inline elements |
| `--space-3` | 12 | Tight card padding |
| `--space-4` | 16 | **Standard card padding**, vertical rhythm between cards |
| `--space-5` | 20 | — |
| `--space-6` | 24 | Page padding, hero card |
| `--space-8` | 32 | Section separation in Trends |
| `--space-10` | 40 | — |
| `--space-12` | 48 | Large hero block |
| `--space-16` | 64 | Page-level breathing room |

Use **flex/grid + `gap`** for all sibling layouts — never margin-only stacks.

### Radius

| Token | px | Use |
|---|---|---|
| `--radius-sm` | 8–10 | Nav link, small chip, input |
| `--radius-md` | 12–14 | Inner tile (adherence pill, metric tile), glass-inset |
| `--radius-lg` | 16–20 | **Brand radius.** Every primary card |
| `--radius-xl` | 28 | Large glass card (atmospheric) |
| `--radius-2xl` | 36 | Hero card (atmospheric only) |
| `--radius-pill` | 9999 | FAB, range toggle when active, button pill |

**16–20px is the brand radius.** Never use sharper than `rounded-lg` on a real surface.

### Borders

- **Card border:** 1px hairline, `slate-800` (baseline) or `glass-edge` (atmospheric)
- **Section divider:** 1px top border in the same hairline color — never thicker
- **Accent border** (active insight only): `border-left: 2px solid var(--sun-400)`

### Elevation / shadows

The baseline uses **shadow only on the FAB**. The atmospheric language adds restrained tokens for floating glass.

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.06)` | Light-mode card lift |
| `--shadow-md` | `0 4px 10px rgba(0,0,0,0.10)` | Hover lift |
| `--shadow-lg` | `0 18px 40px -22px rgba(15,23,42,0.20)` | Glass card |
| `--shadow-fab` | `0 8px 24px -8px rgba(14,165,233,0.7)` | Primary FAB |

Elevation is otherwise signaled by **border + lighter bg step** (e.g. `slate-900` card on `slate-950` page), not by drop shadows.

---

## 8. Backgrounds & atmosphere

### Baseline — flat

**No images. No textures. No patterns. No noise.** Pure flat color. Empty states are pure type.

### Atmospheric (redesign) — `.luma-bg`

A composed backdrop with three layered radial blooms, a subtle grid, and a vignette mask. Used on full-bleed redesign surfaces.

```css
.luma-bg {
  background: var(--bg-0);
  position: relative; overflow: hidden; isolation: isolate;
}
.luma-bg::before {
  /* primary sky bloom */
  content: ''; position: absolute; inset: -10%;
  background:
    radial-gradient(ellipse 60% 50% at 18% 8%,  rgba(56, 189, 248, 0.32), transparent 60%),
    radial-gradient(ellipse 50% 50% at 85% 12%, rgba(251, 191, 36, 0.16), transparent 60%),
    radial-gradient(ellipse 70% 60% at 60% 110%, rgba(125, 211, 252, 0.10), transparent 65%);
  filter: blur(40px);
  z-index: 0; pointer-events: none;
}
.luma-bg::after {
  /* subtle grid, vignetted */
  content: ''; position: absolute; inset: 0;
  background-image:
    linear-gradient(to right,  rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 75%);
  z-index: 0; pointer-events: none;
}
.luma-bg > * { position: relative; z-index: 1; }
```

**Dawn variant** (`.luma-bg.luma-bg-dawn`) — warm: replaces the sky bloom with sun-amber + aurora-pink + a sky undertone. Used on celebratory moments (streak hit, week summary).

**Light mode** — softer blooms (opacity 0.18–0.22), warmer pink undertone, dark gridlines at 0.04 opacity.

---

## 9. Components

### 9.1 Card — baseline

```html
<div class="bg-slate-900 rounded-2xl p-4 border border-slate-800">
  <p class="text-xs text-slate-400 uppercase tracking-wide font-medium">EYEBROW</p>
  <!-- body -->
</div>
```

- Background `slate-900` (one step lighter than page)
- Padding `16px`
- Radius `16px`
- Border `1px slate-800` hairline
- Inner tiles step one shade lighter: `bg-slate-800 rounded-xl p-3`

### 9.2 Card — glass (atmospheric)

```html
<div class="glass">…</div>
```

```css
.glass {
  background: linear-gradient(165deg, var(--glass-2), var(--glass-1));
  border: 1px solid var(--glass-edge);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(24px) saturate(140%);
  box-shadow:
    inset 0 1px 0 0 rgba(255,255,255,0.07),
    0 1px 0 0 rgba(0,0,0,0.4),
    0 20px 40px -20px rgba(0,0,0,0.6);
}
.glass-bright  { /* +1 stop fill, +1 stop edge */ }
.glass-inset   { background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); }
```

Light-mode overrides flip glass to frosted white with a soft drop shadow. **Always pair `.glass` with `.luma-bg` somewhere up the tree** — without the atmospheric backdrop, glass loses its reason to exist.

### 9.3 Button

```html
<button class="btn">Secondary</button>
<button class="btn btn-primary">Primary</button>
<button class="btn btn-ghost">Tertiary</button>
```

```css
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 20px;
  border-radius: var(--radius-pill);   /* pill — atmospheric */
  font-family: var(--font-sans); font-weight: 500; font-size: 14px;
  border: 1px solid var(--glass-edge);
  background: var(--glass-2);
  color: var(--fg-primary);
  cursor: pointer;
  transition: transform 150ms ease-out, background 200ms;
}
.btn:hover  { background: var(--glass-3); }
.btn:active { transform: scale(0.97); }

.btn-primary {
  background: linear-gradient(180deg, var(--sky-400), var(--sky-500));
  border: 1px solid rgba(56, 189, 248, 0.6);
  color: #061229; font-weight: 600;
  box-shadow:
    inset 0 1px 0 0 rgba(255,255,255,0.45),
    0 8px 24px -8px rgba(14, 165, 233, 0.7),
    0 0 0 1px rgba(56, 189, 248, 0.2);
}
.btn-ghost { background: transparent; border-color: transparent; color: var(--fg-secondary); }
```

In the **clinical baseline**, buttons use `rounded-lg` (8px) rather than pill — the only shape difference between the two languages.

### 9.4 FAB (mobile log)

52×52 circle, `linear-gradient(180deg, #fde68a, #fbbf24)` (sun gradient), centered on the bottom-nav bar with a 22px negative top margin so it floats. Box-shadow wraps a bg-color ring + a sun-amber glow:

```css
box-shadow:
  0 0 0 6px var(--bg-0),                /* mask ring */
  0 0 30px rgba(251,191,36,0.5),
  inset 0 1px 0 rgba(255,255,255,0.5);
```

Press: `transform: scale(0.95); transition: transform 150ms ease-out`.

### 9.5 Slope chip

A pill with a Lucide trend icon, a quiet label, and a tabular number. Green for decreasing weight (good); rose for increasing.

```html
<span class="slope-chip slope-chip--good">
  <Icon name="trending-down" size="13" />
  <span class="label">7d</span>
  <span class="num">−0.18 kg/wk</span>
</span>
```

### 9.6 Theme toggle

A 4px-padded pill containing two buttons; the active one fills with the primary brand gradient (sky for dark mode, sun for light mode). See `.theme-toggle` in `luma-styles.css`.

### 9.7 Mobile nav

`position: absolute; bottom: 0` over the screen, with a top-fade gradient wrap so content peeks under, then a `.glass-bright` pill containing four nav items + the central FAB. `safe-bottom` padding (28px) clears the iOS home indicator.

### 9.8 Desktop sidebar

240px fixed left rail, faint `linear-gradient(180deg, rgba(255,255,255,0.02), transparent)` ground, hairline right border. Wordmark on top, eyebrow `MENU`, nav items with:

- **Active**: `linear-gradient(90deg, rgba(56,189,248,0.18), rgba(56,189,248,0.04))` bg, 1px sky border, plus a 3×18px gradient sliver (sky → sun) floating off the left edge with a sky glow.
- **Inactive**: transparent, `--fg-tertiary`.

Bottom: a glass user chip — 32px gradient avatar (sky → sun), name, "self-hosted" line, settings icon.

### 9.9 Status bar (mobile)

44px tall, 14px 28px padding, time on the left, signal/wifi/battery svgs on the right. Color inherits — always `--fg-primary`.

### 9.10 Empty state

Pure type, no illustration. One sentence, one CTA fragment.

```
No plan yet — generate one in the Plan tab.
```

### 9.11 Phase placeholder

```
AI coaching coming in Phase 2.
Trend queries · meal swaps · explanations.
```

Set the line below the heading in `.serif-italic` (atmospheric) or `--fg-tertiary` (baseline).

---

## 10. Data viz

Data is the product. Charts and metric tiles get more design attention than anything else.

### 10.1 Weight chart

Recharts (baseline) or the inline `<WeightChart>` SVG primitive (atmospheric). Spec:

- **Line**: 2.5px stroke, rounded caps, gradient stroke `sky-300 → sky-400 → sun-400` left-to-right
- **Area fill**: `linear-gradient(180deg, rgba(56,189,248,0.45), rgba(56,189,248,0.10), transparent)`
- **Smoothing**: quadratic, via midpoint control points
- **Grid lines**: horizontal only, `rgba(255,255,255,0.05)`, dashed `2 4`
- **Axis labels**: 10px JetBrains/Geist Mono, `--fg-quiet`, tabular nums, 1 decimal
- **Last point**: 5px sun-amber filled circle with a 1.5px sun-100 ring, on top of a 10px `rgba(251,191,36,0.18)` glow halo
- **Other markers**: every 14 points, 2.5px sky-400 circle at 0.5 opacity
- **Range pills**: `7d / 30d / 90d / 1y` — active = sky-500 fill, white text; inactive = transparent

### 10.2 Activity rings

Three concentric arcs, drawn from 12 o'clock (`transform: rotate(-90deg)`). Default thickness 14px, gap 6px. Each ring has its own linear gradient and `<feGaussianBlur stdDeviation="3">` glow filter.

| Ring | Gradient (from → to) | Use |
|---|---|---|
| Outer | `#38bdf8 → #0ea5e9` (sky) | Calories |
| Middle | `#fde68a → #fbbf24` (sun) | Saturated fat |
| Inner | `#86efac → #34d399` (emerald) | Fiber |

Animate dashoffset from full → target over `1600ms cubic-bezier(.2,.7,.2,1)`. Track is `rgba(255,255,255,0.06)`.

### 10.3 Streak strip

A row of `ofMax` day chips (typically 14). Each chip is `aspect-ratio: 1/1.4`, `radius 8`, gradient `rgba(251,191,36,a) → rgba(251,113,133,a)` with `a` ramping `0.3 → 0.8` left-to-right so the active streak feels brighter at the leading edge. Sun-amber 0.4 border, sun-amber glow shadow that grows with intensity. Inactive chips: `rgba(255,255,255,0.04)` fill, hairline border, no glow. Day labels (`M T W T F S S`) in 9px Geist/JetBrains Mono below each chip.

### 10.4 Sparkline

Mini line + faded area fill. Default 120×36, 1.5px stroke, area gradient `color@0.4 → color@0`. One gradient per chart instance (use a random `id` to avoid collisions).

### 10.5 Adherence pills

Inner tile per macro/metric. `bg-slate-800 rounded-xl p-3` (baseline) or `.glass-inset` (atmospheric). Eyebrow + value + delta. Color the value by status:

- `--fg-good` if within range
- `--fg-warn` if under
- `--fg-bad` if over
- `--fg-quiet` if missing (value renders as `—`)

### 10.6 Biometric strip

A horizontal row of 4 tiles: HRV, RHR, Sleep duration, Sleep score. Each tile has eyebrow + tabular value with unit (`42 ms`, `58 bpm`, `7h 24m`, `82`). No sparkline by default — keep it calm.

---

## 11. Layout

### 11.1 Mobile

- **Width**: `max-w-lg` (32rem / 512px) main column, centered
- **Page padding**: `px-4 py-6`
- **Bottom nav**: fixed, `safe-bottom` aware, FAB occupies the center slot
- **Vertical rhythm**: `space-y-4` between cards, `space-y-6` between major sections
- **Phone frame** (mocks only): 390×844 with a 52px outer radius and a 120×32 notch — see `.phone-frame` / `.phone-notch`

### 11.2 Desktop

- **Sidebar**: 240px fixed left (224 in baseline)
- **Main**: scrollable, `max-w-2xl` on Trends (denser charts), `max-w-lg` elsewhere
- **No top bar** — the page never has chrome above the content
- **Window frame** (mocks only): `border-radius: 16px`, 38px chrome with traffic lights — see `.window-frame` / `.window-chrome`

### 11.3 Safe areas

Every fixed bottom element uses `padding-bottom: env(safe-area-inset-bottom)` (aliased as `.safe-bottom`).

---

## 12. Motion

Luma is **almost entirely still**. Stillness is a feature in a clinical tool.

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 150ms | State changes (hover, focus, press) |
| `--duration-normal` | 300ms | Layout transitions |
| `--duration-slow` | 1500–1600ms | Chart entry, ring draw |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Everything user-triggered |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Loops (`animate-pulse`) |

Sanctioned animations:

- **Press**: `transform: scale(0.97)` (button) or `scale(0.95)` (FAB)
- **Hover**: color crossfade only — no transform, no shadow shift
- **Loading skeleton**: `animate-pulse` 2s ease-in-out on `bg-slate-800`
- **Chart entry**: stroke-dashoffset → 0 over 1.6s, `cubic-bezier(.2,.7,.2,1)`

**Forbidden**: bouncy springs, parallax, scroll-linked effects, large entrance animations, gradient shimmer on hover.

---

## 13. Two languages: clinical vs. atmospheric

Luma ships two visual treatments. Pick one per surface — they don't mix.

| Aspect | Clinical (baseline) | Atmospheric (redesign) |
|---|---|---|
| Surface | `slate-950` flat | `#050811` + radial blooms + grid + vignette |
| Cards | `slate-900` + slate-800 border | `.glass` (translucent + 24px backdrop blur) |
| Type | Inter + JetBrains Mono | Geist + Geist Mono + Instrument Serif italic |
| Buttons | `rounded-lg`, flat fills | Pill, gradient primary, glass secondary |
| Brand radius | 16 (`rounded-2xl`) | 20 (`--radius-lg`), up to 36 on heroes |
| Shadows | Only on FAB | Subtle on glass + colored on primary |
| Wordmark | Inter 600 | Geist 600 |
| Logo geometry | **Identical — never changes** | **Identical — never changes** |
| Logo alternate | — | Optional luminous radial-gradient glyph for hero moments |
| Italic moment | None | One phrase per screen in Instrument Serif |
| Background | Flat | Composed: sky bloom + sun glow + aurora undertone + grid |
| Sparkline | Recharts default | Inline SVG, gradient stroke + faded area |

**When to use which:**

- **Clinical** → daily product UI, settings, dense data lists, anywhere engineering needs to ship fast
- **Atmospheric** → marketing pages, sign-in, week summary celebrations, the Today hero, anywhere the product should feel like a luminous companion

---

## 14. Asset inventory

### Logos (`frontend/public/assets/`)

| File | Variant |
|---|---|
| `frontend/public/assets/luma-glyph-dark.svg` | Mark · sky-500 hill + sun-400 sun |
| `frontend/public/assets/luma-glyph-light.svg` | Mark · sky-600 hill + sun-600 sun |
| `frontend/public/assets/luma-glyph-mono-light.svg` | Mark · slate-100 monochrome (dark bg) |
| `frontend/public/assets/luma-glyph-mono-dark.svg` | Mark · slate-900 monochrome (light bg) |
| `frontend/public/assets/luma-wordmark-dark.svg` | Horizontal lockup · dark variant |
| `frontend/public/assets/luma-wordmark-light.svg` | Horizontal lockup · light variant |
| `frontend/public/assets/luma-wordmark-stacked-dark.svg` | Stacked lockup · dark variant |
| `frontend/public/assets/luma-wordmark-stacked-light.svg` | Stacked lockup · light variant |

### Code modules

| File | What |
|---|---|
| `luma-styles.css` | Atmospheric tokens + glass + buttons + frames + light-mode overrides |
| `luma-primitives.jsx` | `LumaLogo` `LumaWordmark` `ActivityRings` `StreakStrip` `WeightChart` `Spark` `StatusBar` `MobileNav` `DesktopSidebar` `Icon` `SlopeChip` |
| `luma-mock-data.js` | Mock weight, biometric, plan data |
| `screens-signin.jsx` / `screens-today.jsx` / `screens-rest.jsx` | Hi-fi screen mocks |
| `app.jsx` | Design canvas root for the redesign |
| `Luma Redesign.html` | Entry point for the atmospheric mock canvas |
| `Luma Logo - Final.html` | Final logo brand sheet (dark/light side-by-side) |

### Design system project (read-only reference)

Full Luma Design System at `/projects/4b3b3977-50dd-4625-8613-ffa4e96594ef/` — includes `colors_and_type.css` (105 CSS variables), the source repo mirror under `source_refs/luma-web/`, and the Tailwind PWA UI kit under `ui_kits/luma-pwa/`.

---

## 15. Do / don't

### Do

- Use `var(--*)` tokens for every color, size, and radius
- Lead with tabular numbers and quiet labels
- Prefer flex/grid + `gap` over margin stacks
- Pair `.glass` only with `.luma-bg`
- Use sun-amber sparingly — streaks, achievements, insight borders, the FAB
- Use Lucide icons at 1.5px stroke
- Write empty states as a single sentence, no exclamation marks
- Animate only on press, hover-crossfade, chart entry, and pulse-loading
- Use the canonical hill+sun logo for product identity

### Don't

- Don't introduce a new color, font, or shadow without grounding it here
- Don't add emoji
- Don't use sky+sun gradients in controls or long-form body copy
- Don't use more than one sky+sun hero/accent text phrase per surface
- Don't add drop shadows to elevation — use border + bg step
- Don't go sharper than `rounded-lg` on a real surface
- Don't use heading weights above 600
- Don't add parallax, bouncy springs, or scroll-linked effects
- Don't recolor or restyle the logo outside the four sanctioned variants
- Don't mix the clinical and atmospheric languages on the same surface

---

*Luma · brand & design guide · v1.0 · derived from `Luma Logo - Final.html`, `Luma Redesign.html`, `luma-styles.css`, and the Luma Design System.*
