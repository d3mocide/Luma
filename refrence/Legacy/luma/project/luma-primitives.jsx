// Luma shared primitives — glassy atmospheric redesign

// Logo: a luminous crescent + dot
const LumaLogo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <defs>
      <radialGradient id="lumaGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fde68a" stopOpacity="1"/>
        <stop offset="55%" stopColor="#38bdf8" stopOpacity="1"/>
        <stop offset="100%" stopColor="#0ea5e9" stopOpacity="1"/>
      </radialGradient>
      <radialGradient id="lumaGlowSoft" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fde68a" stopOpacity="0.4"/>
        <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="16" cy="16" r="15" fill="url(#lumaGlowSoft)"/>
    <path
      d="M16 4 a12 12 0 1 0 0 24 a8 8 0 1 1 0 -24 z"
      fill="url(#lumaGlow)"
    />
  </svg>
);

const LumaWordmark = ({ size = 32 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <LumaLogo size={size} />
    <span className="luma-wordmark" style={{ fontSize: size * 0.6 }}>luma</span>
  </div>
);

// Animated trio of rings (calories / sat-fat / fiber)
function ActivityRings({ size = 200, values = [0.96, 0.83, 1.10], thickness = 14, gap = 6, animate = true }) {
  const center = size / 2;
  const colors = [
    { from: '#38bdf8', to: '#0ea5e9', glow: 'rgba(56,189,248,0.5)' },  // sky
    { from: '#fde68a', to: '#fbbf24', glow: 'rgba(251,191,36,0.5)' },  // sun
    { from: '#86efac', to: '#34d399', glow: 'rgba(52,211,153,0.5)' },  // emerald
  ];
  const radii = values.map((_, i) => center - thickness/2 - i * (thickness + gap));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring-svg">
      <defs>
        {colors.map((c, i) => (
          <linearGradient key={i} id={`ring-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c.from} />
            <stop offset="100%" stopColor={c.to} />
          </linearGradient>
        ))}
        <filter id="ring-glow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {values.map((v, i) => {
        const r = radii[i];
        const c = 2 * Math.PI * r;
        const pct = Math.min(v, 1.0);
        return (
          <g key={i}>
            <circle cx={center} cy={center} r={r}
              fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
            <circle cx={center} cy={center} r={r}
              fill="none"
              stroke={`url(#ring-${i})`}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct)}
              filter="url(#ring-glow)"
              style={animate ? { animation: `ringDraw-${i} 1.6s cubic-bezier(.2,.7,.2,1) both` } : {}}
            />
          </g>
        );
      })}
      <style>{`
        @keyframes ringDraw-0 { from { stroke-dashoffset: ${2*Math.PI*radii[0]} } }
        @keyframes ringDraw-1 { from { stroke-dashoffset: ${2*Math.PI*radii[1]} } }
        @keyframes ringDraw-2 { from { stroke-dashoffset: ${2*Math.PI*radii[2]} } }
      `}</style>
    </svg>
  );
}

// Streak — row of day chips, with flame on the active streak
function StreakStrip({ days = 12, ofMax = 14 }) {
  // last 14 days, last `days` are filled
  const dots = Array.from({ length: ofMax }, (_, i) => i < days);
  const labels = ['M','T','W','T','F','S','S','M','T','W','T','F','S','S'];
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {dots.map((on, i) => (
        <div key={i} style={{
          flex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <div style={{
            width: '100%',
            aspectRatio: '1 / 1.4',
            borderRadius: 8,
            background: on
              ? `linear-gradient(180deg, rgba(251,191,36,${0.3 + (i/ofMax)*0.5}), rgba(251,113,133,${0.2 + (i/ofMax)*0.4}))`
              : 'rgba(255,255,255,0.04)',
            border: on ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(255,255,255,0.06)',
            boxShadow: on ? `0 0 ${4 + (i/ofMax)*16}px rgba(251,191,36,${0.15 + (i/ofMax)*0.3})` : 'none',
          }}/>
          <span style={{
            fontSize: 9,
            color: on ? 'var(--fg-secondary)' : 'var(--fg-faint)',
            fontFamily: 'var(--font-mono)',
          }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// Weight area chart
function WeightChart({ data, width = 600, height = 220, showAxis = true }) {
  if (!data || !data.length) return null;
  const padL = 40, padR = 16, padT = 12, padB = showAxis ? 28 : 8;
  const w = width, h = height;
  const xs = data.map((_, i) => padL + (i / (data.length - 1)) * (w - padL - padR));
  const ys_raw = data.map(d => d.last);
  const lo = Math.min(...ys_raw), hi = Math.max(...ys_raw);
  const pad = (hi - lo) * 0.15 || 1;
  const yMin = lo - pad, yMax = hi + pad;
  const ys = ys_raw.map(v => padT + (1 - (v - yMin) / (yMax - yMin)) * (h - padT - padB));

  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) {
    const px = (xs[i-1] + xs[i]) / 2;
    d += ` Q ${px} ${ys[i-1]}, ${xs[i]} ${ys[i]}`;
  }
  const area = d + ` L ${xs[xs.length-1]} ${h - padB} L ${xs[0]} ${h - padB} Z`;

  // y axis labels
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const v = yMin + (i / (yTicks - 1)) * (yMax - yMin);
    const y = padT + (1 - (v - yMin) / (yMax - yMin)) * (h - padT - padB);
    return { v: v.toFixed(1), y };
  });

  // last point pulse
  const lastX = xs[xs.length - 1], lastY = ys[ys.length - 1];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="wchart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(56,189,248,0.45)"/>
          <stop offset="60%" stopColor="rgba(56,189,248,0.10)"/>
          <stop offset="100%" stopColor="rgba(56,189,248,0)"/>
        </linearGradient>
        <linearGradient id="wchart-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7dd3fc"/>
          <stop offset="60%" stopColor="#38bdf8"/>
          <stop offset="100%" stopColor="#fbbf24"/>
        </linearGradient>
      </defs>
      {yLabels.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w-padR} y1={t.y} y2={t.y}
            stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4"/>
          <text x={padL-8} y={t.y+3} textAnchor="end"
            fontSize="10" fill="var(--fg-quiet)" fontFamily="var(--font-mono)">
            {t.v}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#wchart-fill)"/>
      <path d={d} fill="none" stroke="url(#wchart-stroke)" strokeWidth="2.5" strokeLinecap="round"/>
      {/* dot every 10 */}
      {xs.map((x, i) => i % 14 === 0 && (
        <circle key={i} cx={x} cy={ys[i]} r="2.5" fill="#38bdf8" opacity="0.5"/>
      ))}
      {/* last point */}
      <circle cx={lastX} cy={lastY} r="10" fill="rgba(251,191,36,0.18)"/>
      <circle cx={lastX} cy={lastY} r="5" fill="#fbbf24" stroke="#fef3c7" strokeWidth="1.5"/>
    </svg>
  );
}

// Mini sparkline
function Spark({ data, w = 120, h = 36, color = '#38bdf8' }) {
  if (!data || !data.length) return null;
  const xs = data.map((_, i) => (i / (data.length - 1)) * w);
  const ys_raw = data.map(d => typeof d === 'number' ? d : d.last);
  const lo = Math.min(...ys_raw), hi = Math.max(...ys_raw);
  const ys = ys_raw.map(v => h - ((v - lo) / (hi - lo || 1)) * (h - 4) - 2);
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) d += ` L ${xs[i]} ${ys[i]}`;
  const area = d + ` L ${xs[xs.length-1]} ${h} L 0 ${h} Z`;
  const gid = `spark-${Math.random().toString(36).slice(2,8)}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`}/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// Status bar (mobile)
function StatusBar({ time = '9:41', dark = true }) {
  return (
    <div className="status-bar">
      <span className="num">{time}</span>
      <div className="status-icons">
        {/* signal */}
        <svg width="18" height="11" viewBox="0 0 18 11" fill="none">
          {[2,5,8,11].map((h,i) => (
            <rect key={i} x={i*4.5} y={11-h} width="3" height={h} rx="0.5" fill="currentColor"/>
          ))}
        </svg>
        {/* wifi */}
        <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
          <path d="M8 10.5 L9.5 8.5 A2 2 0 0 0 6.5 8.5 Z" fill="currentColor"/>
          <path d="M3 5.5 A7 7 0 0 1 13 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <path d="M5.5 7.5 A4 4 0 0 1 10.5 7.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
        {/* battery */}
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity="0.5"/>
          <rect x="24" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.5"/>
          <rect x="2" y="2" width="18" height="8" rx="1.5" fill="currentColor"/>
        </svg>
      </div>
    </div>
  );
}

// Mobile bottom nav
function MobileNav({ active = 'today' }) {
  const items = [
    { id: 'today', label: 'Today', icon: 'circle-dot' },
    { id: 'plan', label: 'Plan', icon: 'utensils' },
    { id: 'log', label: '', icon: 'plus', isFab: true },
    { id: 'trends', label: 'Trends', icon: 'activity' },
    { id: 'coach', label: 'Coach', icon: 'sparkles' },
  ];
  return (
    <div className="mobile-nav-wrap" style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '10px 18px 28px',
      zIndex: 20,
    }}>
      <div className="glass-bright" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '8px 8px',
        borderRadius: 28,
        position: 'relative',
      }}>
        {items.map(item => {
          if (item.isFab) {
            return (
              <button key={item.id} className="mobile-fab" style={{
                width: 52, height: 52,
                borderRadius: '50%',
                background: 'linear-gradient(180deg, #fde68a, #fbbf24)',
                border: '1px solid rgba(251,191,36,0.6)',
                color: '#1a0e02',
                marginTop: -22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}>
                <Icon name="plus" size={22} stroke={2.5}/>
              </button>
            );
          }
          const isActive = item.id === active;
          return (
            <button key={item.id} style={{
              flex: 1, padding: '6px 4px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              color: isActive ? 'var(--sky-300)' : 'var(--fg-quiet)',
            }}>
              <Icon name={item.icon} size={20}/>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em' }}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Desktop sidebar
function DesktopSidebar({ active = 'today' }) {
  const items = [
    { id: 'today', label: 'Today', icon: 'circle-dot' },
    { id: 'plan', label: 'Plan', icon: 'utensils' },
    { id: 'trends', label: 'Trends', icon: 'activity' },
    { id: 'coach', label: 'Coach', icon: 'sparkles' },
  ];
  return (
    <aside style={{
      width: 240, flexShrink: 0,
      padding: '28px 18px 24px',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.02), transparent)',
    }}>
      <div style={{ padding: '0 8px 28px' }}>
        <LumaWordmark size={26}/>
      </div>
      <div style={{ padding: '0 8px', marginBottom: 14 }}>
        <div className="eyebrow" style={{ fontSize: 9 }}>Menu</div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(it => {
          const a = it.id === active;
          return (
            <a key={it.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px',
              borderRadius: 12,
              color: a ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
              background: a ? 'linear-gradient(90deg, rgba(56,189,248,0.18), rgba(56,189,248,0.04))' : 'transparent',
              border: a ? '1px solid rgba(56,189,248,0.2)' : '1px solid transparent',
              fontSize: 14, fontWeight: a ? 500 : 400,
              cursor: 'pointer',
              position: 'relative',
            }}>
              {a && <span style={{
                position: 'absolute', left: -18, top: '50%', transform: 'translateY(-50%)',
                width: 3, height: 18, borderRadius: 2,
                background: 'linear-gradient(180deg, #38bdf8, #fbbf24)',
                boxShadow: '0 0 12px rgba(56,189,248,0.6)',
              }}/>}
              <Icon name={it.icon} size={17}/>
              <span>{it.label}</span>
            </a>
          );
        })}
      </nav>
      <div style={{ flex: 1 }}/>
      {/* user chip */}
      <div className="glass" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #38bdf8, #fbbf24)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 600, fontSize: 13, color: '#06121d',
        }}>OP</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Operator</div>
          <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>self-hosted</div>
        </div>
        <Icon name="settings" size={15} color="var(--fg-quiet)"/>
      </div>
    </aside>
  );
}

