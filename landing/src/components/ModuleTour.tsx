import { useState, useEffect } from 'react'
import {
  Package, FileText, Users, ShieldCheck, BarChart2,
  Play, Pause, RotateCcw, CheckCircle2, Sparkles,
  ArrowRight, Zap, MousePointer, Building2,
  Factory, Briefcase, Lock, Lightbulb, AlertTriangle, Check
} from 'lucide-react'

/* ─── Data: Roles & Personas ────────────────────────────── */
interface Persona {
  id: string
  title: string
  icon: string
  defaultModule: string
}

const PERSONA_ICONS = {
  wh_manager: Factory,
  cfo: Briefcase,
  compliance: Lock,
  ops_lead: Zap,
}

const PERSONAS: Persona[] = [
  { id: 'wh_manager',  title: 'Warehouse Manager',  icon: 'wh_manager',  defaultModule: 'inventory' },
  { id: 'cfo',         title: 'Finance Director',   icon: 'cfo',         defaultModule: 'billing' },
  { id: 'compliance',  title: 'Compliance Officer', icon: 'compliance',  defaultModule: 'audit' },
  { id: 'ops_lead',    title: 'Operations Lead',    icon: 'ops_lead',    defaultModule: 'analytics' },
]

/* ─── Data: Modules & Guided Steps ───────────────────────── */
interface Step {
  stepNum: number
  title: string
  desc: string
  hotspotLabel: string
  roiMetric: string
}

interface ModuleData {
  id: string
  label: string
  icon: any
  tagline: string
  businessImpact: string
  steps: Step[]
}

