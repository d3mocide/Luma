# Reference-food micronutrient backfill — review

- Total reference foods: **202**
- detail-failed: **8**
- low-confidence: **12**
- no-match: **87**
- ok: **95**

Scores blend fuzzy name similarity with token coverage (0–1). `ok` ≥ 0.6, `low-confidence` applied below that — **verify these**. `below-threshold`/`no-match`/`detail-failed` were left unchanged.

## ⚠️ Verify these (low confidence)

| Seed food | USDA match | fdcId | score |
|---|---|---|---|
| Cod (Baked) | Fish, cod, Pacific, cooked | 175178 | 0.5 |
| Halibut (Baked) | Taco shells, baked | 172800 | 0.517 |
| Mahi-Mahi (Cooked) | Mahi mahi, frozen, wild caught | 2747658 | 0.583 |
| Peanut Butter (Natural, No Salt Added) | Peanut butter, chunk style, with salt | 174265 | 0.579 |
| Pomegranate Arils | Pomegranate juice, bottled | 167787 | 0.583 |
| JalapeÃ±o Pepper (Raw) | Pepper, banana, raw | 169394 | 0.528 |
| Brazil Nuts | Nuts, pine nuts, raw | 2346392 | 0.457 |
| Goat Cheese (ChÃ¨vre, Soft) | Cheese, goat, soft type | 173435 | 0.573 |
| Apple Cider Vinegar | Vinegar, cider | 173469 | 0.552 |
| New York Strip Steak (Cooked) | Lamb, New Zealand, imported, leg chop/steak, bone-in, separable lean only, cooked, fast fried | 174459 | 0.486 |
| Filet Mignon (Cooked) | Beef, ribeye filet, boneless, separable lean only, trimmed to 0" fat, choice, cooked, grilled | 174702 | 0.478 |
| Pulled Pork (Slow Roasted) | Pulled pork in barbecue sauce | 173344 | 0.533 |

## ❌ Not enriched (no usable match)

