import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  UploadCloud, Workflow, BarChart3, TrendingUp,
  CheckCircle2, ArrowRight, Database,
  ChevronDown, ChevronUp, Bot, FileSpreadsheet
} from 'lucide-react'

/* ─── Data: 4 Workflow Steps ─────────────────────────────── */
interface WorkflowStep {
  id: number
  badge: string
  title: string
  subtitle: string
  icon: LucideIcon
  accentColor: string
  bgGlow: string
  copy: string
  valueProp: string
  uiPreviewType: 'ingestion' | 'automation' | 'analytics' | 'growth'
  techSpecs: {
    title: string
    details: string[]
  }
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 1,
    badge: 'Step 1: Centralize',
    title: 'Data Ingestion & Import',
    subtitle: 'Connect your existing tools & import data instantly',
    icon: UploadCloud,
    accentColor: '#6366f1',
    bgGlow: 'from-[#6366f1]/20 to-[#6366f1]/5',
    copy: 'Eliminate disconnected data silos by bulk importing CSV manifests, legacy database records, and SKU catalogues into isolated tenant storage.',
    valueProp: 'Eliminates disconnected data silos & manual entry',
    uiPreviewType: 'ingestion',
    techSpecs: {
      title: 'Ingestion & Security Protocols',
      details: [
        'Bulk CSV & JSON parser with SKU uniqueness validation',
        'Argon2id password hashing & multi-tenant namespace isolation',
        'Automated field mapping for legacy ERP migrations',
      ],
    },
  },
  {
    id: 2,
    badge: 'Step 2: Automate',
    title: 'Smart Trigger Workflows',
    subtitle: 'Replace repetitive manual tasks with triggers',
    icon: Bot,
    accentColor: '#10b981',
    bgGlow: 'from-[#10b981]/20 to-[#10b981]/5',
    copy: 'Define business logic rules: when an invoice is issued, stock decrements atomically across warehouse records, and compliance audit events log instantly.',
    valueProp: 'Reduces human operational errors by 99%',
    uiPreviewType: 'automation',
    techSpecs: {
      title: 'Automation & Ledger Engine',
      details: [
        'Atomic database transactions preventing double-allocation',
        'Configurable standard (5%) & luxury (15%) tax snapshotting',
        'Role-aware WebSocket notification broadcasts',
      ],
    },
  },
  {
    id: 3,
    badge: 'Step 3: Optimize',
    title: 'Live Real-Time Analytics',
    subtitle: 'Track key operational metrics in real time',
    icon: BarChart3,
    accentColor: '#febc2e',
    bgGlow: 'from-[#febc2e]/20 to-[#febc2e]/5',
    copy: 'Monitor revenue trends, stock health indicators, and warehouse productivity in real-time backed by MongoDB Change Streams & WebSocket push updates.',
    valueProp: 'Bridges raw inventory data to decision making',
    uiPreviewType: 'analytics',
    techSpecs: {
      title: 'Realtime & Analytics Layer',
      details: [
        'MongoDB Change Streams broadcasting state updates',
        'Chart.js visualizers for 6-month revenue & warehouse share',
        'Low-stock threshold alerts pushed instantly to active tabs',
      ],
    },
  },
  {
    id: 4,
    badge: 'Step 4: Scale',
    title: 'Enterprise Growth Engine',
    subtitle: 'Expand operations without operational friction',
    icon: TrendingUp,
    accentColor: '#818cf8',
    bgGlow: 'from-[#818cf8]/20 to-[#818cf8]/5',
    copy: 'Add unlimited warehouse locations, invite staff with 5-tier RBAC access, and build dynamic custom data schemas as your enterprise expands.',
    valueProp: 'Adapts smoothly to enterprise business growth',
    uiPreviewType: 'growth',
    techSpecs: {
      title: 'Scale & Extensibility Architecture',
      details: [
        'Dynamic table builder for custom operational schemas',
        '5-tier role-based permissions (Super Admin → Employee)',
        'Tamper-evident audit log stream per warehouse location',
      ],
    },
  },
]

