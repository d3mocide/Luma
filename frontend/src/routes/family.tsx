import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Mail, Trash2, LogOut, Share2, ChevronRight, Copy, Check } from 'lucide-react'
import { api, FamilyGroup, FamilyGroupDetail, ResourceType } from '../lib/api'

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 500, color: 'var(--fg-primary)', letterSpacing: '-0.02em' }}>
            Family
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-tertiary)' }}>
            Share favorites, recipes, and meal plans with people you trust.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setError(null); setView('create') }}
          style={{ gap: 6, padding: '9px 14px', fontSize: 13 }}
        >
          <Plus size={14} strokeWidth={2.5} />
          New group
        </button>
      </div>

      {isLoading ? (
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
