import { X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api, type Dri } from '../../lib/api'
import { NutrientBreakdownList } from './NutrientBreakdownList'

type Nutrition = Record<string, number>

export function NutrientBreakdownSheet({
  title,
  nutrition,
  onClose,
}: {
  title: string
  nutrition: Nutrition
  onClose: () => void
}) {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ dri?: Dri }>('/auth/me') })
  const dri = me?.dri ?? null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(5,8,17,0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 200,
        }}
      />
      {/* Sheet */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          maxHeight: '92dvh',
          background: 'linear-gradient(180deg, rgba(13,20,37,0.86), rgba(8,13,26,0.94))',
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
          borderTop: '1px solid var(--glass-edge-strong)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 12px',
          borderBottom: '1px solid var(--glass-edge)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-primary)' }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>
              %DV based on{dri ? ' your personalised DRI' : ' 2,000 kcal reference'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--glass-edge)',
              border: 'none',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              color: 'var(--fg-tertiary)',
              lineHeight: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px 32px', flex: 1 }}>
          <NutrientBreakdownList nutrition={nutrition} dri={dri} />
        </div>
      </div>
    </>
  )
}
