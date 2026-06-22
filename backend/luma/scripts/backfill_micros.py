"""Backfill vitamin/mineral data into the USDA reference seed via the live FDC API.

The curated reference foods in ``usda_seed_foods.json`` ship with macros plus
sodium/potassium only — every vitamin and most minerals are absent, so whole
foods (e.g. "Orange (Navel)") log with an empty micronutrient panel. The lazy
``/foods/{id}/enrich`` path can't fix this because reference foods carry no
``fdc_`` source id. This script closes that gap.

For each reference entry it:
  1. Searches USDA FoodData Central by name (Foundation + SR Legacy only — these
     carry the complete per-100g panel; Branded data is sparse).
  2. Scores candidates against the cleaned name and picks the best match.
  3. Pulls the matched food's full detail and extracts the vitamin/mineral panel.
  4. Merges ONLY the missing micronutrient keys into the entry, leaving the
     curated, 100g-normalised macros untouched.

It writes an enriched seed JSON (drop-in replacement, identical schema) plus a
human-readable review report so the fuzzy matches can be eyeballed before the
data is applied.

Self-contained and stdlib-only (like build_seed.py) so it runs on the host with
plain ``python3`` — no app dependencies. The USDA key is read from the
``USDA_API_KEY`` environment variable (the Makefile loads it from .env).

Usage
-----
    # Build the enriched dataset + review report (does NOT touch the live seed):
    USDA_API_KEY=... python3 -m luma.scripts.backfill_micros \\
        --output backend/luma/scripts/staged/usda_seed_micros.json \\
        --review backend/luma/scripts/staged/micros_review.md

    # Try a handful first:
    USDA_API_KEY=... python3 -m luma.scripts.backfill_micros --limit 5

See `make seed-micros` / `make seed-micros-apply`.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

_FDC_BASE = "https://api.nal.usda.gov/fdc/v1"

# FDC nutrient ID → internal key. MUST stay in sync with
# luma.services.usda_client._NUTRIENT_MAP (and build_seed.py).
_NUTRIENT_MAP: dict[int, str] = {
    1008: "calories",
    1003: "protein_g",
    1004: "fat_g",
    1005: "carbohydrates_g",
    2000: "sugars_g",
    1235: "added_sugars_g",
    1079: "fiber_g",
    1258: "saturated_fat_g",
    1292: "monounsaturated_fat_g",
    1293: "polyunsaturated_fat_g",
    1257: "trans_fat_g",
    1253: "cholesterol_mg",
    1082: "soluble_fiber_g",
    1093: "sodium_mg",
    1092: "potassium_mg",
    1087: "calcium_mg",
    1089: "iron_mg",
    1090: "magnesium_mg",
    1091: "phosphorus_mg",
    1095: "zinc_mg",
    1103: "selenium_mcg",
    1106: "vitamin_a_mcg",
    1109: "vitamin_e_mg",
    1114: "vitamin_d_mcg",
    1185: "vitamin_k_mcg",
    1162: "vitamin_c_mg",
    1165: "thiamin_mg",
    1166: "riboflavin_mg",
    1167: "niacin_mg",
    1175: "vitamin_b6_mg",
    1177: "folate_mcg",
    1178: "vitamin_b12_mcg",
}

_EMPTY_NUTRIENTS: dict[str, float] = {v: 0.0 for v in _NUTRIENT_MAP.values()}
_SOLUBLE_FIBER_FRACTION = 0.25

# Curated, 100g-normalised macros we keep as-is — never overwritten from USDA.
_PRESERVE_KEYS: frozenset[str] = frozenset({
    "calories", "protein_g", "fat_g", "saturated_fat_g", "carbohydrates_g",
    "sugars_g", "fiber_g", "soluble_fiber_g", "sodium_mg", "potassium_mg",
})

# Everything else in the map is a micronutrient we want to fill in.
_MICRO_KEYS: list[str] = [v for v in _NUTRIENT_MAP.values() if v not in _PRESERVE_KEYS]

_SEED_FILE = Path(__file__).parent / "usda_seed_foods.json"


# ---------------------------------------------------------------------------
# USDA API (urllib — stdlib only)
# ---------------------------------------------------------------------------

def _api_key() -> str:
    key = os.environ.get("USDA_API_KEY", "").strip()
    if not key:
        print(
            "ERROR: USDA_API_KEY is not set. Get a free key at\n"
            "  https://fdc.nal.usda.gov/api-key-signup\n"
            "then export it (or add it to .env) before running.",
            file=sys.stderr,
        )
        sys.exit(2)
    return key


def _get_json(url: str, *, retries: int = 4, timeout: float = 15.0) -> dict[str, Any] | None:
    """GET a URL with exponential backoff on transient (429/5xx/network) errors."""
    delay = 2.0
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # Rate limited or server-side hiccup — back off and retry.
            if exc.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            print(f"    HTTP {exc.code} {exc.reason}", file=sys.stderr)
            return None
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt < retries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            print(f"    network error: {exc}", file=sys.stderr)
            return None
    return None


def search_candidates(query: str, key: str, page_size: int = 10) -> list[dict[str, Any]]:
    params = urllib.parse.urlencode({
        "query": query,
        "api_key": key,
        "pageSize": page_size,
        "dataType": "Foundation,SR Legacy",
    })
    data = _get_json(f"{_FDC_BASE}/foods/search?{params}")
    return (data or {}).get("foods", []) or []


def fetch_detail(fdc_id: int | str, key: str) -> dict[str, Any] | None:
    params = urllib.parse.urlencode({"api_key": key, "format": "full"})
    return _get_json(f"{_FDC_BASE}/food/{fdc_id}?{params}")


# ---------------------------------------------------------------------------
# Matching + extraction
# ---------------------------------------------------------------------------

def _clean(text: str) -> str:
    """Lowercase, drop bracket characters (keep their words), strip punctuation."""
    t = text.lower()
    t = re.sub(r"[()\[\]]", " ", t)
    t = re.sub(r"[^a-z0-9\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def score_match(seed_name: str, description: str) -> float:
    """Blend fuzzy ratio with token coverage so the right whole food wins.

    SequenceMatcher alone under-rewards USDA's verbose descriptions
    ("Oranges, raw, navel, ..."), so we add a bonus for the share of the seed
    name's words that appear in the description.
    """
    q = _clean(seed_name)
    d = _clean(description)
    if not q or not d:
        return 0.0
    ratio = SequenceMatcher(None, q, d).ratio()
    q_tokens = q.split()
    d_tokens = set(d.split())
    coverage = sum(1 for w in q_tokens if w in d_tokens) / len(q_tokens)
    return round(0.5 * ratio + 0.5 * coverage, 3)


def best_candidate(seed_name: str, candidates: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, float]:
    best: dict[str, Any] | None = None
    best_score = -1.0
    for c in candidates:
        s = score_match(seed_name, c.get("description", ""))
        if s > best_score:
            best, best_score = c, s
    return best, (best_score if best else 0.0)


def extract_panel(fdc_food: dict[str, Any]) -> dict[str, float]:
    out = dict(_EMPTY_NUTRIENTS)
    for n in fdc_food.get("foodNutrients", []):
        nid = (n.get("nutrient") or {}).get("id") or n.get("nutrientId")
        amount = n.get("amount") or n.get("value") or 0.0
        key = _NUTRIENT_MAP.get(nid)
        if key:
            out[key] = float(amount)
    if not out["soluble_fiber_g"] and out["fiber_g"]:
        out["soluble_fiber_g"] = round(out["fiber_g"] * _SOLUBLE_FIBER_FRACTION, 1)
    return out


# ---------------------------------------------------------------------------
# Backfill
# ---------------------------------------------------------------------------

def has_micros(nutrients: dict[str, Any]) -> bool:
    """True if any vitamin/mineral key is already populated (non-zero)."""
    return any(float(nutrients.get(k) or 0.0) > 0 for k in _MICRO_KEYS
               if k not in ("added_sugars_g",))


def backfill_entry(
    entry: dict[str, Any],
    key: str,
    *,
    force: bool,
    min_score: float,
    delay: float,
) -> dict[str, Any]:
    """Enrich one seed entry in place. Returns a review record."""
    name = entry["name"]
    nutrients = entry.setdefault("nutrients", {})
    record: dict[str, Any] = {
        "name": name, "status": "", "match": "", "fdc_id": "",
        "score": 0.0, "added": 0, "kcal": nutrients.get("calories"), "vit_c": None,
    }

    if has_micros(nutrients) and not force:
        record["status"] = "already-enriched"
        return record

    candidates = search_candidates(name, key)
    time.sleep(delay)
    if not candidates:
        record["status"] = "no-match"
        return record

    cand, sc = best_candidate(name, candidates)
    record["score"] = sc
    if cand is None or sc < min_score:
        record["status"] = "below-threshold"
        record["match"] = (cand or {}).get("description", "")
        record["fdc_id"] = (cand or {}).get("fdcId", "")
        return record

    fdc_id = cand.get("fdcId")
    detail = fetch_detail(fdc_id, key) if fdc_id else None
    time.sleep(delay)
    if not detail:
        record["status"] = "detail-failed"
        record["match"] = cand.get("description", "")
        record["fdc_id"] = fdc_id or ""
        return record

    panel = extract_panel(detail)
    added = 0
    for k in _MICRO_KEYS:
        # Fill only keys we don't already carry (or force overwrite).
        if force or not nutrients.get(k):
            val = round(float(panel.get(k) or 0.0), 3)
            nutrients[k] = val
            if val:
                added += 1

    record["status"] = "ok" if sc >= 0.6 else "low-confidence"
    record["match"] = cand.get("description", "")
    record["fdc_id"] = fdc_id
    record["added"] = added
    record["vit_c"] = nutrients.get("vitamin_c_mg")
    return record


def write_review(records: list[dict[str, Any]], path: Path) -> None:
    by_status: dict[str, int] = {}
    for r in records:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1

    low = [r for r in records if r["status"] in ("low-confidence", "below-threshold")]
    misses = [r for r in records if r["status"] in ("no-match", "detail-failed")]

    lines: list[str] = []
    lines.append("# Reference-food micronutrient backfill — review\n")
    lines.append(f"- Total reference foods: **{len(records)}**")
    for status in sorted(by_status):
        lines.append(f"- {status}: **{by_status[status]}**")
    lines.append("")
    lines.append(
        "Scores blend fuzzy name similarity with token coverage (0–1). "
        "`ok` ≥ 0.6, `low-confidence` applied below that — **verify these**. "
        "`below-threshold`/`no-match`/`detail-failed` were left unchanged.\n"
    )

    if low:
        lines.append("## ⚠️ Verify these (low confidence)\n")
        lines.append("| Seed food | USDA match | fdcId | score |")
        lines.append("|---|---|---|---|")
        for r in low:
            lines.append(f"| {r['name']} | {r['match']} | {r['fdc_id']} | {r['score']} |")
        lines.append("")

    if misses:
        lines.append("## ❌ Not enriched (no usable match)\n")
        lines.append("| Seed food | status |")
        lines.append("|---|---|")
        for r in misses:
            lines.append(f"| {r['name']} | {r['status']} |")
        lines.append("")

    lines.append("## All foods\n")
    lines.append("| Seed food | status | USDA match | fdcId | score | micros added | kcal/100g | Vit C mg/100g |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for r in records:
        vit_c = "" if r["vit_c"] is None else f"{r['vit_c']:.1f}"
        lines.append(
            f"| {r['name']} | {r['status']} | {r['match']} | {r['fdc_id']} | "
            f"{r['score']} | {r['added']} | {r['kcal']} | {vit_c} |"
        )
    lines.append("")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--source", default=str(_SEED_FILE),
                        help="Reference seed JSON to read (default: usda_seed_foods.json)")
    parser.add_argument("--output", default=str(_SEED_FILE.parent / "staged" / "usda_seed_micros.json"),
                        help="Where to write the enriched seed JSON")
    parser.add_argument("--review", default=str(_SEED_FILE.parent / "staged" / "micros_review.md"),
                        help="Where to write the review report")
    parser.add_argument("--min-score", type=float, default=0.4,
                        help="Skip matches scoring below this (0–1, default 0.4)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Only process the first N foods (0 = all). Handy for a dry run.")
    parser.add_argument("--delay", type=float, default=0.3,
                        help="Seconds to pause between API calls (politeness/rate limits)")
    parser.add_argument("--force", action="store_true",
                        help="Re-enrich even foods that already carry micronutrients")
    args = parser.parse_args()

    key = _api_key()

    with open(args.source) as f:
        foods: list[dict[str, Any]] = json.load(f)

    if args.limit:
        foods = foods[: args.limit]

    print(f"Backfilling micronutrients for {len(foods)} reference foods…\n")
    records: list[dict[str, Any]] = []
    for i, entry in enumerate(foods, 1):
        rec = backfill_entry(entry, key, force=args.force, min_score=args.min_score, delay=args.delay)
        records.append(rec)
        tag = {
            "ok": "OK   ", "low-confidence": "LOW  ", "below-threshold": "SKIP ",
            "no-match": "MISS ", "detail-failed": "FAIL ", "already-enriched": "HAVE ",
        }.get(rec["status"], "???? ")
        extra = f"score={rec['score']} +{rec['added']} micros  ← {rec['match'][:60]}" if rec["match"] else rec["status"]
        print(f"  [{i:>3}/{len(foods)}] {tag} {entry['name']:<32} {extra}")

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(foods, f, indent=2)

    write_review(records, Path(args.review))

    enriched = sum(1 for r in records if r["status"] in ("ok", "low-confidence"))
    low = sum(1 for r in records if r["status"] in ("low-confidence", "below-threshold"))
    print(f"\nEnriched {enriched}/{len(foods)} foods.")
    print(f"Wrote enriched seed → {out_path}")
    print(f"Wrote review report → {args.review}")
    if low:
        print(f"⚠️  {low} match(es) need a human eyeball — see the review report before applying.")
    print("\nNext: review the report, then `make seed-micros-apply` to overwrite the seed and re-seed the DB.")


if __name__ == "__main__":
    main()
