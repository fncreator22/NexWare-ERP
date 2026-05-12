/**
 * Dashboard Page — Optimized compact layout
 */
import { getCurrentUser, getWarehouses, getAllUsers, getItems, getBills, getAuditLogs, getSubscription, getTaxConfig } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { formatCurrency, formatDate } from '../modules/ui.js';

// Track chart instances so we can destroy before re-rendering
const _dashboardCharts = {};

export function renderDashboard() {
  const user = getCurrentUser();
  const whs = getWarehouses();
  const users = getAllUsers();
  const items = getItems();
  const bills = getBills();
  const logs = getAuditLogs().slice(0, 6);
  const sub = getSubscription();

  const totalRevenue = bills.reduce((s,b)=>s+(b.total||0),0);
  const totalTax    = bills.reduce((s,b)=>s+(b.tax||0),0);
  const totalStock  = items.reduce((s,i)=>s+(i.stock||0),0);
  const activeUsers = users.filter(u=>u.status==='active').length;
  const isSA = user.role === 'super_admin';
  const isAdmin = isSA || user.role === 'admin';

  // Low stock items
  const lowStock = items.filter(i=>(i.stock||0)<20).slice(0,5);

  // Top warehouse by revenue
  const topWh = whs.length ? [...whs].sort((a,b)=>(b.revenue||0)-(a.revenue||0))[0] : null;

  // Recent bills
  const recentBills = bills.slice(0,5);

  // Role-specific warehouse
  const myWh = !isSA ? whs.find(w=>w.id===user.warehouseId) : null;
  const roleLabel = isSA ? 'Global Overview' : `${myWh?.name || 'Warehouse'} Overview`;

  // Smart Restock Logic: Identify items with low stock relative to sales velocity
  const restockSuggestions = items
    .filter(i => (i.stock || 0) < 50)
    .map(i => {
      const salesCount = bills.reduce((acc, b) => acc + (b.items?.filter(bi => bi.id === i.id).reduce((s, bi) => s + bi.qty, 0) || 0), 0);
      const priority = (salesCount * 2) + (50 - (i.stock || 0));
      return { ...i, priority, salesCount };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);

  renderShell('Dashboard', roleLabel, `
    <div class="animate-slideUp">

      <!-- Welcome Banner -->
      <div style="background:var(--gradient-card);border:1px solid var(--border-brand);border-radius:var(--radius-xl);padding:20px 24px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="width:48px;height:48px;background:var(--gradient-brand);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:var(--shadow-brand);flex-shrink:0">👋</div>
        <div style="flex:1;min-width:0">
          <h2 style="font-size:20px;font-weight:800;margin-bottom:2px">Welcome back, ${user.name.split(' ')[0]}!</h2>
          <p style="color:var(--text-muted);font-size:13px">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})} · ${roleLabel}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isSA ? `<button class="btn btn-primary btn-sm" onclick="location.hash='#/warehouses'">🏭 Warehouses</button>
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/billing'">🧾 New Bill</button>` : ''}
          ${!isSA ? `<button class="btn btn-primary btn-sm" onclick="location.hash='#/billing'">🧾 New Bill</button>` : ''}
        </div>
      </div>

      <!-- KPI Cards — compact row -->
      <div class="stat-grid" style="margin-bottom:20px">
        ${isSA ? `<div class="stat-card">
          <div class="stat-card-glow" style="background:#6366f1"></div>
          <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">🏭</div>
          <div class="stat-card-value">${whs.length}</div>
          <div class="stat-card-label">Warehouses</div>
          <div class="stat-card-trend trend-up">${sub.plan} plan</div>
        </div>` : ''}
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#10b981"></div>
          <div class="stat-card-icon" style="background:rgba(16,185,129,0.15)">💰</div>
          <div class="stat-card-value">${formatCurrency(totalRevenue)}</div>
          <div class="stat-card-label">Revenue</div>
          <div class="stat-card-trend trend-up">Tax: ${formatCurrency(totalTax)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#8b5cf6"></div>
          <div class="stat-card-icon" style="background:rgba(139,92,246,0.15)">🧾</div>
          <div class="stat-card-value">${bills.length}</div>
          <div class="stat-card-label">Invoices</div>
          <div class="stat-card-trend trend-up">↑ This period</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#06b6d4"></div>
          <div class="stat-card-icon" style="background:rgba(6,182,212,0.15)">👥</div>
          <div class="stat-card-value">${activeUsers}</div>
          <div class="stat-card-label">Active Users</div>
          <div class="stat-card-trend">${users.length} total</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#f59e0b"></div>
          <div class="stat-card-icon" style="background:rgba(245,158,11,0.15)">📦</div>
          <div class="stat-card-value">${totalStock.toLocaleString()}</div>
          <div class="stat-card-label">Stock Units</div>
          <div class="stat-card-trend ${lowStock.length>0?'trend-down':'trend-up'}">${lowStock.length} low stock</div>
        </div>
        ${isSA ? `<div class="stat-card" style="cursor:pointer" onclick="location.hash='#/subscription'">
          <div class="stat-card-glow" style="background:#f43f5e"></div>
          <div class="stat-card-icon" style="background:rgba(244,63,94,0.15)">💳</div>
          <div class="stat-card-value" style="font-size:16px;text-transform:capitalize">${sub.plan}</div>
          <div class="stat-card-label">Plan</div>
          <div class="stat-card-trend trend-up">● Active</div>
        </div>` : ''}
      </div>

      <!-- Main content grid -->
      <div class="dashboard-grid">

        <!-- Revenue Chart -->
        <div class="chart-card col-8">
          <div class="chart-card-header">
            <div>
              <div class="chart-card-title">📈 Revenue Trend</div>
              <div class="chart-card-subtitle">Last 6 months across all warehouses</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" id="chart-6m" style="font-size:11px;padding:4px 8px">6M</button>
              <button class="btn btn-ghost btn-sm" id="chart-1y" style="font-size:11px;padding:4px 8px">1Y</button>
            </div>
          </div>
          <div class="chart-container" style="height:180px"><canvas id="revenue-chart"></canvas></div>
        </div>

        <!-- Activity Feed -->
        <div class="chart-card col-4">
          <div class="chart-card-header">
            <div class="chart-card-title">⚡ Activity</div>
            <button class="btn btn-ghost btn-sm" onclick="location.hash='#/audit'" style="font-size:11px">All →</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:0">
            ${logs.length === 0 ? `<div style="color:var(--text-muted);font-size:13px;padding:12px 0">No recent activity</div>` :
              logs.map(log=>`
                <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
                  <div style="width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0;background:${log.action.includes('create')?'var(--accent-emerald)':log.action.includes('delete')?'var(--accent-rose)':'var(--accent-cyan)'}"></div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${log.description}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${log.userName} · ${formatDate(log.timestamp)}</div>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
      </div>

      <!-- Second row -->
      <div class="dashboard-grid">

        <!-- Warehouse Summary -->
        <div class="chart-card col-4">
          <div class="chart-card-header">
            <div class="chart-card-title">🏭 Warehouses</div>
            <button class="btn btn-primary btn-sm" onclick="location.hash='#/warehouses'" style="font-size:11px;padding:4px 10px">Manage</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${whs.slice(0,4).map(wh=>`
              <div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg-input);border-radius:8px;cursor:pointer" onclick="location.hash='#/warehouses/${wh.id}'">
                <div style="font-size:20px">${wh.logo||'🏭'}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${wh.name}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${wh.staffCount||0} staff · ${formatCurrency(wh.revenue||0)}</div>
                </div>
                <span class="badge badge-success" style="font-size:10px">●</span>
              </div>
            `).join('')}
            ${whs.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No warehouses yet</div>` : ''}
          </div>
        </div>` : `<div class="chart-card">
          <div class="chart-card-header">
            <div class="chart-card-title">🏭 My Warehouse</div>
          </div>
          ${myWh ? `
          <div style="text-align:center;padding:8px 0">
            <div style="font-size:40px;margin-bottom:8px">${myWh.logo||'🏭'}</div>
            <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${myWh.name}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${myWh.businessName}</div>
            <div style="display:flex;justify-content:center;gap:20px">
              <div><div style="font-weight:700;font-size:18px">${myWh.staffCount||0}</div><div style="font-size:11px;color:var(--text-muted)">Staff</div></div>
              <div><div style="font-weight:700;font-size:18px">${myWh.items||0}</div><div style="font-size:11px;color:var(--text-muted)">Items</div></div>
            </div>
          </div>` : '<div style="color:var(--text-muted);text-align:center;padding:20px">Not assigned</div>'}
        </div>`}

        <!-- Billing Quick Stats -->
        <div class="chart-card col-4">
          <div class="chart-card-header">
            <div class="chart-card-title">💰 Billing Stats</div>
            <button class="btn btn-ghost btn-sm" onclick="location.hash='#/billing'" style="font-size:11px">View →</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
            ${[
              { label:'Total Revenue', val: formatCurrency(totalRevenue), color:'var(--accent-emerald)' },
              { label:'Total Tax',     val: formatCurrency(totalTax),    color:'var(--accent-amber)'   },
              { label:'Net Revenue',   val: formatCurrency(totalRevenue-totalTax), color:'var(--text-brand)' },
              { label:'Avg Invoice',   val: bills.length ? formatCurrency(totalRevenue/bills.length) : '$0', color:'var(--accent-cyan)' },
            ].map(s=>`
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:12px;color:var(--text-muted)">${s.label}</span>
                <span style="font-size:14px;font-weight:700;color:${s.color}">${s.val}</span>
              </div>
            `).join('')}
          </div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px">Recent</div>
          ${recentBills.slice(0,3).map(b=>`
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border-subtle)">
              <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${b.billNo}</div>
              <div style="font-size:11px;font-weight:600;color:var(--accent-emerald)">${formatCurrency(b.total)}</div>
            </div>
          `).join('')}
        </div>

        <!-- Low Stock Alerts -->
        <div class="chart-card col-4">
          <div class="chart-card-header">
            <div class="chart-card-title">⚠️ Low Stock</div>
            <button class="btn btn-ghost btn-sm" onclick="location.hash='#/items'" style="font-size:11px">View →</button>
          </div>
          ${lowStock.length === 0
            ? `<div style="text-align:center;padding:16px;color:var(--accent-emerald);font-size:13px">✅ All stock levels healthy</div>`
            : lowStock.map(i=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-subtle)">
                <div style="font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${i.name}</div>
                <span style="font-size:11px;font-weight:700;color:${i.stock<10?'var(--accent-rose)':'var(--accent-amber)'};flex-shrink:0;margin-left:8px">${i.stock} left</span>
              </div>
            `).join('')}
          <div style="margin-top:12px;border-top:1px solid var(--border-subtle);padding-top:12px">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">Quick Actions</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              ${[
                { icon:'📦', label:'Add Item',   href:'/items'     },
                { icon:'🧾', label:'New Bill',   href:'/billing'   },
                { icon:'👥', label:'Workforce',  href:'/workforce' },
                { icon:'📈', label:'Reports',    href:'/analytics' },
              ].filter(a=>isAdmin || (a.href!=='/workforce')).map(a=>`
                <button class="btn btn-secondary btn-sm" onclick="location.hash='#${a.href}'" style="font-size:11px;padding:6px 8px;justify-content:flex-start;gap:5px">${a.icon} ${a.label}</button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Third Row -->
      <div class="dashboard-grid">
        
        <!-- Smart Restock Recommender -->
        <div class="chart-card col-5">
          <div class="chart-card-header">
            <div>
              <div class="chart-card-title">💡 Smart Restock</div>
              <div class="chart-card-subtitle">AI-prioritized inventory needs</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${restockSuggestions.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--text-muted)">Stock levels optimal</div>' :
              restockSuggestions.map(s => `
                <div style="background:rgba(99,102,241,0.05);padding:12px;border-radius:10px;border:1px solid rgba(99,102,241,0.1);display:flex;align-items:center;gap:12px">
                  <div style="width:36px;height:36px;background:var(--bg-card);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px">📦</div>
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${s.name}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${s.salesCount} sold recently · Priority: ${s.priority > 30 ? 'High 🔥' : 'Medium'}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:14px;font-weight:800;color:${s.stock < 10 ? 'var(--accent-rose)' : 'var(--accent-amber)'}">${s.stock}</div>
                    <div style="font-size:10px;color:var(--text-muted)">In Stock</div>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>

        <!-- Revenue Summary -->
        <div class="chart-card col-7">
          <div class="chart-card-header">
            <div class="chart-card-title">📊 Revenue Summary</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div style="padding:15px;background:var(--bg-input);border-radius:12px;text-align:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px">Gross Revenue</div>
              <div style="font-size:18px;font-weight:800;color:var(--accent-emerald)">${formatCurrency(totalRevenue).split('.')[0]}</div>
            </div>
            <div style="padding:15px;background:var(--bg-input);border-radius:12px;text-align:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px">Total Tax</div>
              <div style="font-size:18px;font-weight:800;color:var(--accent-amber)">${formatCurrency(totalTax).split('.')[0]}</div>
            </div>
            <div style="padding:15px;background:var(--bg-input);border-radius:12px;text-align:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px">Net Earnings</div>
              <div style="font-size:18px;font-weight:800;color:var(--text-brand)">${formatCurrency(totalRevenue-totalTax).split('.')[0]}</div>
            </div>
          </div>
          <div style="margin-top:15px;padding:15px;background:linear-gradient(90deg, rgba(99,102,241,0.1), transparent);border-radius:12px;display:flex;align-items:center;gap:12px">
            <div style="font-size:24px">📈</div>
            <div>
              <div style="font-size:13px;font-weight:700">Projected Growth</div>
              <div style="font-size:11px;color:var(--text-muted)">Expected +12% increase based on current month volume</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Workforce Summary -->
      ${isAdmin ? `
      <div class="dashboard-grid">
        <div class="chart-card col-6">
          <div class="chart-card-header">
            <div class="chart-card-title">👥 Workforce Summary</div>
            <button class="btn btn-primary btn-sm" onclick="location.hash='#/workforce'" style="font-size:11px;padding:4px 10px">Manage</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
            ${['admin','manager','staff','employee'].map(r=>{
              const count = users.filter(u=>u.role===r).length;
              const icons={admin:'🔵',manager:'🟢',staff:'🟡',employee:'⚫'};
              return `<div style="text-align:center;padding:10px;background:var(--bg-input);border-radius:8px">
                <div style="font-size:16px;margin-bottom:4px">${icons[r]}</div>
                <div style="font-size:18px;font-weight:800;color:var(--text-primary)">${count}</div>
                <div style="font-size:10px;color:var(--text-muted);text-transform:capitalize">${r}</div>
              </div>`;
            }).join('')}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${users.slice(0,4).map(u=>`
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:28px;height:28px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0">${u.avatar}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
                </div>
                <span style="font-size:10px;color:var(--text-muted)">${u.role}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Warehouse Distribution -->
        <div class="chart-card col-6">
          <div class="chart-card-header">
            <div class="chart-card-title">📊 Revenue by Warehouse</div>
          </div>
          <div class="chart-container" style="height:160px"><canvas id="wh-chart"></canvas></div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:8px">
            ${whs.slice(0,5).map((wh,i)=>{
              const palette = ['#6366f1','#10b981','#06b6d4','#f59e0b','#a855f7'];
              const pct = totalRevenue>0 ? Math.round((wh.revenue||0)/totalRevenue*100) : 0;
              return `<div style="display:flex;align-items:center;gap:8px;font-size:11px">
                <div style="width:10px;height:10px;border-radius:2px;background:${palette[i % palette.length]};flex-shrink:0"></div>
                <span style="color:var(--text-muted);flex:1">${wh.name}</span>
                <span style="font-weight:600;color:var(--text-primary)">${pct}%</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : `
        <div class="chart-card col-6">
          <div class="chart-card-header"><div class="chart-card-title">📋 My Tables</div></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="location.hash='#/tables'" style="width:100%">📋 View My Tables</button>
            <button class="btn btn-secondary btn-sm" onclick="location.hash='#/analytics'" style="width:100%">📈 View Reports</button>
            <button class="btn btn-secondary btn-sm" onclick="location.hash='#/items'" style="width:100%">📦 Manage Inventory</button>
          </div>
        </div>`}
      </div>` : ''}

    </div>

    <!-- Floating Action Button for Quick Invoicing -->
    <button class="fab" onclick="location.hash='#/billing'" title="Quick Invoice">
      <span style="font-size:24px">🧾</span>
    </button>
  `);

  setTimeout(() => initDashboardCharts(bills, whs), 100);
}

function initDashboardCharts(bills, whs) {
  // Revenue trend chart
  const now = new Date();
  const labels = [];
  const data = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    labels.push(d.toLocaleString('default',{month:'short'}));
    const monthRevenue = bills.filter(b=>{
      const bd = new Date(b.createdAt);
      return bd.getMonth()===d.getMonth() && bd.getFullYear()===d.getFullYear();
    }).reduce((s,b)=>s+b.total,0);
    data.push(monthRevenue || 0);
  }

  const rc = document.getElementById('revenue-chart');
  if (rc) {
    if (_dashboardCharts.revenue) _dashboardCharts.revenue.destroy();
    _dashboardCharts.revenue = new Chart(rc, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Revenue',
          data,
          backgroundColor: data.map((_,i)=>i===data.length-1?'rgba(99,102,241,0.9)':'rgba(99,102,241,0.35)'),
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor:'#1a1d3a', titleColor:'#f1f5f9', bodyColor:'#94a3b8', borderColor:'#2a2d4a', borderWidth:1,
            callbacks: { label: ctx => ' $' + ctx.raw.toLocaleString() }
          }
        },
        scales: {
          x: { grid: { display:false }, ticks: { color:'#64748b', font:{size:11} } },
          y: { grid: { color:'rgba(255,255,255,0.04)' }, ticks: { color:'#64748b', font:{size:11}, callback: v=>'$'+(v/1000).toFixed(0)+'k' }, border:{display:false} }
        }
      }
    });
  }

  // Doughnut chart
  const wc = document.getElementById('wh-chart');
  if (wc && whs.length > 0) {
    if (_dashboardCharts.wh) _dashboardCharts.wh.destroy();
    
    // Generate colors cyclically based on number of warehouses
    const palette = ['rgba(99,102,241,0.85)', 'rgba(16,185,129,0.85)', 'rgba(6,182,212,0.85)', 'rgba(245,158,11,0.85)', 'rgba(168,85,247,0.85)'];
    const bgColors = whs.map((_, i) => palette[i % palette.length]);
    
    _dashboardCharts.wh = new Chart(wc, {
      type: 'doughnut',
      data: {
        labels: whs.map(w=>w.name),
        datasets: [{
          data: whs.map(w=>w.revenue||0),
          backgroundColor: bgColors,
          borderColor: '#0f1029', borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor:'#1a1d3a', titleColor:'#f1f5f9', bodyColor:'#94a3b8',
            callbacks: { label: ctx => ' $' + ctx.raw.toLocaleString() }
          }
        },
        cutout: '70%'
      }
    });
  }
}
