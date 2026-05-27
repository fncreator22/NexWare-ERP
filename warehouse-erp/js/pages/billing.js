/**
 * Billing & Taxation System — v2
 */
import { getCurrentUser, getItems, createBill, getBills, getWarehouses, getTaxConfig, getTaxRates } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, createModal, formatDate, formatDateTime, formatCurrency, filterData, debounce } from '../modules/ui.js';
import { navigate } from '../modules/router.js';
let billItems = [];
let bl_searchQ = '';
let bl_page = 1;
const bl_PER_PAGE = 10;

export function renderBilling() {
  const user = getCurrentUser();
  const allowed = ['super_admin','admin','manager','staff'];
  if (!allowed.includes(user.role)) { navigate('/dashboard'); return; }

  const bills = getBills();
  const totalRev = bills.reduce((s,b)=>s+b.total,0);
  const totalTax = bills.reduce((s,b)=>s+b.tax,0);
  const whs = getWarehouses();

  renderShell('Billing', 'Invoice management and automated taxation', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">💰 Billing & Taxation</h1>
          <p class="page-subtitle">Automated bill generation with tax computation</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          <button class="btn btn-primary" id="new-bill-btn">+ New Bill</button>
        </div>
      </div>

      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:14px 20px;margin-bottom:24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <span style="font-size:20px">⚙️</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary)">Active Tax Rules</div>
          <div style="font-size:12px;color:var(--text-muted)">Normal items: ${getTaxConfig().normal}% GST &nbsp;|&nbsp; Luxury items: ${getTaxConfig().luxury}% GST</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:20px;flex-wrap:wrap">
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--accent-emerald)">${formatCurrency(totalRev)}</div><div style="font-size:11px;color:var(--text-muted)">Total Revenue</div></div>
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--accent-amber)">${formatCurrency(totalTax)}</div><div style="font-size:11px;color:var(--text-muted)">Total Tax</div></div>
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--text-primary)">${bills.length}</div><div style="font-size:11px;color:var(--text-muted)">Invoices</div></div>
        </div>
      </div>

      <div class="table-toolbar">
        <div class="table-search"><span>🔍</span><input type="text" id="bill-search" placeholder="Search bills, customers..." /></div>
        <div class="table-filter">
          ${user.role === 'super_admin' ? `
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="bill-wh-filter">
            <option value="">All Warehouses</option>
            ${whs.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}
          </select>` : ''}
        </div>
      </div>
      <div id="bills-table-container"></div>
    </div>
  `);

  renderBillsTable();
  document.getElementById('new-bill-btn')?.addEventListener('click', () => showBillModal());
  const debouncedSearch = debounce(q => {
    bl_searchQ = q;
    bl_page = 1;
    renderBillsTable();
  }, 300);

  document.getElementById('bill-search')?.addEventListener('input', e => debouncedSearch(e.target.value));
  document.getElementById('bill-wh-filter')?.addEventListener('change', () => { bl_page=1; renderBillsTable(); });

  // Expose printBill and showBillModal globally
  window.printBill = printBill;
  window._showBillModal = showBillModal;
}

function renderBillsTable() {
  const whs = getWarehouses();
  let bills = getBills();
  const whFilter = document.getElementById('bill-wh-filter')?.value || '';
  if (bl_searchQ) bills = filterData(bills, bl_searchQ, ['customer','billNo']);
  if (whFilter) bills = bills.filter(b=>b.warehouseId===whFilter);

  const total = bills.length;
  const bl_pages = Math.ceil(total/bl_PER_PAGE) || 1;
  
  // Bug fix: Reset page pointer if it's out of bounds after filtering
  if (bl_page > bl_pages) bl_page = 1;

  const start = (bl_page-1)*bl_PER_PAGE;
  const pageBills = bills.slice(start, start+bl_PER_PAGE);

  const container = document.getElementById('bills-table-container');
  if (!container) return;

  if (bills.length === 0) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:40px;margin-bottom:16px;opacity:0.4">🧾</div><h3 style="color:var(--text-secondary)">No bills found</h3><p style="color:var(--text-muted);margin-bottom:20px">Generate your first invoice</p><button class="btn btn-primary" onclick="document.getElementById('new-bill-btn').click()">+ New Bill</button></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Bill No.</th><th>Customer</th><th>Items</th>
          <th>Subtotal</th><th>Tax</th><th>Total</th>
          <th>Warehouse</th><th>Date</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${pageBills.map(b => {
            const wh = whs.find(w=>w.id===b.warehouseId);
            return `<tr>
              <td data-label="Bill No"><span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text-brand)">${b.billNo}</span></td>
              <td data-label="Customer"><div class="primary-cell">${b.customer}</div></td>
              <td data-label="Items"><span class="badge badge-muted">${(b.items||[]).length} item${(b.items||[]).length!==1?'s':''}</span></td>
              <td data-label="Subtotal">${formatCurrency(b.subtotal)}</td>
              <td data-label="Tax"><span style="color:var(--accent-amber)">${formatCurrency(b.tax)}</span></td>
              <td data-label="Total"><strong style="color:var(--text-primary);font-size:15px">${formatCurrency(b.total)}</strong></td>
              <td data-label="Warehouse"><span class="badge badge-info">${wh?.name||'—'}</span></td>
              <td data-label="Date" style="font-size:12px;color:var(--text-muted)">${formatDate(b.createdAt)}</td>
              <td data-label="Actions">
                <div class="table-actions">
                  <button class="action-btn view" data-bid="${b.id}" title="View Bill">👁️</button>
                  <button class="action-btn" data-print="${b.id}" title="Print Invoice" style="font-size:15px">🖨️</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+bl_PER_PAGE,total)} of ${total}</div>
        <div class="pagination-controls">
          <button class="page-btn" id="bp-prev" ${bl_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:Math.min(bl_pages,7)},(_,i)=>`<button class="page-btn ${bl_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="page-btn" id="bp-next" ${bl_page>=bl_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('.action-btn.view[data-bid]').forEach(btn => {
    btn.addEventListener('click', () => { const b = getBills().find(b=>b.id===btn.dataset.bid); if(b) showBillPreview(b); });
  });
  container.querySelectorAll('[data-print]').forEach(btn => {
    btn.addEventListener('click', () => { printBill(btn.dataset.print); });
  });
  container.querySelectorAll('.page-btn[data-pg]').forEach(btn=>btn.addEventListener('click',()=>{bl_page=parseInt(btn.dataset.pg);renderBillsTable();}));
  container.querySelector('#bp-prev')?.addEventListener('click',()=>{if(bl_page>1){bl_page--;renderBillsTable();}});
  container.querySelector('#bp-next')?.addEventListener('click',()=>{if(bl_page<bl_pages){bl_page++;renderBillsTable();}});
}

function showBillModal() {
  billItems = [];
  const whs = getWarehouses();
  const items = getItems();
  const body = document.createElement('div');

  function renderBillBody() {
    const savedCustomer = body.querySelector('#bill-customer')?.value || '';
    const savedWh = body.querySelector('#bill-wh')?.value || '';
    const warehouseId = savedWh || whs[0]?.id;
    const wh = whs.find(w => w.id === warehouseId);
    
    // Check if custom tax preference is unconfigured
    const isCustomUnconfigured = wh && wh.taxPreference === 'custom' && (!wh.taxConfig || Object.keys(wh.taxConfig).length === 0);
    const TAX_RATES = getTaxRates(warehouseId);
    
    const subtotal = billItems.reduce((s,i)=>s+(i.qty*(i.price||0)),0);
    const tax = billItems.reduce((s,i)=>s+(i.qty*(i.price||0)*(TAX_RATES[i.taxCategory]||TAX_RATES.normal)),0);
    const total = subtotal + tax;

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Customer Name <span class="req">*</span></label>
          <input type="text" id="bill-customer" class="form-control" placeholder="Customer or company name" value="${savedCustomer}" />
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Warehouse</label>
          <select id="bill-wh" class="form-control">
            ${whs.map(w=>`<option value="${w.id}" ${warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="background:var(--bg-input);border-radius:10px;padding:16px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text-secondary)">📦 Add Items</div>
        ${isCustomUnconfigured ? `
          <div style="color:var(--accent-rose);font-size:12px;font-weight:600;padding:10px;background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.2);border-radius:8px">
            ⚠️ Custom Tax Config Required: Please configure tax rates in settings for this warehouse before creating invoices.
          </div>
        ` : `
        <div style="display:grid;grid-template-columns:2fr 1fr auto;gap:8px;align-items:end">
          <div>
            <label class="form-label" style="font-size:11px">Item</label>
            <select id="item-select" class="form-control">
              <option value="">Select item...</option>
              ${items.map(i=>`<option value="${i.id}" data-price="${i.price}" data-tax="${i.taxCategory}" data-name="${i.name}">${i.name} — ${formatCurrency(i.price)} (${i.taxCategory})</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label" style="font-size:11px">Quantity</label>
            <input type="number" id="item-qty" class="form-control" value="1" min="1" />
          </div>
          <button class="btn btn-secondary btn-sm" id="add-item-btn" style="height:40px">+ Add</button>
        </div>
        `}
      </div>
      <div id="bill-items-list" style="margin-bottom:16px">
        ${billItems.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No items added yet</div>` : `
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:rgba(255,255,255,0.03)">
              <th style="padding:8px;text-align:left;font-size:11px;color:var(--text-muted)">ITEM</th>
              <th style="padding:8px;text-align:center;font-size:11px;color:var(--text-muted)">QTY</th>
              <th style="padding:8px;text-align:right;font-size:11px;color:var(--text-muted)">UNIT</th>
              <th style="padding:8px;text-align:right;font-size:11px;color:var(--text-muted)">TAX%</th>
              <th style="padding:8px;text-align:right;font-size:11px;color:var(--text-muted)">TAX AMT</th>
              <th style="padding:8px;text-align:right;font-size:11px;color:var(--text-muted)">TOTAL</th>
              <th style="width:30px"></th>
            </tr></thead>
            <tbody>
              ${billItems.map((bi,i)=>{
                const lineTotal = bi.qty * bi.price;
                const taxRate = TAX_RATES[bi.taxCategory] || TAX_RATES.normal;
                const lineTax = lineTotal * taxRate;
                return `<tr style="border-bottom:1px solid var(--border-subtle)">
                  <td style="padding:8px;font-size:13px"><strong>${bi.name}</strong></td>
                  <td style="padding:8px;text-align:center;font-size:13px">${bi.qty}</td>
                  <td style="padding:8px;text-align:right;font-size:13px">${formatCurrency(bi.price)}</td>
                  <td style="padding:8px;text-align:right;font-size:13px;color:var(--accent-amber)">${(taxRate*100).toFixed(0)}%</td>
                  <td style="padding:8px;text-align:right;font-size:13px;color:var(--accent-amber)">${formatCurrency(lineTax)}</td>
                  <td style="padding:8px;text-align:right;font-size:13px;font-weight:700">${formatCurrency(lineTotal+lineTax)}</td>
                  <td style="padding:4px"><button class="action-btn delete" onclick="window._removeBillItem(${i})">🗑️</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
      <div style="background:var(--bg-input);border-radius:10px;padding:16px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:var(--text-muted)">Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:var(--accent-amber)">Total Tax</span><span style="color:var(--accent-amber)">${formatCurrency(tax)}</span></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border-default);padding-top:10px;margin-top:4px"><span style="font-weight:700;font-size:16px">Grand Total</span><span style="font-weight:800;font-size:18px;color:var(--text-brand)">${formatCurrency(total)}</span></div>
      </div>
    `;

    // Bind dynamic warehouse selector switch to modal re-rendering
    setTimeout(() => {
      body.querySelector('#bill-wh')?.addEventListener('change', () => {
        renderBillBody();
      });
    }, 0);

    body.querySelector('#add-item-btn')?.addEventListener('click', () => {
      const sel = body.querySelector('#item-select');
      const opt = sel.selectedOptions[0];
      if (!opt || !opt.value) { showToast('Select an item','','warning'); return; }
      const qty = parseInt(body.querySelector('#item-qty').value) || 1;
      const rate = TAX_RATES[opt.dataset.tax] || TAX_RATES.normal;
      billItems.push({ id: opt.value, name: opt.dataset.name, price: parseFloat(opt.dataset.price), taxCategory: opt.dataset.tax, taxRate: rate, qty });
      renderBillBody();
    });
    window._removeBillItem = (i) => { billItems.splice(i,1); renderBillBody(); };
  }

  renderBillBody();

  const footer = `
    <button class="btn btn-secondary" id="bill-cancel">Cancel</button>
    <button class="btn btn-primary" id="bill-save">🧾 Generate Bill</button>
  `;

  const modal = createModal({ title: '🧾 New Invoice', body, footer, size: 'lg' });
  modal.el.querySelector('#bill-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#bill-save')?.addEventListener('click', () => {
    const customer = document.getElementById('bill-customer')?.value.trim();
    if (!customer) { showToast('Validation','Customer name required','warning'); return; }
    if (billItems.length === 0) { showToast('Validation','Add at least one item','warning'); return; }
    const warehouseId = document.getElementById('bill-wh')?.value || getWarehouses()[0]?.id;
    
    // Custom tax configuration safeguard
    const wh = getWarehouses().find(w => w.id === warehouseId);
    if (wh && wh.taxPreference === 'custom' && (!wh.taxConfig || Object.keys(wh.taxConfig).length === 0)) {
      showToast('Tax Configuration Required', 'This warehouse is flagged with "Custom Tax Setup". Please configure regional tax rules in settings before generating invoices.', 'error');
      return;
    }

    const TAX_RATES = getTaxRates(warehouseId);
    const subtotal = billItems.reduce((s,i)=>s+(i.qty*i.price),0);
    const tax = billItems.reduce((s,i)=>s+(i.qty*i.price*(TAX_RATES[i.taxCategory]||TAX_RATES.normal)),0);
    const total = subtotal + tax;
    const bill = createBill({ customer, warehouseId, items: billItems.map(i=>({...i})), subtotal, tax, total });
    showToast('Bill generated!', `${bill.billNo} — ${formatCurrency(total)}`, 'success');
    billItems = [];
    modal.close();
    navigate(getCurrentPath());
  });
}



function showBillPreview(bill) {
  const whs = getWarehouses();
  const wh = whs.find(w=>w.id===bill.warehouseId);
  const body = buildInvoiceHTML(bill, wh, 'modal');
  const footer = `
    <button class="btn btn-secondary" id="prev-close">Close</button>
    <button class="btn btn-primary" id="prev-print">🖨️ Print Invoice</button>
  `;
  const modal = createModal({ title: `Invoice — ${bill.billNo}`, body, footer, size: 'lg' });
  modal.el.querySelector('#prev-close')?.addEventListener('click', modal.close);
  modal.el.querySelector('#prev-print')?.addEventListener('click', () => { modal.close(); printBill(bill.id); });
}

function buildInvoiceHTML(bill, wh, mode) {
  const cfg = bill.taxConfigSnapshot || getTaxConfig();
  const taxRateLabel = { luxury: `${cfg.luxury}%`, normal: `${cfg.normal}%` };
  const rows = (bill.items||[]).map(i => {
    // Use stored taxRate if available, otherwise fall back to snapshot or current config
    const taxRate = i.taxRate !== undefined ? i.taxRate : (cfg[i.taxCategory] / 100 || cfg.normal / 100);
    const lineBase = i.qty * i.price;
    const lineTax = lineBase * taxRate;
    const lineTotal = lineBase + lineTax;
    return `<tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb">${i.name}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${i.taxCategory}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${i.qty}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">$${i.price.toFixed(2)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:#b45309">${(taxRate * 100).toFixed(0)}%</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;color:#b45309">$${lineTax.toFixed(2)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700">$${lineTotal.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const containerStyle = mode === 'modal'
    ? 'font-family:Georgia,serif;color:#111;background:#fff;padding:8px'
    : 'font-family:Georgia,serif;color:#111;background:#fff;padding:0';

  return `<div style="${containerStyle}">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1e1b4b">
      <div>
        <div style="font-size:28px;font-weight:900;color:#1e1b4b;letter-spacing:-0.5px">${wh?.businessName || wh?.name || 'WareOps'}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px">${wh?.address || ''}</div>
        <div style="font-size:13px;color:#6b7280">${wh?.contact || ''} ${wh?.email ? '· '+wh.email : ''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:32px;font-weight:900;color:#6366f1;letter-spacing:1px">INVOICE</div>
        <div style="font-size:16px;font-weight:700;color:#1e1b4b;margin-top:4px">${bill.billNo}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Date: ${formatDate(bill.createdAt)}</div>
        <div style="font-size:12px;color:#6b7280">Time: ${new Date(bill.createdAt).toLocaleTimeString()}</div>
      </div>
    </div>

    <!-- Bill To -->
    <div style="display:flex;justify-content:space-between;margin-bottom:28px">
      <div style="background:#f8f9ff;border-left:4px solid #6366f1;padding:14px 18px;border-radius:0 8px 8px 0;min-width:200px">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#6366f1;margin-bottom:6px">Bill To</div>
        <div style="font-size:16px;font-weight:700;color:#111">${bill.customer}</div>
      </div>
      <div style="background:#f8f9ff;border-left:4px solid #10b981;padding:14px 18px;border-radius:0 8px 8px 0;min-width:160px">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#10b981;margin-bottom:6px">Warehouse</div>
        <div style="font-size:15px;font-weight:700;color:#111">${wh?.name || '—'}</div>
        <div style="font-size:12px;color:#6b7280">${wh?.businessName || ''}</div>
      </div>
    </div>

    <!-- Items Table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px">
      <thead>
        <tr style="background:#1e1b4b;color:#fff">
          <th style="padding:12px 8px;text-align:left;border-radius:6px 0 0 0">Item</th>
          <th style="padding:12px 8px;text-align:center">Category</th>
          <th style="padding:12px 8px;text-align:center">Qty</th>
          <th style="padding:12px 8px;text-align:right">Unit Price</th>
          <th style="padding:12px 8px;text-align:center">Tax %</th>
          <th style="padding:12px 8px;text-align:right">Tax Amt</th>
          <th style="padding:12px 8px;text-align:right;border-radius:0 6px 0 0">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Totals -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:28px">
      <div style="min-width:260px">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px">
          <span style="color:#6b7280">Subtotal</span><span style="font-weight:600">$${bill.subtotal.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px">
          <span style="color:#b45309">Total Tax</span><span style="color:#b45309;font-weight:600">$${bill.tax.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;background:#f8f9ff;border-radius:8px;padding:12px 16px;margin-top:4px">
          <span style="font-size:16px;font-weight:800;color:#1e1b4b">Grand Total</span>
          <span style="font-size:20px;font-weight:900;color:#6366f1">$${bill.total.toFixed(2)}</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top:2px solid #e5e7eb;padding-top:16px;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:11px;color:#9ca3af">
        <div>Generated by WareOps ERP</div>
        <div>${formatDateTime(bill.createdAt)}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:#10b981;background:#f0fdf4;padding:6px 16px;border-radius:99px;border:1px solid #bbf7d0">✓ PAID</div>
    </div>
  </div>`;
}

export function printBill(billId) {
  const bills = getBills();
  const bill = bills.find(b=>b.id===billId);
  if (!bill) { showToast('Error','Bill not found','error'); return; }
  const whs = getWarehouses();
  const wh = whs.find(w=>w.id===bill.warehouseId);
  const invoiceHTML = buildInvoiceHTML(bill, wh, 'print');

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Invoice ${bill.billNo}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:Georgia,serif; background:#fff; color:#111; padding:20mm; }
    @page { size:A4; margin:15mm; }
    @media print {
      body { padding:0; }
      .no-print { display:none !important; }
    }
    table { border-collapse:collapse; width:100%; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;padding:12px;background:#6366f1;color:#fff;font-family:sans-serif;font-size:14px;cursor:pointer" onclick="window.print();window.close()">
    🖨️ Click here to Print / Save as PDF — then close this window
  </div>
  <div style="padding:20px">${invoiceHTML}</div>
  <script>setTimeout(()=>window.print(),600);<\/script>
</body>
</html>`);
  win.document.close();
}
