import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SocialProof from '../components/SocialProof'

describe('Tier 1: Social Proof & Trust', () => {
  it('E2E-T1-SOC-01: Brand Logo Grid Render (8 Logos)', () => {
    render(<SocialProof />)
    const logos = [
      'GlobalParts Co.',
      'NorthTex Logistics',
      'DallasFlex Mfg.',
      'Apex Logistics',
      'IronWorks Ltd.',
      'SwiftDepot Global',
      'Vanguard Freight',
      'TransCorp ERP',
    ]
    logos.forEach((logo) => {
      expect(screen.getAllByText(logo).length).toBeGreaterThan(0)
    })
  })

  it('E2E-T1-SOC-02: Brand Logo Click App Redirection', () => {
    render(<SocialProof />)
    const firstLogo = screen.getAllByText('GlobalParts Co.')[0]
    fireEvent.click(firstLogo)
    expect(window.location.href).toContain('/warehouse-erp/index.html#/dashboard')
  })

  it('E2E-T1-SOC-03: Trust Metric Cards Display (4 Cards)', () => {
    render(<SocialProof />)
    expect(screen.getByText('99.99%')).toBeDefined()
    expect(screen.getByText('32%')).toBeDefined()
    expect(screen.getByText('$4B+')).toBeDefined()
    expect(screen.getByText('3x Faster')).toBeDefined()
  })

  it('E2E-T1-SOC-04: Trust Metric Info Tooltip Toggle', () => {
    const { container } = render(<SocialProof />)
    const infoButtons = container.querySelectorAll('button[aria-label="Toggle metric info"]')
    expect(infoButtons.length).toBeGreaterThan(0)

    // Toggle first tooltip
    fireEvent.click(infoButtons[0])
    expect(screen.getByText(/Guaranteed by 24\/7 automated health monitoring/i)).toBeDefined()

    // Toggle off
    fireEvent.click(infoButtons[0])
    expect(screen.queryByText(/Guaranteed by 24\/7 automated health monitoring/i)).toBeNull()
  })

  it('E2E-T1-SOC-05: Case Study Carousel Navigation (Next/Prev)', () => {
    const { container } = render(<SocialProof />)
    expect(screen.getByText(/Marcus Vance/i)).toBeDefined()

    // Click Next slide button
    const nextBtn = container.querySelector('button[aria-label="Next case study"]')!
    fireEvent.click(nextBtn)

    expect(screen.getByText(/Sarah Connor/i)).toBeDefined()
  })

  it('E2E-T1-SOC-06: Case Study App Route CTA Button', () => {
    render(<SocialProof />)
    const readCaseStudyBtn = screen.getByRole('button', { name: /Read Full Case Study/i })
    fireEvent.click(readCaseStudyBtn)
    expect(window.location.href).toContain('/warehouse-erp/index.html#/analytics')
  })
})
