interface LumaLogoProps { size?: number }

export function LumaLogo({ size = 32 }: LumaLogoProps) {
  return (
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
  )
}

export function LumaWordmark({ size = 32 }: LumaLogoProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LumaLogo size={size} />
      <span className="luma-wordmark" style={{ fontSize: size * 0.6 }}>luma</span>
    </div>
  )
}
