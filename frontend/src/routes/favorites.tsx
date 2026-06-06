import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Heart, Plus, ArrowLeft, Trash2, Pencil, Check } from 'lucide-react'
import { api } from '../lib/api'
import { IngredientBuilder } from '../components/log-sheet/IngredientBuilder'
import { getCurrentSlot } from '../lib/format'
import type { DraftItem, Favorite, FavoriteItem } from '../components/log-sheet/types'

function mapFavoriteItemToDraft(i: FavoriteItem): DraftItem {
  return {
    name: i.food_name,
    brand: i.brand ?? undefined,
    quantity: i.quantity_g,
    unit: 'g',
    estimated_weight_g: i.quantity_g,
    nutrients: {
      calories: i.nutrients.calories ?? 0,
      saturated_fat_g: i.nutrients.saturated_fat_g ?? 0,
      soluble_fiber_g: i.nutrients.soluble_fiber_g ?? 0,
      protein_g: i.nutrients.protein_g ?? 0,
      carbohydrates_g: i.nutrients.carbohydrates_g ?? 0,
      fat_g: i.nutrients.fat_g ?? 0,
      fiber_g: i.nutrients.fiber_g ?? 0,
      sodium_mg: i.nutrients.sodium_mg ?? 0,
    },
  }
}

function mapDraftItemToApi(item: DraftItem) {
  return {
    food_name: item.name,
    brand: item.brand ?? null,
    quantity_g: item.estimated_weight_g,
    nutrients: item.nutrients,
  }
}

function totalKcal(items: FavoriteItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + (i.nutrients.calories ?? 0), 0))
}

