import { useState } from 'react'
import { ChevronDown, Menu, X, ExternalLink, Shield, FileText, Users, Building2 } from 'lucide-react'
import Logo from './Logo'

interface NavbarProps {
  onOpenModal?: (moduleKey: string) => void
}

export default function Navbar({ onOpenModal }: NavbarProps) {
  const [open, setOpen] = useState(false)
  const [featuresOpen, setFeaturesOpen] = useState(false)

  const handleLaunchApp = (route: string) => {
    window.location.href = `/warehouse-erp/index.html#${route}`
  }

  return (
    <nav className="animate-fade-down sticky top-0 z-40 backdrop-blur-xl bg-[#070814]/80 border-b border-white/10 transition-all">
      <div className="flex items-center justify-between px-5 sm:px-8 lg:px-10 py-4 sm:py-4 max-w-7xl mx-auto">

        {/* ── LOGO ─────────────────────────────────── */}
        <a href="/" className="flex items-center gap-2.5 text-white group">
          <div className="w-8 h-8 rounded-xl bg-[#6366f1]/20 border border-[#6366f1]/40 flex items-center justify-center text-[#818cf8] group-hover:scale-105 transition-transform">
            <Logo className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-base tracking-tight">
            Nex<em className="not-italic text-[#818cf8]">Ware</em> <span className="text-[10px] font-mono uppercase bg-white/10 px-1.5 py-0.5 rounded text-white/60 ml-1">ERP</span>
          </span>
        </a>

        {/* ── DESKTOP NAV ──────────────────────────── */}
        <div className="hidden md:flex items-center gap-7">
          
          {/* Features Dropdown */}
          <div className="relative">
            <button
              onClick={() => setFeaturesOpen(o => !o)}
              className="flex items-center gap-1 text-[13px] text-white/80 hover:text-white transition-colors py-1"
            >
              Modules <ChevronDown className={`w-3.5 h-3.5 transition-transform ${featuresOpen ? 'rotate-180' : ''}`} />
            </button>

            {featuresOpen && (
              <div
                className="absolute left-0 top-full mt-2 w-64 rounded-2xl bg-[#0f1029]/95 backdrop-blur-xl border border-white/15 p-2 shadow-2xl space-y-1 animate-fade-up z-50"
                onMouseLeave={() => setFeaturesOpen(false)}
              >
                <div
                  onClick={() => { setFeaturesOpen(false); onOpenModal?.('finance') }}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/10 text-xs text-white cursor-pointer transition-colors"
                >
                  <FileText className="w-4 h-4 text-[#818cf8]" />
                  <div>
                    <p className="font-semibold">Financial & Tax Engine</p>
                    <p className="text-[10px] text-white/40">Invoices, GL, 5%/15% tax</p>
                  </div>
                </div>

                <div
                  onClick={() => { setFeaturesOpen(false); onOpenModal?.('logistics') }}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/10 text-xs text-white cursor-pointer transition-colors"
                >
                  <Building2 className="w-4 h-4 text-[#10b981]" />
                  <div>
                    <p className="font-semibold">Multi-Warehouse Logistics</p>
                    <p className="text-[10px] text-white/40">Live GPS tracking & SKUs</p>
                  </div>
                </div>

                <div
                  onClick={() => { setFeaturesOpen(false); onOpenModal?.('workforce') }}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/10 text-xs text-white cursor-pointer transition-colors"
                >
                  <Users className="w-4 h-4 text-amber-400" />
                  <div>
                    <p className="font-semibold">5-Tier Workforce RBAC</p>
                    <p className="text-[10px] text-white/40">Cascading user access</p>
                  </div>
                </div>

                <div
                  onClick={() => { setFeaturesOpen(false); onOpenModal?.('audit') }}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/10 text-xs text-white cursor-pointer transition-colors"
                >
                  <Shield className="w-4 h-4 text-rose-400" />
                  <div>
                    <p className="font-semibold">Compliance Audit Stream</p>
                    <p className="text-[10px] text-white/40">Tamper-evident logs</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <a href="#features"      className="text-[13px] text-white/80 hover:text-white transition-colors">Features</a>
          <a href="#interactive-tour" className="text-[13px] text-white/80 hover:text-white transition-colors">Product Tour</a>
          <a href="#how-it-works"  className="text-[13px] text-white/80 hover:text-white transition-colors">How It Works</a>
          <a href="#pricing"       className="text-[13px] text-white/80 hover:text-white transition-colors">Pricing</a>
          <a href="#security-faq"  className="text-[13px] text-white/80 hover:text-white transition-colors">Security FAQ</a>
        </div>

        {/* ── CTA + LOGIN REDIRECTION ──────────────── */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleLaunchApp('/login')}
            className="hidden sm:block text-[13px] text-white/80 hover:text-white font-medium px-3 py-1.5 transition-colors"
          >
            Log In
          </button>

          <button
            onClick={() => handleLaunchApp('/signup')}
            className="bg-white text-gray-900 text-[13px] font-bold px-4 sm:px-5 py-2 rounded-full hover:bg-white/90 transition-all shadow-md flex items-center gap-1.5"
          >
            Start Free Trial <ExternalLink className="w-3 h-3" />
          </button>

          {/* Hamburger (md:hidden) */}
          <button
            onClick={() => setOpen(o => !o)}
            aria-label="Toggle mobile menu"
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── MOBILE DROPDOWN ──────────────────────────── */}
      {open && (
        <div className="absolute left-4 right-4 top-full rounded-2xl bg-[#0f1029]/95 backdrop-blur-xl border border-white/15 px-5 py-4 animate-fade-up md:hidden space-y-3 shadow-2xl">
          <div className="space-y-2 border-b border-white/10 pb-3">
            <p className="text-[10px] font-mono uppercase text-white/40 font-bold">Navigation Links</p>
            {['Features', 'Product Tour', 'How It Works', 'Pricing', 'Security FAQ'].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/ /g, '-')}`}
                onClick={() => setOpen(false)}
                className="block py-1.5 text-[14px] text-white/80 hover:text-white transition-colors"
              >
                {item}
              </a>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={() => handleLaunchApp('/login')}
              className="w-full py-2.5 rounded-xl border border-white/20 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Log In to NexWare ERP
            </button>
            <button
              onClick={() => handleLaunchApp('/signup')}
              className="w-full py-2.5 rounded-xl bg-white text-gray-900 text-xs font-bold hover:bg-white/90 transition-colors"
            >
              Create Free Account →
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
