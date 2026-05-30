/**
 * Enterprise Tracking Registry Page — Multi-tenant Unified Tracking Ledger
 */
import { getCurrentUser, apiFetch, getWarehouses } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, createModal, formatDate, formatDateTime, getSvgIcon, roleBadge } from '../modules/ui.js';
import { navigate } from '../modules/router.js';

let regSearchQ = '';
let regTypeFilter = '';
let regWhFilter = '';
let regPage = 1;
const regLimit = 15;

export function renderRegistry() {
  const user = getCurrentUser();
  if (!user) { navigate('/login'); return; }

  const whs = getWarehouses();

  renderShell('Registry Ledger', 'Centralized enterprise unique ID and barcode logs ledger', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Enterprise Tracking Registry</h1>
          <p class="page-subtitle">Multi-tenant unified identity ledger with scan-ready barcodes</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          <button class="btn btn-primary" id="btn-print-barcodes" style="display:inline-flex;align-items:center;gap:6px">${getSvgIcon('export', 14)} Print Barcodes</button>
        </div>
      </div>

      <!-- Stats Summary Row -->
      <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(99, 102, 241, 0.15)">${getSvgIcon('palette', 20)}</div>
          <div class="stat-card-value" id="stat-total-entries">—</div>
          <div class="stat-card-label">Total ID Registries</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(16, 185, 129, 0.15)">${getSvgIcon('billing', 20)}</div>
          <div class="stat-card-value" id="stat-invoice-entries">—</div>
          <div class="stat-card-label">Invoices Tracker</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(245, 158, 11, 0.15)">${getSvgIcon('items', 20)}</div>
          <div class="stat-card-value" id="stat-item-entries">—</div>
          <div class="stat-card-label">Inventory Barcodes</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(6, 182, 212, 0.15)">${getSvgIcon('user', 20)}</div>
          <div class="stat-card-value" id="stat-crm-entries">—</div>
          <div class="stat-card-label">CRM Customers</div>
        </div>
      </div>

      <!-- Toolbar Search & Filter -->
      <div class="table-toolbar">
        <div class="table-search">
          <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span>
          <input type="text" id="reg-search" placeholder="Search unique ID, barcode, creator..." value="${regSearchQ}" />
        </div>
        <div class="table-filter">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="reg-type-filter">
            <option value="">All Entity Types</option>
            <option value="invoice" ${regTypeFilter === 'invoice' ? 'selected' : ''}>Invoices (INV)</option>
            <option value="warehouse" ${regTypeFilter === 'warehouse' ? 'selected' : ''}>Warehouses (WH)</option>
            <option value="employee" ${regTypeFilter === 'employee' ? 'selected' : ''}>Workforce (EMP)</option>
            <option value="inventory" ${regTypeFilter === 'inventory' ? 'selected' : ''}>Inventory (ITEM)</option>
            <option value="table_registry" ${regTypeFilter === 'table_registry' ? 'selected' : ''}>Operational Tables (TBL)</option>
            <option value="customer" ${regTypeFilter === 'customer' ? 'selected' : ''}>CRM Customers (CUST)</option>
          </select>
          ${user.role === 'super_admin' ? `
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="reg-wh-filter">
            <option value="">All Warehouses</option>
            <option value="Global" ${regWhFilter === 'Global' ? 'selected' : ''}>Global Scoped</option>
            ${whs.map(w => `<option value="${w.id}" ${regWhFilter === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
          </select>
          ` : ''}
        </div>
      </div>

      <!-- Main Ledger Ledger Table -->
      <div id="registry-table-container">
        <div class="card" style="text-align:center;padding:48px">
          <div class="spinner" style="margin: 0 auto 16px"></div>
          <h3 style="color:var(--text-secondary)">Loading Tracking Ledger...</h3>
        </div>
      </div>
      <div id="registry-pagination"></div>
    </div>
  `);

  fetchAndRenderRegistry();

  // Search & Filter Events
  const searchInput = document.getElementById('reg-search');
  searchInput?.addEventListener('input', debounce((e) => {
    regSearchQ = e.target.value;
    regPage = 1;
    fetchAndRenderRegistry();
  }, 300));

  document.getElementById('reg-type-filter')?.addEventListener('change', (e) => {
    regTypeFilter = e.target.value;
    regPage = 1;
    fetchAndRenderRegistry();
  });

  document.getElementById('reg-wh-filter')?.addEventListener('change', (e) => {
    regWhFilter = e.target.value;
    regPage = 1;
    fetchAndRenderRegistry();
  });

  document.getElementById('btn-print-barcodes')?.addEventListener('click', showBarcodePrintSheet);

  // Sync listener setup
  window.removeEventListener('wareops_storage_sync', fetchAndRenderRegistry);
  window.addEventListener('wareops_storage_sync', fetchAndRenderRegistry);
}

// Simple debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function fetchAndRenderRegistry() {
  const user = getCurrentUser();
  if (!user) return;

  const whs = getWarehouses();
  const whMap = whs.reduce((acc, curr) => { acc[curr.id] = curr.name; return acc; }, {});

  // Build query string
  let query = `/registry/?page=${regPage}&limit=${regLimit}`;
  if (regSearchQ) query += `&search=${encodeURIComponent(regSearchQ)}`;
  if (regTypeFilter) query += `&entityType=${regTypeFilter}`;
  if (regWhFilter) query += `&warehouseId=${regWhFilter}`;

  const res = await apiFetch(query);
  if (res.error) {
    const container = document.getElementById('registry-table-container');
    if (container) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:48px;border-color:rgba(239,68,68,0.2)">
          <div style="font-size:40px;margin-bottom:16px;color:rgba(239,68,68,0.7)">⚠️</div>
          <h3 style="color:var(--text-secondary)">Sync Failed</h3>
          <p style="color:var(--text-muted);margin-top:8px">${res.error}</p>
        </div>
      `;
    }
    return;
  }

  const { entries, total } = res.data;
  const pages = Math.ceil(total / regLimit);
  const start = (regPage - 1) * regLimit;

  // Render Stats Numbers
  updateStatsNumbers(entries, total);

  const container = document.getElementById('registry-table-container');
  if (!container) return;

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <div style="font-size:40px;margin-bottom:16px;opacity:0.4">🏷️</div>
        <h3 style="color:var(--text-secondary)">No unique ID registries found</h3>
        <p style="color:var(--text-muted);margin-top:8px">No generated tracking entries match the filter parameters.</p>
      </div>
    `;
    document.getElementById('registry-pagination').innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Unique ID</th>
            <th>Entity Type</th>
            <th>Offline Barcode</th>
            <th>Warehouse Scope</th>
            <th>Creator Log</th>
            <th>Registered At</th>
            <th style="text-align:center">Data</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(e => {
            const whName = e.warehouse_id === 'Global' ? 'Global' : (whMap[e.warehouse_id] || `Warehouse (${e.warehouse_id})`);
            const badgeClass = getEntityBadgeClass(e.entity_type);
            const encodedBarcodeUrl = `http://localhost:8000/api/v1/registry/barcode?code=${e.entity_id}`;

            return `
              <tr>
                <td data-label="Unique ID">
                  <span style="font-family:var(--font-mono);font-weight:700;color:var(--text-primary);letter-spacing:0.5px">${e.entity_id}</span>
                </td>
                <td data-label="Entity Type">
                  <span class="badge ${badgeClass}">${capitalizeFirst(e.entity_type)}</span>
                </td>
                <td data-label="Offline Barcode" style="padding-top: 4px; padding-bottom: 4px;">
                  <div style="display:flex;flex-direction:column;gap:2px;max-width:180px">
                    <img src="${encodedBarcodeUrl}" alt="${e.entity_id} Barcode" style="height:36px;object-fit:contain;border:1px solid #f3f4f6;border-radius:4px;background:#ffffff;padding:2px" />
                  </div>
                </td>
                <td data-label="Warehouse Scope">
                  <span class="badge badge-secondary">${whName}</span>
                </td>
                <td data-label="Creator Log">
                  <div class="primary-cell">${e.creator_name}</div>
                  <div class="sub-cell">ID: ${e.created_by.slice(0, 8)}</div>
                </td>
                <td data-label="Registered At">
                  <div class="primary-cell">${formatDateTime(e.created_at)}</div>
                </td>
                <td data-label="Data" style="text-align:center">
                  <button class="action-btn edit view-snapshot-btn" data-id="${e.entity_id}" title="View Metadata Snapshot" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px">${getSvgIcon('view', 12)} Details</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      
      <!-- Pagination controls -->
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start + 1}–${Math.min(start + regLimit, total)} of ${total} entries</div>
        <div class="pagination-controls">
          <button class="wf_page-btn" id="reg-prev" ${regPage <= 1 ? 'disabled' : ''}>‹</button>
          ${Array.from({ length: Math.min(5, pages) }, (_, i) => {
            const pageNum = i + 1;
            return `<button class="wf_page-btn ${regPage === pageNum ? 'active' : ''}" data-pg="${pageNum}">${pageNum}</button>`;
          }).join('')}
          <button class="wf_page-btn" id="reg-next" ${regPage >= pages ? 'disabled' : ''}>›</button>
        </div>
      </div>
    </div>
  `;

  // Attach button triggers
  container.querySelectorAll('.view-snapshot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = entries.find(x => x.entity_id === btn.dataset.id);
      if (entry) showSnapshotModal(entry);
    });
  });

  container.querySelectorAll('.wf_page-btn[data-pg]').forEach(btn => {
    btn.addEventListener('click', () => {
      regPage = parseInt(btn.dataset.pg);
      fetchAndRenderRegistry();
    });
  });

  document.getElementById('reg-prev')?.addEventListener('click', () => {
    if (regPage > 1) {
      regPage--;
      fetchAndRenderRegistry();
    }
  });

  document.getElementById('reg-next')?.addEventListener('click', () => {
    if (regPage < pages) {
      regPage++;
      fetchAndRenderRegistry();
    }
  });
}

function updateStatsNumbers(entries, total) {
  document.getElementById('stat-total-entries').textContent = total;
  
  // Quick count filters
  const invCount = entries.filter(e => e.entity_type === 'invoice').length;
  const itemCount = entries.filter(e => e.entity_type === 'inventory').length;
  const crmCount = entries.filter(e => e.entity_type === 'customer').length;
  
  // Set counts dynamically
  const invEl = document.getElementById('stat-invoice-entries');
  const itemEl = document.getElementById('stat-item-entries');
  const crmEl = document.getElementById('stat-crm-entries');

  if (invEl) invEl.textContent = entries.filter(e => e.entity_type === 'invoice').length > 0 ? entries.filter(e => e.entity_type === 'invoice').length : 'Active';
  if (itemEl) itemEl.textContent = entries.filter(e => e.entity_type === 'inventory').length > 0 ? entries.filter(e => e.entity_type === 'inventory').length : 'Active';
  if (crmEl) crmEl.textContent = entries.filter(e => e.entity_type === 'customer').length > 0 ? entries.filter(e => e.entity_type === 'customer').length : 'Active';
}

function getEntityBadgeClass(type) {
  switch (type) {
    case 'invoice': return 'badge-info';
    case 'warehouse': return 'badge-secondary';
    case 'employee': return 'badge-warning';
    case 'inventory': return 'badge-success';
    case 'table_registry': return 'badge-primary';
    case 'customer': return 'badge-info';
    default: return 'badge-secondary';
  }
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).replace('_', ' ');
}

