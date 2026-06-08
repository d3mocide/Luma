import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Share2, Check, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api, FamilyGroup, ResourceType } from '../lib/api'

interface Props {
  resourceType: ResourceType
  resourceId: string
  /** Used only to stop click propagation — pass e from a parent button if needed */
  stopPropagation?: boolean
}

export function ShareWithFamilyButton({ resourceType, resourceId, stopPropagation }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [doneGroupId, setDoneGroupId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const { data: groupsData } = useQuery<{ groups: FamilyGroup[] }>({
    queryKey: ['family', 'groups'],
    queryFn: () => api.get('/family/groups/me'),
    staleTime: 60_000,
  })
  const groups = groupsData?.groups ?? []

  const shareMutation = useMutation({
    mutationFn: ({ groupId }: { groupId: string }) =>
      api.post(`/family/groups/${groupId}/shares`, {
        resource_type: resourceType,
        resource_id: resourceId,
      }),
    onSuccess: (_data, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: ['family', 'shares'] })
      setDoneGroupId(groupId)
      setTimeout(() => {
        setDoneGroupId(null)
        setOpen(false)
      }, 1800)
    },
  })

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleTriggerClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) e.stopPropagation()
    setOpen((o) => !o)
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleTriggerClick}
        className="favorite-action-btn"
        title="Share with family group"
        aria-label="Share with family"
      >
        <Share2 size={12} strokeWidth={1.75} />
        <span className="btn-label">Share</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 50,
            minWidth: 200,
            background: 'var(--bg-2, #0d1829)',
            border: '1px solid var(--glass-edge)',
            borderRadius: 12,
            padding: 6,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {groups.length === 0 ? (
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginBottom: 8 }}>
                No family groups yet.
              </div>
              <button
                onClick={() => { setOpen(false); navigate('/family') }}
                style={{
                  fontSize: 12, color: 'var(--sky-400)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: 0, display: 'flex',
                  alignItems: 'center', gap: 5,
                }}
              >
                <Users size={12} /> Create a group
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: 'var(--fg-quiet)', padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Share with
              </div>
              {groups.map((g) => {
                const isDone = doneGroupId === g.id
                const isPending = shareMutation.isPending && shareMutation.variables?.groupId === g.id
                return (
                  <button
                    key={g.id}
                    onClick={() => !isDone && shareMutation.mutate({ groupId: g.id })}
                    disabled={isPending}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex',
                      alignItems: 'center', justifyContent: 'space-between',
                      gap: 8, padding: '8px 10px', borderRadius: 8,
                      background: isDone ? 'rgba(16,185,129,0.08)' : 'transparent',
                      border: 'none', cursor: isDone ? 'default' : 'pointer',
                      color: isDone ? 'var(--good)' : 'var(--fg-primary)',
                      fontSize: 13, transition: 'background 150ms',
                    }}
                    onMouseEnter={(e) => { if (!isDone) (e.currentTarget as HTMLButtonElement).style.background = 'var(--glass-1)' }}
                    onMouseLeave={(e) => { if (!isDone) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <span>{g.name}</span>
                    {isDone && <Check size={13} strokeWidth={2} />}
                    {isPending && <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>…</span>}
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
