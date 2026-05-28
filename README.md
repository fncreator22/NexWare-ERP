# NexWare ERP

## Unified Business Operations & Management Platform

> 🚀 **Landing Page Redesigned** — Professional SaaS showcase with fully interactive embedded ERP demo. No sign-in required to explore the platform.

NexWare ERP is a modern SaaS-based operations platform designed to help businesses manage workforce operations, workflows, billing, inventory, reporting, and business activities from a single connected ecosystem.

---

## 🖥 Interactive ERP Showcase (Landing Page)

The landing page (`warehouse-erp/landing.html`) has been completely redesigned as a **professional SaaS product showcase** with a fully interactive embedded ERP dashboard — no sign-in, no backend connection required.

### What the Landing Page Includes

| Section | Description |
|:---|:---|
| **Hero Section** | Animated hero with floating browser dashboard mockup, hero stats, and dual CTA buttons |
| **Trust Bar** | Social proof logos from 6 demo enterprise clients |
| **Metrics Strip** | 4 key system benchmarks (E2E test coverage, API latency, onboarding speed, RBAC tier count) |
| **Features Grid** | 6 detailed feature cards (Warehouses, RBAC, Billing, Inventory, Tables, Audit Logs) |
| **🎯 Interactive ERP Demo** | Live embedded ERP dashboard with 8 fully interactive pages |
| **Workflow Section** | 4-step onboarding flow explanation |
| **All Features Grid** | 9-cell capability matrix (JWT auth, WebSockets, CSV import, multi-tenant isolation, etc.) |
| **Testimonials** | 3 role-realistic customer quotes |
| **Pricing** | Starter $49/mo + Enterprise $199/mo with full feature lists |
| **CTA Section** | Gradient call-to-action with dual buttons |
| **Footer** | 4-column footer with technology credits and system status badge |

### 🎯 Interactive ERP Demo — 8 Live Pages

The showcase embeds a **pixel-perfect replica of the actual NexWare ERP dashboard** directly inside the landing page. Visitors can:

- Click sidebar navigation items to switch between pages
- Use the tab bar above the demo frame to jump directly to any module
- Interact with search bars, dropdown filters, tab switchers, and sliders
- View live Chart.js charts (revenue bar, revenue line, warehouse doughnut)
- Scroll through realistic data tables

**Available interactive pages:**

| Page | What Visitors See |
|:---|:---|
| 📊 **Dashboard** | KPI cards, 6-month revenue bar chart, live activity feed, warehouse list, low-stock alerts |
| 📦 **Inventory** | 247-item searchable table with SKU, category, price, stock, tax, warehouse columns |
| 🧾 **Billing** | Financial stats strip, 5-invoice table with customer, date, tax, total, status |
| 👥 **Workforce** | Role breakdown cards, 5-member team table with role badges and status |
| 📋 **Tables** | 3 table schema cards, maintenance log rows with dropdown status badges |
| 🔍 **Audit Logs** | 7-entry audit timeline with action type, description, user, warehouse, timestamp |
| 📈 **Analytics** | Line revenue chart, warehouse doughnut chart, per-warehouse revenue breakdown table |
| ⚙️ **Settings** | Profile editor, tax rate range sliders (Normal 5% / Luxury 15%), live preview |

> ⚠️ **No backend dependency.** The demo uses purely static mock data embedded in HTML. Nothing is saved. No APIs are called. No real data is touched.

### Dashboard Preview Images

Four AI-generated ERP dashboard mockup images are stored in `warehouse-erp/assets/`:

| File | Content |
|:---|:---|
| `dashboard-preview.png` | Main ERP dashboard — KPI cards, revenue chart, warehouse overview |
| `inventory-preview.png` | Inventory management with SKU table and stock level badges |
| `billing-preview.png` | Billing panel with invoice list and financial analytics |
| `workforce-audit-preview.png` | Workforce + audit logs side-by-side panel |

### Technical Design Notes

- **Zero dependencies** beyond Chart.js (loaded via CDN) — no framework required
- Design tokens exactly mirror the real app's `variables.css` and `components.css`
- Sidebar uses the same `.demo-item`, `.demo-section-label`, `.demo-sidebar` patterns as the production `shell.js`
- Demo pages switch via pure CSS class toggling (`display:flex` vs `display:none`) with a `pageIn` keyframe animation
- Chart.js instances are destroyed and re-created on page switch to prevent canvas leaks
- Tax rate sliders in Settings respond in real-time (purely visual — no data mutation)
- Scroll reveal powered by `IntersectionObserver` — no dependencies
- Fully responsive: sidebar hidden on mobile, demo content remains scrollable

---


The platform is built for organizations that require operational clarity, scalable management, and centralized control without the complexity of traditional enterprise ERP systems.

Although the system fully supports warehouse and inventory operations, it is not limited to warehouse businesses alone. NexWare ERP is designed as a flexible operational infrastructure that can adapt to multiple industries including retail, logistics, service-based companies, multi-branch businesses, operational teams, franchise systems, and growing organizations that require structured business management.

