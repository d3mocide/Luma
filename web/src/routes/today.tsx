import { useQuery } from '@tanstack/react-query'
import { Sparkles, Flame, Heart, Activity, Moon, Check, Plus } from 'lucide-react'
import { api, TodayData } from '../lib/api'
import { fmtMinutes, fmt } from '../lib/format'
import ActivityRings from '../components/ui/ActivityRings'
import WeightChart from '../components/ui/WeightChart'
import SlopeChip from '../components/ui/SlopeChip'
import StreakStrip from '../components/ui/StreakStrip'

export default function TodayRoute() {
  const { data, isLoading, error } = useQuery<TodayData>({
    queryKey: ['today'],
    queryFn: () => api.get('/today'),
  })

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  if (isLoading) return <TodayShell><LoadingSkeleton/></TodayShell>
  if (error || !data) return <TodayShell><ErrorCard/></TodayShell>

  const adherence = data.adherence_yesterday
  const bio = data.biometrics_latest
  const rings: [number, number, number] = [
    (adherence?.calories?.pct ?? 0) / 100,
    (adherence?.sat_fat_g?.pct ?? 0) / 100,
    (adherence?.soluble_fiber_g?.pct ?? 0) / 100,
  ]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <TodayShell>

      {/* Desktop layout */}
      <div className="hidden md:block" style={{ padding: '32px 40px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Top bar */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div className="eyebrow">{dateLabel}</div>
            <h1 style={{
              margin: '6px 0 0',
              fontSize: 32, fontWeight: 400,
              letterSpacing: '-0.02em',
              color: 'var(--fg-primary)',
            }}>
              {greeting},{' '}
              <span className="serif-italic" style={{
                background: 'linear-gradient(120deg, #fde68a, #38bdf8)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>Operator</span>.
            </h1>
          </div>
        </header>

        {/* Hero row: weight + rings + streak */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
          {/* Weight card */}
          <div className="glass" style={{ padding: 28, position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: -40, right: -60, width: 280, height: 280,
              background: 'radial-gradient(circle, rgba(56,189,248,0.25), transparent 65%)',
              pointerEvents: 'none',
            }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <div className="eyebrow">Weight · 30d</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 10 }}>
                  <span className="num" style={{
                    fontSize: 64, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1,
                    color: 'var(--fg-primary)',
                  }}>{data.weight.latest_kg?.toFixed(1) ?? '—'}</span>
                  <span style={{ fontSize: 18, color: 'var(--fg-tertiary)' }}>kg</span>
                  {data.weight.target_kg && (
                    <span style={{ fontSize: 13, color: 'var(--fg-quiet)', marginLeft: 8 }}>
                      target <span className="num" style={{ color: 'var(--fg-tertiary)' }}>{data.weight.target_kg.toFixed(1)} kg</span>
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <SlopeChip label="7d" value={data.weight.trend_7d}/>
                  <SlopeChip label="28d" value={data.weight.trend_28d}/>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 18, marginLeft: -8, marginRight: -8 }}>
              <WeightChart data={[]} width={620} height={180}/>
            </div>
          </div>

          {/* Rings + streak */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="glass" style={{ padding: 24, display: 'flex', gap: 22, alignItems: 'center' }}>
              <div style={{ flexShrink: 0, position: 'relative' }}>
                <ActivityRings size={150} values={rings} thickness={11} gap={5}/>
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                }}>
                  <div className="num" style={{ fontSize: 22, fontWeight: 500, color: 'var(--fg-primary)' }}>
                    {rings.filter(r => r >= 0.9).length} / 3
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>on target</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="eyebrow">Yesterday</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  <RingLegend color="#38bdf8" label="Calories"
                    value={`${adherence?.calories?.logged ?? '—'} / ${adherence?.calories?.target ?? '—'}`}
                    pct={adherence?.calories?.pct ?? 0}/>
                  <RingLegend color="#fbbf24" label="Sat fat"
                    value={`${adherence?.sat_fat_g?.logged ?? '—'}g / ${adherence?.sat_fat_g?.target ?? '—'}g`}
                    pct={adherence?.sat_fat_g?.pct ?? 0} invert/>
                  <RingLegend color="#34d399" label="Fiber"
                    value={`${adherence?.soluble_fiber_g?.logged ?? '—'}g / ${adherence?.soluble_fiber_g?.target ?? '—'}g`}
                    pct={adherence?.soluble_fiber_g?.pct ?? 0}/>
                </div>
              </div>
            </div>

            {/* Streak */}
            <div className="glass" style={{ padding: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: -20, right: -20, width: 200, height: 200,
                background: 'radial-gradient(circle, rgba(251,191,36,0.15), transparent 65%)',
                pointerEvents: 'none',
              }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div className="eyebrow">Streak</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                    <Flame size={22} color="var(--sun-300)"/>
                    <span className="num" style={{ fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
                      {0}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>days on track</span>
                  </div>
                </div>
              </div>
              <StreakStrip days={0} ofMax={14}/>
            </div>
          </div>
        </div>

        {/* Second row: insight + plan */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20 }}>
          {/* Insight */}
          {data.active_insight ? (
            <div className="glass" style={{
              padding: 24, position: 'relative', overflow: 'hidden',
              background: 'linear-gradient(165deg, rgba(251,191,36,0.10), rgba(251,113,133,0.05))',
              borderColor: 'rgba(251,191,36,0.25)',
            }}>
              <div style={{
                position: 'absolute', top: 0, right: 0, width: 160, height: 160,
                background: 'radial-gradient(circle at top right, rgba(251,191,36,0.35), transparent 60%)',
                pointerEvents: 'none',
              }}/>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 10,
                  background: 'linear-gradient(180deg, rgba(251,191,36,0.3), rgba(251,191,36,0.15))',
                  border: '1px solid rgba(251,191,36,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--sun-300)',
                }}>
                  <Sparkles size={15}/>
                </div>
                <span className="eyebrow" style={{ color: 'var(--sun-300)' }}>
                  {data.active_insight.severity}
                </span>
              </div>
              <p style={{
                margin: 0, fontSize: 18, lineHeight: 1.45,
                fontFamily: 'var(--font-sans)', fontWeight: 400,
                letterSpacing: '-0.01em', color: 'var(--fg-primary)',
              }}>
                {data.active_insight.headline}
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button className="btn" style={{
                  padding: '8px 14px', fontSize: 13,
                  background: 'rgba(251,191,36,0.18)',
                  borderColor: 'rgba(251,191,36,0.4)',
                  color: 'var(--sun-200)',
                }}>
                  <Sparkles size={13}/> Ask Coach
                </button>
              </div>
            </div>
          ) : (
            <div className="glass" style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--fg-quiet)', fontSize: 14 }}>No insights yet.</p>
            </div>
          )}

          {/* Today's plan */}
          <div className="glass" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="eyebrow">Today's plan</div>
                <div style={{ fontSize: 14, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                  <span className="num" style={{ color: 'var(--fg-primary)' }}>
                    {data.plan_today.filter((m: any) => m.logged).length}
                  </span>{' '}of{' '}
                  <span className="num">{data.plan_today.length}</span> logged
                </div>
              </div>
            </div>
            {data.plan_today.length === 0 ? (
              <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>No plan yet — generate one in the Plan tab.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.plan_today.map((m: any, i: number) => (
                  <PlanRow key={i} meal={m}/>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Biometrics */}
        <div className="glass" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="eyebrow">Biometrics · last night</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <BioTile icon={<Heart size={13}/>} label="HRV" value={fmt(bio?.hrv_ms, 0)} unit="ms" color="#fb7185"/>
            <BioTile icon={<Activity size={13}/>} label="Resting HR" value={fmt(bio?.rhr_bpm, 0)} unit="bpm" color="#38bdf8"/>
            <BioTile icon={<Moon size={13}/>} label="Sleep" value={fmtMinutes(bio?.sleep_duration_min)} color="#a78bfa"/>
            <BioTile icon={<Sparkles size={13}/>} label="Sleep score" value={fmt(bio?.sleep_score, 0)} color="#fbbf24"/>
          </div>
        </div>
      </div>

      {/* Mobile layout */}
      <div
        className="md:hidden thin-scroll"
        style={{ padding: '4px 18px 110px', height: '100%', overflowY: 'auto' }}
      >
        {/* Greeting */}
        <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow">{dateLabel}</div>
            <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--fg-primary)' }}>
              {greeting},<br/>
              <span className="serif-italic" style={{
                background: 'linear-gradient(120deg, #fde68a, #38bdf8)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>Operator</span>.
            </h1>
          </div>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'linear-gradient(135deg, #38bdf8, #fbbf24)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: 13, color: '#06121d',
          }}>OP</div>
        </div>

        {/* Rings */}
        <div className="glass" style={{ padding: 20, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: -40, right: -40, width: 200, height: 200,
            background: 'radial-gradient(circle, rgba(56,189,248,0.25), transparent 65%)',
            pointerEvents: 'none',
          }}/>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="eyebrow">Yesterday</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ flexShrink: 0, position: 'relative' }}>
              <ActivityRings size={130} values={rings} thickness={10} gap={4}/>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
              }}>
                <div className="num" style={{ fontSize: 18, fontWeight: 500, color: 'var(--fg-primary)' }}>
                  {rings.filter(r => r >= 0.9).length} / 3
                </div>
                <div style={{ fontSize: 8, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>on target</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <RingLegend color="#38bdf8" label="Calories" value={`${adherence?.calories?.logged ?? '—'}`} pct={adherence?.calories?.pct ?? 0}/>
              <RingLegend color="#fbbf24" label="Sat fat" value={`${adherence?.sat_fat_g?.logged ?? '—'}g`} pct={adherence?.sat_fat_g?.pct ?? 0} invert/>
              <RingLegend color="#34d399" label="Fiber" value={`${adherence?.soluble_fiber_g?.logged ?? '—'}g`} pct={adherence?.soluble_fiber_g?.pct ?? 0}/>
            </div>
          </div>
        </div>

        {/* Weight */}
        <div className="glass" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="eyebrow">Weight</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                <span className="num" style={{ fontSize: 38, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--fg-primary)' }}>
                  {data.weight.latest_kg?.toFixed(1) ?? '—'}
                </span>
                <span style={{ fontSize: 14, color: 'var(--fg-tertiary)' }}>kg</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <SlopeChip label="7d" value={data.weight.trend_7d}/>
              <SlopeChip label="28d" value={data.weight.trend_28d}/>
            </div>
          </div>
        </div>

        {/* Insight */}
        {data.active_insight && (
          <div className="glass" style={{
            padding: 18, marginBottom: 14, position: 'relative', overflow: 'hidden',
            background: 'linear-gradient(165deg, rgba(251,191,36,0.10), rgba(251,113,133,0.05))',
            borderColor: 'rgba(251,191,36,0.25)',
          }}>
            <div style={{
              position: 'absolute', top: 0, right: 0, width: 120, height: 120,
              background: 'radial-gradient(circle at top right, rgba(251,191,36,0.3), transparent 60%)',
              pointerEvents: 'none',
            }}/>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9,
                background: 'rgba(251,191,36,0.18)',
                border: '1px solid rgba(251,191,36,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--sun-300)', flexShrink: 0,
              }}>
                <Sparkles size={13}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: 'var(--fg-primary)' }}>
                  {data.active_insight.headline}
                </p>
                <button className="btn" style={{
                  marginTop: 12, padding: '6px 12px', fontSize: 12,
                  background: 'rgba(251,191,36,0.15)',
                  borderColor: 'rgba(251,191,36,0.35)',
                  color: 'var(--sun-200)',
                }}>
                  <Sparkles size={11}/> Ask Coach
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Plan */}
        <div className="glass" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Today's plan</div>
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 3 }}>
                <span className="num" style={{ color: 'var(--fg-primary)' }}>
                  {data.plan_today.filter((m: any) => m.logged).length}
                </span>/<span className="num">{data.plan_today.length}</span>
              </div>
            </div>
          </div>
          {data.plan_today.length === 0 ? (
            <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>No plan — generate in Plan tab.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.plan_today.map((m: any, i: number) => (
                <PlanRow key={i} meal={m}/>
              ))}
            </div>
          )}
        </div>

        {/* Biometrics */}
        <div className="glass" style={{ padding: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Biometrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <BioTile icon={<Heart size={13}/>} label="HRV" value={fmt(bio?.hrv_ms, 0)} unit="ms" color="#fb7185"/>
            <BioTile icon={<Activity size={13}/>} label="RHR" value={fmt(bio?.rhr_bpm, 0)} unit="bpm" color="#38bdf8"/>
            <BioTile icon={<Moon size={13}/>} label="Sleep" value={fmtMinutes(bio?.sleep_duration_min)} color="#a78bfa"/>
            <BioTile icon={<Sparkles size={13}/>} label="Score" value={fmt(bio?.sleep_score, 0)} color="#fbbf24"/>
          </div>
        </div>
      </div>

    </TodayShell>
  )
}

function TodayShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  )
}

function RingLegend({ color, label, value, pct, invert }: {
  color: string; label: string; value: string; pct: number; invert?: boolean
}) {
  const good = invert ? pct <= 110 : pct >= 90 && pct <= 120
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, boxShadow: `0 0 8px ${color}80`, flexShrink: 0,
      }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{label}</div>
        <div className="num" style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{value}</div>
      </div>
      <span className="num" style={{
        fontSize: 13, fontWeight: 500,
        color: good ? 'var(--good)' : 'var(--warn)',
      }}>{pct}%</span>
    </div>
  )
}

const SLOT_COLORS: Record<string, string> = {
  breakfast: '#fbbf24',
  lunch: '#38bdf8',
  snack: '#34d399',
  dinner: '#a78bfa',
}

function PlanRow({ meal }: { meal: any }) {
  const color = SLOT_COLORS[meal.slot] || '#94a3b8'
  return (
    <div className="glass-inset" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 11,
        background: `linear-gradient(135deg, ${color}22, ${color}10)`,
        border: `1px solid ${color}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color, flexShrink: 0, fontSize: 16,
      }}>
        {meal.slot === 'breakfast' ? '☀' : meal.slot === 'lunch' ? '🐟' : meal.slot === 'snack' ? '🍎' : '🌿'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--fg-quiet)',
          fontFamily: 'var(--font-mono)',
        }}>{meal.slot}</div>
        <div style={{ fontSize: 14, color: 'var(--fg-primary)', marginTop: 2 }}>{meal.custom_name || meal.name}</div>
      </div>
      {meal.logged ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, color: 'var(--good)',
          padding: '4px 10px',
          background: 'rgba(52,211,153,0.12)',
          border: '1px solid rgba(52,211,153,0.25)',
          borderRadius: 999,
        }}>
          <Check size={11} strokeWidth={2.5}/> Logged
        </span>
      ) : (
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>
          <Plus size={11} strokeWidth={2}/> Log
        </button>
      )}
    </div>
  )
}

function BioTile({ icon, label, value, unit, color }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; color: string
}) {
  return (
    <div className="glass-inset" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ color }}>{icon}</div>
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num" style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>{unit}</span>}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {[200, 120, 120].map((h, i) => (
        <div key={i} style={{
          height: h, borderRadius: 20,
          background: 'var(--glass-1)',
          border: '1px solid var(--glass-edge)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}/>
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }`}</style>
    </div>
  )
}

function ErrorCard() {
  return (
    <div style={{ padding: 24 }}>
      <div className="glass" style={{
        padding: 20,
        background: 'rgba(251,113,133,0.08)',
        borderColor: 'rgba(251,113,133,0.2)',
      }}>
        <p style={{ color: 'var(--bad)', fontSize: 14, margin: 0 }}>Failed to load today's data.</p>
      </div>
    </div>
  )
}
