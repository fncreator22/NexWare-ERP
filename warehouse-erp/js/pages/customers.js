/**
 * Customer CRM Portfolio Page — Central CRM repeat tracking and transaction analytics
 */
import { getCurrentUser, apiFetch } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, createModal, formatDate, formatDateTime, getSvgIcon } from '../modules/ui.js';
import { navigate } from '../modules/router.js';

let custSearchQ = '';
let custPage = 1;
const custLimit = 10;

export function renderCustomers() {
  const user = getCurrentUser();
  if (!user) { navigate('/login'); return; }

  renderShell('CRM Customers', 'Track customer checkout histories and CRM repeat profiles', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Customer CRM Workspace</h1>
          <p class="page-subtitle">Repeat customer transaction logs, loyalty tracking, and billing analytics</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <!-- CRM Stats Row -->
      <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-bottom: 24px;">
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(99, 102, 241, 0.15)">${getSvgIcon('workforce', 20)}</div>
          <div class="stat-card-value" id="crm-stat-total">—</div>
          <div class="stat-card-label">Total CRM Customers</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(16, 185, 129, 0.15)">${getSvgIcon('refresh', 20)}</div>
          <div class="stat-card-value" id="crm-stat-repeats">—</div>
          <div class="stat-card-label">Repeat Shoppers Index</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(245, 158, 11, 0.15)">${getSvgIcon('revenue', 20)}</div>
          <div class="stat-card-value" id="crm-stat-revenue">—</div>
          <div class="stat-card-label">CRM Attributed Revenue</div>
        </div>
      </div>

      <!-- Toolbar Search -->
      <div class="table-toolbar">
        <div class="table-search">
          <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span>
          <input type="text" id="crm-search" placeholder="Search customer name, email, phone, ID..." value="${custSearchQ}" />
        </div>
      </div>

      <!-- Customer Directory List -->
      <div id="customers-list-container">
        <div class="card" style="text-align:center;padding:48px">
          <div class="spinner" style="margin: 0 auto 16px"></div>
          <h3 style="color:var(--text-secondary)">Loading Customer Directory...</h3>
        </div>
      </div>
    </div>
  `);

  fetchAndRenderCustomers();

  // Search Input Event
  const searchInput = document.getElementById('crm-search');
  searchInput?.addEventListener('input', debounce((e) => {
    custSearchQ = e.target.value;
    custPage = 1;
    fetchAndRenderCustomers();
  }, 300));
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

async function fetchAndRenderCustomers() {
  const user = getCurrentUser();
  if (!user) return;

  let query = `/registry/customers/?page=${custPage}&limit=${custLimit}`;
  if (custSearchQ) query += `&search=${encodeURIComponent(custSearchQ)}`;

  const res = await apiFetch(query);
  if (res.error) {
    const container = document.getElementById('customers-list-container');
    if (container) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:48px;border-color:rgba(239,68,68,0.2)">
          <div style="font-size:40px;margin-bottom:16px;color:rgba(239,68,68,0.7)">⚠️</div>
          <h3 style="color:var(--text-secondary)">CRM Offline</h3>
          <p style="color:var(--text-muted);margin-top:8px">${res.error}</p>
        </div>
      `;
    }
    return;
  }

  const { customers, total } = res.data;
  const pages = Math.ceil(total / custLimit);
  const start = (custPage - 1) * custLimit;

  // Render Stats Row metrics
  updateCRMStats(customers, total);

  const container = document.getElementById('customers-list-container');
  if (!container) return;

  if (customers.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <div style="font-size:40px;margin-bottom:16px;opacity:0.4">👥</div>
        <h3 style="color:var(--text-secondary)">No CRM records found</h3>
        <p style="color:var(--text-muted);margin-top:8px">No active customer repeat profiles found matching queries.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Customer ID</th>
            <th>Name</th>
            <th>Contact Details</th>
            <th>Transactions</th>
            <th>Attributed Sales</th>
            <th>Last Checkout</th>
            <th style="text-align:center">Portfolio</th>
          </tr>
        </thead>
        <tbody>
          ${customers.map(c => {
            const count = c.invoices ? c.invoices.length : 0;
            const sales = c.invoices ? c.invoices.reduce((sum, inv) => sum + (inv.total || 0), 0) : 0;
            const lastCheckout = c.last_active_at || c.updated_at;

            return `
              <tr>
                <td data-label="Customer ID">
                  <span style="font-family:var(--font-mono);font-weight:700">${c.customer_id}</span>
                </td>
                <td data-label="Name">
                  <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0">
                      ${c.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
                    </div>
                    <div>
                      <div class="primary-cell">${c.name}</div>
                      <div class="sub-cell">Tax ID: ${c.tax_number || '—'}</div>
                    </div>
                  </div>
                </td>
                <td data-label="Contact Details">
                  <div class="primary-cell">${c.phone || '—'}</div>
                  <div class="sub-cell">${c.email || '—'}</div>
                </td>
                <td data-label="Transactions">
                  <span class="badge ${count > 1 ? 'badge-success' : 'badge-secondary'}">${count} Checkout${count !== 1 ? 's' : ''}</span>
                </td>
                <td data-label="Attributed Sales">
                  <strong style="color:var(--text-primary)">$${sales.toFixed(2)}</strong>
                </td>
                <td data-label="Last Checkout">
                  <div class="primary-cell">${formatDateTime(lastCheckout)}</div>
                </td>
                <td data-label="Portfolio" style="text-align:center">
                  <button class="action-btn edit view-portfolio-btn" data-id="${c.customer_id}" title="View CRM Portfolio" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px">${getSvgIcon('view', 12)} Portfolio</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <!-- Pagination controls -->
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start + 1}–${Math.min(start + custLimit, total)} of ${total} customers</div>
        <div class="pagination-controls">
          <button class="wf_page-btn" id="cust-prev" ${custPage <= 1 ? 'disabled' : ''}>‹</button>
          ${Array.from({ length: Math.min(5, pages) }, (_, i) => {
            const pageNum = i + 1;
            return `<button class="wf_page-btn ${custPage === pageNum ? 'active' : ''}" data-pg="${pageNum}">${pageNum}</button>`;
          }).join('')}
          <button class="wf_page-btn" id="cust-next" ${custPage >= pages ? 'disabled' : ''}>›</button>
        </div>
      </div>
    </div>
  `;

  // Attach button triggers
  container.querySelectorAll('.view-portfolio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cust = customers.find(x => x.customer_id === btn.dataset.id);
      if (cust) showPortfolioModal(cust);
    });
  });

  container.querySelectorAll('.wf_page-btn[data-pg]').forEach(btn => {
    btn.addEventListener('click', () => {
      custPage = parseInt(btn.dataset.pg);
      fetchAndRenderCustomers();
    });
  });

  document.getElementById('cust-prev')?.addEventListener('click', () => {
    if (custPage > 1) {
      custPage--;
      fetchAndRenderCustomers();
    }
  });

  document.getElementById('cust-next')?.addEventListener('click', () => {
    if (custPage < pages) {
      custPage++;
      fetchAndRenderCustomers();
    }
  });
}

