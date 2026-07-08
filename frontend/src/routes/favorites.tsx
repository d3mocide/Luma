import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Heart, Plus, ArrowLeft, Trash2, Pencil, Copy, Check, ChevronDown, X, Search, ArrowUpDown, Scale } from 'lucide-react'
import { api } from '../lib/api'
import { IngredientBuilder } from '../components/log-sheet/IngredientBuilder'
import { getCurrentSlot } from '../lib/format'
import type { DraftItem, Favorite, FavoriteItem } from '../components/log-sheet/types'
import { toNutrients, scaleByRatio, sumNutrients } from '../lib/nutrients'
import { ShareWithFamilyButton } from '../components/ShareWithFamilyButton'

// Portion multipliers applied at log time so a saved favorite can be logged as
// a fraction (half a meal, a snack) without editing each ingredient — nutrition
// scales linearly with weight, so one factor scales the whole thing.
const PORTION_PRESETS: { label: string; value: number }[] = [
  { label: '¼', value: 0.25 },
  { label: '½', value: 0.5 },
  { label: '¾', value: 0.75 },
  { label: '1', value: 1 },
  { label: '1½', value: 1.5 },
  { label: '2', value: 2 },
]

function portionLabel(factor: number): string {
  const preset = PORTION_PRESETS.find((p) => p.value === factor)
  return preset ? `${preset.label}×` : `${Number(factor.toFixed(2))}×`
}

function portionChipStyle(active: boolean): CSSProperties {
  return {
    minWidth: 40,
    padding: '6px 12px',
    borderRadius: 'var(--radius-pill)',
    border: active ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid var(--glass-edge)',
    background: active ? 'linear-gradient(180deg, var(--sky-400), var(--sky-500))' : 'var(--glass-2)',
    color: active ? '#061229' : 'var(--fg-secondary)',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  }
}

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


function totalProtein(items: FavoriteItem[]): number {
  const val = items.reduce((sum, i) => sum + (i.nutrients.protein_g ?? 0), 0)
  return Math.round(val * 10) / 10
}

function totalSodium(items: FavoriteItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + (i.nutrients.sodium_mg ?? 0), 0))
}