// Lucide icon wrapper — uses inline SVG paths for the icons we need
const ICONS = {
  'circle-dot': <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></>,
  'utensils': <><path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></>,
  'activity': <><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>,
  'sparkles': <><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></>,
  'settings': <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2"/><circle cx="12" cy="12" r="3"/></>,
  'plus': <><path d="M5 12h14"/><path d="M12 5v14"/></>,
  'arrow-right': <><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>,
  'arrow-up-right': <><path d="M7 7h10v10"/><path d="M7 17 17 7"/></>,
  'trending-down': <><path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/></>,
  'trending-up': <><path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/></>,
  'flame': <><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></>,
  'mic': <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></>,
  'scan-line': <><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></>,
  'search': <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
  'send': <><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></>,
  'check': <><path d="M20 6 9 17l-5-5"/></>,
  'chevron-right': <><path d="m9 18 6-6-6-6"/></>,
  'chevron-down': <><path d="m6 9 6 6 6-6"/></>,
  'bell': <><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></>,
  'apple': <><path d="M12 7c0-2.5 2-4 3-4 .5 1.5 0 3-1 4-1 1-2 1-2 0z"/><path d="M12 22c-2 0-4-1.5-5-3.5C5.5 16 5 12.5 6 10s3-3 5-3c1 0 2 1 3 1s2-1 3-1c2 0 4 1 5 4-2 1-3 3-3 5 0 3 2 4 3 4.5-.5 1.5-2.5 2.5-4 2.5-1 0-2-.5-3-.5s-2 .5-3 .5z"/></>,
  'leaf': <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></>,
  'fish': <><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/></>,
  'moon': <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
  'heart': <><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></>,
  'shuffle': <><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></>,
  'lightbulb': <><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></>,
  'eye': <><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></>,
  'eye-off': <><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></>,
  'lock': <><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  'mail': <><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>,
  'wind': <><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></>,
  'droplet': <><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></>,
};

function Icon({ name, size = 18, color = 'currentColor', stroke = 1.5 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name] || <circle cx="12" cy="12" r="8"/>}
    </svg>
  );
}

// Slope chip
function SlopeChip({ label, value, unit = 'kg/wk' }) {
  const good = value < 0;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 12px',
      borderRadius: 999,
      background: good ? 'rgba(52,211,153,0.10)' : 'rgba(251,113,133,0.10)',
      border: `1px solid ${good ? 'rgba(52,211,153,0.25)' : 'rgba(251,113,133,0.25)'}`,
      fontSize: 12,
      color: good ? 'var(--good)' : 'var(--bad)',
    }}>
      <Icon name={good ? 'trending-down' : 'trending-up'} size={13}/>
      <span style={{ color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{label}</span>
      <span className="num" style={{ fontWeight: 500 }}>{sign}{Math.abs(value).toFixed(2)} {unit}</span>
    </div>
  );
}

Object.assign(window, {
  LumaLogo, LumaWordmark, ActivityRings, StreakStrip, WeightChart, Spark,
  StatusBar, MobileNav, DesktopSidebar, Icon, SlopeChip,
});
