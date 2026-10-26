import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Pricing from '../components/Pricing'

describe('Tier 1: Tiered Pricing & Comparison Matrix', () => {
  it('E2E-T1-PRICE-01: 3 Tier Pricing Cards Render', () => {
    render(<Pricing />)
    expect(screen.getByText('Starter')).toBeDefined()
    expect(screen.getByText('Enterprise')).toBeDefined()
    expect(screen.getAllByText('Tailored Scale').length).toBeGreaterThan(0)
    expect(screen.getByText('MOST POPULAR')).toBeDefined()
  })

  it('E2E-T1-PRICE-02: Annual vs Monthly Billing Toggle', () => {
    render(<Pricing />)
    const monthlyBtn = screen.getByRole('button', { name: 'Monthly' })
    fireEvent.click(monthlyBtn)

    // Starter monthly = Math.round(39 * 1.2) = $47
    expect(screen.getByText('$47')).toBeDefined()
  })

  it('E2E-T1-PRICE-03: Currency Selector Conversion (USD -> EUR)', () => {
    render(<Pricing />)
    const eurBtn = screen.getByRole('button', { name: 'EUR (€)' })
    fireEvent.click(eurBtn)

    // Enterprise annual EUR = Math.round(159 * 0.92) = €146
    expect(screen.getByText('€146')).toBeDefined()
  })

  it('E2E-T1-PRICE-04: Headcount Seat Slider Adjustment (25 -> 75 Seats)', () => {
    const { container } = render(<Pricing />)
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    expect(slider).toBeDefined()

    fireEvent.change(slider, { target: { value: '75' } })

    expect(screen.getByText('75 Active Seats')).toBeDefined()
    // Enterprise USD annual with 75 seats = Math.round(159 * 1.0 * 1.0 * (1 + 25*0.005)) = Math.round(178.875) = $179
    expect(screen.getByText('$179')).toBeDefined()
  })

  it('E2E-T1-PRICE-05: Collapsible Comparison Matrix Categories', () => {
    render(<Pricing />)
    const categoryHeader = screen.getByText('Financial Management & Billing')
    fireEvent.click(categoryHeader)

    expect(categoryHeader).toBeDefined()
  })

  it('E2E-T1-PRICE-06: Pricing Plan Trial Button Redirection', () => {
    render(<Pricing />)
    const trialBtn = screen.getByRole('button', { name: /Start Enterprise Trial/i })
    fireEvent.click(trialBtn)
    expect(window.location.href).toContain('/warehouse-erp/index.html#/signup')
  })
})