| Seed food | status |
|---|---|
| Quinoa (Cooked) | no-match |
| Brown Rice (Cooked) | no-match |
| Pasta (Cooked, Enriched) | no-match |
| Orange (Navel) | no-match |
| Grapefruit (Pink) | no-match |
| Arugula (Raw) | no-match |
| Artichoke (Cooked) | no-match |
| Asparagus (Raw) | no-match |
| Broccoli (Raw) | no-match |
| Butternut Squash (Baked) | no-match |
| Cabbage (Raw, Green) | no-match |
| Celery (Raw) | no-match |
| Collard Greens (Cooked) | no-match |
| Eggplant (Cooked) | no-match |
| Green Beans (Cooked) | no-match |
| Green Peas (Cooked) | no-match |
| Kale (Raw) | no-match |
| Mushrooms (White, Raw) | no-match |
| Swiss Chard (Cooked) | no-match |
| Tomato (Raw) | detail-failed |
| Bacon (Pan-Fried) | no-match |
| Canned Tuna (in Water, Drained) | detail-failed |
| Cheddar Cheese | detail-failed |
| Chickpeas / Garbanzo Beans (Cooked) | no-match |
| Cottage Cheese (Low Fat, 1%) | no-match |
| Deli Ham (Regular) | no-match |
| Egg (Large Whole) | no-match |
| Egg White (Large) | detail-failed |
| Flax Seeds (Ground) | no-match |
| Kidney Beans (Cooked) | no-match |
| Lamb (Ground, Cooked) | no-match |
| Lentils (Cooked) | no-match |
| Mozzarella (Part-Skim) | no-match |
| Pork Tenderloin (Roasted) | no-match |
| Ricotta (Part-Skim) | no-match |
| Sardines (Canned in Water, Drained) | no-match |
| Shrimp (Cooked) | no-match |
| Tilapia (Baked) | no-match |
| Tofu (Extra Firm) | no-match |
| Turkey Breast (Roasted, Skinless) | no-match |
| Whey Protein Powder (Unflavored) | no-match |
| Wild Atlantic Salmon (Cooked) | no-match |
| Whole Milk (3.25% Fat) | no-match |
| Farro (Cooked) | no-match |
| Amaranth (Cooked) | no-match |
| Corn Tortilla (Small) | no-match |
| Oatmeal (Instant, Plain, Cooked) | no-match |
| Cherries (Sweet, Raw) | no-match |
| Cantaloupe (Raw) | detail-failed |
| Dates (Medjool) | no-match |
| Bok Choy (Cooked) | no-match |
| Fennel (Raw) | no-match |
| Okra (Cooked) | no-match |
| Watercress (Raw) | no-match |
| Scallions / Green Onions (Raw) | no-match |
| Atlantic Mackerel (Cooked) | no-match |
| Rainbow Trout (Cooked) | no-match |
| Oysters (Pacific, Cooked) | no-match |
| Scallops (Steamed) | no-match |
| Canned Salmon (Pink, in Water) | no-match |
| Dungeness Crab (Cooked) | no-match |
| Ground Turkey (93% Lean, Cooked) | no-match |
| Venison (Ground, Cooked) | no-match |
| Pistachios (Roasted, Unsalted) | no-match |
| Pumpkin Seeds / Pepitas (Roasted) | no-match |
| Sunflower Seeds (Roasted, No Salt) | no-match |
| Sesame Seeds (Whole, Dried) | no-match |
| Pinto Beans (Cooked) | no-match |
| Navy Beans (Cooked) | no-match |
| Black-Eyed Peas (Cooked) | no-match |
| Butter (Unsalted) | no-match |
| Parmesan (Grated) | no-match |
| Swiss Cheese | detail-failed |
| Greek Yogurt (Whole Milk, Full Fat) | no-match |
| Low-Fat Milk (2%) | no-match |
| Plain Whole Milk Yogurt | detail-failed |
| Hummus (Commercial) | no-match |
| Honey (Pure) | no-match |
| Maple Syrup (Pure) | no-match |
| Tomato Sauce (Canned, No Salt Added) | no-match |
| Yellow Mustard | detail-failed |
| Salsa (Fresh/Restaurant Style) | no-match |
| Coconut Milk (Canned, Full Fat) | no-match |
| Soy Sauce (Low Sodium) | no-match |
| Ribeye Steak (Cooked) | no-match |
| Flank Steak (Cooked) | no-match |
| T-Bone Steak (Lean, Cooked) | no-match |
| Beef Brisket (Lean, Braised) | no-match |
| Ground Beef (80% Lean, Cooked) | no-match |
| Tuna (Yellowfin, Fresh, Cooked) | no-match |
| Tuna (Bluefin, Fresh, Cooked) | no-match |
| Tuna (Canned in Oil, Drained) | no-match |
| Albacore Tuna (Canned in Water, Drained) | no-match |
| Baby Back Ribs (Pork, Braised) | no-match |
| Salami (Dry/Hard, Pork & Beef) | no-match |

## All foods

