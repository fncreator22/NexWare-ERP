import { useEffect, useRef, useState } from 'react'
import Navbar from './Navbar'
import DashboardMockup from './DashboardMockup'
import { ArrowUp, Zap, Search } from 'lucide-react'

interface HeroProps {
  onOpenModal?: (moduleKey: string) => void
}

/**
 * ScaledDashboard — renders mockup at 896px fixed design width & scales down
 * with a high-performance 3D perspective tilt hover effect & specular glare
 */
function ScaledDashboard() {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, glareX: 50, glareY: 50, isHover: false })
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

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const px = (x / rect.width - 0.5) * 2 // -1 to 1
    const py = (y / rect.height - 0.5) * 2
    setTilt({
      rx: -py * 3.5, // 3.5 degree hardware tilt
      ry: px * 3.5,
      glareX: (x / rect.width) * 100,
      glareY: (y / rect.height) * 100,
      isHover: true,
    })
  }

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0, glareX: 50, glareY: 50, isHover: false })
  }

  return (
    <div ref={outerRef} className="relative w-full overflow-hidden">
      <div
        ref={innerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          width: DESIGN_WIDTH,
          transformOrigin: 'top center',
          transform: `scale(${scale}) perspective(1200px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transition: tilt.isHover ? 'transform 0.08s ease-out' : 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="relative group cursor-crosshair"
      >
        <DashboardMockup />
        
        {/* Dynamic Specular Hardware Glare on Hover */}
        {tilt.isHover && (
          <div
            className="pointer-events-none absolute inset-0 rounded-xl z-30 transition-opacity duration-200"
            style={{
              background: `radial-gradient(circle 380px at ${tilt.glareX}% ${tilt.glareY}%, rgba(245, 158, 11, 0.08), transparent 75%)`,
            }}
          />
        )}
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
    <section className="relative min-h-[100svh] overflow-hidden bg-[#08090c] flex flex-col">
      {/* Subtle ambient amber-carbon radial glow & technical grid */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(245, 158, 11, 0.12), transparent 70%)',
        }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none section-texture opacity-50" />

      {/* ── Navbar ──────────────────────────────────────── */}
      <Navbar onOpenModal={onOpenModal} />

      {/* ── HERO CONTENT ────────────────────────────────── */}
      <div className="flex-1 min-h-8 sm:min-h-12 lg:min-h-16 shrink-0" />

      <div className="relative z-10 flex flex-col items-center text-center px-5 max-w-5xl mx-auto">

        {/* Top Hardware Telemetry Badge */}
        <div className="animate-fade-up inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-[#12151c] border border-white/10 text-white/90 text-xs font-mono font-semibold uppercase tracking-wider mb-6 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-[#10b981] animate-ping" />
          Enterprise ERP Engine v2.0 · Live WebSocket Sync
        </div>

        {/* Headline */}
        <h1 className="text-white font-normal leading-[1.05] tracking-tight text-[40px] min-[400px]:text-[44px] sm:text-6xl lg:text-7xl xl:text-[80px]">
          <span className="block animate-fade-up font-bold tracking-tight">Run warehouses.</span>
          <span className="block animate-fade-up [animation-delay:100ms] text-transparent bg-clip-text bg-gradient-to-r from-white via-[#fbbf24] to-[#f59e0b] font-bold">
            In real-time.
          </span>
        </h1>

        {/* Search command bar */}
        <form
          onSubmit={e => { e.preventDefault(); handleLaunchApp('/items') }}
          className="animate-fade-up [animation-delay:220ms] mt-6 sm:mt-8 w-full max-w-xl"
        >
          <div className="flex items-center gap-3 rounded-lg bg-[#12151c]/95 border border-white/15 pl-4 pr-1.5 py-1.5 shadow-2xl hover:border-[#f59e0b]/40 transition-all">
            <Search className="w-4 h-4 text-white/40 shrink-0" />
            <input
              type="text"
              placeholder="Search inventory, invoices, staff, warehouses..."
              className="flex-1 bg-transparent text-sm sm:text-base text-white placeholder-white/40 outline-none py-1.5 font-sans"
            />
            <button
              type="submit"
              aria-label="Search ERP"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-[#f59e0b] text-gray-900 hover:bg-[#fbbf24] active:scale-95 transition-all shrink-0 flex items-center justify-center font-bold shadow"
            >
              <ArrowUp className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        </form>

        {/* Description */}
        <p className="animate-fade-up [animation-delay:340ms] mt-5 text-white/80 text-sm sm:text-base lg:text-lg leading-relaxed max-w-xl">
          Unify inventory, billing, and workforce across
          <br className="hidden sm:inline" />
          unlimited locations — with live WebSocket sync
          {' '}and{' '}
          <Zap className="inline w-4 h-4 -mt-1 text-[#f59e0b]" />{' '}
          5-tier role-based access control.
        </p>

        {/* CTA Buttons */}
        <div className="animate-fade-up [animation-delay:460ms] mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => handleLaunchApp('/signup')}
            className="bg-[#f59e0b] text-gray-900 text-sm font-bold px-7 py-3 rounded-lg hover:bg-[#fbbf24] hover:shadow-xl transition-all shadow-[#f59e0b]/20"
          >
            Start Free Trial
          </button>

          <button
            onClick={() => handleLaunchApp('/login')}
            className="text-white text-sm font-semibold px-7 py-3 rounded-lg border border-white/20 hover:bg-white/10 backdrop-blur-md transition-colors"
          >
            Schedule a Demo
          </button>
        </div>
      </div>

      {/* ── DASHBOARD MOCKUP WITH 3D TILT ───────────────── */}
      <div className="flex-1 min-h-10 sm:min-h-12 lg:min-h-16 shrink-0" />

      <div className="animate-hero-rise [animation-delay:620ms] relative z-10 w-[92%] sm:w-[84%] lg:w-[72%] max-w-4xl mx-auto shrink-0 -mb-10 sm:-mb-20 lg:-mb-32">
        <ScaledDashboard />
      </div>
    </section>
  )
}
