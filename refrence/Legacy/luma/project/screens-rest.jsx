// Luma — Plan, Trends, Coach screens

/* ── PLAN ──────────────────────────────────────────────────────────────── */

const SLOT_META = {
  breakfast: { icon: 'sparkles', color: '#fbbf24', label: 'Breakfast' },
  lunch:     { icon: 'fish',     color: '#38bdf8', label: 'Lunch' },
  snack:     { icon: 'apple',    color: '#34d399', label: 'Snack' },
  dinner:    { icon: 'leaf',     color: '#a78bfa', label: 'Dinner' },
};

function PlanDesktop() {
  const week = window.LumaMockData.week_plan;
  return (
    <div className="luma-bg" style={{ width: '100%', height: '100%', display: 'flex' }}>
      <DesktopSidebar active="plan"/>
      <main className="thin-scroll" style={{ flex: 1, padding: '32px 40px 40px', overflowY: 'auto' }}>

        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div className="eyebrow">Week of May 26 – Jun 1</div>
            <h1 style={{
              margin: '8px 0 6px', fontSize: 32, fontWeight: 400,
              letterSpacing: '-0.02em',
            }}>
              Your <span className="serif-italic" style={{
                background: 'linear-gradient(120deg, #fde68a, #38bdf8)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>heart-healthy</span> week.
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
              Tuned for LDL reduction · <span className="num">18g</span> soluble fiber / day · <span className="num">&lt;12g</span> saturated fat
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ padding: '10px 14px' }}>
              <Icon name="shuffle" size={15}/> Regenerate
            </button>
            <button className="btn btn-primary" style={{ padding: '10px 18px' }}>
              <Icon name="plus" size={14} stroke={2}/> Log a meal
            </button>
          </div>
        </header>

        {/* Macros summary */}
        <div className="glass" style={{ padding: 22, marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18 }}>
          <MacroBlock label="Avg calories" value="1875" unit="kcal/day" pct={97} color="#38bdf8"/>
          <MacroBlock label="Saturated fat" value="10.2" unit="g/day" pct={85} color="#fbbf24"/>
          <MacroBlock label="Soluble fiber" value="18.4" unit="g/day" pct={102} color="#34d399"/>
          <MacroBlock label="Omega-3" value="2.1" unit="g/day" pct={105} color="#fb7185"/>
          <MacroBlock label="Plants" value="38" unit="varieties" pct={127} color="#a78bfa"/>
        </div>

        {/* Week grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12 }}>
          {week.map((day, i) => {
            const today = i === 1; // mock: tuesday
            return (
              <div key={day.day} className="glass" style={{
                padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
                borderColor: today ? 'rgba(56,189,248,0.35)' : undefined,
                background: today ? 'linear-gradient(165deg, rgba(56,189,248,0.10), rgba(56,189,248,0.02))' : undefined,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <div className="eyebrow" style={{ color: today ? 'var(--sky-300)' : undefined }}>
                      {day.day}
                    </div>
                    <div className="num" style={{ fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em', marginTop: 2 }}>
                      {25 + i}
                    </div>
                  </div>
                  {today && (
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: 'var(--sky-400)',
                      boxShadow: '0 0 8px var(--sky-400)',
                    }}/>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {day.slots.map((s, j) => {
                    const m = SLOT_META[s.slot];
                    return (
                      <div key={j} className="glass-inset" style={{
                        padding: '8px 10px',
                        borderRadius: 10,
                        display: 'flex', flexDirection: 'column', gap: 4,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Icon name={m.icon} size={10} color={m.color}/>
                          <span style={{ fontSize: 9, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                            {s.slot}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--fg-secondary)', lineHeight: 1.3 }}>
                          {s.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Today highlight */}
        <div className="glass" style={{ marginTop: 24, padding: 24, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: -50, left: -50, width: 280, height: 280,
            background: 'radial-gradient(circle, rgba(56,189,248,0.15), transparent 65%)',
            pointerEvents: 'none',
          }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, position: 'relative' }}>
            <div>
              <div className="eyebrow">Tonight · Dinner</div>
              <h3 style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em' }}>
                Lentil dal with quinoa
              </h3>
            </div>
            <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }}>
              View recipe <Icon name="arrow-up-right" size={12}/>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, position: 'relative' }}>
            <Macro2 label="Calories" value="540" unit="kcal"/>
            <Macro2 label="Sat fat" value="2.1g" highlight="low" goodColor/>
            <Macro2 label="Fiber" value="14g" highlight="high" goodColor/>
            <Macro2 label="Protein" value="22g"/>
            <Macro2 label="Cook time" value="35m"/>
          </div>
        </div>
      </main>
    </div>
  );
}

