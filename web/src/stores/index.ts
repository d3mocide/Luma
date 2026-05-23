import { create } from 'zustand'

interface UIStore {
  logSheetOpen: boolean
  openLogSheet: () => void
  closeLogSheet: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  logSheetOpen: false,
  openLogSheet: () => set({ logSheetOpen: true }),
  closeLogSheet: () => set({ logSheetOpen: false }),
}))
