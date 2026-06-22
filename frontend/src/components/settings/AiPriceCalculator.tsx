import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type AiConfig, type LlmMetrics } from './types'
import { Coins, TrendingUp } from 'lucide-react'

type ModelPricing = {
  name: string
  originalKey: string
  provider: 'gemini' | 'anthropic' | 'local'
  inputCostPerMillion: number
  outputCostPerMillion: number
  isOverridden?: boolean
}

// Canonical default pricing if no API config is returned
const DEFAULT_MODELS: ModelPricing[] = [
  { name: 'Claude 3.5 Sonnet', originalKey: 'anthropic/claude-sonnet-4-5', provider: 'anthropic', inputCostPerMillion: 3.00, outputCostPerMillion: 15.00 },
  { name: 'Claude 3.5 Haiku', originalKey: 'anthropic/claude-haiku', provider: 'anthropic', inputCostPerMillion: 0.80, outputCostPerMillion: 4.00 },
  { name: 'Gemini 1.5 Pro', originalKey: 'gemini/gemini-1.5-pro', provider: 'gemini', inputCostPerMillion: 1.25, outputCostPerMillion: 5.00 },
  { name: 'Gemini 1.5 Flash', originalKey: 'gemini/gemini-1.5-flash', provider: 'gemini', inputCostPerMillion: 0.075, outputCostPerMillion: 0.30 },
  { name: 'Local Llama 3 (Self-hosted)', originalKey: 'local/llama-3', provider: 'local', inputCostPerMillion: 0.00, outputCostPerMillion: 0.00 },
]

const VOLUME_PRESETS = [
  { label: 'Light', value: 10, desc: '10 calls/day' },
  { label: 'Standard', value: 50, desc: '50 calls/day' },
  { label: 'Power', value: 200, desc: '200 calls/day' },
]

const TASK_PRESETS = [
  { label: 'Meal Planning', input: 3000, output: 1200 },
  { label: 'Food Log extraction', input: 800, output: 150 },
  { label: 'Daily Narrative', input: 4500, output: 600 },
]

