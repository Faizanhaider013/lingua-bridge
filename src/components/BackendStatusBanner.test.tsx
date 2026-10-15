import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BackendStatusBanner } from './BackendStatusBanner'

afterEach(() => cleanup())

describe('BackendStatusBanner', () => {
  it('renders nothing while checking', () => {
    const { container } = render(<BackendStatusBanner status="checking" />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when online', () => {
    const { container } = render(<BackendStatusBanner status="online" />)
    expect(container.innerHTML).toBe('')
  })

  it('shows a clear, non-technical offline notice when offline', () => {
    render(<BackendStatusBanner status="offline" />)
    const banner = screen.getByRole('status')
    expect(banner.textContent).toMatch(/can’t be reached|resumes automatically/i)
    // No technical details / secrets leaked.
    expect(banner.textContent).not.toMatch(/localhost|http|8787|fetch|api/i)
  })
})
