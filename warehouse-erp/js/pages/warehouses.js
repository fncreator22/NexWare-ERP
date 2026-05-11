/**
 * Warehouses Page — CRUD for warehouse management (Super Admin only)
 */
import { getCurrentUser, getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, getAllUsers, getBills, getPlanWarehouseLimit, getSubscription, addNotification, getItems, getTaxConfig } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, confirm, createModal, formatDate, formatCurrency, filterData } from '../modules/ui.js';
import { navigate } from '../modules/router.js';

let wh_currentView = 'grid';
let wh_searchQuery = '';

export function renderWarehouses() {
  const user = getCurrentUser();
  if (!user || user.role !== 'super_admin') { navigate('/dashboard'); return; }

  refreshShell();
}

function refreshShell() {
  const user = getCurrentUser();
  const whs = getWarehouses();
  const allUsers = getAllUsers();
  const sub = getSubscription();
  const limit = getPlanWarehouseLimit();
  const atLimit = limit > 0 && whs.length >= limit;
  const planLabel = sub.plan === 'starter' ? 'Starter (1 warehouse)' : 'Enterprise (Unlimited)';

  renderShell('Warehouses', 'Manage all your warehouse locations', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">🏭 Warehouse Management</h1>
          <p class="page-subtitle">Centralized control for all warehouse locations · <span style="color:var(--text-brand);font-weight:600">${planLabel}</span></p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" id="view-toggle">⊞ Grid</button>
          <button class="btn btn-primary" id="create-wh-btn" ${atLimit ? 'disabled title="Warehouse limit reached for your plan"' : ''}>
            + New Warehouse ${atLimit ? '🔒' : ''}
          </button>
        </div>
      </div>

      ${atLimit ? `
      <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px">
        <span style="font-size:20px">⚠️</span>
        <div>
          <div style="font-weight:700;font-size:13px;color:var(--text-primary)">Warehouse Limit Reached</div>
          <div style="font-size:12px;color:var(--text-muted)">Your <strong>Starter plan</strong> allows only 1 warehouse. <a href="#/subscription" style="color:var(--text-brand)">Upgrade to Enterprise</a> for unlimited warehouses.</div>
        </div>
      </div>` : ''}

      <!-- Summary Stat Cards -->
      <div class="stat-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));margin-bottom:28px">
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">🏭</div>
          <div class="stat-card-value" id="wh-count">${whs.length}</div>
          <div class="stat-card-label">Total Warehouses</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(16,185,129,0.15)">✅</div>
          <div class="stat-card-value">${whs.filter(w=>w.status==='active').length}</div>
          <div class="stat-card-label">Active</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(6,182,212,0.15)">👥</div>
          <div class="stat-card-value">${allUsers.length}</div>
          <div class="stat-card-label">Total Staff</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(245,158,11,0.15)">💰</div>
          <div class="stat-card-value">${formatCurrency(whs.reduce((s,w)=>s+(w.revenue||0),0))}</div>
          <div class="stat-card-label">Combined Revenue</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(168,85,247,0.15)">📊</div>
          <div class="stat-card-value">${limit < 0 ? '∞' : limit}</div>
          <div class="stat-card-label">Plan Limit</div>
        </div>
      </div>

      <!-- Search + Filter -->
      <div class="table-toolbar" style="margin-bottom:20px">
        <div class="table-search" style="max-width:400px;flex:none">
          <span>🔍</span>
          <input type="text" id="wh-search" placeholder="Search warehouses..." />
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="wh-status-filter">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div id="wh-container">${renderWarehouseGrid(whs, allUsers)}</div>
    </div>
  `);

  // Bind events
  document.getElementById('create-wh-btn')?.addEventListener('click', () => {
    const currentWhs = getWarehouses();
    const lim = getPlanWarehouseLimit();
    if (lim > 0 && currentWhs.length >= lim) {
      showToast('Plan limit reached', `Your Starter plan allows only ${lim} warehouse. Upgrade to Enterprise for unlimited.`, 'warning');
      return;
    }
    showWarehouseModal(null);
  });

  document.getElementById('wh-search')?.addEventListener('input', e => { wh_searchQuery = e.target.value; refreshList(); });
  document.getElementById('wh-status-filter')?.addEventListener('change', refreshList);
  document.getElementById('view-toggle')?.addEventListener('click', (e) => {
    wh_currentView = wh_currentView === 'grid' ? 'table' : 'grid';
    e.target.textContent = wh_currentView === 'grid' ? '⊞ Grid' : '☰ Table';
    refreshList();
  });

  attachWarehouseEvents();
}

function refreshList() {
  let whs = getWarehouses();
  const q = wh_searchQuery;
  const statusFilter = document.getElementById('wh-status-filter')?.value;
  if (q) whs = filterData(whs, q, ['name', 'businessName', 'address', 'email']);
  if (statusFilter) whs = whs.filter(w => w.status === statusFilter);
  const allUsers = getAllUsers();
  const container = document.getElementById('wh-container');
  if (container) container.innerHTML = renderWarehouseGrid(whs, allUsers);
  // Update count
  const countEl = document.getElementById('wh-count');
  if (countEl) countEl.textContent = getWarehouses().length;
  attachWarehouseEvents();
}

function renderWarehouseGrid(whs, allUsers) {
  if (whs.length === 0) return `
    <div class="card" style="text-align:center;padding:64px">
      <div style="font-size:48px;margin-bottom:16px;opacity:0.4">🏭</div>
      <h3 style="color:var(--text-secondary);margin-bottom:8px">No warehouses found</h3>
      <p style="color:var(--text-muted);font-size:14px;margin-bottom:24px">Create your first warehouse to get started</p>
      <button class="btn btn-primary" onclick="document.getElementById('create-wh-btn').click()">+ Create Warehouse</button>
    </div>
  `;

  return `<div class="warehouse-grid">
    ${whs.map(wh => {
      const staff = allUsers.filter(u => u.warehouseId === wh.id).length;
      return `
      <div class="warehouse-card animate-slideUp" data-wh-id="${wh.id}" style="cursor:pointer" title="Click to view warehouse dashboard">
        <div class="warehouse-card-top">
          <div class="warehouse-avatar">${wh.logo || '🏭'}</div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <span class="badge ${wh.status === 'active' ? 'badge-success' : 'badge-danger'} badge-dot"> ${wh.status}</span>
            <div style="display:flex;gap:4px">
              <button class="action-btn edit" data-id="${wh.id}" title="Edit" onclick="event.stopPropagation()">✏️</button>
              <button class="action-btn delete" data-id="${wh.id}" title="Delete" onclick="event.stopPropagation()">🗑️</button>
            </div>
          </div>
        </div>
        <div class="warehouse-name">${wh.name}</div>
        <div class="warehouse-biz">${wh.businessName}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px">📍 ${wh.address}</div>
        <div style="font-size:12px;color:var(--text-muted)">📧 ${wh.email} · 📞 ${wh.contact}</div>
        <div class="warehouse-stats">
          <div><div class="warehouse-stat-val">${staff}</div><div class="warehouse-stat-lbl">Staff</div></div>
          <div><div class="warehouse-stat-val">${wh.items || 0}</div><div class="warehouse-stat-lbl">Items</div></div>
          <div><div class="warehouse-stat-val">${formatCurrency(wh.revenue||0).split('.')[0]}</div><div class="warehouse-stat-lbl">Revenue</div></div>
        </div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:var(--text-muted)">Tax: ${wh.taxPreference || 'standard'} · ${formatDate(wh.createdAt)}</span>
          <span style="font-size:11px;color:var(--text-brand);font-weight:600">View →</span>
        </div>
      </div>
    `}).join('')}
  </div>`;
}

function attachWarehouseEvents() {
  // Edit buttons
  document.querySelectorAll('.action-btn.edit[data-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wh = getWarehouses().find(w => w.id === btn.dataset.id);
      if (wh) showWarehouseModal(wh);
    });
  });

  // Delete buttons
  document.querySelectorAll('.action-btn.delete[data-id]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const wh = getWarehouses().find(w => w.id === btn.dataset.id);
      const ok = await confirm(`Delete "${wh?.name || 'this warehouse'}"? All associated data will be removed.`, 'Delete Warehouse');
      if (ok) {
        deleteWarehouse(btn.dataset.id);
        showToast('Warehouse deleted', `${wh?.name} has been removed`, 'success');
        refreshList();
      }
    });
  });

  // Warehouse card click → warehouse detail dashboard
  document.querySelectorAll('.warehouse-card[data-wh-id]').forEach(card => {
    card.addEventListener('click', () => {
      const whId = card.dataset.whId;
      navigate('/warehouses/' + whId);
    });
  });
}

function showWarehouseModal(wh) {
  const isEdit = !!wh;

  // Check plan limit before opening create modal
  if (!isEdit) {
    const lim = getPlanWarehouseLimit();
    const current = getWarehouses();
    if (lim > 0 && current.length >= lim) {
      showToast('Plan limit reached', `Starter plan allows only ${lim} warehouse. Upgrade to Enterprise.`, 'warning');
      return;
    }
  }

  const body = `
    <form id="wh-modal-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Warehouse Name <span class="req">*</span></label>
          <input type="text" id="m-wh-name" class="form-control" value="${wh?.name||''}" required placeholder="e.g. North Hub" />
        </div>
        <div class="form-group">
          <label class="form-label">Business Name <span class="req">*</span></label>
          <input type="text" id="m-wh-biz" class="form-control" value="${wh?.businessName||''}" required placeholder="Legal business name" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Address <span class="req">*</span></label>
        <input type="text" id="m-wh-address" class="form-control" value="${wh?.address||''}" required placeholder="Full address" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Contact <span class="req">*</span></label>
          <input type="tel" id="m-wh-contact" class="form-control" value="${wh?.contact||''}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Email <span class="req">*</span></label>
          <input type="email" id="m-wh-email" class="form-control" value="${wh?.email||''}" required />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tax Preference</label>
          <select id="m-wh-tax" class="form-control">
            <option value="standard" ${wh?.taxPreference==='standard'||!wh?'selected':''}>Standard</option>
            <option value="luxury" ${wh?.taxPreference==='luxury'?'selected':''}>Luxury</option>
            <option value="none" ${wh?.taxPreference==='none'?'selected':''}>No Tax</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Logo</label>
          <select id="m-wh-logo" class="form-control">
            ${['🏭','🏗️','🚛','📦','🏢','⚙️','🌐','🏬'].map(l=>`<option value="${l}" ${wh?.logo===l?'selected':''}>${l} ${l}</option>`).join('')}
          </select>
        </div>
      </div>
      ${isEdit ? `
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="m-wh-status" class="form-control">
          <option value="active" ${wh?.status==='active'?'selected':''}>Active</option>
          <option value="inactive" ${wh?.status==='inactive'?'selected':''}>Inactive</option>
        </select>
      </div>` : ''}
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="m-cancel">Cancel</button>
    <button class="btn btn-primary" id="m-save">${isEdit ? '✓ Update' : '+ Create'} Warehouse</button>
  `;

  const modal = createModal({ title: isEdit ? '✏️ Edit Warehouse' : '🏭 New Warehouse', body, footer });

  modal.el.querySelector('#m-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#m-save')?.addEventListener('click', () => {
    const name         = document.getElementById('m-wh-name')?.value.trim();
    const businessName = document.getElementById('m-wh-biz')?.value.trim();
    const address      = document.getElementById('m-wh-address')?.value.trim();
    const contact      = document.getElementById('m-wh-contact')?.value.trim();
    const email        = document.getElementById('m-wh-email')?.value.trim();

    if (!name || !businessName || !address || !contact || !email) {
      showToast('Validation', 'Please fill all required fields', 'warning');
      return;
    }

    if (!isEdit) {
      const lim = getPlanWarehouseLimit();
      const curr = getWarehouses();
      if (lim > 0 && curr.length >= lim) {
        showToast('Plan limit reached', 'Upgrade to Enterprise for unlimited warehouses.', 'warning');
        modal.close(); return;
      }
    }

    const data = {
      name, businessName, address, contact, email,
      taxPreference: document.getElementById('m-wh-tax')?.value || 'standard',
      logo: document.getElementById('m-wh-logo')?.value || '🏭',
      ...(isEdit ? { status: document.getElementById('m-wh-status')?.value } : {})
    };

    if (isEdit) {
      updateWarehouse(wh.id, data);
      showToast('Warehouse updated', `${name} has been updated`, 'success');
    } else {
      createWarehouse(data);
      addNotification('warehouse_create', 'Warehouse Created', `${name} is now active and ready`, '/warehouses');
      showToast('Warehouse created', `${name} is ready`, 'success');
    }

    modal.close();
    refreshList();
  });
}

// ---- WAREHOUSE DETAIL DASHBOARD ----
export function renderWarehouseDetail(whId) {
  const user    = getCurrentUser();
  const isSA    = user.role === 'super_admin';
  const isAdmin = isSA || user.role === 'admin';

  const whs = getWarehouses();
  const wh  = whs.find(w => w.id === whId);
  if (!wh) { navigate('/warehouses'); return; }
  if (!isSA && user.warehouseId !== whId) { navigate('/dashboard'); return; }

  const allUsers   = getAllUsers();
  const staff      = allUsers.filter(u => u.warehouseId === whId);
  const bills      = getBills(whId);
  const items      = getItems(whId);
  const taxCfg     = getTaxConfig(whId);

  const revenue    = bills.reduce((s,b)=>s+(b.total||0),0);
  const tax        = bills.reduce((s,b)=>s+(b.tax||0),0);
  const netRev     = revenue - tax;
  const avgBill    = bills.length ? revenue/bills.length : 0;
  const totalStock = items.reduce((s,i)=>s+(i.stock||0),0);
  const lowStock   = items.filter(i=>(i.stock||0)<20);
  const invValue   = items.reduce((s,i)=>s+(i.price||0)*(i.stock||0),0);

  const roleColors = { admin:'var(--accent-violet)',manager:'var(--accent-cyan)',staff:'var(--accent-amber)',employee:'var(--accent-emerald)' };

  const now = new Date();
  const monthLabels = [], monthRevs = [];
  for (let i=5;i>=0;i--) {
    const d = new Date(now.getFullYear(),now.getMonth()-i,1);
    monthLabels.push(d.toLocaleString('default',{month:'short'}));
    monthRevs.push(bills.filter(b=>{
      const bd=new Date(b.createdAt);
      return bd.getMonth()===d.getMonth()&&bd.getFullYear()===d.getFullYear();
    }).reduce((s,b)=>s+(b.total||0),0));
  }
  const maxRev = Math.max(...monthRevs,1);
  const cats = [...new Set(items.map(i=>i.category))].filter(Boolean);

  renderShell(wh.name, `${wh.businessName} · Warehouse Dashboard`, `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="font-size:44px;line-height:1">${wh.logo||'🏭'}</div>
            <div>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                <h1 class="page-title" style="margin:0">${wh.name}</h1>
                <span class="badge ${wh.status==='active'?'badge-success':'badge-danger'} badge-dot"> ${wh.status}</span>
              </div>
              <p class="page-subtitle">${wh.businessName} · ${wh.address}</p>
            </div>
          </div>
        </div>
        <div class="page-header-actions">
          ${isSA?`<button class="btn btn-secondary btn-sm" onclick="location.hash='#/warehouses'">← Warehouses</button>`:''}
          ${isSA?`<button class="btn btn-secondary btn-sm" id="wd-edit-btn">✏️ Edit</button>`:''}
          <button class="btn btn-primary btn-sm" onclick="location.hash='#/billing'">🧾 New Invoice</button>
        </div>
      </div>

      <div class="stat-grid" style="margin-bottom:20px">
        ${[
          {icon:'💰',val:formatCurrency(revenue), label:'Revenue',       color:'var(--accent-emerald)',glow:'#10b981'},
          {icon:'💵',val:formatCurrency(netRev),  label:'Net Revenue',   color:'var(--accent-cyan)',   glow:'#06b6d4'},
          {icon:'🏛️',val:formatCurrency(tax),     label:'Tax Collected', color:'var(--accent-amber)',  glow:'#f59e0b'},
          {icon:'🧾',val:bills.length,            label:'Invoices',      color:'var(--text-brand)',    glow:'#6366f1'},
          {icon:'👥',val:staff.length,            label:'Team Members',  color:'var(--accent-violet)', glow:'#8b5cf6'},
          {icon:'📦',val:totalStock.toLocaleString(),label:'Stock Units',color:'var(--text-primary)',  glow:'#64748b'},
          {icon:'💎',val:formatCurrency(invValue),label:'Inv. Value',    color:'var(--accent-rose)',   glow:'#f43f5e'},
          {icon:'⚠️',val:lowStock.length,         label:'Low Stock',     color:lowStock.length>0?'var(--accent-rose)':'var(--accent-emerald)',glow:'#f59e0b'},
        ].map(s=>`
          <div class="stat-card">
            <div class="stat-card-glow" style="background:${s.glow}"></div>
            <div class="stat-card-icon">${s.icon}</div>
            <div class="stat-card-value" style="color:${s.color};font-size:18px">${s.val}</div>
            <div class="stat-card-label">${s.label}</div>
          </div>
        `).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="card" style="grid-column:1/3">
          <div class="card-header">
            <div class="card-title">📈 Revenue Trend (Last 6 Months)</div>
            <div style="font-size:12px;color:var(--text-muted)">Total: ${formatCurrency(revenue)}</div>
          </div>
          <div style="display:flex;align-items:flex-end;gap:6px;height:100px;padding:0 4px">
            ${monthRevs.map((v,i)=>{
              const h=maxRev>0?Math.max(Math.round(v/maxRev*100),2):2;
              const isLast=i===monthRevs.length-1;
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <div style="font-size:10px;color:var(--text-muted)">${v>0?'$'+(v/1000).toFixed(1)+'k':''}</div>
                <div style="width:100%;height:${h}%;background:${isLast?'var(--brand-500)':'rgba(99,102,241,0.4)'};border-radius:4px 4px 0 0;transition:height 0.3s;min-height:4px"></div>
                <div style="font-size:10px;color:var(--text-muted)">${monthLabels[i]}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">💰 Billing Summary</div></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[
              {label:'Total Revenue',val:formatCurrency(revenue),color:'var(--accent-emerald)'},
              {label:'Tax Collected',val:formatCurrency(tax),    color:'var(--accent-amber)'},
              {label:'Net Revenue',  val:formatCurrency(netRev), color:'var(--text-brand)'},
              {label:'Avg Invoice',  val:formatCurrency(avgBill),color:'var(--accent-cyan)'},
              {label:'Invoice Count',val:bills.length,           color:'var(--text-primary)'},
            ].map(r=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border-subtle)">
                <span style="font-size:12px;color:var(--text-muted)">${r.label}</span>
                <span style="font-size:13px;font-weight:700;color:${r.color}">${r.val}</span>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:10px">
            <button class="btn btn-secondary btn-sm" style="width:100%" onclick="location.hash='#/billing'">View All Invoices →</button>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="card">
          <div class="card-header">
            <div class="card-title">👥 Team (${staff.length})</div>
            ${isAdmin?`<button class="btn btn-secondary btn-sm" onclick="location.hash='#/workforce'" style="font-size:11px">Manage →</button>`:''}
          </div>
          ${staff.length===0
            ?`<div style="text-align:center;padding:24px;color:var(--text-muted)">No staff assigned</div>`
            :`<div class="table-wrap"><table>
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Since</th></tr></thead>
              <tbody>${staff.map(u=>`
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="width:28px;height:28px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:white;flex-shrink:0">${u.avatar}</div>
                      <div>
                        <div style="font-size:13px;font-weight:600">${u.name}</div>
                        <div style="font-size:11px;color:var(--text-muted)">${u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;background:rgba(99,102,241,0.1);color:${roleColors[u.role]||'var(--text-secondary)'}">${u.role}</span></td>
                  <td><span class="badge ${u.status==='active'?'badge-success':'badge-danger'}" style="font-size:10px">${u.status}</span></td>
                  <td style="font-size:11px;color:var(--text-muted)">${formatDate(u.assignedAt||u.createdAt)}</td>
                </tr>`).join('')}
              </tbody>
            </table></div>`}
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">🧾 Recent Invoices</div>
            <button class="btn btn-primary btn-sm" onclick="location.hash='#/billing'" style="font-size:11px">+ New</button>
          </div>
          ${bills.length===0
            ?`<div style="text-align:center;padding:24px;color:var(--text-muted)">No invoices yet</div>`
            :`<div class="table-wrap"><table>
              <thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Date</th></tr></thead>
              <tbody>${bills.slice(0,8).map(b=>`
                <tr>
                  <td><span style="font-family:var(--font-mono);font-size:12px;color:var(--text-brand)">${b.billNo}</span></td>
                  <td><div class="primary-cell">${b.customer}</div></td>
                  <td><strong style="color:var(--accent-emerald)">${formatCurrency(b.total)}</strong></td>
                  <td style="font-size:12px;color:var(--text-muted)">${formatDate(b.createdAt)}</td>
                </tr>`).join('')}
              </tbody>
            </table></div>`}
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div>
            <div class="card-title">📦 Inventory (${items.length} items · ${totalStock.toLocaleString()} units)</div>
            <div class="card-subtitle">Inventory value: ${formatCurrency(invValue)}</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/items'" style="font-size:11px">Manage →</button>
        </div>
        ${cats.length>0?`
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">By Category</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${cats.map((cat,ci)=>{
              const catItems=items.filter(i=>i.category===cat);
              const catStock=catItems.reduce((s,i)=>s+(i.stock||0),0);
              const catVal=catItems.reduce((s,i)=>s+(i.price||0)*(i.stock||0),0);
              const pct=totalStock>0?Math.round(catStock/totalStock*100):0;
              const colors=['#6366f1','#10b981','#06b6d4','#f59e0b','#f43f5e','#8b5cf6'];
              return `<div style="display:flex;align-items:center;gap:10px">
                <div style="width:80px;font-size:12px;color:var(--text-muted);flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cat}</div>
                <div style="flex:1;height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${colors[ci%colors.length]};border-radius:4px"></div>
                </div>
                <div style="font-size:11px;color:var(--text-muted);width:28px;text-align:right">${pct}%</div>
                <div style="font-size:11px;font-weight:600;width:70px;text-align:right;color:var(--text-primary)">${formatCurrency(catVal)}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`:''}
        <div class="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th>Tax</th><th>Value</th></tr></thead>
            <tbody>
              ${items.slice(0,10).map(i=>{
                const rate=i.taxCategory==='luxury'?taxCfg.luxury:taxCfg.normal;
                const sc=(i.stock||0)<10?'badge-danger':(i.stock||0)<20?'badge-warning':'badge-success';
                return `<tr>
                  <td><div class="primary-cell">${i.name}</div></td>
                  <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${i.sku||'—'}</span></td>
                  <td><span class="badge badge-brand">${i.category}</span></td>
                  <td>${formatCurrency(i.price||0)}</td>
                  <td><span class="badge ${sc}">${i.stock||0} ${i.unit||'pcs'}</span></td>
                  <td><span class="badge ${i.taxCategory==='luxury'?'badge-purple':'badge-info'}">${rate}%</span></td>
                  <td><strong>${formatCurrency((i.price||0)*(i.stock||0))}</strong></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          ${items.length>10?`<div style="padding:10px;text-align:center;font-size:12px;color:var(--text-muted)">Showing 10 of ${items.length} · <a href="#/items" style="color:var(--text-brand)">View all →</a></div>`:''}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">🏢 Warehouse Information</div></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;font-size:13px">
          ${[
            {label:'Business Name',  val:wh.businessName},
            {label:'Address',        val:wh.address},
            {label:'Contact',        val:wh.contact},
            {label:'Email',          val:wh.email},
            {label:'Tax Preference', val:wh.taxPreference},
            {label:'Status',         val:wh.status},
            {label:'Created',        val:formatDate(wh.createdAt)},
            {label:'Last Updated',   val:wh.updatedAt?formatDate(wh.updatedAt):'—'},
          ].map(f=>`
            <div>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:4px">${f.label}</div>
              <div style="font-weight:600;color:var(--text-primary)">${f.val||'—'}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `);

  document.getElementById('wd-edit-btn')?.addEventListener('click', () => showWarehouseModal(wh));
}