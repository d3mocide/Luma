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
        src="/assets/luma-wordmark-stacked-dark.svg"
        width={153}
        height={153}
        alt=""
        style={{ animation: 'luma-splash-pulse 1.8s ease-in-out infinite' }}
      />
      <style>{`@keyframes luma-splash-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.95)}}`}</style>
    </div>
  )
}
