import { useState, useEffect } from 'react'
import {
  Building2, Package, FileText, Users, Shield,
  BarChart2, Settings, Terminal, Radio,
  Truck, ArrowUpRight, CheckCircle2,
  Lock, RefreshCw, Cpu
} from 'lucide-react'
import Logo from './Logo'

/* ─── Types ─────────────────────────────────────────────── */
interface InvoiceRow {
  id: string
  sku: string
  customer: string
  amount: string
  taxRule: '5% Std' | '15% Lux'
  status: 'Settled' | 'Pending'
}

interface DepotInfo {
  id: string
  name: string
  code: string
  activeBays: number
  capacityPercent: number
  temperature: string
  fleetStatus: string
  invoicesToday: number
  revenueToday: string
}

const DEPOTS: DepotInfo[] = [
  {
    id: 'dallas',
    name: 'Dallas Logistics Depot',
    code: 'DEPOT-DAL-01',
    activeBays: 12,
    capacityPercent: 84,
    temperature: '21.4°C Ambient',
    fleetStatus: '4 Convoy Trucks En Route',
    invoicesToday: 38,
    revenueToday: '$124,700',
  },
  {
    id: 'houston',
    name: 'Houston Intermodal Hub',
    code: 'HUB-HOU-02',
    activeBays: 18,
    capacityPercent: 91,
    temperature: '22.1°C Ambient',
    fleetStatus: '6 Convoy Trucks En Route',
    invoicesToday: 54,
    revenueToday: '$189,400',
  },
  {
    id: 'austin',
    name: 'Austin North Depot',
    code: 'DEPOT-ATX-03',
    activeBays: 8,
    capacityPercent: 62,
    temperature: '-18.5°C Cold Storage',
    fleetStatus: '2 Convoy Trucks Docked',
    invoicesToday: 21,
    revenueToday: '$68,250',
  },
]

const INVOICE_STREAM: InvoiceRow[] = [
  { id: 'INV-0038', sku: 'SKU-PIPE-902', customer: 'Texas Ironworks Ltd.',  amount: '$955.50',   taxRule: '5% Std',  status: 'Settled' },
  { id: 'INV-0037', sku: 'SKU-SRV-440',  customer: 'Global Parts Co.',      amount: '$2,340.00', taxRule: '15% Lux', status: 'Settled' },
  { id: 'INV-0036', sku: 'SKU-HYD-108',  customer: 'Apex Manufacturing',    amount: '$7,820.00', taxRule: '5% Std',  status: 'Settled' },
  { id: 'INV-0035', sku: 'SKU-FOT-055',  customer: 'NorthTex Logistics',    amount: '$5,200.00', taxRule: '5% Std',  status: 'Pending' },
  { id: 'INV-0034', sku: 'SKU-VAL-312',  customer: 'SwiftDepot Global',     amount: '$1,490.00', taxRule: '5% Std',  status: 'Settled' },
]

const SIDEBAR_ITEMS = [
  { icon: Terminal,   label: 'Telemetry HUD', active: true  },
  { icon: Building2,  label: 'Depot Nodes',   active: false },
  { icon: Package,    label: 'Inventory',     active: false },
  { icon: FileText,   label: 'Tax Billing',   active: false },
  { icon: Users,      label: 'Workforce',     active: false },
  { icon: Shield,     label: 'Audit Stream',  active: false },
  { icon: BarChart2,  label: 'Analytics',     active: false },
  { icon: Settings,   label: 'Settings',      active: false },
]

