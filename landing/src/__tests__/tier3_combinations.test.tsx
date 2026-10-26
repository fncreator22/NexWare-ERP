import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Pricing from '../components/Pricing'
import ModuleTour from '../components/ModuleTour'
import SecurityFAQ from '../components/SecurityFAQ'
import FeatureGrid from '../components/FeatureGrid'
import HowItWorks from '../components/HowItWorks'
import SocialProof from '../components/SocialProof'
import FooterCTA from '../components/FooterCTA'
import App from '../App'

describe('Tier 3: Cross-Feature Combinations (12 Test Cases)', () => {
  it('E2E-T3-CMB-01: Pricing Interaction: EUR + 75 Seats + Monthly Billing', () => {
    const { container } = render(<Pricing />)
    const eurBtn = screen.getByRole('button', { name: 'EUR (€)' })
    fireEvent.click(eurBtn)

    const monthlyBtn = screen.getByRole('button', { name: 'Monthly' })
    fireEvent.click(monthlyBtn)

    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '75' } })

    expect(screen.getByText('€197')).toBeDefined()
  })

  it('E2E-T3-CMB-02: Pricing Interaction: GBP + 150 Seats + Annual Billing', () => {
    const { container } = render(<Pricing />)
    const gbpBtn = screen.getByRole('button', { name: 'GBP (£)' })
    fireEvent.click(gbpBtn)

    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '150' } })

    expect(screen.getByText('£186')).toBeDefined()
  })

  it('E2E-T3-CMB-03: Sandbox Tour Persona Switch + Module Change + Hotspot Step Advance', () => {
    render(<ModuleTour />)
    const cfoBtn = screen.getByRole('button', { name: /Finance Director/i })
    fireEvent.click(cfoBtn)

    const auditTab = screen.getByRole('button', { name: /Compliance Audit/i })
    fireEvent.click(auditTab)

    const hotspotTarget = screen.getAllByText(/item_create/i)[1]
    fireEvent.click(hotspotTarget)
    expect(screen.getByText(/Hotspot Validated!/i)).toBeDefined()
  })

  it('E2E-T3-CMB-04: Security FAQ Topic Filter + Search Query Combination', () => {
    render(<SecurityFAQ />)
    const iamBtn = screen.getByRole('button', { name: /IAM & Access Control/i })
    fireEvent.click(iamBtn)

    const searchInput = screen.getByPlaceholderText(/Search security questions/i)
    fireEvent.change(searchInput, { target: { value: 'SAML' } })

    expect(screen.getByText(/Single Sign-On/i)).toBeDefined()
    expect(screen.queryByText(/5-tier RBAC permission model/i)).toBeNull()
  })

  it('E2E-T3-CMB-05: Bento Grid Filter + Route Status Toggle + Modal Open', () => {
    const handleOpenModal = vi.fn()
    render(<FeatureGrid onOpenModal={handleOpenModal} />)

    const logisticsFilter = screen.getByRole('button', { name: /Logistics & Warehouses/i })
    fireEvent.click(logisticsFilter)

    const routeBadge = screen.getByText(/In Transit/i)
    fireEvent.click(routeBadge)
    expect(screen.getByText(/Delivered/i)).toBeDefined()

    const logisticsLink = screen.getByRole('button', { name: /View Logistics Specs/i })
    fireEvent.click(logisticsLink)
    expect(handleOpenModal).toHaveBeenCalledWith('logistics')
  })

  it('E2E-T3-CMB-06: Workflow Stepper Progress Line + Spec Toggle + File Ingestion', () => {
    render(<HowItWorks />)
    const step1Dropzone = screen.getByText(/Click or Drag & Drop Data File/i)
    fireEvent.click(step1Dropzone)
    expect(screen.getByText(/Ingested 247 items/i)).toBeDefined()

    const specToggleBtn = screen.getByRole('button', { name: /View Technical Architecture Specs/i })
    fireEvent.click(specToggleBtn)
    expect(screen.getByText(/Bulk CSV & JSON parser/i)).toBeDefined()

    const step2Card = screen.getByText(/Step 2: Automate/i)
    fireEvent.click(step2Card)
    expect(screen.getByText(/Active Onboarding Phase 2 of 4/i)).toBeDefined()
  })

  it('E2E-T3-CMB-07: Navbar Dropdown Selection + App Route Handoff', () => {
    render(<App />)
    const modulesButton = screen.getAllByRole('button', { name: /Modules/i })[0]
    fireEvent.click(modulesButton)

    const financeOption = screen.getByText(/Financial & Tax Engine/i)
    fireEvent.click(financeOption)

    expect(screen.getAllByText(/Automated Multi-Tax Invoice Engine/i).length).toBeGreaterThan(0)

    const openAppBtn = screen.getByRole('button', { name: /Open Module in ERP/i })
    fireEvent.click(openAppBtn)

    expect(window.location.href).toContain('/warehouse-erp/index.html#/billing')
  })

  it('E2E-T3-CMB-08: Footer Sub-Page Link + Modal Launch + Modal Direct Redirection', () => {
    render(<App />)
    const sysArchBtn = screen.getByRole('button', { name: 'System Architecture Specs' })
    fireEvent.click(sysArchBtn)

    expect(screen.getByText(/NexWare ERP System Architecture Whitepaper/i)).toBeDefined()

    const openAppBtn = screen.getByRole('button', { name: /Open Module in ERP/i })
    fireEvent.click(openAppBtn)

    expect(window.location.href).toContain('/warehouse-erp/index.html#/dashboard')
  })

  it('E2E-T3-CMB-09: Social Proof Case Study Slide Change + Stats Verification + App Launch', () => {
    const { container } = render(<SocialProof />)
    const nextBtn = container.querySelector('button[aria-label="Next case study"]')!
    fireEvent.click(nextBtn)

    expect(screen.getByText(/Sarah Connor/i)).toBeDefined()
    expect(screen.getByText('0 Incidents')).toBeDefined()
    expect(screen.getByText('450+ Users')).toBeDefined()

    const readCaseStudyBtn = screen.getByRole('button', { name: /Read Full Case Study/i })
    fireEvent.click(readCaseStudyBtn)

    expect(window.location.href).toContain('/warehouse-erp/index.html#/workforce')
  })

  it('E2E-T3-CMB-10: Bento Card 3 Table View Toggle + Modal Trigger', () => {
    const handleOpenModal = vi.fn()
    render(<FeatureGrid onOpenModal={handleOpenModal} />)

    const kanbanBtn = screen.getByRole('button', { name: /Kanban Board/i })
    fireEvent.click(kanbanBtn)
    expect(screen.getByText('To Inspect (2)')).toBeDefined()

    const dataSpecsLink = screen.getByRole('button', { name: /View Dynamic Schema Specs/i })
    fireEvent.click(dataSpecsLink)

    expect(handleOpenModal).toHaveBeenCalledWith('data')
  })

  it('E2E-T3-CMB-11: ROI Calculator Slider Adjustment + Route Link Assertion', () => {
    const { container } = render(<FooterCTA />)
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '500' } })

    expect(screen.getByText('500 Invoices / mo')).toBeDefined()
    expect(screen.getByText('400 Hrs / mo')).toBeDefined()
    expect(screen.getByText('$22,500')).toBeDefined()

    const claimBtn = screen.getByRole('button', { name: /Calculate & Claim Savings in ERP/i })
    fireEvent.click(claimBtn)

    expect(window.location.href).toContain('/warehouse-erp/index.html#/signup')
  })

  it('E2E-T3-CMB-12: Pricing Matrix Row Expansion + Tooltip Hover + Plan Trial', () => {
    render(<Pricing />)
    const supplyChainCategory = screen.getByText('Supply Chain & Inventory')
    fireEvent.click(supplyChainCategory)

    const trialBtn = screen.getByRole('button', { name: /Start Enterprise Trial/i })
    fireEvent.click(trialBtn)

    expect(window.location.href).toContain('/warehouse-erp/index.html#/signup')
  })
})