function updateCRMStats(customers, total) {
  document.getElementById('crm-stat-total').textContent = total;
  
  let repeatCount = 0;
  let revenueTotal = 0;

  customers.forEach(c => {
    const txs = c.invoices ? c.invoices.length : 0;
    if (txs > 1) repeatCount++;
    revenueTotal += c.invoices ? c.invoices.reduce((sum, inv) => sum + (inv.total || 0), 0) : 0;
  });

  const repeatPercent = total > 0 ? Math.round((repeatCount / total) * 100) : 0;

  document.getElementById('crm-stat-repeats').textContent = `${repeatPercent}% (${repeatCount})`;
  document.getElementById('crm-stat-revenue').textContent = `$${revenueTotal.toFixed(2)}`;
}

function showPortfolioModal(c) {
  const barcodeUrl = `http://localhost:8000/api/v1/registry/barcode?code=${c.customer_id}`;
  const invoicesList = c.invoices || [];

  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      <!-- Customer Info Card -->
      <div class="card" style="padding:16px;background:var(--bg-secondary);border:1px solid var(--border-color)">
        <h4 style="margin-top:0;margin-bottom:12px;color:var(--text-primary)">CRM Client Profile</h4>
        <div style="font-size:13px;line-height:1.6;color:var(--text-secondary)">
          <div>Name: <strong>${c.name}</strong></div>
          <div>Phone: <strong>${c.phone || '—'}</strong></div>
          <div>Email: <strong>${c.email || '—'}</strong></div>
          <div>Billing Address: <strong>${c.address || '—'}</strong></div>
          <div>Tax Code: <strong>${c.tax_number || '—'}</strong></div>
        </div>
      </div>
      
      <!-- Barcode Card -->
      <div class="card" style="padding:16px;text-align:center;background:var(--bg-secondary);border:1px solid var(--border-color);display:flex;flex-direction:column;align-items:center;justify-content:center">
        <h4 style="margin-top:0;margin-bottom:8px;color:var(--text-primary)">Barcode ID</h4>
        <img src="${barcodeUrl}" style="height:48px;object-fit:contain;background:#ffffff;padding:4px;border:1px solid #e5e7eb;border-radius:4px" />
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:4px">${c.customer_id}</div>
      </div>
    </div>

    <!-- Invoices List -->
    <h4 style="margin-bottom:12px;color:var(--text-primary)">Transaction Checkout History</h4>
    <div class="table-wrap" style="max-height:220px;overflow-y:auto;box-shadow:none;border:1px solid var(--border-color)">
      <table>
        <thead>
          <tr>
            <th>Bill No</th>
            <th>Checkout Date</th>
            <th>Subtotal</th>
            <th>Tax</th>
            <th>Total Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoicesList.length === 0 ? `
            <tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No transaction history recorded yet.</td></tr>
          ` : invoicesList.map(inv => `
            <tr>
              <td><span style="font-family:var(--font-mono);font-weight:700">${inv.bill_no}</span></td>
              <td>${formatDateTime(inv.checkout_at)}</td>
              <td>$${inv.subtotal.toFixed(2)}</td>
              <td>$${inv.tax.toFixed(2)}</td>
              <td><strong>$${inv.total.toFixed(2)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const footer = `
    <button class="btn btn-primary" id="m-port-close">Close</button>
  `;

  const modal = createModal({ title: `Customer CRM Portfolio Details`, body, footer });
  modal.el.querySelector('#m-port-close')?.addEventListener('click', modal.close);
}
