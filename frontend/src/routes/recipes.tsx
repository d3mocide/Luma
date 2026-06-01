import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ChevronLeft, Search, X } from 'lucide-react'
import { api } from '../lib/api'
import type { Recipe, RecipeIngredient, FoodResult } from '../components/plan/types'
import { KEY_NUTRIENTS, fmtNutr } from '../components/plan/types'

interface RecipeIngredientDraft {
  food: FoodResult
  quantity: number
  unit: string
}

function RecipeForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prepMinutes, setPrepMinutes] = useState('')
  const [cookMinutes, setCookMinutes] = useState('')
  const [servings, setServings] = useState('1')
  const [ingredients, setIngredients] = useState<RecipeIngredientDraft[]>([])
  const [foodQuery, setFoodQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null)
  const [ingQty, setIngQty] = useState('100')

  const { data: foodResults, isFetching: searching } = useQuery<FoodResult[]>({
    queryKey: ['foods', debouncedQuery],
    queryFn: () => api.get(`/foods/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length > 1,
    staleTime: 60_000,
  })

  const saveMutation = useMutation({
    mutationFn: () => api.post('/recipes', {
      name,
      description: description || undefined,
      prep_minutes: prepMinutes ? parseInt(prepMinutes) : undefined,
      cook_minutes: cookMinutes ? parseInt(cookMinutes) : undefined,
      servings: parseFloat(servings) || 1,
      ingredients: ingredients.map((ing, i) => ({
        food_id: ing.food.id,
        quantity: ing.quantity,
        unit: ing.unit,
        sort_order: i,
      })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      onSaved()
    },
  })

  function addIngredient() {
    if (!selectedFood) return
    const qty = parseFloat(ingQty) || 100
    setIngredients((prev) => [...prev, { food: selectedFood, quantity: qty, unit: 'g' }])
    setSelectedFood(null)
    setFoodQuery('')
    setDebouncedQuery('')
    setIngQty('100')
  }

  const fieldStyle = {
    width: '100%', boxSizing: 'border-box' as const,
    background: 'rgba(0,0,0,0.25)', border: '1px solid var(--glass-edge)',
    borderRadius: 10, color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)',
    fontSize: 14, padding: '10px 14px', outline: 'none',
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', padding: 4 }}>
          <ChevronLeft size={20}/>
        </button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: 'var(--fg-primary)' }}>New Recipe</h2>
      </div>

      <div className="glass" style={{ padding: 24, marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name *" style={fieldStyle}/>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} style={{ ...fieldStyle, resize: 'none' }}/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <input type="number" value={prepMinutes} onChange={(e) => setPrepMinutes(e.target.value)} placeholder="Prep min" style={fieldStyle}/>
            <input type="number" value={cookMinutes} onChange={(e) => setCookMinutes(e.target.value)} placeholder="Cook min" style={fieldStyle}/>
            <input type="number" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="Servings" min={0.5} step={0.5} style={fieldStyle}/>
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding: 24, marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Ingredients</div>

        {ingredients.map((ing, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--glass-edge)' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, color: 'var(--fg-primary)' }}>{ing.food.name}</span>
              {ing.food.brand && <span style={{ fontSize: 11, color: 'var(--fg-quiet)', marginLeft: 6 }}>{ing.food.brand}</span>}
            </div>
            <span className="num" style={{ fontSize: 13, color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)' }}>{ing.quantity}g</span>
            <button onClick={() => setIngredients((prev) => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', padding: 4, display: 'flex' }}>
              <X size={14}/>
            </button>
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>Add ingredient</div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-quiet)' }}/>
            <input
              value={foodQuery}
              onChange={(e) => { setFoodQuery(e.target.value); setDebouncedQuery(e.target.value); setSelectedFood(null) }}
              placeholder="Search food database…"
              style={{ ...fieldStyle, paddingLeft: 32 }}
            />
          </div>

          {!selectedFood && debouncedQuery.length > 1 && (
            <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 8 }}>
              {searching && <div style={{ fontSize: 12, color: 'var(--fg-quiet)', padding: '8px 0' }}>Searching…</div>}
              {!searching && !foodResults?.length && <div style={{ fontSize: 12, color: 'var(--fg-quiet)', padding: '8px 0' }}>No results</div>}
              {!searching && foodResults?.map((f) => (
                <button key={f.id} onClick={() => setSelectedFood(f)}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', borderRadius: 8, cursor: 'pointer', marginBottom: 4, fontSize: 13, color: 'var(--fg-primary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{f.name}{f.brand && <span style={{ fontSize: 11, color: 'var(--fg-quiet)', marginLeft: 6 }}>{f.brand}</span>}</span>
                  <span style={{ fontSize: 11, color: 'var(--sky-400)', fontFamily: 'var(--font-mono)' }}>{Math.round(f.nutrients_per_100g.calories ?? 0)} cal/100g</span>
                </button>
              ))}
            </div>
          )}

          {selectedFood && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--glass-2)', borderRadius: 10, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-primary)' }}>{selectedFood.name}</span>
              <input
                type="number"
                value={ingQty}
                onChange={(e) => setIngQty(e.target.value)}
                min={1}
                style={{ width: 70, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-edge)', borderRadius: 8, color: 'var(--fg-primary)', fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'right', outline: 'none' }}
              />
              <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>g</span>
              <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={addIngredient}>Add</button>
              <button onClick={() => setSelectedFood(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', padding: 2, display: 'flex' }}>
                <X size={13}/>
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button
          className="btn btn-primary"
          style={{ flex: 2 }}
          disabled={!name.trim() || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Recipe'}
        </button>
      </div>
    </div>
  )
}

function RecipeDetail({ recipe, onBack, onDelete }: { recipe: Recipe; onBack: () => void; onDelete: () => void }) {
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/recipes/${recipe.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      onDelete()
    },
  })

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', padding: 4 }}>
            <ChevronLeft size={20}/>
          </button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: 'var(--fg-primary)' }}>{recipe.name}</h2>
        </div>
        <button
          className="btn"
          style={{ color: 'var(--bad)', borderColor: 'rgba(251,113,133,0.3)', padding: '8px 12px' }}
          onClick={() => { if (confirm('Delete this recipe?')) deleteMutation.mutate() }}
        >
          <Trash2 size={13}/>
        </button>
      </div>

      {recipe.description && (
        <div className="glass" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>{recipe.description}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {recipe.prep_minutes != null && (
          <div className="glass" style={{ flex: 1, padding: '12px 16px', textAlign: 'center' }}>
            <div className="num" style={{ fontSize: 18, color: 'var(--fg-primary)' }}>{recipe.prep_minutes}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>prep min</div>
          </div>
        )}
        {recipe.cook_minutes != null && (
          <div className="glass" style={{ flex: 1, padding: '12px 16px', textAlign: 'center' }}>
            <div className="num" style={{ fontSize: 18, color: 'var(--fg-primary)' }}>{recipe.cook_minutes}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>cook min</div>
          </div>
        )}
        <div className="glass" style={{ flex: 1, padding: '12px 16px', textAlign: 'center' }}>
          <div className="num" style={{ fontSize: 18, color: 'var(--fg-primary)' }}>{recipe.servings}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>servings</div>
        </div>
      </div>

      <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Nutrition per serving</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {KEY_NUTRIENTS.map(({ key, label, unit, color }) => (
            <div key={key} style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--glass-1)', borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 3 }}>{label}</div>
              <div className="num" style={{ fontSize: 15, fontWeight: 600, color }}>{fmtNutr(recipe.nutrition_per_serving?.[key], unit)}</div>
            </div>
          ))}
        </div>
      </div>

      {recipe.ingredients.length > 0 && (
        <div className="glass" style={{ padding: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Ingredients</div>
          {recipe.ingredients.map((ing: RecipeIngredient, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < recipe.ingredients.length - 1 ? '1px solid var(--glass-edge)' : 'none' }}>
              <span style={{ fontSize: 13, color: 'var(--fg-primary)' }}>{ing.food_name ?? 'Unknown food'}</span>
              <span className="num" style={{ fontSize: 13, color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)' }}>{ing.quantity}{ing.unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RecipesRoute() {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selected, setSelected] = useState<Recipe | null>(null)

  const { data, isLoading } = useQuery<{ recipes: Recipe[] }>({
    queryKey: ['recipes'],
    queryFn: () => api.get('/recipes'),
  })

  const recipes = data?.recipes ?? []

  if (view === 'create') {
    return (
      <div className="thin-scroll" style={{ padding: '24px 20px' }}>
        <RecipeForm onCancel={() => setView('list')} onSaved={() => setView('list')}/>
      </div>
    )
  }

  if (view === 'detail' && selected) {
    return (
      <div className="thin-scroll" style={{ padding: '24px 20px' }}>
        <RecipeDetail recipe={selected} onBack={() => setView('list')} onDelete={() => setView('list')}/>
      </div>
    )
  }

  return (
    <div className="thin-scroll" style={{ padding: '24px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>My Library</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Recipes
          </h1>
        </div>
        <button className="btn btn-primary" style={{ gap: 8 }} onClick={() => setView('create')}>
          <Plus size={15}/> New Recipe
        </button>
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--fg-quiet)', fontSize: 13 }}>
          Loading recipes…
        </div>
      )}

      {!isLoading && recipes.length === 0 && (
        <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🥘</div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 400, color: 'var(--fg-primary)' }}>No recipes yet</h3>
          <p style={{ margin: '8px 0 20px', fontSize: 14, color: 'var(--fg-tertiary)' }}>
            Build your first composite meal — a named collection of ingredients you can place in any plan slot.
          </p>
          <button className="btn btn-primary" onClick={() => setView('create')}>
            <Plus size={14}/> Create your first recipe
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {recipes.map((r) => (
          <button
            key={r.id}
            onClick={() => { setSelected(r); setView('detail') }}
            className="glass"
            style={{ padding: '16px 20px', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--glass-edge)', borderRadius: 16, width: '100%', transition: 'border-color 150ms' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 2 }}>{r.name}</div>
                {r.description && <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', lineHeight: 1.4 }}>{r.description}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                {r.prep_minutes != null && (
                  <span style={{ fontSize: 11, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>{r.prep_minutes + (r.cook_minutes ?? 0)} min</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>{r.ingredients.length} ingredients</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {KEY_NUTRIENTS.map(({ key, label, unit, color }) => (
                <div key={key} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>{label}</div>
                  <div className="num" style={{ fontSize: 13, fontWeight: 600, color }}>{fmtNutr(r.nutrition_per_serving?.[key], unit)}</div>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