function MacroBlock({ label, value, unit, pct, color }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: color, boxShadow: `0 0 6px ${color}80`,
        }}/>
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span className="num" style={{ fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em' }}>{value}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{unit}</span>
      </div>
      <div style={{ marginTop: 8, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`, height: '100%',
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          boxShadow: `0 0 8px ${color}80`,
        }}/>
      </div>
    </div>
  );
}

function Macro2({ label, value, highlight, goodColor }) {
  return (
    <div className="glass-inset" style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num" style={{
          fontSize: 18, fontWeight: 500,
          color: goodColor ? 'var(--good)' : 'var(--fg-primary)',
        }}>{value}</span>
        {highlight && <span style={{ fontSize: 10, color: 'var(--good)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{highlight}</span>}
      </div>
    </div>
  );
}

function PlanMobile() {
  const week = window.LumaMockData.week_plan;
  return (
    <div className="luma-bg" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <StatusBar/>
      <div className="thin-scroll" style={{ height: 'calc(100% - 44px)', overflowY: 'auto', padding: '4px 18px 110px' }}>
        <div style={{ marginBottom: 16 }}>
          <div className="eyebrow">May 26 – Jun 1</div>
          <h1 style={{
            margin: '4px 0 4px', fontSize: 24, fontWeight: 400,
            letterSpacing: '-0.02em', lineHeight: 1.15,
          }}>
            Your <span className="serif-italic" style={{
              background: 'linear-gradient(120deg, #fde68a, #38bdf8)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>heart-healthy</span> week.
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-tertiary)' }}>
            21 meals · LDL-tuned · <span className="num">18g</span> fiber/day
          </p>
        </div>

        {/* Days strip */}
        <div className="thin-scroll" style={{
          display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14,
          marginLeft: -18, marginRight: -18, padding: '0 18px 4px',
        }}>
          {week.map((d, i) => {
            const today = i === 1;
            return (
              <button key={d.day} style={{
                flex: '0 0 56px',
                padding: '10px 8px',
                borderRadius: 14,
                background: today ? 'linear-gradient(180deg, rgba(56,189,248,0.25), rgba(56,189,248,0.08))' : 'var(--glass-1)',
                border: today ? '1px solid rgba(56,189,248,0.4)' : '1px solid var(--glass-edge)',
                color: today ? 'var(--sky-200)' : 'var(--fg-tertiary)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                cursor: 'pointer',
              }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d.day}</span>
                <span className="num" style={{ fontSize: 18, fontWeight: 400 }}>{25 + i}</span>
              </button>
            );
          })}
        </div>

        {/* Today's meals */}
        <div className="eyebrow" style={{ marginBottom: 10 }}>Tuesday · today</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {week[1].slots.map((s, i) => {
            const m = SLOT_META[s.slot];
            return (
              <div key={i} className="glass" style={{
                padding: 16,
                display: 'flex', alignItems: 'center', gap: 14,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: `linear-gradient(135deg, ${m.color}22, ${m.color}08)`,
                  border: `1px solid ${m.color}33`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: m.color, flexShrink: 0,
                }}>
                  <Icon name={m.icon} size={18}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: 'var(--fg-quiet)',
                    fontFamily: 'var(--font-mono)',
                  }}>{s.slot}</div>
                  <div style={{ fontSize: 14, color: 'var(--fg-primary)', marginTop: 3, lineHeight: 1.3 }}>{s.name}</div>
                </div>
                <Icon name="chevron-right" size={16} color="var(--fg-quiet)"/>
              </div>
            );
          })}
        </div>

        {/* Weekly macros card */}
        <div className="glass" style={{ padding: 16, marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>This week · averages</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <MiniMacro label="Calories" value="1875" unit="kcal" color="#38bdf8"/>
            <MiniMacro label="Sat fat" value="10.2g" color="#fbbf24"/>
            <MiniMacro label="Fiber" value="18.4g" color="#34d399"/>
            <MiniMacro label="Plants" value="38" color="#a78bfa"/>
          </div>
        </div>
      </div>
      <MobileNav active="plan"/>
    </div>
  );
}

function MiniMacro({ label, value, unit, color }) {
  return (
    <div className="glass-inset" style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }}/>
        <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>{label}</span>
      </div>
      <div className="num" style={{ fontSize: 18, fontWeight: 400 }}>
        {value}
        {unit && <span style={{ fontSize: 10, color: 'var(--fg-quiet)', marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}

/* ── TRENDS ────────────────────────────────────────────────────────────── */

function TrendsDesktop() {
  const t = window.LumaMockData.trends;
  return (
    <div className="luma-bg" style={{ width: '100%', height: '100%', display: 'flex' }}>
      <DesktopSidebar active="trends"/>
      <main className="thin-scroll" style={{ flex: 1, padding: '32px 40px 40px', overflowY: 'auto' }}>

        <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="eyebrow">Trends</div>
            <h1 style={{ margin: '6px 0 6px', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em' }}>
              Ninety days of <span className="serif-italic" style={{
                background: 'linear-gradient(120deg, #fde68a, #38bdf8)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>quiet progress</span>.
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
              You're trending the right way. The body keeps score; you keep showing up.
            </p>
          </div>
          {/* Range toggle */}
          <div style={{
            display: 'flex',
            padding: 4,
            background: 'var(--glass-1)',
            border: '1px solid var(--glass-edge)',
            borderRadius: 999,
          }}>
            {['7d','30d','90d','1y'].map((r, i) => {
              const active = r === '90d';
              return (
                <button key={r} style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: active ? 'linear-gradient(180deg, #38bdf8, #0ea5e9)' : 'transparent',
                  border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  color: active ? '#06121d' : 'var(--fg-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  boxShadow: active ? '0 4px 14px -4px rgba(14,165,233,0.6)' : 'none',
                }}>{r}</button>
              );
            })}
          </div>
        </header>

        {/* Big weight */}
        <div className="glass" style={{ padding: 28, marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 60% 80% at 80% 20%, rgba(56,189,248,0.12), transparent 60%)',
            pointerEvents: 'none',
          }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div>
              <div className="eyebrow">Weight</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 8 }}>
                <span className="num" style={{ fontSize: 56, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1 }}>
                  {t.weight_kg[t.weight_kg.length-1].last.toFixed(1)}
                </span>
                <span style={{ fontSize: 18, color: 'var(--fg-tertiary)' }}>kg</span>
                <span style={{
                  fontSize: 13, color: 'var(--good)',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px',
                  background: 'rgba(52,211,153,0.10)',
                  border: '1px solid rgba(52,211,153,0.25)',
                  borderRadius: 999,
                  marginLeft: 8,
                }}>
                  <Icon name="trending-down" size={12}/>
                  <span className="num">−{(t.weight_kg[0].last - t.weight_kg[t.weight_kg.length-1].last).toFixed(1)} kg</span>
                  in 90d
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: 'var(--fg-tertiary)' }}>
              <Legend color="#38bdf8" label="Weight"/>
              <Legend color="#fbbf24" label="Target line"/>
            </div>
          </div>
          <div style={{ marginTop: 14, marginLeft: -8, marginRight: -8 }}>
            <WeightChart data={t.weight_kg} width={900} height={280}/>
          </div>
        </div>

        {/* 4-metric grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <BigMetric title="HRV" unit="ms" data={t.hrv_ms} color="#fb7185" icon="heart"
            insight="Trending up — sleep + active recovery showing."/>
          <BigMetric title="Resting heart rate" unit="bpm" data={t.rhr_bpm} color="#38bdf8" icon="activity"
            invert insight="Down 3 bpm since you started. Aerobic fitness is improving."/>
          <BigMetric title="Sleep duration" unit="h" data={t.sleep_duration_min.map(d => ({...d, last: d.last/60}))} color="#a78bfa" icon="moon"
            insight="More 7+ hour nights than not. Hold steady."/>
          <BigMetric title="Active calories" unit="kcal" data={t.active_kcal} color="#fbbf24" icon="flame"
            insight="Three 600+ days this month — your best yet."/>
        </div>
      </main>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}80` }}/>
      {label}
    </span>
  );
}

