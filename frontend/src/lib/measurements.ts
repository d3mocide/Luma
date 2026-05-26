import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export type MeasurementSystem = 'metric' | 'imperial'

export interface MeasurementSettings {
  system: MeasurementSystem
}

const KG_TO_LB = 2.2046226218

export function useMeasurementSystem(): MeasurementSystem {
  const { data } = useQuery<MeasurementSettings>({
    queryKey: ['settings', 'measurements'],
    queryFn: () => api.get('/settings/measurements'),
  })

  return data?.system ?? 'metric'
}

export function measurementWeightUnit(system: MeasurementSystem): 'kg' | 'lb' {
  return system === 'imperial' ? 'lb' : 'kg'
}

export function measurementSlopeUnit(system: MeasurementSystem): string {
  return `${measurementWeightUnit(system)}/wk`
}

export function convertWeight(valueKg: number | null | undefined, system: MeasurementSystem): number | null {
  if (valueKg == null) return null
  return system === 'imperial' ? valueKg * KG_TO_LB : valueKg
}

export function convertWeightSlope(valueKgPerWeek: number | null | undefined, system: MeasurementSystem): number | null {
  if (valueKgPerWeek == null) return null
  return system === 'imperial' ? valueKgPerWeek * KG_TO_LB : valueKgPerWeek
}