function showSnapshotModal(entry) {
  const jsonString = JSON.stringify(entry.metadata_snapshot, null, 2);
  
  const body = `
    <div style="font-family:var(--font-mono);font-size:12px;background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;max-height:400px;overflow-y:auto;white-space:pre-wrap;box-shadow:inset 0 2px 4px rgba(0,0,0,0.6)">${jsonString}</div>
    <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:12px;font-size:12px;color:var(--text-muted)">
      <span>Entity: <strong>${entry.entity_id}</strong> (${capitalizeFirst(entry.entity_type)})</span>
      <span>Creator: <strong>${entry.creator_name}</strong></span>
    </div>
  `;

  const footer = `
    <button class="btn btn-primary" id="m-snap-close">Close</button>
  `;

  const modal = createModal({ title: `Registry Metadata Snapshot`, body, footer });
  modal.el.querySelector('#m-snap-close')?.addEventListener('click', modal.close);
}

async function showBarcodePrintSheet() {
  let query = `/registry/?page=1&limit=60`;
  if (regTypeFilter) query += `&entityType=${regTypeFilter}`;
  if (regWhFilter) query += `&warehouseId=${regWhFilter}`;

  const res = await apiFetch(query);
  if (res.error) {
    showToast('Failed to load barcodes', res.error, 'error');
    return;
  }

  const { entries } = res.data;
  if (!entries || entries.length === 0) {
    showToast('No Barcodes', 'No matching items found to print barcodes.', 'warning');
    return;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('Blocker active', 'Please allow popups to render the barcode print sheet.', 'warning');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>NexWare ERP — Printable Barcode Sheet</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            color: #111827;
            background: #ffffff;
            margin: 0;
            padding: 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
          }
          .card {
            border: 1px dashed #9ca3af;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            page-break-inside: avoid;
          }
          .title {
            font-size: 13px;
            font-weight: bold;
            margin-bottom: 6px;
            text-transform: uppercase;
            color: #374151;
          }
          .barcode {
            max-width: 100%;
            height: auto;
            margin: 8px 0;
          }
          .footer-info {
            font-size: 11px;
            color: #6b7280;
            margin-top: 6px;
          }
          @media print {
            body { padding: 0; }
            .header { display: none; }
            .grid { gap: 15px; }
            .card { border-style: solid; border-color: #d1d5db; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>NexWare ERP Scan Sheet</h1>
          <p>Scan-ready laser barcode tags sheet. Print onto label paper or sheets.</p>
          <button onclick="window.print()" style="padding: 10px 20px; font-size:14px; font-weight:bold; color:white; background:#6366f1; border:none; border-radius:6px; cursor:pointer">🖨️ Print Label Sheet</button>
        </div>
        <div class="grid">
          ${entries.map(e => {
            const barcodeUrl = `http://localhost:8000/api/v1/registry/barcode?code=${e.entity_id}`;
            const name = e.metadata_snapshot.name || e.metadata_snapshot.customer || e.entity_type.toUpperCase();
            return `
              <div class="card">
                <div class="title">${name}</div>
                <img class="barcode" src="${barcodeUrl}" />
                <div class="footer-info">Type: ${e.entity_type} | Scope: ${e.warehouse_id}</div>
              </div>
            `;
          }).join('')}
        </div>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
