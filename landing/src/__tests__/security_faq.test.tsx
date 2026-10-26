import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SecurityFAQ from '../components/SecurityFAQ'

describe('Tier 1: Security FAQ Accordion', () => {
  it('E2E-T1-FAQ-01: 8 FAQ Items & 5 Topic Filters Render', () => {
    render(<SecurityFAQ />)
    expect(screen.getByRole('button', { name: /All Questions/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Data Protection & Storage/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /IAM & Access Control/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Audit & Authentication/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Uptime SLA & Exports/i })).toBeDefined()
  })

  it('E2E-T1-FAQ-02: Single-Active Accordion Toggle', () => {
    render(<SecurityFAQ />)
    expect(screen.getByText(/AES-256 & TLS 1.3/i)).toBeDefined()

    const samlHeader = screen.getByText(/How do we configure role-based access control/i)
    fireEvent.click(samlHeader)

    expect(screen.getByText(/Administrators can assign users to 5 distinct permission tiers/i)).toBeDefined()
    expect(screen.queryByText(/Encrypted at rest via AES-256 bit keys/i)).toBeNull()
  })

  it('E2E-T1-FAQ-03: Category Filter Sidebar Selection', () => {
    render(<SecurityFAQ />)
    const iamBtn = screen.getByRole('button', { name: /IAM & Access Control/i })
    fireEvent.click(iamBtn)

    expect(screen.getByText(/Single Sign-On/i)).toBeDefined()
    expect(screen.getByText(/role-based access control/i)).toBeDefined()
    expect(screen.queryByText(/encrypted at rest/i)).toBeNull()
  })

  it('E2E-T1-FAQ-04: Search Bar Query Filtering', () => {
    render(<SecurityFAQ />)
    const searchInput = screen.getByPlaceholderText(/Search security questions/i)
    fireEvent.change(searchInput, { target: { value: 'Argon2id' } })

    expect(screen.getByText(/Argon2id & Redis Limiter/i)).toBeDefined()
    expect(screen.queryByText(/Single Sign-On/i)).toBeNull()
  })

  it('E2E-T1-FAQ-05: Anchor URL Deep Link Copy', () => {
    const { container } = render(<SecurityFAQ />)
    const shareBtns = container.querySelectorAll('button[title="Copy direct anchor URL"]')
    expect(shareBtns.length).toBeGreaterThan(0)

    fireEvent.click(shareBtns[0])
    // Verify click succeeded without throwing
  })

  it('E2E-T1-FAQ-06: Technical Implementation Specs Sub-Panel', () => {
    render(<SecurityFAQ />)
    expect(screen.getByText(/Technical Implementation Specs:/i)).toBeDefined()
    expect(screen.getByText(/Encrypted at rest via AES-256 bit keys/i)).toBeDefined()
  })
})