export function AiPriceCalculator() {
  const queryClient = useQueryClient()

  const { data: aiConfig, isLoading: isConfigLoading } = useQuery<AiConfig>({
    queryKey: ['settings', 'ai-config'],
    queryFn: () => api.get('/settings/ai-config'),
  })

  // Fetch device-synced custom pricing overrides from database
  const { data: pricingOverrides = {} } = useQuery<Record<string, { input: number; output: number }>>({
    queryKey: ['settings', 'ai-pricing-overrides'],
    queryFn: () => api.get('/settings/ai-pricing-overrides'),
  })

  // Fetch live LLM metrics telemetry
  const { data: llmMetrics, isLoading: isMetricsLoading } = useQuery<LlmMetrics>({
    queryKey: ['settings', 'llm-metrics'],
    queryFn: () => api.get('/settings/llm-metrics'),
    refetchInterval: 15000,
  })

  // Database persistence mutation for overrides
  const saveOverridesMutation = useMutation({
    mutationFn: (updated: Record<string, { input: number; output: number }>) =>
      api.put('/settings/ai-pricing-overrides', updated),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'ai-pricing-overrides'] })
    },
  })

  // Parse active models from api config
  const getActiveModels = (): ModelPricing[] => {
    if (!aiConfig?.models) return DEFAULT_MODELS

    const uniqueModels = new Map<string, ModelPricing>()

    Object.values(aiConfig.models).forEach((binding) => {
      const candidates = [binding.primary, binding.fallback].filter(Boolean) as string[]
      
      candidates.forEach((modelStr) => {
        if (uniqueModels.has(modelStr)) return

        const lower = modelStr.toLowerCase()
        let provider: 'gemini' | 'anthropic' | 'local' = 'local'
        let inputCost: number
        let outputCost: number
        let cleanName = modelStr

        // Clean up provider prefixes for standard display
        if (lower.startsWith('anthropic/')) {
          provider = 'anthropic'
          cleanName = modelStr.substring('anthropic/'.length)
        } else if (lower.startsWith('gemini/')) {
          provider = 'gemini'
          cleanName = modelStr.substring('gemini/'.length)
        } else if (lower.startsWith('local/')) {
          provider = 'local'
          cleanName = modelStr.substring('local/'.length)
        } else {
          // Fallback parsing from raw names
          if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('haiku')) {
            provider = 'anthropic'
          } else if (lower.includes('gemini')) {
            provider = 'gemini'
          }
        }

        // Apply realistic pricing scales
        if (provider === 'anthropic') {
          if (lower.includes('haiku')) {
            inputCost = 0.80
            outputCost = 4.00
          } else {
            // Default Sonnet/Other Claude cost scale
            inputCost = 3.00
            outputCost = 15.00
          }
        } else if (provider === 'gemini') {
          if (lower.includes('pro')) {
            inputCost = 1.25
            outputCost = 5.00
          } else {
            // Default Flash/Lite Gemini cost scale
            inputCost = 0.075
            outputCost = 0.30
          }
        } else {
          inputCost = 0.00
          outputCost = 0.00
        }

        // Check for active overrides fetched from PostgreSQL database
        const hasOverride = !!pricingOverrides[modelStr]
        if (hasOverride) {
          inputCost = pricingOverrides[modelStr].input
          outputCost = pricingOverrides[modelStr].output
        }

        // Format nice capitalised name for display
        const displayLabel = cleanName
          .split(/[-_]/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')

        uniqueModels.set(modelStr, {
          name: displayLabel,
          originalKey: modelStr,
          provider,
          inputCostPerMillion: inputCost,
          outputCostPerMillion: outputCost,
          isOverridden: hasOverride,
        })
      })
    })

    const parsedList = Array.from(uniqueModels.values())
    return parsedList.length > 0 ? parsedList : DEFAULT_MODELS
  }

  const activeModels = getActiveModels()

  const [selectedModelKey, setSelectedModelKey] = useState<string>('')
  const [callsPerDay, setCallsPerDay] = useState<number>(50)
  const [inputTokens, setInputTokens] = useState<number>(1500)
  const [outputTokens, setOutputTokens] = useState<number>(800)

  // Rate Editing State
  const [isEditingRates, setIsEditingRates] = useState(false)
  const [customInputCost, setCustomInputCost] = useState('')
  const [customOutputCost, setCustomOutputCost] = useState('')

  // Prepopulate sliders with average telemetry metrics once on load
  const [hasPrepopulated, setHasPrepopulated] = useState(false)

  useEffect(() => {
    if (llmMetrics?.totals && !hasPrepopulated) {
      const successes = llmMetrics.totals.successes
      if (successes > 0) {
        const avgPrompt = Math.round(llmMetrics.totals.prompt_tokens / successes)
        const avgCompletion = Math.round(llmMetrics.totals.completion_tokens / successes)

        if (avgPrompt >= 100 && avgPrompt <= 10000) {
          setInputTokens(Math.round(avgPrompt / 100) * 100) // eslint-disable-line react-hooks/set-state-in-effect
        }
        if (avgCompletion >= 50 && avgCompletion <= 4000) {
          setOutputTokens(Math.round(avgCompletion / 50) * 50)
        }
        setHasPrepopulated(true)
      }
    }
  }, [llmMetrics, hasPrepopulated])

  // Default to first loaded model when active list is parsed
  useEffect(() => {
    if (activeModels.length > 0 && !selectedModelKey) {
      setSelectedModelKey(activeModels[0].originalKey) // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [activeModels, selectedModelKey])

  // Get active pricing details
  const selectedModel = activeModels.find(m => m.originalKey === selectedModelKey) || activeModels[0] || DEFAULT_MODELS[0]

  // Initialize edit fields when selected model changes or edit is toggled
  const startEditing = () => {
    setCustomInputCost(String(selectedModel.inputCostPerMillion))
    setCustomOutputCost(String(selectedModel.outputCostPerMillion))
    setIsEditingRates(true)
  }

  const saveRateOverride = () => {
    const inputVal = parseFloat(customInputCost) || 0
    const outputVal = parseFloat(customOutputCost) || 0
    
    const updated = {
      ...pricingOverrides,
      [selectedModel.originalKey]: { input: inputVal, output: outputVal }
    }
    saveOverridesMutation.mutate(updated)
    setIsEditingRates(false)
  }

  const clearSelectedOverride = () => {
    const updated = { ...pricingOverrides }
    delete updated[selectedModel.originalKey]
    saveOverridesMutation.mutate(updated)
    setIsEditingRates(false)
  }

  // Compute actual spent costs per model
  const getActualCosts = () => {
    if (!llmMetrics?.model_totals) return { list: [], total: 0 }

    const list: Array<{
      modelKey: string
      name: string
      provider: 'gemini' | 'anthropic' | 'local'
      promptTokens: number
      completionTokens: number
      cost: number
    }> = []

    let totalCost = 0
    const modelKeys = new Set<string>()

    Object.keys(llmMetrics.model_totals).forEach(key => {
      const parts = key.split(':')
      if (parts.length >= 2) {
        modelKeys.add(parts.slice(1).join(':'))
      }
    })

    modelKeys.forEach(modelKey => {
      const promptKey = `prompt_tokens:${modelKey}`
      const completionKey = `completion_tokens:${modelKey}`
      const promptTokens = llmMetrics.model_totals?.[promptKey] || 0
      const completionTokens = llmMetrics.model_totals?.[completionKey] || 0

      if (promptTokens === 0 && completionTokens === 0) return

      // Find the pricing rates for this model
      let modelPricing = activeModels.find(m => m.originalKey === modelKey)
      
      if (!modelPricing) {
        const lower = modelKey.toLowerCase()
        let provider: 'gemini' | 'anthropic' | 'local' = 'local'
        let inputCost = 0
        let outputCost = 0
        let cleanName = modelKey

        if (lower.startsWith('anthropic/')) {
          provider = 'anthropic'
          cleanName = modelKey.substring('anthropic/'.length)
        } else if (lower.startsWith('gemini/')) {
          provider = 'gemini'
          cleanName = modelKey.substring('gemini/'.length)
        } else if (lower.startsWith('local/')) {
          provider = 'local'
          cleanName = modelKey.substring('local/'.length)
        } else {
          if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('haiku')) {
            provider = 'anthropic'
          } else if (lower.includes('gemini')) {
            provider = 'gemini'
          }
        }

        if (provider === 'anthropic') {
          if (lower.includes('haiku')) {
            inputCost = 0.80
            outputCost = 4.00
          } else {
            inputCost = 3.00
            outputCost = 15.00
          }
        } else if (provider === 'gemini') {
          if (lower.includes('pro')) {
            inputCost = 1.25
            outputCost = 5.00
          } else {
            inputCost = 0.075
            outputCost = 0.30
          }
        }

        if (pricingOverrides[modelKey]) {
          inputCost = pricingOverrides[modelKey].input
          outputCost = pricingOverrides[modelKey].output
        }

        const displayLabel = cleanName
          .split(/[-_]/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')

        modelPricing = {
          name: displayLabel,
          originalKey: modelKey,
          provider,
          inputCostPerMillion: inputCost,
          outputCostPerMillion: outputCost,
        }
      }

      const promptCost = (promptTokens / 1000000) * modelPricing.inputCostPerMillion
      const completionCost = (completionTokens / 1000000) * modelPricing.outputCostPerMillion
      const cost = promptCost + completionCost
      totalCost += cost

      list.push({
        modelKey,
        name: modelPricing.name,
        provider: modelPricing.provider,
        promptTokens,
        completionTokens,
        cost,
      })
    })

    return { list, total: totalCost }
  }

  const { list: actualCostList, total: actualTotalCost } = getActualCosts()

  // Projections
  const inputCostPerCall = (inputTokens / 1000000) * selectedModel.inputCostPerMillion
  const outputCostPerCall = (outputTokens / 1000000) * selectedModel.outputCostPerMillion
  const costPerCall = inputCostPerCall + outputCostPerCall
  const dailyCost = costPerCall * callsPerDay
  const monthlyCost = dailyCost * 30.417

  const getProviderColor = (provider: string) => {
    if (provider === 'anthropic') return 'var(--aurora-violet)'
    if (provider === 'gemini') return 'var(--sky-400)'
    return 'var(--sun-400)'
  }

  const getProviderBg = (provider: string) => {
    if (provider === 'anthropic') return 'rgba(167, 139, 250, 0.08)'
    if (provider === 'gemini') return 'rgba(56, 189, 248, 0.08)'
    return 'rgba(251, 191, 36, 0.08)'
  }

  return (
    <div className="glass settings-card ai-price-calculator-card">
      {/* Title */}
      <div className="ai-card-header">
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>AI Cost Analysis</div>
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 13, margin: '4px 0 0' }}>
            Monitor actual spent token usage and customize billing pricing rates.
          </p>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          padding: '4px 8px', borderRadius: 6,
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.15)',
          color: 'var(--sky-400)', letterSpacing: '0.05em'
        }}>
          {isMetricsLoading || isConfigLoading ? 'Syncing...' : 'Active Telemetry'}
        </div>
      </div>

      {/* Actual Usage Section */}
      <div className="glass-inset" style={{ padding: 18, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Coins size={16} style={{ color: 'var(--sun-400)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Actual Spent Cost
          </span>
        </div>

        <div className="ai-actual-spent-grid">
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Total Cost</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 600, color: 'var(--sun-400)', marginTop: 4 }}>
              {actualTotalCost === 0 ? 'Free' : `$${actualTotalCost.toFixed(4)}`}
            </div>
            {llmMetrics?.totals && (
              <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 4 }}>
                {llmMetrics.totals.successes} successful calls
              </div>
            )}
          </div>

          <div className="ai-actual-spent-breakdown">
            {actualCostList.length > 0 ? (
              actualCostList.map(item => (
                <div key={item.modelKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <div style={{ minWidth: 0, marginRight: 8 }}>
                    <div style={{ fontWeight: 500, color: 'var(--fg-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </div>
                    <div className="num" style={{ fontSize: 10, color: 'var(--fg-quiet)', marginTop: 1 }}>
                      {item.promptTokens.toLocaleString()} in · {item.completionTokens.toLocaleString()} out
                    </div>
                  </div>
                  <span className="num" style={{ fontWeight: 600, color: 'var(--fg-primary)', flexShrink: 0 }}>
                    {item.cost === 0 ? 'Free' : `$${item.cost.toFixed(4)}`}
                  </span>
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--fg-quiet)', fontSize: 12, margin: 0 }}>
                No token consumption recorded yet. Telemetry will aggregate cost details as AI features are queried.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Calculator Projection & Rates Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Model Selection & Rate Customization */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pricing Rate Management
            </span>
            <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>Select model to configure rates</span>
          </div>
          <div className="ai-models-grid">
            {activeModels.map((model) => {
              const isSelected = selectedModel.originalKey === model.originalKey
              const activeColor = getProviderColor(model.provider)
              return (
                <button
                  key={model.originalKey}
                  type="button"
                  onClick={() => {
                    setSelectedModelKey(model.originalKey)
                    setIsEditingRates(false)
                  }}
                  style={{
                    background: isSelected ? getProviderBg(model.provider) : 'rgba(255, 255, 255, 0.02)',
                    border: isSelected ? `1px solid ${activeColor}` : '1px solid var(--glass-edge)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? 'var(--fg-primary)' : 'var(--fg-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {model.name}
                    </span>
                    {model.isOverridden && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: 'rgba(251, 191, 36, 0.12)', color: 'var(--sun-400)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="num" style={{ fontSize: 10, color: 'var(--fg-quiet)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{model.provider === 'local' ? 'Self-hosted' : `$${model.inputCostPerMillion.toFixed(3)}/M`}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Dynamic Model Price Override form */}
        <div className="glass-inset" style={{ padding: '12px 14px', borderRadius: 10 }}>
          {isEditingRates ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>
                  Customize Pricing for {selectedModel.name}
                </span>
                {saveOverridesMutation.isPending && (
                  <span style={{ fontSize: 10, color: 'var(--sky-400)' }}>Saving overrides...</span>
                )}
              </div>
              <div className="ai-rate-edit-inputs">
                <div className="ai-rate-edit-field">
                  <label htmlFor="custom-input-cost" style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>Input Cost ($/M tokens)</label>
                  <input
                    id="custom-input-cost"
                    type="number"
                    step="0.001"
                    min="0"
                    value={customInputCost}
                    onChange={(e) => setCustomInputCost(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid var(--glass-edge)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      color: 'var(--fg-primary)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                </div>
                <div className="ai-rate-edit-field">
                  <label htmlFor="custom-output-cost" style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>Output Cost ($/M tokens)</label>
                  <input
                    id="custom-output-cost"
                    type="number"
                    step="0.001"
                    min="0"
                    value={customOutputCost}
                    onChange={(e) => setCustomOutputCost(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid var(--glass-edge)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      color: 'var(--fg-primary)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={saveRateOverride}
                  disabled={saveOverridesMutation.isPending}
                  style={{
                    padding: '6px 12px', fontSize: 11, background: getProviderColor(selectedModel.provider),
                    color: '#000', fontWeight: 600, border: 'none', borderRadius: 6
                  }}
                >
                  Save Rates
                </button>
                {selectedModel.isOverridden && (
                  <button
                    type="button"
                    className="btn"
                    onClick={clearSelectedOverride}
                    disabled={saveOverridesMutation.isPending}
                    style={{
                      padding: '6px 12px', fontSize: 11, background: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 6
                    }}
                  >
                    Reset to Default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingRates(false)}
                  style={{
                    padding: '6px 12px', fontSize: 11, background: 'none',
                    border: 'none', color: 'var(--fg-quiet)', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>
                {selectedModel.provider === 'local' ? (
                  <span>Local models run for free on your hardware.</span>
                ) : (
                  <span>
                    Current rates: <strong className="num" style={{ color: 'var(--fg-primary)' }}>${selectedModel.inputCostPerMillion.toFixed(3)}/M</strong> input, <strong className="num" style={{ color: 'var(--fg-primary)' }}>${selectedModel.outputCostPerMillion.toFixed(3)}/M</strong> output
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={startEditing}
                style={{
                  background: 'none', border: 'none', color: getProviderColor(selectedModel.provider),
                  fontSize: 11, fontWeight: 500, cursor: 'pointer', padding: '2px 6px', outline: 'none'
                }}
              >
                {selectedModel.isOverridden ? '[Edit Custom Rates]' : '[Customize Rates]'}
              </button>
            </div>
          )}
        </div>

        {/* Projection Subtitle Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <TrendingUp size={16} style={{ color: 'var(--sky-400)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Interactive Cost Projection
          </span>
        </div>

        {/* Dynamic Sliders / Inputs */}
        <div className="ai-projection-inputs-grid">
          {/* Token settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prompt Tokens</span>
                <span className="num" style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-secondary)' }}>{inputTokens.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="100"
                max="10000"
                step="100"
                value={inputTokens}
                onChange={(e) => setInputTokens(Number(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: getProviderColor(selectedModel.provider),
                  cursor: 'pointer',
                  '--thumb-color': getProviderColor(selectedModel.provider),
                } as React.CSSProperties}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Response Tokens</span>
                <span className="num" style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-secondary)' }}>{outputTokens.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="50"
                max="4000"
                step="50"
                value={outputTokens}
                onChange={(e) => setOutputTokens(Number(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: getProviderColor(selectedModel.provider),
                  cursor: 'pointer',
                  '--thumb-color': getProviderColor(selectedModel.provider),
                } as React.CSSProperties}
              />
            </div>

            {/* Presets */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 6 }}>Task Presets:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TASK_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setInputTokens(preset.input)
                      setOutputTokens(preset.output)
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--glass-edge)',
                      borderRadius: 6,
                      padding: '4px 8px',
                      fontSize: 11,
                      color: 'var(--fg-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--glass-edge)'}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Volume Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Calls Per Day</span>
                <span className="num" style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-secondary)' }}>{callsPerDay}</span>
              </div>
              <input
                type="range"
                min="1"
                max="1000"
                step="5"
                value={callsPerDay}
                onChange={(e) => setCallsPerDay(Number(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: getProviderColor(selectedModel.provider),
                  cursor: 'pointer',
                  '--thumb-color': getProviderColor(selectedModel.provider),
                } as React.CSSProperties}
              />
            </div>

            {/* Presets */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 6 }}>Volume Presets:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {VOLUME_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setCallsPerDay(preset.value)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--glass-edge)',
                      borderRadius: 6,
                      padding: '4px 8px',
                      fontSize: 11,
                      color: 'var(--fg-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--glass-edge)'}
                  >
                    {preset.label} ({preset.value})
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Projections breakdown */}
        <div className="glass-inset" style={{ padding: 18, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Cost Projections
          </div>

          <div className="ai-projections-breakdown-grid">
            <div className="ai-proj-col-monthly">
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Monthly Projection</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 600, color: getProviderColor(selectedModel.provider), marginTop: 4 }}>
                {monthlyCost === 0 ? 'Free' : `$${monthlyCost.toFixed(2)}`}
              </div>
            </div>
            <div className="ai-proj-col-detail">
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Per Call</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 500, color: 'var(--fg-primary)', marginTop: 4 }}>
                {costPerCall === 0 ? 'Free' : `$${costPerCall.toFixed(4)}`}
              </div>
            </div>
            <div className="ai-proj-col-detail">
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Daily Total</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 500, color: 'var(--fg-primary)', marginTop: 4 }}>
                {dailyCost === 0 ? 'Free' : `$${dailyCost.toFixed(2)}`}
              </div>
            </div>
          </div>

          {selectedModel.provider !== 'local' && (
            <div style={{ borderTop: '1px solid var(--glass-edge)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--fg-quiet)' }}>Prompt Input Share:</span>
                <span className="num" style={{ color: 'var(--fg-secondary)' }}>
                  {((inputCostPerCall / costPerCall) * 100).toFixed(0)}% (${inputCostPerCall.toFixed(4)})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--fg-quiet)' }}>Response Output Share:</span>
                <span className="num" style={{ color: 'var(--fg-secondary)' }}>
                  {((outputCostPerCall / costPerCall) * 100).toFixed(0)}% (${outputCostPerCall.toFixed(4)})
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
