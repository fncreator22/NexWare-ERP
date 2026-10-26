import { useState } from 'react'
import {
  ShieldCheck, TrendingDown, Clock, Globe,
  ChevronLeft, ChevronRight, CheckCircle2, Info, Quote, ExternalLink, Lightbulb
} from 'lucide-react'

const BRAND_LOGOS = [
  { name: 'GlobalParts Co.', sub: 'Industrial Manufacturing' },
  { name: 'NorthTex Logistics', sub: 'Global Supply Chain' },
  { name: 'DallasFlex Mfg.', sub: 'Heavy Equipment' },
  { name: 'Apex Logistics', sub: 'Distribution Networks' },
  { name: 'IronWorks Ltd.', sub: 'Steel & Materials' },
  { name: 'SwiftDepot Global', sub: 'Freight Forwarding' },
  { name: 'Vanguard Freight', sub: 'Intermodal Transport' },
  { name: 'TransCorp ERP', sub: 'Terminal Operations' },
]

const METRICS = [
  {
    icon: ShieldCheck,
    value: '99.99%',
    label: 'System Uptime SLA',
    detail: 'Multi-region MongoDB Atlas deployment with zero-downtime failover',
    tooltip: 'Guaranteed by 24/7 automated health monitoring at /health endpoints.',
    accent: 'from-[#6366f1] to-[#818cf8]',
  },
  {
    icon: TrendingDown,
    value: '32%',
    label: 'Cost Reduction',
    detail: 'Average reduction in warehouse operational overhead and over-stocking',
    tooltip: 'Based on the 2026 NexWare Customer ROI Audit across 120+ active tenants.',
    accent: 'from-[#10b981] to-[#34d399]',
  },
  {
    icon: Globe,
    value: '$4B+',
    label: 'Annual Transactions',
    detail: 'Total inventory valuation and invoice billing processed annually',
    tooltip: 'Real-time atomic stock decrement and tax snapshot engine.',
    accent: 'from-[#818cf8] to-[#c7d2fe]',
  },
  {
    icon: Clock,
    value: '3x Faster',
    label: 'Financial Closing',
    detail: 'Acceleration in quarterly billing reconciliation and compliance reporting',
    tooltip: 'Automated tax calculations with luxury/standard rate snapshotting.',
    accent: 'from-[#f59e0b] to-[#fbbf24]',
  },
]

const CASE_STUDIES = [
  {
    id: 'globalparts',
    quote: 'NexWare centralized our global supply chain across 14 countries. The real-time inventory sync and multi-tenant isolation gave us full visibility without risking data leakage.',
    author: 'Marcus Vance',
    role: 'Chief Technology Officer',
    company: 'GlobalParts Co.',
    stats: [
      { label: 'Global Facilities', value: '14 Countries' },
      { label: 'Stock Discrepancy', value: '-45%' },
      { label: 'Time to Onboard', value: '14 Days' },
    ],
    initials: 'MV',
    verified: 'Verified Fortune 500 Case Study',
    appRoute: '/analytics',
  },
  {
    id: 'northtex',
    quote: 'The 5-tier role-based access control and audit logging changed everything. Managers, staff, and employees only see what they need, saving us hundreds of hours during compliance audits.',
    author: 'Sarah Connor',
    role: 'VP of Warehouse Operations',
    company: 'NorthTex Logistics',
    stats: [
      { label: 'Audit Failures', value: '0 Incidents' },
      { label: 'Staff Managed', value: '450+ Users' },
      { label: 'Billing Speed', value: '3x Faster' },
    ],
    initials: 'SC',
    verified: 'Verified Logistics Deployment',
    appRoute: '/workforce',
  },
  {
    id: 'apex',
    quote: 'Historical accounting drift used to take weeks to fix every quarter. NexWare’s immutable invoice tax snapshots resolved that instantly. Our finance team signed off in 24 hours.',
    author: 'David Chen',
    role: 'Chief Financial Officer',
    company: 'Apex Manufacturing Corp.',
    stats: [
      { label: 'Monthly Hours Saved', value: '120+ Hours' },
      { label: 'Tax Calculation', value: '100% Accurate' },
      { label: 'ROI Payback', value: '3 Months' },
    ],
    initials: 'DC',
    verified: 'Verified Manufacturing Study',
    appRoute: '/billing',
  },
]

