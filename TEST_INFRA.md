# TEST_INFRA — E2E Test Suite Architecture & Specification

## Executive Summary
This document specifies the end-to-end (E2E) testing infrastructure, feature inventory mapping, test runner harness execution strategy, and coverage threshold criteria for the **NexWare ERP Landing Page & Marketing Experience** (`landing/`).

The testing strategy follows a requirement-driven, opaque-box methodology combining **Category-Partition Testing**, **Boundary Value Analysis (BVA)**, **Pairwise Combination Testing**, and **Real-World Workload Scenarios** across 4 progressive test tiers.

---

## 1. Environment & Test Harness Architecture

### 1.1 Technical Stack
- **Target Application Path**: `c:\Users\sr2ma\Documents\github\next-erp\landing`
- **Framework & Libraries**: React 19, Vite 8, TypeScript 6.0 (`tsc -b`), Tailwind CSS 3.4, Lucide React icons.
- **Test Runner Engine**: Vitest v4.1.10 + JSDOM environment (`vitest run`).
- **Runtime Environment**: Node.js v24.15.0 / npm 11.12.1.

### 1.2 Harness Execution Strategy & Exit Code Contract
- **Test Entry Point**: Executable via `npm test` or `npx vitest run`.
- **Exit Code Standard**: Must return **exit code 0** on 100% test suite pass. Non-zero exit code indicates failure.
- **Isolation & Parallelism**: Independent test suites executed with JSDOM environment isolation to ensure zero state pollution across test runs.
- **Assertion Coverage**: Includes DOM rendering, ARIA accessibility attributes, interactive state transitions, mathematical ROI & pricing calculation correctness, hash routing CTA targets, and modal state transitions.

---

## 2. Feature Inventory Mapping (All 9 Feature Areas)

| # | Feature Area | Primary Components | Key Interactive Elements | Test Target Coverage |
|---|---|---|---|---|
| 1 | **Hero & Navigation** | `Hero.tsx`, `Navbar.tsx`, `DashboardMockup.tsx` | Scaled browser mockup (896px design width), search form submit, CTAs (`/signup`, `/login`), Navbar dropdown menu (`finance`, `logistics`, `workforce`, `audit`), mobile hamburger toggle. | ≥ 6 Tier 1 cases + BVA + Scenarios |
| 2 | **Social Proof & Trust** | `SocialProof.tsx` | 8 brand logo cards, 4 hard-proof metric cards with tooltips (99.99%, 32%, $4B+, 3x Faster), 3-case-study slider with prev/next/indicator buttons & full study CTAs. | ≥ 6 Tier 1 cases + BVA + Scenarios |
| 3 | **Interactive Feature Grid** | `FeatureGrid.tsx` | 6 category filter tags ('all', 'finance', 'logistics', 'data', 'workforce', 'automation'), 12-column Bento grid, currency toggle ($/€/£), route status toggle, list/kanban view toggle, role selector, modal triggers. | ≥ 6 Tier 1 cases + BVA + Scenarios |
| 4 | **Role-Based Sandbox Tour** | `ModuleTour.tsx` | Persona role switcher (Warehouse Manager, Finance Director, Compliance Officer, Operations Lead / CFO, COO, CTO, Supply Chain), 5 module tabs, 3-4 guided steps per tour, interactive hotspot buttons, autoplay toggle, tour completion overlay. | ≥ 6 Tier 1 cases + BVA + Scenarios |
| 5 | **Workflow Automation Stepper** | `HowItWorks.tsx` | 4-step progressive onboarding grid (Centralize, Automate, Optimize, Scale), neon progress bar, step detail cards, tech spec accordion toggle (`expandedSpecId`), CSV dropzone simulator (`handleSimulateUpload`). | ≥ 6 Tier 1 cases + BVA + Scenarios |
| 6 | **Interactive ROI Engine** | `FooterCTA.tsx`, `Pricing.tsx` | Monthly invoice volume slider (20 to 1000 invoices), USD/EUR/GBP currency selector, employee headcount seat slider (5 to 200+ seats), calculated hours saved (`Math.round(invoices * 0.8)`), calculated dollars saved (`Math.round(invoices * 45)`). | ≥ 6 Tier 1 cases + BVA + Scenarios |
| 7 | **Tiered Pricing & Comparison Matrix** | `Pricing.tsx` | 3 pricing plans (Starter, Enterprise, Tailored Scale), monthly/annual 20% discount toggle, currency FX selector (USD: 1.0, EUR: 0.92, GBP: 0.78), headcount multiplier (`1 + (headcount-50)*0.005`), 3-category comparison matrix accordion. | ≥ 6 Tier 1 cases + BVA + Scenarios |
| 8 | **Security FAQ Accordion** | `SecurityFAQ.tsx` | Single-active accordion (`expandedId`), 5 category filter buttons ('all', 'encryption', 'iam', 'audit', 'sla'), search bar with live text filter, anchor URL copy (`copyDeepLink`), technical spec checklists. | ≥ 6 Tier 1 cases + BVA + Scenarios |
| 9 | **Footer Navigation & Modals** | `FooterCTA.tsx`, `FeatureModal.tsx`, `App.tsx` | 5-column footer layout, status indicator badge, 18 sub-page modal triggers (`finance`, `logistics`, `workforce`, `audit`, `data`, `api_docs`, `sys_arch`, `privacy`, `terms`, `about`, `leadership`, `careers`, `sla`, etc.), backdrop click & close button. | ≥ 6 Tier 1 cases + BVA + Scenarios |

