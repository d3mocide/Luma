import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DraftItem } from '../components/log-sheet/types'

interface UIStore {
  logSheetOpen: boolean
  theme: 'dark' | 'light'
  openLogSheet: () => void
  closeLogSheet: () => void
  setTheme: (theme: 'dark' | 'light') => void
  toggleTheme: () => void
  pendingLogItems: DraftItem[] | null
  logWithItems: (items: DraftItem[]) => void
  clearPendingLogItems: () => void
  editingMealId: string | null
  editingMealItems: DraftItem[] | null
  editingMealSlot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
  editingMealName: string | null
  startEditingMeal: (id: string, items: DraftItem[], slot: 'breakfast' | 'lunch' | 'dinner' | 'snack', name: string) => void
  clearEditingMeal: () => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      logSheetOpen: false,
      theme: 'dark',
      openLogSheet: () => set({ logSheetOpen: true }),
      closeLogSheet: () => set({ logSheetOpen: false }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
      pendingLogItems: null,
      logWithItems: (items) => set({ pendingLogItems: items, logSheetOpen: true }),
      clearPendingLogItems: () => set({ pendingLogItems: null }),
      editingMealId: null,
      editingMealItems: null,
      editingMealSlot: null,
      editingMealName: null,
      startEditingMeal: (id, items, slot, name) => set({
        editingMealId: id,
        editingMealItems: items,
        editingMealSlot: slot,
        editingMealName: name,
        logSheetOpen: true,
      }),
      clearEditingMeal: () => set({
        editingMealId: null,
        editingMealItems: null,
        editingMealSlot: null,
        editingMealName: null,
      }),
    }),
    {
      name: 'luma-ui',
      partialize: (s) => ({ theme: s.theme }),
    },
  ),
)