function totalWeight(items: FavoriteItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + (i.quantity_g ?? 0), 0))
}

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  return width
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
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'frequency' | 'name_asc' | 'name_desc' | 'recent'>('frequency')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const [successModal, setSuccessModal] = useState<{ name: string; slot: string } | null>(null)
  const [expandedFavIds, setExpandedFavIds] = useState<Record<string, boolean>>({})
  // Which favorite's portion picker is open, and the multiplier selected in it.
  const [portionFavId, setPortionFavId] = useState<string | null>(null)
  const [portionFactor, setPortionFactor] = useState(1)
  const [customPortion, setCustomPortion] = useState('')

  const openPortionPicker = (favId: string) => {
    if (portionFavId === favId) {
      setPortionFavId(null)
      return
    }
    setPortionFavId(favId)
    setPortionFactor(1)
    setCustomPortion('')
  }

  const toggleExpand = (id: string) => {
    setExpandedFavIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const { data: favoritesData, isLoading } = useQuery<{ favorites: Favorite[] }>({
    queryKey: ['favorites', sortBy],
    queryFn: () => api.get(`/favorites?sort=${sortBy}`),
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
      startCreate() // eslint-disable-line react-hooks/set-state-in-effect
      navigate('.', { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sortOpen) return
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [sortOpen])

  function startEdit(fav: Favorite) {
    setEditingId(fav.id)
    setFavName(fav.name)
    setItems(fav.items.map(mapFavoriteItemToDraft))
    setFavTags(fav.tags ?? [])
    setNewTagInput('')
    setView('building')
  }

  // Seed the builder from an existing favorite as a brand-new favorite (editingId stays
  // null so Save creates a fresh row). Lets the user copy a bulk favorite, then scale
  // weights down to a single portion before saving.
  function startDuplicate(fav: Favorite) {
    setEditingId(null)
    setFavName(`${fav.name} (copy)`)
    setItems(fav.items.map(mapFavoriteItemToDraft))
    setFavTags(fav.tags ?? [])
    setNewTagInput('')
    setView('building')
  }

  const logFavoriteDirect = useMutation({
    mutationFn: ({ fav, factor }: { fav: Favorite; factor: number }) => {
      const slot = getCurrentSlot()
      // Scale each item's weight and full nutrient profile by the chosen factor.
      // The favorite itself is untouched — only this logged copy is scaled.
      const draftItems = fav.items.map(mapFavoriteItemToDraft).map((d) => ({
        ...d,
        quantity: d.quantity * factor,
        estimated_weight_g: d.estimated_weight_g * factor,
        nutrients: scaleByRatio(d.nutrients, factor),
      }))
      const displayName = factor === 1 ? fav.name : `${portionLabel(factor)} ${fav.name}`
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
            added_sugars_g: acc.added_sugars_g + (n.added_sugars_g || 0),
          }
        },
        { calories: 0, saturated_fat_g: 0, soluble_fiber_g: 0, protein_g: 0, carbohydrates_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0, sugars_g: 0, added_sugars_g: 0 }
      )
      return api.post('/log/meal', {
        slot,
        source: 'favorite',
        favorite_id: fav.id,
        items: draftItems,
        nutrition,
        raw_input: displayName,
      })
    },
    onSuccess: (_, { fav, factor }) => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      setPortionFavId(null)
      const displayName = factor === 1 ? fav.name : `${portionLabel(factor)} ${fav.name}`
      setSuccessModal({ name: displayName, slot: getCurrentSlot() })
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

  const query = searchQuery.trim().toLowerCase()
  const filteredFavorites = favorites.filter((fav) => {
    const tagMatch = selectedTag === 'all' || (fav.tags?.includes(selectedTag) ?? false)
    if (!tagMatch) return false
    if (!query) return true
    if (fav.name.toLowerCase().includes(query)) return true
    return fav.items.some((item) => item.food_name.toLowerCase().includes(query))
  })

  const width = useWindowWidth()
  const numCols = width >= 1100 ? 2 : 1
  const cols = Array.from({ length: numCols }, (_, colIdx) =>
    filteredFavorites.filter((_, idx) => idx % numCols === colIdx)
  )

  const SORT_OPTIONS = [
    { value: 'frequency', label: 'Most used' },
    { value: 'name_asc', label: 'Name A–Z' },
    { value: 'name_desc', label: 'Name Z–A' },
    { value: 'recent', label: 'Recently added' },
  ] as const

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? 'Sort'

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

          {/* Search + Sort bar */}
          {favorites.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'var(--glass-1)',
                  border: '1px solid var(--glass-edge)',
                }}
              >
                <Search size={16} strokeWidth={1.75} style={{ color: 'var(--fg-quiet)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search favorites…"
                  aria-label="Search favorites"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--fg-primary)',
                    fontSize: 14,
                    fontFamily: 'var(--font-sans)',
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--fg-quiet)', padding: 0, display: 'flex', alignItems: 'center',
                    }}
                  >
                    <X size={15} strokeWidth={2} />
                  </button>
                )}
              </div>
              <div ref={sortRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setSortOpen((v) => !v)}
                  aria-label="Sort favorites"
                  aria-expanded={sortOpen}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 12px',
                    height: '100%',
                    borderRadius: 12,
                    background: sortOpen ? 'var(--glass-2)' : 'var(--glass-1)',
                    border: `1px solid ${sortOpen ? 'rgba(56,189,248,0.3)' : 'var(--glass-edge)'}`,
                    cursor: 'pointer',
                    color: 'var(--fg-primary)',
                    fontSize: 13,
                    fontFamily: 'var(--font-sans)',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <ArrowUpDown size={14} strokeWidth={1.75} style={{ color: 'var(--fg-quiet)', flexShrink: 0 }} />
                  {currentSortLabel}
                  <ChevronDown
                    size={12}
                    strokeWidth={2}
                    style={{
                      color: 'var(--fg-quiet)',
                      transform: sortOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </button>

                {sortOpen && (
                  <div
                    role="listbox"
                    aria-label="Sort options"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      minWidth: 160,
                      background: 'var(--glass-popover)',
                      border: '1px solid var(--glass-edge)',
                      borderRadius: 12,
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      zIndex: 50,
                      padding: 4,
                      overflow: 'hidden',
                    }}
                  >
                    {SORT_OPTIONS.map((opt) => {
                      const active = sortBy === opt.value
                      return (
                        <button
                          key={opt.value}
                          role="option"
                          aria-selected={active}
                          type="button"
                          onClick={() => { setSortBy(opt.value); setSortOpen(false) }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: 'none',
                            background: active ? 'rgba(56,189,248,0.1)' : 'transparent',
                            color: active ? 'var(--sky-300)' : 'var(--fg-secondary)',
                            fontSize: 13,
                            fontFamily: 'var(--font-sans)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background 0.1s, color 0.1s',
                          }}
                          onMouseEnter={(e) => {
                            if (!active) {
                              (e.currentTarget as HTMLButtonElement).style.background = 'var(--glass-3)'
                              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-primary)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!active) {
                              (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-secondary)'
                            }
                          }}
                        >
                          {opt.label}
                          {active && (
                            <Check size={12} strokeWidth={2.5} style={{ color: 'var(--sky-400)', flexShrink: 0 }} />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
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
                {query
                  ? `No favorites match "${searchQuery.trim()}"`
                  : `No favorites found with tag "${selectedTag}"`}
              </p>
              <button
                onClick={() => { setSelectedTag('all'); setSearchQuery('') }}
                className="btn btn-ghost"
                style={{ marginTop: 12, fontSize: 13, textDecoration: 'underline' }}
              >
                Clear filter
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${numCols}, minmax(0, 1fr))`,
              gap: 16,
              marginTop: 20,
              alignItems: 'start'
            }}>
              {cols.map((colItems, colIdx) => (
                <div key={colIdx} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {colItems.map((fav) => (
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
                            ({fav.items.length} {fav.items.length === 1 ? 'item' : 'items'}
                            {fav.items.length > 0 && ` · ${totalWeight(fav.items)}g`})
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
                              <span className="favorite-macro-label">Sodium</span>
                              <span className="num favorite-macro-val" style={{ color: '#fb923c' }}>{totalSodium(fav.items)}mg</span>
                            </div>
                            <div className="favorite-macro-col">
                              <span className="favorite-macro-label">Protein</span>
                              <span className="num favorite-macro-val" style={{ color: '#a78bfa' }}>{totalProtein(fav.items)}g</span>
                            </div>
                          </div>
                        </div>

                        <div className="favorite-card-actions">
                          <button
                            onClick={() => logFavoriteDirect.mutate({ fav, factor: 1 })}
                            disabled={logFavoriteDirect.isPending}
                            className="favorite-action-btn favorite-action-btn--primary"
                            style={{ opacity: logFavoriteDirect.isPending ? 0.6 : 1 }}
                          >
                            <Heart size={12} strokeWidth={2} />
                            <span>Log this</span>
                          </button>
                          <button
                            onClick={() => openPortionPicker(fav.id)}
                            className="favorite-action-btn favorite-action-btn--portion"
                            aria-expanded={portionFavId === fav.id}
                          >
                            <Scale size={12} strokeWidth={2} />
                            <span>Log portion</span>
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
                            onClick={() => startDuplicate(fav)}
                            className="favorite-action-btn"
                            aria-label={`Duplicate ${fav.name}`}
                          >
                            <Copy size={12} strokeWidth={1.75} />
                            <span className="btn-label">Copy</span>
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

                      {/* Portion picker — log a fraction of the favorite */}
                      {portionFavId === fav.id && (() => {
                        const base = sumNutrients(fav.items.map((i) => ({ nutrients: i.nutrients })))
                        const totals = scaleByRatio(base, portionFactor)
                        const scaledWeight = Math.round(totalWeight(fav.items) * portionFactor)
                        const valid = portionFactor > 0
                        return (
                          <div style={{
                            marginTop: 12,
                            borderTop: '1px solid var(--glass-edge)',
                            paddingTop: 12,
                          }}>
                            <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>
                              Portion · {scaledWeight}g
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                              {PORTION_PRESETS.map((p) => {
                                const active = portionFactor === p.value && customPortion === ''
                                return (
                                  <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => { setPortionFactor(p.value); setCustomPortion('') }}
                                    style={portionChipStyle(active)}
                                  >
                                    {p.label}
                                  </button>
                                )
                              })}
                              <input
                                type="number"
                                min="0"
                                step="0.05"
                                inputMode="decimal"
                                value={customPortion}
                                onChange={(e) => {
                                  setCustomPortion(e.target.value)
                                  const v = parseFloat(e.target.value)
                                  if (Number.isFinite(v) && v > 0) setPortionFactor(v)
                                }}
                                placeholder="Custom ×"
                                aria-label="Custom portion multiplier"
                                style={{
                                  width: 96,
                                  padding: '6px 10px',
                                  borderRadius: 'var(--radius-pill)',
                                  border: customPortion !== '' ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid var(--glass-edge)',
                                  background: 'rgba(0,0,0,0.25)',
                                  color: 'var(--fg-primary)',
                                  fontSize: 13,
                                  fontFamily: 'var(--font-sans)',
                                  outline: 'none',
                                }}
                              />
                            </div>

                            <div className="favorite-macro-grid">
                              <div className="favorite-macro-col">
                                <span className="favorite-macro-label">Cal</span>
                                <span className="num favorite-macro-val" style={{ color: 'var(--sky-400)' }}>{Math.round(totals.calories)}</span>
                              </div>
                              <div className="favorite-macro-col">
                                <span className="favorite-macro-label">Sat Fat</span>
                                <span className="num favorite-macro-val" style={{ color: 'var(--bad)' }}>{totals.saturated_fat_g.toFixed(1)}g</span>
                              </div>
                              <div className="favorite-macro-col">
                                <span className="favorite-macro-label">Sol Fib</span>
                                <span className="num favorite-macro-val" style={{ color: 'var(--good)' }}>{totals.soluble_fiber_g.toFixed(1)}g</span>
                              </div>
                              <div className="favorite-macro-col">
                                <span className="favorite-macro-label">Sodium</span>
                                <span className="num favorite-macro-val" style={{ color: '#fb923c' }}>{Math.round(totals.sodium_mg)}mg</span>
                              </div>
                              <div className="favorite-macro-col">
                                <span className="favorite-macro-label">Protein</span>
                                <span className="num favorite-macro-val" style={{ color: '#a78bfa' }}>{totals.protein_g.toFixed(1)}g</span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                              <button
                                onClick={() => logFavoriteDirect.mutate({ fav, factor: portionFactor })}
                                disabled={logFavoriteDirect.isPending || !valid}
                                className="btn btn-primary"
                                style={{ flex: 1, justifyContent: 'center', opacity: (logFavoriteDirect.isPending || !valid) ? 0.6 : 1 }}
                              >
                                {logFavoriteDirect.isPending ? 'Logging…' : `Log ${portionLabel(portionFactor)}`}
                              </button>
                              <button
                                onClick={() => setPortionFavId(null)}
                                className="btn btn-ghost"
                                style={{ justifyContent: 'center' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Expanded ingredients drawer list */}
                      {expandedFavIds[fav.id] && (
                        <div style={{
                          marginTop: 12,
                          borderTop: '1px solid var(--glass-edge)',
                          paddingTop: 12,
                        }}>
                          <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }} className="thin-scroll">
                            <div className="meal-items-table">
                              <div className="meal-items-header">
                                <div className="meal-items-header-cell">Item</div>
                                <div className="meal-items-header-cell">Weight</div>
                                <div className="meal-items-header-cell">Cal</div>
                                <div className="meal-items-header-cell">Sat Fat</div>
                                <div className="meal-items-header-cell">Sol Fib</div>
                                <div className="meal-items-header-cell">Sodium</div>
                                <div className="meal-items-header-cell">Protein</div>
                              </div>
                              {fav.items.map((item, idx) => (
                                <div key={idx} className="meal-items-row">
                                  <div className="meal-item-name-cell">
                                    <span className="meal-item-name">{item.food_name}</span>
                                    {item.brand && <span className="meal-item-brand">{item.brand}</span>}
                                  </div>
                                  <div className="meal-items-cell-num weight-cell">
                                    {Math.round(item.quantity_g)}
                                    <span className="sm-hidden">g</span>
                                  </div>
                                  <div className="meal-items-cell-num cal-cell">
                                    {Math.round(item.nutrients?.calories ?? 0)}
                                    <span className="sm-hidden"> kcal</span>
                                  </div>
                                  <div className="meal-items-cell-num sat-cell">
                                    {((item.nutrients?.saturated_fat_g) ?? 0).toFixed(1)}g
                                    <span className="sm-hidden"> sat</span>
                                  </div>
                                  <div className="meal-items-cell-num fib-cell">
                                    {((item.nutrients?.soluble_fiber_g) ?? 0).toFixed(1)}g
                                    <span className="sm-hidden"> fiber</span>
                                  </div>
                                  <div className="meal-items-cell-num sod-cell">
                                    {Math.round(item.nutrients?.sodium_mg ?? 0)}mg
                                    <span className="sm-hidden"> sod</span>
                                  </div>
                                  <div className="meal-items-cell-num prot-cell">
                                    {((item.nutrients?.protein_g) ?? 0).toFixed(1)}g
                                    <span className="sm-hidden"> prot</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
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
              <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>
                Cumulative nutrition · {Math.round(items.reduce((sum, i) => sum + (i.estimated_weight_g ?? 0), 0))}g total
              </div>
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
                  <span className="favorite-macro-label">Sodium</span>
                  <span className="num favorite-macro-val" style={{ color: '#fb923c' }}>{Math.round(sumNutrients(items).sodium_mg)}mg</span>
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
