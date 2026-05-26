/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
        serif: ['Instrument Serif', 'Times New Roman', 'serif'],
      },
      colors: {
        // Sky — primary brand
        sky: {
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        // Sun — amber accent
        sun: {
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
        },
        // Aurora accents
        aurora: {
          mint: '#5eead4',
          pink: '#f472b6',
          violet: '#a78bfa',
        },
        // CSS variable aliases for theme-aware Tailwind utilities
        'fg-primary': 'var(--fg-primary)',
        'fg-secondary': 'var(--fg-secondary)',
        'fg-tertiary': 'var(--fg-tertiary)',
        'fg-quiet': 'var(--fg-quiet)',
        'fg-faint': 'var(--fg-faint)',
        'bg-luma-0': 'var(--bg-0)',
        'bg-luma-1': 'var(--bg-1)',
        'bg-luma-2': 'var(--bg-2)',
        'bg-luma-3': 'var(--bg-3)',
        // Semantic
        good: 'var(--good)',
        warn: 'var(--warn)',
        bad: 'var(--bad)',
        // Keep brand alias for backward compat
        brand: {
          50:  '#f0f9ff',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
      },
      borderRadius: {
        luma: '20px',
        'luma-sm': '10px',
        'luma-md': '14px',
        'luma-xl': '28px',
      },
    },
  },
  plugins: [],
}
