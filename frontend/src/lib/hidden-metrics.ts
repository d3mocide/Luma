import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export const HIDDEN_METRIC_KIND = 'hidden_metric'

interface Preference { kind: string; value: string }

export function useHiddenMetrics() {
  const queryClient = useQueryClient()

  const { data: prefs = [], isLoading } = useQuery<Preference[]>({
    queryKey: ['preferences'],
    queryFn: () => api.get('/preferences'),
  })

  const hidden = useMemo(
    () => new Set(prefs.filter(p => p.kind === HIDDEN_METRIC_KIND).map(p => p.value)),
    [prefs],
  )

  const hideMutation = useMutation({
    mutationFn: (id: string) => api.post('/preferences', { kind: HIDDEN_METRIC_KIND, value: id }),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['preferences'] })
      const prev = queryClient.getQueryData<Preference[]>(['preferences'])
      queryClient.setQueryData<Preference[]>(['preferences'], old =>
        [...(old ?? []), { kind: HIDDEN_METRIC_KIND, value: id }],
      )
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['preferences'], ctx.prev)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['preferences'] }),
  })

  const showMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/preferences/${HIDDEN_METRIC_KIND}/${id}`),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['preferences'] })
      const prev = queryClient.getQueryData<Preference[]>(['preferences'])
      queryClient.setQueryData<Preference[]>(['preferences'], old =>
        (old ?? []).filter(p => !(p.kind === HIDDEN_METRIC_KIND && p.value === id)),
      )
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['preferences'], ctx.prev)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['preferences'] }),
  })

  const toggle = (id: string) => {
    if (hidden.has(id)) {
      showMutation.mutate(id)
    } else {
      hideMutation.mutate(id)
    }
  }

  return { hidden, toggle, isLoading }
}
