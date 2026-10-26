import {
  LayoutDashboard, Building2, Package, FileText, Users, Shield,
  BarChart2, Settings, LayoutGrid, Plus, Monitor,
  PanelLeft, ChevronLeft, ChevronRight, RotateCw, Share, Copy,
  Zap,
} from 'lucide-react'
import Logo from './Logo'

/* ─── Types ─────────────────────────────────────────────── */
interface InvoiceRow {
  id: string
  customer: string
  amount: string
  tax: string
  status: 'Paid' | 'Pending'
}

interface WarehouseCard {
  name: string
  staff: number
  revenue: string
  active: boolean
}

/* ─── Static data ────────────────────────────────────────── */
const WAREHOUSES: WarehouseCard[] = [
  { name: 'Dallas Logistics Depot',    staff: 5, revenue: '$42,300', active: true },
  { name: 'Houston HQ Distribution',  staff: 8, revenue: '$58,900', active: true },
  { name: 'Austin Depot North',        staff: 3, revenue: '$23,550', active: true },
]

const INVOICES: InvoiceRow[] = [
  { id: 'INV-0038', customer: 'Texas Ironworks Ltd.',  amount: '$955.50',  tax: '$45.50',  status: 'Paid'    },
  { id: 'INV-0037', customer: 'Global Parts Co.',      amount: '$2,340.00',tax: '$145.00', status: 'Paid'    },
  { id: 'INV-0036', customer: 'Apex Manufacturing',    amount: '$7,820.00',tax: '$420.00', status: 'Paid'    },
  { id: 'INV-0035', customer: 'NorthTex Logistics',    amount: '$5,200.00',tax: '$275.00', status: 'Pending' },
  { id: 'INV-0034', customer: 'SwiftDepot Inc.',       amount: '$1,490.00',tax: '$62.00',  status: 'Paid'    },
]

const STATS = [
  { label: 'WAREHOUSES',  value: '4',        sub: 'Active locations'   },
  { label: 'REVENUE',     value: '$124.7k',  sub: 'This period'        },
  { label: 'STOCK UNITS', value: '4,280',    sub: 'Total inventory'    },
  { label: 'INVOICES',    value: '38',       sub: 'Generated this month'},
]

const SIDEBAR_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',  active: true  },
  { icon: Building2,       label: 'Warehouses', active: false },
  { icon: Package,         label: 'Inventory',  active: false },
  { icon: FileText,        label: 'Billing',    active: false },
  { icon: Users,           label: 'Workforce',  active: false },
  { icon: Shield,          label: 'Audit Logs', active: false },
  { icon: BarChart2,       label: 'Analytics',  active: false },
  { icon: Settings,        label: 'Settings',   active: false },
]

const RECENT = [
  'INV-0038 · $955.50 · Dallas',
  'Steel Pipes · 80 pcs added',
  'Kim Park joined · Houston HQ',
]

