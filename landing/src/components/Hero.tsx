import { useEffect, useRef, useState } from 'react'
import Navbar from './Navbar'
import DashboardMockup from './DashboardMockup'

interface HeroProps {
  onOpenModal?: (moduleKey: string) => void
}

/**
 * ScaledDashboard — renders mockup at 896px fixed design width & scales down
 */
function ScaledDashboard() {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const DESIGN_WIDTH = 896

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    const ro = new ResizeObserver(() => {
      const s = outer.offsetWidth / DESIGN_WIDTH
      setScale(s)
      outer.style.height = inner.offsetHeight * s + 'px'
    })
    ro.observe(outer)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={outerRef} className="relative w-full overflow-hidden">
      <div
        ref={innerRef}
        style={{
          width: DESIGN_WIDTH,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
        }}
      >
        <DashboardMockup />
      </div>
    </div>
  )
}

/* ─── Hero Component ─────────────────────────────────────── */
export default function Hero({ onOpenModal }: HeroProps) {
  const handleLaunchApp = (route: string) => {
    window.location.href = `/warehouse-erp/index.html#${route}`
  }

  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-[#070814] flex flex-col">
      {/* Subtle ambient indigo radial glow & dot-grid texture */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.15), transparent 70%)',
        }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none section-texture opacity-60" />

      {/* ── Navbar ──────────────────────────────────────── */}
      <Navbar onOpenModal={onOpenModal} />

      {/* ── HERO CONTENT ────────────────────────────────── */}
      <div className="flex-1 min-h-8 sm:min-h-12 lg:min-h-16 shrink-0" />

      <div className="relative z-10 flex flex-col items-center text-center px-5 max-w-5xl mx-auto">

        {/* Top Badge */}
        <div className="animate-fade-up inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[#c7d2fe] text-xs font-semibold uppercase tracking-wider mb-6">
          <span className="w-2 h-2 rounded-full bg-[#10b981] animate-ping" />
          Enterprise ERP Engine v2.0 · Live WebSocket Sync
        </div>

        {/* Headline */}
        <h1 className="text-white font-normal leading-[1.05] tracking-tight text-[40px] min-[400px]:text-[44px] sm:text-6xl lg:text-7xl xl:text-[80px]">
          <span className="block animate-fade-up">Run warehouses.</span>
          <span className="block animate-fade-up [animation-delay:100ms] text-transparent bg-clip-text bg-gradient-to-r from-white via-[#c7d2fe] to-[#818cf8]">
            In real-time.
          </span>
        </h1>

        {/* Search bar */}
        <form
          onSubmit={e => { e.preventDefault(); handleLaunchApp('/items') }}
          className="animate-fade-up [animation-delay:220ms] mt-6 sm:mt-8 w-full max-w-xl"
        >
          <div className="flex items-center gap-3 rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/25 pl-5 pr-1.5 py-1.5 shadow-2xl hover:bg-white/20 transition-all">
            <input
              type="text"
              placeholder="Search inventory, invoices, staff, warehouses..."
              className="flex-1 bg-transparent text-sm sm:text-base text-white placeholder-white/60 outline-none py-2"
            />
            <button
              type="submit"
              aria-label="Search ERP"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white text-gray-900 hover:scale-105 active:scale-95 transition-transform shrink-0 flex items-center justify-center font-bold"
            >
              <ArrowUpIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        </form>

        {/* Description */}
        <p className="animate-fade-up [animation-delay:340ms] mt-5 text-white/80 text-sm sm:text-base lg:text-lg leading-relaxed max-w-xl">
          Unify inventory, billing, and workforce across
          <br className="hidden sm:inline" />
          unlimited locations — with live WebSocket sync
          {' '}and{' '}
          <ZapIcon className="inline w-4 h-4 -mt-1 text-[#818cf8]" />{' '}
          5-tier role-based access control.
        </p>

        {/* CTA Buttons */}
        <div className="animate-fade-up [animation-delay:460ms] mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => handleLaunchApp('/signup')}
            className="bg-white text-gray-900 text-sm font-bold px-7 py-3 rounded-full hover:bg-white/90 hover:shadow-xl transition-all shadow-white/10"
          >
            Start Free Trial
          </button>

          <button
            onClick={() => handleLaunchApp('/login')}
            className="text-white text-sm font-semibold px-7 py-3 rounded-full ring-1 ring-white/30 hover:bg-white/10 backdrop-blur-md transition-colors"
          >
            Schedule a Demo
          </button>
        </div>
      </div>

      {/* ── DASHBOARD MOCKUP ────────────────────────────── */}
      <div className="flex-1 min-h-10 sm:min-h-12 lg:min-h-16 shrink-0" />

      <div className="animate-hero-rise [animation-delay:620ms] relative z-0 w-[92%] sm:w-[84%] lg:w-[72%] max-w-4xl mx-auto shrink-0 -mb-10 sm:-mb-20 lg:-mb-32">
        <ScaledDashboard />
      </div>
    </section>
  )
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}
