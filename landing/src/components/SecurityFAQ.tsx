import { useState, useMemo } from 'react'
import {
  ShieldCheck, Lock, Key, Database, Search,
  ChevronDown, CheckCircle2, Share2, Server
} from 'lucide-react'

/* ─── Types & FAQ Data ───────────────────────────────────── */
interface FAQItem {
  id: string
  category: 'encryption' | 'iam' | 'audit' | 'sla'
  question: string
  badge: string
  answer: string
  technicalDetails?: string[]
}

const FAQ_CATEGORIES = [
  { id: 'all',        label: 'All Questions',           icon: ShieldCheck },
  { id: 'encryption', label: 'Data Protection & Storage',icon: Lock        },
  { id: 'iam',        label: 'IAM & Access Control',    icon: Key         },
  { id: 'audit',      label: 'Audit & Authentication',  icon: Database    },
  { id: 'sla',        label: 'Uptime SLA & Exports',     icon: Server      },
] as const

const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'data-encryption',
    category: 'encryption',
    question: 'How is data encrypted at rest and in transit across NexWare ERP?',
    badge: 'AES-256 & TLS 1.3',
    answer: 'All database assets and tenant stores are encrypted at rest using industry-standard AES-256 algorithms. Direct TLS 1.3 transport layer encryption protects all live API communications between client browsers, WebSocket sockets, and FastAPI instances.',
    technicalDetails: [
      'Database: Encrypted at rest via AES-256 bit keys',
      'Transport: Encrypted via TLS 1.3 with HSTS enforcement',
      'Key Management: Automated 90-day cryptographic key rotation',
    ],
  },
  {
    id: 'data-sovereignty',
    category: 'encryption',
    question: 'Where are data centers located and how is multi-tenant isolation enforced?',
    badge: 'ISO 27001 Certified',
    answer: 'NexWare ERP utilizes multi-region cloud infrastructure deployed in regional data centers. Multi-tenant isolation is enforced at token, service, and repository layers—architecturally preventing cross-tenant data access.',
    technicalDetails: [
      'Multi-region MongoDB Atlas deployments with zero-downtime failover',
      'Triple-layer tenant ID verification on every database query',
      'Compliant with GDPR, HIPAA, and regional data residency laws',
    ],
  },
  {
    id: 'saml-sso',
    category: 'iam',
    question: 'Does the platform support Single Sign-On (SSO) & Identity Providers?',
    badge: 'SAML 2.0 & OIDC',
    answer: 'Yes. Enterprise instances integrate natively with major Identity Providers (IdPs) via SAML 2.0, OpenID Connect (OIDC), Microsoft Entra ID, Okta, and Google Workspace.',
    technicalDetails: [
      'SAML 2.0 and OIDC protocol support',
      'Automated just-in-time (JIT) user provisioning',
      'Enforced Multi-Factor Authentication (MFA) step-up rules',
    ],
  },
  {
    id: 'rbac-permissions',
    category: 'iam',
    question: 'How do we configure role-based access control (RBAC) for team members?',
    badge: '5-Tier RBAC',
    answer: 'Administrators can assign users to 5 distinct permission tiers: Super Admin, Admin, Manager, Staff, and Employee. Permissions cascade hierarchically so team members only see data scoped to their tier and assigned warehouse location.',
    technicalDetails: [
      'Granular read/write permissions at API route and UI module layers',
      'Location-based scope restrictions (e.g. Dallas Depot staff cannot view Houston HQ data)',
      'Instant permission updates without requiring user re-login',
    ],
  },
  {
    id: 'audit-logging',
    category: 'audit',
    question: 'How does the compliance audit log stream prevent tampering?',
    badge: 'Tamper-Evident Stream',
    answer: 'Every critical system event—including user logins, item creations, invoice generations, warehouse configuration updates, and password changes—is automatically logged with user identity, exact timestamp, and tenant scope.',
    technicalDetails: [
      'Immutable, append-only MongoDB log collections',
      'Exportable to CSV for external regulatory compliance reviews',
      'Role-aware visibility filters built directly into the UI',
    ],
  },
  {
    id: 'auth-security',
    category: 'audit',
    question: 'How is authentication secured against brute-force and credential stuffing?',
    badge: 'Argon2id & Redis Limiter',
    answer: 'User passwords are hashed using Argon2id—the gold standard for password security. Sessions use 15-minute JWT access tokens coupled with 7-day rotating refresh tokens backed by Redis sliding-window rate limiting.',
    technicalDetails: [
      'Argon2id memory-hard password hashing algorithm',
      'Short-lived 15-minute JWT access tokens with database session revocation',
      'Production-grade sliding-window rate limiter protecting /login endpoints',
    ],
  },
  {
    id: 'uptime-sla',
    category: 'sla',
    question: 'What is the guaranteed uptime SLA and how is system health monitored?',
    badge: '99.99% Uptime SLA',
    answer: 'NexWare ERP guarantees a 99.99% system uptime SLA. Live health checks constantly monitor database, cache, and WebSocket subsystems at public /health endpoints.',
    technicalDetails: [
      '99.99% availability backed by financial SLA credits',
      '24/7 automated ping checks on REST and WebSocket endpoints',
      'Real-time status updates broadcast on footer health indicators',
    ],
  },
  {
    id: 'data-exports',
    category: 'sla',
    question: 'Can we export complete database backups for local accounting software?',
    badge: 'Instant CSV / PDF',
    answer: 'Yes. Administrators can export any inventory manifest, invoice ledger, workforce table, or audit log to raw CSV or formatted PDF files at any time without vendor lock-in.',
    technicalDetails: [
      'One-click CSV & PDF export for all system data tables',
      'No data export fees or artificial throttling',
      'Compatible with QuickBooks, SAP, Xero, and Excel',
    ],
  },
]

