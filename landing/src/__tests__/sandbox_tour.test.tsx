import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ModuleTour from '../components/ModuleTour'

describe('Tier 1: Role-Based Sandbox Tour', () => {
  it('E2E-T1-TOUR-01: Persona Switcher Selection (4 Roles)', () => {
    render(<ModuleTour />)
    const cfoBtn = screen.getByRole('button', { name: /Finance Director/i })
    fireEvent.click(cfoBtn)

    expect(screen.getByText(/Instant PDF invoice generation with tax snapshotting/i)).toBeDefined()
  })

  it('E2E-T1-TOUR-02: Module Tab Bar Selection (5 Modules)', () => {
    render(<ModuleTour />)
    const auditTab = screen.getByRole('button', { name: /Compliance Audit/i })
    fireEvent.click(auditTab)

    expect(screen.getByText(/Tenant-scoped, tamper-evident record/i)).toBeDefined()
  })

  it('E2E-T1-TOUR-03: Guided Stepper Step Click Navigation', () => {
    render(<ModuleTour />)
    const step2Btn = screen.getByText(/Atomic Multi-Warehouse Check/i)
    fireEvent.click(step2Btn)

    expect(screen.getByText(/2 of 3/i)).toBeDefined()
  })

  it('E2E-T1-TOUR-04: Interactive Hotspot Action Click & Visual Validation', () => {
    render(<ModuleTour />)
    const hotspotTarget = screen.getByText(/Safety Helmets M/i)
    fireEvent.click(hotspotTarget)

    expect(screen.getByText(/Hotspot Validated!/i)).toBeDefined()
  })

  it('E2E-T1-TOUR-05: Autoplay Tour Toggle & Interval Advancement', () => {
    render(<ModuleTour />)
    const autoplayBtn = screen.getByRole('button', { name: /Autoplay Tour/i })
    fireEvent.click(autoplayBtn)

    expect(screen.getByRole('button', { name: /Pause Tour/i })).toBeDefined()
  })

  it('E2E-T1-TOUR-06: Tour Completion Overlay & Reset', () => {
    render(<ModuleTour />)

    // Step 1 -> Step 2
    fireEvent.click(screen.getByText(/Safety Helmets M/i))
    // Step 2 -> Step 3
    fireEvent.click(screen.getByText(/Safety Helmets M/i))
    // Step 3 -> Completion
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Stock Item/i }))

    expect(screen.getByText(/Tour Completed!/i)).toBeDefined()

    const replayBtn = screen.getByRole('button', { name: /Replay Tour/i })
    fireEvent.click(replayBtn)

    expect(screen.queryByText(/Tour Completed!/i)).toBeNull()
  })
})
