# Code Audit — Cleanup Tracking

Tracking document for the full-stack audit performed 2026-06-24. Findings are evidence-backed
(file:line) and worked in priority order. Each item is a self-contained change; status is updated
as work lands on `claude/bold-brahmagupta-0jolwe`.

## Status Legend

- ⬜ Not started
- 🔄 In progress
- ✅ Done

## Items

| # | Item | Type | Status |
|---|------|------|--------|
| 1 | Delete dead `PhotoTab.tsx` | Dead code | ✅ |
| 2 | De-dupe `gramsForUnit` → `lib/portions.ts` | Drift bug | ✅ |
| 3 | Split `api/goals.py` grab-bag router | Monolith | ✅ |
| 4 | Decompose `routes/health.tsx` + `routes/meals.tsx` | Monolith | ✅ |
| 5 | Extract `get_today` 325-line handler | Monolith | ✅ |
| 6 | Shared `ui/Field` primitive | Duplication | ⏭️ Skipped (by design) |

---

## 1. Delete dead `PhotoTab.tsx`

**Where:** `frontend/src/components/log-sheet/PhotoTab.tsx` (246 lines).
**Why:** Exported `PhotoTab` is never imported. `LogSheet.tsx` only wires `QuickTab`, `VoiceTab`,
`SearchTab`, `ScanTab`. Photo logging now lives in `ScanTab` (`scanMode: 'barcode' | 'photo'`).
**Action:** Delete the file. Zero risk.

## 2. De-dupe `gramsForUnit`

**Where:** Copy-pasted in `log-sheet/IngredientBuilder.tsx:32`, `log-sheet/ScanTab.tsx:36`,
`today/NutritionCalculatorCard.tsx:26`.
**Why:** Already drifted — NutritionCalculatorCard passes `serving_size_g || undefined`, the others
pass `serving_size_g`. Active correctness risk (calculator vs scanner compute different grams).
**Action:** Move to `lib/portions.ts` as `gramsForFoodUnit(food, unit, qty)`; import shared
`FoodResult`/`HouseholdMeasure` types instead of re-declaring inline.

## 3. Split `api/goals.py`

**Where:** `backend/luma/api/goals.py` (654 lines, 17 routes).
**Why:** Hosts three unrelated domains — `/goals`, `/preferences`, and 8 `/settings/*` routes
(measurements, ai-pricing-overrides, hae-metrics, llm-metrics, ai-config, ai-providers, ai-usage,
hae-import).
**Action:** Carve `/settings/*` (and `/preferences`) into focused routers. Paths must not change.

## 4. Decompose `routes/health.tsx` + `routes/meals.tsx`

**Where:** `routes/health.tsx` (1509 lines, 20 components), `routes/meals.tsx` (1506 lines, 19 `useState`).
**Why:** Largest frontend files; no decomposition despite the project's established
`today/` / `settings/` / `plan/` folder pattern.
**Action:** Extract into `components/health/` and `components/meals/` folders.

## 5. Extract `get_today` handler

**Where:** `backend/luma/api/today.py:18` — single ~325-line `get_today` function (ends ~line 342).
**Why:** Hard to test/read; assembles macros, micros, streak, bio, plan in one body.
**Action:** Extract assembly into service functions under `luma/services/`.

## 6. Shared `ui/Field` primitive — Skipped (by design)

**Where:** `Login.tsx:290`, `settings/HydrationCard.tsx:43`, `settings/GoalsCard.tsx:25`,
`components/health/shared.tsx` (`ModalField`), `components/health/SimulationsTab.tsx` (`SliderField`).

**Decision:** Not consolidated. On inspection these are *not* near-identical — they are
distinct components that merely share the `.eyebrow` label-header idiom (which is already a
shared CSS class):

- `Login.Field` — controlled text input with a leading icon
- `GoalsCard.Field` — grid-aware label/unit wrapper around arbitrary `children`
- `HydrationCard.Field` — label/hint wrapper with dropdown + open-state styling
- `health/ModalField` — plain controlled text input
- `SimulationsTab/SliderField` — range slider

A single primitive would need a union of all their props (`icon? unit? hint? dropdown?
isOpen? fullWidth? children? value? onChange? type?`), producing a kitchen-sink that reads
worse than the small, local components and invents a pattern the codebase doesn't use.
Per CLAUDE.md ("do not refactor working code as a side effect"; "do not invent new
patterns"), the correct outcome is to leave these as-is. The only genuinely shared piece —
the label header — is already centralized as the `.eyebrow` class.
