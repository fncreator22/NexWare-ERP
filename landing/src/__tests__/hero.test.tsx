import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Hero from '../components/Hero'
import Navbar from '../components/Navbar'

describe('Tier 1: Hero & Navigation', () => {
  it('E2E-T1-HERO-01: Navbar Brand Logo & Sub-badge Render', () => {
    render(<Navbar />)
    expect(screen.getByText('Nex')).toBeDefined()
    expect(screen.getByText('Ware')).toBeDefined()
    expect(screen.getByText('ERP')).toBeDefined()
  })

  it('E2E-T1-HERO-02: Desktop Navigation Links & Hash Anchors', () => {
    const { container } = render(<Navbar />)
    const links = container.querySelectorAll('a[href^="#"]')
    const hrefs = Array.from(links).map((link) => link.getAttribute('href'))

    expect(hrefs).toContain('#features')
    expect(hrefs).toContain('#interactive-tour')
    expect(hrefs).toContain('#how-it-works')
    expect(hrefs).toContain('#pricing')
    expect(hrefs).toContain('#security-faq')
  })

  it('E2E-T1-HERO-03: Modules Dropdown Toggle & Sub-Item Modals', () => {
    const handleOpenModal = vi.fn()
    render(<Navbar onOpenModal={handleOpenModal} />)

    const modulesButton = screen.getByRole('button', { name: /Modules/i })
    fireEvent.click(modulesButton)

    const financeOption = screen.getByText(/Financial & Tax Engine/i)
    expect(financeOption).toBeDefined()

    fireEvent.click(financeOption)
    expect(handleOpenModal).toHaveBeenCalledWith('finance')
  })

  it('E2E-T1-HERO-04: Hero Title & Version Badge Display', () => {
    render(<Hero />)
    expect(screen.getByText(/Enterprise ERP Engine v2.0/i)).toBeDefined()
    expect(screen.getByText(/Run warehouses./i)).toBeDefined()
    expect(screen.getByText(/In real-time./i)).toBeDefined()
  })

  it('E2E-T1-HERO-05: Hero Search Input Submission Redirection', () => {
    render(<Hero />)
    const searchInput = screen.getByPlaceholderText(/Search inventory, invoices, staff, warehouses.../i)
    fireEvent.change(searchInput, { target: { value: 'Safety Helmets' } })

    const searchForm = searchInput.closest('form')
    if (searchForm) {
      fireEvent.submit(searchForm)
    }

    expect(window.location.href).toContain('/warehouse-erp/index.html#/items')
  })

  it('E2E-T1-HERO-06: Hero Primary & Secondary CTA Redirection', () => {
    render(<Hero />)
    const startTrialBtn = screen.getAllByRole('button', { name: /Start Free Trial/i })[0]
    fireEvent.click(startTrialBtn)
    expect(window.location.href).toContain('/warehouse-erp/index.html#/signup')

    const scheduleDemoBtn = screen.getByRole('button', { name: /Schedule a Demo/i })
    fireEvent.click(scheduleDemoBtn)
    expect(window.location.href).toContain('/warehouse-erp/index.html#/login')
  })
})
