import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import FooterCTA from '../components/FooterCTA'

describe('Tier 1: Interactive ROI Engine', () => {
  it('E2E-T1-ROI-01: ROI Calculator Default State', () => {
    render(<FooterCTA />)
    expect(screen.getByText('150 Invoices / mo')).toBeDefined()
  })

  it('E2E-T1-ROI-02: Est. Time Saved Calculation (150 Invoices)', () => {
    render(<FooterCTA />)
    expect(screen.getByText('120 Hrs / mo')).toBeDefined()
  })

  it('E2E-T1-ROI-03: Est. Cost Saved Calculation (150 Invoices)', () => {
    render(<FooterCTA />)
    expect(screen.getByText('$6,750')).toBeDefined()
  })

  it('E2E-T1-ROI-04: Range Slider Value Adjustment (300 Invoices)', () => {
    const { container } = render(<FooterCTA />)
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    expect(slider).toBeDefined()
    
    fireEvent.change(slider, { target: { value: '300' } })
    
    expect(screen.getByText('300 Invoices / mo')).toBeDefined()
    expect(screen.getByText('240 Hrs / mo')).toBeDefined()
    expect(screen.getByText('$13,500')).toBeDefined()
  })

  it('E2E-T1-ROI-05: Calculate & Claim Savings CTA Redirection', () => {
    render(<FooterCTA />)
    const claimBtn = screen.getByRole('button', { name: /Calculate & Claim Savings in ERP/i })
    fireEvent.click(claimBtn)
    expect(window.location.href).toContain('/warehouse-erp/index.html#/signup')
  })

  it('E2E-T1-ROI-06: High-Trust Enterprise Onboarding Bullet Points', () => {
    render(<FooterCTA />)
    expect(screen.getByText(/Live Deployment/i)).toBeDefined()
    expect(screen.getByText(/Bank-Grade Security/i)).toBeDefined()
    expect(screen.getByText(/Zero Friction Migration/i)).toBeDefined()
  })
})
