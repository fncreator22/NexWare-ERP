import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FooterCTA from '../components/FooterCTA'
import FeatureModal from '../components/FeatureModal'
import App from '../App'

describe('Tier 1: Footer Navigation & Sub-Page Modals', () => {
  it('E2E-T1-FOOT-01: 5-Column Footer Structure Render', () => {
    render(<FooterCTA />)
    expect(screen.getByText('Platform Modules')).toBeDefined()
    expect(screen.getByText('Resources & Tools')).toBeDefined()
    expect(screen.getByText('Corporate & Trust')).toBeDefined()
    expect(screen.getByText('Enterprise Support')).toBeDefined()
  })

  it('E2E-T1-FOOT-02: All Systems Operational Status Badge', () => {
    render(<FooterCTA />)
    expect(screen.getByText('All Systems Operational')).toBeDefined()
    expect(screen.getByText('SOC2 Certified')).toBeDefined()
    expect(screen.getByText('ISO 27001')).toBeDefined()
    expect(screen.getByText('HIPAA Ready')).toBeDefined()
  })

  it('E2E-T1-FOOT-03: Footer Sub-Page Modal Trigger (privacy)', () => {
    render(<App />)
    const privacyBtn = screen.getByRole('button', { name: 'Privacy Policy' })
    fireEvent.click(privacyBtn)
    
    expect(screen.getByText(/NexWare ERP Privacy & Data Sovereignty Policy/i)).toBeDefined()
  })

  it('E2E-T1-FOOT-04: Footer Sub-Page Modal Trigger (terms)', () => {
    render(<App />)
    const termsBtn = screen.getByRole('button', { name: 'Terms of Service' })
    fireEvent.click(termsBtn)
    
    expect(screen.getByText(/NexWare ERP Terms of Service & SLA Agreement/i)).toBeDefined()
  })

  it('E2E-T1-FOOT-05: FeatureModal Backdrop Dismissal', () => {
    render(<App />)
    const privacyBtn = screen.getByRole('button', { name: 'Privacy Policy' })
    fireEvent.click(privacyBtn)
    
    expect(screen.getByText(/NexWare ERP Privacy & Data Sovereignty Policy/i)).toBeDefined()
    
    const backdrop = screen.getByText(/NexWare ERP Privacy & Data Sovereignty Policy/i).closest('.fixed')
    if (backdrop) {
      fireEvent.click(backdrop)
    }
    
    expect(screen.queryByText(/NexWare ERP Privacy & Data Sovereignty Policy/i)).toBeNull()
  })

  it('E2E-T1-FOOT-06: FeatureModal "Open Module in ERP" Action Button', () => {
    const content = {
      title: 'Automated Multi-Tax Invoice Engine',
      category: 'Finance & Ledger',
      badge: '5% & 15% Tax Snapshots',
      description: 'Test description',
      highlights: ['Feature 1'],
      techSpecs: [{ label: 'Engine', value: 'MongoDB' }],
      appRoute: '/billing',
    }
    const handleClose = vi.fn()
    render(<FeatureModal content={content} onClose={handleClose} />)
    
    const openAppBtn = screen.getByRole('button', { name: /Open Module in ERP/i })
    fireEvent.click(openAppBtn)
    
    expect(window.location.href).toContain('/warehouse-erp/index.html#/billing')
  })
})
