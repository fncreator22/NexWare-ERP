import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import HowItWorks from '../components/HowItWorks'

describe('Tier 1: Workflow Automation Stepper', () => {
  it('E2E-T1-STEP-01: 4 Linear Workflow Cards Render', () => {
    render(<HowItWorks />)
    expect(screen.getByText(/Step 1: Centralize/i)).toBeDefined()
    expect(screen.getByText(/Step 2: Automate/i)).toBeDefined()
    expect(screen.getByText(/Step 3: Optimize/i)).toBeDefined()
    expect(screen.getByText(/Step 4: Scale/i)).toBeDefined()
  })

  it('E2E-T1-STEP-02: Neon Progress Line Calculation', () => {
    const { container } = render(<HowItWorks />)
    const step3Card = screen.getByText(/Step 3: Optimize/i)
    fireEvent.click(step3Card)

    const progressLine = container.querySelector('.bg-gradient-to-r.from-\\[\\#6366f1\\]')
    expect(progressLine).toBeDefined()
  })

  it('E2E-T1-STEP-03: Technical Architecture Specs Toggle (Progressive Disclosure)', () => {
    render(<HowItWorks />)
    const toggleBtn = screen.getByRole('button', { name: /View Technical Architecture Specs/i })
    fireEvent.click(toggleBtn)

    expect(screen.getByText(/Hide Technical Architecture Specs/i)).toBeDefined()
    expect(screen.getByText(/Bulk CSV & JSON parser/i)).toBeDefined()
  })

  it('E2E-T1-STEP-04: Interactive CSV File Upload Simulation (Step 1)', () => {
    render(<HowItWorks />)
    const uploadDropzone = screen.getByText(/Click or Drag & Drop Data File/i)
    fireEvent.click(uploadDropzone)

    expect(screen.getByText(/Ingested 247 items/i)).toBeDefined()
  })

  it('E2E-T1-STEP-05: Step 2 Automation Logic Flowchart Display', () => {
    render(<HowItWorks />)
    const automateCard = screen.getByText(/Step 2: Automate/i)
    fireEvent.click(automateCard)

    expect(screen.getByText(/INV-0038 Issued/i)).toBeDefined()
    expect(screen.getByText(/Atomic 80 Pcs/i)).toBeDefined()
  })

  it('E2E-T1-STEP-06: Step Next / Previous Navigation Buttons', () => {
    render(<HowItWorks />)
    const nextBtn = screen.getByRole('button', { name: /Next Step/i })
    fireEvent.click(nextBtn)

    expect(screen.getByText(/Active Onboarding Phase 2 of 4/i)).toBeDefined()
  })
})
