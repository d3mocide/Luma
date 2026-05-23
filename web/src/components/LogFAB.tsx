import { useUIStore } from '../stores'

export default function LogFAB() {
  const open = useUIStore((s) => s.openLogSheet)
  return (
    <button
      onClick={open}
      className="w-12 h-12 rounded-full bg-brand-500 text-white text-2xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
      aria-label="Log meal"
    >
      +
    </button>
  )
}
