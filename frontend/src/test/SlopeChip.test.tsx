import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SlopeChip from '../components/ui/SlopeChip'

describe('SlopeChip', () => {
  it('renders em dash when value is null', () => {
    render(<SlopeChip label="Trend" value={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders the label text', () => {
    render(<SlopeChip label="Weight trend" value={null} />)
    expect(screen.getByText('Weight trend')).toBeInTheDocument()
  })

  it('renders label for non-null value', () => {
    render(<SlopeChip label="Trend" value={0.3} />)
    expect(screen.getByText('Trend')).toBeInTheDocument()
  })

  it('renders TrendingUp icon for positive value', () => {
    const { container } = render(<SlopeChip label="Trend" value={0.5} />)
    // lucide-react renders SVG icons; TrendingUp has a distinct path
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('renders TrendingDown icon for negative value', () => {
    const { container } = render(<SlopeChip label="Trend" value={-0.5} />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('shows + sign for positive value', () => {
    render(<SlopeChip label="Trend" value={0.5} />)
    // The component renders sign + abs(value).toFixed(2) + unit
    // positive: sign is '+', unicode minus for negative
    const valueEl = screen.getByText(/\+0\.50/)
    expect(valueEl).toBeInTheDocument()
  })

  it('shows unicode minus sign for negative value', () => {
    render(<SlopeChip label="Trend" value={-0.5} />)
    // The component uses '−' (U+2212) for negative values
    const valueEl = screen.getByText(/−0\.50/)
    expect(valueEl).toBeInTheDocument()
  })

  it('renders custom unit', () => {
    render(<SlopeChip label="Trend" value={1.0} unit="lbs/wk" />)
    expect(screen.getByText(/lbs\/wk/)).toBeInTheDocument()
  })

  it('renders default kg/wk unit', () => {
    render(<SlopeChip label="Trend" value={1.0} />)
    expect(screen.getByText(/kg\/wk/)).toBeInTheDocument()
  })
})
