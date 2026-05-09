/**
 * Analytics & Reporting Page — Functional filters + stable data
 */
import { getCurrentUser, getBills, getItems, getAllUsers, getWarehouses, getTaxConfig } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { formatCurrency, formatDate } from '../modules/ui.js';

// Persisted filter state (survives re-renders within session)
let an_whFilter  = '';
let an_year      = new Date().getFullYear();
let an_month     = 0; // 0 = all months

// Track chart instances so we can destroy before re-rendering
const _charts = {};

export function renderAnalytics() {
  const user = getCurrentUser();
  const isSA   = user.role === 'super_admin';
  const isAdmin = isSA || user.role === 'admin';
  const whs    = getWarehouses();

  // Build year options from actual bill data
  const allBills = getBills();
  const billYears = [...new Set(allBills.map(b => new Date(b.createdAt).getFullYear()))].sort((a,b)=>b-a);
  if (!billYears.includes(an_year)) an_year = billYears[0] || new Date().getFullYear();

  const months = ['All Months','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const taxCfg = getTaxConfig();

  renderShell('Analytics', 'Advanced reports and business insights', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">📈 Analytics & Reports</h1>
          <p class="page-subtitle">${isSA ? 'Global cross-warehouse analytics' : 'Warehouse performance analytics'}</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--bg-card);border:1px solid var(--border-default);border-radius:10px;padding:14px 18px;margin-bottom:24px">
        <span style="font-size:13px;font-weight:600;color:var(--text-secondary)">🔽 Filters:</span>

        <select class="form-control" style="width:auto;padding:7px 12px;font-size:13px" id="an-year">
          ${(billYears.length ? billYears : [new Date().getFullYear()]).map(y=>
            `<option value="${y}" ${y===an_year?'selected':''}>${y}</option>`
          ).join('')}
        </select>

        <select class="form-control" style="width:auto;padding:7px 12px;font-size:13px" id="an-month">
          ${months.map((m,i)=>`<option value="${i}" ${i===an_month?'selected':''}>${m}</option>`).join('')}
        </select>

        ${isSA ? `
        <select class="form-control" style="width:auto;padding:7px 12px;font-size:13px" id="an-wh">
          <option value="">All Warehouses</option>
          ${whs.map(w=>`<option value="${w.id}" ${w.id===an_whFilter?'selected':''}>${w.name}</option>`).join('')}
        </select>` : ''}

        <button class="btn btn-primary btn-sm" id="an-apply" style="padding:7px 16px">Apply</button>
        <button class="btn btn-ghost btn-sm" id="an-reset" style="padding:7px 12px">Reset</button>
        <span id="an-filter-label" style="font-size:12px;color:var(--text-muted);margin-left:4px"></span>
      </div>

      <!-- KPI Cards (dynamic) -->
      <div id="an-kpis" style="margin-bottom:24px"></div>

      <!-- Charts Grid -->
      <div class="dashboard-grid" style="margin-bottom:20px">
        <div class="chart-card col-8">
          <div class="chart-card-header">
            <div>
              <div class="chart-card-title">Revenue Over Time</div>
              <div class="chart-card-subtitle" id="an-chart-label">Monthly billing trend</div>
            </div>
          </div>
          <div class="chart-container" style="height:240px"><canvas id="analytics-revenue"></canvas></div>
        </div>

        <div class="chart-card col-4">
          <div class="chart-card-header">
            <div><div class="chart-card-title">Revenue by Warehouse</div></div>
          </div>
          <div class="chart-container" style="height:240px"><canvas id="analytics-wh"></canvas></div>
        </div>

        <div class="chart-card col-6">
          <div class="chart-card-header">
            <div><div class="chart-card-title">Inventory by Category</div></div>
          </div>
          <div class="chart-container" style="height:200px"><canvas id="analytics-cat"></canvas></div>
        </div>

        <div class="chart-card col-6">
          <div class="chart-card-header">
            <div><div class="chart-card-title">Team by Role</div></div>
          </div>
          <div class="chart-container" style="height:200px"><canvas id="analytics-roles"></canvas></div>
        </div>
      </div>

      <!-- Warehouse Revenue Breakdown Table -->
      ${isSA ? `
      <div class="chart-card" style="margin-bottom:20px">
        <div class="chart-card-header">
          <div><div class="chart-card-title">Warehouse Revenue Breakdown</div></div>
        </div>
        <div id="an-wh-breakdown"></div>
      </div>` : ''}

      <!-- Stock Overview Table -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-card-title">Stock Overview</div></div>
        </div>
        <div id="an-stock-table"></div>
      </div>
    </div>
  `);

  // Wire filter controls
  const applyBtn = document.getElementById('an-apply');
  const resetBtn = document.getElementById('an-reset');

  applyBtn?.addEventListener('click', applyFilters);
  resetBtn?.addEventListener('click', () => {
    an_whFilter = '';
    an_year = new Date().getFullYear();
    an_month = 0;
    const ys = document.getElementById('an-year');
    const ms = document.getElementById('an-month');
    const ws = document.getElementById('an-wh');
    if (ys) ys.value = an_year;
    if (ms) ms.value = 0;
    if (ws) ws.value = '';
    applyFilters();
  });

  // Also live-apply on any change
  ['an-year','an-month','an-wh'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFilters);
  });

  // Initial render
  applyFilters();
}

function applyFilters() {
  // Read current filter values
  const ySel = document.getElementById('an-year');
  const mSel = document.getElementById('an-month');
  const wSel = document.getElementById('an-wh');
  if (ySel) an_year    = parseInt(ySel.value);
  if (mSel) an_month   = parseInt(mSel.value);
  if (wSel) an_whFilter = wSel.value;

  // Filter bills
  const allBills = getBills();
  const items    = getItems();
  const users    = getAllUsers();
  const whs      = getWarehouses();
  const taxCfg   = getTaxConfig();
  const isSA     = getCurrentUser()?.role === 'super_admin';

  let filtered = allBills.filter(b => {
    const d = new Date(b.createdAt);
    const yearMatch  = d.getFullYear() === an_year;
    const monthMatch = an_month === 0 || (d.getMonth() + 1) === an_month;
    const whMatch    = !an_whFilter || b.warehouseId === an_whFilter;
    return yearMatch && monthMatch && whMatch;
  });

  const filtItems = an_whFilter ? items.filter(i=>i.warehouseId===an_whFilter) : items;

  // Update filter label
  const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const whName = an_whFilter ? (whs.find(w=>w.id===an_whFilter)?.name||'') : 'All Warehouses';
  const periodLabel = an_month === 0 ? `Full Year ${an_year}` : `${months[an_month]} ${an_year}`;
  const labelEl = document.getElementById('an-filter-label');
  if (labelEl) labelEl.textContent = `Showing: ${periodLabel} · ${whName} · ${filtered.length} invoices`;

  // Update chart subtitle
  const chartLabel = document.getElementById('an-chart-label');
  if (chartLabel) chartLabel.textContent = `${periodLabel} · ${whName}`;

  // Compute KPIs
  const totalRev = filtered.reduce((s,b)=>s+(b.total||0),0);
  const totalTax = filtered.reduce((s,b)=>s+(b.tax||0),0);
  const avgBill  = filtered.length ? totalRev/filtered.length : 0;
  const netRev   = totalRev - totalTax;

  updateKPIs(totalRev, totalTax, avgBill, netRev, filtered.length);
  updateCharts(filtered, filtItems, users, whs);
  if (isSA) updateWhBreakdown(filtered, whs, totalRev);
  updateStockTable(filtItems, taxCfg);
}

function updateKPIs(totalRev, totalTax, avgBill, netRev, count) {
  const el = document.getElementById('an-kpis');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-glow" style="background:#6366f1"></div>
        <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">💰</div>
        <div class="stat-card-value">${formatCurrency(totalRev)}</div>
        <div class="stat-card-label">Total Revenue</div>
        <div class="stat-card-trend trend-up">${count} invoices</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-glow" style="background:#10b981"></div>
        <div class="stat-card-icon" style="background:rgba(16,185,129,0.15)">💵</div>
        <div class="stat-card-value">${formatCurrency(netRev)}</div>
        <div class="stat-card-label">Net Revenue</div>
        <div class="stat-card-trend trend-up">After tax</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-glow" style="background:#f59e0b"></div>
        <div class="stat-card-icon" style="background:rgba(245,158,11,0.15)">🏛️</div>
        <div class="stat-card-value">${formatCurrency(totalTax)}</div>
        <div class="stat-card-label">Tax Collected</div>
        <div class="stat-card-trend">Automated</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-glow" style="background:#8b5cf6"></div>
        <div class="stat-card-icon" style="background:rgba(139,92,246,0.15)">🎯</div>
        <div class="stat-card-value">${formatCurrency(avgBill)}</div>
        <div class="stat-card-label">Avg. Invoice</div>
        <div class="stat-card-trend trend-up">${count} total</div>
      </div>
    </div>`;
}

function destroyChart(id) {
  if (_charts[id]) { try { _charts[id].destroy(); } catch(e){} delete _charts[id]; }
}

function updateCharts(bills, items, users, whs) {
  const CHART_OPTS = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color:'#94a3b8', font:{ size:11 } } },
      tooltip: { backgroundColor:'#1a1d3a', titleColor:'#f1f5f9', bodyColor:'#94a3b8', borderColor:'#2a2d4a', borderWidth:1 }
    }
  };

  // ── Revenue over time ─────────────────────────────────────────────────────
  // If a specific month is chosen, show daily breakdown; otherwise monthly
  const revCanvas = document.getElementById('analytics-revenue');
  destroyChart('analytics-revenue');
  if (revCanvas) {
    let labels, revData, taxData;
    if (an_month !== 0) {
      // Daily view for the selected month
      const daysInMonth = new Date(an_year, an_month, 0).getDate();
      labels = Array.from({length:daysInMonth},(_,i)=>String(i+1));
      revData = labels.map((_,i) => {
        const day = i+1;
        return bills.filter(b=>{
          const d=new Date(b.createdAt);
          return d.getDate()===day;
        }).reduce((s,b)=>s+(b.total||0),0);
      });
      taxData = labels.map((_,i) => {
        const day=i+1;
        return bills.filter(b=>{
          const d=new Date(b.createdAt);
          return d.getDate()===day;
        }).reduce((s,b)=>s+(b.tax||0),0);
      });
    } else {
      // Monthly view for the selected year
      const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      labels = monthNames;
      revData = monthNames.map((_,i) =>
        bills.filter(b=>new Date(b.createdAt).getMonth()===i).reduce((s,b)=>s+(b.total||0),0)
      );
      taxData = monthNames.map((_,i) =>
        bills.filter(b=>new Date(b.createdAt).getMonth()===i).reduce((s,b)=>s+(b.tax||0),0)
      );
    }

    _charts['analytics-revenue'] = new Chart(revCanvas, {
      type:'bar',
      data:{
        labels,
        datasets:[
          { label:'Revenue', data:revData, backgroundColor:'rgba(99,102,241,0.75)', borderColor:'#6366f1', borderWidth:1, borderRadius:4 },
          { label:'Tax',     data:taxData, backgroundColor:'rgba(245,158,11,0.55)', borderColor:'#f59e0b', borderWidth:1, borderRadius:4 }
        ]
      },
      options:{
        ...CHART_OPTS,
        scales:{
          x:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#64748b', maxTicksLimit:12 } },
          y:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#64748b', callback:v=>'$'+(v>=1000?(v/1000).toFixed(0)+'k':v) }, border:{display:false} }
        }
      }
    });
  }

  // ── Revenue by warehouse ─────────────────────────────────────────────────
  const whCanvas = document.getElementById('analytics-wh');
  destroyChart('analytics-wh');
  if (whCanvas && whs.length) {
    const whRevs = whs.map(w=>bills.filter(b=>b.warehouseId===w.id).reduce((s,b)=>s+(b.total||0),0));
    const hasData = whRevs.some(v=>v>0);
    _charts['analytics-wh'] = new Chart(whCanvas, {
      type:'doughnut',
      data:{
        labels: whs.map(w=>w.name),
        datasets:[{
          data: hasData ? whRevs : whs.map(()=>1),
          backgroundColor:['rgba(99,102,241,0.85)','rgba(16,185,129,0.85)','rgba(6,182,212,0.85)','rgba(245,158,11,0.85)','rgba(244,63,94,0.85)'],
          borderColor:'#0f1029', borderWidth:2
        }]
      },
      options:{
        ...CHART_OPTS, cutout:'62%',
        plugins:{
          ...CHART_OPTS.plugins,
          legend:{ position:'bottom', labels:{ color:'#94a3b8', padding:10, font:{size:11} } }
        }
      }
    });
  }

  // ── Inventory by category ────────────────────────────────────────────────
  const cats = [...new Set(items.map(i=>i.category))].filter(Boolean);
  const catCanvas = document.getElementById('analytics-cat');
  destroyChart('analytics-cat');
  if (catCanvas && cats.length) {
    _charts['analytics-cat'] = new Chart(catCanvas, {
      type:'bar',
      data:{
        labels: cats,
        datasets:[
          { label:'Stock', data:cats.map(c=>items.filter(i=>i.category===c).reduce((s,i)=>s+(i.stock||0),0)), backgroundColor:'rgba(6,182,212,0.75)', borderColor:'#06b6d4', borderWidth:1, borderRadius:4 },
          { label:'Value ($)', data:cats.map(c=>items.filter(i=>i.category===c).reduce((s,i)=>s+(i.price||0)*(i.stock||0),0)), backgroundColor:'rgba(16,185,129,0.55)', borderColor:'#10b981', borderWidth:1, borderRadius:4, yAxisID:'y2' }
        ]
      },
      options:{
        ...CHART_OPTS,
        indexAxis:'y',
        scales:{
          x:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#64748b'}, border:{display:false} },
          y:{ grid:{display:false}, ticks:{color:'#64748b'} },
          y2:{ position:'right', grid:{display:false}, ticks:{color:'#64748b', callback:v=>'$'+(v/1000).toFixed(0)+'k'}, border:{display:false} }
        }
      }
    });
  }

  // ── User roles ──────────────────────────────────────────────────────────
  const roles=['admin','manager','staff','employee'];
  const roleCounts = roles.map(r=>users.filter(u=>u.role===r).length);
  const roleCanvas = document.getElementById('analytics-roles');
  destroyChart('analytics-roles');
  if (roleCanvas) {
    _charts['analytics-roles'] = new Chart(roleCanvas, {
      type:'pie',
      data:{
        labels: roles.map(r=>r.charAt(0).toUpperCase()+r.slice(1)+` (${users.filter(u=>u.role===r).length})`),
        datasets:[{
          data: roleCounts.every(v=>v===0) ? [1,1,1,1] : roleCounts,
          backgroundColor:['rgba(6,182,212,0.85)','rgba(16,185,129,0.85)','rgba(245,158,11,0.85)','rgba(100,116,139,0.85)'],
          borderColor:'#0f1029', borderWidth:2
        }]
      },
      options:{
        ...CHART_OPTS,
        plugins:{
          ...CHART_OPTS.plugins,
          legend:{ position:'bottom', labels:{ color:'#94a3b8', padding:10, font:{size:11} } }
        }
      }
    });
  }
}

