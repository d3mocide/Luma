# Seed & data scripts

Tooling for building and maintaining the local foods database. All of these are
stdlib-only where they run on the host, so they work with plain `python3` (no
app install needed) — see each module's docstring for details.

| Script | Make target | Purpose |
|---|---|---|
| `ingest_usda.py` | `make seed-reference` | Load `usda_seed_foods.json` into the `foods` table (source `usda`). |
| `build_seed.py` | `make seed-build` / `make seed-merge` | Build new reference entries from a downloaded USDA bulk dataset, then merge them into the seed. |
| `backfill_micros.py` | `make seed-micros` / `make seed-micros-apply` | Backfill vitamins/minerals into existing reference foods via the live USDA API. |

---

## Micronutrient backfill (`backfill_micros.py`)

### Why

The curated reference foods in `usda_seed_foods.json` shipped with macros plus
sodium/potassium only — **every vitamin and most minerals are absent**. So whole
foods like "Orange (Navel)" log with an empty vitamin panel in the nutrition
card, even though the end-to-end nutrient storage works fine. The lazy
`/foods/{id}/enrich` path can't fix this: it only covers `source == "usda"` foods
with an `fdc_` id, and reference foods have neither. This script closes the gap by
matching each reference food to a USDA FoodData Central record and pulling in the
missing micronutrients.

### What it does

For each reference entry it:

1. Searches USDA FDC by name, restricted to **Foundation + SR Legacy** data types
   (these carry the complete per-100g panel; Branded data is sparse).
2. Scores candidates against the cleaned name (fuzzy ratio blended with token
   coverage) and picks the best match.
3. Fetches the matched food's full detail and extracts the vitamin/mineral panel.
4. Merges **only the missing micronutrient keys** into the entry — the curated,
   100g-normalised macros (calories, protein, fat, carbs, sugars, fiber, soluble
   fiber, sodium, potassium) are **never overwritten**.

It writes two files and **does not touch the live seed**:

- `staged/usda_seed_micros.json` — the enriched dataset (drop-in replacement,
  identical schema).
- `staged/micros_review.md` — a review report: every food → matched USDA
  description, fdcId, match score, count of micros added, plus kcal and Vitamin C
  sanity columns. Low-confidence and unmatched foods are called out at the top.

### Prerequisites

A free USDA API key: <https://fdc.nal.usda.gov/api-key-signup>. Add it to `.env`
(the Makefile loads and exports it):

```
USDA_API_KEY=your_key_here
```

### Usage

```bash
# Dry run on the first 5 foods to sanity-check matching:
make seed-micros MICRO_ARGS="--limit 5"

# Full run — writes staged enriched JSON + review report:
make seed-micros

# 1. Open staged/micros_review.md and verify the LOW / SKIP / MISS rows.
# 2. When happy, promote it to the live seed and re-seed the DB:
make seed-micros-apply
```

Running the module directly (equivalent):

```bash
USDA_API_KEY=... python3 -m luma.scripts.backfill_micros \
    --output backend/luma/scripts/staged/usda_seed_micros.json \
    --review backend/luma/scripts/staged/micros_review.md
```

### Options (`MICRO_ARGS="..."`)

| Flag | Default | Effect |
|---|---|---|
| `--limit N` | `0` (all) | Only process the first N foods — handy for a dry run. |
| `--min-score F` | `0.4` | Skip matches scoring below F (0–1); the entry is left unchanged. |
| `--force` | off | Re-enrich even foods that already carry micronutrients (overwrites micros). |
| `--delay S` | `0.3` | Seconds between API calls (politeness / rate limits). |
| `--source` / `--output` / `--review` | see defaults | Override input/output paths. |

### Caveats

- **Matching is fuzzy.** Generic names can mis-match — always skim the review
  report's low-confidence section before `seed-micros-apply`. Scores ≥ 0.6 are
  marked `ok`; anything applied below that is `low-confidence`.
- **Rate limits.** Default USDA keys allow ~1,000 requests/hour; a full run is
  ~2 calls per food (~400 total), within budget. Backoff/retry is built in.
- **`seed-micros-apply` overwrites `usda_seed_foods.json`** and re-seeds the
  running DB's `usda`-source foods. Commit the regenerated seed if it looks good.
