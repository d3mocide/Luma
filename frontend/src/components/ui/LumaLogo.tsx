import { useUIStore } from '../../stores'

type LogoVariant = 'auto' | 'dark' | 'light' | 'mono-dark' | 'mono-light'

interface LumaLogoProps {
  size?: number
  variant?: LogoVariant
  title?: string
}

function resolveGlyphVariant(theme: 'dark' | 'light', variant: LogoVariant) {
  if (variant !== 'auto') return variant
  return theme === 'light' ? 'light' : 'dark'
}

function resolveWordmarkVariant(theme: 'dark' | 'light', variant: LogoVariant) {
  if (variant === 'dark' || variant === 'light') return variant
  if (variant === 'mono-dark') return 'dark'
  if (variant === 'mono-light') return 'light'
  return theme === 'light' ? 'light' : 'dark'
}

export function LumaLogo({ size = 32, variant = 'auto', title = 'Luma logo' }: LumaLogoProps) {
  const theme = useUIStore((s) => s.theme)
  const glyphVariant = resolveGlyphVariant(theme, variant)
  const src = `/assets/luma-glyph-${glyphVariant}.svg`

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={title}
      style={{ display: 'block' }}
      draggable={false}
    />
  )
}

export function LumaWordmark({ size = 32, variant = 'auto', title = 'Luma wordmark' }: LumaLogoProps) {
  const theme = useUIStore((s) => s.theme)
  const wordmarkVariant = resolveWordmarkVariant(theme, variant)
  const src = `/assets/luma-wordmark-${wordmarkVariant}.svg`

  return (
    <img
      src={src}
      height={size}
      alt={title}
      style={{ display: 'block', width: 'auto' }}
      draggable={false}
    />
  )
}