/* ─── Component ──────────────────────────────────────────── */
export default function HowItWorks() {
  const [activeStepId, setActiveStepId] = useState<number>(1)
  const [expandedSpecId, setExpandedSpecId] = useState<number | null>(null)
  const ingestFile = 'inventory_manifest_2026.csv'
  const [ingestSuccess, setIngestSuccess] = useState<boolean>(false)

  const activeStep = WORKFLOW_STEPS.find(s => s.id === activeStepId) || WORKFLOW_STEPS[0]
  const StepIcon = activeStep.icon

  // Simulate file drag/drop click
  const handleSimulateUpload = () => {
    setIngestSuccess(true)
    setTimeout(() => setIngestSuccess(false), 2000)
  }

  return (
    <section id="how-it-works" className="relative bg-[#070814] text-white py-20 lg:py-32 overflow-hidden border-t border-white/5">

      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 relative z-10">

        {/* ═══════════ SECTION HEADER ════════════════════════ */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#6366f1]/10 border border-[#6366f1]/30 text-[#818cf8] text-xs font-mono font-semibold uppercase tracking-wider mb-4">
            <Workflow className="w-3.5 h-3.5" /> Linear 4-Step Onboarding Architecture
          </div>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white mb-4">
            From Zero to Real-Time ERP Operations<br />
            <span className="bg-gradient-to-r from-white via-[#c7d2fe] to-[#10b981] bg-clip-text text-transparent">
              In under 5 minutes
            </span>
          </h2>
          <p className="text-sm sm:text-base text-white/60 leading-relaxed">
            Eliminate complex months-long ERP implementation cycles. NexWare’s streamlined onboarding flow centralizes, automates, optimizes, and scales your supply chain smoothly.
          </p>
        </div>

        {/* ═══════════ STEPPER GRID & CONNECTING LINE ════════ */}
        <div className="relative mb-16">

          {/* Desktop Connecting Line (Neon Accent) */}
          <div className="hidden lg:block absolute top-1/2 left-12 right-12 h-1 bg-white/10 -translate-y-1/2 z-0">
            <div
              className="h-full bg-gradient-to-r from-[#6366f1] via-[#10b981] to-[#818cf8] transition-all duration-700"
              style={{ width: `${((activeStepId - 1) / 3) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            {WORKFLOW_STEPS.map((st) => {
              const Icon = st.icon
              const isActive = activeStepId === st.id
              return (
                <div
                  key={st.id}
                  onClick={() => setActiveStepId(st.id)}
                  className={`group relative bg-[#0c0d1e] border rounded-xl p-6 transition-all duration-300 cursor-pointer flex flex-col justify-between shadow-xl ${
                    isActive
                      ? 'border-[#6366f1] ring-1 ring-[#6366f1]/50 scale-[1.02]'
                      : 'border-white/10 hover:border-white/20 hover:bg-[#111328]'
                  }`}
                >
                  <div>
                    {/* Top Row: Icon & Step Badge */}
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className="w-11 h-11 rounded-lg flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110"
                        style={{ background: st.accentColor }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-mono font-bold text-white/50 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                        {st.badge}
                      </span>
                    </div>

                    {/* Step Title & Subtitle */}
                    <h3 className="text-lg font-bold text-white mb-1">{st.title}</h3>
                    <p className="text-xs text-white/60 leading-relaxed mb-4">{st.subtitle}</p>
                  </div>

                  {/* Value Proposition Badge */}
                  <div className="pt-4 border-t border-white/5 flex items-center justify-between text-[11px]">
                    <span className="text-[#10b981] font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {st.valueProp}
                    </span>
                    <span className="text-white/40 group-hover:text-white transition-colors">
                      →
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ═══════════ DETAILED DISPLAY WIDGET & PREVIEW ═══════ */}
        <div className="bg-[#0c0d1e] border border-white/10 rounded-xl p-6 sm:p-8 lg:p-10 shadow-xl relative overflow-hidden">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

            {/* Left 6 Columns: Active Step Deep Dive */}
            <div className="lg:col-span-6 space-y-6">

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-mono font-bold text-white bg-white/10 border border-white/10">
                <StepIcon className="w-4 h-4" style={{ color: activeStep.accentColor }} />
                <span>Active Onboarding Phase {activeStep.id} of 4</span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-bold text-white">
                {activeStep.title}
              </h3>

              <p className="text-sm text-white/70 leading-relaxed">
                {activeStep.copy}
              </p>

              <div className="p-4 rounded-lg bg-[#080918] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#10b981]">
                  <CheckCircle2 className="w-4 h-4" /> Core Business Value Delivered:
                </div>
                <p className="text-xs text-white/80 font-medium">
                  {activeStep.valueProp}
                </p>
              </div>

              {/* Progressive Disclosure: Technical Specification Toggle */}
              <div className="pt-2">
                <button
                  onClick={() => setExpandedSpecId(expandedSpecId === activeStep.id ? null : activeStep.id)}
                  className="flex items-center gap-2 text-xs font-semibold text-[#818cf8] hover:text-white transition-colors"
                >
                  <span>
                    {expandedSpecId === activeStep.id ? 'Hide Technical Architecture Specs' : 'View Technical Architecture Specs'}
                  </span>
                  {expandedSpecId === activeStep.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {expandedSpecId === activeStep.id && (
                  <div className="mt-3 p-4 rounded-lg bg-[#080918] border border-[#6366f1]/30 text-xs space-y-3 animate-fade-up">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="font-bold text-white">{activeStep.techSpecs.title}</span>
                    </div>
                    <ul className="space-y-1.5 text-white/70 text-[11px]">
                      {activeStep.techSpecs.details.map((d, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="text-[#10b981]">●</span> {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

            </div>

            {/* Right 6 Columns: Interactive Visual Mockup Widget */}
            <div className="lg:col-span-6 bg-[#080918] border border-white/10 rounded-lg p-6 relative min-h-[340px] flex flex-col justify-between">

              {/* Step 1 Preview: Ingestion Dropzone */}
              {activeStep.uiPreviewType === 'ingestion' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white flex items-center gap-2">
                      <Database className="w-4 h-4 text-[#6366f1]" /> Central Data Dropzone
                    </span>
                    <span className="text-[10px] text-[#10b981] font-mono">CSV / JSON / SQL Supported</span>
                  </div>

                  <div
                    onClick={handleSimulateUpload}
                    className="border-2 border-dashed border-[#6366f1]/40 hover:border-[#6366f1] bg-white/[0.02] hover:bg-white/[0.04] p-8 rounded-lg text-center space-y-3 cursor-pointer transition-all duration-300 group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-[#6366f1]/20 text-[#818cf8] flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Click or Drag & Drop Data File</p>
                      <p className="text-[10px] text-white/50 mt-1">Simulate ingestion of manifest & SKU database</p>
                    </div>
                    <div className="inline-flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-md text-[10px] text-[#c7d2fe] font-mono">
                      <FileSpreadsheet className="w-3 h-3" /> {ingestFile}
                    </div>
                  </div>

                  {ingestSuccess && (
                    <div className="p-3 bg-[#10b981] text-gray-900 rounded-lg text-xs font-bold flex items-center justify-between animate-fade-up">
                      <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Ingested 247 items & 4 warehouse mappings into tenant!</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>
              )}

              {/* Step 2 Preview: Automated Logic Flowchart */}
              {activeStep.uiPreviewType === 'automation' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white flex items-center gap-2">
                      <Bot className="w-4 h-4 text-[#10b981]" /> Active Workflow Execution
                    </span>
                    <span className="text-[10px] text-[#10b981] font-mono">● Zero Human Delay</span>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3 bg-[#080918] rounded-lg border border-white/10 flex items-center justify-between text-xs">
                      <span className="text-white/60">1. Invoice Event Triggered</span>
                      <span className="text-[#10b981] font-mono font-bold">INV-0038 Issued</span>
                    </div>

                    <div className="flex justify-center">
                      <div className="w-0.5 h-6 bg-gradient-to-b from-[#10b981] to-[#6366f1] animate-pulse" />
                    </div>

                    <div className="p-3 bg-[#080918] rounded-lg border border-white/10 flex items-center justify-between text-xs">
                      <span className="text-white/60">2. Tax Rate Snapshot Applied</span>
                      <span className="text-[#febc2e] font-mono font-bold">5% Standard ($45.50)</span>
                    </div>

                    <div className="flex justify-center">
                      <div className="w-0.5 h-6 bg-gradient-to-b from-[#febc2e] to-[#818cf8] animate-pulse" />
                    </div>

                    <div className="p-3 bg-[#080918] rounded-lg border border-white/10 flex items-center justify-between text-xs">
                      <span className="text-white/60">3. Stock Decrement & Audit Log</span>
                      <span className="text-[#818cf8] font-mono font-bold">Atomic 80 Pcs</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3 Preview: Live Analytics Metrics */}
              {activeStep.uiPreviewType === 'analytics' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-[#febc2e]" /> Real-Time Analytics Counter
                    </span>
                    <span className="text-[10px] text-[#febc2e] font-mono">Live WebSocket Broadcast</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 bg-[#080918] rounded-lg border border-white/10 space-y-1">
                      <span className="text-[10px] text-white/40 uppercase">Total Revenue</span>
                      <p className="text-xl font-bold text-white font-mono">$124,700</p>
                      <span className="text-[9px] text-[#10b981]">↑ 18% vs last month</span>
                    </div>
                    <div className="p-3.5 bg-[#080918] rounded-lg border border-white/10 space-y-1">
                      <span className="text-[10px] text-white/40 uppercase">Invoices Issued</span>
                      <p className="text-xl font-bold text-white font-mono">38</p>
                      <span className="text-[9px] text-[#10b981]">100% Paid on time</span>
                    </div>
                  </div>

                  <div className="p-3 bg-[#080918] rounded-lg border border-white/10 flex items-center justify-between text-xs">
                    <span className="text-white/60">Stock Health Index</span>
                    <span className="text-[#10b981] font-bold font-mono">94% Healthy</span>
                  </div>
                </div>
              )}

              {/* Step 4 Preview: Growth Expansion */}
              {activeStep.uiPreviewType === 'growth' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[#818cf8]" /> Enterprise Growth Matrix
                    </span>
                    <span className="text-[10px] text-[#818cf8] font-mono">Unlimited Scaling</span>
                  </div>

                  <div className="space-y-2">
                    <div className="p-3 bg-[#080918] rounded-lg border border-white/10 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-white">Dallas Logistics Depot</p>
                        <p className="text-[10px] text-white/40">5 Staff · $42,300 Revenue</p>
                      </div>
                      <span className="text-[#10b981] font-semibold">Active ●</span>
                    </div>

                    <div className="p-3 bg-[#080918] rounded-lg border border-white/10 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-white">Houston HQ Distribution</p>
                        <p className="text-[10px] text-white/40">8 Staff · $58,900 Revenue</p>
                      </div>
                      <span className="text-[#10b981] font-semibold">Active ●</span>
                    </div>

                    <div className="p-3 bg-[#080918] rounded-lg border border-white/10 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-white">Austin Depot North</p>
                        <p className="text-[10px] text-white/40">3 Staff · $23,550 Revenue</p>
                      </div>
                      <span className="text-[#10b981] font-semibold">Active ●</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Nav Buttons for Widget */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10 text-xs">
                <button
                  onClick={() => setActiveStepId(prev => (prev === 1 ? 4 : prev - 1))}
                  className="text-white/50 hover:text-white transition-colors"
                >
                  ← Previous Step
                </button>

                <button
                  onClick={() => setActiveStepId(prev => (prev === 4 ? 1 : prev + 1))}
                  className="flex items-center gap-1 font-bold text-[#818cf8] hover:text-white transition-colors"
                >
                  <span>Next Step</span> <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  )
}
