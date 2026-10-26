import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FeatureGrid from '../components/FeatureGrid'

describe('Tier 1: Feature Grid', () => {
  it('E2E-T1-FG-01: Filter Tag Buttons Render (6 Categories)', () => {
    render(<FeatureGrid />)
    expect(screen.getByRole('button', { name: /All Ecosystem Modules/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Finance & Tax/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Logistics & Warehouses/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Data & Custom Tables/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Workforce & RBAC/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Automation & Audit/i })).toBeDefined()
  })

  it('E2E-T1-FG-02: Bento Card 1: Currency Switcher (USD/EUR/GBP)', () => {
    render(<FeatureGrid />)
    expect(screen.getByText('$124,700')).toBeDefined()

    const eurBtns = screen.getAllByRole('button', { name: 'EUR' })
    fireEvent.click(eurBtns[0])

    expect(screen.getByText('€114,350')).toBeDefined()
  })

  it('E2E-T1-FG-03: Bento Card 2: Route Telemetry Status Toggle', () => {
    render(<FeatureGrid />)
    const routeBadge = screen.getByText(/In Transit/i)
    expect(routeBadge).toBeDefined()

    fireEvent.click(routeBadge)
    expect(screen.getByText(/Delivered/i)).toBeDefined()
  })

  it('E2E-T1-FG-04: Bento Card 3: Dynamic Table View Switcher (Table vs Kanban)', () => {
    render(<FeatureGrid />)
    const kanbanBtn = screen.getByRole('button', { name: /Kanban Board/i })
    fireEvent.click(kanbanBtn)

    expect(screen.getByText(/To Inspect/i)).toBeDefined()
    expect(screen.getByText(/In Progress/i)).toBeDefined()
    expect(screen.getByText(/Completed/i)).toBeDefined()
  })

  it('E2E-T1-FG-05: Bento Card 4: Role Access Selector', () => {
    render(<FeatureGrid />)
    const managerBtn = screen.getByRole('button', { name: 'Manager' })
    fireEvent.click(managerBtn)

    expect(managerBtn.className).toContain('bg-[#6366f1]')
  })

  it('E2E-T1-FG-06: Feature Detail Modal Trigger Links', () => {
    const handleOpenModal = vi.fn()
    render(<FeatureGrid onOpenModal={handleOpenModal} />)

    const financeLink = screen.getByRole('button', { name: /View Full Finance Specs/i })
    fireEvent.click(financeLink)

    expect(handleOpenModal).toHaveBeenCalledWith('finance')
  })
})
