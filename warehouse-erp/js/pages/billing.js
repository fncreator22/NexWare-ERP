/**
 * Billing & Taxation System — v2
 */
import { getCurrentUser, getItems, createBill, getBills, getWarehouses, getTaxConfig, getTaxRates, syncWithBackend, getActiveCurrency } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, createModal, formatDate, formatDateTime, formatCurrency, filterData, debounce, getSvgIcon, renderWarehouseLogo, generateBarcodeSVG } from '../modules/ui.js';
import { navigate } from '../modules/router.js';
let billItems = [];
let bl_searchQ = '';
let bl_page = 1;
const bl_PER_PAGE = 10;

export function renderBilling() {
  const user = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
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
          <h1 class="page-title">Billing & Taxation</h1>
          <p class="page-subtitle">Automated bill generation with tax computation</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          <button class="btn btn-primary" id="new-bill-btn">+ New Bill</button>
        </div>
      </div>

      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:14px 20px;margin-bottom:24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <span style="color:var(--accent-amber);display:flex;align-items:center">${getSvgIcon('settings', 20)}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary)">Enterprise Tax Engine</div>
          <div style="font-size:12px;color:var(--text-muted)">
            ${(() => {
              const cfg = getTaxConfig();
              if (cfg.taxes && cfg.taxes.length > 0) {
                return cfg.taxes.map(t => `${t.name}: ${t.taxType === 'percentage' ? t.rate + '%' : '$' + t.rate} (${t.taxType})`).join(' &nbsp;|&nbsp; ');
              }
              return `Normal: ${cfg.normal || 5}% &nbsp;|&nbsp; Luxury: ${cfg.luxury || 15}%`;
            })()}
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:20px;flex-wrap:wrap">
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--accent-emerald)">${formatCurrency(totalRev)}</div><div style="font-size:11px;color:var(--text-muted)">Total Revenue</div></div>
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--accent-amber)">${formatCurrency(totalTax)}</div><div style="font-size:11px;color:var(--text-muted)">Total Tax</div></div>
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--text-primary)">${bills.length}</div><div style="font-size:11px;color:var(--text-muted)">Invoices</div></div>
        </div>
      </div>

      <div class="table-toolbar">
        <div class="table-search"><span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span><input type="text" id="bill-search" placeholder="Search bills, customers..." /></div>
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
  
  // Realtime WebSocket auto-refresh for invoices
  window.removeEventListener('wareops_ws_event', _handleBillingWsEvent);
  window.addEventListener('wareops_ws_event', _handleBillingWsEvent);
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
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:40px;margin-bottom:16px;opacity:0.4;display:flex;justify-content:center;color:var(--text-muted)">${getSvgIcon('billing', 42)}</div><h3 style="color:var(--text-secondary)">No bills found</h3><p style="color:var(--text-muted);margin-bottom:20px">Generate your first invoice</p><button class="btn btn-primary" onclick="document.getElementById('new-bill-btn').click()">+ New Bill</button></div>`;
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
                  <button class="action-btn view" data-bid="${b.id}" title="View Bill" style="display:inline-flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                  <button class="action-btn" data-print="${b.id}" title="Print Invoice" style="display:inline-flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
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
  const body = document.createElement('div');
  body.style.width = '100%';

  let selectedCategory = '';
  let highlightedIndex = -1;
  let filteredItems = [];
  let searchTimeout = null;

  function renderBillBody() {
    const savedCustomer = body.querySelector('#bill-customer')?.value || '';
    const savedWh = body.querySelector('#bill-wh')?.value || '';
    const warehouseId = savedWh || whs[0]?.id;
    const wh = whs.find(w => w.id === warehouseId);
    
    const whEmail = wh?.email || '';
    const whContact = wh?.contact || '';
    const gstinFallback = whEmail ? `27${whEmail.toUpperCase().slice(0,3)}C${whContact.slice(-4) || '1234'}F1Z5` : '27AAPCW1234F1Z5';

    // Retrieve input values to preserve them across redrawing
    const savedSellerAddress = body.querySelector('#bill-seller-address')?.value || wh?.address || 'Primary Logistics Hub';
    const savedSellerContact = body.querySelector('#bill-seller-contact')?.value || wh?.contact || 'Contact Office';
    const savedSellerTax = body.querySelector('#bill-seller-tax')?.value || wh?.taxNumber || wh?.gstin || gstinFallback;
    const savedBuyerBilling = body.querySelector('#bill-buyer-billing')?.value || '';
    const savedBuyerShipping = body.querySelector('#bill-buyer-shipping')?.value || '';
    const savedPhone = body.querySelector('#bill-customer-phone')?.value || '';
    const savedEmail = body.querySelector('#bill-customer-email')?.value || '';

    // Check if custom tax preference is unconfigured
    const isCustomUnconfigured = wh && wh.taxPreference === 'custom' && (!wh.taxConfig || Object.keys(wh.taxConfig).length === 0);
    const items = getItems(warehouseId);
    
    // Calculate totals using dynamic tax engine
    const calculation = calculateTaxesFrontend(billItems, warehouseId);

    // Track stock validation
    let hasStockError = false;

    body.innerHTML = `
      <div style="display:flex; gap:24px; min-height:550px; flex-wrap:wrap; width:100%;">
        <!-- Left Column: Interactive Checkout Desk -->
        <div style="flex:1.2; min-width:320px; display:flex; flex-direction:column; gap:16px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600;">Customer Name <span class="req">*</span></label>
              <input type="text" id="bill-customer" class="form-control" placeholder="Customer name" value="${savedCustomer}" />
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600;">Warehouse Hub</label>
              <select id="bill-wh" class="form-control">
                ${whs.map(w=>`<option value="${w.id}" ${warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Seller and Buyer Information Grid -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:var(--bg-input); border-radius:12px; padding:16px; border:1px solid var(--border-default);">
            <div style="grid-column: span 2; font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border-subtle); padding-bottom:4px; display:flex; align-items:center; gap:6px;">${getSvgIcon('warehouses', 14)} Seller (Issuer) Details</div>
            <div class="form-group" style="margin:0; grid-column: span 2;">
              <label class="form-label" style="font-weight:600; font-size:11px;">Seller Address</label>
              <input type="text" id="bill-seller-address" class="form-control" style="font-size:12px; padding:6px 10px;" placeholder="Seller address" value="${savedSellerAddress}" />
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Seller Contact</label>
              <input type="text" id="bill-seller-contact" class="form-control" style="font-size:12px; padding:6px 10px;" placeholder="Seller contact" value="${savedSellerContact}" />
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Seller GST/VAT Number</label>
              <input type="text" id="bill-seller-tax" class="form-control" style="font-size:12px; padding:6px 10px;" placeholder="GSTIN / VAT ID" value="${savedSellerTax}" />
            </div>

            <div style="grid-column: span 2; font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border-subtle); padding-bottom:4px; margin-top:8px; display:flex; align-items:center; gap:6px;">${getSvgIcon('user', 14)} Buyer Billing & Contact</div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Customer Phone</label>
              <input type="text" id="bill-customer-phone" class="form-control" style="font-size:12px; padding:6px 10px;" placeholder="Phone" value="${savedPhone}" />
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Customer Email</label>
              <input type="email" id="bill-customer-email" class="form-control" style="font-size:12px; padding:6px 10px;" placeholder="Email" value="${savedEmail}" />
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Buyer Billing Address</label>
              <textarea id="bill-buyer-billing" class="form-control" style="font-size:12px; padding:6px 10px; height:50px; resize:none;" placeholder="Billing Address">${savedBuyerBilling}</textarea>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Buyer Shipping Address</label>
              <textarea id="bill-buyer-shipping" class="form-control" style="font-size:12px; padding:6px 10px; height:50px; resize:none;" placeholder="Shipping Address">${savedBuyerShipping}</textarea>
            </div>
          </div>

          <div style="background:var(--bg-input); border-radius:12px; padding:16px; border:1px solid var(--border-default);">
            <div style="font-size:13px; font-weight:700; margin-bottom:12px; color:var(--text-secondary); display:flex; justify-content:space-between; align-items:center;">
              <span style="display:flex;align-items:center;gap:6px">${getSvgIcon('items', 14)} Add Items Catalog</span>
              <span style="font-size:11px; color:var(--text-muted);">Barcode Ready</span>
            </div>
            
            ${isCustomUnconfigured ? `
              <div style="color:var(--accent-rose); font-size:12px; font-weight:600; padding:10px; background:rgba(244,63,94,0.08); border:1px solid rgba(244,63,94,0.2); border-radius:8px; display:flex; align-items:flex-start; gap:8px">
                <span style="color:var(--accent-rose); flex-shrink:0; margin-top:2px">${getSvgIcon('warning', 16)}</span>
                <span>Custom Tax Config Required: Please configure tax rates in settings for this warehouse before creating invoices.</span>
              </div>
            ` : `
              <div style="position:relative;">
                <div style="display:flex; gap:8px; align-items:center;">
                  <div style="position:relative; flex-grow:1;">
                    <input type="text" id="sku-search-input" class="form-control" placeholder="Search name, SKU or scan barcode..." autocomplete="off" style="width:100%; padding-left:36px;" />
                    <span style="position:absolute; left:12px; top:12px; color:var(--text-muted); display:flex; align-items:center;">${getSvgIcon('search', 14)}</span>
                    
                    <!-- Floating Dropdown list -->
                    <div id="sku-dropdown-list" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg-card); border:1px solid var(--border-default); border-radius:8px; max-height:220px; overflow-y:auto; z-index:1000; box-shadow:var(--shadow-lg); margin-top:4px;"></div>
                  </div>
                  <div style="width:80px;">
                    <input type="number" id="item-qty" class="form-control" value="1" min="1" placeholder="Qty" />
                  </div>
                  <button class="btn btn-secondary btn-sm" id="add-item-btn" style="height:40px; padding:0 16px;">+ Add</button>
                </div>
                
                <!-- Category filtering pills -->
                <div id="category-filter-pills" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;"></div>
              </div>
            `}
          </div>

          <!-- Added Items Table -->
          <div id="bill-items-list" style="flex-grow:1; min-height:180px;">
            ${calculation.items.length === 0 ? `
              <div style="text-align:center; padding:40px 20px; color:var(--text-muted); font-size:13px; background:var(--bg-input); border-radius:12px; border:1px dashed var(--border-default); display:flex; flex-direction:column; align-items:center; justify-content:center;">
                <div style="margin-bottom:8px; color:var(--text-muted)">${getSvgIcon('billing', 28)}</div>
                <div>No items added to the workspace yet</div>
              </div>
            ` : `
              <div style="overflow-x:auto; border:1px solid var(--border-default); border-radius:10px;">
                <table style="width:100%; border-collapse:collapse; background:var(--bg-card);">
                  <thead>
                    <tr style="background:var(--bg-input); border-bottom:1px solid var(--border-default);">
                      <th style="padding:10px 8px; text-align:left; font-size:11px; color:var(--text-muted); font-weight:700;">ITEM</th>
                      <th style="padding:10px 8px; text-align:center; font-size:11px; color:var(--text-muted); font-weight:700; width:90px;">QTY</th>
                      <th style="padding:10px 8px; text-align:right; font-size:11px; color:var(--text-muted); font-weight:700;">UNIT</th>
                      <th style="padding:10px 8px; text-align:right; font-size:11px; color:var(--text-muted); font-weight:700;">TAX RATE</th>
                      <th style="padding:10px 8px; text-align:right; font-size:11px; color:var(--text-muted); font-weight:700;">TOTAL</th>
                      <th style="width:36px; padding:8px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${calculation.items.map((bi, i) => {
                      const catalogItem = items.find(item => item.id === bi.id);
                      const availableStock = catalogItem ? catalogItem.stock : 0;
                      const isOverStock = bi.qty > availableStock;
                      
                      if (isOverStock) hasStockError = true;
                      
                      const taxRateText = bi.taxes ? bi.taxes.map(t => `${t.name}: ${t.taxType === 'percentage' ? (t.rate * 100).toFixed(0) + '%' : '$' + t.rate}`).join(', ') : (bi.taxRate * 100).toFixed(0) + '%';
                      
                      return `
                        <tr style="border-bottom:1px solid var(--border-subtle); background:${isOverStock ? 'rgba(244,63,94,0.03)' : 'transparent'};">
                          <td style="padding:10px 8px; font-size:13px;">
                            <div style="font-weight:700;">${bi.name}</div>
                            <div style="font-size:10px; color:${isOverStock ? 'var(--accent-rose)' : 'var(--text-muted)'}; margin-top:2px;">
                              ${isOverStock ? `<span style="display:inline-flex;align-items:center;gap:4px;color:var(--accent-rose)">${getSvgIcon('warning', 12)} Out of Stock (Available: ${availableStock})</span>` : `Available Stock: ${availableStock}`}
                            </div>
                          </td>
                          <td style="padding:8px; text-align:center;">
                            <input type="number" class="form-control item-qty-edit-input" data-index="${i}" value="${bi.qty}" min="1" style="width:100%; text-align:center; padding:4px; font-size:13px; font-weight:600; border-color:${isOverStock ? 'var(--accent-rose)' : 'var(--border-default)'};" />
                          </td>
                          <td style="padding:10px 8px; text-align:right; font-size:13px;">${formatCurrency(bi.price)}</td>
                          <td style="padding:10px 8px; text-align:right; font-size:11px; color:var(--accent-amber); font-weight:500;">${taxRateText}</td>
                          <td style="padding:10px 8px; text-align:right; font-size:13px; font-weight:700;">${formatCurrency(bi.total)}</td>
                          <td style="padding:4px; text-align:center;">
                            <button class="action-btn delete" onclick="window._removeBillItem(${i})" style="padding:4px 8px;">${getSvgIcon('trash', 14)}</button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <!-- Workspace Totals Summary -->
          <div style="background:var(--bg-input); border-radius:12px; padding:16px; border:1px solid var(--border-default);">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
              <span style="color:var(--text-muted)">Subtotal</span>
              <span style="font-weight:600;">${formatCurrency(calculation.subtotal)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
              <span style="color:var(--accent-amber)">Total Tax</span>
              <span style="color:var(--accent-amber); font-weight:600; text-align:right;">
                ${formatCurrency(calculation.tax)}
                ${calculation.taxDetails && calculation.taxDetails.length > 0 ? `
                  <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">
                    (${calculation.taxDetails.map(t => `${t.name}: ${formatCurrency(t.amount)}`).join(', ')})
                  </div>
                ` : ''}
              </span>
            </div>
            <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border-default); padding-top:10px; margin-top:4px;">
              <span style="font-weight:700; font-size:15px;">Grand Total</span>
              <span style="font-weight:800; font-size:17px; color:var(--text-brand)">${formatCurrency(calculation.total)}</span>
            </div>
          </div>
        </div>

        <!-- Right Column: Live print preview canvas -->
        <div style="flex:1; min-width:320px; border-left:1px solid var(--border-default); padding-left:24px; display:flex; flex-direction:column;">
          <div style="font-size:13px; font-weight:700; color:var(--text-secondary); margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
            <span style="display:flex;align-items:center;gap:6px">${getSvgIcon('view', 14)} Live Invoice Canvas</span>
            <span class="badge badge-brand" style="font-size:10px;">A4 Format</span>
          </div>
          
          <div id="live-invoice-preview-container" style="background:var(--bg-card); border:1px solid var(--border-default); border-radius:12px; padding:16px; flex-grow:1; overflow-y:auto; max-height:580px; box-shadow:var(--shadow-sm);">
            <!-- Invoice preview rendered dynamically -->
          </div>
        </div>
      </div>
    `;

    // Render category filters
    renderCategoryPills(items, body.querySelector('#sku-search-input'));

    // Bind event selectors immediately
    bindEvents(warehouseId, items, hasStockError, calculation);

    // Render live preview on the right side
    renderLiveInvoicePreview(calculation, warehouseId, wh);
  }

  function renderSKUDropdown(searchTerm, items) {
    const listContainer = body.querySelector('#sku-dropdown-list');
    if (!listContainer) return;

    if (!searchTerm.trim() && !selectedCategory) {
      listContainer.style.display = 'none';
      return;
    }

    filteredItems = items.filter(i => {
      const matchSearch = !searchTerm.trim() || 
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchCat = !selectedCategory || i.category === selectedCategory;
      return matchSearch && matchCat;
    });

    if (filteredItems.length === 0) {
      listContainer.innerHTML = `
        <div style="padding:12px; text-align:center; color:var(--text-muted); font-size:12px;">
          No matching catalog items found
        </div>
      `;
      listContainer.style.display = 'block';
      highlightedIndex = -1;
      return;
    }

    listContainer.innerHTML = filteredItems.map((i, idx) => {
      const isLowStock = i.stock < 20;
      const isHighlighted = idx === highlightedIndex;
      return `
        <div class="sku-dropdown-item" data-id="${i.id}" data-index="${idx}" style="padding:10px 12px; cursor:pointer; border-bottom:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:space-between; transition:background 0.15s; background:${isHighlighted ? 'rgba(99,102,241,0.08)' : 'transparent'};">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="color:var(--text-secondary);display:flex;align-items:center">${getSvgIcon('items', 18)}</span>
            <div>
              <div style="font-size:13px; font-weight:700; color:var(--text-primary);">${i.name}</div>
              <div style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">SKU: ${i.sku} · Cat: ${i.category}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px; font-weight:700; color:var(--text-brand);">${formatCurrency(i.price)}</div>
            <div style="font-size:11px; color:${isLowStock ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; font-weight:600;">
              ${isLowStock ? `<span style="display:inline-flex;align-items:center;gap:3px;color:var(--accent-rose)">${getSvgIcon('warning', 10)} Low Stock: </span>` : 'Stock: '}${i.stock} units
            </div>
          </div>
        </div>
      `;
    }).join('');

    listContainer.style.display = 'block';

    // Add click listeners to items
    listContainer.querySelectorAll('.sku-dropdown-item').forEach(itemEl => {
      itemEl.addEventListener('click', (e) => {
        const itemIdx = parseInt(itemEl.dataset.index);
        selectSKUItem(filteredItems[itemIdx]);
      });
      // Mouseover to update highlight
      itemEl.addEventListener('mouseenter', () => {
        highlightedIndex = parseInt(itemEl.dataset.index);
        updateDropdownHighlight();
      });
    });
  }

  function selectSKUItem(item) {
    const qty = parseInt(body.querySelector('#item-qty')?.value) || 1;
    addItemToBill(item, qty);
    
    // Reset search box
    const searchInput = body.querySelector('#sku-search-input');
    if (searchInput) searchInput.value = '';
    
    hideSKUDropdown();
  }

  function addItemToBill(item, qty) {
    // Check if item is already added to billItems. If so, increment the quantity!
    const existing = billItems.find(i => i.id === item.id);
    if (existing) {
      existing.qty += qty;
    } else {
      billItems.push({
        id: item.id,
        name: item.name,
        price: item.price,
        taxCategory: item.taxCategory || 'normal',
        qty
      });
    }
    renderBillBody();
  }

  function updateDropdownHighlight() {
    const listContainer = body.querySelector('#sku-dropdown-list');
    if (!listContainer) return;
    
    listContainer.querySelectorAll('.sku-dropdown-item').forEach((el, idx) => {
      if (idx === highlightedIndex) {
        el.style.background = 'rgba(99, 102, 241, 0.08)';
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        el.style.background = 'transparent';
      }
    });
  }

  function renderCategoryPills(items, searchInput) {
    const pillsContainer = body.querySelector('#category-filter-pills');
    if (!pillsContainer) return;

    const uniqueCategories = [...new Set(items.map(i => i.category))];
    pillsContainer.innerHTML = `
      <span class="badge ${selectedCategory === '' ? 'badge-brand' : 'badge-secondary'}" data-cat="" style="cursor:pointer; padding:6px 12px; font-size:11px; font-weight:600; border-radius:12px; transition:all 0.15s;">All</span>
      ${uniqueCategories.map(c => `
        <span class="badge ${selectedCategory === c ? 'badge-brand' : 'badge-secondary'}" data-cat="${c}" style="cursor:pointer; padding:6px 12px; font-size:11px; font-weight:600; border-radius:12px; transition:all 0.15s;">${c}</span>
      `).join('')}
    `;

    pillsContainer.querySelectorAll('.badge').forEach(pill => {
      pill.addEventListener('click', (e) => {
        selectedCategory = e.target.dataset.cat;
        renderCategoryPills(items, searchInput);
        renderSKUDropdown(searchInput?.value || '', items);
      });
    });
  }

  function renderLiveInvoicePreview(calculation, warehouseId, wh) {
    const previewContainer = body.querySelector('#live-invoice-preview-container');
    if (!previewContainer) return;

    const customerName = body.querySelector('#bill-customer')?.value.trim() || 'Valued Client';
    
    // Retrieve latest values from workspace form fields
    const sellerAddress = body.querySelector('#bill-seller-address')?.value || wh?.address || 'Primary Logistics Hub';
    const sellerContact = body.querySelector('#bill-seller-contact')?.value || wh?.contact || 'Contact Office';
    const sellerTax = body.querySelector('#bill-seller-tax')?.value || wh?.taxNumber || wh?.gstin || '';
    const buyerBilling = body.querySelector('#bill-buyer-billing')?.value || '';
    const buyerShipping = body.querySelector('#bill-buyer-shipping')?.value || '';
    const customerPhone = body.querySelector('#bill-customer-phone')?.value || '';
    const customerEmail = body.querySelector('#bill-customer-email')?.value || '';

    const mockBill = {
      billNo: "INV-DRAFT",
      customer: customerName,
      warehouseId: warehouseId,
      items: calculation.items.map(i => ({
        id: i.id,
        name: i.name,
        qty: i.qty,
        price: i.price,
        taxCategory: i.taxCategory || 'normal',
        taxRate: i.taxRate,
        taxes: i.taxes
      })),
      subtotal: calculation.subtotal,
      tax: calculation.tax,
      total: calculation.total,
      taxConfigSnapshot: getTaxConfig(warehouseId),
      taxDetails: calculation.taxDetails,
      createdAt: new Date().toISOString(),
      
      // Extended fields
      sellerAddress,
      sellerContact,
      sellerTaxNumber: sellerTax,
      buyerBillingAddress: buyerBilling,
      buyerShippingAddress: buyerShipping,
      customerPhone,
      customerEmail,
      employeeName: getCurrentUser()?.name || "System Creator",
      employeeRole: getCurrentUser()?.role || "Staff"
    };

    previewContainer.innerHTML = buildInvoiceHTML(mockBill, wh, 'modal');
  }

  function bindEvents(warehouseId, items, hasStockError, calculation) {
    // Warehouse Selector Switch
    body.querySelector('#bill-wh')?.addEventListener('change', () => {
      billItems = []; // Clear current items on warehouse switch to prevent mismatch
      renderBillBody();
    });

    // Form Inputs - Live preview refresh on any change
    ['#bill-customer', '#bill-seller-address', '#bill-seller-contact', '#bill-seller-tax', '#bill-customer-phone', '#bill-customer-email', '#bill-buyer-billing', '#bill-buyer-shipping'].forEach(sel => {
      body.querySelector(sel)?.addEventListener('input', () => {
        const wh = whs.find(w => w.id === warehouseId);
        const calculationLive = calculateTaxesFrontend(billItems, warehouseId);
        renderLiveInvoicePreview(calculationLive, warehouseId, wh);
      });
    });

    // Search Input listeners
    const searchInput = body.querySelector('#sku-search-input');
    
    searchInput?.addEventListener('focus', () => {
      renderSKUDropdown(searchInput.value, items);
    });

    searchInput?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      
      // Barcode support: exact SKU match
      const exactMatch = items.find(i => i.sku.toLowerCase() === val.toLowerCase());
      if (exactMatch) {
        const qty = parseInt(body.querySelector('#item-qty')?.value) || 1;
        addItemToBill(exactMatch, qty);
        e.target.value = '';
        hideSKUDropdown();
        showToast('SKU Scanned', `${exactMatch.name} added to bill`, 'success');
        return;
      }

      // Debounced dynamic search dropdown
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        highlightedIndex = -1;
        renderSKUDropdown(val, items);
      }, 150);
    });

    // Key navigation
    searchInput?.addEventListener('keydown', (e) => {
      const listContainer = body.querySelector('#sku-dropdown-list');
      if (!listContainer || listContainer.style.display === 'none' || filteredItems.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightedIndex = (highlightedIndex + 1) % filteredItems.length;
        updateDropdownHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightedIndex = (highlightedIndex - 1 + filteredItems.length) % filteredItems.length;
        updateDropdownHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
          selectSKUItem(filteredItems[highlightedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideSKUDropdown();
      }
    });

    // Added items inline quantity edit listener
    body.querySelectorAll('.item-qty-edit-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(input.dataset.index);
        const newQty = parseInt(e.target.value) || 1;
        billItems[idx].qty = newQty;
        renderBillBody();
      });
      
      input.addEventListener('input', (e) => {
        const idx = parseInt(input.dataset.index);
        const newQty = parseInt(e.target.value) || 1;
        billItems[idx].qty = newQty;
        // Fast live refresh on keypress
        const calculationLive = calculateTaxesFrontend(billItems, warehouseId);
        const wh = whs.find(w => w.id === warehouseId);
        renderLiveInvoicePreview(calculationLive, warehouseId, wh);
      });
    });

    // Add Item Manual Button click
    body.querySelector('#add-item-btn')?.addEventListener('click', () => {
      if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
        selectSKUItem(filteredItems[highlightedIndex]);
      } else if (filteredItems.length > 0) {
        selectSKUItem(filteredItems[0]);
      } else {
        showToast('Selection Empty', 'Please type a keyword or select an item from the list', 'warning');
      }
    });

    // Close dropdown on click outside
    document.addEventListener('click', closeDropdownHandler);
  }

  function closeDropdownHandler(e) {
    const dropdown = body.querySelector('#sku-dropdown-list');
    const searchInput = body.querySelector('#sku-search-input');
    if (dropdown && !dropdown.contains(e.target) && e.target !== searchInput) {
      hideSKUDropdown();
    }
  }

  function hideSKUDropdown() {
    const dropdown = body.querySelector('#sku-dropdown-list');
    if (dropdown) dropdown.style.display = 'none';
    highlightedIndex = -1;
  }

  renderBillBody();

  const footer = `
    <button class="btn btn-secondary" id="bill-cancel">Cancel</button>
    <button class="btn btn-primary" id="bill-save" style="display:flex;align-items:center;gap:6px">${getSvgIcon('billing', 14)} Generate Bill</button>
  `;

  // Wide Split-screen modal layout configuration
  const modal = createModal({ title: 'Enterprise Checkout Desk', body, footer, size: 'xl' });
  
  // Safe listener cleanups
  const origClose = modal.close;
  modal.close = () => {
    document.removeEventListener('click', closeDropdownHandler);
    origClose();
  };

  modal.el.querySelector('#bill-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#bill-save')?.addEventListener('click', async () => {
    const customer = document.getElementById('bill-customer')?.value.trim();
    if (!customer) { showToast('Validation','Customer name required','warning'); return; }
    if (billItems.length === 0) { showToast('Validation','Add at least one item','warning'); return; }
    const warehouseId = document.getElementById('bill-wh')?.value || whs[0]?.id;
    
    // Custom tax configuration safeguard
    const wh = whs.find(w => w.id === warehouseId);
    if (wh && wh.taxPreference === 'custom' && (!wh.taxConfig || Object.keys(wh.taxConfig).length === 0)) {
      showToast('Tax Configuration Required', 'This warehouse is flagged with "Custom Tax Setup". Please configure regional tax rules in settings before generating invoices.', 'error');
      return;
    }

    const calculation = calculateTaxesFrontend(billItems, warehouseId);
    
    // Validation to prevent overselling on the client side
    let validationPassed = true;
    const items = getItems(warehouseId);
    calculation.items.forEach(bi => {
      const catalogItem = items.find(item => item.id === bi.id);
      const availableStock = catalogItem ? catalogItem.stock : 0;
      if (bi.qty > availableStock) {
        validationPassed = false;
        showToast('Stock Threshold Alert', `Insufficient stock for ${bi.name}. Maximum: ${availableStock}`, 'error');
      }
    });

    if (!validationPassed) return;

    const sellerAddress = document.getElementById('bill-seller-address')?.value.trim() || '';
    const sellerContact = document.getElementById('bill-seller-contact')?.value.trim() || '';
    const sellerTaxNumber = document.getElementById('bill-seller-tax')?.value.trim() || '';
    const buyerBillingAddress = document.getElementById('bill-buyer-billing')?.value.trim() || '';
    const buyerShippingAddress = document.getElementById('bill-buyer-shipping')?.value.trim() || '';
    const customerPhone = document.getElementById('bill-customer-phone')?.value.trim() || '';
    const customerEmail = document.getElementById('bill-customer-email')?.value.trim() || '';

    // Field validations
    if (customerEmail && (!customerEmail.includes('@') || !customerEmail.includes('.'))) {
      showToast('Validation', 'Invalid customer email address format', 'warning');
      return;
    }
    if (customerPhone && customerPhone.length < 5) {
      showToast('Validation', 'Invalid customer phone number', 'warning');
      return;
    }

    const payload = {
      customer,
      warehouseId,
      items: calculation.items.map(i => ({
        id: i.id,
        name: i.name,
        price: i.price,
        taxCategory: i.taxCategory || 'normal',
        taxRate: i.taxRate,
        qty: i.qty,
        taxes: i.taxes ? i.taxes.map(t => ({
          name: t.name,
          taxType: t.taxType,
          rate: t.rate,
          amount: t.amount
        })) : null
      })),
      subtotal: calculation.subtotal,
      tax: calculation.tax,
      total: calculation.total,
      taxDetails: calculation.taxDetails ? calculation.taxDetails.map(t => ({
        name: t.name,
        taxType: t.taxType,
        rate: t.rate,
        amount: t.amount
      })) : null,
      
      // Extended fields
      sellerAddress,
      sellerContact,
      sellerTaxNumber,
      buyerBillingAddress,
      buyerShippingAddress,
      customerPhone,
      customerEmail
    };
    
    const res = await createBill(payload);
    if (res && res.error) {
      showToast('Generation failed', res.error, 'error');
      return;
    }
    
    showToast('Bill generated!', `${res.billNo || 'Invoice'} — ${formatCurrency(calculation.total)}`, 'success');
    billItems = [];
    modal.close();
    renderBilling();
  });
}



function showBillPreview(bill) {
  const whs = getWarehouses();
  const wh = whs.find(w=>w.id===bill.warehouseId);
  const body = buildInvoiceHTML(bill, wh, 'modal');
  const footer = `
    <button class="btn btn-secondary" id="prev-close">Close</button>
    <button class="btn btn-primary" id="prev-print" style="display:flex;align-items:center;gap:6px">${getSvgIcon('download', 14)} Print / Export PDF</button>
  `;
  const modal = createModal({ title: `Invoice — ${bill.billNo}`, body, footer, size: 'lg' });
  modal.el.querySelector('#prev-close')?.addEventListener('click', modal.close);
  modal.el.querySelector('#prev-print')?.addEventListener('click', () => { modal.close(); printBill(bill.id); });
}

function buildInvoiceHTML(bill, wh, mode) {
  const cfg = bill.taxConfigSnapshot || getTaxConfig();
  
  // Warehouse-aware currency: use warehouse currency if set, else global
  const currency = wh?.currency || getActiveCurrency();
  const fmt = (v) => formatCurrency(v, currency);

  const sellerAddress = bill.sellerAddress || wh?.address || 'Primary Logistics Hub';
  const sellerContact = bill.sellerContact || wh?.contact || 'Contact Office';
  const sellerTax = bill.sellerTaxNumber || wh?.taxNumber || wh?.gstin || (wh?.email ? `GSTIN: 27${wh.email.toUpperCase().slice(0,3)}C${wh.contact?.slice(-4) || '1234'}F1Z5` : 'GSTIN: 27AAPCW1234F1Z5');
  
  const buyerBilling = bill.buyerBillingAddress || 'N/A';
  const buyerShipping = bill.buyerShippingAddress || 'N/A';
  const buyerPhone = bill.customerPhone || 'N/A';
  const buyerEmail = bill.customerEmail || 'N/A';
  
  const employeeName = bill.employeeName || 'System Creator';
  const employeeRole = bill.employeeRole || 'Staff';

  const rows = (bill.items||[]).map(i => {
    const lineBase = i.qty * i.price;
    let lineTax = 0;
    let taxRateText = '';
    
    if (i.taxes && i.taxes.length > 0) {
      lineTax = i.taxes.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
      taxRateText = i.taxes.map(t => `${t.name}: ${t.taxType === 'percentage' ? (parseFloat(t.rate || 0) * 100).toFixed(0) + '%' : '$' + parseFloat(t.rate || 0)}`).join(', ');
    } else {
      const taxRate = i.taxRate !== undefined ? i.taxRate : (cfg[i.taxCategory] / 100 || cfg.normal / 100);
      lineTax = lineBase * taxRate;
      taxRateText = `${(taxRate * 100).toFixed(0)}%`;
    }
    const lineTotal = lineBase + lineTax;
    
    return `<tr>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle)"><strong>${i.name}</strong></td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:center"><span class="badge badge-brand" style="font-size:10px">${i.taxCategory || 'normal'}</span></td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:center;font-weight:600">${i.qty}</td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:right">${fmt(i.price)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:center;font-weight:600;color:var(--accent-amber);font-size:11px;">${taxRateText}</td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:right;color:var(--accent-amber)">${fmt(lineTax)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:right;font-weight:700;color:var(--text-primary)">${fmt(lineTotal)}</td>
    </tr>`;
  }).join('');

  const containerStyle = mode === 'modal'
    ? 'font-family:system-ui,-apple-system,sans-serif;color:var(--text-primary);background:var(--bg-card);padding:16px'
    : 'font-family:system-ui,-apple-system,sans-serif;color:#111;background:#fff;padding:0';

  // Calculate due date (15 days from creation)
  const createdDate = new Date(bill.createdAt);
  const dueDate = new Date(createdDate.getTime() + 15 * 24 * 60 * 60 * 1000);

  return `<div style="${containerStyle};border-radius:12px">
    <!-- Header: Seller & Corporate Identity -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid var(--border-default)">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="width:40px;height:40px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--border-default);display:flex;align-items:center;justify-content:center;color:var(--text-primary);overflow:hidden;flex-shrink:0;">
            ${renderWarehouseLogo(wh?.logo, 32)}
          </div>
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--text-primary);line-height:1">${wh?.businessName || wh?.name || 'NexWare ERP'}</div>
            <div style="font-size:11px;font-weight:700;color:var(--text-brand);letter-spacing:1px;margin-top:4px">TAX ID/GSTIN: ${sellerTax}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
          <strong>Address:</strong> ${sellerAddress}<br/>
          <strong>Contact:</strong> ${sellerContact}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:28px;font-weight:900;color:var(--text-brand);letter-spacing:1px;line-height:1;margin-bottom:6px">INVOICE</div>
        <div style="font-size:14px;font-weight:700;font-family:var(--font-mono);color:var(--text-primary)">${bill.billNo}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Source Hub: ${wh?.name || '—'}</div>
      </div>
    </div>

    <!-- Buyer & Metadata Block -->
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;margin-bottom:24px">
      <div style="background:var(--bg-input);border-left:4px solid var(--text-brand);padding:12px 16px;border-radius:0 8px 8px 0">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-brand);margin-bottom:6px">Bill To (Buyer)</div>
        <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${bill.customer}</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.4">
          <strong>Billing Address:</strong> ${buyerBilling}<br/>
          <strong>Shipping Address:</strong> ${buyerShipping}<br/>
          <strong>Phone:</strong> ${buyerPhone} · <strong>Email:</strong> ${buyerEmail}
        </div>
      </div>
      <div style="background:var(--bg-input);border-left:4px solid var(--accent-emerald);padding:12px 16px;border-radius:0 8px 8px 0">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent-emerald);margin-bottom:6px">Invoice Metadata</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.5">
          <strong>Issue Date:</strong> ${formatDate(bill.createdAt)}<br/>
          <strong>Due Date:</strong> ${formatDate(dueDate)}<br/>
          <strong>Billed By:</strong> ${employeeName} (${employeeRole})<br/>
          <strong>Payment Method:</strong> Bank Transfer (Net 15)
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px">
      <thead>
        <tr style="background:var(--bg-input);color:var(--text-primary)">
          <th style="padding:10px 8px;text-align:left;border-radius:6px 0 0 6px">Item Details</th>
          <th style="padding:10px 8px;text-align:center">Category</th>
          <th style="padding:10px 8px;text-align:center">Qty</th>
          <th style="padding:10px 8px;text-align:right">Rate</th>
          <th style="padding:10px 8px;text-align:center">Tax %</th>
          <th style="padding:10px 8px;text-align:right">Tax Amt</th>
          <th style="padding:10px 8px;text-align:right;border-radius:0 6px 6px 0">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Bottom Section: Totals & Signature -->
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:24px;margin-bottom:24px;align-items:end">
      <!-- Terms & Notes -->
      <div style="font-size:11px;color:var(--text-muted);line-height:1.5">
        <div style="font-weight:700;color:var(--text-secondary);margin-bottom:4px">Terms & Declarations</div>
        <div>1. Payment is strictly due within 15 days of invoice generation date.</div>
        <div>2. Interest at 18% p.a. will be charged for delayed payments.</div>
        <div>3. Subject to local judicial jurisdiction. Goods once sold will not be returned.</div>
      </div>
      <!-- Grand Totals -->
      <div style="min-width:220px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:13px">
          <span style="color:var(--text-muted)">Subtotal</span><span style="font-weight:600">${fmt(bill.subtotal)}</span>
        </div>
        ${bill.taxDetails && bill.taxDetails.length > 0 ? 
          bill.taxDetails.map(t => {
            const taxAmt = parseFloat(t.amount || 0);
            const rateText = t.taxType === 'percentage' ? `${(parseFloat(t.rate || 0) * 100).toFixed(1)}%` : `${fmt(parseFloat(t.rate || 0))}`;
            return `
              <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed var(--border-subtle);font-size:12px;color:var(--accent-amber)">
                <span>${t.name} (${rateText})</span>
                <span style="font-weight:600;">${fmt(taxAmt)}</span>
              </div>
            `;
          }).join('')
          : `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:13px">
              <span style="color:var(--accent-amber)">Total Tax</span><span style="color:var(--accent-amber);font-weight:600">${fmt(bill.tax)}</span>
            </div>
          `
        }
        <div style="display:flex;justify-content:space-between;padding:10px 0;background:var(--bg-input);border-radius:8px;padding:10px 12px;margin-top:4px">
          <span style="font-size:14px;font-weight:800;color:var(--text-primary)">Grand Total</span>
          <span style="font-size:18px;font-weight:900;color:var(--text-brand)">${fmt(bill.total)}</span>
        </div>
      </div>
    </div>

    <!-- Footer: Signature & Systems Metadata -->
    <div style="border-top:1.5px solid var(--border-default);padding-top:16px;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:10px;color:var(--text-muted)">
        <div>Generated by NexWare ERP</div>
        <div>Date &amp; Time: ${formatDateTime(bill.createdAt)}</div>
        <div style="margin-top:8px;background:#fff;display:inline-block;padding:2px;border-radius:3px">
          ${generateBarcodeSVG(bill.billNo, { height: 36, color: '#111', showLabel: true })}
        </div>
      </div>
      <div style="text-align:right;min-width:180px">
        <div style="border-bottom:1px solid var(--border-default);height:30px;width:100%;margin-bottom:4px"></div>
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase">Authorized Signatory</div>
      </div>
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
  if (!win) {
    showToast('Popup Blocked', 'Please allow popups in your browser settings to print/export invoices.', 'error');
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Invoice ${bill.billNo}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Georgia,serif; background:#fff; color:#111; padding:20mm; }
    @page { size:A4; margin:15mm; }
    @media print {
      body { padding:0; }
      .no-print { display:none !important; }
    }
    table { border-collapse:collapse; width:100%; }
    /* CSS variable fallbacks for standalone print window */
    :root {
      --text-primary:#111827; --text-secondary:#374151; --text-muted:#6b7280;
      --text-brand:#111827; --text-disabled:#9ca3af;
      --bg-card:#ffffff; --bg-input:#f9fafb; --bg-elevated:#f3f4f6;
      --border-default:#e5e7eb; --border-subtle:#f3f4f6;
      --accent-amber:#d97706; --accent-emerald:#059669; --accent-rose:#e11d48;
      --brand-500:#111827; --gradient-brand:linear-gradient(135deg,#111 0%,#333 100%);
      --shadow-sm:0 1px 2px rgba(0,0,0,.05); --shadow-lg:0 10px 15px rgba(0,0,0,.1);
      --font-mono:'Courier New',monospace;
    }
    .badge { display:inline-block; padding:2px 7px; border-radius:4px; font-size:11px; font-weight:600; }
    .badge-brand { background:#111827; color:#fff; }
    .badge-info  { background:#e0f2fe; color:#0369a1; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;padding:12px;background:#111827;color:#fff;font-family:sans-serif;font-size:14px;cursor:pointer" onclick="window.print();window.close()">
    🖨 Click here to Print / Save as PDF — then close this window
  </div>
  <div style="padding:20px">${invoiceHTML}</div>
  <script>setTimeout(()=>window.print(),700);<\/script>
</body>
</html>`);
  win.document.close();
}


function _handleBillingWsEvent(e) {
  const user = getCurrentUser();
  if (!user) {
    window.removeEventListener('wareops_ws_event', _handleBillingWsEvent);
    return;
  }
  const payload = e.detail;
  const evType = payload?.type || payload?.event_type;
  if (evType === 'billing_completion') {
    syncWithBackend().then(() => {
      renderBillsTable();
    });
  }
}

function calculateTaxesFrontend(items, warehouseId) {
  const taxCfg = getTaxConfig(warehouseId);
  const TAX_RATES = getTaxRates(warehouseId); // { normal: 0.05, luxury: 0.15 }
  
  let subtotal = 0;
  let totalTax = 0;
  
  const processedItems = items.map(item => {
    const lineSubtotal = item.price * item.qty;
    subtotal += lineSubtotal;
    
    let lineTaxes = [];
    if (taxCfg.taxes && taxCfg.taxes.length > 0) {
      lineTaxes = taxCfg.taxes.map(t => {
        const r = parseFloat(t.rate) || 0;
        const rateFraction = t.taxType === 'percentage' ? r / 100 : r;
        const amount = t.taxType === 'percentage' 
          ? lineSubtotal * rateFraction 
          : item.qty * rateFraction;
        return {
          name: t.name,
          taxType: t.taxType,
          rate: rateFraction,
          amount: amount
        };
      });
    } else {
      // Fallback to normal/luxury rates
      const rateFraction = TAX_RATES[item.taxCategory] || TAX_RATES.normal || 0.05;
      lineTaxes = [{
        name: `GST (${(item.taxCategory || 'normal').toUpperCase()})`,
        taxType: 'percentage',
        rate: rateFraction,
        amount: lineSubtotal * rateFraction
      }];
    }
    
    const lineTax = lineTaxes.reduce((s, t) => s + t.amount, 0);
    totalTax += lineTax;
    
    return {
      ...item,
      taxRate: lineTaxes[0]?.rate || 0.05,
      taxes: lineTaxes,
      subtotal: lineSubtotal,
      tax: lineTax,
      total: lineSubtotal + lineTax
    };
  });
  
  return {
    subtotal,
    tax: totalTax,
    total: subtotal + totalTax,
    items: processedItems,
    taxDetails: groupTaxesFrontend(processedItems)
  };
}

function groupTaxesFrontend(items) {
  const grouped = {};
  items.forEach(item => {
    if (item.taxes) {
      item.taxes.forEach(t => {
        if (!grouped[t.name]) {
          grouped[t.name] = {
            name: t.name,
            taxType: t.taxType,
            rate: t.rate,
            amount: 0
          };
        }
        grouped[t.name].amount += t.amount;
      });
    }
  });
  return Object.values(grouped);
}
