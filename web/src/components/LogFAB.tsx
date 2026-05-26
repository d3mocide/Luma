import { Plus } from 'lucide-react'
import { useUIStore } from '../stores'

export default function LogFAB() {
  const open = useUIStore((s) => s.openLogSheet)
  return (
    <button
      onClick={open}
      className="btn btn-primary"
      style={{ padding: '10px 18px', gap: 6 }}
      aria-label="Log meal"
    >
      <Plus size={15} strokeWidth={2}/> Log meal
    </button>
  )
}
