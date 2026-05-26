import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIStore {
  logSheetOpen: boolean
  theme: 'dark' | 'light'
  openLogSheet: () => void
  closeLogSheet: () => void
  setTheme: (theme: 'dark' | 'light') => void
  toggleTheme: () => void
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
    }),
    {
      name: 'luma-ui',
      partialize: (s) => ({ theme: s.theme }),
    },
  ),
)
