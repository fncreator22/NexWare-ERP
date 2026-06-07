/**
 * Dashboard Page — Optimized compact layout
 */
import { getCurrentUser, getWarehouses, getAllUsers, getItems, getBills, getAuditLogs, getSubscription, getTaxConfig, apiFetch } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { formatCurrency, formatDate, getSvgIcon, renderAvatarContainer, renderWarehouseLogo } from '../modules/ui.js';
import { canDo } from '../modules/permissions.js';

// Track chart instances so we can destroy before re-rendering
const _dashboardCharts = {};

/**
 * Renders the main dashboard page for the ERP platform.
 * Dynamically computes key operational metrics (total revenue, taxes, stock units, active workforce)
 * based on user privileges (Super Admin global view or Warehouse-specific views).
 * Displays KPI cards, revenue charts, recent activity logs, and automated restock suggestions.
 * Mounts standard interaction buttons and floating actions.
 */
export function renderDashboard() {
  const user = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
  const whs = getWarehouses();
  const users = getAllUsers();
  const items = getItems();
  const bills = getBills();
  const logs = getAuditLogs().slice(0, 6);  const sub = getSubscription();
  const isSA = user.role === 'super_admin';

  // Dynamic capability checks
  const canViewWarehouses = canDo('warehouses', 'view', user);
  const canViewBilling = canDo('billing', 'view', user);
  const canViewWorkforce = canDo('workforce', 'view', user);
  const canViewInventory = canDo('inventory', 'view', user);
  const canViewAudit = canDo('audit', 'view', user);
  const canViewReports = canDo('reports', 'view', user);

  const totalRevenue = bills.reduce((s,b)=>s+(b.total||0),0);
  const totalTax    = bills.reduce((s,b)=>s+(b.tax||0),0);
  const totalStock  = items.reduce((s,i)=>s+(i.stock||0),0);
  const activeUsers = users.filter(u=>u.status==='active').length;

  // Low stock items calculated dynamically based on threshold
  const allLowStockItems = items.filter(i => {
    const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
    return (i.stock || 0) <= threshold;
  });
  const lowStock = allLowStockItems.slice(0, 5);

  // Top warehouse by revenue
  const topWh = whs.length ? [...whs].sort((a,b)=>(b.revenue||0)-(a.revenue||0))[0] : null;

  // Recent bills
  const recentBills = bills.slice(0,5);

  // Role-specific warehouse
  const myWh = !isSA ? whs.find(w=>w.id===user.warehouseId) : null;
  const roleLabel = isSA ? 'Global Overview' : `${myWh?.name || 'Warehouse'} Overview`;

  // Smart Restock Logic: Identify items with low stock relative to sales velocity using dynamic threshold
  const restockSuggestions = items
    .filter(i => {
      const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
      return (i.stock || 0) <= threshold;
    })
    .map(i => {
      const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
      const salesCount = bills.reduce((acc, b) => acc + (b.items?.filter(bi => bi.id === i.id).reduce((s, bi) => s + bi.qty, 0) || 0), 0);
      const priority = (salesCount * 2) + (threshold - (i.stock || 0));
      return { ...i, priority, salesCount };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);

  // Count visible panels in second row to compute responsive widths
  const row2Count = 1 + (canViewBilling ? 1 : 0) + (canViewInventory ? 1 : 0);
  const row2Col = row2Count === 3 ? 'col-4' : row2Count === 2 ? 'col-6' : 'col-12';

  renderShell('Dashboard', roleLabel, `
    <div class="animate-slideUp">

      <!-- Welcome Banner -->
      <div style="background:var(--gradient-card);border:1px solid var(--border-brand);border-radius:var(--radius-xl);padding:20px 24px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="width:48px;height:48px;background:var(--gradient-brand);border-radius:14px;display:flex;align-items:center;justify-content:center;color:white;box-shadow:var(--shadow-brand);flex-shrink:0">${getSvgIcon('dashboard', 22)}</div>
        <div style="flex:1;min-width:0">
          <h2 style="font-size:20px;font-weight:800;margin-bottom:2px">Welcome back, ${user.name.split(' ')[0]}!</h2>
          <p style="color:var(--text-muted);font-size:13px">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})} · ${roleLabel}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isSA ? `<button class="btn btn-primary btn-sm" style="display:inline-flex;align-items:center;gap:6px" onclick="location.hash='#/warehouses'">${getSvgIcon('warehouses', 14)} Warehouses</button>` : ''}
          ${canDo('billing', 'create', user) ? `<button class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:6px" onclick="location.hash='#/billing'">${getSvgIcon('billing', 14)} New Bill</button>` : ''}
        </div>
      </div>

      <!-- KPI Cards — compact row -->
      <div class="stat-grid" style="margin-bottom:20px">
        ${canViewWarehouses ? `<div class="stat-card">
          <div class="stat-card-glow" style="background:#6366f1"></div>
          <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">${getSvgIcon('warehouses', 20)}</div>
          <div class="stat-card-value">${whs.length}</div>
          <div class="stat-card-label">Warehouses</div>
          <div class="stat-card-trend trend-up">${sub.plan} plan</div>
        </div>` : ''}
        ${canViewBilling ? `
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#10b981"></div>
          <div class="stat-card-icon" style="background:rgba(16,185,129,0.15)">${getSvgIcon('revenue', 20)}</div>
          <div class="stat-card-value">${formatCurrency(totalRevenue)}</div>
          <div class="stat-card-label">Revenue</div>
          <div class="stat-card-trend trend-up">Tax: ${formatCurrency(totalTax)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#8b5cf6"></div>
          <div class="stat-card-icon" style="background:rgba(139,92,246,0.15)">${getSvgIcon('billing', 20)}</div>
          <div class="stat-card-value">${bills.length}</div>
          <div class="stat-card-label">Invoices</div>
          <div class="stat-card-trend trend-up">↑ This period</div>
        </div>
        ` : ''}
        ${canViewWorkforce ? `<div class="stat-card">
          <div class="stat-card-glow" style="background:#06b6d4"></div>
          <div class="stat-card-icon" style="background:rgba(6,182,212,0.15)">${getSvgIcon('workforce', 20)}</div>
          <div class="stat-card-value">${activeUsers}</div>
          <div class="stat-card-label">Active Users</div>
          <div class="stat-card-trend">${users.length} total</div>
        </div>` : ''}
        ${canViewInventory ? `<div class="stat-card" id="dash-stock-units-card" style="cursor:pointer">
          <div class="stat-card-glow" style="background:#f59e0b"></div>
          <div class="stat-card-icon" style="background:rgba(245,158,11,0.15)">${getSvgIcon('items', 20)}</div>
          <div class="stat-card-value">${totalStock.toLocaleString()}</div>
          <div class="stat-card-label">Stock Units</div>
          <div class="stat-card-trend ${allLowStockItems.length>0?'trend-down':'trend-up'}">${allLowStockItems.length} low stock</div>
        </div>` : ''}
        ${isSA ? `<div class="stat-card" style="cursor:pointer" onclick="location.hash='#/subscription'">
          <div class="stat-card-glow" style="background:#f43f5e"></div>
          <div class="stat-card-icon" style="background:rgba(244,63,94,0.15)">${getSvgIcon('subscription', 20)}</div>
          <div class="stat-card-value" style="font-size:16px;text-transform:capitalize">${sub.plan}</div>
          <div class="stat-card-label">Plan</div>
          <div class="stat-card-trend trend-up">● Active</div>
        </div>` : ''}
      </div>

      <!-- Main content grid -->
      ${(canViewBilling || canViewReports || canViewAudit) ? `
      <div class="dashboard-grid">

        <!-- Revenue Chart -->
        ${(canViewBilling || canViewReports) ? `
        <div class="chart-card ${canViewAudit ? 'col-8' : 'col-12'}">
          <div class="chart-card-header">
            <div>
              <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('analytics', 18)} Revenue Trend</div>
              <div class="chart-card-subtitle">Last 6 months across all warehouses</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" id="chart-6m" style="font-size:11px;padding:4px 8px">6M</button>
              <button class="btn btn-ghost btn-sm" id="chart-1y" style="font-size:11px;padding:4px 8px">1Y</button>
            </div>
          </div>
          <div class="chart-container" style="height:180px"><canvas id="revenue-chart"></canvas></div>
        </div>
        ` : ''}

        <!-- Activity Feed -->
        ${canViewAudit ? `
        <div class="chart-card ${(canViewBilling || canViewReports) ? 'col-4' : 'col-12'}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('clock', 18)} Activity</div>
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
        ` : ''}
      </div>
      ` : ''}

      <!-- Second row -->
      <div class="dashboard-grid">

        <!-- Warehouse Summary -->
        ${canViewWarehouses ? `
        <div class="chart-card ${row2Col}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('warehouses', 18)} Warehouses</div>
            <button class="btn btn-primary btn-sm" onclick="location.hash='#/warehouses'" style="font-size:11px;padding:4px 10px">Manage</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${whs.slice(0,4).map(wh=>`
              <div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg-input);border-radius:8px;cursor:pointer" onclick="location.hash='#/warehouses/${wh.id}'">
                <div style="display:flex;align-items:center">${renderWarehouseLogo(wh.logo, 20)}</div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${wh.name}</span>
                    <span style="font-family:var(--font-mono);font-size:9px;background:var(--bg-card);padding:1px 5px;border-radius:4px;color:var(--text-muted);border:1px solid var(--border-subtle);flex-shrink:0;">#${wh.id.slice(-6)}</span>
                  </div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${wh.staffCount||0} staff · ${formatCurrency(wh.revenue||0)}</div>
                </div>
                <span class="badge badge-success" style="font-size:10px">●</span>
              </div>
            `).join('')}
            ${whs.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No warehouses yet</div>` : ''}
          </div>
        </div>` : `
        <div class="chart-card ${row2Col}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('warehouses', 18)} My Warehouse</div>
          </div>
          ${myWh ? `
          <div style="text-align:center;padding:8px 0">
            <div style="display:flex;justify-content:center;margin-bottom:8px">${renderWarehouseLogo(myWh.logo, 40)}</div>
            <div style="font-size:16px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;justify-content:center;gap:6px">
              ${myWh.name}
              <span style="font-family:var(--font-mono);font-size:11px;background:var(--bg-input);padding:2px 6px;border-radius:4px;color:var(--text-muted);border:1px solid var(--border-subtle)">#${myWh.id.slice(-6)}</span>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;margin-top:4px">${myWh.businessName}</div>
            <div style="display:flex;justify-content:center;gap:20px">
              <div><div style="font-weight:700;font-size:18px">${myWh.staffCount||0}</div><div style="font-size:11px;color:var(--text-muted)">Staff</div></div>
              <div><div style="font-weight:700;font-size:18px">${myWh.items||0}</div><div style="font-size:11px;color:var(--text-muted)">Items</div></div>
            </div>
          </div>` : '<div style="color:var(--text-muted);text-align:center;padding:20px">Not assigned</div>'}
        </div>`}

        <!-- Billing Quick Stats -->
        ${canViewBilling ? `
        <div class="chart-card ${row2Col}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('billing', 18)} Billing Stats</div>
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
        ` : ''}

        <!-- Low Stock Alerts -->
        ${canViewInventory ? `
        <div class="chart-card ${row2Col}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px;color:var(--accent-rose)">${getSvgIcon('warning', 18)} Low Stock</div>
            <button class="btn btn-ghost btn-sm" onclick="location.hash='#/items'" style="font-size:11px">View →</button>
          </div>
          ${lowStock.length === 0
            ? `<div style="text-align:center;padding:16px;color:var(--accent-emerald);font-size:13px">✅ All stock levels healthy</div>`
            : lowStock.map(i=>`
              <div class="clickable-list-item" onclick="location.hash='#/items?id=${i.id}'" style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border-subtle);cursor:pointer;border-radius:4px;transition:background 0.15s;" onmouseenter="this.style.background='var(--bg-input)'" onmouseleave="this.style.background='transparent'">
                <div style="font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${i.name}</div>
                <span style="font-size:11px;font-weight:700;color:${i.stock<=(i.lowStockThreshold !== undefined ? i.lowStockThreshold/2 : 10)?'var(--accent-rose)':'var(--accent-amber)'};flex-shrink:0;margin-left:8px">${i.stock} left</span>
              </div>
            `).join('')}
          <div style="margin-top:12px;border-top:1px solid var(--border-subtle);padding-top:12px">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">Quick Actions</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              ${[
                { icon:'items', label:'Add Item',   href:'/items', mod: 'inventory' },
                { icon:'billing', label:'New Bill',   href:'/billing', mod: 'billing' },
                { icon:'workforce', label:'Workforce',  href:'/workforce', mod: 'workforce' },
                { icon:'analytics', label:'Reports',    href:'/analytics', mod: 'reports' },
              ].filter(a => canDo(a.mod, 'view', user) || (a.mod === 'billing' && canDo('billing', 'create', user))).map(a=>`
                <button class="btn btn-secondary btn-sm" onclick="location.hash='#${a.href}'" style="font-size:11px;padding:6px 8px;justify-content:flex-start;gap:6px">${getSvgIcon(a.icon, 14)} ${a.label}</button>
              `).join('')}
            </div>
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Third Row -->
      ${(canViewInventory || canViewBilling) ? `
      <div class="dashboard-grid">
        
        <!-- Smart Restock Recommender -->
        ${canViewInventory ? `
        <div class="chart-card ${canViewBilling ? 'col-5' : 'col-12'}">
          <div class="chart-card-header">
            <div>
              <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('bulb', 18)} Restock Recommender</div>
              <div class="chart-card-subtitle">Priority inventory reorder requirements</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${restockSuggestions.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--text-muted)">Stock levels optimal</div>' :
              restockSuggestions.map(s => `
                <div class="clickable-list-item" onclick="location.hash='#/items?id=${s.id}'" style="background:rgba(255,255,255,0.02);padding:12px;border-radius:10px;border:1px solid var(--border-default);display:flex;align-items:center;gap:12px;cursor:pointer;transition:transform 0.15s, background 0.15s;" onmouseenter="this.style.background='var(--bg-input)';this.style.transform='translateY(-2px)'" onmouseleave="this.style.background='rgba(255,255,255,0.02)';this.style.transform=''">
                  <div style="width:36px;height:36px;background:var(--bg-card);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0">${getSvgIcon('items', 18)}</div>
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${s.name}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${s.salesCount} units sold · Priority: ${s.priority > (s.lowStockThreshold !== undefined ? s.lowStockThreshold*1.5 : 30) ? 'High' : 'Normal'}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:14px;font-weight:800;color:${s.stock <= (s.lowStockThreshold !== undefined ? s.lowStockThreshold/2 : 10) ? 'var(--accent-rose)' : 'var(--accent-amber)'}">${s.stock}</div>
                    <div style="font-size:10px;color:var(--text-muted)">In Stock</div>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Revenue Summary -->
        ${canViewBilling ? `
        <div class="chart-card ${canViewInventory ? 'col-7' : 'col-12'}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('analytics', 18)} Revenue Summary</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;height:calc(100% - 48px);align-content:center">
            <div style="padding:18px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:12px;text-align:center;display:flex;flex-direction:column;justify-content:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Gross Revenue</div>
              <div style="font-size:20px;font-weight:800;color:var(--accent-emerald)">${formatCurrency(totalRevenue).split('.')[0]}</div>
            </div>
            <div style="padding:18px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:12px;text-align:center;display:flex;flex-direction:column;justify-content:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Total Tax</div>
              <div style="font-size:20px;font-weight:800;color:var(--accent-amber)">${formatCurrency(totalTax).split('.')[0]}</div>
            </div>
            <div style="padding:18px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:12px;text-align:center;display:flex;flex-direction:column;justify-content:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Net Earnings</div>
              <div style="font-size:20px;font-weight:800;color:var(--text-brand)">${formatCurrency(totalRevenue-totalTax).split('.')[0]}</div>
            </div>
          </div>
        </div>
        ` : ''}
      </div>
      ` : ''}

      <!-- Fourth Row: Workforce & Distribution -->
      ${canViewWorkforce || (canViewReports && canViewWarehouses) ? `
      <div class="dashboard-grid">
        ${canViewWorkforce ? `
        <div class="chart-card ${(canViewReports && canViewWarehouses) ? 'col-6' : 'col-12'}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('workforce', 18)} Workforce Summary</div>
            <button class="btn btn-primary btn-sm" onclick="location.hash='#/workforce'" style="font-size:11px;padding:4px 10px">Manage</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
            ${['admin','manager','staff','employee'].map(r=>{
              const count = users.filter(u=>u.role===r).length;
              const badges={
                admin: `<span class="badge role-admin" style="font-size:9px;padding:2px 4px;margin-top:4px;display:inline-block">Admin</span>`,
                manager: `<span class="badge role-manager" style="font-size:9px;padding:2px 4px;margin-top:4px;display:inline-block">Manager</span>`,
                staff: `<span class="badge role-staff" style="font-size:9px;padding:2px 4px;margin-top:4px;display:inline-block">Staff</span>`,
                employee: `<span class="badge role-employee" style="font-size:9px;padding:2px 4px;margin-top:4px;display:inline-block">Employee</span>`
              };
              return `<div style="text-align:center;padding:10px 4px;background:var(--bg-input);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center">
                <div style="font-size:18px;font-weight:800;color:var(--text-primary);line-height:1">${count}</div>
                ${badges[r]}
              </div>`;
            }).join('')}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${users.slice(0,4).map(u=>`
              <div style="display:flex;align-items:center;gap:8px">
                <div style="flex-shrink:0">${renderAvatarContainer(u.avatar, u.name, 28)}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
                </div>
                <span style="font-size:10px;color:var(--text-muted)">${u.role.charAt(0).toUpperCase() + u.role.slice(1).replace('_', ' ')}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Warehouse Distribution -->
        ${canViewReports && canViewWarehouses ? `
        <div class="chart-card ${canViewWorkforce ? 'col-6' : 'col-12'}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('analytics', 18)} Revenue by Warehouse</div>
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
        </div>
        ` : ''}
      </div>
      ` : ''}

    </div>

    <!-- Floating Action Button for Quick Invoicing -->
    ${canDo('billing', 'create', user) ? `
    <button class="fab" onclick="location.hash='#/billing'" title="Quick Invoice">
      <span style="display:flex;align-items:center;justify-content:center;color:white">${getSvgIcon('billing', 24)}</span>
    </button>
    ` : ''}
  `);

  setTimeout(() => initDashboardCharts(whs), 100);
}

/**
 * Initializes and draws the dashboard analytics charts.
 * Creates a monthly revenue bar chart and a warehouse revenue distribution doughnut chart.
 * Recreates instances as needed to avoid resource leaks or overlay duplication.
 * @param {Array<Object>} bills - Loaded invoices/billing items.
 * @param {Array<Object>} whs - Active warehouses.
 * @private
 */
async function initDashboardCharts(whs) {
  // Fetch dynamic trends data from the API
  let fullTrends = [];
  const trendsRes = await apiFetch('/analytics/trends');
  if (trendsRes && trendsRes.success && Array.isArray(trendsRes.data)) {
    fullTrends = trendsRes.data;
  }

  const renderTrendChart = (monthsCount) => {
    const subset = fullTrends.slice(-monthsCount);
    let labels = [];
    let data = [];
    if (subset.length > 0) {
      labels = subset.map(t => t.monthName.split(' ')[0]); // e.g. "Jun"
      data = subset.map(t => t.totalRevenue);
    } else {
      // Fallback
      const now = new Date();
      for (let i = monthsCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(d.toLocaleString('default', { month: 'short' }));
        data.push(0);
      }
    }

    const rc = document.getElementById('revenue-chart');
    if (rc) {
      if (_dashboardCharts.revenue) {
        try { _dashboardCharts.revenue.destroy(); } catch(e) {}
      }
      const parent = rc.parentElement;
      const newCanvas = document.createElement('canvas');
      newCanvas.id = 'revenue-chart';
      parent.replaceChild(newCanvas, rc);
      
      _dashboardCharts.revenue = new Chart(newCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Revenue',
            data,
            backgroundColor: data.map((_, i) => i === data.length - 1 ? 'rgba(99,102,241,0.9)' : 'rgba(99,102,241,0.35)'),
            borderColor: '#6366f1',
            borderWidth: 1,
            borderRadius: 6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1a1d3a',
              titleColor: '#f1f5f9',
              bodyColor: '#94a3b8',
              borderColor: '#2a2d4a',
              borderWidth: 1,
              callbacks: { label: ctx => ' $' + ctx.raw.toLocaleString() }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
            y: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: { color: '#64748b', font: { size: 11 }, callback: v => '$' + (v / 1000).toFixed(0) + 'k' },
              border: { display: false }
            }
          }
        }
      });
    }
  };

  // Initial draw: last 6 months
  renderTrendChart(6);

  // Set up listeners for time-range togglers
  const btn6m = document.getElementById('chart-6m');
  const btn1y = document.getElementById('chart-1y');
  if (btn6m && btn1y) {
    btn6m.classList.add('active'); // Style active button
    btn6m.addEventListener('click', () => {
      btn6m.classList.add('active');
      btn1y.classList.remove('active');
      renderTrendChart(6);
    });
    btn1y.addEventListener('click', () => {
      btn1y.classList.add('active');
      btn6m.classList.remove('active');
      renderTrendChart(12);
    });
  }

  const stockCard = document.getElementById('dash-stock-units-card');
  if (stockCard) {
    stockCard.addEventListener('click', () => {
      const firstLowStockId = allLowStockItems[0]?.id || '';
      window.location.hash = '#/items' + (firstLowStockId ? '?id=' + firstLowStockId : '');
    });
  }

  // Doughnut chart
  const wc = document.getElementById('wh-chart');
  if (wc && whs.length > 0) {
    if (_dashboardCharts.wh) {
      try { _dashboardCharts.wh.destroy(); } catch(e) {}
    }
    const parent = wc.parentElement;
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'wh-chart';
    parent.replaceChild(newCanvas, wc);
    
    // Generate colors cyclically based on number of warehouses
    const palette = ['rgba(99,102,241,0.85)', 'rgba(16,185,129,0.85)', 'rgba(6,182,212,0.85)', 'rgba(245,158,11,0.85)', 'rgba(168,85,247,0.85)'];
    const bgColors = whs.map((_, i) => palette[i % palette.length]);
    
    _dashboardCharts.wh = new Chart(newCanvas, {
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