---

## 3. Tier 1-4 Test Matrix & Coverage Thresholds

### Tier 1: Feature Coverage (Opaque-Box Verification)
- **Criterion**: Every feature area must have at least 6 executable test cases validating core rendering, state defaults, button click callbacks, and target link destinations.
- **Minimum Test Cases**: 9 feature areas × 6 cases = **54 test cases**.
- **Key Assertions**:
  - `Hero.tsx`: Renders headline "Run warehouses. In real-time.", CTAs contain `/warehouse-erp/index.html#/signup` and `/login`.
  - `SocialProof.tsx`: Renders 8 brand logos and 4 trust metric cards; case study index defaults to 0.
  - `FeatureGrid.tsx`: Category filter selection filters active Bento cards; currency switch changes financial snapshot values.
  - `ModuleTour.tsx`: Selecting a persona updates `activeModuleId` and resets step to 0.
  - `HowItWorks.tsx`: Step cards highlight active phase; clicking Next Step advances step index.
  - `Pricing.tsx`: Renders 3 pricing plans with default annual discount active.
  - `SecurityFAQ.tsx`: Default expanded FAQ item is `'data-encryption'`; category filters restrict questions.
  - `FooterCTA.tsx`: Invoice slider default value is 150 invoices; footer links invoke `onOpenModal` callbacks.
  - `FeatureModal.tsx`: Renders modal drawer with title, category, badge, tech specs table, and close button.

### Tier 2: Boundary Value Analysis (BVA) & Corner Cases
- **Criterion**: Test system behavior under extreme boundary conditions, edge values, rapid state toggling, and empty inputs.
- **Minimum Test Cases**: 18 test cases.
- **Key Boundary Scenarios**:
  - **ROI Calculator**: `monthlyInvoices = 20` (min slider bound) -> `hoursSaved = 16`, `dollarsSaved = 900`. `monthlyInvoices = 1000` (max slider bound) -> `hoursSaved = 800`, `dollarsSaved = 45000`.
  - **Pricing Headcount**: `headcount = 5` -> `multiplier = 1.0`. `headcount = 50` -> `multiplier = 1.0`. `headcount = 51` -> `multiplier = 1.005`. `headcount = 200` -> `multiplier = 1.75` (`1 + 150 * 0.005`).
  - **Currency Rates**: Verify exact pricing outputs for USD ($159 * 1.0 = $159), EUR ($159 * 0.92 = €146), GBP ($159 * 0.78 = £124).
  - **Security FAQ Accordion**: Single-active constraint (opening item B closes item A). Clicking open item A collapses it to `null`.
  - **FAQ Search Boundary**: Search with non-matching string (e.g. `xyz999invalid`) displays empty state message. Clear button resets query.
  - **Carousel Navigation**: Index underflow (0 -> 2 on prev) and overflow (2 -> 0 on next).
  - **Bento Category Filter Dimming**: Non-matching cards gain `opacity-30 blur-[1px]`.
  - **Modal Key Fallback**: Triggering `onOpenModal('custom_unknown')` renders default fallback modal with `appRoute: '/dashboard'` without throwing errors.

