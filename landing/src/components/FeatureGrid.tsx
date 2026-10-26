import { useState } from 'react'
import {
  DollarSign, Truck, Table, Users, Zap, Filter,
  List, LayoutGrid, ArrowUpRight, ExternalLink, Check
} from 'lucide-react'

import type { LucideIcon } from 'lucide-react'

type Category = 'all' | 'finance' | 'logistics' | 'data' | 'workforce' | 'automation'

interface FilterTag {
  id: Category
  label: string
  icon: LucideIcon
}

const FILTER_TAGS: FilterTag[] = [
  { id: 'all',        label: 'All Ecosystem Modules', icon: Filter      },
  { id: 'finance',    label: 'Finance & Tax',          icon: DollarSign  },
  { id: 'logistics',  label: 'Logistics & Warehouses', icon: Truck       },
  { id: 'data',       label: 'Data & Custom Tables',   icon: Table       },
  { id: 'workforce',  label: 'Workforce & RBAC',       icon: Users       },
  { id: 'automation', label: 'Automation & Audit',    icon: Zap         },
]

interface FeatureGridProps {
  onOpenModal?: (moduleKey: string) => void
}

export default function FeatureGrid({ onOpenModal }: FeatureGridProps) {
  const [activeCategory, setActiveCategory] = useState<Category>('all')
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'GBP'>('USD')
  const [routeStatus, setRouteStatus] = useState<'In Transit' | 'Delivered'>('In Transit')
  const [dataView, setDataView] = useState<'list' | 'kanban'>('list')
  const [selectedRole, setSelectedRole] = useState<'Super Admin' | 'Manager' | 'Staff'>('Super Admin')

  const currencyRates = {
    USD: { symbol: '$',  val: '124,700', tax: '8,920' },
    EUR: { symbol: '€',  val: '114,350', tax: '8,180' },
    GBP: { symbol: '£',  val: '97,260',  tax: '6,950' },
  }

  const handleLaunchApp = (route: string) => {
    window.location.href = `/warehouse-erp/index.html#${route}`
  }

  const isMatch = (cat: Category) => activeCategory === 'all' || activeCategory === cat

  return (
    <section id="features" className="relative bg-transparent section-texture py-20 lg:py-32 overflow-hidden border-t border-white/5 text-white">
      
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 relative z-10 space-y-16">

        {/* ═══════════ SECTION HEADER ════════════════════════ */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] text-xs font-mono font-semibold uppercase tracking-wider mb-4">
            <Zap className="w-3.5 h-3.5" /> Complete Ecosystem Architecture
          </div>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white mb-4">
            Everything your operations need.<br />
            <span className="bg-gradient-to-r from-white via-[#fde68a] to-[#f59e0b] bg-clip-text text-transparent">
              Engineered to scale without friction.
            </span>
          </h2>
          <p className="text-sm sm:text-base text-white/60 leading-relaxed">
            Multi-warehouse logistics, atomic billing, 5-tier RBAC, and real-time WebSocket sync—all built on a single high-performance FastAPI & MongoDB backend.
          </p>
        </div>

        {/* ═══════════ GLOBAL FILTER BAR ═════════════════════ */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {FILTER_TAGS.map(tag => {
            const Icon = tag.icon
            const active = activeCategory === tag.id
            return (
              <button
                key={tag.id}
                onClick={() => setActiveCategory(tag.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-300 ${
                  active
                    ? 'bg-[#f59e0b] text-[#08090c] shadow-lg shadow-[#f59e0b]/20 ring-1 ring-[#fbbf24]/50 font-bold'
                    : 'bg-white/[0.03] text-white/70 hover:text-white hover:bg-white/[0.08] border border-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tag.label}</span>
              </button>
            )
          })}
        </div>

        {/* ═══════════ BENTO FEATURE GRID (12-COLUMNS) ════════ */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* ── CARD 1: CORE FINANCE (Col Span 7) ────────────────── */}
          <div
            className={`md:col-span-7 bg-[#12151c]/90 backdrop-blur-xl border border-white/10 rounded-xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:border-white/20 shadow-xl group ${
              !isMatch('finance') ? 'opacity-30 blur-[1px]' : 'opacity-100'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#f59e0b] uppercase tracking-wider">
                  <DollarSign className="w-4 h-4" /> Finance & General Ledger
                </div>
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-md p-1">
                  {(['USD', 'EUR', 'GBP'] as const).map(c => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                        currency === c ? 'bg-[#f59e0b] text-[#08090c]' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Automated Multi-Tax Invoice Engine
              </h3>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed mb-6">
                Generate professional invoices with automated standard (5%) & luxury (15%) tax snapshotting. Stock decrements atomically on every sale.
              </p>
            </div>

            {/* Widget */}
            <div className="bg-[#0d0f14] border border-white/10 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50 font-mono">Real-Time Cash Flow Snapshot</span>
                <span className="text-[#10b981] font-semibold flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5" /> +18.4% YoY
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-white font-mono">
                  {currencyRates[currency].symbol}{currencyRates[currency].val}
                </span>
                <span className="text-xs text-[#febc2e] font-mono">
                  (Tax: {currencyRates[currency].symbol}{currencyRates[currency].tax})
                </span>
              </div>

              <div className="h-20 w-full pt-2">
                <svg className="w-full h-full" viewBox="0 0 400 80" fill="none">
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,60 Q50,45 100,50 T200,30 T300,35 T400,10 L400,80 L0,80 Z" fill="url(#chartGrad)" />
                  <path d="M0,60 Q50,45 100,50 T200,30 T300,35 T400,10" fill="none" stroke="#f59e0b" strokeWidth="3" />
                  <circle cx="400" cy="10" r="4" fill="#fbbf24" className="animate-pulse" />
                </svg>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] text-white/50">
                <button onClick={() => onOpenModal?.('finance')} className="text-[#f59e0b] font-semibold hover:underline">
                  View Full Finance Specs →
                </button>
                <button onClick={() => handleLaunchApp('/billing')} className="text-white font-semibold flex items-center gap-1 hover:text-[#f59e0b]">
                  Open Billing App <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* ── CARD 2: SUPPLY CHAIN & LOGISTICS (Col Span 5) ──────── */}
          <div
            className={`md:col-span-5 bg-[#12151c]/90 backdrop-blur-xl border border-white/10 rounded-xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:border-white/20 shadow-xl group ${
              !isMatch('logistics') ? 'opacity-30 blur-[1px]' : 'opacity-100'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#10b981] uppercase tracking-wider">
                  <Truck className="w-4 h-4" /> Multi-Warehouse Logistics
                </div>
                <span className="text-[10px] bg-[#10b981]/10 text-[#10b981] px-2 py-0.5 rounded-md font-mono">
                  Live GPS Track
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Real-Time Stock & Route Telemetry
              </h3>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed mb-6">
                Register unlimited warehouses. Each location tracks SKU uniqueness, stock thresholds, and live freight movement.
              </p>
            </div>

            <div className="bg-[#0d0f14] border border-white/10 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Route #DF-904</span>
                <button
                  onClick={() => setRouteStatus(s => s === 'In Transit' ? 'Delivered' : 'In Transit')}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all ${
                    routeStatus === 'Delivered'
                      ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40'
                      : 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/40 animate-pulse'
                  }`}
                >
                  ● {routeStatus}
                </button>
              </div>

              <div className="relative py-3">
                <div className="h-1.5 w-full bg-white/10 rounded-md overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#f59e0b] to-[#10b981] transition-all duration-700"
                    style={{ width: routeStatus === 'Delivered' ? '100%' : '65%' }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-white/50 mt-2 font-mono">
                  <span>Dallas</span>
                  <span>Houston</span>
                  <span>Austin</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] pt-1">
                <button onClick={() => onOpenModal?.('logistics')} className="text-[#10b981] font-semibold hover:underline">
                  View Logistics Specs →
                </button>
                <button onClick={() => handleLaunchApp('/warehouses')} className="text-white font-semibold flex items-center gap-1 hover:text-[#10b981]">
                  Open Warehouses App <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* ── CARD 3: REAL-TIME DATA (Col Span 12) ────────────────── */}
          <div
            className={`md:col-span-12 bg-[#12151c]/90 backdrop-blur-xl border border-white/10 rounded-xl p-6 sm:p-8 transition-all duration-300 hover:border-white/20 shadow-xl group ${
              !isMatch('data') ? 'opacity-30 blur-[1px]' : 'opacity-100'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#06b6d4] uppercase tracking-wider mb-2">
                  <Table className="w-4 h-4" /> Dynamic Table Builder & Analytics
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  Custom Schemas & Instant Data Filtering
                </h3>
                <p className="text-xs sm:text-sm text-white/60 mt-1 max-w-2xl">
                  Build operational tables with custom typed columns (text, number, dropdown, date). Switch between dense table view and Kanban workflow boards.
                </p>
              </div>

              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1 shrink-0 self-start md:self-auto">
                <button
                  onClick={() => setDataView('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    dataView === 'list' ? 'bg-[#f59e0b] text-[#08090c] font-bold shadow-md' : 'text-white/50 hover:text-white'
                  }`}
                >
                  <List className="w-3.5 h-3.5" /> Table View
                </button>
                <button
                  onClick={() => setDataView('kanban')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    dataView === 'kanban' ? 'bg-[#f59e0b] text-[#08090c] font-bold shadow-md' : 'text-white/50 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Kanban Board
                </button>
              </div>
            </div>

            <div className="bg-[#0d0f14] border border-white/10 rounded-lg p-4 overflow-x-auto">
              {dataView === 'list' ? (
                <table className="w-full text-left text-xs min-w-[600px]">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 uppercase tracking-wider text-[10px]">
                      <th className="py-2 px-3">Item / Log Name</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Warehouse</th>
                      <th className="py-2 px-3">Stock Level</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-white/80">
                    <tr>
                      <td className="py-2.5 px-3 font-bold text-white">Industrial Steel Pipes</td>
                      <td className="py-2.5 px-3"><span className="bg-[#f59e0b]/20 text-[#f59e0b] px-2 py-0.5 rounded text-[10px]">Tools</span></td>
                      <td className="py-2.5 px-3 text-white/60">Dallas Logistics Depot</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-white">80 Pcs</td>
                      <td className="py-2.5 px-3"><span className="text-[#10b981] font-semibold inline-flex items-center gap-1">In Stock <Check className="w-3.5 h-3.5" /></span></td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-bold text-white">Premium Electronics Kit</td>
                      <td className="py-2.5 px-3"><span className="bg-[#06b6d4]/20 text-[#06b6d4] px-2 py-0.5 rounded text-[10px]">Electronics</span></td>
                      <td className="py-2.5 px-3 text-white/60">Houston HQ Distribution</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-white">120 Pcs</td>
                      <td className="py-2.5 px-3"><span className="text-[#10b981] font-semibold inline-flex items-center gap-1">In Stock <Check className="w-3.5 h-3.5" /></span></td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="grid grid-cols-3 gap-4 min-w-[600px] py-2 text-xs">
                  <div className="bg-white/5 p-3 rounded-lg border border-white/5 space-y-2">
                    <div className="text-[10px] font-bold text-white/50 uppercase">To Inspect (2)</div>
                    <div className="bg-[#12151c] p-2.5 rounded-md border border-white/10 font-semibold text-white">
                      Forklift FL-007 Checkup
                    </div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-lg border border-white/5 space-y-2">
                    <div className="text-[10px] font-bold text-[#f59e0b] uppercase">In Progress (1)</div>
                    <div className="bg-[#12151c] p-2.5 rounded-md border border-white/10 font-semibold text-white">
                      Shipment Track #DF-904
                    </div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-lg border border-white/5 space-y-2">
                    <div className="text-[10px] font-bold text-[#10b981] uppercase">Completed (3)</div>
                    <div className="bg-[#12151c] p-2.5 rounded-md border border-white/10 font-semibold text-white">
                      Invoice INV-0038 Issued
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 text-xs text-white/50">
              <button onClick={() => onOpenModal?.('data')} className="text-[#06b6d4] font-semibold hover:underline">
                View Dynamic Schema Specs →
              </button>
              <button onClick={() => handleLaunchApp('/tables')} className="text-white font-semibold flex items-center gap-1 hover:text-[#f59e0b]">
                Open Custom Tables App <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── CARD 4: WORKFORCE RBAC (Col Span 6) ────────────────── */}
          <div
            className={`md:col-span-6 bg-[#12151c]/90 backdrop-blur-xl border border-white/10 rounded-xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:border-white/20 shadow-xl group ${
              !isMatch('workforce') ? 'opacity-30 blur-[1px]' : 'opacity-100'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#f59e0b] uppercase tracking-wider">
                  <Users className="w-4 h-4" /> 5-Tier Workforce RBAC
                </div>
                <span className="text-[10px] bg-[#f59e0b]/10 text-[#f59e0b] px-2 py-0.5 rounded-md font-mono">
                  Super Admin Controls
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Hierarchical Access & Permissions
              </h3>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed mb-6">
                Super Admin, Admin, Manager, Staff, Employee. Permissions cascade automatically so team members only access what they need.
              </p>
            </div>

            <div className="bg-[#0d0f14] border border-white/10 rounded-lg p-4 space-y-3">
              <div className="flex gap-2 flex-wrap text-xs">
                {(['Super Admin', 'Manager', 'Staff'] as const).map(role => (
                  <button
                    key={role}
                    onClick={() => setSelectedRole(role)}
                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                      selectedRole === role ? 'bg-[#6366f1] !bg-[#f59e0b] text-[#08090c] font-bold' : 'bg-white/5 text-white/60'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs pt-2">
                <button onClick={() => onOpenModal?.('workforce')} className="text-[#f59e0b] font-semibold hover:underline">
                  View RBAC Specs →
                </button>
                <button onClick={() => handleLaunchApp('/workforce')} className="text-white font-semibold flex items-center gap-1 hover:text-[#f59e0b]">
                  Open Workforce App <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ── CARD 5: AUTOMATION & AUDIT (Col Span 6) ───────────── */}
          <div
            className={`md:col-span-6 bg-[#12151c]/90 backdrop-blur-xl border border-white/10 rounded-xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:border-white/20 shadow-xl group ${
              !isMatch('automation') ? 'opacity-30 blur-[1px]' : 'opacity-100'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#f59e0b] uppercase tracking-wider">
                  <Zap className="w-4 h-4" /> Automation & Audit Trails
                </div>
                <span className="text-[10px] bg-[#f59e0b]/10 text-[#f59e0b] px-2 py-0.5 rounded-md font-mono">
                  Active Webhooks
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Business Logic & Tamper-Evident Audit
              </h3>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed mb-6">
                Automate approval triggers and log every system event with user identity, timestamp, and tenant scope automatically.
              </p>
            </div>

            <div className="bg-[#0d0f14] border border-white/10 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 bg-[#12151c] p-3 rounded-md border border-white/10 text-xs">
                <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono">IF Invoice &gt; $5,000</span>
                <span className="text-[#06b6d4] font-mono">→ Trigger VP Approval</span>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button onClick={() => onOpenModal?.('audit')} className="text-[#f59e0b] font-semibold hover:underline">
                  View Audit Specs →
                </button>
                <button onClick={() => handleLaunchApp('/audit')} className="text-white font-semibold flex items-center gap-1 hover:text-[#f59e0b]">
                  Open Audit Logs App <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  )
}
