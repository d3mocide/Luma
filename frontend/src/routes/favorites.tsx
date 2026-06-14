import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Heart, Plus, ArrowLeft, Trash2, Pencil, Check, ChevronDown, X } from 'lucide-react'
import { api } from '../lib/api'
import { IngredientBuilder } from '../components/log-sheet/IngredientBuilder'
import { getCurrentSlot } from '../lib/format'
import type { DraftItem, Favorite, FavoriteItem } from '../components/log-sheet/types'
import { toNutrients, scaleByRatio, sumNutrients } from '../lib/nutrients'
import { ShareWithFamilyButton } from '../components/ShareWithFamilyButton'

function mapFavoriteItemToDraft(i: FavoriteItem): DraftItem {
  return {
    name: i.food_name,
    brand: i.brand ?? undefined,
    quantity: i.quantity_g,
    unit: 'g',
    estimated_weight_g: i.quantity_g,
    nutrients: toNutrients(i.nutrients),
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

function totalSatFat(items: FavoriteItem[]): number {
  const val = items.reduce((sum, i) => sum + (i.nutrients.saturated_fat_g ?? 0), 0)
  return Math.round(val * 10) / 10
}

function totalSolFiber(items: FavoriteItem[]): number {
  const val = items.reduce((sum, i) => sum + (i.nutrients.soluble_fiber_g ?? 0), 0)
  return Math.round(val * 10) / 10
}

function totalSugar(items: FavoriteItem[]): number {
  const val = items.reduce((sum, i) => sum + (i.nutrients.sugars_g ?? 0), 0)
  return Math.round(val * 10) / 10
}

function totalProtein(items: FavoriteItem[]): number {
  const val = items.reduce((sum, i) => sum + (i.nutrients.protein_g ?? 0), 0)
  return Math.round(val * 10) / 10
}

export default function FavoritesRoute() {
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const [view, setView] = useState<'list' | 'building'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [favName, setFavName] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [favTags, setFavTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [successModal, setSuccessModal] = useState<{ name: string; slot: string } | null>(null)
  const [expandedFavIds, setExpandedFavIds] = useState<Record<string, boolean>>({})

  const toggleExpand = (id: string) => {
    setExpandedFavIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const { data: favoritesData, isLoading } = useQuery<{ favorites: Favorite[] }>({
    queryKey: ['favorites', 'frequency'],
    queryFn: () => api.get('/favorites?sort=frequency'),
  })
  const favorites = favoritesData?.favorites ?? []

  const defaultPresets = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Side', 'Cholesterol-friendly']
  const savedCustomTags = Array.from(
    new Set(
      favorites
        .flatMap((f) => f.tags || [])
        .filter((t) => t && !defaultPresets.includes(t))
    )
  ).sort()
  const allPresets = [...defaultPresets, ...savedCustomTags]

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/favorites', {
        name: favName.trim() || 'My favorite',
        items: items.map(mapDraftItemToApi),
        tags: favTags,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      setView('list')
      setEditingId(null)
      setFavName('')
      setItems([])
      setFavTags([])
    },
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/favorites/${editingId}`, {
        name: favName.trim() || 'My favorite',
        items: items.map(mapDraftItemToApi),
        tags: favTags,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      setView('list')
      setEditingId(null)
      setFavName('')
      setItems([])
      setFavTags([])
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
    setFavTags([])
    setNewTagInput('')
    setView('building')
  }

  // Open the creation panel directly when arriving via the Today favorites widget.
  useEffect(() => {
    if ((location.state as { create?: boolean } | null)?.create) {
      startCreate()
      navigate('.', { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startEdit(fav: Favorite) {
    setEditingId(fav.id)
    setFavName(fav.name)
    setItems(fav.items.map(mapFavoriteItemToDraft))
    setFavTags(fav.tags ?? [])
    setNewTagInput('')
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
            sugars_g: acc.sugars_g + (n.sugars_g || 0),
          }
        },
        { calories: 0, saturated_fat_g: 0, soluble_fiber_g: 0, protein_g: 0, carbohydrates_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0, sugars_g: 0 }
      )
      return api.post('/log/meal', {
        slot,
        source: 'favorite',
        favorite_id: fav.id,
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

  const allTags = Array.from(new Set(favorites.flatMap((fav) => fav.tags ?? []))).sort()

  const filteredFavorites = favorites.filter((fav) => {
    if (selectedTag === 'all') return true
    return fav.tags?.includes(selectedTag) ?? false
  })

  const addItem = (item: DraftItem) => setItems((prev) => [...prev, item])
  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index))
  const updateWeight = (index: number, newWeight: number) => {
    setItems((prev) => {
      const updated = [...prev]
      const item = { ...updated[index] }
      const ratio = newWeight / item.estimated_weight_g
      item.estimated_weight_g = newWeight
      item.nutrients = scaleByRatio(item.nutrients, ratio)
      updated[index] = item
      return updated
    })
  }
  const updateName = (index: number, name: string) => {
    setItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], name }
      return updated
    })
  }

  return (
    <div className="page-container thin-scroll">
      {view === 'list' ? (
        <>
          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
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

          {/* Tag Filter Bar */}
          {favorites.length > 0 && (
            <div className="settings-tabs" role="tablist" style={{ marginBottom: 20 }}>
              <button
                role="tab"
                aria-selected={selectedTag === 'all'}
                className="settings-tab"
                onClick={() => setSelectedTag('all')}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  role="tab"
                  aria-selected={selectedTag === tag}
                  className="settings-tab"
                  onClick={() => setSelectedTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

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
          ) : filteredFavorites.length === 0 ? (
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
                No favorites found with tag "{selectedTag}"
              </p>
              <button
                onClick={() => setSelectedTag('all')}
                className="btn btn-ghost"
                style={{ marginTop: 12, fontSize: 13, textDecoration: 'underline' }}
              >
                Clear filter
              </button>
            </div>
          ) : (
            <div className="responsive-grid-2col" style={{ marginTop: 0 }}>
              {filteredFavorites.map((fav) => (
                <div
                  key={fav.id}
                  className="glass"
                  style={{ padding: '16px 18px', borderRadius: 14 }}
                >
                  {/* Click-to-expand Title header */}
                  <div
                    onClick={() => toggleExpand(fav.id)}
                    style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}
                    onMouseEnter={(e) => {
                      const titleEl = e.currentTarget.querySelector('.fav-title-text') as HTMLElement
                      if (titleEl) titleEl.style.color = 'var(--sky-300)'
                    }}
                    onMouseLeave={(e) => {
                      const titleEl = e.currentTarget.querySelector('.fav-title-text') as HTMLElement
                      if (titleEl) titleEl.style.color = 'var(--fg-primary)'
                    }}
                  >
                    <span className="fav-title-text" style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-primary)', transition: 'color 0.15s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fav.name}
                      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--fg-quiet)', marginLeft: 8 }}>
                        ({fav.items.length} {fav.items.length === 1 ? 'item' : 'items'})
                      </span>
                    </span>
                    
                    {/* Tags list next to chevron */}
                    {fav.tags && fav.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto', marginRight: 12, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {fav.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: 10,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'var(--glass-2)',
                              border: '1px solid var(--glass-edge)',
                              color: 'var(--fg-secondary)',
                              fontFamily: 'var(--font-sans)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                        {fav.tags.length > 2 && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'var(--glass-3)',
                              border: '1px solid var(--glass-edge)',
                              color: 'var(--fg-quiet)',
                              fontFamily: 'var(--font-mono)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            +{fav.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}

                    <ChevronDown
                      size={14}
                      style={{
                        transform: expandedFavIds[fav.id] ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease',
                        color: 'var(--fg-quiet)',
                        flexShrink: 0,
                      }}
                    />
                  </div>

                  <div className="favorite-card-row">
                    {/* Click-to-expand Info header */}
                    <div
                      className="favorite-card-info"
                      onClick={() => toggleExpand(fav.id)}
                      style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                      onMouseEnter={(e) => {
                        const card = e.currentTarget.closest('.glass') as HTMLElement
                        const titleEl = card?.querySelector('.fav-title-text') as HTMLElement
                        if (titleEl) titleEl.style.color = 'var(--sky-300)'
                      }}
                      onMouseLeave={(e) => {
                        const card = e.currentTarget.closest('.glass') as HTMLElement
                        const titleEl = card?.querySelector('.fav-title-text') as HTMLElement
                        if (titleEl) titleEl.style.color = 'var(--fg-primary)'
                      }}
                    >
                      <div className="favorite-macro-grid">
                        <div className="favorite-macro-col">
                          <span className="favorite-macro-label">Cal</span>
                          <span className="num favorite-macro-val" style={{ color: 'var(--sky-400)' }}>{totalKcal(fav.items)}</span>
                        </div>
                        <div className="favorite-macro-col">
                          <span className="favorite-macro-label">Sat Fat</span>
                          <span className="num favorite-macro-val" style={{ color: 'var(--bad)' }}>{totalSatFat(fav.items)}g</span>
                        </div>
                        <div className="favorite-macro-col">
                          <span className="favorite-macro-label">Sol Fib</span>
                          <span className="num favorite-macro-val" style={{ color: 'var(--good)' }}>{totalSolFiber(fav.items)}g</span>
                        </div>
                        <div className="favorite-macro-col">
                          <span className="favorite-macro-label">Sugar</span>
                          <span className="num favorite-macro-val" style={{ color: 'var(--aurora-pink)' }}>{totalSugar(fav.items)}g</span>
                        </div>
                        <div className="favorite-macro-col">
                          <span className="favorite-macro-label">Protein</span>
                          <span className="num favorite-macro-val" style={{ color: '#a78bfa' }}>{totalProtein(fav.items)}g</span>
                        </div>
                      </div>
                    </div>

                    <div className="favorite-card-actions">
                      <button
                        onClick={() => logFavoriteDirect.mutate(fav)}
                        disabled={logFavoriteDirect.isPending}
                        className="favorite-action-btn favorite-action-btn--primary"
                        style={{ opacity: logFavoriteDirect.isPending ? 0.7 : 1 }}
                      >
                        <Heart size={12} strokeWidth={2} />
                        <span>{logFavoriteDirect.isPending && logFavoriteDirect.variables?.id === fav.id ? 'Logging…' : 'Log this'}</span>
                      </button>
                      <ShareWithFamilyButton resourceType="favorite" resourceId={fav.id} />
                      <button
                        onClick={() => startEdit(fav)}
                        className="favorite-action-btn"
                      >
                        <Pencil size={12} strokeWidth={1.75} />
                        <span className="btn-label">Edit</span>
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(fav.id)}
                        disabled={deleteMutation.isPending}
                        className="favorite-action-btn favorite-action-btn--danger"
                        style={{ opacity: deleteMutation.isPending ? 0.5 : 1 }}
                        aria-label={`Delete ${fav.name}`}
                      >
                        <Trash2 size={12} strokeWidth={1.75} />
                        <span className="btn-label">Delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded ingredients drawer list */}
                  {expandedFavIds[fav.id] && (
                    <div style={{
                      marginTop: 12,
                      borderTop: '1px solid var(--glass-edge)',
                      paddingTop: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}>
                      {fav.items.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                          }}
                        >
                          {/* Ingredient Name & Brand */}
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.4 }}>
                              {item.food_name}
                            </span>
                            {item.brand && (
                              <span style={{ fontSize: 10, color: 'var(--fg-quiet)', whiteSpace: 'nowrap' }}>
                                {item.brand}
                              </span>
                            )}
                          </div>

                          {/* Metrics Breakdown */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: 'var(--fg-secondary)',
                            flexWrap: 'wrap',
                          }}>
                            <span style={{ color: 'var(--sky-300)' }}>{item.quantity_g}g</span>
                            <span style={{ color: 'var(--fg-faint)', userSelect: 'none' }}>·</span>
                            {item.nutrients.calories != null && (
                              <>
                                <span style={{ color: 'var(--fg-quiet)' }}>
                                  {Math.round(item.nutrients.calories)} kcal
                                </span>
                              </>
                            )}
                            {item.nutrients.saturated_fat_g != null && item.nutrients.saturated_fat_g > 0 && (
                              <>
                                <span style={{ color: 'var(--fg-faint)', userSelect: 'none' }}>·</span>
                                <span style={{ color: 'var(--bad)' }}>
                                  {Math.round(item.nutrients.saturated_fat_g * 10) / 10}g sat
                                </span>
                              </>
                            )}
                            {item.nutrients.soluble_fiber_g != null && item.nutrients.soluble_fiber_g > 0 && (
                              <>
                                <span style={{ color: 'var(--fg-faint)', userSelect: 'none' }}>·</span>
                                <span style={{ color: 'var(--good)' }}>
                                  {Math.round(item.nutrients.soluble_fiber_g * 10) / 10}g fiber
                                </span>
                              </>
                            )}
                            {item.nutrients.sugars_g != null && item.nutrients.sugars_g > 0 && (
                              <>
                                <span style={{ color: 'var(--fg-faint)', userSelect: 'none' }}>·</span>
                                <span style={{ color: 'var(--aurora-pink)' }}>
                                  {Math.round(item.nutrients.sugars_g * 10) / 10}g sugar
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 60 }}>
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
              onUpdateName={updateName}
              emptyStateMessage="Search above to add ingredients to this favorite."
            />
          </div>

          {/* Cumulative Nutrition Grid */}
          {items.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>Cumulative nutrition</div>
              <div className="favorite-macro-grid">
                <div className="favorite-macro-col">
                  <span className="favorite-macro-label">Cal</span>
                  <span className="num favorite-macro-val" style={{ color: 'var(--sky-400)' }}>{Math.round(sumNutrients(items).calories)}</span>
                </div>
                <div className="favorite-macro-col">
                  <span className="favorite-macro-label">Sat Fat</span>
                  <span className="num favorite-macro-val" style={{ color: 'var(--bad)' }}>{sumNutrients(items).saturated_fat_g.toFixed(1)}g</span>
                </div>
                <div className="favorite-macro-col">
                  <span className="favorite-macro-label">Sol Fib</span>
                  <span className="num favorite-macro-val" style={{ color: 'var(--good)' }}>{sumNutrients(items).soluble_fiber_g.toFixed(1)}g</span>
                </div>
                <div className="favorite-macro-col">
                  <span className="favorite-macro-label">Sugar</span>
                  <span className="num favorite-macro-val" style={{ color: 'var(--aurora-pink)' }}>{sumNutrients(items).sugars_g.toFixed(1)}g</span>
                </div>
                <div className="favorite-macro-col">
                  <span className="favorite-macro-label">Protein</span>
                  <span className="num favorite-macro-val" style={{ color: '#a78bfa' }}>{sumNutrients(items).protein_g.toFixed(1)}g</span>
                </div>
              </div>
            </div>
          )}

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

          {/* Tags input */}
          <div style={{ marginBottom: 22 }}>
            <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>Tags</div>
            
            {/* Current Tags */}
            {favTags.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {favTags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      padding: '4px 10px',
                      borderRadius: 8,
                      background: 'var(--glass-2)',
                      border: '1px solid var(--glass-edge)',
                      color: 'var(--fg-primary)',
                    }}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setFavTags((prev) => prev.filter((t) => t !== tag))}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--fg-quiet)',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title={`Remove tag ${tag}`}
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Tag input field */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const tag = newTagInput.trim()
                    if (tag && !favTags.includes(tag)) {
                      setFavTags((prev) => [...prev, tag])
                    }
                    setNewTagInput('')
                  }
                }}
                placeholder="Add custom tags..."
                style={{
                  flex: 1,
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 14,
                  border: '1px solid var(--glass-edge)',
                  color: 'var(--fg-primary)',
                  background: 'rgba(0,0,0,0.25)',
                  fontFamily: 'var(--font-sans)',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const tag = newTagInput.trim()
                  if (tag && !favTags.includes(tag)) {
                    setFavTags((prev) => [...prev, tag])
                  }
                  setNewTagInput('')
                }}
                className="btn"
                style={{ borderRadius: 10, padding: '10px 16px' }}
              >
                Add
              </button>
            </div>

            {/* Suggested preset tags */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {allPresets.map((preset) => {
                const isActive = favTags.includes(preset)
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      if (isActive) {
                        setFavTags((prev) => prev.filter((t) => t !== preset))
                      } else {
                        setFavTags((prev) => [...prev, preset])
                      }
                    }}
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-pill)',
                      border: isActive ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid var(--glass-edge)',
                      background: isActive ? 'linear-gradient(180deg, var(--sky-400), var(--sky-500))' : 'var(--glass-2)',
                      color: isActive ? '#061229' : 'var(--fg-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {isActive ? `✓ ${preset}` : preset}
                  </button>
                )
              })}
            </div>
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
        </div>
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