export default function SocialProof() {
  const [activeSlide, setActiveSlide] = useState(0)
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null)

  const currentCase = CASE_STUDIES[activeSlide]

  const handleLaunchApp = (route: string) => {
    window.location.href = `/warehouse-erp/index.html#${route}`
  }

  return (
    <section className="relative bg-[#070814] text-white py-24 lg:py-32 overflow-hidden border-t border-white/10">

      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 relative z-10 space-y-24">

        {/* ═══════════ 1. LOGO GRID ═══════════ */}
        <div className="text-center">
          <p className="text-[11px] sm:text-xs font-mono font-semibold tracking-widest uppercase text-white/50 mb-8">
            Powering operations for industry leaders worldwide
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {BRAND_LOGOS.map((brand) => (
              <div
                key={brand.name}
                onClick={() => handleLaunchApp('/dashboard')}
                className="group relative bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:border-[#818cf8]/50 rounded-lg p-4 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer shadow-lg hover:shadow-[#6366f1]/10 hover:-translate-y-1"
              >
                <div className="text-sm font-bold text-white/70 group-hover:text-white transition-colors tracking-tight text-center">
                  {brand.name}
                </div>
                <div className="text-[9px] text-white/40 group-hover:text-[#818cf8] transition-colors mt-0.5 text-center truncate w-full font-mono">
                  {brand.sub}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════ 2. HARD PROOF METRICS ═════════════════ */}
        <div>
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#6366f1]/10 border border-[#6366f1]/30 text-[#818cf8] text-xs font-mono font-semibold uppercase tracking-wider mb-4">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981]" /> Institutional Grade Reliability
            </div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              Engineered for enterprise scale and verifiable ROI
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {METRICS.map((m, idx) => {
              const Icon = m.icon
              return (
                <div
                  key={m.label}
                  className="relative group bg-[#0c0d1e] border border-white/10 hover:border-[#818cf8]/50 rounded-xl p-6 transition-all duration-300 flex flex-col justify-between shadow-xl hover:-translate-y-1"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-[#818cf8] border border-white/10 group-hover:scale-110 transition-transform">
                        <Icon className="w-5 h-5" />
                      </div>
                      
                      <button
                        onClick={() => setActiveTooltip(activeTooltip === idx ? null : idx)}
                        className="text-white/40 hover:text-white transition-colors p-1"
                        aria-label="Toggle metric info"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </div>

                    <div className={`text-4xl lg:text-5xl font-extrabold tracking-tight bg-gradient-to-r ${m.accent} bg-clip-text text-transparent mb-2 font-mono`}>
                      {m.value}
                    </div>

                    <h3 className="text-base font-semibold text-white mb-1.5">{m.label}</h3>
                    <p className="text-xs text-white/60 leading-relaxed">{m.detail}</p>
                  </div>

                  {activeTooltip === idx && (
                    <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-[#c7d2fe] bg-[#6366f1]/20 p-3 rounded-lg animate-fade-up flex items-center gap-1.5 font-mono">
                      <Lightbulb className="w-3 h-3 shrink-0 text-[#818cf8]" />
                      <span>{m.tooltip}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ═══════════ 3. CASE STUDY SLIDER ═════ */}
        <div className="bg-[#0c0d1e] border border-white/15 rounded-xl p-6 sm:p-10 lg:p-12 relative overflow-hidden shadow-2xl">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-[#10b981] animate-ping" />
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#818cf8]">
                {currentCase.verified}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-white/40 font-mono">
                0{activeSlide + 1} / 0{CASE_STUDIES.length}
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setActiveSlide(s => (s === 0 ? CASE_STUDIES.length - 1 : s - 1))}
                  className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Previous case study"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveSlide(s => (s === CASE_STUDIES.length - 1 ? 0 : s + 1))}
                  className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Next case study"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

            <div className="lg:col-span-7 space-y-6">
              <Quote className="w-10 h-10 text-[#6366f1]/50" />

              <blockquote className="text-xl sm:text-2xl lg:text-3xl font-medium text-white leading-snug tracking-tight">
                "{currentCase.quote}"
              </blockquote>

              <div className="flex items-center gap-4 pt-2">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center text-white font-bold text-base shadow-lg">
                  {currentCase.initials}
                </div>
                <div>
                  <div className="text-base font-semibold text-white">{currentCase.author}</div>
                  <div className="text-xs text-white/60">
                    {currentCase.role} · <span className="text-[#818cf8] font-medium">{currentCase.company}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 bg-[#080918] border border-white/10 rounded-lg p-6 space-y-5">
              <div className="text-xs font-mono font-semibold tracking-wider text-white/40 uppercase">
                Validated Enterprise Impact
              </div>

              <div className="space-y-4">
                {currentCase.stats.map(s => (
                  <div key={s.label} className="flex items-center justify-between border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                    <span className="text-xs text-white/60">{s.label}</span>
                    <span className="text-base font-bold text-[#818cf8] font-mono">{s.value}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => handleLaunchApp(currentCase.appRoute)}
                className="w-full flex items-center justify-center gap-2 bg-white text-gray-900 font-bold text-xs py-3 px-4 rounded-lg hover:bg-white/90 transition-all shadow-lg"
              >
                Read Full Case Study <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

          <div className="flex justify-center gap-2 mt-8">
            {CASE_STUDIES.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveSlide(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  activeSlide === i ? 'w-8 bg-[#6366f1]' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

        </div>

      </div>
    </section>
  )
}
