import { useState } from 'react'
import {
  Check, Minus, ShieldCheck, Building2, Users,
  Sparkles, ChevronDown, ChevronUp, Lock,
  Server, Globe, HelpCircle, Lightbulb
} from 'lucide-react'

/* ─── Types & Data ───────────────────────────────────────── */
type BillingCycle = 'monthly' | 'annual'
type Currency = 'USD' | 'EUR' | 'GBP'

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
}

const CURRENCY_RATES: Record<Currency, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.78,
}

/* ─── Plan Data ─────────────────────────────────────────── */
interface PricingPlan {
  id: string
  name: string
  subtitle: string
  monthlyPrice: number
  annualPrice: number
  popular?: boolean
  badge?: string
  ctaText: string
  ctaVariant: 'primary' | 'ghost' | 'outline'
  features: string[]
}

const PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    subtitle: 'Perfect for small businesses digitizing inventory & invoicing',
    monthlyPrice: 49,
    annualPrice: 39,
    ctaText: 'Start Starter Trial',
    ctaVariant: 'ghost',
    features: [
      '1 Warehouse Location',
      'Up to 10 Team Seats',
      'Full Inventory Tracking',
      'Invoice Billing with Tax (5%/15%)',
      'Basic Compliance Audit Logging',
      'CSV Bulk Import & Export',
      'Standard Email Support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    subtitle: 'For scaling operations needing multi-location sync & compliance',
    monthlyPrice: 199,
    annualPrice: 159,
    popular: true,
    badge: 'MOST POPULAR',
    ctaText: 'Start Enterprise Trial →',
    ctaVariant: 'primary',
    features: [
      'Unlimited Warehouse Locations',
      'Unlimited Team Seats',
      '5-Tier RBAC Access System',
      'Dynamic Custom Table Builder',
      'Full Compliance Audit Stream',
      'Real-Time WebSocket Synchronization',
      'Advanced Chart.js Analytics',
      'Priority 24/7 Support SLA',
    ],
  },
  {
    id: 'custom',
    name: 'Tailored Scale',
    subtitle: 'Dedicated infrastructure & custom webhooks for global leaders',
    monthlyPrice: 499,
    annualPrice: 399,
    ctaText: 'Contact Sales Team',
    ctaVariant: 'outline',
    features: [
      'Dedicated Isolated Infrastructure',
      'Custom Webhook Integrations',
      'Dedicated Account Success Manager',
      'On-Premise / Hybrid Options',
      'Custom SLA Guarantee (99.99%)',
      'Argon2id Key Encryption Export',
      'Whitelabel Custom Branding',
      'Executive Onboarding Assistance',
    ],
  },
]

/* ─── Accordion Comparison Matrix ────────────────────────── */
interface FeatureCategory {
  category: string
  items: {
    name: string
    tooltip: string
    starter: string | boolean
    enterprise: string | boolean
    custom: string | boolean
  }[]
}

const MATRIX: FeatureCategory[] = [
  {
    category: 'Financial Management & Billing',
    items: [
      {
        name: 'General Ledger & Invoicing',
        tooltip: 'Automated bill generation with SKU inventory decrement',
        starter: true,
        enterprise: true,
        custom: true,
      },
      {
        name: 'Multi-Tax Rate Snapshotting',
        tooltip: 'Standard (5%) & luxury (15%) tax rules frozen on bill creation',
        starter: true,
        enterprise: true,
        custom: true,
      },
      {
        name: 'Multi-Currency Consolidation',
        tooltip: 'Real-time FX conversion for USD, EUR, and GBP',
        starter: false,
        enterprise: true,
        custom: true,
      },
      {
        name: 'Immutable Invoice Snapshots',
        tooltip: 'Historical invoices never drift when tax rates update',
        starter: true,
        enterprise: true,
        custom: true,
      },
    ],
  },
  {
    category: 'Supply Chain & Inventory',
    items: [
      {
        name: 'Warehouse Locations Tracked',
        tooltip: 'Isolated warehouse namespaces and staff assignments',
        starter: '1 Warehouse',
        enterprise: 'Unlimited',
        custom: 'Unlimited',
      },
      {
        name: 'Real-time SKU Tracking',
        tooltip: 'Unique SKU verification per warehouse location',
        starter: true,
        enterprise: true,
        custom: true,
      },
      {
        name: 'Atomic Stock Decrement',
        tooltip: 'Database lock preventing double stock allocation',
        starter: true,
        enterprise: true,
        custom: true,
      },
      {
        name: 'Dynamic Custom Table Builder',
        tooltip: 'Create user-defined data schemas (text, date, dropdown)',
        starter: false,
        enterprise: true,
        custom: true,
      },
    ],
  },
  {
    category: 'Users, Security & Compliance',
    items: [
      {
        name: 'Included Team Seats',
        tooltip: 'Number of active user accounts supported',
        starter: '10 Seats',
        enterprise: 'Unlimited',
        custom: 'Unlimited',
      },
      {
        name: '5-Tier RBAC Access Control',
        tooltip: 'Super Admin, Admin, Manager, Staff, Employee tiers',
        starter: '2 Tiers',
        enterprise: 'Full 5 Tiers',
        custom: 'Full 5 Tiers + Custom',
      },
      {
        name: 'JWT Auth & Argon2id Security',
        tooltip: '15-min access tokens with 7-day rotating refresh tokens',
        starter: true,
        enterprise: true,
        custom: true,
      },
      {
        name: 'Tamper-Evident Audit Logging',
        tooltip: 'Tenant-scoped timestamped records of every system event',
        starter: 'Basic',
        enterprise: 'Full Stream',
        custom: 'Full Stream + Webhook',
      },
    ],
  },
]