The core philosophy behind the platform is simple:

> Businesses should not have to change their workflow to match software limitations.  
> The software should adapt to the business.

---

# Why NexWare ERP?

Most businesses eventually reach a stage where operations become fragmented.

Different departments begin using:
- Spreadsheets
- Manual reporting systems
- Separate billing software
- Inventory tools
- Task tracking platforms
- Unstructured communication channels

This creates:
- Operational confusion
- Duplicate work
- Reporting delays
- Poor visibility
- Workforce coordination issues
- Scalability problems

Traditional ERP systems solve some of these challenges but often introduce new ones:
- Complex onboarding
- Difficult customization
- Expensive infrastructure
- Rigid workflows
- Overloaded interfaces

NexWare ERP was built to bridge the gap between operational simplicity and enterprise-level scalability.

---

# What Makes the Platform Different?

The platform is not designed as a fixed ERP structure.

Instead, NexWare ERP functions as a modular operational ecosystem where businesses can build workflows according to their own operational structure.

One of the platform’s most distinctive features is the **Dynamic Workflow Engine**.

Administrators can create custom operational tables and workflow systems directly inside the platform without requiring development changes or external tools.

Organizations can create:
- Task management systems
- Workflow trackers
- Service operations
- Inventory records
- Internal reporting systems
- Team coordination boards
- Audit systems
- Branch operation structures
- Billing workflows

inside the same ecosystem.

This provides the flexibility of spreadsheets while maintaining the structure, permissions, reporting, and scalability of enterprise software.

---

# Platform Workflow

```text
┌──────────────────────────────┐
│      Public SaaS Platform    │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   Plan Selection & Signup    │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│    Super Admin Creation      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Business / Workspace Setup   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Team & Role Assignment       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Workflow & Operations Setup  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Daily Business Management    │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Analytics, Billing & Reports │
└──────────────────────────────┘
```

---

# Role-Based Management Structure

```text
                        ┌─────────────────┐
                        │   Super Admin   │
                        └────────┬────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                                             │
          ▼                                             ▼
 ┌─────────────────┐                         ┌─────────────────┐
 │      Admin      │                         │      Admin      │
 └────────┬────────┘                         └────────┬────────┘
          │                                             │
          ▼                                             ▼
 ┌─────────────────┐                         ┌─────────────────┐
 │     Manager     │                         │     Manager     │
 └────────┬────────┘                         └────────┬────────┘
          │                                             │
          ▼                                             ▼
 ┌─────────────────┐                         ┌─────────────────┐
 │      Staff      │                         │      Staff      │
 └────────┬────────┘                         └────────┬────────┘
          │                                             │
          ▼                                             ▼
 ┌─────────────────┐                         ┌─────────────────┐
 │    Employees    │                         │    Employees    │
 └─────────────────┘                         └─────────────────┘
```

---

# Core Platform Ecosystem

```text
┌─────────────────────────────────────────────────────────────┐
│                        NexWare ERP                         │
└─────────────────────────────────────────────────────────────┘

        ┌────────────────┬────────────────┬────────────────┐
        │                │                │                │
        ▼                ▼                ▼                ▼

┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│   Workforce    │ │   Operations   │ │    Billing     │ │   Analytics    │
│   Management   │ │   Management   │ │   & Taxation   │ │   & Reports    │
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘

        │                │                │                │

        ▼                ▼                ▼                ▼

 • Teams          • Inventory       • Auto Billing    • Business Reports
 • Roles          • Workflows       • Tax Engine      • Revenue Tracking
 • Permissions    • Dynamic Tables  • Invoices        • Performance Data
 • Assignments    • Operations      • Transactions    • Operational Insights
 • Activity Logs  • Task Systems    • History Logs    • Workforce Analytics
```

---

# Core Features

## Dynamic Workflow Builder

Businesses can create operational systems directly from the dashboard.

This eliminates dependency on:
- External spreadsheets
- Manual workflow tracking
- Separate task management systems

while preserving enterprise-level structure and permissions.

---

## Workforce & Team Management

Manage:
- Employees
- Staff
- Managers
- Operational teams
- Branch admins
- Department structures

from one centralized environment.

---

## Multi-Workspace / Multi-Warehouse Management

Organizations can operate:
- Single locations
- Multiple branches
- Warehouses
- Operational departments

under one centralized management system while maintaining isolated operational visibility where required.

---

## Billing & Taxation System

The billing engine supports:
- Automated tax calculations
- Invoice generation
- Billing history
- Operational transaction tracking
- Category-based taxation

designed to reduce manual accounting inconsistencies.

---

## Inventory & Operational Tracking

Track:
- Products
- Services
- Operational assets
- Stock movement
- Branch activities
- Workflow operations

depending on the business structure.

---

## Analytics & Reporting

The platform converts operational activities into role-based business insights.

