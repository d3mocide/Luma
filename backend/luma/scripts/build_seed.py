"""Generate staged seed batches from USDA FoodData Central bulk datasets.

Download the dataset ZIPs from https://fdc.nal.usda.gov/download-datasets
then unzip and pass the JSON file as --source.

Supported dataset formats
  SR Legacy  : FoodData_Central_sr_legacy_food_json_*.zip  → SRLegacyFoods key
  Foundation : FoodData_Central_foundation_food_json_*.zip → FoundationFoods key

Usage
-----
# Build a staged batch from downloaded SR Legacy data:
python -m luma.scripts.build_seed \\
    --source /path/to/FoodData_Central_sr_legacy_food_json_2021-10-28.json \\
    --batch proteins \\
    --output backend/luma/scripts/staged/batch_01_proteins.json

# Merge a staged batch into the main seed (review it first!):
python -m luma.scripts.build_seed \\
    --merge backend/luma/scripts/staged/batch_01_proteins.json

Batch IDs
---------
  proteins   Beef cuts, chicken, fish, pork
  grains     Rice varieties, pasta, bread, oats
  dairy      More cheese, yogurt, milk varieties
  produce    More vegetables and fruit
  legumes    More beans, lentils, tofu varieties
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Nutrient ID → seed key mapping (mirrors usda_client.py exactly)
#
# This MUST stay in sync with luma.services.usda_client._NUTRIENT_MAP. The live
# USDA search path extracts the full micronutrient panel below; when the seed
# builder mapped only the ten macros, freshly-searched foods carried richer data
# than our curated reference rows. Keeping both maps identical means a regenerated
# seed has the same depth as anything pulled live.
# ---------------------------------------------------------------------------
_NUTRIENT_MAP: dict[int, str] = {
    # Macros
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
    # Electrolytes
    1093: "sodium_mg",
    1092: "potassium_mg",
    # Minerals
    1087: "calcium_mg",
    1089: "iron_mg",
    1090: "magnesium_mg",
    1091: "phosphorus_mg",
    1095: "zinc_mg",
    1103: "selenium_mcg",
    # Vitamins
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

# Mirrors usda_client._SOLUBLE_FIBER_FRACTION: FDC rarely reports soluble fiber
# (1082), so estimate it from total dietary fiber (1079) at ~0.25 when absent.
_SOLUBLE_FIBER_FRACTION = 0.25

# ---------------------------------------------------------------------------
# Priority food targets per batch
#
# Each entry:
#   (seed_name, [regex patterns against FDC description], default_serving_g, tags, curated_flags)
#
# Patterns are tried in order; first match wins.  Prefer specific patterns first.
# The script selects the FDC entry whose description best matches the first
# regex that returns any hit.
# ---------------------------------------------------------------------------
BATCHES: dict[str, list[tuple[str, list[str], float, list[str], list[str]]]] = {
    "proteins": [
        # ── Beef steaks ──────────────────────────────────────────────────────
        ("Ribeye Steak (Cooked)",
         [r"beef.*rib.?eye steak.*cooked", r"beef.*rib.?eye.*cooked.*grilled"],
         227.0, ["beef", "red-meat", "protein", "keto"], []),
        ("New York Strip Steak (Cooked)",
         [r"beef.*short loin.*strip steak.*cooked", r"beef.*loin.*strip.*cooked"],
         227.0, ["beef", "red-meat", "protein", "keto"], []),
        ("Flank Steak (Cooked)",
         [r"beef.*flank steak.*cooked", r"beef.*flank.*cooked"],
         170.0, ["beef", "red-meat", "lean-protein", "keto"], []),
        ("Filet Mignon (Cooked)",
         [r"beef.*tenderloin steak.*cooked", r"beef.*tenderloin.*cooked.*roasted"],
         170.0, ["beef", "red-meat", "lean-protein", "keto"], []),
        ("T-Bone Steak (Lean, Cooked)",
         [r"beef.*t-bone steak.*cooked", r"beef.*t.bone.*cooked"],
         255.0, ["beef", "red-meat", "protein", "keto"], []),
        ("Skirt Steak (Cooked)",
         [r"beef.*skirt steak.*cooked"],
         170.0, ["beef", "red-meat", "protein", "keto"], []),
        ("Beef Brisket (Lean, Braised)",
         [r"beef.*brisket.*braised.*lean", r"beef.*brisket.*braised"],
         113.0, ["beef", "red-meat", "protein"], []),
        ("Beef Short Ribs (Braised)",
         [r"beef.*short ribs.*braised", r"beef.*ribs.*short.*braised"],
         113.0, ["beef", "red-meat", "protein"], []),
        ("Ground Beef (80% Lean, Cooked)",
         [r"beef.*80.*lean.*cooked", r"beef.*ground.*80.*cooked.*pan"],
         113.0, ["beef", "red-meat", "protein", "keto"], []),
        # ── Chicken ──────────────────────────────────────────────────────────
        ("Chicken Drumstick (Roasted, Skin On)",
         [r"chicken.*drumstick.*roasted.*skin.*eaten", r"chicken.*leg.*drumstick.*roasted"],
         86.0, ["poultry", "protein", "keto"], []),
        ("Chicken Wing (Roasted, with Skin)",
         [r"chicken.*wing.*roasted.*skin.*eaten", r"chicken.*wings.*roasted.*skin"],
         34.0, ["poultry", "protein", "keto"], []),
        ("Rotisserie Chicken Breast (with Skin)",
         [r"chicken.*breast.*rotisserie", r"chicken.*breast.*cooked.*rotisserie"],
         174.0, ["poultry", "lean-protein", "keto"], []),
        ("Chicken Liver (Pan-Fried)",
         [r"chicken.*liver.*cooked.*pan.?fried", r"chicken.*liver.*pan.?fried"],
         85.0, ["poultry", "protein", "iron"], []),
        # ── Salmon ───────────────────────────────────────────────────────────
        ("Atlantic Salmon (Farmed, Cooked)",
         [r"fish.*salmon.*atlantic.*farmed.*cooked", r"salmon.*atlantic.*farmed.*dry heat"],
         178.0, ["seafood", "lean-protein", "omega-3", "keto"], []),
        ("Sockeye Salmon (Cooked)",
         [r"fish.*salmon.*sockeye.*cooked", r"salmon.*sockeye.*dry heat"],
         178.0, ["seafood", "lean-protein", "omega-3", "keto"], []),
        ("Smoked Salmon (Cold Smoked)",
         [r"fish.*salmon.*smoked.*chinook|fish.*salmon.*smoked.*atlantic",
          r"salmon.*smoked"],
         57.0, ["seafood", "protein", "omega-3"], []),
        # ── Tuna ─────────────────────────────────────────────────────────────
        ("Tuna (Yellowfin, Fresh, Cooked)",
         [r"fish.*tuna.*yellowfin.*cooked.*dry heat", r"tuna.*yellowfin.*cooked"],
         170.0, ["seafood", "lean-protein", "keto"], []),
        ("Tuna (Bluefin, Fresh, Cooked)",
         [r"fish.*tuna.*bluefin.*cooked.*dry heat", r"tuna.*bluefin.*cooked"],
         170.0, ["seafood", "lean-protein", "omega-3", "keto"], []),
        ("Tuna (Canned in Oil, Drained)",
         [r"fish.*tuna.*oil.*drained", r"tuna.*oil.*canned"],
         140.0, ["seafood", "protein", "keto"], []),
        ("Albacore Tuna (Canned in Water, Drained)",
         [r"fish.*tuna.*white.*water.*drained", r"tuna.*albacore.*water"],
         140.0, ["seafood", "lean-protein", "keto"], []),
        # ── Pork ─────────────────────────────────────────────────────────────
        ("Baby Back Ribs (Pork, Braised)",
         [r"pork.*loin.*back ribs.*braised", r"pork.*back ribs.*braised"],
         113.0, ["pork", "protein", "keto"], []),
        ("Pork Belly (Braised)",
         [r"pork.*belly.*braised"],
         85.0, ["pork", "keto", "high-saturated-fat"], []),
        ("Ham (Regular, Cured, Roasted)",
         [r"pork.*leg.*ham.*whole.*roasted", r"ham.*cured.*roasted.*regular"],
         85.0, ["pork", "protein", "high-sodium"], []),
        ("Pulled Pork (Slow Roasted)",
         [r"pork.*shoulder.*roasted.*lean and fat", r"pork.*shoulder.*picnic.*roasted"],
         113.0, ["pork", "protein", "keto"], []),
    ],
    "grains": [
        ("Jasmine Rice (White, Cooked)",
         [r"rice.*white.*glutinous|rice.*jasmine.*cooked", r"rice.*long.grain.*cooked.*regular"],
         186.0, ["grain", "carb", "gluten-free"], []),
        ("Arborio Rice (Cooked)",
         [r"rice.*arborio.*cooked", r"rice.*medium.grain.*cooked.*regular"],
         186.0, ["grain", "carb", "gluten-free"], []),
        ("Spaghetti (Whole Wheat, Cooked)",
         [r"spaghetti.*whole.wheat.*cooked", r"pasta.*whole.wheat.*cooked.*spaghetti"],
         140.0, ["grain", "complex-carb", "fiber-rich"], []),
        ("Pasta (Whole Wheat, Cooked)",
         [r"pasta.*whole.wheat.*cooked", r"spaghetti.*whole.wheat.*cooked"],
         140.0, ["grain", "complex-carb", "fiber-rich"], []),
        ("Couscous (Cooked)",
         [r"couscous.*cooked"],
         157.0, ["grain", "carb"], []),
        ("Polenta (Cooked)",
         [r"cornmeal.*cooked.*with.*water|polenta.*cooked"],
         240.0, ["grain", "carb", "gluten-free"], []),
        ("Oatmeal (Steel Cut, Cooked)",
         [r"oat.*groats.*cooked|oatmeal.*regular.*cooked"],
         234.0, ["grain", "fiber-rich", "cholesterol-lowering"], ["heart-healthy"]),
        ("Tortilla (Flour, Small)",
         [r"tortillas.*flour.*ready-to-bake|tortilla.*flour"],
         45.0, ["grain", "carb", "bread"], []),
        ("Pita Bread (White)",
         [r"bread.*pita.*white.*unenriched|pita.*white"],
         60.0, ["grain", "carb", "bread"], []),
        ("English Muffin (Whole Wheat)",
         [r"english muffin.*whole.wheat|muffin.*english.*whole.wheat"],
         57.0, ["grain", "fiber-rich", "bread"], []),
    ],
    "produce": [
        ("Avocado (Raw)",
         [r"avocados.*raw.*california|avocado.*raw"],
         150.0, ["fruit", "healthy-fat", "monounsaturated", "keto"], ["heart-healthy"]),
        ("Mango (Raw)",
         [r"mangos.*raw|mango.*raw"],
         165.0, ["fruit", "tropical", "vitamin-c"], []),
        ("Edamame (Frozen, Cooked)",
         [r"edamame.*frozen.*cooked|edamame.*cooked"],
         155.0, ["vegetable", "plant-protein", "fiber-rich"], ["gluten-free"]),
        ("Broccoli (Cooked)",
         [r"broccoli.*cooked.*boiled.*drained.*salt", r"broccoli.*cooked"],
         156.0, ["vegetable", "fiber-rich", "vitamin-c", "vitamin-k"], ["heart-healthy"]),
        ("Spinach (Cooked)",
         [r"spinach.*cooked.*boiled.*drained.*salt", r"spinach.*cooked"],
         180.0, ["vegetable", "iron", "vitamin-k", "calcium"], []),
        ("Sweet Corn (Cooked)",
         [r"corn.*sweet.*yellow.*cooked.*boiled", r"corn.*cooked.*yellow"],
         154.0, ["vegetable", "carb", "fiber-rich"], []),
        ("Bell Pepper (Yellow, Raw)",
         [r"peppers.*sweet.*yellow.*raw|pepper.*yellow.*sweet.*raw"],
         186.0, ["vegetable", "vitamin-c", "low-calorie"], []),
        ("Cherry Tomatoes (Raw)",
         [r"tomatoes.*cherry.*raw|cherry tomatoes.*raw"],
         149.0, ["vegetable", "lycopene", "low-calorie"], []),
        ("Kale (Cooked)",
         [r"kale.*cooked.*boiled.*drained", r"kale.*cooked"],
         130.0, ["vegetable", "calcium", "vitamin-k", "iron"], []),
        ("Brussels Sprouts (Cooked)",
         [r"brussels sprouts.*cooked.*boiled", r"brussels.*sprouts.*cooked"],
         156.0, ["vegetable", "fiber-rich", "vitamin-c", "vitamin-k"], []),
    ],
}


# ---------------------------------------------------------------------------
# FDC dataset parsing
# ---------------------------------------------------------------------------

def _extract_nutrients_from_fdc(fdc_food: dict[str, Any]) -> dict[str, float]:
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


def _find_best_match(
    foods: list[dict[str, Any]],
    patterns: list[str],
) -> dict[str, Any] | None:
    """Return the first FDC food whose description matches any pattern (in order)."""
    for pat in patterns:
        rx = re.compile(pat, re.IGNORECASE)
        for food in foods:
            if rx.search(food.get("description", "")):
                return food
    return None


# ---------------------------------------------------------------------------
# Food-group categorisation — mirrors the 13 groups on the Meals page
# (frontend/src/lib/food-categories.ts). Stamped onto each seed entry so the
# category browse can list a whole group straight from the local database.
# ---------------------------------------------------------------------------
CATEGORY_IDS: list[str] = [
    "vegetables", "fruits", "legumes", "grains", "fish", "poultry", "eggs",
    "nuts", "low-fat-dairy", "full-fat-dairy", "red-meat", "processed-meat",
    "tropical-oils",
]


def classify_category(name: str, tags: list[str], nutrients: dict[str, float]) -> str | None:
    n = name.lower()
    t = set(tags)
    sat = float(nutrients.get("saturated_fat_g", 0) or 0)

    if re.search(r"\b(coconut|palm)\b", n) and ("oil" in n or "cream" in n or "milk" in n):
        return "tropical-oils"
    if re.match(r"egg\b", n):
        return "eggs"
    if re.search(r"\b(bacon|sausage|salami|pepperoni|prosciutto|deli|corned beef|hot dog|frankfurter|ham)\b", n):
        return "processed-meat"
    if "poultry" in t or re.search(r"\b(chicken|turkey|duck)\b", n):
        return "poultry"
    if "seafood" in t:
        return "fish"
    if t & {"beef", "red-meat", "pork", "lamb", "game"} or re.search(
        r"\b(beef|steak|lamb|pork|bison|venison|ribs|brisket|sirloin|ribeye|filet|veal)\b", n
    ):
        return "red-meat"
    if t & {"nuts", "seeds"} or re.search(
        r"\b(almond|walnut|cashew|pistachio|pecan|macadamia|brazil nut|peanut|seed|tahini|flax|chia|hemp|sunflower|pumpkin|sesame)\b", n
    ):
        return "nuts"
    if "condiment" not in t and "sauce" not in n and not re.search(r"\bsnap pea", n) and (
        "plant-protein" in t
        or re.search(r"\b(beans?|lentils?|chickpeas?|garbanzo|edamame|hummus|tofu|tempeh|split pea|black-eyed pea|green pea|mung)\b", n)
    ):
        return "legumes"
    if "dairy" in t or re.search(
        r"\b(milk|cheese|yogurt|cream|butter|kefir|ricotta|feta|cheddar|gouda|parmesan|mozzarella|brie|whey)\b", n
    ):
        if "whole" in n:
            return "full-fat-dairy"
        if re.search(r"\b(skim|nonfat|non-fat|low.fat|part.skim|1%|2%|light|fat.free)\b", n):
            return "low-fat-dairy"
        return "full-fat-dairy" if sat >= 3.0 else "low-fat-dairy"
    if t & {"grain", "bread"} or re.search(
        r"\b(rice|oat|quinoa|barley|bread|pasta|tortilla|bulgur|farro|millet|buckwheat|amaranth|couscous|rye|wheat)\b", n
    ):
        return "grains"
    if "vegetable" in t:
        return "vegetables"
    if "fruit" in t:
        return "fruits"
    return None


def _fdc_to_seed_entry(
    fdc_food: dict[str, Any],
    seed_name: str,
    serving_size_g: float,
    tags: list[str],
    curated_flags: list[str],
) -> dict[str, Any]:
    nutrients = _extract_nutrients_from_fdc(fdc_food)
    return {
        "name": seed_name,
        "brand": "USDA Reference",
        "serving_size_g": serving_size_g,
        "tags": tags,
        "category": classify_category(seed_name, tags, nutrients),
        "nutrients": nutrients,
        "flags": curated_flags,
        "_fdc_source": {
            "fdcId": fdc_food.get("fdcId"),
            "description": fdc_food.get("description"),
        },
    }


def load_fdc_dataset(path: Path) -> list[dict[str, Any]]:
    """Load SR Legacy or Foundation Foods JSON and return the flat food list."""
    with open(path) as f:
        data = json.load(f)

    for top_key in ("SRLegacyFoods", "FoundationFoods", "foods"):
        if top_key in data:
            foods = data[top_key]
            print(f"Loaded {len(foods):,} foods from '{top_key}' in {path.name}")
            return foods

    raise ValueError(
        f"Unrecognised FDC dataset format — expected one of: "
        f"SRLegacyFoods, FoundationFoods, foods.  Got keys: {list(data.keys())}"
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cmd_build(args: argparse.Namespace) -> None:
    source_path = Path(args.source)
    if not source_path.exists():
        print(f"ERROR: source file not found: {source_path}", file=sys.stderr)
        sys.exit(1)

    batch_id = args.batch
    if batch_id not in BATCHES:
        print(f"ERROR: unknown batch '{batch_id}'. Available: {', '.join(BATCHES)}", file=sys.stderr)
        sys.exit(1)

    fdc_foods = load_fdc_dataset(source_path)
    targets = BATCHES[batch_id]

    output_entries = []
    misses = []

    for seed_name, patterns, serving_g, tags, flags in targets:
        match = _find_best_match(fdc_foods, patterns)
        if match is None:
            print(f"  MISS  {seed_name}")
            misses.append(seed_name)
            continue

        entry = _fdc_to_seed_entry(match, seed_name, serving_g, tags, flags)
        cal = entry["nutrients"]["calories"]
        print(f"  OK    {seed_name}  ({cal:.0f} kcal/100g)  ← {match['description'][:70]}")
        output_entries.append(entry)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(output_entries, f, indent=2)

    print(f"\nWrote {len(output_entries)} entries to {out_path}")
    if misses:
        print(f"WARNING: {len(misses)} unmatched targets — review patterns: {misses}")


def cmd_merge(args: argparse.Namespace) -> None:
    batch_path = Path(args.merge)
    if not batch_path.exists():
        print(f"ERROR: batch file not found: {batch_path}", file=sys.stderr)
        sys.exit(1)

    seed_path = Path(__file__).parent / "usda_seed_foods.json"

    with open(batch_path) as f:
        new_entries: list[dict] = json.load(f)

    with open(seed_path) as f:
        existing: list[dict] = json.load(f)

    existing_names = {e["name"].lower() for e in existing}
    added = 0
    skipped = 0

    for entry in new_entries:
        # Strip the internal _fdc_source annotation before merging
        entry.pop("_fdc_source", None)
        if entry["name"].lower() in existing_names:
            print(f"  SKIP  {entry['name']}  (already in seed)")
            skipped += 1
        else:
            # Basic sanity check — skip zero-calorie entries
            if entry.get("nutrients", {}).get("calories", 0) == 0:
                print(f"  SKIP  {entry['name']}  (zero calories — incomplete FDC data)")
                skipped += 1
                continue
            existing.append(entry)
            existing_names.add(entry["name"].lower())
            print(f"  ADD   {entry['name']}")
            added += 1

    with open(seed_path, "w") as f:
        json.dump(existing, f, indent=2)

    print(f"\nMerged {added} new entries into {seed_path.name}  ({skipped} skipped)")
    print(f"Total seed entries: {len(existing)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd")

    build_p = sub.add_parser("build", help="Build a staged batch from a downloaded FDC dataset")
    build_p.add_argument("--source", required=True, help="Path to downloaded FDC JSON file")
    build_p.add_argument("--batch", required=True, choices=list(BATCHES), help="Batch ID to generate")
    build_p.add_argument("--output", required=True, help="Output path for staged JSON")

    merge_p = sub.add_parser("merge", help="Merge a reviewed staged batch into usda_seed_foods.json")
    merge_p.add_argument("file", metavar="STAGED_JSON", help="Path to staged batch JSON")

    # Legacy flat-arg compat: --merge <file>
    parser.add_argument("--merge", metavar="STAGED_JSON", help=argparse.SUPPRESS)
    parser.add_argument("--source", metavar="SOURCE", help=argparse.SUPPRESS)
    parser.add_argument("--batch", choices=list(BATCHES), help=argparse.SUPPRESS)
    parser.add_argument("--output", metavar="OUTPUT", help=argparse.SUPPRESS)

    args = parser.parse_args()

    if args.cmd == "build" or (args.cmd is None and args.source):
        cmd_build(args)
    elif args.cmd == "merge" or (args.cmd is None and args.merge):
        if args.cmd is None:
            args.file = args.merge
        cmd_merge(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
