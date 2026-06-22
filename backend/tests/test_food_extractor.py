"""Food extractor nutrient sanitization tests."""
from luma.agents.food_extractor import sanitize_extracted_items


def test_clamps_saturated_fat_above_total_fat():
    """Saturated fat above total fat is clamped down to total fat."""
    items = [{"name": "almond milk", "nutrients": {"fat_g": 2.5, "saturated_fat_g": 10.0}}]
    out = sanitize_extracted_items(items)
    assert out[0]["nutrients"]["saturated_fat_g"] == 2.5


def test_leaves_valid_saturated_fat_untouched():
    """A plausible saturated-fat split is preserved."""
    items = [{"name": "butter", "nutrients": {"fat_g": 12.0, "saturated_fat_g": 7.5}}]
    out = sanitize_extracted_items(items)
    assert out[0]["nutrients"]["saturated_fat_g"] == 7.5


def test_clamps_all_fat_subcomponents():
    """Mono/poly/trans fat are each capped at total fat."""
    items = [{"name": "x", "nutrients": {
        "fat_g": 3.0,
        "saturated_fat_g": 1.0,
        "monounsaturated_fat_g": 9.0,
        "polyunsaturated_fat_g": 0.5,
        "trans_fat_g": 5.0,
    }}]
    out = sanitize_extracted_items(items)
    n = out[0]["nutrients"]
    assert n["monounsaturated_fat_g"] == 3.0
    assert n["polyunsaturated_fat_g"] == 0.5
    assert n["trans_fat_g"] == 3.0


def test_tolerates_missing_or_malformed_items():
    """Missing nutrients, non-dict items, and non-numeric fields don't raise."""
    items = [
        {"name": "no nutrients"},
        {"name": "bad fat", "nutrients": {"fat_g": None, "saturated_fat_g": 5.0}},
        "not a dict",
        {"name": "ok", "nutrients": {"fat_g": 4.0, "saturated_fat_g": 1.0}},
    ]
    out = sanitize_extracted_items(items)
    assert out[3]["nutrients"]["saturated_fat_g"] == 1.0