function BigMetric({ title, unit, data, color, icon, invert, insight }) {
  const last = data[data.length-1].last;
  const first = data[0].last;
  const delta = last - first;
  const good = invert ? delta < 0 : delta > 0;
  return (
    <div className="glass" style={{ padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 9,
            background: `${color}1f`, border: `1px solid ${color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color,
          }}>
            <Icon name={icon} size={14}/>
          </div>
          <span style={{ fontSize: 14, color: 'var(--fg-secondary)' }}>{title}</span>
        </div>
        <span className="num" style={{
          fontSize: 11, color: good ? 'var(--good)' : 'var(--bad)',
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '3px 8px',
          background: good ? 'rgba(52,211,153,0.10)' : 'rgba(251,113,133,0.10)',
          borderRadius: 999,
        }}>
          <Icon name={good ? 'trending-up' : 'trending-down'} size={10}/>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <span className="num" style={{ fontSize: 32, fontWeight: 300, letterSpacing: '-0.02em' }}>{last.toFixed(1)}</span>
        <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>{unit}</span>
      </div>
      <Spark data={data} w={420} h={56} color={color}/>
      <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
        {insight}
      </p>
    </div>
  );
}

/* ── COACH ─────────────────────────────────────────────────────────────── */

function CoachDesktop() {
  return (
    <div className="luma-bg" style={{ width: '100%', height: '100%', display: 'flex' }}>
      <DesktopSidebar active="coach"/>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* atmospheric glow */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(167,139,250,0.10), transparent 60%), radial-gradient(ellipse 40% 40% at 20% 0%, rgba(251,191,36,0.10), transparent 60%)',
          pointerEvents: 'none',
        }}/>

        <header style={{
          padding: '28px 40px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(167,139,250,0.3), rgba(56,189,248,0.2))',
              border: '1px solid rgba(167,139,250,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(167,139,250,0.2)',
            }}>
              <Icon name="sparkles" size={18} color="#c4b5fd"/>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>Coach</h1>
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--good)', boxShadow: '0 0 6px var(--good-glow)' }}/>
                Claude · grounded in your last 90 days
              </div>
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 12 }}>
            New thread
          </button>
        </header>

        {/* Messages */}
        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', position: 'relative' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

            <CoachIntro/>

            <Message from="user" text="Why did my weight stall last week?"/>

            <Message from="coach">
              <p style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.6 }}>
                You didn't stall — you <span style={{ color: 'var(--sun-300)' }}>plateaued near sodium-heavy meals</span>.
                Looking at your last seven days, two of your dinners were sheet-pan chicken with soy marinade —
                each pushed sodium <span className="num" style={{ color: 'var(--sun-300)' }}>~2.1g</span> over baseline.
              </p>
              <p style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.6, color: 'var(--fg-secondary)' }}>
                Water retention shows up as scale weight that has nothing to do with body composition.
                Your <span style={{ color: 'var(--good)' }}>28-day slope is still −0.18 kg/wk</span> — exactly on plan.
              </p>
              {/* inline data card */}
              <div className="glass-inset" style={{ padding: 16, marginBottom: 12 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Last 14 days</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div>
                    <div className="num" style={{ fontSize: 24, fontWeight: 400 }}>78.4 <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>kg</span></div>
                    <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>current</div>
                  </div>
                  <div>
                    <div className="num" style={{ fontSize: 24, fontWeight: 400, color: 'var(--good)' }}>−1.2 <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>kg</span></div>
                    <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>14d net</div>
                  </div>
                  <div>
                    <div className="num" style={{ fontSize: 24, fontWeight: 400 }}>−0.18 <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>kg/wk</span></div>
                    <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>28d slope</div>
                  </div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
                Want me to suggest two lower-sodium swaps for this week?
              </p>
            </Message>

            <Message from="user" text="Yes, please."/>

            <Message from="coach" typing/>
          </div>
        </div>

        {/* Composer */}
        <div style={{ padding: '20px 40px 28px', position: 'relative' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            {/* suggestion chips */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {[
                'Explain last night\'s HRV',
                'Plan for a long run tomorrow',
                'What\'s driving my LDL?',
                'Lower-sodium swaps',
              ].map((s, i) => (
                <button key={i} className="btn" style={{ padding: '6px 12px', fontSize: 12 }}>
                  <Icon name="sparkles" size={11} color="var(--sun-300)"/> {s}
                </button>
              ))}
            </div>
            <div className="glass-bright" style={{
              padding: '4px 4px 4px 18px',
              display: 'flex', alignItems: 'center', gap: 8,
              borderRadius: 18,
            }}>
              <input placeholder="Ask Coach…" style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 15,
                padding: '14px 0',
              }}/>
              <button className="btn btn-ghost" style={{ padding: 10 }}><Icon name="mic" size={16}/></button>
              <button className="btn btn-primary" style={{ padding: '10px 16px', borderRadius: 14 }}>
                <Icon name="send" size={14}/>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function CoachIntro() {
  return (
    <div style={{ textAlign: 'center', padding: '20px 0 4px' }}>
      <div style={{ display: 'inline-flex', marginBottom: 18 }}>
        <LumaLogo size={48}/>
      </div>
      <h2 style={{
        margin: 0, fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em',
      }}>
        <span className="serif-italic" style={{
          background: 'linear-gradient(120deg, #c4b5fd, #fde68a)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>Ask me anything</span> about your trends.
      </h2>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--fg-tertiary)' }}>
        I see your weight, sleep, biometrics, and meals. Privacy stays here — nothing leaves your server.
      </p>
    </div>
  );
}

function Message({ from, text, children, typing }) {
  if (from === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          padding: '12px 18px',
          maxWidth: 520,
          background: 'linear-gradient(165deg, rgba(56,189,248,0.20), rgba(56,189,248,0.10))',
          border: '1px solid rgba(56,189,248,0.30)',
          borderRadius: '20px 20px 4px 20px',
          fontSize: 15, lineHeight: 1.5,
        }}>
          {text}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(167,139,250,0.3), rgba(56,189,248,0.2))',
        border: '1px solid rgba(167,139,250,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon name="sparkles" size={14} color="#c4b5fd"/>
      </div>
      <div className="glass" style={{
        padding: 18,
        borderRadius: '4px 20px 20px 20px',
        maxWidth: 600,
        flex: 1,
      }}>
        {typing ? (
          <div style={{ display: 'flex', gap: 5, padding: '4px 0' }}>
            {[0,1,2].map(i => (
              <span key={i} style={{
                width: 7, height: 7, borderRadius: '50%',
                background: 'var(--fg-quiet)',
                animation: `coachPulse 1.4s ${i*0.2}s infinite`,
              }}/>
            ))}
            <style>{`@keyframes coachPulse { 0%, 60%, 100% { opacity: 0.3; transform: scale(0.85) } 30% { opacity: 1; transform: scale(1.1) } }`}</style>
          </div>
        ) : (children || <p style={{ margin: 0 }}>{text}</p>)}
      </div>
    </div>
  );
}

Object.assign(window, {
  PlanDesktop, PlanMobile, TrendsDesktop, CoachDesktop,
});