Organizations can monitor:
- Revenue trends
- Workforce productivity
- Workflow efficiency
- Operational growth
- Inventory movement
- Branch performance

through centralized dashboards and reporting systems.

---

## Global Command Palette (Ctrl+K)

The system includes a premium global search keyboard-driven Command Palette overlay:
- Toggle instantly by pressing `Ctrl + K` (or `Cmd + K` on macOS), or `ESC` to close.
- Instantly search all pages, dynamic actions, system settings, inventory items, and warehouses.
- View real-time system metrics (Revenue, Total Inventory, Stock Health) as high-value insights inside the overlay without leaving the current context.

---

## Smart Restock Prioritizer

The system features an AI-simulated Smart Restock engine to optimize inventory:
- Automatically filters items under threshold guidelines to identify reorder requests.
- Ranks item priority using stock levels coupled with sales velocity/frequencies.
- Visualizes key suggestions via custom priorities directly in dashboard views to maintain healthy inventory pipelines.

# Role-Based Access Control (RBAC) Matrix

To support structured workforce operations and enterprise data integrity, NexWare ERP enforces strict Role-Based Access Control (RBAC) rules:

| Action / Capability | Super Admin | Admin | Manager | Staff | Employee |
|---------------------|:-----------:|:-----:|:-------:|:-----:|:--------:|
| Create & Delete Warehouses | **Yes** | No | No | No | No |
| Manage Warehouse Configurations | **Yes** | Yes (Own) | No | No | No |
| Manage Operational Table Structures | **Yes** | Yes (Own) | No | No | No |
| Manage Workforce Users | **Yes** | Yes (Lower Roles) | Yes (Staff/Employee) | No | No |
| Create Bills & Add Inventory Items | **Yes** | **Yes** | **Yes** | **Yes** | No |
| Write or Update Table Data Rows | **Yes** | **Yes** | **Yes** | **Yes** | No |
| View Warehouse Analytics & Reports | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |

---

# Directory & Project Structure

The repository follows a clean, modular component-based Single Page Application (SPA) layout:

```text
warehouse-erp/
├── css/                 # UI styles, HSL color tokens, compact tables, animations
├── js/
│   ├── components/      # UI Layout shell structure, Global Command Palette (Ctrl+K)
│   ├── modules/         # Client router, localStorage-backed store, common UI helpers
│   ├── pages/           # Dashboard, analytics, billing, items, tables, workforce views
│   └── app.js           # Core bootstrap and SPA initialization module
├── build.mjs            # Automated build bundling script
├── dev.mjs              # Automated dev server setup script
├── index.html           # Main SPA client container shell
├── landing.html         # SaaS platform introduction and subscription landing portal
└── package.json         # Script macros (start, serve, build, dev) and project dependencies
```

---

# Subscription Structure

| Plan | Workspace Support | Features |
|------|------------------|-----------|
| Starter | Single Workspace | Workforce Management, Billing, Workflow Management |
| Enterprise | Unlimited Workspaces | Centralized Analytics, Cross-Workspace Management, Advanced Operations |

Both plans support:
- Monthly Billing
- Yearly Billing

---

# Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES6+), CSS3 Variables |
| Backend | Simulation (localStorage + In-Memory Store) |
| Database | Browser LocalStorage |
| Authentication | Role-Based Access Control (RBAC) Simulation |
| Charts | Chart.js |
| Icons | Unicode Symbols & Font Awesome (Optional) |
| Architecture | Modular Component-Based SPA |

---

# Getting Started

To get the platform running locally on your machine, follow these steps:

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/) (installed with Node.js)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/fncreator22/New-folder.git
   ```
2. Navigate to the project directory:
   ```bash
   cd New-folder/warehouse-erp
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
To start the development server:
```bash
npm run dev
```
The application will be available at `http://localhost:3000` (or the port specified in your console).

### Building for Production
To create a bundled version of the application:
```bash
npm run build
```

---

# System Design Philosophy

The platform is designed around:
- Modular architecture
- Operational flexibility
- Role-based scalability
- Table-first workflows
- Centralized management
- Enterprise usability

Every module is built to extend operational visibility while reducing workflow friction.

The goal is not simply to manage inventory or warehouses.

The goal is to provide businesses with a scalable operational infrastructure that helps teams manage workflows, workforce coordination, business operations, reporting, and growth from one connected  ecosystem.

---

# Future Scalability

The architecture is prepared for future expansion into:
- AI operational insights
- Workflow automation
- Supplier ecosystems
- CRM integrations
- Real-time notifications
- Cloud-native deployment
- Business intelligence systems

without requiring foundational restructuring.

---

# Vision

NexWare ERP is built for businesses that are growing beyond disconnected operational tools but do not want the complexity and rigidity of traditional enterprise ERP systems.

The platform combines flexibility, operational structure, and scalable SaaS architecture into a single ecosystem designed to evolve alongside business growth.
