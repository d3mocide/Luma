import { type ComponentType, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Mail, Trash2, LogOut, Share2, ChevronRight, Copy, Check, BookOpen, Heart, CalendarDays } from 'lucide-react'
import { api, FamilyGroup, FamilyGroupDetail, ResourceType, GroupShare, MemberStatus } from '../lib/api'

type View = 'list' | 'detail' | 'create' | 'accept'

export default function FamilyRoute() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const inviteToken = searchParams.get('token')

  const [view, setView] = useState<View>(inviteToken ? 'accept' : 'list')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset to list when token param is cleared
  useEffect(() => {
    if (!inviteToken && view === 'accept') setView('list')
  }, [inviteToken, view])

  const { data: groupsData, isLoading } = useQuery<{ groups: FamilyGroup[] }>({
    queryKey: ['family', 'groups'],
    queryFn: () => api.get('/family/groups/me'),
  })
  const groups = groupsData?.groups ?? []

  const acceptMutation = useMutation({
    mutationFn: (token: string) =>
      api.post<{ group_id: string; group_name: string }>('/family/invitations/accept', { token }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['family', 'groups'] })
      setSearchParams({})
      setSelectedGroupId(data.group_id)
      setView('detail')
      setError(null)
    },
    onError: (err: Error) => setError(err.message),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      api.post<{ id: string; name: string }>('/family/groups', { name }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['family', 'groups'] })
      setSelectedGroupId(data.id)
      setView('detail')
      setError(null)
    },
    onError: (err: Error) => setError(err.message),
  })

  const activeTab = (searchParams.get('tab') as 'groups' | 'shared') || 'groups'

  const setActiveTab = (tab: 'groups' | 'shared') => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    })
  }

  if (view === 'accept' && inviteToken) {
    return (
      <AcceptView
        isPending={acceptMutation.isPending}
        error={error}
        onAccept={() => acceptMutation.mutate(inviteToken)}
        onDecline={() => { setSearchParams({}); setView('list') }}
      />
    )
  }

  if (view === 'create') {
    return (
      <CreateGroupView
        isPending={createMutation.isPending}
        error={error}
        onCreate={(name) => createMutation.mutate(name)}
        onCancel={() => { setView('list'); setError(null) }}
      />
    )
  }

  if (view === 'detail' && selectedGroupId) {
    return (
      <GroupDetailView
        groupId={selectedGroupId}
        onBack={() => setView('list')}
      />
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 500, color: 'var(--fg-primary)', letterSpacing: '-0.02em' }}>
            Family
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-tertiary)' }}>
            Share favorites, recipes, and meal plans with people you trust.
          </p>
        </div>
        {activeTab === 'groups' && (
          <button
            className="btn btn-primary"
            onClick={() => { setError(null); setView('create') }}
            style={{ gap: 6, padding: '9px 14px', fontSize: 13, flexShrink: 0 }}
          >
            <Plus size={14} strokeWidth={2.5} />
            <span className="btn-label-desktop">New group</span>
            <span className="btn-label-mobile">Group</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="settings-tabs" role="tablist" aria-label="Family sections" style={{ marginBottom: 24 }}>
        <button
          role="tab"
          aria-selected={activeTab === 'groups'}
          className="settings-tab"
          onClick={() => setActiveTab('groups')}
        >
          Groups
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'shared'}
          className="settings-tab"
          onClick={() => setActiveTab('shared')}
        >
          Shared with me
        </button>
      </div>

      {activeTab === 'groups' ? (
        isLoading ? (
          <div style={{ color: 'var(--fg-quiet)', fontSize: 13, padding: '20px 0' }}>Loading…</div>
        ) : groups.length === 0 ? (
          <EmptyState onCreate={() => setView('create')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => { setSelectedGroupId(g.id); setView('detail') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 18px',
                  background: 'var(--glass-1)',
                  border: '1px solid var(--glass-edge)',
                  borderRadius: 16,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--sky-300), var(--sky-500))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Users size={18} strokeWidth={1.5} color="var(--bg-1)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg-primary)' }}>{g.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>
                    {g.member_count} member{g.member_count !== 1 ? 's' : ''} · {g.role}
                  </div>
                </div>
                <ChevronRight size={16} strokeWidth={1.5} color="var(--fg-quiet)" />
              </button>
            ))}
          </div>
        )
      ) : (
        groups.length === 0 ? (
          <SharedEmptyState />
        ) : (
          <SharedTabContent groups={groups} />
        )
      )}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{
      padding: '48px 24px',
      background: 'var(--glass-1)',
      border: '1px solid var(--glass-edge)',
      borderRadius: 20,
      textAlign: 'center',
    }}>
      <Users size={36} strokeWidth={1} color="var(--fg-quiet)" style={{ marginBottom: 16 }} />
      <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 8 }}>
        No family groups yet
      </div>
      <div style={{ fontSize: 13, color: 'var(--fg-tertiary)', marginBottom: 24, lineHeight: 1.5 }}>
        Create a group and invite family or friends to share<br />favorites, recipes, and meal plans.
      </div>
      <button className="btn btn-primary" onClick={onCreate} style={{ gap: 6, justifyContent: 'center' }}>
        <Plus size={14} strokeWidth={2.5} /> Create your first group
      </button>
    </div>
  )
}