function updateWhBreakdown(bills, whs, totalRev) {
  const el = document.getElementById('an-wh-breakdown');
  if (!el) return;
  if (whs.length === 0) { el.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:20px">No warehouses</div>`; return; }
  el.innerHTML = whs.map(wh => {
    const rev = bills.filter(b=>b.warehouseId===wh.id).reduce((s,b)=>s+(b.total||0),0);
    const tax = bills.filter(b=>b.warehouseId===wh.id).reduce((s,b)=>s+(b.tax||0),0);
    const cnt = bills.filter(b=>b.warehouseId===wh.id).length;
    const pct = totalRev>0 ? Math.round(rev/totalRev*100) : 0;
    return `
      <div class="revenue-bar" style="margin-bottom:12px">
        <div class="revenue-bar-label">${wh.logo||'🏭'} ${wh.name}
          <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${cnt} invoice${cnt!==1?'s':''} · Tax: ${formatCurrency(tax)}</span>
        </div>
        <div class="revenue-bar-track"><div class="revenue-bar-fill" style="width:${pct}%"></div></div>
        <div class="revenue-bar-val">${formatCurrency(rev)} <span style="color:var(--text-muted);font-size:10px">${pct}%</span></div>
      </div>`;
  }).join('');
}

function updateStockTable(items, taxCfg) {
  const el = document.getElementById('an-stock-table');
  if (!el) return;
  if (items.length === 0) { el.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:20px">No inventory items</div>`; return; }
  const sorted = [...items].sort((a,b)=>(b.price*b.stock)-(a.price*a.stock));
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Item</th><th>Category</th><th>Price</th><th>Stock</th>
          <th>Inventory Value</th><th>Tax Rate</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${sorted.slice(0,10).map(i=>{
            const rate = i.taxCategory==='luxury' ? taxCfg.luxury : taxCfg.normal;
            const val  = (i.price||0)*(i.stock||0);
            const stockClass = (i.stock||0)<10?'badge-danger':(i.stock||0)<20?'badge-warning':'badge-success';
            return `<tr>
              <td><div class="primary-cell">${i.name}</div><div class="sub-cell">${i.sku||'—'}</div></td>
              <td><span class="badge badge-brand">${i.category}</span></td>
              <td>${formatCurrency(i.price||0)}</td>
              <td><span class="badge ${stockClass}">${i.stock||0} ${i.unit||'pcs'}</span></td>
              <td><strong>${formatCurrency(val)}</strong></td>
              <td><span class="badge ${i.taxCategory==='luxury'?'badge-purple':'badge-info'}">${rate}%</span></td>
              <td><span class="badge ${(i.stock||0)<20?'badge-danger':'badge-success'}">${(i.stock||0)<20?'Low':'OK'}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}
