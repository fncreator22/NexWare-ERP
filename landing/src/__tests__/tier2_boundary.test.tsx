import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FooterCTA from '../components/FooterCTA'
import Pricing from '../components/Pricing'
import SecurityFAQ from '../components/SecurityFAQ'
import SocialProof from '../components/SocialProof'
import FeatureGrid from '../components/FeatureGrid'
import HowItWorks from '../components/HowItWorks'
import FeatureModal from '../components/FeatureModal'

describe('Tier 2: Boundary & Corner Cases (18 Test Cases)', () => {
  it('E2E-T2-BND-01: ROI Calculator Minimum Range Boundary (20 Invoices)', () => {
    const { container } = render(<FooterCTA />)
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '20' } })

    expect(screen.getByText('20 Invoices / mo')).toBeDefined()
    expect(screen.getByText('16 Hrs / mo')).toBeDefined()
    expect(screen.getByText('$900')).toBeDefined()
  })

  it('E2E-T2-BND-02: ROI Calculator Maximum Range Boundary (1000 Invoices)', () => {
    const { container } = render(<FooterCTA />)
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '1000' } })

    expect(screen.getByText('1000 Invoices / mo')).toBeDefined()
    expect(screen.getByText('800 Hrs / mo')).toBeDefined()
    expect(screen.getByText('$45,000')).toBeDefined()
  })

  it('E2E-T2-BND-03: Headcount Seat Slider Minimum Boundary (5 Seats)', () => {
    const { container } = render(<Pricing />)
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '5' } })

    expect(screen.getByText('5 Active Seats')).toBeDefined()
    expect(screen.getByText('$159')).toBeDefined()
  })

  it('E2E-T2-BND-04: Headcount Seat Slider Base Threshold Boundary (50 Seats)', () => {
    const { container } = render(<Pricing />)
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '50' } })

    expect(screen.getByText('50 Active Seats')).toBeDefined()
    expect(screen.getByText('$159')).toBeDefined()
  })

  it('E2E-T2-BND-05: Headcount Seat Slider Scaling Trigger Boundary (51 Seats)', () => {
    const { container } = render(<Pricing />)
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '51' } })

    expect(screen.getByText('51 Active Seats')).toBeDefined()
    expect(screen.getByText('$160')).toBeDefined()
  })

  it('E2E-T2-BND-06: Headcount Seat Slider Maximum Boundary (200 Seats)', () => {
    const { container } = render(<Pricing />)
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '200' } })

    expect(screen.getByText('200 Active Seats')).toBeDefined()
    expect(screen.getByText('$278')).toBeDefined()
  })

  it('E2E-T2-BND-07: Currency Rate Conversion - GBP (0.78 Exchange Rate)', () => {
    render(<Pricing />)
    const gbpBtn = screen.getByRole('button', { name: 'GBP (£)' })
    fireEvent.click(gbpBtn)

    expect(screen.getByText('£30')).toBeDefined()
    expect(screen.getByText('£124')).toBeDefined()
    expect(screen.getByText('£311')).toBeDefined()
  })

  it('E2E-T2-BND-08: Currency Rate Conversion - EUR (0.92 Exchange Rate)', () => {
    render(<Pricing />)
    const eurBtn = screen.getByRole('button', { name: 'EUR (€)' })
    fireEvent.click(eurBtn)

    expect(screen.getByText('€36')).toBeDefined()
    expect(screen.getByText('€146')).toBeDefined()
    expect(screen.getByText('€367')).toBeDefined()
  })

  it('E2E-T2-BND-09: Accordion Single-Active Exclusive Expansion', () => {
    render(<SecurityFAQ />)
    expect(screen.getByText(/AES-256 & TLS 1.3/i)).toBeDefined()

    const samlHeader = screen.getByText(/How do we configure role-based access control/i)
    fireEvent.click(samlHeader)

    expect(screen.getByText(/Administrators can assign users to 5 distinct permission tiers/i)).toBeDefined()
    expect(screen.queryByText(/Encrypted at rest via AES-256 bit keys/i)).toBeNull()
  })

  it('E2E-T2-BND-10: Accordion Self-Collapse (Toggle to Null)', () => {
    render(<SecurityFAQ />)
    const defaultHeader = screen.getByText(/How is data encrypted at rest and in transit/i)
    fireEvent.click(defaultHeader)

    expect(screen.queryByText(/AES-256 bit encryption/i)).toBeNull()
  })

  it('E2E-T2-BND-11: FAQ Search Query Empty Results Fallback UI', () => {
    render(<SecurityFAQ />)
    const searchInput = screen.getByPlaceholderText(/Search security questions/i)
    fireEvent.change(searchInput, { target: { value: 'xyz999invalid' } })

    expect(screen.getByText(/No security questions found matching "xyz999invalid"/i)).toBeDefined()
  })

  it('E2E-T2-BND-12: FAQ Search Query Reset via Clear Button', () => {
    render(<SecurityFAQ />)
    const searchInput = screen.getByPlaceholderText(/Search security questions/i)
    fireEvent.change(searchInput, { target: { value: 'xyz999invalid' } })

    const clearBtn = screen.getByRole('button', { name: 'Clear' })
    fireEvent.click(clearBtn)

    expect(screen.getByText(/How is data encrypted at rest and in transit/i)).toBeDefined()
  })

  it('E2E-T2-BND-13: Case Study Slider Underflow Wrapping (0 -> 2)', () => {
    const { container } = render(<SocialProof />)
    expect(screen.getByText(/Marcus Vance/i)).toBeDefined()

    const prevBtn = container.querySelector('button[aria-label="Previous case study"]')!
    fireEvent.click(prevBtn)

    expect(screen.getByText(/David Chen/i)).toBeDefined()
  })

  it('E2E-T2-BND-14: Case Study Slider Overflow Wrapping (2 -> 0)', () => {
    const { container } = render(<SocialProof />)
    const nextBtn = container.querySelector('button[aria-label="Next case study"]')!

    fireEvent.click(nextBtn)
    fireEvent.click(nextBtn)
    fireEvent.click(nextBtn)

    expect(screen.getByText(/Marcus Vance/i)).toBeDefined()
  })

  it('E2E-T2-BND-15: Bento Grid Category Filter Dimming Effect', () => {
    render(<FeatureGrid />)
    const logisticsBtn = screen.getByRole('button', { name: /Logistics & Warehouses/i })
    fireEvent.click(logisticsBtn)

    const card1Title = screen.getByText('Automated Multi-Tax Invoice Engine').closest('.backdrop-blur-xl')
    expect(card1Title?.className).toContain('opacity-30')
  })

  it('E2E-T2-BND-16: Workflow Stepper Step Bounds (Step 4 -> Step 1 Loop)', () => {
    render(<HowItWorks />)
    const nextBtn = screen.getByRole('button', { name: /Next Step/i })

    fireEvent.click(nextBtn)
    fireEvent.click(nextBtn)
    fireEvent.click(nextBtn)
    fireEvent.click(nextBtn)

    expect(screen.getByText(/Active Onboarding Phase 1 of 4/i)).toBeDefined()
  })

  it('E2E-T2-BND-17: Modal Fallback Handling for Unrecognized Keys', () => {
    const handleClose = vi.fn()
    render(<FeatureModal content={null} onClose={handleClose} />)
    expect(screen.queryByText(/NexWare ERP/i)).toBeNull()
  })

  it('E2E-T2-BND-18: Modal Event Propagation Stop', () => {
    const handleClose = vi.fn()
    const content = {
      title: 'Modal Test',
      category: 'Test',
      badge: 'Badge',
      description: 'Desc',
      highlights: ['H1'],
      techSpecs: [{ label: 'L1', value: 'V1' }],
      appRoute: '/test',
    }
    const { container } = render(<FeatureModal content={content} onClose={handleClose} />)
    const modalBox = container.querySelector('.bg-\\[\\#0b0c24\\]')
    if (modalBox) {
      fireEvent.click(modalBox)
    }
    expect(handleClose).not.toHaveBeenCalled()
  })
})
