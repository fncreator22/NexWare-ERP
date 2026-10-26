import { useState } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import Hero from './components/Hero'
import SocialProof from './components/SocialProof'
import FeatureGrid from './components/FeatureGrid'
import ModuleTour from './components/ModuleTour'
import HowItWorks from './components/HowItWorks'
import Pricing from './components/Pricing'
import SecurityFAQ from './components/SecurityFAQ'
import FooterCTA from './components/FooterCTA'
import FeatureModal from './components/FeatureModal'
import type { ModalContent } from './components/FeatureModal'

const MODAL_DATA: Record<string, ModalContent> = {
  finance: {
    title: 'Automated Multi-Tax Invoice Engine',
    category: 'Finance & Ledger',
    badge: '5% & 15% Tax Snapshots',
    description: 'Generates professional invoices with instant atomic stock decrements and frozen tax snapshots so historical accounting records never drift.',
    highlights: [
      'Standard (5%) & Luxury (15%) tax rules',
      'Immutable invoice rate snapshotting',
      'Real-time multi-currency consolidation ($ / € / £)',
      'Direct CSV/PDF export for external accounting',
    ],
    techSpecs: [
      { label: 'Database Engine', value: 'MongoDB Atlas Atomic Locks' },
      { label: 'Tax Calculation', value: 'Instant Snapshot Engine' },
      { label: 'Export Format', value: 'CSV & Vector PDF' },
      { label: 'Integration Standard', value: 'REST API & Webhooks' },
    ],
    appRoute: '/billing',
  },
  logistics: {
    title: 'Multi-Warehouse Inventory & Logistics',
    category: 'Supply Chain',
    badge: 'GPS Route Telemetry',
    description: 'Register unlimited warehouse locations. Each depot maintains SKU uniqueness, real-time stock thresholds, and live freight status updates.',
    highlights: [
      'Multi-location stock level tracking',
      'Unique SKU validation per warehouse namespace',
      'Low-stock threshold warning push notifications',
      'Live delivery route telemetry & waybill generation',
    ],
    techSpecs: [
      { label: 'Namespace Scope', value: 'Isolated Warehouse IDs' },
      { label: 'Realtime Sync', value: 'MongoDB Change Streams' },
      { label: 'Stock Decrement', value: 'Atomic Lock Guarantee' },
      { label: 'Integration Standard', value: 'MongoDB Namespace Scope' },
    ],
    appRoute: '/items',
  },
  workforce: {
    title: '5-Tier Role-Based Access Control (RBAC)',
    category: 'IAM & Security',
    badge: 'Super Admin Security',
    description: 'Cascading hierarchical permissions across Super Admin, Admin, Manager, Staff, and Employee tiers. Restricts access to assigned warehouse locations only.',
    highlights: [
      '5-tier hierarchical permission model',
      'Location-based scope restrictions',
      'Instant database session revocation',
      'Role-aware UI component filtering',
    ],
    techSpecs: [
      { label: 'Password Security', value: 'Argon2id Hashing' },
      { label: 'Session Token', value: 'JWT (15-min TTL)' },
      { label: 'Rate Limiter', value: 'Redis Sliding-Window' },
      { label: 'Integration Standard', value: 'JWT Bearer Authentication' },
    ],
    appRoute: '/workforce',
  },
  audit: {
    title: 'Tamper-Evident Compliance Audit Log Stream',
    category: 'Compliance & Audit',
    badge: 'SOC2 & ISO 27001 Ready',
    description: 'Records every critical system event—logins, item creations, invoice generations, and warehouse updates—with user identity and exact timestamp.',
    highlights: [
      'Immutable, append-only MongoDB collections',
      'Granular search by user identity or warehouse ID',
      'Exportable CSV regulatory compliance logs',
      'Full identity & timestamp traceability',
    ],
    techSpecs: [
      { label: 'Log Integrity', value: 'Append-Only Collections' },
      { label: 'Traceability', value: 'User ID + Timestamp + Tenant' },
      { label: 'Export Format', value: 'Raw Audit Stream CSV' },
      { label: 'Integration Standard', value: 'Append-Only Audit Stream' },
    ],
    appRoute: '/audit',
  },
  data: {
    title: 'Dynamic Custom Table Builder',
    category: 'Data & Schemas',
    badge: 'User-Defined Columns',
    description: 'Design custom operational data schemas with typed columns (text, number, dropdown, date) to manage maintenance checkups, returns, and shipments.',
    highlights: [
      'Custom typed column definitions',
      'Table View & Kanban Workflow Board toggle',
      'Multi-column search and sorting',
      'Tenant-isolated custom collections',
    ],
    techSpecs: [
      { label: 'Supported Types', value: 'Text, Number, Select, Date' },
      { label: 'View Modes', value: 'Dense Table & Kanban' },
      { label: 'Data Export', value: 'CSV / Excel' },
      { label: 'Integration Standard', value: 'Dynamic Schema Engine' },
    ],
    appRoute: '/tables',
  },
  api_docs: {
    title: 'NexWare ERP API & Architecture Documentation',
    category: 'Developer Resources',
    badge: 'RESTful API v2.0',
    description: 'Complete OpenAPI documentation for integrating external ERP services, custom webhooks, and third-party accounting platforms.',
    highlights: [
      'FastAPI Swagger & OpenAPI 3.0 specification',
      'Bearer JWT authorization tokens',
      'Rate-limited endpoints with sliding-window headers',
      'Raw JSON webhook payload structures',
    ],
    techSpecs: [
      { label: 'Backend Framework', value: 'FastAPI Python 3.11' },
      { label: 'API Docs Route', value: '/docs (Swagger UI)' },
      { label: 'Auth Scheme', value: 'OAuth2 Password Bearer' },
      { label: 'Server Port', value: '8000' },
    ],
    appRoute: '/dashboard',
  },
  sys_arch: {
    title: 'NexWare ERP System Architecture Whitepaper',
    category: 'System Infrastructure',
    badge: 'FastAPI + MongoDB Atlas',
    description: 'Technical whitepaper detailing multi-tenant data isolation, Redis caching, and real-time MongoDB Change Streams architecture.',
    highlights: [
      'Multi-tenant triple-layer data isolation',
      'Sub-15ms p50 read latency powered by Redis cache',
      'Real-time WebSocket event broadcasting',
      'Multi-region deployment failover strategy',
    ],
    techSpecs: [
      { label: 'Primary DB', value: 'MongoDB Atlas 7.0' },
      { label: 'Cache Engine', value: 'Redis Server 7.2' },
      { label: 'Realtime Protocol', value: 'WebSockets (ws://)' },
      { label: 'Security Standard', value: 'TLS 1.3 & HSTS' },
    ],
    appRoute: '/dashboard',
  },
  privacy: {
    title: 'NexWare ERP Privacy & Data Sovereignty Policy',
    category: 'Legal & Compliance',
    badge: 'GDPR & HIPAA Compliant',
    description: 'Our commitment to enterprise data protection, tenant namespace isolation, and strict adherence to global privacy frameworks.',
    highlights: [
      'Zero cross-tenant data sharing guarantee',
      'AES-256 bit encryption for data at rest',
      'Automated 90-day cryptographic key rotation',
      'Right to export and delete complete tenant assets',
    ],
    techSpecs: [
      { label: 'Data Encryption', value: 'AES-256 & TLS 1.3' },
      { label: 'Compliance Standards', value: 'GDPR, SOC2, ISO 27001' },
      { label: 'Data Sovereignty', value: 'Regional Storage Pinning' },
      { label: 'Contact', value: 'contact@nexware.io' },
    ],
    appRoute: '/settings',
  },
  terms: {
    title: 'NexWare ERP Terms of Service & SLA Agreement',
    category: 'Legal & SLA',
    badge: '99.99% SLA Guarantee',
    description: 'Enterprise agreement defining system uptime SLAs, multi-warehouse operational terms, and priority support response times.',
    highlights: [
      'Guaranteed 99.99% system uptime SLA',
      'Priority 24/7/365 help desk response SLA',
      'Financial uptime credit guarantees',
      'Clear, predictable annual subscription terms',
    ],
    techSpecs: [
      { label: 'Uptime SLA', value: '99.99% Availability' },
      { label: 'Support Response', value: '< 15 Minutes for P1' },
      { label: 'Failover Time', value: 'Zero-Downtime Hot Swap' },
      { label: 'Governance', value: 'Enterprise SaaS Agreement' },
    ],
    appRoute: '/settings',
  },
}

