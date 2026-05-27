import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useUIStore } from '../../stores'
import type { MeasurementSystem, MeasurementSettings } from './types'

export function MeasurementsCard() {
  const queryClient = useQueryClient()
  const theme = useUIStore((state) => state.theme)

  const { data: measurementSettings, isLoading: measurementLoading } = useQuery<MeasurementSettings>({
    queryKey: ['settings', 'measurements'],
    queryFn: () => api.get('/settings/measurements'),
  })

  const measurementMutation = useMutation({
    mutationFn: (system: MeasurementSystem) =>
      api.put<MeasurementSettings>('/settings/measurements', { system }),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings', 'measurements'], data)
    },
  })

  const measurementSystem = measurementSettings?.system ?? 'metric'

  const setMeasurementSystem = (system: MeasurementSystem) => {
    if (measurementMutation.isPending || system === measurementSystem) return
    measurementMutation.mutate(system)
  }

  return (
    <div className="glass settings-card settings-card-spacious" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Measurements</div>
      <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 14px' }}>
        Choose your preferred unit system for your account.
      </p>

      <div className={`theme-toggle ${theme === 'light' ? 'light-mode' : ''}`} style={{ width: '100%' }}>
        <button
          type="button"
          data-active={measurementSystem === 'metric' ? 'true' : 'false'}
          onClick={() => setMeasurementSystem('metric')}
          disabled={measurementLoading || measurementMutation.isPending}
          aria-label="Use metric units"
        >
          Metric
        </button>
        <button
          type="button"
          data-active={measurementSystem === 'imperial' ? 'true' : 'false'}
          onClick={() => setMeasurementSystem('imperial')}
          disabled={measurementLoading || measurementMutation.isPending}
          aria-label="Use imperial units"
        >
          Imperial
        </button>
      </div>

      {measurementMutation.isError && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(251,113,133,0.10)', border: '1px solid rgba(251,113,133,0.25)',
          borderRadius: 12, fontSize: 13, color: 'var(--bad)',
        }}>
          Could not update measurement settings. Please try again.
        </div>
      )}
    </div>
  )
}
