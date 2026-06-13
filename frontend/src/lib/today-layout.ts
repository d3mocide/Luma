import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { type SectionId, DEFAULT_ORDER } from './today-sections'

const STORAGE_KEY = 'luma_today_section_order'
const TODAY_HIDDEN_KIND = 'today_section_hidden'

interface Preference { kind: string; value: string }

function loadOrder(): SectionId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as string[]
      const valid = parsed.filter((id): id is SectionId =>
        DEFAULT_ORDER.includes(id as SectionId),
      )
      const missing = DEFAULT_ORDER.filter(id => !valid.includes(id))
      return [...valid, ...missing]
    }
  } catch { /* ignore */ }
  return DEFAULT_ORDER
}

export function useTodayLayout() {
  const queryClient = useQueryClient()

  const [order, setOrderState] = useState<SectionId[]>(loadOrder)

  const { data: prefs = [] } = useQuery<Preference[]>({
    queryKey: ['preferences'],
    queryFn: () => api.get('/preferences'),
  })

  const hidden = useMemo(
    () => new Set(prefs.filter(p => p.kind === TODAY_HIDDEN_KIND).map(p => p.value)),
    [prefs],
  )

  const setOrder = (newOrder: SectionId[]) => {
    setOrderState(newOrder)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder)) } catch { /* ignore */ }
  }

  const hideMutation = useMutation({
    mutationFn: (id: string) =>
      api.post('/preferences', { kind: TODAY_HIDDEN_KIND, value: id }),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['preferences'] })
      const prev = queryClient.getQueryData<Preference[]>(['preferences'])
      queryClient.setQueryData<Preference[]>(['preferences'], old =>
        [...(old ?? []), { kind: TODAY_HIDDEN_KIND, value: id }],
      )
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['preferences'], ctx.prev)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['preferences'] }),
  })

  const showMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/preferences/${TODAY_HIDDEN_KIND}/${id}`),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['preferences'] })
      const prev = queryClient.getQueryData<Preference[]>(['preferences'])
      queryClient.setQueryData<Preference[]>(['preferences'], old =>
        (old ?? []).filter(p => !(p.kind === TODAY_HIDDEN_KIND && p.value === id)),
      )
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['preferences'], ctx.prev)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['preferences'] }),
  })

  const toggleVisible = (id: string) => {
    if (hidden.has(id)) showMutation.mutate(id)
    else hideMutation.mutate(id)
  }

  return { order, hidden, setOrder, toggleVisible }
}
