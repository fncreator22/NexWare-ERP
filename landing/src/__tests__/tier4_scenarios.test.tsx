import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from '../App'

describe('Tier 4: Real-World Application Workload Scenarios (6 E2E Scenarios)', () => {
  it('E2E-T4-SCN-01: Full Buyer Evaluation & Trial Onboarding Journey', () => {
    const { container } = render(<App />)

    // 1. User arrives on Hero page and sees header and version badge
    expect(screen.getByText(/Enterprise ERP Engine v2.0/i)).toBeDefined()

    // 2. User clicks Hero "Start Free Trial" CTA
    const heroStartTrialBtn = screen.getAllByRole('button', { name: /Start Free Trial/i })[0]
    fireEvent.click(heroStartTrialBtn)
    expect(window.location.href).toContain('/warehouse-erp/index.html#/signup')

    // 3. User checks trust metric tooltip
    const infoButtons = container.querySelectorAll('button[aria-label="Toggle metric info"]')
    if (infoButtons.length > 0) {
      fireEvent.click(infoButtons[0])
      expect(screen.getByText(/Guaranteed by 24\/7 automated health monitoring/i)).toBeDefined()
    }

    // 4. User navigates to Feature Grid and selects Finance filter
    const financeFilter = screen.getByRole('button', { name: /Finance & Tax/i })
    fireEvent.click(financeFilter)

    // 5. User changes currency to EUR
    const eurBtns = screen.getAllByRole('button', { name: /EUR/i })
    fireEvent.click(eurBtns[0])
    expect(screen.getByText('€114,350')).toBeDefined()

    // 6. User moves to Sandbox Tour and selects CFO persona
    const cfoPersonaBtn = screen.getByRole('button', { name: /Finance Director/i })
    fireEvent.click(cfoPersonaBtn)
    expect(screen.getByText(/Instant PDF invoice generation with tax snapshotting/i)).toBeDefined()

    // 7. User adjusts ROI calculator slider to 400 invoices
    const roiSlider = container.querySelector('input[min="20"]') as HTMLInputElement
    fireEvent.change(roiSlider, { target: { value: '400' } })
    expect(screen.getByText('400 Invoices / mo')).toBeDefined()
  })

  it('E2E-T4-SCN-02: Compliance Officer Security Audit & Verification Flow', () => {
    const { container } = render(<App />)

    // 1. User filters FAQ to Audit category
    const auditFilter = screen.getByRole('button', { name: /Audit & Authentication/i })
    fireEvent.click(auditFilter)

    // 2. User searches for Argon2id
    const faqSearchInput = screen.getByPlaceholderText(/Search security questions/i)
    fireEvent.change(faqSearchInput, { target: { value: 'Argon2id' } })
    expect(screen.getByText(/Argon2id & Redis Limiter/i)).toBeDefined()

    // 3. User copies direct deep link
    const shareBtns = container.querySelectorAll('button[title="Copy direct anchor URL"]')
    if (shareBtns.length > 0) {
      fireEvent.click(shareBtns[0])
    }

    // 4. User opens Audit sub-page modal from footer
    const auditModalBtn = screen.getByRole('button', { name: 'Compliance Audit Trail Stream' })
    fireEvent.click(auditModalBtn)

    expect(screen.getByText(/Tamper-Evident Compliance Audit Log Stream/i)).toBeDefined()

    // 5. User clicks Open Module in ERP
    const openAppBtn = screen.getByRole('button', { name: /Open Module in ERP/i })
    fireEvent.click(openAppBtn)
    expect(window.location.href).toContain('/warehouse-erp/index.html#/audit')
  })

  it('E2E-T4-SCN-03: Operations Director Multi-Warehouse Logistics Onboarding Flow', () => {
    render(<App />)

    // 1. User searches SKU in Hero
    const searchInput = screen.getByPlaceholderText(/Search inventory, invoices, staff, warehouses.../i)
    fireEvent.change(searchInput, { target: { value: 'Houston Warehouse SKU-99' } })

    const searchForm = searchInput.closest('form')
    if (searchForm) {
      fireEvent.submit(searchForm)
    }
    expect(window.location.href).toContain('/warehouse-erp/index.html#/items')

    // 2. User filters Bento Grid to Logistics
    const logisticsFilter = screen.getByRole('button', { name: /Logistics & Warehouses/i })
    fireEvent.click(logisticsFilter)

    // 3. User toggles route telemetry badge
    const routeBadge = screen.getAllByText(/In Transit/i)[0]
    fireEvent.click(routeBadge)
    expect(screen.getAllByText(/Delivered/i).length).toBeGreaterThan(0)

    // 4. User simulates CSV file upload in Stepper
    const dropzone = screen.getByText(/Click or Drag & Drop Data File/i)
    fireEvent.click(dropzone)
    expect(screen.getByText(/Ingested 247 items/i)).toBeDefined()
  })

  it('E2E-T4-SCN-04: CFO Financial Engine & ROI Optimization Flow', () => {
    const { container } = render(<App />)

    // 1. User opens Navbar dropdown and clicks Finance
    const modulesBtn = screen.getAllByRole('button', { name: /Modules/i })[0]
    fireEvent.click(modulesBtn)

    const financeOption = screen.getByText(/Financial & Tax Engine/i)
    fireEvent.click(financeOption)

    expect(screen.getAllByText(/Automated Multi-Tax Invoice Engine/i).length).toBeGreaterThan(0)

    // 2. Close modal
    const closeBtn = screen.getByRole('button', { name: 'Close modal' })
    fireEvent.click(closeBtn)

    // 3. Adjust ROI calculator slider to 600 invoices
    const roiSlider = container.querySelector('input[min="20"]') as HTMLInputElement
    fireEvent.change(roiSlider, { target: { value: '600' } })

    expect(screen.getByText('600 Invoices / mo')).toBeDefined()
    expect(screen.getByText('480 Hrs / mo')).toBeDefined()
    expect(screen.getByText('$27,000')).toBeDefined()
  })

  it('E2E-T4-SCN-05: Mobile Navigation & Sub-Page Modal Drawer Flow', () => {
    render(<App />)

    // 1. Toggle mobile menu
    const hamburgerBtn = screen.getByRole('button', { name: /Toggle mobile menu/i })
    fireEvent.click(hamburgerBtn)

    // 2. Mobile menu links render
    expect(screen.getAllByRole('button', { name: /Log In/i }).length).toBeGreaterThan(0)

    // 3. Open Privacy Policy from footer
    const privacyBtn = screen.getByRole('button', { name: 'Privacy Policy' })
    fireEvent.click(privacyBtn)

    expect(screen.getByText(/NexWare ERP Privacy & Data Sovereignty Policy/i)).toBeDefined()

    // 4. Close modal
    const closeModalBtn = screen.getByRole('button', { name: 'Close modal' })
    fireEvent.click(closeModalBtn)

    expect(screen.queryByText(/NexWare ERP Privacy & Data Sovereignty Policy/i)).toBeNull()
  })

  it('E2E-T4-SCN-06: Corporate Governance, Legal & System SLA Audit Flow', () => {
    render(<App />)

    // 1. Verify status badge
    expect(screen.getByText('All Systems Operational')).toBeDefined()

    // 2. Open Terms of Service modal
    const termsBtn = screen.getByRole('button', { name: 'Terms of Service' })
    fireEvent.click(termsBtn)

    expect(screen.getByText(/NexWare ERP Terms of Service & SLA Agreement/i)).toBeDefined()
    expect(screen.getByText(/99.99% SLA Guarantee/i)).toBeDefined()

    // 3. Close modal
    const closeTermsBtn = screen.getByRole('button', { name: 'Close modal' })
    fireEvent.click(closeTermsBtn)

    // 4. Open SLA Agreement link
    const slaBtn = screen.getByRole('button', { name: 'SLA Agreement' })
    fireEvent.click(slaBtn)

    expect(screen.getByText(/NexWare ERP Platform Module/i)).toBeDefined()
  })
})
