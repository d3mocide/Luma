export function TodayShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  )
}

export function LoadingSkeleton() {
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

export function ErrorCard() {
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
