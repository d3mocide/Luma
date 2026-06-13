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

export function convertWeightToKg(valueLbOrKg: number | null | undefined, system: MeasurementSystem): number | null {
  if (valueLbOrKg == null) return null
  return system === 'imperial' ? valueLbOrKg / KG_TO_LB : valueLbOrKg
}

const ML_TO_FLOZ = 0.0338140227

export function measurementVolumeUnit(system: MeasurementSystem): 'ml' | 'fl oz' {
  return system === 'imperial' ? 'fl oz' : 'ml'
}

export function convertVolume(valueMl: number | null | undefined, system: MeasurementSystem): number | null {
  if (valueMl == null) return null
  return system === 'imperial' ? valueMl * ML_TO_FLOZ : valueMl
}

export function convertVolumeToMl(valueFlOzOrMl: number | null | undefined, system: MeasurementSystem): number | null {
  if (valueFlOzOrMl == null) return null
  return system === 'imperial' ? valueFlOzOrMl / ML_TO_FLOZ : valueFlOzOrMl
}