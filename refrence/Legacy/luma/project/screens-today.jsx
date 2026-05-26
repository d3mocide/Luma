// Luma — Today screen (the hero)
// Glassy atmospheric. Streak strip + animated rings + weight curve + insight + plan strip + biometrics.

function TodayDesktop() {
  const d = window.LumaMockData.today;
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  // Last 30d for the hero chart
  const series = window.LumaMockData.trends.weight_kg.slice(-30);

  return (
    <div className="luma-bg" style={{ width: '100%', height: '100%', display: 'flex' }}>
      <DesktopSidebar active="today"/>

      <main className="thin-scroll" style={{
        flex: 1, padding: '32px 40px 40px',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {/* Top bar */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div className="eyebrow">{dateLabel}</div>
            <h1 style={{
              margin: '6px 0 0',
              fontSize: 32, fontWeight: 400,
              letterSpacing: '-0.02em',
            }}>
              Good morning, <span className="serif-italic" style={{
                background: 'linear-gradient(120deg, #fde68a, #38bdf8)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>Operator</span>.
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn" style={{ padding: '10px 14px' }}>
              <Icon name="search" size={15}/> Search
            </button>
            <button className="btn" style={{ padding: '10px 14px' }}>
              <Icon name="bell" size={15}/>
            </button>
            <button className="btn btn-primary" style={{ padding: '10px 18px' }}>
              <Icon name="plus" size={15} stroke={2}/> Log meal
            </button>
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
                  }}>{d.weight.latest_kg.toFixed(1)}</span>
                  <span style={{ fontSize: 18, color: 'var(--fg-tertiary)' }}>kg</span>
                  <span style={{ fontSize: 13, color: 'var(--fg-quiet)', marginLeft: 8 }}>
                    target <span className="num" style={{ color: 'var(--fg-tertiary)' }}>{d.weight.target_kg.toFixed(1)} kg</span>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <SlopeChip label="7d" value={d.weight.trend_7d}/>
                  <SlopeChip label="28d" value={d.weight.trend_28d}/>
                </div>
              </div>
              <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12, color: 'var(--fg-tertiary)' }}>
                See trends <Icon name="arrow-up-right" size={13}/>
              </button>
            </div>
            <div style={{ marginTop: 18, marginLeft: -8, marginRight: -8 }}>
              <WeightChart data={series} width={620} height={180}/>
            </div>
            <p style={{
              fontSize: 13, color: 'var(--fg-tertiary)', lineHeight: 1.55,
              margin: '14px 0 0', maxWidth: 520,
            }}>
              <Icon name="sparkles" size={13} color="var(--sun-400)"/>{' '}
              You're <span style={{ color: 'var(--good)' }}>{Math.abs((d.weight.latest_kg - 82.4)).toFixed(1)} kg down</span> in 30 days —
              a steady pace your body will keep.
            </p>
          </div>

          {/* Rings + streak stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="glass" style={{
              padding: 24, display: 'flex', gap: 22, alignItems: 'center',
            }}>
              <div style={{ flexShrink: 0, position: 'relative' }}>
                <ActivityRings size={150} values={[0.97, 0.85, 1.10]} thickness={11} gap={5}/>
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column',
                }}>
                  <div className="num" style={{ fontSize: 22, fontWeight: 500 }}>3 / 3</div>
                  <div style={{ fontSize: 9, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>on target</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="eyebrow">Yesterday</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  <RingLegend color="#38bdf8" label="Calories" value="1842 / 1900" pct={97}/>
                  <RingLegend color="#fbbf24" label="Sat fat" value="14g / 12g" pct={117} invert/>
                  <RingLegend color="#34d399" label="Fiber" value="11g / 10g" pct={110}/>
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
                    <Icon name="flame" size={22} color="var(--sun-300)"/>
                    <span className="num" style={{ fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em' }}>12</span>
                    <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>days on track</span>
                  </div>
                </div>
                <span style={{
                  fontSize: 11, color: 'var(--sun-300)',
                  padding: '4px 10px',
                  background: 'rgba(251,191,36,0.10)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  borderRadius: 999,
                }}>Personal best</span>
              </div>
              <StreakStrip days={12} ofMax={14}/>
            </div>
          </div>
        </div>

        {/* Second row: insight + plan */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20 }}>
          {/* Insight */}
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
                <Icon name="lightbulb" size={15}/>
              </div>
              <span className="eyebrow" style={{ color: 'var(--sun-300)' }}>Gentle nudge</span>
            </div>
            <p style={{
              margin: 0, fontSize: 18, lineHeight: 1.45,
              fontFamily: 'var(--font-sans)', fontWeight: 400,
              letterSpacing: '-0.01em',
            }}>
              Saturated fat ran <span className="num" style={{ color: 'var(--sun-300)' }}>18%</span> over target this week.
              <span className="serif-italic" style={{ color: 'var(--fg-tertiary)' }}> Try swapping cheese in two lunches —</span>
              <span style={{ color: 'var(--fg-secondary)' }}> small change, real ripple.</span>
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="btn" style={{
                padding: '8px 14px', fontSize: 13,
                background: 'rgba(251,191,36,0.18)',
                borderColor: 'rgba(251,191,36,0.4)',
                color: 'var(--sun-200)',
              }}>
                <Icon name="sparkles" size={13}/>
                Ask Coach
              </button>
              <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }}>
                Dismiss
              </button>
            </div>
          </div>

          {/* Today's plan */}
          <div className="glass" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="eyebrow">Today's plan</div>
                <div style={{ fontSize: 14, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                  <span className="num" style={{ color: 'var(--fg-primary)' }}>2</span> of <span className="num">4</span> logged · <span style={{ color: 'var(--good)' }}>on pace</span>
                </div>
              </div>
              <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }}>
                <Icon name="shuffle" size={13}/> Swap
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.plan_today.map((m, i) => (
                <PlanRow key={i} meal={m}/>
              ))}
            </div>
          </div>
        </div>

        {/* Biometrics */}
        <div className="glass" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="eyebrow">Biometrics · last night</div>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>synced 6:42 AM</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <BioTile icon="heart" label="HRV" value="42" unit="ms" delta="+4" good
              spark={window.LumaMockData.trends.hrv_ms.slice(-14)} color="#fb7185"/>
            <BioTile icon="activity" label="Resting HR" value="58" unit="bpm" delta="−2" good
              spark={window.LumaMockData.trends.rhr_bpm.slice(-14)} color="#38bdf8"/>
            <BioTile icon="moon" label="Sleep" value="7h 24m" delta="+18m" good
              spark={window.LumaMockData.trends.sleep_duration_min.slice(-14)} color="#a78bfa"/>
            <BioTile icon="sparkles" label="Sleep score" value="82" delta="+6" good
              color="#fbbf24"/>
          </div>
        </div>
      </main>
    </div>
  );
}

