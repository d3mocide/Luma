export interface FoodCategory {
  id: string
  name: string
  emoji: string
  satFatRange: string
  satFatLevel: 'low' | 'medium' | 'high'
  examples: string[]
  description: string
  searchQuery: string
}

export const FOOD_CATEGORIES: FoodCategory[] = [
  {
    id: 'vegetables',
    name: 'Vegetables',
    emoji: '🥦',
    satFatRange: '< 0.2g',
    satFatLevel: 'low',
    examples: ['Broccoli', 'Spinach', 'Kale', 'Carrots'],
    description: 'Nearly zero saturated fat. Unlimited on any heart-healthy plan.',
    searchQuery: 'broccoli',
  },
  {
    id: 'fruits',
    name: 'Fruits',
    emoji: '🍎',
    satFatRange: '< 0.1g',
    satFatLevel: 'low',
    examples: ['Berries', 'Apples', 'Oranges', 'Bananas'],
    description: 'Essentially saturated fat-free. High in soluble fiber (especially berries and apples).',
    searchQuery: 'apple',
  },
  {
    id: 'legumes',
    name: 'Legumes & beans',
    emoji: '🫘',
    satFatRange: '0.1–0.5g',
    satFatLevel: 'low',
    examples: ['Lentils', 'Chickpeas', 'Black beans', 'Edamame'],
    description: 'Excellent source of soluble fiber. Major LDL-lowering food group.',
    searchQuery: 'lentils',
  },
  {
    id: 'grains',
    name: 'Whole grains',
    emoji: '🌾',
    satFatRange: '0.2–1g',
    satFatLevel: 'low',
    examples: ['Oats', 'Barley', 'Brown rice', 'Quinoa'],
    description: 'Oats and barley are particularly high in beta-glucan (soluble fiber).',
    searchQuery: 'oats',
  },
  {
    id: 'fish',
    name: 'Fish & seafood',
    emoji: '🐟',
    satFatRange: '0.2–4g',
    satFatLevel: 'low',
    examples: ['Salmon', 'Sardines', 'Tilapia', 'Shrimp'],
    description: 'Rich in omega-3 fatty acids. Oily fish (salmon, sardines) are especially heart-healthy.',
    searchQuery: 'salmon',
  },
  {
    id: 'poultry',
    name: 'Poultry',
    emoji: '🍗',
    satFatRange: '1–4g',
    satFatLevel: 'low',
    examples: ['Chicken breast', 'Turkey breast', 'Skinless thigh'],
    description: 'Lean cuts without skin are a low sat fat protein source.',
    searchQuery: 'chicken breast',
  },
  {
    id: 'eggs',
    name: 'Eggs',
    emoji: '🥚',
    satFatRange: '~3g',
    satFatLevel: 'medium',
    examples: ['Whole eggs', 'Egg whites'],
    description: 'Yolks contribute ~3g sat fat per 100g. Whites are essentially fat-free.',
    searchQuery: 'eggs',
  },
  {
    id: 'nuts',
    name: 'Nuts & seeds',
    emoji: '🥜',
    satFatRange: '2–15g',
    satFatLevel: 'medium',
    examples: ['Walnuts', 'Almonds', 'Flaxseed', 'Cashews', 'Macadamia'],
    description: 'Sat fat varies widely. Walnuts and almonds are lower; macadamia is higher. All provide unsaturated fats.',
    searchQuery: 'almonds',
  },
  {
    id: 'low-fat-dairy',
    name: 'Low-fat dairy',
    emoji: '🥛',
    satFatRange: '0.5–3g',
    satFatLevel: 'low',
    examples: ['Skim milk', 'Low-fat yogurt', 'Cottage cheese (1%)'],
    description: 'Reduced-fat dairy keeps sat fat low while delivering calcium and protein.',
    searchQuery: 'low fat yogurt',
  },
  {
    id: 'full-fat-dairy',
    name: 'Full-fat dairy',
    emoji: '🧀',
    satFatRange: '3–23g',
    satFatLevel: 'high',
    examples: ['Cheddar (~21g)', 'Whole milk (~3g)', 'Cream (~20g)', 'Butter (~51g)'],
    description: 'Major dietary sat fat source. Limit when targeting LDL reduction.',
    searchQuery: 'cheddar cheese',
  },
  {
    id: 'red-meat',
    name: 'Red meat',
    emoji: '🥩',
    satFatRange: '4–10g',
    satFatLevel: 'high',
    examples: ['Beef (~7g)', 'Lamb (~9g)', 'Pork (~5g)'],
    description: 'Primary dietary source of saturated fat. Lean cuts and portion size matter.',
    searchQuery: 'beef',
  },
  {
    id: 'processed-meat',
    name: 'Processed meats',
    emoji: '🌭',
    satFatRange: '5–15g',
    satFatLevel: 'high',
    examples: ['Bacon (~15g)', 'Sausage (~10g)', 'Salami (~11g)'],
    description: 'High in both saturated fat and sodium. Best minimized for cardiovascular health.',
    searchQuery: 'bacon',
  },
  {
    id: 'tropical-oils',
    name: 'Coconut & palm',
    emoji: '🥥',
    satFatRange: '50–87g',
    satFatLevel: 'high',
    examples: ['Coconut oil (~87g)', 'Palm oil (~49g)', 'Coconut cream (~21g)'],
    description: 'Highest sat fat of any food category — higher than butter. Use sparingly.',
    searchQuery: 'coconut oil',
  },
]

export const SAT_FAT_COLORS: Record<FoodCategory['satFatLevel'], string> = {
  low: 'var(--good)',
  medium: 'var(--warn)',
  high: 'var(--bad)',
}

// Dietary flags each food group broadly satisfies, used to filter the browse
// grid. This is a category-level approximation — individual foods carry their
// own precise flags from the backend. Keep keys in sync with FOOD_CATEGORIES ids.
export const CATEGORY_FLAGS: Record<string, string[]> = {
  vegetables:       ['heart-healthy', 'anti-inflammatory', 'gluten-free', 'high-fiber'],
  fruits:           ['heart-healthy', 'anti-inflammatory', 'gluten-free', 'high-fiber'],
  legumes:          ['heart-healthy', 'anti-inflammatory', 'gluten-free', 'high-protein', 'high-fiber'],
  grains:           ['heart-healthy', 'anti-inflammatory', 'high-fiber'],
  fish:             ['heart-healthy', 'anti-inflammatory', 'gluten-free', 'high-protein', 'keto-friendly'],
  poultry:          ['heart-healthy', 'gluten-free', 'high-protein', 'keto-friendly'],
  eggs:             ['gluten-free', 'high-protein', 'keto-friendly'],
  nuts:             ['heart-healthy', 'anti-inflammatory', 'gluten-free', 'high-fiber', 'keto-friendly'],
  'low-fat-dairy':  ['heart-healthy', 'gluten-free', 'high-protein'],
  'full-fat-dairy': ['gluten-free', 'keto-friendly'],
  'red-meat':       ['gluten-free', 'high-protein', 'keto-friendly'],
  'processed-meat': [],
  'tropical-oils':  ['gluten-free', 'keto-friendly'],
}

// AND logic across active flags, matching the backend food-search semantics.
export function categoryMatchesFlags(categoryId: string, activeFlags: string[]): boolean {
  if (activeFlags.length === 0) return true
  const flags = CATEGORY_FLAGS[categoryId] ?? []
  return activeFlags.every((f) => flags.includes(f))
}
