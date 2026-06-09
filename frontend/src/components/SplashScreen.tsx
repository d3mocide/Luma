export function SplashScreen() {
  return (
    <div
      className="luma-bg"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}
    >
      <img
        src="/assets/luma-glyph-dark.svg"
        width={52}
        height={52}
        alt=""
        style={{ animation: 'luma-splash-pulse 1.8s ease-in-out infinite' }}
      />
      <img
        src="/assets/luma-wordmark-dark.svg"
        height={22}
        alt="Luma"
        style={{ width: 'auto', opacity: 0.65 }}
      />
      <style>{`@keyframes luma-splash-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.95)}}`}</style>
    </div>
  )
}