| Seed food | status | USDA match | fdcId | score | micros added | kcal/100g | Vit C mg/100g |
|---|---|---|---|---|---|---|---|
| Steel Cut Oats | ok | Oats, whole grain, steel cut | 2346397 | 0.725 | 10 | 375.0 | 0.0 |
| Rolled Oats | ok | Oats, whole grain, rolled, old fashioned | 2346396 | 0.708 | 10 | 389.0 | 0.0 |
| Quinoa (Cooked) | no-match |  |  | 0.0 | 0 | 120.0 |  |
| Brown Rice (Cooked) | no-match |  |  | 0.0 | 0 | 111.0 |  |
| White Rice (Cooked) | ok | Rice, white, glutinous, unenriched, cooked | 169711 | 0.809 | 14 | 130.0 | 0.0 |
| Pasta (Cooked, Enriched) | no-match |  |  | 0.0 | 0 | 131.0 |  |
| Whole Wheat Bread | ok | Bread, whole-wheat, prepared from recipe | 172690 | 0.791 | 15 | 247.0 | 0.0 |
| White Bread | ok | Bread, white wheat | 167532 | 0.786 | 16 | 266.0 | 0.0 |
| Banana | ok | Pepper, banana, raw | 169394 | 0.761 | 17 | 89.0 | 82.7 |
| Apple (with skin) | ok | Apples, fuji, with skin, raw | 1750340 | 0.708 | 9 | 52.0 | 0.0 |
| Blueberries | ok | Blueberries, raw | 2346411 | 0.923 | 6 | 57.0 | 8.1 |
| Strawberries | ok | Strawberries, raw | 167762 | 0.929 | 17 | 32.0 | 58.8 |
| Raspberries | ok | Raspberries, raw | 2346410 | 0.923 | 6 | 52.0 | 23.0 |
| Avocado | ok | Oil, avocado | 173573 | 0.889 | 2 | 160.0 | 0.0 |
| Orange (Navel) | no-match |  |  | 0.0 | 0 | 49.0 |  |
| Grapefruit (Pink) | no-match |  |  | 0.0 | 0 | 42.0 |  |
| Mango | ok | Mango nectar, canned | 167785 | 0.708 | 17 | 60.0 | 15.2 |
| Peach (Raw) | ok | Abiyuch, raw | 167782 | 0.6 | 7 | 39.0 | 54.1 |
| Pear (Raw) | ok | Pears, raw | 169118 | 0.721 | 17 | 57.0 | 4.3 |
| Pineapple (Raw) | ok | Pineapple, raw | 2346398 | 1.0 | 9 | 50.0 | 58.6 |
| Watermelon | ok | Watermelon, raw | 167765 | 0.917 | 17 | 30.0 | 8.1 |
| Kiwi (Green) | ok | Kiwifruit (kiwi), green, peeled, raw | 2710831 | 0.744 | 7 | 61.0 | 58.8 |
| Arugula (Raw) | no-match |  |  | 0.0 | 0 | 25.0 |  |
| Artichoke (Cooked) | no-match |  |  | 0.0 | 0 | 53.0 |  |
| Asparagus (Raw) | no-match |  |  | 0.0 | 0 | 20.0 |  |
| Beets (Cooked) | ok | Beets, cooked, boiled, drained | 169146 | 0.808 | 17 | 44.0 | 3.6 |
| Bell Pepper (Red, Raw) | ok | Peppers, bell, red, raw | 2258590 | 0.734 | 11 | 31.0 | 141.7 |
| Broccoli (Raw) | no-match |  |  | 0.0 | 0 | 34.0 |  |
| Brussels Sprouts | ok | Brussels sprouts, raw | 2685575 | 0.944 | 7 | 43.0 | 142.9 |
| Butternut Squash (Baked) | no-match |  |  | 0.0 | 0 | 45.0 |  |
| Cabbage (Raw, Green) | no-match |  |  | 0.0 | 0 | 25.0 |  |
| Carrots (Raw) | ok | Carrots, raw | 170393 | 1.0 | 17 | 41.0 | 5.9 |
| Cauliflower (Raw) | ok | Cauliflower, raw | 2685573 | 1.0 | 7 | 25.0 | 67.1 |
| Celery (Raw) | no-match |  |  | 0.0 | 0 | 16.0 |  |
| Collard Greens (Cooked) | no-match |  |  | 0.0 | 0 | 32.0 |  |
| Corn (Yellow, Cooked) | ok | Corn, sweet, yellow, cooked, boiled, drained, with salt | 168525 | 0.769 | 17 | 96.0 | 5.5 |
| Cucumber (Raw) | ok | Cucumber, peeled, raw | 169225 | 0.887 | 17 | 15.0 | 3.2 |
| Eggplant (Cooked) | no-match |  |  | 0.0 | 0 | 35.0 |  |
| Garlic (Raw) | ok | Garlic, raw | 1104647 | 1.0 | 2 | 149.0 | 10.0 |
| Green Beans (Cooked) | no-match |  |  | 0.0 | 0 | 35.0 |  |
| Green Peas (Cooked) | no-match |  |  | 0.0 | 0 | 84.0 |  |
| Kale (Raw) | no-match |  |  | 0.0 | 0 | 49.0 |  |
| Leek (Cooked) | ok | Millet, cooked | 168871 | 0.625 | 15 | 31.0 | 0.0 |
| Mushrooms (White, Raw) | no-match |  |  | 0.0 | 0 | 22.0 |  |
| Onion (Raw) | ok | Onions, raw | 170000 | 0.724 | 16 | 40.0 | 7.4 |
| Romaine Lettuce (Raw) | ok | Lettuce, romaine, green, raw | 2346389 | 0.75 | 9 | 17.0 | 0.0 |
| Snap Peas (Raw) | ok | Beans, snap, green, raw | 2346400 | 0.636 | 9 | 42.0 | 0.0 |
| Spinach (Raw) | ok | Spinach, raw | 168462 | 1.0 | 17 | 23.0 | 28.1 |
| Sweet Potato (Baked) | ok | Sweet potato, frozen, cooked, baked, with salt | 170542 | 0.8 | 15 | 90.0 | 9.1 |
| Swiss Chard (Cooked) | no-match |  |  | 0.0 | 0 | 20.0 |  |
| Tomato (Raw) | detail-failed | Tomatoes, grape, raw | 321360 | 0.607 | 0 | 18.0 |  |
| White Potato (Baked, flesh and skin) | ok | Potatoes, white, flesh and skin, baked | 170434 | 0.755 | 17 | 93.0 | 12.6 |
| Zucchini (Raw) | ok | Squash, zucchini, baby, raw | 168565 | 0.833 | 15 | 17.0 | 34.1 |
| Bacon (Pan-Fried) | no-match |  |  | 0.0 | 0 | 541.0 |  |
| Beef Sirloin Steak (Lean, Cooked) | ok | Beef, top sirloin, steak, separable lean only, trimmed to 0" fat, choice, cooked, broiled | 168635 | 0.77 | 17 | 207.0 | 0.0 |
| Black Beans (Cooked) | ok | Beans, black, mature seeds, cooked, boiled, with salt | 175237 | 0.727 | 15 | 132.0 | 0.0 |
| Canned Tuna (in Water, Drained) | detail-failed | Fish, tuna, light, canned in water, drained solids | 334194 | 0.811 | 0 | 116.0 |  |
| Cheddar Cheese | detail-failed | Cheese, cheddar | 328637 | 0.75 | 0 | 403.0 |  |
| Chickpeas / Garbanzo Beans (Cooked) | no-match |  |  | 0.0 | 0 | 164.0 |  |
| Chicken Breast (Boneless Skinless Cooked) | ok | Chicken, breast, boneless, skinless, raw | 2646170 | 0.84 | 9 | 165.0 | 0.0 |
| Chia Seeds | ok | Chia seeds, dry, raw | 2710819 | 0.857 | 8 | 486.0 | 0.0 |
| Cod (Baked) | low-confidence | Fish, cod, Pacific, cooked | 175178 | 0.5 | 9 | 105.0 | 0.0 |
| Cottage Cheese (Low Fat, 1%) | no-match |  |  | 0.0 | 0 | 72.0 |  |
| Deli Ham (Regular) | no-match |  |  | 0.0 | 0 | 145.0 |  |
| Edamame (Cooked) | ok | Tempeh, cooked | 172467 | 0.62 | 13 | 121.0 | 0.0 |
| Egg (Large Whole) | no-match |  |  | 0.0 | 0 | 143.0 |  |
| Egg White (Large) | detail-failed | Egg, white, dried | 323793 | 0.733 | 0 | 52.0 |  |
| Extra Virgin Olive Oil | ok | Oil, olive, extra virgin | 748608 | 0.773 | 2 | 884.0 | 0.0 |
| Avocado Oil | ok | Oil, avocado | 173573 | 0.818 | 2 | 884.0 | 0.0 |
| Flax Seeds (Ground) | no-match |  |  | 0.0 | 0 | 534.0 |  |
| Greek Yogurt (Nonfat Plain) | ok | Yogurt, Greek, nonfat, plain, CHOBANI | 171312 | 0.828 | 6 | 59.0 | 0.3 |
| Ground Beef (90% Lean, Cooked) | ok | Beef, ground, 90% lean meat / 10% fat, loaf, cooked, baked | 171795 | 0.78 | 19 | 218.0 | 0.0 |
| Halibut (Baked) | low-confidence | Taco shells, baked | 172800 | 0.517 | 17 | 140.0 | 0.0 |
| Kidney Beans (Cooked) | no-match |  |  | 0.0 | 0 | 127.0 |  |
| Lamb (Ground, Cooked) | no-match |  |  | 0.0 | 0 | 283.0 |  |
| Lentils (Cooked) | no-match |  |  | 0.0 | 0 | 116.0 |  |
| Mahi-Mahi (Cooked) | low-confidence | Mahi mahi, frozen, wild caught | 2747658 | 0.583 | 7 | 109.0 | 0.0 |
| Mozzarella (Part-Skim) | no-match |  |  | 0.0 | 0 | 254.0 |  |
| Peanut Butter (Natural, No Salt Added) | low-confidence | Peanut butter, chunk style, with salt | 174265 | 0.579 | 15 | 588.0 | 0.0 |
| Almonds (Raw) | ok | Nuts, almonds, whole, raw | 2346393 | 0.833 | 10 | 579.0 | 0.0 |
| Pork Chop (Boneless, Cooked) | ok | Pork, fresh, blade, (chops), boneless, separable lean and fat, cooked, broiled | 168380 | 0.641 | 18 | 212.0 | 0.0 |
| Pork Tenderloin (Roasted) | no-match |  |  | 0.0 | 0 | 143.0 |  |
| Ricotta (Part-Skim) | no-match |  |  | 0.0 | 0 | 138.0 |  |
| Sardines (Canned in Water, Drained) | no-match |  |  | 0.0 | 0 | 208.0 |  |
| Shrimp (Cooked) | no-match |  |  | 0.0 | 0 | 99.0 |  |
| Tempeh | ok | Tempeh | 174272 | 1.0 | 13 | 195.0 | 0.0 |
| Tilapia (Baked) | no-match |  |  | 0.0 | 0 | 128.0 |  |
| Tofu (Extra Firm) | no-match |  |  | 0.0 | 0 | 83.0 |  |
| Turkey Breast (Roasted, Skinless) | no-match |  |  | 0.0 | 0 | 135.0 |  |
| Walnuts | ok | Nuts, walnuts, glazed | 170593 | 0.769 | 4 | 654.0 | 0.0 |
| Whey Protein Powder (Unflavored) | no-match |  |  | 0.0 | 0 | 352.0 |  |
| Wild Atlantic Salmon (Cooked) | no-match |  |  | 0.0 | 0 | 182.0 |  |
| Whole Milk (3.25% Fat) | no-match |  |  | 0.0 | 0 | 61.0 |  |
| Barley (Pearled, Cooked) | ok | Barley, pearled, cooked | 170285 | 1.0 | 15 | 123.0 | 0.0 |
| Bulgur Wheat (Cooked) | ok | Bulgur, cooked | 170287 | 0.74 | 15 | 83.0 | 0.0 |
| Farro (Cooked) | no-match |  |  | 0.0 | 0 | 170.0 |  |
| Millet (Cooked) | ok | Millet, cooked | 168871 | 1.0 | 15 | 119.0 | 0.0 |
| Amaranth (Cooked) | no-match |  |  | 0.0 | 0 | 102.0 |  |
| Basmati Rice (White, Cooked) | ok | Rice, white, glutinous, unenriched, cooked | 169711 | 0.645 | 14 | 130.0 | 0.0 |
| Wild Rice (Cooked) | ok | Wild rice, cooked | 168897 | 1.0 | 15 | 101.0 | 0.0 |
| Corn Tortilla (Small) | no-match |  |  | 0.0 | 0 | 218.0 |  |
| Sourdough Bread | ok | Bread, french or vienna (includes sourdough) | 172675 | 0.661 | 16 | 274.0 | 0.0 |
| Rye Bread | ok | Bread, rye | 172684 | 0.778 | 16 | 259.0 | 0.4 |
| Oatmeal (Instant, Plain, Cooked) | no-match |  |  | 0.0 | 0 | 68.0 |  |
| Buckwheat Groats (Cooked) | ok | Buckwheat groats, roasted, cooked | 170686 | 0.926 | 15 | 92.0 | 0.0 |
| Cherries (Sweet, Raw) | no-match |  |  | 0.0 | 0 | 63.0 |  |
| Pomegranate Arils | low-confidence | Pomegranate juice, bottled | 167787 | 0.583 | 16 | 83.0 | 0.1 |
| Blackberries (Raw) | ok | Blackberries, raw | 173946 | 1.0 | 17 | 43.0 | 21.0 |
| Cantaloupe (Raw) | detail-failed | Melons, cantaloupe, raw | 746770 | 0.9 | 0 | 34.0 |  |
| Dates (Medjool) | no-match |  |  | 0.0 | 0 | 277.0 |  |
| Bok Choy (Cooked) | no-match |  |  | 0.0 | 0 | 12.0 |  |
| Fennel (Raw) | no-match |  |  | 0.0 | 0 | 31.0 |  |
| Okra (Cooked) | no-match |  |  | 0.0 | 0 | 33.0 |  |
| Radishes (Raw) | ok | Radishes, raw | 169276 | 1.0 | 15 | 16.0 | 14.8 |
| Turnip (Cooked) | ok | Turnip greens, cooked, boiled, drained, with salt | 170139 | 0.724 | 17 | 20.0 | 27.4 |
| Watercress (Raw) | no-match |  |  | 0.0 | 0 | 11.0 |  |
| Belgian Endive (Raw) | ok | Endive, raw | 168412 | 0.69 | 17 | 17.0 | 6.5 |
| Parsnips (Cooked) | ok | Parsnips, cooked, boiled, drained, with salt | 170508 | 0.773 | 16 | 71.0 | 13.0 |
| Scallions / Green Onions (Raw) | no-match |  |  | 0.0 | 0 | 32.0 |  |
| JalapeÃ±o Pepper (Raw) | low-confidence | Pepper, banana, raw | 169394 | 0.528 | 17 | 29.0 | 82.7 |
| Atlantic Mackerel (Cooked) | no-match |  |  | 0.0 | 0 | 262.0 |  |
| Rainbow Trout (Cooked) | no-match |  |  | 0.0 | 0 | 190.0 |  |
| Oysters (Pacific, Cooked) | no-match |  |  | 0.0 | 0 | 163.0 |  |
| Scallops (Steamed) | no-match |  |  | 0.0 | 0 | 111.0 |  |
| Canned Salmon (Pink, in Water) | no-match |  |  | 0.0 | 0 | 127.0 |  |
| Dungeness Crab (Cooked) | no-match |  |  | 0.0 | 0 | 110.0 |  |
| Lobster (Cooked) | ok | Crustaceans, lobster, northern, cooked, moist heat | 174209 | 0.733 | 18 | 98.0 | 0.0 |
| Anchovies (Canned in Olive Oil, Drained) | ok | Anchovies, canned in olive oil, with salt, drained | 2747652 | 0.94 | 7 | 210.0 | 0.0 |
| Chicken Thigh (Boneless, Skinless, Cooked) | ok | Chicken, thigh, boneless, skinless, raw | 2646171 | 0.838 | 9 | 177.0 | 0.0 |
| Ground Turkey (93% Lean, Cooked) | no-match |  |  | 0.0 | 0 | 170.0 |  |
| Venison (Ground, Cooked) | no-match |  |  | 0.0 | 0 | 187.0 |  |
| Bison (Ground, Cooked) | ok | Bison, ground, grass-fed, cooked | 173847 | 0.896 | 17 | 215.0 | 0.0 |
| Pork Sausage (Link, Cooked) | ok | Pork sausage, link/patty, cooked, pan-fried | 174578 | 0.875 | 19 | 339.0 | 0.0 |
| Turkey Bacon (Cooked) | ok | Turkey, Ground, cooked | 171506 | 0.744 | 19 | 218.0 | 0.0 |
| Corned Beef (Cooked) | ok | Beef, cured, corned beef, brisket, cooked | 170200 | 0.827 | 18 | 251.0 | 0.0 |
| Cashews (Raw) | ok | Nuts, cashew nuts, raw | 2515374 | 0.605 | 6 | 553.0 | 0.0 |
| Pistachios (Roasted, Unsalted) | no-match |  |  | 0.0 | 0 | 572.0 |  |
| Pumpkin Seeds / Pepitas (Roasted) | no-match |  |  | 0.0 | 0 | 574.0 |  |
| Sunflower Seeds (Roasted, No Salt) | no-match |  |  | 0.0 | 0 | 582.0 |  |
| Hemp Seeds (Hulled) | ok | Seeds, hemp seed, hulled | 170148 | 0.91 | 15 | 553.0 | 0.5 |
| Sesame Seeds (Whole, Dried) | no-match |  |  | 0.0 | 0 | 573.0 |  |
| Macadamia Nuts (Raw) | ok | Nuts, macadamia nuts, raw | 170178 | 0.939 | 15 | 718.0 | 1.2 |
| Brazil Nuts | low-confidence | Nuts, pine nuts, raw | 2346392 | 0.457 | 9 | 659.0 | 0.0 |
| Pinto Beans (Cooked) | no-match |  |  | 0.0 | 0 | 143.0 |  |
| Navy Beans (Cooked) | no-match |  |  | 0.0 | 0 | 140.0 |  |
| Split Peas (Green, Cooked) | ok | Peas, green, cooked, boiled, drained, with salt | 170102 | 0.637 | 17 | 116.0 | 14.2 |
| Black-Eyed Peas (Cooked) | no-match |  |  | 0.0 | 0 | 116.0 |  |
| Mung Beans (Cooked) | ok | Mung beans, mature seeds, cooked, boiled, with salt | 175255 | 0.766 | 17 | 105.0 | 1.0 |
| Butter (Unsalted) | no-match |  |  | 0.0 | 0 | 717.0 |  |
| Cream Cheese (Regular) | ok | Crackers, cheese, regular | 174975 | 0.752 | 19 | 342.0 | 0.0 |
| Feta Cheese | ok | Cheese, feta | 173420 | 0.773 | 19 | 264.0 | 0.0 |
| Parmesan (Grated) | no-match |  |  | 0.0 | 0 | 431.0 |  |
| Swiss Cheese | detail-failed | Cheese, swiss | 746767 | 0.75 | 0 | 380.0 |  |
| Gouda Cheese | ok | Cheese, gouda | 171241 | 0.75 | 19 | 356.0 | 0.0 |
| Brie Cheese | ok | Cheese, brie | 172177 | 0.773 | 19 | 334.0 | 0.0 |
| Goat Cheese (ChÃ¨vre, Soft) | low-confidence | Cheese, goat, soft type | 173435 | 0.573 | 19 | 364.0 | 0.0 |
| Sour Cream (Regular) | ok | Sour cream, reduced fat | 173442 | 0.708 | 20 | 198.0 | 0.9 |
| Heavy Whipping Cream | ok | Cream, fluid, heavy whipping | 170859 | 0.804 | 21 | 340.0 | 0.6 |
| Greek Yogurt (Whole Milk, Full Fat) | no-match |  |  | 0.0 | 0 | 97.0 |  |
| Kefir (Whole Milk, Plain) | ok | Yogurt, plain, whole milk | 2259793 | 0.642 | 12 | 61.0 | 0.0 |
| Low-Fat Milk (2%) | no-match |  |  | 0.0 | 0 | 50.0 |  |
| Skim Milk (Nonfat) | ok | Milk, fluid, nonfat, calcium fortified (fat free or skim) | 169868 | 0.662 | 19 | 34.0 | 1.0 |
| Plain Whole Milk Yogurt | detail-failed | Yogurt, plain, whole milk | 2259793 | 0.848 | 0 | 62.0 |  |
| Hummus (Commercial) | no-match |  |  | 0.0 | 0 | 177.0 |  |
| Tahini (Sesame Paste) | ok | Seeds, sesame butter, paste | 170191 | 0.629 | 14 | 595.0 | 0.0 |
| Honey (Pure) | no-match |  |  | 0.0 | 0 | 304.0 |  |
| Maple Syrup (Pure) | no-match |  |  | 0.0 | 0 | 260.0 |  |
| Tomato Sauce (Canned, No Salt Added) | no-match |  |  | 0.0 | 0 | 26.0 |  |
| Apple Cider Vinegar | low-confidence | Vinegar, cider | 173469 | 0.552 | 6 | 21.0 | 0.0 |
| Yellow Mustard | detail-failed | Mustard, prepared, yellow | 326698 | 0.689 | 0 | 66.0 |  |
| Salsa (Fresh/Restaurant Style) | no-match |  |  | 0.0 | 0 | 36.0 |  |
| Coconut Milk (Canned, Full Fat) | no-match |  |  | 0.0 | 0 | 230.0 |  |
| Coconut Oil | ok | Oil, coconut | 171412 | 0.818 | 8 | 892.0 | 0.0 |
| Soy Sauce (Low Sodium) | no-match |  |  | 0.0 | 0 | 60.0 |  |
| Ribeye Steak (Cooked) | no-match |  |  | 0.0 | 0 | 291.0 |  |
| New York Strip Steak (Cooked) | low-confidence | Lamb, New Zealand, imported, leg chop/steak, bone-in, separable lean only, cooked, fast fried | 174459 | 0.486 | 17 | 244.0 | 0.0 |
| Flank Steak (Cooked) | no-match |  |  | 0.0 | 0 | 196.0 |  |
| Filet Mignon (Cooked) | low-confidence | Beef, ribeye filet, boneless, separable lean only, trimmed to 0" fat, choice, cooked, grilled | 174702 | 0.478 | 19 | 215.0 | 0.0 |
| T-Bone Steak (Lean, Cooked) | no-match |  |  | 0.0 | 0 | 235.0 |  |
| Skirt Steak (Cooked) | ok | Beef, plate, inside skirt steak, separable lean only, trimmed to 0" fat, all grades, cooked, broiled | 168744 | 0.664 | 16 | 243.0 | 0.0 |
| Beef Brisket (Lean, Braised) | no-match |  |  | 0.0 | 0 | 252.0 |  |
| Beef Short Ribs (Braised) | ok | Beef, chuck, short ribs, boneless, separable lean only, trimmed to 0" fat, choice, cooked, braised | 169567 | 0.705 | 20 | 295.0 | 0.0 |
| Ground Beef (80% Lean, Cooked) | no-match |  |  | 0.0 | 0 | 272.0 |  |
| Chicken Drumstick (Roasted, Skin On) | ok | Chicken, drumstick, meat and skin, raw | 2727566 | 0.697 | 6 | 216.0 | 0.0 |
| Chicken Wing (Roasted, with Skin) | ok | POPEYES, Fried Chicken, Mild, Wing, meat and skin with breading | 170751 | 0.658 | 17 | 290.0 | 0.0 |
| Rotisserie Chicken Breast (with Skin) | ok | Chicken, broiler, rotisserie, BBQ, breast, meat and skin | 171125 | 0.691 | 18 | 188.0 | 0.0 |
| Chicken Liver (Pan-Fried) | ok | Chicken, liver, all classes, cooked, pan-fried | 174491 | 0.854 | 19 | 167.0 | 2.7 |
| Atlantic Salmon (Farmed, Cooked) | ok | Fish, salmon, Atlantic, farmed, cooked, dry heat | 175168 | 0.806 | 20 | 206.0 | 3.7 |
| Sockeye Salmon (Cooked) | ok | Fish, salmon, sockeye, cooked, dry heat | 173692 | 0.75 | 20 | 169.0 | 0.0 |
| Smoked Salmon (Cold Smoked) | ok | Fish, salmon, chinook, smoked | 173687 | 0.728 | 19 | 117.0 | 0.0 |
| Tuna (Yellowfin, Fresh, Cooked) | no-match |  |  | 0.0 | 0 | 139.0 |  |
| Tuna (Bluefin, Fresh, Cooked) | no-match |  |  | 0.0 | 0 | 184.0 |  |
| Tuna (Canned in Oil, Drained) | no-match |  |  | 0.0 | 0 | 186.0 |  |
| Albacore Tuna (Canned in Water, Drained) | no-match |  |  | 0.0 | 0 | 109.0 |  |
| Baby Back Ribs (Pork, Braised) | no-match |  |  | 0.0 | 0 | 292.0 |  |
| Pork Belly (Braised) | ok | Pork, fresh, belly, raw | 167812 | 0.675 | 18 | 518.0 | 0.3 |
| Ham (Regular, Cured, Roasted) | ok | Pork, cured, ham, extra lean and regular, canned, roasted | 167886 | 0.799 | 17 | 163.0 | 0.0 |
| Pulled Pork (Slow Roasted) | low-confidence | Pulled pork in barbecue sauce | 173344 | 0.533 | 21 | 237.0 | 0.2 |
| Salami (Dry/Hard, Pork & Beef) | no-match |  |  | 0.0 | 0 | 378.0 |  |
| Palm Oil | ok | Oil, palm | 171015 | 0.75 | 5 | 884.0 | 0.0 |
| Coconut Cream (Canned) | ok | Nuts, coconut cream, canned, sweetened | 170171 | 0.864 | 15 | 330.0 | 0.0 |
| Low-Fat Yogurt (Plain) | ok | Yogurt, plain, low fat | 170886 | 0.8 | 19 | 63.0 | 0.8 |
