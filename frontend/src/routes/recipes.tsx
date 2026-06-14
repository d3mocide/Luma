import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ChevronLeft, Search, X, Utensils, Globe, AlertTriangle, CheckCircle2, Clock, List } from 'lucide-react'
import { api } from '../lib/api'
import type { RecipeImportDraft, RecipeImportDraftIngredient } from '../lib/api'
import type { Recipe, RecipeIngredient, FoodResult } from '../components/plan/types'
import { KEY_NUTRIENTS, fmtNutr } from '../components/plan/types'
import { ShareWithFamilyButton } from '../components/ShareWithFamilyButton'

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
  const [instructionsText, setInstructionsText] = useState('')
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
      instructions: instructionsText.trim() ? instructionsText.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
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
        <div className="eyebrow" style={{ marginBottom: 16 }}>Instructions</div>
        <textarea
          value={instructionsText}
          onChange={(e) => setInstructionsText(e.target.value)}
          placeholder="Enter cooking instructions, one step per line..."
          rows={4}
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
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
      <div className="recipe-detail-header">
        <div className="recipe-title-wrapper">
          <button onClick={onBack} className="btn-back">
            <ChevronLeft size={20}/>
          </button>
          <h2 className="recipe-title">{recipe.name}</h2>
        </div>
        <div className="recipe-actions">
          <ShareWithFamilyButton resourceType="recipe" resourceId={recipe.id} />
          <button
            className="btn btn-delete-recipe"
            onClick={() => { if (confirm('Delete this recipe?')) deleteMutation.mutate() }}
          >
            <Trash2 size={13}/>
          </button>
        </div>
      </div>

      {recipe.description && (
        <div className="glass" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>{recipe.description}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {recipe.prep_minutes != null && (
          <div className="glass" style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Clock size={16} style={{ color: 'var(--sky-400)' }} />
            <div className="num" style={{ fontSize: 18, color: 'var(--fg-primary)' }}>{recipe.prep_minutes}m</div>
            <div style={{ fontSize: 10, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prep Time</div>
          </div>
        )}
        {recipe.cook_minutes != null && (
          <div className="glass" style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Clock size={16} style={{ color: 'var(--sun-400)' }} />
            <div className="num" style={{ fontSize: 18, color: 'var(--fg-primary)' }}>{recipe.cook_minutes}m</div>
            <div style={{ fontSize: 10, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cook Time</div>
          </div>
        )}
        <div className="glass" style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <Utensils size={16} style={{ color: 'var(--good)' }} />
          <div className="num" style={{ fontSize: 18, color: 'var(--fg-primary)' }}>{recipe.servings}</div>
          <div style={{ fontSize: 10, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Servings</div>
        </div>
      </div>

      <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Nutrition per serving</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {KEY_NUTRIENTS.map(({ key, label, unit, color }) => (
            <div key={key} style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
              <div className="num" style={{ fontSize: 16, fontWeight: 600, color }}>{fmtNutr(recipe.nutrition_per_serving?.[key], unit)}</div>
            </div>
          ))}
        </div>
      </div>

      {recipe.ingredients.length > 0 && (
          <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Ingredients</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recipe.ingredients.map((ing: RecipeIngredient, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: i % 2 === 0 ? 'var(--glass-1)' : 'transparent', borderRadius: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{ing.food_name ?? 'Unknown food'}</span>
                  <span className="num" style={{ fontSize: 11, color: 'var(--sky-300)', background: 'rgba(56, 189, 248, 0.09)', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(56, 189, 248, 0.22)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{ing.quantity} {ing.unit}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      {recipe.instructions && recipe.instructions.length > 0 && (
        <div className="glass" style={{ padding: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Instructions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recipe.instructions.map((step, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span className="num" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'rgba(56, 189, 248, 0.09)', border: '1px solid rgba(56, 189, 248, 0.22)', color: 'var(--sky-300)', fontSize: 11, fontWeight: 600, flexShrink: 0, marginTop: 2 }}>
                  {idx + 1}
                </span>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>{step}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ImportRecipeView({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<'url' | 'review'>('url')
  const [url, setUrl] = useState('')
  const [draft, setDraft] = useState<RecipeImportDraft | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  // Review-stage state (pre-populated once draft arrives)
  const [name, setName] = useState('')
  const [servings, setServings] = useState('1')
  const [matchedIngredients, setMatchedIngredients] = useState<RecipeImportDraftIngredient[]>([])
  const [unmatchedIngredients, setUnmatchedIngredients] = useState<RecipeImportDraftIngredient[]>([])
  const [instructionsText, setInstructionsText] = useState('')
  const [foodQuery, setFoodQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [resolvingIdx, setResolvingIdx] = useState<number | null>(null)

  const fieldStyle = {
    width: '100%', boxSizing: 'border-box' as const,
    background: 'rgba(0,0,0,0.25)', border: '1px solid var(--glass-edge)',
    borderRadius: 10, color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)',
    fontSize: 14, padding: '10px 14px', outline: 'none',
  }

  const { data: foodResults, isFetching: searching } = useQuery<FoodResult[]>({
    queryKey: ['foods', debouncedQuery],
    queryFn: () => api.get(`/foods/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length > 1,
    staleTime: 60_000,
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('No draft')
      const allIngredients = [...matchedIngredients, ...unmatchedIngredients]
      return api.post('/recipes', {
        name,
        description: draft.description || undefined,
        instructions: instructionsText.trim() ? instructionsText.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
        prep_minutes: draft.prep_minutes ?? undefined,
        cook_minutes: draft.cook_minutes ?? undefined,
        servings: parseFloat(servings) || 1,
        tags: draft.tags.length ? draft.tags : undefined,
        source: draft.source_url,
        ingredients: allIngredients.map((ing, i) => ({
          food_id: ing.food_id,
          food_name: ing.food_name || ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes || undefined,
          sort_order: i,
        })),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      onSaved()
    },
  })

  async function handleImport() {
    if (!url.trim()) return
    setImporting(true)
    setImportError(null)
    try {
      const result = await api.post<RecipeImportDraft>('/recipes/import', { url: url.trim() })
      setDraft(result)
      setName(result.name)
      setServings(result.servings.toString())
      setMatchedIngredients(result.ingredients.filter((i) => i.food_id !== null))
      setUnmatchedIngredients(result.ingredients.filter((i) => i.food_id === null))
      setInstructionsText(result.instructions.join('\n'))
      setStage('review')
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function resolveUnmatched(idx: number, food: FoodResult) {
    const ing = unmatchedIngredients[idx]
    setMatchedIngredients((prev) => [...prev, { ...ing, food_id: food.id, food_name: food.name }])
    setUnmatchedIngredients((prev) => prev.filter((_, i) => i !== idx))
    setResolvingIdx(null)
    setFoodQuery('')
    setDebouncedQuery('')
  }

  if (stage === 'url') {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', padding: 4 }}>
            <ChevronLeft size={20}/>
          </button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: 'var(--fg-primary)' }}>Import Recipe</h2>
        </div>

        <div className="glass" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Globe size={16} style={{ color: 'var(--fg-quiet)' }}/>
            <div className="eyebrow">Recipe URL</div>
          </div>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
            Paste any recipe page URL — Luma will extract the ingredients and details automatically.
          </p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleImport()}
            placeholder="https://..."
            type="url"
            style={fieldStyle}
            autoFocus
          />
          {importError && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--bad)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={13}/> {importError}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            disabled={!url.trim() || importing}
            onClick={handleImport}
          >
            {importing ? 'Importing…' : 'Import Recipe'}
          </button>
        </div>
      </div>
    )
  }

  // Review stage
  const unmatched = unmatchedIngredients.length
  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => setStage('url')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', padding: 4 }}>
          <ChevronLeft size={20}/>
        </button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: 'var(--fg-primary)' }}>Review Recipe</h2>
      </div>

      {/* Unmatched warning */}
      {unmatched > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 12, marginBottom: 16, fontSize: 13, color: 'var(--fg-secondary)' }}>
          <AlertTriangle size={15} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 1 }}/>
          <span>{unmatched} ingredient{unmatched > 1 ? 's' : ''} couldn't be matched to the food database. Search below to link them, or save them as empty values.</span>
        </div>
      )}

      {/* Source URL */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 11, color: 'var(--fg-quiet)' }}>
        <Globe size={11}/>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}>{draft?.source_url}</span>
      </div>

      {/* Name */}
      <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Details</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name *" style={fieldStyle}/>
        {draft?.description && (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>{draft.description}</p>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          {draft?.prep_minutes != null && <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>Prep: {draft.prep_minutes} min</span>}
          {draft?.cook_minutes != null && <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>Cook: {draft.cook_minutes} min</span>}
          <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>Servings:&nbsp;
            <input type="number" value={servings} onChange={(e) => setServings(e.target.value)} min={0.5} step={0.5}
              style={{ width: 48, padding: '2px 6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-edge)', borderRadius: 6, color: 'var(--fg-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none' }}/>
          </span>
        </div>
      </div>

      {/* Instructions */}
      <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Instructions</div>
        <textarea
          value={instructionsText}
          onChange={(e) => setInstructionsText(e.target.value)}
          placeholder="Enter cooking instructions, one step per line..."
          rows={4}
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
      </div>

      {/* Matched ingredients */}
      {matchedIngredients.length > 0 && (
        <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Matched Ingredients</div>
          {matchedIngredients.map((ing, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < matchedIngredients.length - 1 ? '1px solid var(--glass-edge)' : 'none' }}>
              <CheckCircle2 size={13} style={{ color: 'var(--good)', flexShrink: 0 }}/>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: 'var(--fg-primary)' }}>{ing.food_name}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-quiet)', marginLeft: 6 }}>{ing.raw_text}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{ing.quantity}{ing.unit}</span>
              <button onClick={() => { setUnmatchedIngredients((prev) => [...prev, { ...ing, food_id: null, food_name: null }]); setMatchedIngredients((prev) => prev.filter((_, j) => j !== i)) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', padding: 4, display: 'flex' }}>
                <X size={13}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Unmatched ingredients */}
      {unmatchedIngredients.length > 0 && (
        <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Unmatched Ingredients</div>
          {unmatchedIngredients.map((ing, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: i < unmatchedIngredients.length - 1 ? '1px solid var(--glass-edge)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: resolvingIdx === i ? 8 : 0 }}>
                <AlertTriangle size={13} style={{ color: '#fbbf24', flexShrink: 0 }}/>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-secondary)' }}>{ing.raw_text}</span>
                <button
                  className="btn"
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => { setResolvingIdx(resolvingIdx === i ? null : i); setFoodQuery(''); setDebouncedQuery('') }}
                >
                  {resolvingIdx === i ? 'Cancel' : 'Search'}
                </button>
              </div>
              {resolvingIdx === i && (
                <div style={{ paddingLeft: 21 }}>
                  <div style={{ position: 'relative', marginBottom: 6 }}>
                    <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-quiet)' }}/>
                    <input
                      autoFocus
                      value={foodQuery}
                      onChange={(e) => { setFoodQuery(e.target.value); setDebouncedQuery(e.target.value) }}
                      placeholder={`Search for "${ing.name}"…`}
                      style={{ ...fieldStyle, paddingLeft: 30, fontSize: 12 }}
                    />
                  </div>
                  {searching && <div style={{ fontSize: 11, color: 'var(--fg-quiet)', padding: '4px 0' }}>Searching…</div>}
                  {!searching && debouncedQuery.length > 1 && !foodResults?.length && <div style={{ fontSize: 11, color: 'var(--fg-quiet)', padding: '4px 0' }}>No results</div>}
                  {!searching && foodResults?.map((f) => (
                    <button key={f.id} onClick={() => resolveUnmatched(i, f)}
                      style={{ width: '100%', textAlign: 'left', padding: '7px 10px', background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', borderRadius: 8, cursor: 'pointer', marginBottom: 3, fontSize: 12, color: 'var(--fg-primary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{f.name}{f.brand && <span style={{ fontSize: 10, color: 'var(--fg-quiet)', marginLeft: 6 }}>{f.brand}</span>}</span>
                      <span style={{ fontSize: 10, color: 'var(--sky-400)', fontFamily: 'var(--font-mono)' }}>{Math.round(f.nutrients_per_100g.calories ?? 0)} cal/100g</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="recipe-importer-actions">
        <button className="btn btn-discard" onClick={onCancel}>Discard</button>
        <button
          className="btn btn-primary btn-save"
          disabled={!name.trim() || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Recipe'}
        </button>
      </div>
    </div>
  )
}

export default function RecipesRoute() {
  const [view, setView] = useState<'list' | 'create' | 'detail' | 'import'>('list')
  const [selected, setSelected] = useState<Recipe | null>(null)

  const { data, isLoading } = useQuery<{ recipes: Recipe[] }>({
    queryKey: ['recipes'],
    queryFn: () => api.get('/recipes'),
  })

  const recipes = data?.recipes ?? []

  if (view === 'create') {
    return (
      <div style={{ paddingTop: 0, paddingBottom: 20 }}>
        <RecipeForm onCancel={() => setView('list')} onSaved={() => setView('list')}/>
      </div>
    )
  }

  if (view === 'import') {
    return (
      <div style={{ paddingTop: 0, paddingBottom: 20 }}>
        <ImportRecipeView onCancel={() => setView('list')} onSaved={() => setView('list')}/>
      </div>
    )
  }

  if (view === 'detail' && selected) {
    return (
      <div style={{ paddingTop: 0, paddingBottom: 20 }}>
        <RecipeDetail recipe={selected} onBack={() => setView('list')} onDelete={() => setView('list')}/>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 0, paddingBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>My Library</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Recipes
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-sm" style={{ gap: 6, flexShrink: 0 }} onClick={() => setView('import')}>
            <Globe size={14}/> Import
          </button>
          <button className="btn btn-primary btn-sm" style={{ gap: 8, flexShrink: 0 }} onClick={() => setView('create')}>
            <Plus size={15}/>
            <span className="btn-label-desktop">New Recipe</span>
            <span className="btn-label-mobile">Recipe</span>
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--fg-quiet)', fontSize: 13 }}>
          Loading recipes…
        </div>
      )}

      {!isLoading && recipes.length === 0 && (
        <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ marginBottom: 16, color: 'var(--fg-quiet)' }}><Utensils size={40} /></div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 400, color: 'var(--fg-primary)' }}>No recipes yet</h3>
          <p style={{ margin: '8px 0 20px', fontSize: 14, color: 'var(--fg-tertiary)' }}>
            Build your first composite meal — a named collection of ingredients you can place in any plan slot.
          </p>
          <button className="btn btn-primary" onClick={() => setView('create')}>
            <Plus size={14}/> Create your first recipe
          </button>
        </div>
      )}

      <div className="recipes-grid">
        {recipes.map((r) => (
          <button
            key={r.id}
            onClick={() => { setSelected(r); setView('detail') }}
            className="recipe-card"
          >
            <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, width: '100%' }}>
              <div className="recipe-card-header">
                <span className="recipe-card-title">{r.name}</span>
                <ShareWithFamilyButton resourceType="recipe" resourceId={r.id} stopPropagation />
              </div>

              <div className="recipe-meta-row">
                {r.prep_minutes != null && (
                  <span className="recipe-meta-tag">
                    <Clock size={11} />
                    <span>{r.prep_minutes + (r.cook_minutes ?? 0)} min</span>
                  </span>
                )}
                <span className="recipe-meta-tag">
                  <List size={11} />
                  <span>{r.ingredients.length} ingredients</span>
                </span>
              </div>

              {r.description && <p className="recipe-card-description">{r.description}</p>}
            </div>

            <div className="recipe-card-nutrients">
              {KEY_NUTRIENTS.map(({ key, label, unit, color }) => (
                <div key={key} className="recipe-nutrient-col">
                  <div className="recipe-nutrient-label">{label}</div>
                  <div className="recipe-nutrient-value" style={{ color }}>
                    {fmtNutr(r.nutrition_per_serving?.[key], unit)}
                  </div>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
