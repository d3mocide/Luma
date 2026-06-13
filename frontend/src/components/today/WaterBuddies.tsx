import type { BuddyId } from '../../lib/water-buddies'

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function FrogSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 64 48" aria-hidden="true">
      <g {...strokeProps}>
        <circle cx="21" cy="13" r="7" />
        <circle cx="43" cy="13" r="7" />
        <path d="M14.5 17.5 C9 22 8 32 13 38 C18 43 46 43 51 38 C56 32 55 22 49.5 17.5" />
        <path d="M23 31 Q32 38 41 31" />
        <path d="M16 42 Q14 45 10 44.5" />
        <path d="M48 42 Q50 45 54 44.5" />
      </g>
      <g className="water-buddy-eyes" fill="currentColor" stroke="none">
        <circle cx="21" cy="12.5" r="2.4" />
        <circle cx="43" cy="12.5" r="2.4" />
      </g>
    </svg>
  )
}

function CatSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 64 48" aria-hidden="true">
      <g {...strokeProps}>
        <path d="M19 16 L17 5 L27 11.5" />
        <path d="M45 16 L47 5 L37 11.5" />
        <path d="M22 12 C12 17 11 33 18 39 C25 45 39 45 46 39 C53 33 52 17 42 12" />
        <path d="M24 27 Q26.5 30 29 27" />
        <path d="M35 27 Q37.5 30 40 27" />
        <path d="M29.5 34 Q32 36 34.5 34" />
        <path d="M10 28 L18 29.5" />
        <path d="M10 34 L18 33.5" />
        <path d="M54 28 L46 29.5" />
        <path d="M54 34 L46 33.5" />
      </g>
    </svg>
  )
}

function DogSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 64 48" aria-hidden="true">
      <g {...strokeProps}>
        <path d="M22 10 C13 13 11 30 17 38 C23 45 41 45 47 38 C53 30 51 13 42 10 C36 8 28 8 22 10" />
        <path d="M20 11 C12 11 9 22 13 29" />
        <path d="M44 11 C52 11 55 22 51 29" />
        <path d="M32 31 Q32 35 28 35.5" />
        <path d="M32 31 Q32 35 36 35.5" />
        <path d="M30 38 Q32 41 34 38" />
      </g>
      <g fill="currentColor" stroke="none">
        <ellipse cx="32" cy="29" rx="3" ry="2.4" />
      </g>
      <g className="water-buddy-eyes" fill="currentColor" stroke="none">
        <circle cx="25" cy="22" r="2.2" />
        <circle cx="39" cy="22" r="2.2" />
      </g>
    </svg>
  )
}

function AxolotlSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 64 48" aria-hidden="true">
      <g {...strokeProps}>
        <path d="M22 14 C14 18 13 34 19 39 C25 44 39 44 45 39 C51 34 50 18 42 14 C36 11 28 11 22 14" />
        <path d="M17 18 Q9 14 7 8" />
        <path d="M15 24 Q7 23 4 19" />
        <path d="M16 31 Q9 32 5 30" />
        <path d="M47 18 Q55 14 57 8" />
        <path d="M49 24 Q57 23 60 19" />
        <path d="M48 31 Q55 32 59 30" />
        <path d="M26 32 Q32 37 38 32" />
      </g>
      <g className="water-buddy-eyes" fill="currentColor" stroke="none">
        <circle cx="25" cy="24" r="2.2" />
        <circle cx="39" cy="24" r="2.2" />
      </g>
    </svg>
  )
}

export function BuddySprite({ buddy, size = 52 }: { buddy: BuddyId; size?: number }) {
  switch (buddy) {
    case 'frog': return <FrogSvg size={size} />
    case 'cat': return <CatSvg size={size} />
    case 'dog': return <DogSvg size={size} />
    case 'axolotl': return <AxolotlSvg size={size} />
  }
}