### Tier 3: Cross-Feature Integration Combinations
- **Criterion**: Verify multi-component state interactions, global synchronization, and cross-section navigation.
- **Minimum Test Cases**: 12 test cases.
- **Key Integration Scenarios**:
  - **Currency + Seats + Monthly Toggle**: Multi-variable price formula verification (e.g., EUR + 75 seats + monthly = €198/mo for Enterprise).
  - **Currency + Seats + Annual Toggle**: Multi-variable price formula verification (e.g., GBP + 150 seats + annual = £186/mo for Enterprise).
  - **Sandbox Tour Persona + Tab + Hotspot**: Switching persona, changing module tab, and advancing step via hotspot click.
  - **FAQ Topic Filter + Search Query**: Combining FAQ category filter ('iam') with active text query ('SAML') yields exact single item.
  - **Bento Filter + Route Toggle + Modal Trigger**: Filtering Bento grid, toggling route status, and opening logistics modal.
  - **Workflow Stepper Line + Spec Toggle + Ingestion**: CSV dropzone upload simulation, tech spec expansion, and step advancement.
  - **Navbar Dropdown + Modal + ERP Handoff**: Selecting navbar dropdown module, inspecting modal, and clicking ERP launch link.
  - **Footer Link + Modal Launch + Direct Redirection**: Opening sub-page modal from footer and navigating to target route.

### Tier 4: Real-World Application Workload Scenarios
- **Criterion**: End-to-end execution of complete user journeys representing real-world customer personas.
- **Minimum Test Cases**: 6 test cases.
- **Key Scenarios**:
  1. **Full Buyer Evaluation & Trial Onboarding Journey**: Navigation from Hero header to signup CTA redirect.
  2. **Compliance Officer Security Audit & Verification Flow**: FAQ filtering, search, deep-link copy, and audit module handoff.
  3. **Operations Director Multi-Warehouse Logistics Onboarding Flow**: Search form, logistics filter, route status toggle, CSV upload, and pricing calculation.
  4. **CFO Financial Engine & ROI Optimization Flow**: Navbar module dropdown, ROI slider adjustment, currency selection, and pricing plan trial redirect.
  5. **Mobile Navigation & Sub-Page Modal Drawer Flow**: Mobile hamburger toggle, hash link scroll, mobile login redirection, and modal drawer interaction.
  6. **Corporate Governance, Legal & System SLA Audit Flow**: Status badge verification, SLA agreement modal, privacy policy modal, terms modal, and cookie preferences modal.

---

## 4. Threshold Summary Table

| Metric / Category | Requirement / Target | Verification Standard |
|---|---|---|
| **Total Test Cases** | ≥ 90 Test Cases | All 4 Tiers Fully Populated (54 + 18 + 12 + 6 = 90) |
| **Feature Coverage** | 100% of 9 Feature Areas | ≥ 6 Cases per Feature Area |
| **Pass Rate** | 100% | 0 Failures / 0 Errors |
| **Execution Exit Code** | `0` | Command Exit Code Verification |
| **TypeScript Compilation** | Clean `tsc -b` | 0 Errors |
| **Vite Production Build** | Clean `vite build` | 0 Errors |
| **Hash Route Safety** | 100% Safe | Zero broken links or 404 targets |

---

## 5. Verification Commands

```bash
# 1. Verify TypeScript compilation and Vite build
cd c:\Users\sr2ma\Documents\github\next-erp\landing
npm run build

# 2. Run full E2E test runner suite
npm test
```
