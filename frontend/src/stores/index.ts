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
    }),
    {
      name: 'luma-ui',
      partialize: (s) => ({ theme: s.theme }),
    },
  ),
)
