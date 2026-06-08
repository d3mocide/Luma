import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Heart, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api'
import { getCurrentSlot } from '../../lib/format'
import { toNutrients } from '../../lib/nutrients'
import type { Favorite, FavoriteItem } from '../log-sheet/types'

const PAGE_SIZE = 4

function totalKcal(items: FavoriteItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + (i.nutrients.calories ?? 0), 0))
}

export function FavoritesWidget({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [loggedId, setLoggedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ favorites: Favorite[]; total: number }>({
    queryKey: ['favorites', 'frequency', page],
    queryFn: () => api.get(`/favorites?sort=frequency&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`),
    placeholderData: (prev) => prev,
  })

  const favorites = data?.favorites ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const logMutation = useMutation({
    mutationFn: (fav: Favorite) => {
      const slot = getCurrentSlot()
      const draftItems = fav.items.map((i) => ({
        name: i.food_name,
        brand: i.brand ?? undefined,
        quantity: i.quantity_g,
        unit: 'g',
        estimated_weight_g: i.quantity_g,
        nutrients: toNutrients(i.nutrients),
      }))
      const nutrition = draftItems.reduce(
        (acc, cur) => {
          const n = cur.nutrients
          return {
            calories: acc.calories + (n.calories || 0),
            saturated_fat_g: acc.saturated_fat_g + (n.saturated_fat_g || 0),
            soluble_fiber_g: acc.soluble_fiber_g + (n.soluble_fiber_g || 0),
            protein_g: acc.protein_g + (n.protein_g || 0),
            carbohydrates_g: acc.carbohydrates_g + (n.carbohydrates_g || 0),
            fat_g: acc.fat_g + (n.fat_g || 0),
            fiber_g: acc.fiber_g + (n.fiber_g || 0),
            sodium_mg: acc.sodium_mg + (n.sodium_mg || 0),
          }
        },
        { calories: 0, saturated_fat_g: 0, soluble_fiber_g: 0, protein_g: 0, carbohydrates_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0 }
      )
      return api.post('/log/meal', { slot, source: 'favorite', favorite_id: fav.id, items: draftItems, nutrition, raw_input: fav.name })
    },
    onSuccess: (_, fav) => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      setLoggedId(fav.id)
      window.setTimeout(() => setLoggedId((cur) => (cur === fav.id ? null : cur)), 1800)
    },
  })

  return (
    <div className="glass" style={{ padding: compact ? 18 : 24, ...(compact ? { marginBottom: 14 } : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
        <div>
          <div className="eyebrow">Favorites</div>
          <div style={{ fontSize: compact ? 12 : 13, color: 'var(--fg-tertiary)', marginTop: 4 }}>
            Your most-logged meals, one tap away.
          </div>
        </div>
        <button
          onClick={() => navigate('/favorites', { state: { create: true } })}
          className="btn btn-primary"
          style={{ gap: 6, padding: '8px 14px', fontSize: 13, flexShrink: 0 }}
        >
          <Plus size={15} strokeWidth={2} />
          New
        </button>
      </div>

      {isLoading && favorites.length === 0 ? (
        <div style={{ padding: '28px 0', textAlign: 'center' }}>
          <div style={{
            width: 24, height: 24, margin: '0 auto',
            borderRadius: '50%',
            border: '2px solid rgba(56,189,248,0.2)',
            borderTopColor: 'var(--sky-400)',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : favorites.length === 0 ? (
        <div style={{
          padding: '28px 24px',
          textAlign: 'center',
          border: '1px dashed var(--glass-edge)',
          borderRadius: 14,
        }}>
          <Heart size={28} strokeWidth={1.25} style={{ color: 'var(--fg-quiet)', margin: '0 auto 10px', display: 'block' }} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-quiet)' }}>No favorites yet</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-tertiary)' }}>
            Save a meal to log it again in one tap.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="glass-inset"
                style={{ padding: '12px 14px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fav.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg-quiet)', marginTop: 3 }}>
                    {fav.items.length} {fav.items.length === 1 ? 'item' : 'items'} ·{' '}
                    <span className="num" style={{ color: 'var(--sky-400)' }}>{totalKcal(fav.items)}</span> kcal
                    {(fav.log_count ?? 0) > 0 && (
                      <> · logged <span className="num">{fav.log_count}</span>×</>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => logMutation.mutate(fav)}
                  disabled={logMutation.isPending}
                  className="favorite-action-btn favorite-action-btn--primary"
                  style={{ flexShrink: 0, opacity: logMutation.isPending ? 0.7 : 1 }}
                >
                  <Heart size={12} strokeWidth={2} />
                  <span>{loggedId === fav.id ? 'Logged ✓' : 'Log'}</span>
                </button>
              </div>
            ))}
          </div>

          {pageCount > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <button
                className="btn"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                style={{ gap: 4, padding: '6px 10px', fontSize: 12, opacity: page === 0 ? 0.4 : 1 }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>
                Page <span className="num">{page + 1}</span> of <span className="num">{pageCount}</span>
              </span>
              <button
                className="btn"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
                style={{ gap: 4, padding: '6px 10px', fontSize: 12, opacity: page + 1 >= pageCount ? 0.4 : 1 }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