export default function App() {
  const [activeModalKey, setActiveModalKey] = useState<string | null>(null)

  const modalContent = activeModalKey ? MODAL_DATA[activeModalKey] || {
    title: 'NexWare ERP Platform Module',
    category: 'System Resource',
    badge: 'Enterprise Operational Feature',
    description: 'Access the full NexWare ERP application to explore live multi-warehouse management, billing, workforce RBAC, and analytics.',
    highlights: ['Multi-tenant isolated data namespace', 'Real-time WebSocket synchronization', 'Argon2id password protection', '1-Click data export to CSV/PDF'],
    techSpecs: [{ label: 'Engine', value: 'FastAPI + MongoDB' }, { label: 'Auth', value: 'JWT Bearer' }],
    appRoute: '/dashboard'
  } : null

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#070814] text-white">
        <Hero onOpenModal={(key) => setActiveModalKey(key)} />
        <SocialProof />
        <FeatureGrid onOpenModal={(key) => setActiveModalKey(key)} />
        <ModuleTour />
        <HowItWorks />
        <Pricing />
        <SecurityFAQ />
        <FooterCTA onOpenModal={(key) => setActiveModalKey(key)} />

        {/* Feature Detail Modal Drawer */}
        <FeatureModal content={modalContent} onClose={() => setActiveModalKey(null)} />
      </div>
    </ErrorBoundary>
  )
}
