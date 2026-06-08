import { type ComponentType, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Heart, CalendarDays, Copy, Check, Trash2, Users } from 'lucide-react'
import { api, FamilyGroup, GroupShare, MemberStatus, ResourceType } from '../lib/api'

const TYPE_ICON: Record<ResourceType, ComponentType<{ size?: number | string; strokeWidth?: number; color?: string }>> = {
  recipe: BookOpen,
  favorite: Heart,
  plan: CalendarDays,
}

const TYPE_LABEL: Record<ResourceType, string> = {
  recipe: 'Recipe',
  favorite: 'Favorite',
  plan: 'Meal plan',
}

export default function FamilySharedRoute() {
  const { data: groupsData, isLoading: groupsLoading } = useQuery<{ groups: FamilyGroup[] }>({
    queryKey: ['family', 'groups'],
    queryFn: () => api.get('/family/groups/me'),
  })
  const groups = groupsData?.groups ?? []
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)

  const groupId = activeGroupId ?? groups[0]?.id ?? null

  if (groupsLoading) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ color: 'var(--fg-quiet)', fontSize: 13 }}>Loading…</div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 60px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 500, color: 'var(--fg-primary)', letterSpacing: '-0.02em' }}>
          Shared with me
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-tertiary)' }}>
          Join or create a family group to see shared resources.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 60px' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 500, color: 'var(--fg-primary)', letterSpacing: '-0.02em' }}>
        Shared with me
      </h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--fg-tertiary)' }}>
        Copy anything shared by your family group into your own account.
      </p>

      {groups.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setActiveGroupId(g.id)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                background: (groupId === g.id) ? 'var(--sky-400)' : 'var(--glass-1)',
                border: `1px solid ${(groupId === g.id) ? 'var(--sky-400)' : 'var(--glass-edge)'}`,
                color: (groupId === g.id) ? 'var(--bg-1)' : 'var(--fg-primary)',
              }}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {groupId && <SharesFeed groupId={groupId} />}
      {groupId && <StatusDashboard groupId={groupId} />}
    </div>
  )
}

function SharesFeed({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ResourceType | 'all'>('all')

  const { data, isLoading } = useQuery<{ shares: GroupShare[] }>({
    queryKey: ['family', 'shares', groupId],
    queryFn: () => api.get(`/family/groups/${groupId}/shares`),
  })
  const shares = data?.shares ?? []

  const filtered = filter === 'all' ? shares : shares.filter((s) => s.resource_type === filter)

  const copyMutation = useMutation({
    mutationFn: (shareId: string) =>
      api.post<{ id: string; resource_type: string }>(`/family/shares/${shareId}/copy`),
    onSuccess: (_data, shareId) => {
      setCopiedId(shareId)
      setTimeout(() => setCopiedId(null), 2500)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (shareId: string) => api.delete(`/family/shares/${shareId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['family', 'shares', groupId] }),
  })

  if (isLoading) return <div style={{ color: 'var(--fg-quiet)', fontSize: 13 }}>Loading shared items…</div>

  return (
    <div style={{ marginBottom: 40 }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['all', 'recipe', 'favorite', 'plan'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
              background: filter === f ? 'var(--glass-2)' : 'transparent',
              border: `1px solid ${filter === f ? 'var(--glass-edge)' : 'transparent'}`,
              color: filter === f ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
            }}
          >
            {f === 'all' ? 'All' : TYPE_LABEL[f] + 's'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--fg-quiet)', fontSize: 13 }}>
          Nothing shared yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((share) => {
            const Icon = TYPE_ICON[share.resource_type]
            const isCopied = copiedId === share.id
            return (
              <div
                key={share.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  padding: '16px 18px',
                  background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', borderRadius: 16,
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: 'var(--glass-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} strokeWidth={1.5} color="var(--sky-300)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {TYPE_LABEL[share.resource_type]}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>·</span>
                    <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>from {share.shared_by_name}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: share.note ? 4 : 0 }}>
                    {share.resource_name ?? 'Unnamed'}
                  </div>
                  {share.note && (
                    <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>"{share.note}"</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 6 }}>
                    Shared {new Date(share.shared_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => copyMutation.mutate(share.id)}
                    disabled={copyMutation.isPending || isCopied}
                    className="btn btn-primary"
                    style={{ padding: '7px 12px', fontSize: 12, gap: 5, opacity: (copyMutation.isPending && !isCopied) ? 0.6 : 1 }}
                    title="Copy to my account"
                  >
                    {isCopied ? <Check size={12} /> : <Copy size={12} />}
                    {isCopied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => removeMutation.mutate(share.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', padding: '7px 8px' }}
                    title="Remove share"
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusDashboard({ groupId }: { groupId: string }) {
  const { data, isLoading } = useQuery<{ statuses: MemberStatus[] }>({
    queryKey: ['family', 'status', groupId],
    queryFn: () => api.get(`/family/groups/${groupId}/status`),
  })
  const statuses = data?.statuses ?? []

  if (isLoading || statuses.length === 0) return null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Users size={14} strokeWidth={1.5} color="var(--fg-tertiary)" />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-tertiary)' }}>Today's check-in</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {statuses.map((s) => (
          <div
            key={s.user_id}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 16px',
              background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', borderRadius: 12,
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--sun-200), var(--sky-300))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600, color: 'var(--bg-1)', flexShrink: 0,
            }}>
              {s.display_name.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--fg-primary)' }}>{s.display_name}</div>
            </div>
            {s.calories_pct != null ? (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>
                  {s.calories_pct}%
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>of goal</div>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
