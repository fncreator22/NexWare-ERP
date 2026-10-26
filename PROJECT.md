# PROJECT: NexWare ERP Enterprise Landing Page & Marketing Experience

## Architecture & Design System
- **Framework & Build**: React 19, Vite 8, TypeScript 6.0 (composite build mode `tsc -b`), Tailwind CSS 3.4, Lucide React icons.
- **Design Tokens**: `#070814` dark base background, glassmorphism panel styles (`.glass-panel`, `.glass-panel-elevated`, `.glass-card-hover`), dot-grid section textures (`.section-texture`), responsive 12-column bento grids, Nimbus Sans TW01 web typography.
- **Security & Metadata**: Content-Security-Policy (CSP) headers, OpenGraph meta tags, zero backend API keys/secrets exposure in public bundles.
- **CTA Hash Routing**: Safe navigation pointing to `/warehouse-erp/index.html#/signup` and `/login` (plus `/items`, `/billing`, `/workforce`, `/audit`, `/tables`, `/warehouses`, `/analytics`, `/dashboard`). Zero 404 links.

## Feature Inventory
| # | Feature / Area | Requirement / Description | Milestone | Source |
|---|---|---|---|---|
| 1 | **Build System Repair** | Resolve `TS2304` (`HowItWorks.tsx:218`) & `TS6133` (`SecurityFAQ.tsx:4`) so `npm run build` succeeds cleanly. | M1 | Survey 1 & 3 |
| 2 | **Vector Icons Compliance** | Purge raw browser emojis (`⚠️`, `✓`) in `ModuleTour.tsx` & `FeatureGrid.tsx`, replacing with Lucide React icons (`AlertTriangle`, `Check`). | M1 | Survey 1 & 3 |
| 3 | **Hero & Social Proof** | Scaled browser mockup, headline, CTAs, 8 brand logos, 4 trust metrics with tooltips, 3 case studies slider. | M1 | Survey 2 |
| 4 | **Interactive Feature Grid** | 6 category filters, 12-column Bento grid, currency/route/kanban widgets, feature modal triggers. | M1 | Survey 2 |
| 5 | **4-Step Role Sandbox Tour** | Explicit CFO, COO, CTO, Supply Chain Director personas; 4 interactive guided steps per module tour. | M2 | Survey 2 |
| 6 | **Workflow Automation Stepper** | 4 linear steps, neon progress line, tech spec toggle, interactive dropzone/flowchart, live counters. | M2 | Survey 2 |
| 7 | **Interactive ROI Engine** | Invoice volume slider + USD/EUR/GBP currency selector + headcount seat billing estimator integrated into ROI calculator widget. | M2 | Survey 2 |
| 8 | **Tiered Pricing & Matrix** | 3 tiers (Starter, Enterprise, Tailored Scale), 20% annual discount toggle, USD/EUR/GBP selector, headcount seat slider, 3-category matrix. | M2 | Survey 2 |
| 9 | **Security FAQ Accordion** | Single-active accordion (`expandedId`), topic filters, search bar, technical specifications, anchor URL copy. | M2 | Survey 2 |
| 10 | **Footer Navigation & Modals** | 5-column footer navigation, status badge, explicit sub-page modals (`about`, `leadership`, `careers`, `sla`, `privacy`, `terms`, `api_docs`, `sys_arch`). | M2 | Survey 3 |
| 11 | **E2E Test Suite (Tiers 1-4)** | Opaque-box test suite covering feature coverage, boundary values, pairwise combinations, and real-world application workloads. | M3 | Dual Track |
| 12 | **Tier 5 Hardening & Audit** | White-box adversarial test coverage, vulnerability check, forensic integrity verification, zero TS errors, clean vite build. | M3 | Dual Track |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | **Build Repair & Vector Icon Compliance** | Fix TS compilation errors in `HowItWorks.tsx` and `SecurityFAQ.tsx`; purge raw emojis in `ModuleTour.tsx` and `FeatureGrid.tsx`; verify clean `vite build`. | None | IN_PROGRESS |
| M2 | **Role-Based Sandbox Tour, ROI Engine & Sub-Page Modals** | Update `ModuleTour.tsx` with CFO/COO/CTO/Supply Chain Director personas & 4 steps; integrate USD/EUR/GBP & headcount estimator into ROI calculator widget in `FooterCTA.tsx`; expand `App.tsx` `MODAL_DATA` with `about`, `leadership`, `careers`, `sla`, etc. | M1 | PLANNED |
| M3 | **E2E Test Suite & Final Hardening** | Establish Tier 1-4 E2E test suite, publish `TEST_READY.md`, achieve 100% test pass, complete Tier 5 adversarial hardening, clean forensic audit. | M2 | PLANNED |

## Interface Contracts
### App.tsx ↔ FeatureModal.tsx
- `MODAL_DATA`: Record<string, { title: string; subtitle: string; description: string; badge: string; appRoute: string; features: string[]; specs: Record<string, string> }>
- Sub-page keys must explicitly support: `finance`, `logistics`, `workforce`, `audit`, `data`, `api_docs`, `sys_arch`, `privacy`, `terms`, `about`, `leadership`, `careers`, `sla`, `press`, `academy`, `partners`, `integrations`, `cookies`.

### ModuleTour.tsx Persona Schema
- `Personas`: `cfo` (CFO / Financial Director), `coo` (COO / Operations Director), `cto` (CTO / Infrastructure Director), `supply_chain` (Supply Chain Director).
- `Steps`: Exactly 4 guided interactive steps per persona module.

### FooterCTA.tsx / Pricing.tsx ROI Calculator Schema
- Inputs: `monthlyInvoices` (number), `currency` ('USD' | 'EUR' | 'GBP'), `headcount` (number).
- Exchange Rates: `USD`: 1.0, `EUR`: 0.92, `GBP`: 0.78.
- Formulas: `invoiceSavings = monthlyInvoices * 45 * currencyRate`, `hoursSaved = monthlyInvoices * 0.8`, `billingMultiplier = 1 + (headcount - 50) * 0.005`.

## Code Layout
```
landing/
├── index.html                  # Main HTML, CSP headers, OG tags, Nimbus Sans font link
├── vite.config.ts              # Vite configuration
├── tailwind.config.ts          # Tailwind theme configuration (font family, colors)
├── package.json                # Dependencies and scripts (npm run build: tsc -b && vite build)
└── src/
    ├── main.tsx                # Entry point
    ├── App.tsx                 # Root layout, modal state & MODAL_DATA definitions
    ├── index.css               # Dark #070814 tokens, dot-grid section textures, glass styles
    └── components/
        ├── Hero.tsx            # Hero section & CTA buttons
        ├── Navbar.tsx          # Navigation bar with drop-downs and app redirection
        ├── SocialProof.tsx     # Logos, metric cards, case study carousel
        ├── FeatureGrid.tsx     # 12-column Bento feature grid & interactive widgets
        ├── ModuleTour.tsx      # Role-based Sandbox Module Tour (CFO, COO, CTO, Supply Chain)
        ├── HowItWorks.tsx      # 4-step workflow stepper & architecture spec toggle
        ├── Pricing.tsx         # Tiered pricing plans, seat slider, comparison matrix
        ├── SecurityFAQ.tsx     # Single-active accordion FAQ & search filter
        ├── FooterCTA.tsx       # Interactive ROI calculator widget & 5-column footer
        ├── FeatureModal.tsx    # Modal sub-page renderer
        ├── Logo.tsx            # NexWare SVG brand mark
        └── DashboardMockup.tsx # Scaled hero browser mockup
```
