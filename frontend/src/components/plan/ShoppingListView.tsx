import { useState } from 'react'
import { Check, Download } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { ShoppingItem } from './types'

type Props = {
  planId: string
  shoppingList: ShoppingItem[]
}

export function ShoppingListView({ planId, shoppingList }: Props) {
  const [toggledItems, setToggledItems] = useState<Record<string, boolean>>({})

  const togglePurchasedMutation = useMutation({
    mutationFn: ({ foodId, purchased }: { foodId: string; purchased: boolean }) =>
      api.patch(`/plan/${planId}/shopping-list/${foodId}`, { purchased }),
  })

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="glass" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--glass-edge)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 400, color: 'var(--fg-primary)' }}>Shopping List</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-quiet)' }}>Auto-compiled from this week's plan</p>
          </div>
          <button className="btn" style={{ padding: '8px 14px', fontSize: 12 }}
            onClick={async () => {
              const res: Record<string, string> = await api.post(`/plan/${planId}/shopping-list/export-reminders`)
              alert(res.message || 'Exported!')
            }}>
            <Download size={12} /> Export
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shoppingList.length ? (
            shoppingList.map((item) => {
              const purchased = toggledItems[item.food_id] !== undefined
                ? toggledItems[item.food_id]
                : item.purchased

              return (
                <div key={item.food_id}
                  onClick={() => {
                    const next = !purchased
                    setToggledItems((p) => ({ ...p, [item.food_id]: next }))
                    togglePurchasedMutation.mutate({ foodId: item.food_id, purchased: next })
                  }}
                  style={{
                    padding: '12px 0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                    cursor: 'pointer', borderBottom: '1px solid var(--glass-edge)',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      border: `1px solid ${purchased ? 'var(--good)' : 'var(--glass-edge-strong)'}`,
                      background: purchased ? 'var(--good)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 150ms',
                    }}>
                      {purchased && <Check size={11} color="#050811" strokeWidth={3}/>}
                    </div>
                    <div>
                      <div style={{
                        fontSize: 14, fontWeight: 500,
                        color: purchased ? 'var(--fg-quiet)' : 'var(--fg-primary)',
                        textDecoration: purchased ? 'line-through' : 'none',
                        transition: 'all 150ms',
                      }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{item.aisle || 'Grocery'}</div>
                    </div>
                  </div>
                  <span className="num" style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
                    {item.quantity} {item.unit}
                  </span>
                </div>
              )
            })
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-quiet)', fontSize: 13 }}>
              No items in your shopping list yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
