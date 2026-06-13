export type SectionId =
  | 'weight'
  | 'nutrition'
  | 'streak'
  | 'water'
  | 'biometrics'
  | 'insight'
  | 'plan'
  | 'nutrition_calc'
  | 'meals'

export interface SectionDef {
  id: SectionId
  label: string
  description: string
}

export const SECTION_DEFS: SectionDef[] = [
  { id: 'weight', label: 'Weight', description: '30-day chart + trend slopes' },
  { id: 'nutrition', label: 'Nutrition', description: 'Calories, protein & macro rings' },
  { id: 'streak', label: 'Streak', description: 'Logging streak + adherence' },
  { id: 'water', label: 'Hydration', description: 'Water intake + spirit buddy' },
  { id: 'biometrics', label: 'Biometrics', description: 'HRV, sleep, steps and more' },
  { id: 'insight', label: 'Insight', description: 'Luma\'s active recommendation' },
  { id: 'plan', label: 'Today\'s Plan', description: 'Planned meals + log-as-eaten' },
  { id: 'nutrition_calc', label: 'Nutrient Budget', description: 'Remaining macro targets' },
  { id: 'meals', label: 'Recent Meals', description: 'Logged meals with edit/delete' },
]

export const DEFAULT_ORDER: SectionId[] = [
  'nutrition',
  'weight',
  'streak',
  'insight',
  'water',
  'biometrics',
  'nutrition_calc',
  'plan',
  'meals',
]

// Desktop renders sections in 5 row-groups. The group a section belongs to:
export type DesktopGroup = 'top' | 'biometrics' | 'insight_row' | 'nutrition_calc' | 'meals'

export const SECTION_DESKTOP_GROUP: Record<SectionId, DesktopGroup> = {
  weight: 'top',
  nutrition: 'top',
  streak: 'top',
  water: 'insight_row',
  biometrics: 'biometrics',
  insight: 'insight_row',
  plan: 'insight_row',
  nutrition_calc: 'nutrition_calc',
  meals: 'meals',
}

// Given the user's section order, compute the ordered list of desktop groups (no duplicates).
export function desktopGroupOrder(sectionOrder: SectionId[]): DesktopGroup[] {
  const seen = new Set<DesktopGroup>()
  const out: DesktopGroup[] = []
  for (const id of sectionOrder) {
    const g = SECTION_DESKTOP_GROUP[id]
    if (!seen.has(g)) {
      seen.add(g)
      out.push(g)
    }
  }
  return out
}