const MODULES: ModuleData[] = [
  {
    id: 'inventory',
    label: 'Inventory Control',
    icon: Package,
    tagline: 'Multi-location real-time stock leveling & SKU isolation',
    businessImpact: '-45% Reduction in Over-stocking & Discrepancies',
    steps: [
      {
        stepNum: 1,
        title: 'Detect Low-Stock Alert',
        desc: 'System automatically flags SKUs falling below minimum stock threshold across warehouses.',
        hotspotLabel: 'Click Low-Stock Alert on Safety Helmets (7 left)',
        roiMetric: 'Instant SKU Threshold Monitoring',
      },
      {
        stepNum: 2,
        title: 'Atomic Multi-Warehouse Check',
        desc: 'Instantly query inventory levels in neighbouring depots before placing vendor orders.',
        hotspotLabel: 'Click Dallas & Houston Stock Check',
        roiMetric: 'Cross-Depot Stock Optimization',
      },
      {
        stepNum: 3,
        title: 'Bulk CSV / Reorder Dispatch',
        desc: 'Export current inventory manifest to CSV or trigger automated stock replenishment.',
        hotspotLabel: 'Click + Add Stock Item',
        roiMetric: '100% Stock Level Accuracy',
      },
    ],
  },
  {
    id: 'billing',
    label: 'Billing & Invoices',
    icon: FileText,
    tagline: 'Instant PDF invoice generation with tax snapshotting',
    businessImpact: '3x Faster Quarterly Reconciliation & Billing',
    steps: [
      {
        stepNum: 1,
        title: 'Create Invoice & Apply Tax Snapshot',
        desc: 'Select customer, line items, and standard (5%) or luxury (15%) tax snapshot rules.',
        hotspotLabel: 'Click Invoice INV-0038',
        roiMetric: 'Zero Tax Drift & Immutable History',
      },
      {
        stepNum: 2,
        title: 'Atomic Inventory Decrement',
        desc: 'Stock decrements atomically across warehouse records as soon as invoice is issued.',
        hotspotLabel: 'Click Pay Invoice ($955.50)',
        roiMetric: 'Real-time Stock & Revenue Alignment',
      },
      {
        stepNum: 3,
        title: 'Export Accounting Reports',
        desc: 'Generate PDF summaries and CSV ledger feeds for enterprise accounting platforms.',
        hotspotLabel: 'Click Export PDF Summary',
        roiMetric: '100% Compliance Sign-off Rate',
      },
    ],
  },
  {
    id: 'workforce',
    label: 'Workforce & RBAC',
    icon: Users,
    tagline: '5-tier cascading role permissions & shift control',
    businessImpact: 'Zero Access Violations Across 450+ Active Staff',
    steps: [
      {
        stepNum: 1,
        title: 'Select Role Access Level',
        desc: 'Super Admin, Admin, Manager, Staff, Employee tiers automatically restrict UI visibility.',
        hotspotLabel: 'Click Sarah Connor (Manager)',
        roiMetric: 'Cascading Role Isolation',
      },
      {
        stepNum: 2,
        title: 'Scope Warehouse Access',
        desc: 'Assign staff members exclusively to Dallas Depot, Houston HQ, or Austin North.',
        hotspotLabel: 'Click Assign Warehouse Scope',
        roiMetric: 'Location-Based Namespace Enforcement',
      },
      {
        stepNum: 3,
        title: 'Revoke / Modify Access Instantly',
        desc: 'Revoke sessions or update permissions with instant database token invalidation.',
        hotspotLabel: 'Click Update Staff Status',
        roiMetric: 'Instant Access Revocation',
      },
    ],
  },
  {
    id: 'audit',
    label: 'Compliance Audit',
    icon: ShieldCheck,
    tagline: 'Tenant-scoped, tamper-evident record of all system events',
    businessImpact: '100% Audit Readiness with Timestamp Traceability',
    steps: [
      {
        stepNum: 1,
        title: 'Inspect System Event Stream',
        desc: 'Every login, item creation, billing update, and settings mutation is recorded.',
        hotspotLabel: 'Click Audit Event: item_create',
        roiMetric: 'Full Identity & Timestamp Traceability',
      },
      {
        stepNum: 2,
        title: 'Filter Event by Warehouse & User',
        desc: 'Drill down by specific user identity (e.g. Alex Mercer) or depot location.',
        hotspotLabel: 'Click Filter by User: sarah@nexware.com',
        roiMetric: 'Granular Search Precision',
      },
      {
        stepNum: 3,
        title: 'Export Compliance Log Package',
        desc: 'Export raw immutable event logs to CSV for external regulatory compliance.',
        hotspotLabel: 'Click Export Compliance Log CSV',
        roiMetric: 'Audit-Ready Compliance Exports',
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics & Reports',
    icon: BarChart2,
    tagline: 'Interactive revenue charts & stock health insights',
    businessImpact: '+18% YoY Revenue Growth Insights',
    steps: [
      {
        stepNum: 1,
        title: 'Review 6-Month Revenue Trend',
        desc: 'Interactive Chart.js visualizations tracking gross earnings, taxes, and net revenue.',
        hotspotLabel: 'Click Revenue Trend Bar Chart',
        roiMetric: 'Instant Executive Overview',
      },
      {
        stepNum: 2,
        title: 'Breakdown Revenue by Warehouse',
        desc: 'Doughnut chart distribution comparing Houston HQ (47%), Dallas (34%), and Austin (19%).',
        hotspotLabel: 'Click Houston HQ Slice ($58,900)',
        roiMetric: 'Location Profitability Comparisons',
      },
      {
        stepNum: 3,
        title: 'Project Stock & Replenishment',
        desc: 'Predictive stock health indicators (94% healthy) guiding procurement schedules.',
        hotspotLabel: 'Click Generate Stock Forecast',
        roiMetric: 'Optimized Capital Allocation',
      },
    ],
  },
]

/* ─── Component ──────────────────────────────────────────── */
export default function ModuleTour() {
  const [selectedPersona, setSelectedPersona] = useState('wh_manager')
  const [activeModuleId, setActiveModuleId] = useState('inventory')
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [isAutoplay, setIsAutoplay] = useState(false)
  const [hotspotSuccess, setHotspotSuccess] = useState(false)
  const [tourCompleted, setTourCompleted] = useState(false)

  const activeModule = MODULES.find(m => m.id === activeModuleId) || MODULES[0]
  const currentStep = activeModule.steps[currentStepIdx] || activeModule.steps[0]

  // Handle persona switch -> switch default module
  const handlePersonaChange = (pId: string) => {
    setSelectedPersona(pId)
    const p = PERSONAS.find(x => x.id === pId)
    if (p) {
      setActiveModuleId(p.defaultModule)
      setCurrentStepIdx(0)
      setTourCompleted(false)
    }
  }

  // Handle module tab switch
  const handleModuleChange = (mId: string) => {
    setActiveModuleId(mId)
    setCurrentStepIdx(0)
    setTourCompleted(false)
  }

  // Autoplay timer
  useEffect(() => {
    if (!isAutoplay || tourCompleted) return
    const timer = setInterval(() => {
      setCurrentStepIdx(prev => {
        if (prev < activeModule.steps.length - 1) {
          return prev + 1
        } else {
          setTourCompleted(true)
          setIsAutoplay(false)
          return prev
        }
      })
    }, 4000)
    return () => clearInterval(timer)
  }, [isAutoplay, activeModule, tourCompleted])

  // Trigger hotspot action
  const handleHotspotClick = () => {
    setHotspotSuccess(true)
    setTimeout(() => setHotspotSuccess(false), 1200)

    if (currentStepIdx < activeModule.steps.length - 1) {
      setCurrentStepIdx(prev => prev + 1)
    } else {
      setTourCompleted(true)
    }
  }

  // Reset current tour
  const handleResetTour = () => {
    setCurrentStepIdx(0)
    setTourCompleted(false)
    setIsAutoplay(false)
  }

  return (
    <section id="interactive-tour" className="relative bg-[#070814] text-white py-20 lg:py-32 overflow-hidden border-t border-white/5">

      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 relative z-10">

        {/* ═══════════ SECTION HEADER ════════════════════════ */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#6366f1]/10 border border-[#6366f1]/30 text-[#818cf8] text-xs font-mono font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Interactive Product Tour
          </div>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white mb-4">
            Experience NexWare ERP in Sandbox Mode
          </h2>
          <p className="text-sm sm:text-base text-white/60 leading-relaxed">
            Select your role or click any module tab below. Walk through 3-step guided mini-tours with live UI hotspots and verified ROI metrics.
          </p>
        </div>

        {/* ═══════════ 1. ROLE-BASED PERSONA SWITCHER ════════ */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
            Explore By Role:
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PERSONAS.map(p => {
              const PIcon = PERSONA_ICONS[p.id as keyof typeof PERSONA_ICONS]
              return (
              <button
                key={p.id}
                onClick={() => handlePersonaChange(p.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedPersona === p.id
                    ? 'bg-[#6366f1] text-white shadow-lg shadow-[#6366f1]/30 ring-1 ring-[#818cf8]/50'
                    : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10 border border-white/10'
                }`}
              >
                <PIcon className="w-3.5 h-3.5" />
                <span>{p.title}</span>
              </button>
              )
            })}
          </div>
        </div>


        {/* ═══════════ 2. MODULE TAB-BAR ════════════════════ */}
        <div className="flex items-center justify-center gap-2 flex-wrap mb-10 border-b border-white/10 pb-6">
          {MODULES.map(m => {
            const Icon = m.icon
            const active = activeModuleId === m.id
            return (
              <button
                key={m.id}
                onClick={() => handleModuleChange(m.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  active
                    ? 'bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white shadow-md border border-[#818cf8]/40'
                    : 'bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.08] border border-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{m.label}</span>
              </button>
            )
          })}
        </div>

        {/* ═══════════ 3. SPLIT-SCREEN TOUR LAYOUT ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* ───────────────────────────────────────────────────
              LEFT COLUMN (35% - 4 Cols on LG): CONTROLS & STEPPER
          ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-4 bg-[#0c0d1e] border border-white/10 rounded-xl p-6 sm:p-7 space-y-6 shadow-xl flex flex-col justify-between">

            <div>
              {/* Module Header & ROI Banner */}
              <div className="space-y-2 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#818cf8] uppercase tracking-wider">
                    {activeModule.label}
                  </span>
                  <span className="text-[10px] bg-[#10b981]/20 text-[#10b981] px-2 py-0.5 rounded-md font-mono">
                    Live Interactive Mode
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white">{activeModule.tagline}</h3>
                <div className="p-2.5 bg-[#10b981]/10 border border-[#10b981]/30 rounded-lg text-xs text-[#10b981] font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 shrink-0" />
                  <span>{activeModule.businessImpact}</span>
                </div>
              </div>

              {/* Progressive Stepper Steps */}
              <div className="space-y-4 mb-6">
                <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
                  Guided Tour Workflow ({currentStepIdx + 1} of {activeModule.steps.length})
                </p>

                {activeModule.steps.map((st, idx) => {
                  const isCurrent = currentStepIdx === idx
                  const isDone = idx < currentStepIdx || tourCompleted
                  return (
                    <div
                      key={st.stepNum}
                      onClick={() => { setCurrentStepIdx(idx); setTourCompleted(false) }}
                      className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-[#080918] border-[#6366f1] ring-1 ring-[#6366f1]/50'
                          : isDone
                          ? 'bg-white/[0.02] border-white/10 opacity-70'
                          : 'bg-white/[0.01] border-white/5 opacity-40 hover:opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                              isDone
                                ? 'bg-[#10b981] text-gray-900'
                                : isCurrent
                                ? 'bg-[#6366f1] text-white'
                                : 'bg-white/10 text-white/50'
                            }`}
                          >
                            {isDone ? <Check className="w-3 h-3 text-gray-900 stroke-[3]" /> : st.stepNum}
                          </span>
                          <span className="text-xs font-semibold text-white">{st.title}</span>
                        </div>
                        {isCurrent && (
                          <span className="flex h-2 w-2 rounded-full bg-[#6366f1] animate-ping" />
                        )}
                      </div>
                      {isCurrent && (
                        <div className="mt-2 text-xs text-white/70 space-y-2 animate-fade-up">
                          <p>{st.desc}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-[#c7d2fe] font-mono bg-[#6366f1]/20 p-2 rounded-md border border-[#6366f1]/30">
                          <Lightbulb className="w-3 h-3 shrink-0 text-[#818cf8]" /> Outcome: {st.roiMetric}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Bottom Controls: Mode Toggle & Persistent CTA */}
            <div className="space-y-4 pt-4 border-t border-white/10">

              {/* Autoplay vs Sandbox Toggle */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAutoplay(a => !a)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                      isAutoplay
                        ? 'bg-[#10b981] text-gray-900 shadow-md'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    {isAutoplay ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isAutoplay ? 'Pause Tour' : 'Autoplay Tour'}</span>
                  </button>
                  <button
                    onClick={handleResetTour}
                    className="p-1.5 text-white/40 hover:text-white transition-colors"
                    title="Reset Tour"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-[10px] text-white/40 font-mono">
                  {isAutoplay ? 'Autoplay Active' : 'Sandbox Mode'}
                </span>
              </div>

              {/* Persistent CTA */}
              <button
                onClick={() => { window.location.href = '/warehouse-erp/index.html#/signup' }}
                className="w-full flex items-center justify-center gap-2 bg-white text-gray-900 font-bold text-xs py-3 px-4 rounded-lg hover:bg-white/90 transition-all shadow-lg"
              >
                Start Free Trial Now <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

          {/* ───────────────────────────────────────────────────
              RIGHT COLUMN (65% - 8 Cols on LG): INTERACTIVE CANVAS
          ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-8 bg-[#0c0d1e] border border-white/10 rounded-xl p-6 sm:p-8 space-y-6 shadow-xl relative">

            {/* Hotspot Pulsing Indicator Header */}
            <div className="flex items-center justify-between bg-[#080918] border border-white/10 px-4 py-3 rounded-lg">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6366f1] animate-ping" />
                <span className="font-semibold text-white">Active Hotspot Objective:</span>
                <span className="text-[#818cf8] font-mono text-[11px] truncate max-w-xs sm:max-w-none">
                  {currentStep.hotspotLabel}
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-white/50 font-mono">
                <MousePointer className="w-3.5 h-3.5 text-[#818cf8]" /> Click hotspot to advance
              </div>
            </div>

            {/* Simulated Interactive Screen Mockup */}
            <div className="relative rounded-lg bg-[#080918] border border-white/10 p-6 overflow-hidden min-h-[420px] flex flex-col justify-between">

              {/* Screen Top Bar */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10 text-xs">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#818cf8]" />
                  <span className="font-bold text-white">NexWare ERP</span>
                  <span className="text-white/40">/ {activeModule.label}</span>
                </div>
                <span className="text-[10px] text-[#10b981] font-mono bg-[#10b981]/10 px-2 py-0.5 rounded-md">
                  ● WebSocket Sync Active
                </span>
              </div>

              {/* Dynamic Screen Content based on Active Module */}
              <div className="py-6 space-y-4 relative">

                {/* Module 1: Inventory */}
                {activeModuleId === 'inventory' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">Warehouse Inventory (247 Items)</span>
                      <button
                        onClick={handleHotspotClick}
                        className={`relative group px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          currentStepIdx === 2
                            ? 'bg-[#6366f1] text-white shadow-lg ring-4 ring-[#6366f1]/40 animate-bounce'
                            : 'bg-white/10 text-white/80 hover:bg-white/20'
                        }`}
                      >
                        + Add Stock Item
                        {currentStepIdx === 2 && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#10b981]"></span>
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold text-white">Industrial Steel Pipes (SKU-PIPE-001)</p>
                          <p className="text-[10px] text-white/40">Dallas Depot · Category: Tools</p>
                        </div>
                        <span className="text-[#10b981] font-bold font-mono">80 Pcs (Normal)</span>
                      </div>

                      <div
                        onClick={handleHotspotClick}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                          currentStepIdx === 0
                            ? 'bg-rose-500/20 border-rose-500 ring-2 ring-rose-500/50 animate-pulse'
                            : 'bg-white/5 border-white/5'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-white">Safety Helmets M (SKU-SAFE-003)</p>
                          <p className="text-[10px] text-white/40">Austin Depot · Category: Safety</p>
                        </div>
                        <span className="text-rose-400 font-bold font-mono inline-flex items-center gap-1">7 Pcs (<AlertTriangle className="w-3 h-3 text-rose-400" /> Low Stock Alert)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Module 2: Billing */}
                {activeModuleId === 'billing' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">Billing & Recent Invoices</span>
                      <button
                        onClick={handleHotspotClick}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          currentStepIdx === 2
                            ? 'bg-[#10b981] text-gray-900 shadow-lg ring-4 ring-[#10b981]/40 animate-bounce'
                            : 'bg-white/10 text-white/80'
                        }`}
                      >
                        Export PDF Summary
                      </button>
                    </div>

                    <div
                      onClick={handleHotspotClick}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        currentStepIdx === 0 || currentStepIdx === 1
                          ? 'bg-[#141638] border-[#6366f1] ring-2 ring-[#6366f1]/50'
                          : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <div className="flex justify-between items-center text-xs mb-2">
                        <span className="font-mono text-[#818cf8] font-bold">INV-0038</span>
                        <span className="text-[#10b981] font-semibold bg-[#10b981]/20 px-2 py-0.5 rounded">Paid</span>
                      </div>
                      <p className="text-sm font-bold text-white">Texas Ironworks Ltd.</p>
                      <div className="flex justify-between text-xs text-white/60 mt-2 font-mono">
                        <span>Tax Snapshot: $45.50 (5%)</span>
                        <span className="text-white font-bold text-sm">$955.50</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Module 3: Workforce */}
                {activeModuleId === 'workforce' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">Workforce RBAC Directory</span>
                      <span className="text-white/40">28 Active Members</span>
                    </div>

                    <div
                      onClick={handleHotspotClick}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                        currentStepIdx === 0
                          ? 'bg-[#6366f1]/20 border-[#6366f1] ring-2 ring-[#6366f1]/50'
                          : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#6366f1] flex items-center justify-center font-bold text-white">
                          SC
                        </div>
                        <div>
                          <p className="font-bold text-white">Sarah Connor</p>
                          <p className="text-[10px] text-white/40">sarah@nexware.com · Dallas Depot</p>
                        </div>
                      </div>
                      <span className="bg-[#6366f1]/30 text-[#818cf8] px-2.5 py-1 rounded-lg font-semibold text-[10px]">
                        Manager Tier
                      </span>
                    </div>
                  </div>
                )}

                {/* Module 4: Audit */}
                {activeModuleId === 'audit' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">Compliance Audit Trail Stream</span>
                      <button
                        onClick={handleHotspotClick}
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold ${
                          currentStepIdx === 2 ? 'bg-[#6366f1] text-white ring-2 ring-[#818cf8]' : 'bg-white/10 text-white/70'
                        }`}
                      >
                        Export Log CSV
                      </button>
                    </div>

                    <div
                      onClick={handleHotspotClick}
                      className={`p-3 rounded-xl border transition-all cursor-pointer text-xs space-y-1 ${
                        currentStepIdx === 0
                          ? 'bg-[#10b981]/10 border-[#10b981] ring-2 ring-[#10b981]/50'
                          : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <div className="flex justify-between text-[10px] text-white/40">
                        <span className="text-[#10b981] font-bold">item_create</span>
                        <span>May 28 · 14:32</span>
                      </div>
                      <p className="font-semibold text-white">Created item: Industrial Steel Pipes (SKU-PIPE-001)</p>
                      <p className="text-[10px] text-white/50">User: Alex Mercer · Tenant: Dallas Logistics Depot</p>
                    </div>
                  </div>
                )}

                {/* Module 5: Analytics */}
                {activeModuleId === 'analytics' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">Revenue & Stock Insights</span>
                      <span className="text-[#10b981] font-semibold">+18% YoY Growth</span>
                    </div>

                    <div
                      onClick={handleHotspotClick}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        currentStepIdx === 0 || currentStepIdx === 1
                          ? 'bg-[#6366f1]/20 border-[#6366f1] ring-2 ring-[#6366f1]/50'
                          : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <p className="text-xs text-white/60 mb-2">Revenue Breakdown by Warehouse</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-white/5 rounded-xl">
                          <p className="text-[10px] text-white/40">Houston HQ</p>
                          <p className="text-sm font-bold text-[#818cf8]">$58,900</p>
                        </div>
                        <div className="p-2 bg-white/5 rounded-xl">
                          <p className="text-[10px] text-white/40">Dallas Depot</p>
                          <p className="text-sm font-bold text-[#10b981]">$42,300</p>
                        </div>
                        <div className="p-2 bg-white/5 rounded-xl">
                          <p className="text-[10px] text-white/40">Austin North</p>
                          <p className="text-sm font-bold text-[#febc2e]">$23,550</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Hotspot Visual Feedback Notification */}
              {hotspotSuccess && (
                <div className="absolute inset-x-4 bottom-4 bg-[#10b981] text-gray-900 p-3 rounded-xl font-bold text-xs flex items-center justify-between shadow-2xl animate-fade-up">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Hotspot Validated! Advancing to next step...</span>
                  </div>
                  <Sparkles className="w-4 h-4" />
                </div>
              )}

              {/* Tour Completed Summary Card Overlay */}
              {tourCompleted && (
                <div className="absolute inset-0 bg-[#0c0e20]/95 backdrop-blur-md p-6 flex flex-col items-center justify-center text-center space-y-4 animate-fade-up">
                  <div className="w-14 h-14 rounded-full bg-[#10b981]/20 text-[#10b981] flex items-center justify-center border border-[#10b981]/40">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-xl font-bold text-white">
                    {activeModule.label} Tour Completed!
                  </h4>
                  <p className="text-xs text-white/70 max-w-md">
                    Validated Impact: <span className="text-[#10b981] font-bold">{activeModule.businessImpact}</span>. Ready to experience full multi-tenant ERP features live?
                  </p>
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleResetTour}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition-all"
                    >
                      Replay Tour
                    </button>
                    <button
                      onClick={() => { window.location.href = '/warehouse-erp/index.html#/signup' }}
                      className="px-5 py-2.5 bg-white text-gray-900 rounded-xl text-xs font-bold hover:bg-white/90 transition-all shadow-lg flex items-center gap-1.5"
                    >
                      Start Free Trial <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>

      </div>
    </section>
  )
}