/* ─── Component ──────────────────────────────────────────── */
export default function SecurityFAQ() {
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>('data-encryption')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Filter FAQ items by category & search query
  const filteredItems = useMemo(() => {
    return FAQ_ITEMS.filter(item => {
      const matchCat = activeCategory === 'all' || item.category === activeCategory
      const q = searchQuery.toLowerCase()
      const matchQuery =
        !q ||
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.badge.toLowerCase().includes(q)
      return matchCat && matchQuery
    })
  }, [activeCategory, searchQuery])

  // Single-Active accordion toggle
  const toggleAccordion = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id))
  }

  // Copy deep link URL
  const copyDeepLink = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `${window.location.origin}${window.location.pathname}#faq-${id}`
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <section id="security-faq" className="relative bg-[#070814] text-white py-20 lg:py-32 overflow-hidden border-t border-white/5">

      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 relative z-10">

        {/* ═══════════ SECTION HEADER ════════════════════════ */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md font-mono bg-[#6366f1]/10 border border-[#6366f1]/30 text-[#818cf8] text-xs uppercase tracking-wider mb-4">
            <ShieldCheck className="w-3.5 h-3.5" /> Enterprise Security & Compliance FAQ
          </div>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white mb-4">
            Data Governance & Security Architecture
          </h2>
          <p className="text-sm sm:text-base text-white/60 leading-relaxed">
            Precise answers regarding encryption standards, 5-tier RBAC access controls, audit streams, and system SLAs for IT directors & compliance auditors.
          </p>
        </div>

        {/* ═══════════ STICKY SEARCH ANCHOR BAR ══════════════ */}
        <div className="max-w-2xl mx-auto mb-12 relative">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 text-white/40 absolute left-4 pointer-events-none" />
            <input
              type="text"
              placeholder="Search security questions (e.g. SAML, AES-256, RBAC, Argon2id, SLA)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0c0d1e] border border-white/15 rounded-lg pl-12 pr-4 py-3.5 text-sm text-white placeholder-white/40 outline-none focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1]/30 transition-all shadow-xl"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 text-xs font-semibold text-white/40 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ═══════════ TWO-COLUMN SPLIT LAYOUT ═══════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* ───────────────────────────────────────────────────
              LEFT COLUMN (4 Cols): CATEGORY SIDEBAR NAV
          ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-4 bg-[#0c0d1e] border border-white/10 rounded-xl p-4 space-y-2 shadow-2xl sticky top-24">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-3 py-2">
              Filter By Topic
            </p>

            {FAQ_CATEGORIES.map((cat) => {
              const Icon = cat.icon
              const isActive = activeCategory === cat.id
              const count =
                cat.id === 'all'
                  ? FAQ_ITEMS.length
                  : FAQ_ITEMS.filter(i => i.category === cat.id).length

              return (
                <button
                  key={cat.id}
                  onClick={() => { setActiveCategory(cat.id); setSearchQuery('') }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#6366f1] text-white shadow-lg shadow-[#6366f1]/30'
                      : 'text-white/70 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{cat.label}</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-mono ${
                      isActive ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}

            {/* Quick Security Badges Widget */}
            <div className="pt-4 border-t border-white/10 px-3 space-y-2">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                Compliance Badges:
              </p>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/30 px-2 py-0.5 rounded-md font-mono">
                  SOC2 Certified
                </span>
                <span className="bg-[#6366f1]/10 text-[#818cf8] border border-[#6366f1]/30 px-2 py-0.5 rounded-md font-mono">
                  ISO 27001
                </span>
                <span className="bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md font-mono">
                  Argon2id Hashed
                </span>
                <span className="bg-purple-500/10 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-md font-mono">
                  AES-256 Bit
                </span>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────
              RIGHT COLUMN (8 Cols): ACCORDION GROUP
          ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-8 space-y-4">
            {filteredItems.length === 0 ? (
              <div className="bg-[#0c0d1e] border border-white/10 rounded-xl p-8 text-center text-white/50 space-y-2">
                <Search className="w-8 h-8 mx-auto text-white/20" />
                <p className="text-sm font-bold text-white">No security questions found matching "{searchQuery}"</p>
                <p className="text-xs">Try searching for keywords like "SAML", "AES-256", "RBAC", or "SLA".</p>
              </div>
            ) : (
              filteredItems.map((item) => {
                const isExpanded = expandedId === item.id
                return (
                  <div
                    key={item.id}
                    id={`faq-${item.id}`}
                    onClick={() => toggleAccordion(item.id)}
                    className={`rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden shadow-xl ${
                      isExpanded
                        ? 'bg-[#0c0d1e] border-[#6366f1] ring-1 ring-[#6366f1]/40'
                        : 'bg-[#0c0d1e] border-white/10 hover:border-white/20 hover:bg-[#10122e]'
                    }`}
                  >
                    {/* Accordion Question Header */}
                    <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-[#6366f1]/20 text-[#818cf8] border border-[#6366f1]/30 px-2.5 py-0.5 rounded-md font-mono">
                            {item.badge}
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-semibold text-white leading-snug">
                          {item.question}
                        </h3>
                      </div>

                      {/* Rotational Chevron & Share Deep Link */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => copyDeepLink(item.id, e)}
                          className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-colors"
                          title="Copy direct anchor URL"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>

                        <div
                          className={`w-7 h-7 rounded-md bg-white/5 flex items-center justify-center text-white/70 transition-transform duration-300 ${
                            isExpanded ? 'rotate-180 bg-[#6366f1] text-white' : ''
                          }`}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    {/* Copied Deep Link Notification */}
                    {copiedId === item.id && (
                      <div className="px-6 pb-2 text-[10px] text-[#10b981] font-mono flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Direct link copied to clipboard!
                      </div>
                    )}

                    {/* Progressive Disclosure: Hidden Answer Content */}
                    {isExpanded && (
                      <div className="px-5 sm:px-6 pb-6 pt-2 border-t border-white/10 space-y-4 animate-fade-up">
                        <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                          {item.answer}
                        </p>

                        {item.technicalDetails && (
                          <div className="p-4 rounded-lg bg-[#080918] border border-white/5 space-y-2 text-xs">
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-mono">
                              Technical Implementation Specs:
                            </p>
                            <ul className="space-y-1.5 text-white/70">
                              {item.technicalDetails.map((td, i) => (
                                <li key={i} className="flex items-center gap-2">
                                  <span className="text-[#10b981]">●</span> {td}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

        </div>

      </div>
    </section>
  )
}