export default function DashboardMockup() {
  const [selectedDepot, setSelectedDepot] = useState<DepotInfo>(DEPOTS[0])
  const [taxSnapshot, setTaxSnapshot] = useState<'standard' | 'luxury'>('standard')
  const [liveTimestamp, setLiveTimestamp] = useState('14:32:08 UTC')
  const [refreshCount, setRefreshCount] = useState(0)

  // Live ticking clock for hardware authenticity
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const timeStr = now.toISOString().slice(11, 19) + ' UTC'
      setLiveTimestamp(timeStr)
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleSimulateSync = () => {
    setRefreshCount(c => c + 1)
  }

  return (
    <div className="rounded-xl overflow-hidden bg-[#0a0c10] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.7)] text-left select-none text-white">

      {/* ── Hardware Terminal Chrome Header ───────────────── */}
      <div className="bg-[#12151c] border-b border-white/10 px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
        
        {/* Terminal Identifier & Status LEDs */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-ping" />
            <span className="w-2 h-2 rounded-full bg-[#10b981]" />
          </div>
          <span className="font-mono text-[11px] font-bold text-white/90 tracking-wider">
            NEXWARE-TERMINAL <span className="text-[#f59e0b]">//</span> {selectedDepot.code}
          </span>
          <span className="hidden sm:inline text-[10px] font-mono text-white/40 border border-white/10 px-2 py-0.5 rounded">
            TLS 1.3 · ENCRYPTED
          </span>
        </div>

        {/* Center: Live WebSocket Status */}
        <div className="hidden md:flex items-center gap-2 font-mono text-[11px] text-white/60">
          <Radio className="w-3.5 h-3.5 text-[#06b6d4] animate-pulse" />
          <span>SOCKET: <strong className="text-[#06b6d4]">60 FPS LIVE</strong></span>
        </div>

        {/* Right: Hardware Time & Manual Sync Action */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-white/70 bg-[#0a0c10] border border-white/10 px-2.5 py-1 rounded">
            {liveTimestamp}
          </span>
          <button
            onClick={handleSimulateSync}
            className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            title="Force telemetry sync"
            aria-label="Force telemetry sync"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshCount > 0 ? 'text-[#f59e0b]' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Terminal Body Shell ───────────────────────────── */}
      <div className="flex min-h-[500px]">

        {/* ── Sidebar: Monospace Navigation ──────────────── */}
        <div className="w-[20%] border-r border-white/10 bg-[#0c0f14] p-3 flex flex-col justify-between shrink-0">
          
          <div className="space-y-4">
            {/* Brand Title */}
            <div className="flex items-center gap-2 px-1 py-1">
              <div className="w-6 h-6 rounded bg-[#f59e0b] flex items-center justify-center font-bold text-gray-900 text-xs">
                <Logo className="w-3.5 h-3.5 text-gray-900" />
              </div>
              <span className="font-bold text-xs tracking-tight text-white">NexWare OS</span>
            </div>

            {/* Navigation Links */}
            <div className="space-y-1">
              {SIDEBAR_ITEMS.map(({ icon: Icon, label, active }) => (
                <div
                  key={label}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded text-[11px] font-medium transition-all cursor-pointer ${
                    active
                      ? 'bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Security Scope */}
          <div className="pt-3 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between text-[9px] font-mono text-white/40 uppercase">
              <span>RBAC Tier</span>
              <span className="text-[#10b981] font-bold">Level 5</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-white/70 font-mono bg-white/5 p-2 rounded border border-white/5">
              <Lock className="w-3 h-3 text-[#f59e0b] shrink-0" />
              <span className="truncate">SUPER ADMIN</span>
            </div>
          </div>
        </div>

        {/* ── Main Operations Display ─────────────────────── */}
        <div className="flex-1 p-4 sm:p-5 flex flex-col gap-4 overflow-hidden bg-[#0a0c10]">

          {/* Top Row: Location Selector Tabs & Quick Stats */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-1.5 bg-[#12151c] p-1 rounded-lg border border-white/10">
              {DEPOTS.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDepot(d)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold font-mono transition-all ${
                    selectedDepot.id === d.id
                      ? 'bg-[#f59e0b] text-gray-900 shadow font-bold'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {d.name.split(' ')[0]} Hub
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-white/50">Temp:</span>
              <span className="text-[#06b6d4] font-bold bg-[#06b6d4]/10 border border-[#06b6d4]/30 px-2 py-0.5 rounded">
                {selectedDepot.temperature}
              </span>
            </div>
          </div>

          {/* KPI Stat Cards (Machined Industrial Grid) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="bg-[#12151c] border border-white/10 rounded-lg p-3 space-y-1">
              <span className="text-[9px] font-mono font-bold uppercase text-white/40 tracking-wider">Depot Capacity</span>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-bold font-mono text-white">{selectedDepot.capacityPercent}%</span>
                <span className="text-[10px] text-[#f59e0b] font-mono">{selectedDepot.activeBays} Bays</span>
              </div>
              <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                <div className="bg-[#f59e0b] h-full" style={{ width: `${selectedDepot.capacityPercent}%` }} />
              </div>
            </div>

            <div className="bg-[#12151c] border border-white/10 rounded-lg p-3 space-y-1">
              <span className="text-[9px] font-mono font-bold uppercase text-white/40 tracking-wider">Today's Revenue</span>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-bold font-mono text-white">{selectedDepot.revenueToday}</span>
                <span className="text-[10px] text-[#10b981] font-mono flex items-center">
                  <ArrowUpRight className="w-3 h-3" /> +14.2%
                </span>
              </div>
              <span className="text-[9px] text-white/40 font-mono">Atomic billing sync</span>
            </div>

            <div className="bg-[#12151c] border border-white/10 rounded-lg p-3 space-y-1">
              <span className="text-[9px] font-mono font-bold uppercase text-white/40 tracking-wider">Fleet Logistics</span>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold font-mono text-[#06b6d4] truncate">{selectedDepot.fleetStatus.split(' ')[0]} Units</span>
                <Truck className="w-3.5 h-3.5 text-[#06b6d4]" />
              </div>
              <span className="text-[9px] text-white/50 font-mono truncate block">{selectedDepot.fleetStatus}</span>
            </div>

            <div className="bg-[#12151c] border border-white/10 rounded-lg p-3 space-y-1">
              <span className="text-[9px] font-mono font-bold uppercase text-white/40 tracking-wider">Audit Integrity</span>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-bold font-mono text-[#10b981]">100%</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981]" />
              </div>
              <span className="text-[9px] text-white/40 font-mono">SOC2 / ISO Verified</span>
            </div>
          </div>

          {/* Mid Section: SVG Spatial Bay Floorplan & Freight Route Vector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            
            {/* Left 7 Cols: Interactive SVG Bay Floorplan */}
            <div className="lg:col-span-7 bg-[#12151c] border border-white/10 rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5 font-mono text-[11px]">
                  <Cpu className="w-3.5 h-3.5 text-[#f59e0b]" /> Bay Layout & Automated Racks
                </span>
                <span className="text-[10px] text-white/40 font-mono">Live Sensor Array</span>
              </div>

              {/* Vector SVG Schematic Floorplan */}
              <div className="h-28 w-full bg-[#08090c] border border-white/5 rounded p-2 relative overflow-hidden">
                <svg className="w-full h-full" viewBox="0 0 460 90" fill="none">
                  {/* Grid background lines */}
                  <line x1="0" y1="30" x2="460" y2="30" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  <line x1="0" y1="60" x2="460" y2="60" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  
                  {/* Bay A1 */}
                  <rect x="10" y="10" width="90" height="70" rx="4" fill="rgba(245,158,11,0.08)" stroke="#f59e0b" strokeWidth="1.2" />
                  <text x="20" y="30" fill="#f59e0b" fontSize="10" fontFamily="monospace" fontWeight="bold">BAY A-01</text>
                  <text x="20" y="46" fill="rgba(255,255,255,0.6)" fontSize="8" fontFamily="monospace">Machinery</text>
                  <text x="20" y="66" fill="#10b981" fontSize="9" fontFamily="monospace" fontWeight="bold">88% CAP</text>

                  {/* Bay A2 */}
                  <rect x="115" y="10" width="90" height="70" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  <text x="125" y="30" fill="#ffffff" fontSize="10" fontFamily="monospace" fontWeight="bold">BAY A-02</text>
                  <text x="125" y="46" fill="rgba(255,255,255,0.6)" fontSize="8" fontFamily="monospace">Hydraulics</text>
                  <text x="125" y="66" fill="#f59e0b" fontSize="9" fontFamily="monospace" fontWeight="bold">64% CAP</text>

                  {/* Cold Storage C3 */}
                  <rect x="220" y="10" width="110" height="70" rx="4" fill="rgba(6,182,212,0.08)" stroke="#06b6d4" strokeWidth="1.2" />
                  <text x="230" y="30" fill="#06b6d4" fontSize="10" fontFamily="monospace" fontWeight="bold">COLD ZONE C-3</text>
                  <text x="230" y="46" fill="rgba(255,255,255,0.6)" fontSize="8" fontFamily="monospace">-18.5°C Sealed</text>
                  <text x="230" y="66" fill="#06b6d4" fontSize="9" fontFamily="monospace" fontWeight="bold">92% CAP</text>

                  {/* Staging Dock */}
                  <rect x="345" y="10" width="105" height="70" rx="4" fill="rgba(16,185,129,0.08)" stroke="#10b981" strokeWidth="1.2" />
                  <text x="355" y="30" fill="#10b981" fontSize="10" fontFamily="monospace" fontWeight="bold">OUTBOUND DOCK</text>
                  <text x="355" y="46" fill="rgba(255,255,255,0.6)" fontSize="8" fontFamily="monospace">Waybills Ready</text>
                  <text x="355" y="66" fill="#10b981" fontSize="9" fontFamily="monospace" fontWeight="bold">LIVE DISPATCH</text>
                </svg>
              </div>
            </div>

            {/* Right 5 Cols: Live Tax Snapshot & Multi-Currency Engine */}
            <div className="lg:col-span-5 bg-[#12151c] border border-white/10 rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white font-mono text-[11px]">Instant Tax Snapshotting</span>
                <div className="flex items-center gap-1 bg-[#0a0c10] p-0.5 rounded border border-white/10">
                  <button
                    onClick={() => setTaxSnapshot('standard')}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded font-bold transition-all ${
                      taxSnapshot === 'standard' ? 'bg-[#f59e0b] text-gray-900' : 'text-white/50'
                    }`}
                  >
                    5% Std
                  </button>
                  <button
                    onClick={() => setTaxSnapshot('luxury')}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded font-bold transition-all ${
                      taxSnapshot === 'luxury' ? 'bg-[#f59e0b] text-gray-900' : 'text-white/50'
                    }`}
                  >
                    15% Lux
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex justify-between p-2 rounded bg-[#0a0c10] border border-white/5">
                  <span className="text-white/60">Subtotal Valuation:</span>
                  <span className="text-white font-bold">$124,700.00</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-[#0a0c10] border border-white/5">
                  <span className="text-white/60">Applied Rule:</span>
                  <span className="text-[#f59e0b] font-bold">
                    {taxSnapshot === 'standard' ? 'Standard 5% ($6,235.00)' : 'Luxury 15% ($18,705.00)'}
                  </span>
                </div>
                <div className="flex justify-between p-2 rounded bg-[#0a0c10] border border-white/5 text-[11px]">
                  <span className="text-white/40">Drift Protection:</span>
                  <span className="text-[#10b981] font-bold">Frozen In Immutable Ledger</span>
                </div>
              </div>
            </div>

          </div>

          {/* Bottom Table: Recent Immutable Transactions & Invoices */}
          <div className="bg-[#12151c] border border-white/10 rounded-lg overflow-hidden flex-1">
            <div className="px-3.5 py-2 border-b border-white/10 flex items-center justify-between text-xs">
              <span className="font-bold text-white font-mono text-[11px]">Recent Operational Invoices & Decrements</span>
              <span className="text-[10px] text-white/40 font-mono">Live Change Stream</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-white/5 text-white/40 uppercase text-[9px] tracking-wider bg-[#0a0c10]">
                    <th className="py-1.5 px-3">Invoice #</th>
                    <th className="py-1.5 px-3">SKU Code</th>
                    <th className="py-1.5 px-3">Enterprise Client</th>
                    <th className="py-1.5 px-3">Amount</th>
                    <th className="py-1.5 px-3">Tax Freeze</th>
                    <th className="py-1.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  {INVOICE_STREAM.map((row) => (
                    <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2 px-3 font-bold text-[#f59e0b]">{row.id}</td>
                      <td className="py-2 px-3 text-white/60">{row.sku}</td>
                      <td className="py-2 px-3 text-white font-sans text-xs">{row.customer}</td>
                      <td className="py-2 px-3 font-bold text-white">{row.amount}</td>
                      <td className="py-2 px-3">
                        <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[10px] text-[#f59e0b]">
                          {row.taxRule}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                          row.status === 'Settled' ? 'text-[#10b981]' : 'text-[#f59e0b]'
                        }`}>
                          ● {row.status}
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
    </div>
  )
}
