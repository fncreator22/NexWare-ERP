import { useState } from 'react'
import {
  CheckCircle2, ArrowRight, Phone, Globe,
  Sparkles, Calculator, Clock, TrendingUp, ExternalLink
} from 'lucide-react'
import Logo from './Logo'

interface FooterCTAProps {
  onOpenModal?: (moduleKey: string) => void
}

export default function FooterCTA({ onOpenModal }: FooterCTAProps) {
  const [monthlyInvoices, setMonthlyInvoices] = useState<number>(150)

  const hoursSaved = Math.round(monthlyInvoices * 0.8)
  const dollarsSaved = Math.round(monthlyInvoices * 45)

  const handleLaunchApp = (route: string) => {
    window.location.href = `/warehouse-erp/index.html#${route}`
  }

  return (
    <footer className="relative bg-[#08090c] text-white overflow-hidden border-t border-white/10">

      {/* ═══════════ 1. HIGH-TRUST CONVERSION CTA SECTION ════ */}
      <div id="get-started" className="relative z-10 py-16 lg:py-24 border-b border-white/10 bg-[#12151c]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10">

          <div className="bg-[#12151c] border border-white/15 rounded-xl p-8 sm:p-12 lg:p-16 shadow-2xl relative overflow-hidden">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">

              {/* Left Column */}
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md font-mono bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] text-xs uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" /> High-Trust Enterprise Onboarding
                </div>

                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-white leading-tight">
                  Empower Your Operations, Scale Without Limits
                </h2>

                <p className="text-sm sm:text-base text-white/70 leading-relaxed">
                  Join 2,500+ data-driven logistics, manufacturing, and distribution enterprises optimizing their supply chain, billing, and workforce on NexWare ERP.
                </p>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3 text-xs sm:text-sm text-white/90">
                    <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0" />
                    <span><strong>Live Deployment:</strong> Set up core multi-warehouse modules in under 30 days.</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs sm:text-sm text-white/90">
                    <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0" />
                    <span><strong>Bank-Grade Security:</strong> Argon2id encryption, SOC2 certified, and GDPR compliant.</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs sm:text-sm text-white/90">
                    <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0" />
                    <span><strong>Zero Friction Migration:</strong> Automated database ingest from legacy ERP platforms.</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-4">
                  <button
                    onClick={() => handleLaunchApp('/signup')}
                    className="flex items-center gap-2 bg-white text-gray-900 font-bold text-sm px-7 py-3.5 rounded-lg hover:bg-white/90 transition-all shadow-xl shadow-white/10"
                  >
                    Start Free Trial <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleLaunchApp('/login')}
                    className="flex items-center gap-2 bg-white/10 text-white font-semibold text-sm px-7 py-3.5 rounded-lg hover:bg-white/20 border border-white/20 transition-all"
                  >
                    Talk to an Expert
                  </button>
                </div>
              </div>

              {/* Right Column: Interactive ROI Calculator */}
              <div className="lg:col-span-5 bg-[#0d0f14] border border-white/10 rounded-lg p-6 space-y-6 shadow-2xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-[#f59e0b]" /> Estimate Monthly ROI Savings
                  </span>
                  <span className="text-[10px] text-[#10b981] font-mono bg-[#10b981]/10 px-2 py-0.5 rounded-md">
                    Interactive Calculator
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Monthly Invoices Issued:</span>
                    <span className="font-mono text-[#f59e0b] font-bold text-sm bg-[#f59e0b]/10 px-2.5 py-0.5 rounded-md">
                      {monthlyInvoices} Invoices / mo
                    </span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="1000"
                    step="10"
                    value={monthlyInvoices}
                    onChange={(e) => setMonthlyInvoices(Number(e.target.value))}
                    className="w-full accent-[#f59e0b] bg-white/10 rounded-lg cursor-pointer h-2"
                  />
                  <div className="flex justify-between text-[9px] text-white/40 font-mono">
                    <span>20 Invoices</span>
                    <span>500 Invoices</span>
                    <span>1,000+ Invoices</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 bg-white/[0.03] rounded-lg border border-white/5 space-y-1">
                    <div className="flex items-center gap-1 text-[10px] text-white/50">
                      <Clock className="w-3 h-3 text-[#10b981]" /> Est. Time Saved
                    </div>
                    <p className="text-xl font-bold text-white font-mono">{hoursSaved} Hrs / mo</p>
                    <p className="text-[9px] text-white/40">In billing & tax audit</p>
                  </div>

                  <div className="p-3.5 bg-white/[0.03] rounded-lg border border-white/5 space-y-1">
                    <div className="flex items-center gap-1 text-[10px] text-white/50">
                      <TrendingUp className="w-3 h-3 text-[#f59e0b]" /> Est. Cost Saved
                    </div>
                    <p className="text-xl font-bold text-[#10b981] font-mono">${dollarsSaved.toLocaleString()}</p>
                    <p className="text-[9px] text-white/40">Operational overhead</p>
                  </div>
                </div>

                <button
                  onClick={() => handleLaunchApp('/signup')}
                  className="w-full flex items-center justify-center gap-2 bg-[#f59e0b] text-[#08090c] font-bold text-xs py-3 rounded-lg hover:bg-[#d97706] transition-all shadow-md"
                >
                  Calculate & Claim Savings in ERP <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>

          </div>

        </div>
      </div>

      {/* ═══════════ 2. FULL MULTI-COLUMN FOOTER ══════════════ */}
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 py-16">

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-10 pb-12 border-b border-white/10">

          {/* COLUMN 1: BRAND & STATUS */}
          <div className="space-y-4">
            <a href="/" className="flex items-center gap-2.5 text-white">
              <div className="w-7 h-7 rounded-lg bg-[#f59e0b]/20 border border-[#f59e0b]/40 flex items-center justify-center text-[#f59e0b]">
                <Logo className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-lg tracking-tight">
                Nex<em className="not-italic text-[#f59e0b]">Ware</em>
              </span>
            </a>

            <p className="text-xs text-white/60 leading-relaxed">
              Autonomous enterprise resource planning for modern logistics and warehouse infrastructure.
            </p>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md font-mono bg-[#10b981]/10 border border-[#10b981]/30 w-fit">
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
              <span className="text-[11px] font-semibold text-[#10b981]">
                All Systems Operational
              </span>
            </div>

            <div className="pt-2 flex flex-wrap gap-1.5 text-[9px] font-mono">
              <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-white/70">SOC2 Certified</span>
              <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-white/70">ISO 27001</span>
              <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-white/70">HIPAA Ready</span>
            </div>
          </div>

          {/* COLUMN 2: PLATFORM MODULES (WITH DIRECT REDIRECTIONS) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Platform Modules
            </h4>
            <ul className="space-y-2 text-xs text-white/60">
              <li>
                <button onClick={() => onOpenModal?.('finance')} className="hover:text-white transition-colors duration-150 text-left">
                  Financial Management & Tax
                </button>
              </li>
              <li>
                <button onClick={() => onOpenModal?.('logistics')} className="hover:text-white transition-colors duration-150 text-left">
                  Supply Chain & Logistics
                </button>
              </li>
              <li>
                <button onClick={() => onOpenModal?.('workforce')} className="hover:text-white transition-colors duration-150 text-left">
                  Workforce & 5-Tier RBAC
                </button>
              </li>
              <li>
                <button onClick={() => handleLaunchApp('/items')} className="hover:text-white transition-colors duration-150 text-left">
                  Multi-Warehouse Inventory
                </button>
              </li>
              <li>
                <button onClick={() => onOpenModal?.('data')} className="hover:text-white transition-colors duration-150 text-left">
                  Dynamic Schema Tables
                </button>
              </li>
              <li>
                <button onClick={() => onOpenModal?.('audit')} className="hover:text-white transition-colors duration-150 text-left">
                  Compliance Audit Trail Stream
                </button>
              </li>
            </ul>
          </div>

          {/* COLUMN 3: RESOURCES & TOOLS */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Resources & Tools
            </h4>
            <ul className="space-y-2 text-xs text-white/60">
              <li>
                <button onClick={() => onOpenModal?.('api_docs')} className="hover:text-white transition-colors duration-150 text-left">
                  Documentation & API Reference
                </button>
              </li>
              <li>
                <button onClick={() => onOpenModal?.('sys_arch')} className="hover:text-white transition-colors duration-150 text-left">
                  System Architecture Specs
                </button>
              </li>
              <li>
                <a href="#get-started" className="hover:text-white transition-colors duration-150 block">
                  Interactive ROI Calculator
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-white transition-colors duration-150 block">
                  Customer Case Studies
                </a>
              </li>
              <li>
                <button onClick={() => onOpenModal?.('academy')} className="hover:text-white transition-colors duration-150 text-left">
                  NexWare ERP Academy
                </button>
              </li>
            </ul>
          </div>

          {/* COLUMN 4: CORPORATE & TRUST */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Corporate & Trust
            </h4>
            <ul className="space-y-2 text-xs text-white/60">
              <li>
                <button onClick={() => onOpenModal?.('about')} className="hover:text-white transition-colors duration-150 text-left">
                  About NexWare ERP
                </button>
              </li>
              <li>
                <button onClick={() => onOpenModal?.('leadership')} className="hover:text-white transition-colors duration-150 text-left">
                  Leadership Team
                </button>
              </li>
              <li>
                <button onClick={() => onOpenModal?.('press')} className="hover:text-white transition-colors duration-150 text-left">
                  Newsroom & Press
                </button>
              </li>
              <li>
                <button onClick={() => onOpenModal?.('careers')} className="hover:text-white transition-colors duration-150 text-left">
                  Careers (We're Hiring)
                </button>
              </li>
              <li>
                <a href="#security-faq" className="hover:text-white transition-colors duration-150 block">
                  Trust Center & Compliance
                </a>
              </li>
              <li>
                <a href="#security-faq" className="hover:text-white transition-colors duration-150 block">
                  Security Disclosure Policy
                </a>
              </li>
            </ul>
          </div>

          {/* COLUMN 5: ENTERPRISE SUPPORT */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Enterprise Support
            </h4>
            <div className="space-y-2 text-xs text-white/60">
              <div className="flex items-center gap-2 text-white font-medium">
                <Phone className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span>Sales: contact@nexware.io</span>
              </div>
              <p className="text-[11px] text-[#10b981]">24/7/365 Priority Help Desk</p>
              <ul className="space-y-2 pt-1">
                <li>
                  <button onClick={() => handleLaunchApp('/signup')} className="hover:text-white transition-colors duration-150 text-left">
                    Professional Deployment
                  </button>
                </li>
                <li>
                  <button onClick={() => onOpenModal?.('partners')} className="hover:text-white transition-colors duration-150 text-left">
                    Partner Network
                  </button>
                </li>
                <li>
                  <button onClick={() => handleLaunchApp('/login')} className="hover:text-white transition-colors duration-150 text-left">
                    Schedule Premium Training
                  </button>
                </li>
                <li>
                  <button onClick={() => onOpenModal?.('integrations')} className="hover:text-white transition-colors duration-150 text-left">
                    System Integrations Guide
                  </button>
                </li>
              </ul>
            </div>
          </div>

        </div>

        {/* 3. BOTTOM BAR (LEGAL & UTILITY) */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/50">
          <div>
            © 2026 NexWare ERP, Inc. All rights reserved. Powered by FastAPI & MongoDB.
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => onOpenModal?.('privacy')} className="hover:text-white transition-colors duration-150">Privacy Policy</button>
            <button onClick={() => onOpenModal?.('terms')} className="hover:text-white transition-colors duration-150">Terms of Service</button>
            <button onClick={() => onOpenModal?.('sla')} className="hover:text-white transition-colors duration-150">SLA Agreement</button>
            <button onClick={() => onOpenModal?.('cookies')} className="hover:text-white transition-colors duration-150">Cookie Preferences</button>
          </div>

          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1 rounded-md text-white/70 text-[11px]">
            <Globe className="w-3.5 h-3.5 text-[#f59e0b]" />
            <span>Global (English)</span>
          </div>
        </div>

      </div>
    </footer>
  )
}