function RingLegend({ color, label, value, pct, invert }) {
  const good = invert ? pct <= 110 : pct >= 90 && pct <= 110;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, boxShadow: `0 0 8px ${color}80`,
      }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div className="num" style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{value}</div>
      </div>
      <span className="num" style={{
        fontSize: 13, fontWeight: 500,
        color: good ? 'var(--good)' : 'var(--warn)',
      }}>{pct}%</span>
    </div>
  );
}

function PlanRow({ meal }) {
  const slotIcon = {
    breakfast: 'sparkles',
    lunch: 'fish',
    snack: 'apple',
    dinner: 'leaf',
  }[meal.slot] || 'utensils';
  const slotColor = {
    breakfast: '#fbbf24',
    lunch: '#38bdf8',
    snack: '#34d399',
    dinner: '#a78bfa',
  }[meal.slot] || '#94a3b8';

  return (
    <div className="glass-inset" style={{
      padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 11,
        background: `linear-gradient(135deg, ${slotColor}22, ${slotColor}10)`,
        border: `1px solid ${slotColor}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: slotColor, flexShrink: 0,
      }}>
        <Icon name={slotIcon} size={16}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--fg-quiet)',
          fontFamily: 'var(--font-mono)',
        }}>{meal.slot}</div>
        <div style={{ fontSize: 14, color: 'var(--fg-primary)', marginTop: 2 }}>{meal.name}</div>
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
          <Icon name="check" size={11} stroke={2.5}/> Logged
        </span>
      ) : (
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>
          <Icon name="plus" size={11} stroke={2}/> Log
        </button>
      )}
    </div>
  );
}

function BioTile({ icon, label, value, unit, delta, good, spark, color }) {
  return (
    <div className="glass-inset" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ color: color || 'var(--fg-tertiary)' }}>
          <Icon name={icon} size={13}/>
        </div>
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num" style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.02em' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>{unit}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span className="num" style={{
          fontSize: 11, color: good ? 'var(--good)' : 'var(--bad)',
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}>
          <Icon name={good ? 'trending-down' : 'trending-up'} size={10}/>
          {delta}
        </span>
        {spark && <Spark data={spark} w={70} h={22} color={color}/>}
      </div>
    </div>
  );
}

/* ── Mobile Today ──────────────────────────────────────────────────────── */

function TodayMobile() {
  const d = window.LumaMockData.today;
  const series = window.LumaMockData.trends.weight_kg.slice(-30);

  return (
    <div className="luma-bg" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <StatusBar/>
      <div className="thin-scroll" style={{
        height: 'calc(100% - 44px)',
        overflowY: 'auto',
        padding: '4px 18px 110px',
      }}>
        {/* Greeting */}
        <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow">Tuesday, May 26</div>
            <h1 style={{
              margin: '6px 0 0', fontSize: 26, fontWeight: 400,
              letterSpacing: '-0.02em', lineHeight: 1.15,
            }}>
              Good morning,<br/>
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

        {/* Hero rings + streak */}
        <div className="glass" style={{ padding: 20, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: -40, right: -40, width: 200, height: 200,
            background: 'radial-gradient(circle, rgba(56,189,248,0.25), transparent 65%)',
            pointerEvents: 'none',
          }}/>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 14,
          }}>
            <div className="eyebrow">Yesterday</div>
            <span style={{
              fontSize: 10, color: 'var(--sun-300)',
              padding: '3px 9px',
              background: 'rgba(251,191,36,0.10)',
              border: '1px solid rgba(251,191,36,0.25)',
              borderRadius: 999,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <Icon name="flame" size={10}/> 12 day streak
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ flexShrink: 0, position: 'relative' }}>
              <ActivityRings size={130} values={[0.97, 0.85, 1.10]} thickness={10} gap={4}/>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
              }}>
                <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>3 / 3</div>
                <div style={{ fontSize: 8, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>on target</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <RingLegend color="#38bdf8" label="Calories" value="1842" pct={97}/>
              <RingLegend color="#fbbf24" label="Sat fat" value="14g" pct={117} invert/>
              <RingLegend color="#34d399" label="Fiber" value="11g" pct={110}/>
            </div>
          </div>
        </div>

        {/* Weight strip */}
        <div className="glass" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="eyebrow">Weight</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                <span className="num" style={{ fontSize: 38, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {d.weight.latest_kg.toFixed(1)}
                </span>
                <span style={{ fontSize: 14, color: 'var(--fg-tertiary)' }}>kg</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <SlopeChip label="7d" value={d.weight.trend_7d}/>
              <SlopeChip label="28d" value={d.weight.trend_28d}/>
            </div>
          </div>
          <div style={{ marginTop: 10, marginLeft: -8, marginRight: -8 }}>
            <WeightChart data={series} width={320} height={100} showAxis={false}/>
          </div>
        </div>

        {/* Insight */}
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
              <Icon name="lightbulb" size={13}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
                Sat fat ran <span className="num" style={{ color: 'var(--sun-300)' }}>18%</span> over this week.
                <span className="serif-italic" style={{ color: 'var(--fg-tertiary)' }}> Try swapping cheese in two lunches.</span>
              </p>
              <button className="btn" style={{
                marginTop: 12,
                padding: '6px 12px', fontSize: 12,
                background: 'rgba(251,191,36,0.15)',
                borderColor: 'rgba(251,191,36,0.35)',
                color: 'var(--sun-200)',
              }}>
                <Icon name="sparkles" size={11}/> Ask Coach
              </button>
            </div>
          </div>
        </div>

        {/* Plan */}
        <div className="glass" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Today's plan</div>
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 3 }}>
                <span className="num" style={{ color: 'var(--fg-primary)' }}>2</span>/<span className="num">4</span> · on pace
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.plan_today.map((m, i) => (
              <PlanRow key={i} meal={m}/>
            ))}
          </div>
        </div>

        {/* Biometrics */}
        <div className="glass" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="eyebrow">Biometrics</div>
            <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>synced 6:42 AM</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <BioTile icon="heart" label="HRV" value="42" unit="ms" delta="+4" good color="#fb7185"/>
            <BioTile icon="activity" label="RHR" value="58" unit="bpm" delta="−2" good color="#38bdf8"/>
            <BioTile icon="moon" label="Sleep" value="7h 24m" delta="+18m" good color="#a78bfa"/>
            <BioTile icon="sparkles" label="Score" value="82" delta="+6" good color="#fbbf24"/>
          </div>
        </div>
      </div>
      <MobileNav active="today"/>
    </div>
  );
}

window.TodayDesktop = TodayDesktop;
window.TodayMobile = TodayMobile;
