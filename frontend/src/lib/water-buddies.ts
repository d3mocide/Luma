export type BuddyId = 'frog' | 'cat' | 'dog' | 'axolotl'

export const BUDDY_IDS: BuddyId[] = ['frog', 'cat', 'dog', 'axolotl']

export const BUDDIES: Record<BuddyId, { label: string; color: string; glow: string }> = {
  frog: { label: 'Frog', color: 'var(--aurora-mint)', glow: 'rgba(94,234,212,0.55)' },
  cat: { label: 'Cat', color: 'var(--aurora-violet)', glow: 'rgba(167,139,250,0.55)' },
  dog: { label: 'Dog', color: 'var(--sun-400)', glow: 'rgba(251,191,36,0.55)' },
  axolotl: { label: 'Axolotl', color: 'var(--aurora-pink)', glow: 'rgba(244,114,182,0.55)' },
}

export function isBuddyId(value: string | undefined): value is BuddyId {
  return value != null && BUDDY_IDS.includes(value as BuddyId)
}