/* ─── Add-on Options ─────────────────────────────────────── */
const ADDONS = [
  { name: 'Extra Database Storage', price: '$10 / mo', detail: 'Per 50GB additional high-speed storage' },
  { name: 'Dedicated Webhook Tunnel', price: '$25 / mo', detail: 'Real-time external API payload triggers' },
  { name: 'Dedicated IP & SSL', price: '$40 / mo', detail: 'Isolated network address for compliance' },
]

/* ─── Component ──────────────────────────────────────────── */
export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('annual')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [employeeHeadcount, setEmployeeHeadcount] = useState<number>(25)
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)

  const symbol = CURRENCY_SYMBOLS[currency]
  const rate = CURRENCY_RATES[currency]

  // Calculate dynamic multiplier based on employee headcount
  const headcountMultiplier = employeeHeadcount > 50 ? 1 + (employeeHeadcount - 50) * 0.005 : 1.0

  const formatPrice = (baseUSD: number) => {
    const raw = baseUSD * rate * (billingCycle === 'annual' ? 1 : 1.2) * headcountMultiplier
    return Math.round(raw)
  }

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <section id="pricing" className="relative bg-[#08090c] section-texture text-white py-20 lg:py-32 overflow-hidden border-t border-white/5">

      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 relative z-10">

        {/* ═══════════ SECTION HEADER ════════════════════════ */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md font-mono bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] text-xs uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Predictable Enterprise Pricing
          </div>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white mb-4">
            Transparent plans for operations of any scale
          </h2>
          <p className="text-sm sm:text-base text-white/60 leading-relaxed">
            No hidden implementation surcharges or surprise fees. Upgrade or adjust headcounts anytime with full multi-tenant data isolation.
          </p>
        </div>

        {/* ═══════════ 1. GLOBAL CONTROLS (TOP LEVEL) ════════ */}
        <div className="bg-[#12151c] border border-white/10 rounded-xl p-6 sm:p-8 max-w-4xl mx-auto mb-16 shadow-2xl space-y-6">

          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">

            {/* Billing Cycle Toggle */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-white/60">Billing Cycle:</span>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-1">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    billingCycle === 'monthly' ? 'bg-[#f59e0b] text-[#08090c] font-bold shadow' : 'text-white/60 hover:text-white'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('annual')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    billingCycle === 'annual' ? 'bg-[#f59e0b] text-[#08090c] font-bold shadow' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <span>Annual</span>
                  <span className="bg-[#10b981] text-gray-900 text-[10px] font-bold px-1.5 py-0.5 rounded-md font-mono">
                    Save 20%
                  </span>
                </button>
              </div>
            </div>

            {/* Currency Selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-white/60">Currency:</span>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-1">
                {(['USD', 'EUR', 'GBP'] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                      currency === c ? 'bg-[#f59e0b] text-[#08090c]' : 'text-white/50 hover:text-white'
                    }`}
                  >
                    {c} ({CURRENCY_SYMBOLS[c]})
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Interactive Scale Slider (Employee Headcount) */}
          <div className="pt-4 border-t border-white/5 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-[#f59e0b]" /> Estimate Headcount / Active Seats:
              </span>
              <span className="font-mono text-[#f59e0b] font-bold text-sm bg-[#f59e0b]/10 px-3 py-0.5 rounded-md">
                {employeeHeadcount} Active Seats
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="200"
              value={employeeHeadcount}
              onChange={(e) => setEmployeeHeadcount(Number(e.target.value))}
              className="w-full accent-[#f59e0b] bg-white/10 rounded-lg cursor-pointer h-2"
            />
            <div className="flex justify-between text-[10px] text-white/40 font-mono">
              <span>5 Seats</span>
              <span>50 Seats (Base Tier)</span>
              <span>100 Seats</span>
              <span>200+ Enterprise Seats</span>
            </div>
          </div>

        </div>

        {/* ═══════════ 2. TIERED PRICING CARDS (MID LEVEL) ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20 items-stretch">
          {PLANS.map((plan) => {
            const displayPrice = formatPrice(plan.annualPrice)
            const isEnterprise = plan.popular

            return (
              <div
                key={plan.id}
                className={`relative rounded-xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 shadow-2xl ${
                  isEnterprise
                    ? 'bg-[#12151c] border-2 border-[#f59e0b] ring-1 ring-[#f59e0b]/30'
                    : 'bg-[#12151c] border border-white/10 hover:border-white/20'
                }`}
              >
                {/* Popular Badge Ribbon */}
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#f59e0b] text-gray-900 text-[10px] font-bold px-3 py-0.5 rounded-md font-mono uppercase tracking-wider shadow-lg">
                    {plan.badge}
                  </div>
                )}

                <div>
                  {/* Plan Name & Subtitle */}
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                    <p className="text-xs text-white/60 leading-relaxed min-h-[36px]">{plan.subtitle}</p>
                  </div>

                  {/* Price Block */}
                  <div className="mb-6 pb-6 border-b border-white/10">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl sm:text-5xl font-extrabold text-white font-mono">
                        {symbol}{displayPrice}
                      </span>
                      <span className="text-xs text-white/50 font-medium">/ month</span>
                    </div>
                    <p className="text-[10px] text-white/40 mt-1 font-mono">
                      Billed {billingCycle === 'annual' ? 'annually' : 'monthly'} · {employeeHeadcount} Seats
                    </p>
                  </div>

                  {/* Feature Checkmarks List */}
                  <div className="space-y-3 mb-8">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Included Capabilities:</p>
                    {plan.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs text-white/80">
                        <Check className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => { window.location.href = '/warehouse-erp/index.html#/signup' }}
                  className={`w-full py-3.5 rounded-lg text-xs font-bold transition-all shadow-lg ${
                    plan.ctaVariant === 'primary'
                      ? 'bg-white text-gray-900 hover:bg-white/90 shadow-white/10'
                      : plan.ctaVariant === 'outline'
                      ? 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                      : 'bg-white/5 text-white/90 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {plan.ctaText}
                </button>
              </div>
            )
          })}
        </div>

        {/* ═══════════ 3. DETAILED COMPARISON MATRIX GRID ═════ */}
        <div className="bg-[#12151c] border border-white/10 rounded-xl p-6 sm:p-8 shadow-2xl mb-20 overflow-x-auto">
          
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h3 className="text-2xl font-bold text-white">Full Feature Capability Matrix</h3>
            <p className="text-xs text-white/60 mt-1">
              Compare exact technical boundaries, RBAC roles, and database isolation across plans.
            </p>
          </div>

          <table className="w-full text-left text-xs min-w-[700px]">
            {/* Sticky Header Row */}
            <thead className="sticky top-0 bg-[#161922] border-b border-white/10 z-20">
              <tr>
                <th className="py-4 px-4 text-white/50 uppercase text-[10px] font-mono tracking-wider w-2/5">
                  ERP Technical Capabilities
                </th>
                <th className="py-4 px-4 text-center font-bold text-white text-sm w-1/5">Starter Plan</th>
                <th className="py-4 px-4 text-center font-bold text-[#f59e0b] text-sm w-1/5">Enterprise Plan</th>
                <th className="py-4 px-4 text-center font-bold text-white text-sm w-1/5">Tailored Scale</th>
              </tr>
            </thead>

            {MATRIX.map((catGroup) => {
              const isCollapsed = collapsedCategories[catGroup.category]
              return (
                <tbody key={catGroup.category} className="divide-y divide-white/5">
                  {/* Accordion Category Header */}
                  <tr
                    onClick={() => toggleCategory(catGroup.category)}
                    className="bg-white/[0.03] cursor-pointer hover:bg-white/[0.06] transition-colors"
                  >
                    <td colSpan={4} className="py-3 px-4 text-xs font-bold text-[#f59e0b]">
                      <div className="flex items-center justify-between">
                        <span>{catGroup.category}</span>
                        {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                      </div>
                    </td>
                  </tr>

                  {/* Feature Rows */}
                  {!isCollapsed &&
                    catGroup.items.map((item) => (
                      <tr key={item.name} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4 text-white/80">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white">{item.name}</span>
                            <button
                              onClick={() => setActiveTooltip(activeTooltip === item.name ? null : item.name)}
                              className="text-white/30 hover:text-white transition-colors"
                              title={item.tooltip}
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {activeTooltip === item.name && (
                          <div className="flex items-center gap-1.5 text-[10px] text-[#fde68a] mt-1 bg-[#f59e0b]/10 border border-[#f59e0b]/20 p-2 rounded-lg">
                              <Lightbulb className="w-3 h-3 shrink-0 text-[#f59e0b]" />
                              <span>{item.tooltip}</span>
                            </div>
                          )}
                        </td>

                        {/* Starter Value */}
                        <td className="py-3 px-4 text-center">
                          {typeof item.starter === 'boolean' ? (
                            item.starter ? (
                              <Check className="w-4 h-4 text-[#10b981] mx-auto" />
                            ) : (
                              <Minus className="w-4 h-4 text-white/20 mx-auto" />
                            )
                          ) : (
                            <span className="font-mono text-white/80">{item.starter}</span>
                          )}
                        </td>

                        {/* Enterprise Value */}
                        <td className="py-3 px-4 text-center bg-[#f59e0b]/5">
                          {typeof item.enterprise === 'boolean' ? (
                            item.enterprise ? (
                              <Check className="w-4 h-4 text-[#10b981] mx-auto font-bold" />
                            ) : (
                              <Minus className="w-4 h-4 text-white/20 mx-auto" />
                            )
                          ) : (
                            <span className="font-mono text-[#f59e0b] font-bold">{item.enterprise}</span>
                          )}
                        </td>

                        {/* Custom Value */}
                        <td className="py-3 px-4 text-center">
                          {typeof item.custom === 'boolean' ? (
                            item.custom ? (
                              <Check className="w-4 h-4 text-[#10b981] mx-auto" />
                            ) : (
                              <Minus className="w-4 h-4 text-white/20 mx-auto" />
                            )
                          ) : (
                            <span className="font-mono text-white/80">{item.custom}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              )
            })}
          </table>
        </div>

        {/* ═══════════ 4. RISK MITIGATION & TRUST FOOTER ══════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

          {/* Transparent Add-on Blocks (Left 6 Cols) */}
          <div className="lg:col-span-6 bg-[#12151c] border border-white/10 rounded-xl p-6 sm:p-8 space-y-4">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-[#f59e0b]" /> Transparent Infrastructure Add-ons
            </h4>
            <p className="text-xs text-white/60">
              No hidden surprise charges. Optional capacity upgrades can be attached to any tier:
            </p>

            <div className="space-y-3 pt-2">
              {ADDONS.map(addon => (
                <div key={addon.name} className="flex items-center justify-between p-3 rounded-lg bg-[#0d0f14] border border-white/5 text-xs">
                  <div>
                    <p className="font-semibold text-white">{addon.name}</p>
                    <p className="text-[10px] text-white/40">{addon.detail}</p>
                  </div>
                  <span className="font-mono font-bold text-[#10b981]">{addon.price}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance & Trust Badges (Right 6 Cols) */}
          <div className="lg:col-span-6 bg-[#12151c] border border-white/10 rounded-xl p-6 sm:p-8 space-y-4">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#10b981]" /> Enterprise Security & Compliance
            </h4>
            <p className="text-xs text-white/60">
              Your financial and inventory data is protected by production-grade encryption standards:
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-[#0d0f14] rounded-lg border border-white/5 flex items-center gap-2 text-xs text-white">
                <Lock className="w-4 h-4 text-[#06b6d4]" />
                <div>
                  <p className="font-bold text-xs">Argon2id Hashing</p>
                  <p className="text-[9px] text-white/40">Password Security</p>
                </div>
              </div>

              <div className="p-3 bg-[#0d0f14] rounded-lg border border-white/5 flex items-center gap-2 text-xs text-white">
                <ShieldCheck className="w-4 h-4 text-[#10b981]" />
                <div>
                  <p className="font-bold text-xs">SOC2 & ISO 27001</p>
                  <p className="text-[9px] text-white/40">Audit Ready</p>
                </div>
              </div>

              <div className="p-3 bg-[#0d0f14] rounded-lg border border-white/5 flex items-center gap-2 text-xs text-white">
                <Building2 className="w-4 h-4 text-[#f59e0b]" />
                <div>
                  <p className="font-bold text-xs">MongoDB Isolation</p>
                  <p className="text-[9px] text-white/40">Tenant Boundaries</p>
                </div>
              </div>

              <div className="p-3 bg-[#0d0f14] rounded-lg border border-white/5 flex items-center gap-2 text-xs text-white">
                <Globe className="w-4 h-4 text-[#06b6d4]" />
                <div>
                  <p className="font-bold text-xs">GDPR Compliant</p>
                  <p className="text-[9px] text-white/40">Data Sovereignty</p>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  )
}