/* ─── Component ──────────────────────────────────────────── */
export default function DashboardMockup() {
  return (
    <div className="rounded-t-2xl overflow-hidden bg-[#0f1029] shadow-[0_-20px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/10 text-left select-none">

      {/* ── Browser Chrome title bar ─────────────────────── */}
      <div className="bg-[#1a1d3a] border-b border-white/5 px-4 py-2.5 flex items-center gap-3">
        {/* Traffic lights */}
        <div className="flex gap-1.5 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-2 shrink-0">
          <PanelLeft   className="w-3.5 h-3.5 text-white/40" />
          <ChevronLeft className="w-3.5 h-3.5 text-white/40" />
          <ChevronRight className="w-3.5 h-3.5 text-white/25" />
        </div>

        {/* URL bar */}
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-1.5 bg-[#0f1029] rounded-md px-6 py-1">
            <Monitor className="w-2.5 h-2.5 text-white/40" />
            <span className="text-[10px] text-white/60 font-mono">app.nexware.io/dashboard</span>
          </div>
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-2 shrink-0">
          <RotateCw className="w-3.5 h-3.5 text-white/40" />
          <Share    className="w-3.5 h-3.5 text-white/40" />
          <Plus     className="w-3.5 h-3.5 text-white/40" />
          <Copy     className="w-3.5 h-3.5 text-white/40" />
        </div>
      </div>

      {/* ── App shell ────────────────────────────────────── */}
      <div className="flex" style={{ minHeight: 480 }}>

        {/* ─── Sidebar ─────────────────────────────────── */}
        <div className="w-[22%] border-r border-white/5 bg-[#0c0e20] px-3 py-3.5 flex flex-col gap-4 shrink-0">

          {/* Brand */}
          <div className="flex items-center justify-between px-1">
            <Logo className="w-4 h-4 text-white/70" />
            <LayoutGrid className="w-3.5 h-3.5 text-white/30" />
          </div>

          {/* Workspace badge */}
          <div className="flex items-center gap-2 px-1">
            <div className="w-4 h-4 rounded bg-[#6366f1] flex items-center justify-center shrink-0">
              <span className="text-[8px] font-bold text-white">N</span>
            </div>
            <span className="text-[10px] text-white/80 font-medium truncate">NexWare ERP</span>
          </div>

          {/* Nav */}
          <div className="flex flex-col gap-0.5">
            {SIDEBAR_NAV.map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#6366f1]/20 text-[#818cf8]'
                    : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          {/* Recent activity */}
          <div className="mt-auto">
            <p className="text-[8px] text-white/25 tracking-wider uppercase px-2 mb-1.5">Live Activity</p>
            {RECENT.map(item => (
              <div key={item} className="flex items-center gap-1.5 px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#28c840', opacity: 0.7 }} />
                <span className="text-[9px] text-white/50 truncate">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Main content ─────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-3 p-4 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#6366f1] flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-white">N</span>
              </div>
              <div>
                <p className="text-sm font-medium text-white leading-none">Dallas Logistics Depot</p>
                <p className="text-[10px] text-white/45 mt-0.5">4 active warehouses · Super Admin</p>
              </div>
            </div>
            <button className="flex items-center gap-1.5 bg-[#6366f1] text-white text-[10px] font-medium px-3 py-1.5 rounded-lg hover:bg-[#4f46e5] transition-colors">
              <Zap className="w-3 h-3" /> New Invoice
            </button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 divide-x divide-white/5 rounded-xl bg-white/[0.03] ring-1 ring-white/5">
            {STATS.map(({ label, value, sub }) => (
              <div key={label} className="flex flex-col gap-1 px-3 py-2.5">
                <p className="text-[8px] tracking-wider text-white/35 uppercase">{label}</p>
                <p className="text-xl font-medium text-white leading-none">{value}</p>
                <p className="text-[9px] text-white/40">{sub}</p>
              </div>
            ))}
          </div>

          {/* Warehouse cards */}
          <div className="grid grid-cols-3 gap-2">
            {WAREHOUSES.map(wh => (
              <div key={wh.name} className="rounded-lg bg-white/[0.03] ring-1 ring-white/5 px-3 py-2.5 flex flex-col gap-1.5 cursor-pointer hover:bg-white/[0.05] transition-colors">
                <div className="flex items-center justify-between">
                  <Building2 className="w-3.5 h-3.5 text-white/50" />
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: wh.active ? '#28c840' : '#94a3b8' }}
                  />
                </div>
                <p className="text-[11px] font-semibold text-white leading-tight">{wh.name}</p>
                <p className="text-[9px] text-white/40">{wh.staff} staff · {wh.revenue}</p>
              </div>
            ))}
          </div>

          {/* Recent invoices table */}
          <div className="rounded-lg bg-white/[0.03] ring-1 ring-white/5 overflow-hidden flex-1">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <p className="text-[10px] font-medium text-white/70">Recent Invoices</p>
              <button className="text-[9px] text-[#818cf8] hover:text-[#6366f1]">View all →</button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {['Invoice #', 'Customer', 'Tax', 'Amount', 'Status'].map(h => (
                    <th key={h} className="text-left px-3 py-1.5 text-[8px] text-white/30 font-medium tracking-wider uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INVOICES.map(row => (
                  <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2 font-mono text-[9px] text-[#818cf8]">{row.id}</td>
                    <td className="px-3 py-2 text-[10px] text-white/70 font-medium">{row.customer}</td>
                    <td className="px-3 py-2 text-[10px]" style={{ color: '#febc2e', opacity: 0.8 }}>{row.tax}</td>
                    <td className="px-3 py-2 text-[10px] text-white font-semibold">{row.amount}</td>
                    <td className="px-3 py-2">
                      <span
                        className="text-[9px] font-medium"
                        style={{ color: row.status === 'Paid' ? 'rgba(40,200,64,0.85)' : 'rgba(254,188,46,0.85)' }}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  )
}