function AcceptView({
  isPending,
  error,
  onAccept,
  onDecline,
}: {
  isPending: boolean
  error: string | null
  onAccept: () => void
  onDecline: () => void
}) {
  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 20px' }}>
      <div style={{
        padding: '36px',
        background: 'var(--glass-1)',
        border: '1px solid var(--glass-edge)',
        borderRadius: 24,
        textAlign: 'center',
      }}>
        <Users size={40} strokeWidth={1} color="var(--sky-400)" style={{ marginBottom: 20 }} />
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 500, color: 'var(--fg-primary)' }}>
          Family group invitation
        </h2>
        <p style={{ margin: '0 0 28px', fontSize: 14, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
          You've been invited to join a family group on Luma. Accept to see shared recipes, favorites, and meal plans.
        </p>
        {error && (
          <div style={{
            padding: '10px 14px', marginBottom: 16,
            background: 'rgba(251,113,133,0.10)', border: '1px solid rgba(251,113,133,0.25)',
            borderRadius: 10, fontSize: 13, color: 'var(--bad)',
          }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn"
            onClick={onDecline}
            style={{ flex: 1, justifyContent: 'center', padding: '11px 0' }}
          >
            Decline
          </button>
          <button
            className="btn btn-primary"
            onClick={onAccept}
            disabled={isPending}
            style={{ flex: 2, justifyContent: 'center', padding: '11px 0', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? 'Joining…' : 'Accept invitation'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateGroupView({
  isPending,
  error,
  onCreate,
  onCancel,
}: {
  isPending: boolean
  error: string | null
  onCreate: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onCreate(trimmed)
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px 60px' }}>
      <button
        onClick={onCancel}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-tertiary)', fontSize: 13, padding: '0 0 20px', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        ← Back
      </button>
      <h2 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 500, color: 'var(--fg-primary)' }}>
        Create a group
      </h2>
      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Group name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Our Family, The Garcias"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 14px',
            background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
            borderRadius: 12, color: 'var(--fg-primary)',
            fontFamily: 'var(--font-sans)', fontSize: 15,
            outline: 'none',
          }}
        />
        {error && (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--bad)' }}>{error}</div>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!name.trim() || isPending}
          style={{ marginTop: 18, width: '100%', justifyContent: 'center', padding: '12px 0', opacity: (!name.trim() || isPending) ? 0.6 : 1 }}
        >
          {isPending ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </div>
  )
}

function GroupDetailView({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'members' | 'share'>('members')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState(false)
  const [shareType, setShareType] = useState<ResourceType>('recipe')
  const [shareId, setShareId] = useState('')
  const [shareNote, setShareNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: group, isLoading } = useQuery<FamilyGroupDetail>({
    queryKey: ['family', 'group', groupId],
    queryFn: () => api.get(`/family/groups/${groupId}`),
  })

  const inviteMutation = useMutation({
    mutationFn: (email: string) =>
      api.post<{ token: string; expires_at: string }>(`/family/groups/${groupId}/invite`, { email }),
    onSuccess: (data) => {
      setInviteToken(data.token)
      setInviteEmail('')
      setError(null)
    },
    onError: (err: Error) => setError(err.message),
  })

  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/family/groups/${groupId}/members/${memberId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['family', 'group', groupId] }),
    onError: (err: Error) => setError(err.message),
  })

  const shareMutation = useMutation({
    mutationFn: () =>
      api.post(`/family/groups/${groupId}/shares`, {
        resource_type: shareType,
        resource_id: shareId.trim(),
        note: shareNote.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family', 'shares', groupId] })
      setShareId('')
      setShareNote('')
      setError(null)
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/family/groups/${groupId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family', 'groups'] })
      onBack()
    },
    onError: (err: Error) => setError(err.message),
  })

  const copyAcceptLink = async () => {
    if (!inviteToken) return
    const url = `${window.location.origin}/family?token=${inviteToken}`
    await navigator.clipboard.writeText(url)
    setCopiedToken(true)
    setTimeout(() => setCopiedToken(false), 2000)
  }

  if (isLoading || !group) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ color: 'var(--fg-quiet)', fontSize: 13 }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 60px' }}>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-tertiary)', fontSize: 13, padding: '0 0 20px', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        ← All groups
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: 'var(--fg-primary)' }}>{group.name}</h2>
        <button
          className="btn"
          onClick={() => { if (confirm('Delete this group? This cannot be undone.')) deleteMutation.mutate() }}
          style={{ gap: 6, fontSize: 12, color: 'var(--bad)', borderColor: 'rgba(251,113,133,0.2)' }}
        >
          <Trash2 size={13} /> Delete group
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--glass-1)', padding: 4, borderRadius: 12, border: '1px solid var(--glass-edge)' }}>
        {(['members', 'share'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null) }}
            style={{
              flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', borderRadius: 8, fontSize: 13,
              background: tab === t ? 'var(--glass-2)' : 'transparent',
              color: tab === t ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
              fontWeight: tab === t ? 500 : 400,
            }}
          >
            {t === 'members' ? 'Members' : 'Share resource'}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 16,
          background: 'rgba(251,113,133,0.10)', border: '1px solid rgba(251,113,133,0.25)',
          borderRadius: 10, fontSize: 13, color: 'var(--bad)',
        }}>
          {error}
        </div>
      )}

      {tab === 'members' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Member list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.members.map((m) => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', borderRadius: 12,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--sun-200), var(--sky-300))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 600, color: 'var(--bg-1)',
                }}>
                  {m.display_name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>{m.display_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{m.email} · {m.role}</div>
                </div>
                {m.role !== 'owner' && (
                  <button
                    onClick={() => removeMutation.mutate(m.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', padding: 4 }}
                    title="Remove member"
                  >
                    <LogOut size={14} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Invite form */}
          <div style={{ padding: '18px', background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', borderRadius: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={14} /> Invite by email
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="friend@example.com"
                style={{
                  flex: 1, padding: '10px 12px',
                  background: 'var(--glass-0)', border: '1px solid var(--glass-edge)',
                  borderRadius: 10, color: 'var(--fg-primary)',
                  fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none',
                }}
              />
              <button
                className="btn btn-primary"
                onClick={() => inviteEmail.trim() && inviteMutation.mutate(inviteEmail.trim())}
                disabled={!inviteEmail.trim() || inviteMutation.isPending}
                style={{ padding: '10px 16px', opacity: (!inviteEmail.trim() || inviteMutation.isPending) ? 0.6 : 1 }}
              >
                {inviteMutation.isPending ? '…' : 'Invite'}
              </button>
            </div>

            {inviteToken && (
              <div style={{
                marginTop: 14, padding: '12px 14px',
                background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)',
                borderRadius: 10,
              }}>
                <div style={{ fontSize: 12, color: 'var(--sky-300)', marginBottom: 8 }}>
                  Invite sent! Share this link as backup:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ flex: 1, fontSize: 11, color: 'var(--fg-tertiary)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
                    {window.location.origin}/family?token={inviteToken}
                  </code>
                  <button
                    onClick={copyAcceptLink}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sky-300)', flexShrink: 0 }}
                    title="Copy link"
                  >
                    {copiedToken ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'share' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
            Share one of your recipes, favorites, or meal plans with the group. Members can copy it into their own account.
          </p>

          <div>
            <label style={{ fontSize: 11, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              Type
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['recipe', 'favorite', 'plan'] as ResourceType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setShareType(t)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                    background: shareType === t ? 'var(--sky-400)' : 'var(--glass-1)',
                    border: `1px solid ${shareType === t ? 'var(--sky-400)' : 'var(--glass-edge)'}`,
                    color: shareType === t ? 'var(--bg-1)' : 'var(--fg-primary)',
                    fontWeight: shareType === t ? 600 : 400,
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              Resource ID
            </label>
            <input
              value={shareId}
              onChange={(e) => setShareId(e.target.value)}
              placeholder="Paste the UUID from the URL or recipe/favorites page"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                borderRadius: 10, color: 'var(--fg-primary)',
                fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              Note (optional)
            </label>
            <input
              value={shareNote}
              onChange={(e) => setShareNote(e.target.value)}
              placeholder="e.g. Great for meal prep!"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                borderRadius: 10, color: 'var(--fg-primary)',
                fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none',
              }}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={() => shareMutation.mutate()}
            disabled={!shareId.trim() || shareMutation.isPending}
            style={{ gap: 6, justifyContent: 'center', opacity: (!shareId.trim() || shareMutation.isPending) ? 0.6 : 1 }}
          >
            <Share2 size={14} />
            {shareMutation.isPending ? 'Sharing…' : 'Share with group'}
          </button>

          {shareMutation.isSuccess && (
            <div style={{ fontSize: 13, color: 'var(--good)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={13} /> Shared successfully
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SharedEmptyState() {
  return (
    <div style={{
      padding: '48px 24px',
      background: 'var(--glass-1)',
      border: '1px solid var(--glass-edge)',
      borderRadius: 20,
      textAlign: 'center',
    }}>
      <Share2 size={36} strokeWidth={1} color="var(--fg-quiet)" style={{ marginBottom: 16 }} />
      <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 8 }}>
        No shared resources yet
      </div>
      <div style={{ fontSize: 13, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
        Join or create a family group to see shared recipes, favorites, and meal plans.
      </div>
    </div>
  )
}

const TYPE_ICON: Record<ResourceType, ComponentType<{ size?: number | string; strokeWidth?: number | string; color?: string }>> = {
  recipe: BookOpen,
  favorite: Heart,
  plan: CalendarDays,
}

const TYPE_LABEL: Record<ResourceType, string> = {
  recipe: 'Recipe',
  favorite: 'Favorite',
  plan: 'Meal plan',
}

function SharedTabContent({ groups }: { groups: FamilyGroup[] }) {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const groupId = activeGroupId ?? groups[0]?.id ?? null

  return (
    <div>
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