export default function FavoritesRoute() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<'list' | 'building'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [favName, setFavName] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [successModal, setSuccessModal] = useState<{ name: string; slot: string } | null>(null)

  const { data: favoritesData, isLoading } = useQuery<{ favorites: Favorite[] }>({
    queryKey: ['favorites'],
    queryFn: () => api.get('/favorites'),
  })
  const favorites = favoritesData?.favorites ?? []

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/favorites', {
        name: favName.trim() || 'My favorite',
        items: items.map(mapDraftItemToApi),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      setView('list')
      setEditingId(null)
      setFavName('')
      setItems([])
    },
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/favorites/${editingId}`, {
        name: favName.trim() || 'My favorite',
        items: items.map(mapDraftItemToApi),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      setView('list')
      setEditingId(null)
      setFavName('')
      setItems([])
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/favorites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
  })

  function startCreate() {
    setEditingId(null)
    setFavName('')
    setItems([])
    setView('building')
  }

  function startEdit(fav: Favorite) {
    setEditingId(fav.id)
    setFavName(fav.name)
    setItems(fav.items.map(mapFavoriteItemToDraft))
    setView('building')
  }

  const logFavoriteDirect = useMutation({
    mutationFn: (fav: Favorite) => {
      const slot = getCurrentSlot()
      const draftItems = fav.items.map(mapFavoriteItemToDraft)
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
      return api.post('/log/meal', {
        slot,
        source: 'favorite',
        items: draftItems,
        nutrition,
        raw_input: fav.name,
      })
    },
    onSuccess: (_, fav) => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      setSuccessModal({ name: fav.name, slot: getCurrentSlot() })
    },
    onError: () => {
      alert('Failed to log favorite. Try again!')
    },
  })

  function handleSave() {
    if (editingId) {
      updateMutation.mutate()
    } else {
      createMutation.mutate()
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const addItem = (item: DraftItem) => setItems((prev) => [...prev, item])
  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index))
  const updateWeight = (index: number, newWeight: number) => {
    setItems((prev) => {
      const updated = [...prev]
      const item = { ...updated[index] }
      const ratio = newWeight / item.estimated_weight_g
      item.estimated_weight_g = newWeight
      item.nutrients = {
        calories: item.nutrients.calories * ratio,
        saturated_fat_g: item.nutrients.saturated_fat_g * ratio,
        soluble_fiber_g: item.nutrients.soluble_fiber_g * ratio,
        protein_g: item.nutrients.protein_g * ratio,
        carbohydrates_g: item.nutrients.carbohydrates_g * ratio,
        fat_g: item.nutrients.fat_g * ratio,
        fiber_g: item.nutrients.fiber_g * ratio,
        sodium_mg: item.nutrients.sodium_mg * ratio,
      }
      updated[index] = item
      return updated
    })
  }

  return (
    <div className="favorites-page" style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 60px' }}>
      {view === 'list' ? (
        <>
          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Saved meals</div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
                Favorites
              </h1>
            </div>
            <button
              onClick={startCreate}
              className="btn btn-primary"
              style={{ gap: 6, padding: '9px 16px', fontSize: 13 }}
            >
              <Plus size={15} strokeWidth={2} />
              New favorite
            </button>
          </div>

          {isLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <div style={{
                width: 28, height: 28, margin: '0 auto',
                borderRadius: '50%',
                border: '2px solid rgba(56,189,248,0.2)',
                borderTopColor: 'var(--sky-400)',
                animation: 'spin 0.8s linear infinite',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          ) : favorites.length === 0 ? (
            <div style={{
              padding: '64px 24px',
              textAlign: 'center',
              border: '1px dashed var(--glass-edge)',
              borderRadius: 16,
            }}>
              <Heart
                size={36}
                strokeWidth={1.25}
                style={{ color: 'var(--fg-quiet)', margin: '0 auto 14px', display: 'block' }}
              />
              <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-quiet)' }}>
                No favorites yet
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--fg-tertiary)' }}>
                Save a meal combination to log it again in one tap.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {favorites.map((fav) => (
                <div
                  key={fav.id}
                  className="glass-inset"
                  style={{ padding: '16px 18px', borderRadius: 14 }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-primary)', marginBottom: 3 }}>
                        {fav.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>
                        {fav.items.length} {fav.items.length === 1 ? 'item' : 'items'} ·{' '}
                        <span className="num" style={{ color: 'var(--sky-400)' }}>{totalKcal(fav.items)}</span> kcal
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => logFavoriteDirect.mutate(fav)}
                        disabled={logFavoriteDirect.isPending}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: 12, gap: 5, opacity: logFavoriteDirect.isPending ? 0.7 : 1 }}
                      >
                        <Heart size={12} strokeWidth={2} />
                        {logFavoriteDirect.isPending && logFavoriteDirect.variables?.id === fav.id ? 'Logging…' : 'Log this'}
                      </button>
                      <button
                        onClick={() => startEdit(fav)}
                        style={{
                          padding: '6px 10px', borderRadius: 8, fontSize: 12,
                          background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                          color: 'var(--fg-secondary)', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', gap: 5, transition: 'all 150ms',
                        }}
                      >
                        <Pencil size={12} strokeWidth={1.75} />
                        Edit
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(fav.id)}
                        disabled={deleteMutation.isPending}
                        style={{
                          padding: '6px 10px', borderRadius: 8, fontSize: 12,
                          background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.22)',
                          color: 'var(--bad)', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', gap: 5, transition: 'all 150ms',
                          opacity: deleteMutation.isPending ? 0.5 : 1,
                        }}
                        aria-label={`Delete ${fav.name}`}
                      >
                        <Trash2 size={12} strokeWidth={1.75} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Building view */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <button
              onClick={() => { setView('list'); setEditingId(null) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--fg-quiet)', padding: 4, display: 'flex', alignItems: 'center',
              }}
              aria-label="Back to list"
            >
              <ArrowLeft size={18} strokeWidth={1.75} />
            </button>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>
                {editingId ? 'Editing favorite' : 'New favorite'}
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
                {editingId ? `Edit ${favName || 'favorite'}` : 'New favorite'}
              </h1>
            </div>
          </div>

          {/* Ingredient builder */}
          <div style={{ marginBottom: 22 }}>
            <IngredientBuilder
              draftItems={items}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onUpdateWeight={updateWeight}
              emptyStateMessage="Search above to add ingredients to this favorite."
            />
          </div>

          {/* Name input */}
          <div style={{ marginBottom: 22 }}>
            <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>Name</div>
            <input
              type="text"
              value={favName}
              onChange={(e) => setFavName(e.target.value)}
              placeholder="e.g. My breakfast bowl"
              className="field-input"
              style={{
                width: '100%', borderRadius: 10, padding: '10px 14px',
                fontSize: 14, border: '1px solid var(--glass-edge)',
                color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)',
              }}
            />
          </div>

          {/* Save button */}
          <div style={{ marginTop: 28 }}>
            <button
              onClick={handleSave}
              disabled={isSaving || items.length === 0}
              className="btn btn-primary"
              style={{ width: '100%', padding: '13px', fontSize: 14, justifyContent: 'center', opacity: (isSaving || items.length === 0) ? 0.6 : 1 }}
            >
              {isSaving ? 'Saving…' : 'Save favorite'}
            </button>
          </div>
        </>
      )}
      {successModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5,8,17,0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSuccessModal(null)
          }}
        >
          <div
            className="glass"
            style={{
              maxWidth: 360,
              width: '100%',
              padding: 28,
              borderRadius: 20,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(16,185,129,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: 'var(--good)',
              }}
            >
              <Check size={24} />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 500, color: 'var(--fg-primary)' }}>
              Meal logged
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
              Added <strong>{successModal.name}</strong> to {successModal.slot}.
            </p>
            <button
              onClick={() => setSuccessModal(null)}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
