import { useId } from 'react'

interface LumaLogoProps { size?: number }

export function LumaLogo({ size = 32 }: LumaLogoProps) {
  const baseId = useId()
  const splashHillMaskId = `${baseId}-splash-hill`

  return (
    <svg width={size} height={size} viewBox="445 272 390 270" fill="none" aria-hidden="true" role="img">
      <defs>
        <mask id={splashHillMaskId} maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width="1200" height="800" fill="white" />
          <path d="M450 530 Q550 530 590 405 Q640 280 690 405 Q740 530 830 530 V820 H440 Z" fill="black" />
        </mask>
      </defs>
      <circle cx="665" cy="365" r="66" fill="#fbbf24" mask={`url(#${splashHillMaskId})`} />
      <path
        d="M450 530 Q550 530 590 405 Q640 280 690 405 Q740 530 830 530"
        stroke="#0ea5e9"
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
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
