// @ts-nocheck
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoadingSpinner from '../LoadingSpinner'

describe('LoadingSpinner', () => {
  it('renders a status role with visually-hidden loading text by default', () => {
    render(<LoadingSpinner />)
    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders the provided text instead of the default fallback', () => {
    render(<LoadingSpinner text="Fetching results..." />)
    expect(screen.getByText('Fetching results...')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('applies the size class matching the size prop', () => {
    const { container } = render(<LoadingSpinner size="lg" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('class')).toContain('h-8')
    expect(svg?.getAttribute('class')).toContain('w-8')
  })
})
