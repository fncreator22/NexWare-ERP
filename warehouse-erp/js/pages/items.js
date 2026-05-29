/**
 * Items / Inventory Management Page
 */
import { getCurrentUser, getItems, createItem, updateItem, deleteItem, getWarehouses, getTaxConfig } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, confirm, createModal, formatDate, formatCurrency, filterData, capitalize, debounce } from '../modules/ui.js';
import { navigate } from '../modules/router.js';

let it_searchQ = '';
let categoryFilter = '';
let it_whFilter = '';
let it_page = 1;
const it_PER_PAGE = 10;

const CATEGORIES = ['Electronics','Furniture','Apparel','Food & Beverage','Tools','Medical','Automotive','Books','Sports','Other'];
function getTaxCats() {
  const cfg = getTaxConfig();
  return [
    { val: 'normal', label: `Normal (${cfg.normal}%)` },
    { val: 'luxury', label: `Luxury (${cfg.luxury}%)` }
  ];
}

export function renderItems() {
  const user = getCurrentUser();
  const whs = getWarehouses();
  const canEdit = ['super_admin','admin','manager'].includes(user.role);

  renderShell('Inventory', 'Manage items, stock, and categories', `
    <div class="animate-slideUp">
      <div class="it_page-header">
        <div class="it_page-header-left">
          <h1 class="it_page-title">📦 Inventory Management</h1>
          <p class="it_page-subtitle">Track items, stock levels, and pricing</p>
        </div>
        <div class="it_page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canEdit ? `
            <button class="btn btn-secondary btn-sm" id="import-csv-btn">📥 Import CSV</button>
            <button class="btn btn-primary" id="create-item-btn">+ Add Item</button>
          ` : ''}
        </div>
      </div>

      <!-- Stats -->
      <div id="item-stats"></div>

      <!-- Toolbar -->
      <div class="table-toolbar">
        <div class="table-search">
          <span>🔍</span>
          <input type="text" id="item-search" placeholder="Search items..." />
        </div>
        <div class="table-filter">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="cat-filter">
            <option value="">All Categories</option>
            ${CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
          ${user.role === 'super_admin' ? `
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="wh-filter-item">
            <option value="">All Warehouses</option>
            ${whs.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}
          </select>` : ''}
        </div>
      </div>

      <!-- Table -->
      <div id="items-table-container"></div>
    </div>
  `);

  renderItemStats();
  renderItemsTable();

  document.getElementById('create-item-btn')?.addEventListener('click', () => showItemModal(null));
  document.getElementById('import-csv-btn')?.addEventListener('click', () => showImportModal());
  const debouncedSearch = debounce(q => {
    it_searchQ = q;
    it_page = 1;
    renderItemsTable();
  }, 300);

  document.getElementById('item-search')?.addEventListener('input', e => debouncedSearch(e.target.value));
  document.getElementById('cat-filter')?.addEventListener('change', e => { categoryFilter = e.target.value; it_page = 1; renderItemsTable(); });
  document.getElementById('wh-filter-item')?.addEventListener('change', e => { it_whFilter = e.target.value; it_page = 1; renderItemsTable(); });

  window._showItemModal = (item) => showItemModal(item);
}

function renderItemStats() {
  const items = getItems();
  const el = document.getElementById('item-stats');
  if (!el) return;
  const totalStock = items.reduce((s,i)=>s+(i.stock||0),0);
  const totalValue = items.reduce((s,i)=>s+((i.price||0)*(i.stock||0)),0);
  const lowStock = items.filter(i=>(i.stock||0)<20).length;
  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">📦</div><div class="stat-card-value">${items.length}</div><div class="stat-card-label">Total Items</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(16,185,129,0.15)">📊</div><div class="stat-card-value">${totalStock.toLocaleString()}</div><div class="stat-card-label">Total Stock</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(6,182,212,0.15)">💎</div><div class="stat-card-value">${formatCurrency(totalValue)}</div><div class="stat-card-label">Inventory Value</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(244,63,94,0.15)">⚠️</div><div class="stat-card-value">${lowStock}</div><div class="stat-card-label">Low Stock Items</div></div>
    </div>
  `;
}

function renderItemsTable() {
  const user = getCurrentUser();
  const whs = getWarehouses();
  const canEdit = ['super_admin','admin','manager'].includes(user.role);
  let items = getItems();
  if (it_searchQ) items = filterData(items, it_searchQ, ['name','sku','category']);
  if (categoryFilter) items = items.filter(i => i.category === categoryFilter);
  if (it_whFilter) items = items.filter(i => i.warehouseId === it_whFilter);

  const total = items.length;
  const it_pages = Math.ceil(total / it_PER_PAGE);
  const start = (it_page-1)*it_PER_PAGE;
  const it_pageItems = items.slice(start, start+it_PER_PAGE);

  const container = document.getElementById('items-table-container');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:40px;margin-bottom:16px;opacity:0.4">📦</div><h3 style="color:var(--text-secondary)">No items found</h3></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Item</th><th>SKU</th><th>Category</th><th>Price</th>
          <th>Stock</th><th>Tax</th><th>Warehouse</th>
          ${canEdit ? '<th>Actions</th>' : ''}
        </tr></thead>
        <tbody>
          ${it_pageItems.map(item => {
            const wh = whs.find(w=>w.id===item.warehouseId);
            const stockClass = (item.stock||0) < 20 ? 'badge-danger' : (item.stock||0) < 50 ? 'badge-warning' : 'badge-success';
            return `<tr>
              <td data-label="Item">
                <div class="primary-cell">${item.name}</div>
                <div class="sub-cell">Added ${formatDate(item.createdAt)}</div>
              </td>
              <td data-label="SKU"><span style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${item.sku||'—'}</span></td>
              <td data-label="Category"><span class="badge badge-brand">${item.category}</span></td>
              <td data-label="Price"><strong style="color:var(--text-primary)">${formatCurrency(item.price||0)}</strong></td>
              <td data-label="Stock"><span class="badge ${stockClass}">${item.stock||0} ${item.unit||'pcs'}</span></td>
              <td data-label="Tax"><span class="badge ${item.taxCategory==='luxury'?'badge-purple':'badge-info'}">${item.taxCategory==='luxury' ? getTaxConfig(item.warehouseId).luxury+'%' : getTaxConfig(item.warehouseId).normal+'%'}</span></td>
              <td data-label="Warehouse"><span class="badge badge-muted">${wh?.name||'—'}</span></td>
              ${canEdit ? `<td data-label="Actions">
                <div class="table-actions">
                  <button class="action-btn edit" data-iid="${item.id}" title="Edit">✏️</button>
                  <button class="action-btn delete" data-iid="${item.id}" title="Delete">🗑️</button>
                </div>
              </td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+it_PER_PAGE,total)} of ${total}</div>
        <div class="pagination-controls">
          <button class="it_page-btn" id="ip-prev" ${it_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:it_pages},(_,i)=>`<button class="it_page-btn ${it_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="it_page-btn" id="ip-next" ${it_page>=it_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;

  if (canEdit) {
    container.querySelectorAll('.action-btn.edit[data-iid]').forEach(btn => {
      btn.addEventListener('click', () => { const item = getItems().find(i=>i.id===btn.dataset.iid); showItemModal(item); });
    });
    container.querySelectorAll('.action-btn.delete[data-iid]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await confirm('Delete this item from inventory?', 'Delete Item');
        if (ok) { deleteItem(btn.dataset.iid); showToast('Item deleted','','success'); renderItemStats(); renderItemsTable(); }
      });
    });
  }
  container.querySelectorAll('.it_page-btn[data-pg]').forEach(btn => { btn.addEventListener('click', () => { it_page=parseInt(btn.dataset.pg); renderItemsTable(); }); });
  container.querySelector('#ip-prev')?.addEventListener('click', () => { if(it_page>1){it_page--;renderItemsTable();} });
  container.querySelector('#ip-next')?.addEventListener('click', () => { if(it_page<it_pages){it_page++;renderItemsTable();} });
}

function showItemModal(item) {
  const isEdit = !!item;
  const whs = getWarehouses();
  const user = getCurrentUser();
  const body = `
    <form id="item-modal-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Item Name <span class="req">*</span></label>
          <input type="text" id="m-i-name" class="form-control" value="${item?.name||''}" required />
        </div>
        <div class="form-group">
          <label class="form-label">SKU</label>
          <input type="text" id="m-i-sku" class="form-control" value="${item?.sku||''}" placeholder="Auto-generated if empty" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Category <span class="req">*</span></label>
          <select id="m-i-cat" class="form-control" required>
            ${CATEGORIES.map(c=>`<option value="${c}" ${item?.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tax Category</label>
          <select id="m-i-tax" class="form-control">
            ${getTaxCats().map(t=>`<option value="${t.val}" ${item?.taxCategory===t.val?'selected':''}>${t.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Price <span class="req">*</span></label>
          <input type="number" id="m-i-price" class="form-control" value="${item?.price||''}" required min="0" step="0.01" />
        </div>
        <div class="form-group">
          <label class="form-label">Stock <span class="req">*</span></label>
          <input type="number" id="m-i-stock" class="form-control" value="${item?.stock||''}" required min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Unit</label>
          <select id="m-i-unit" class="form-control">
            ${['pcs','kg','lbs','box','pallet','set','m','ft'].map(u=>`<option value="${u}" ${item?.unit===u?'selected':''}>${u}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Warehouse <span class="req">*</span></label>
        <select id="m-i-wh" class="form-control" required>
          <option value="">Select warehouse</option>
          ${whs.map(w=>`<option value="${w.id}" ${item?.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
        </select>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="m-i-cancel">Cancel</button>
    <button class="btn btn-primary" id="m-i-save">${isEdit?'✓ Update':'+ Create'} Item</button>
  `;

  const modal = createModal({ title: isEdit ? '✏️ Edit Item' : '📦 Add New Item', body, footer });
  modal.el.querySelector('#m-i-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#m-i-save')?.addEventListener('click', () => {
    const name = document.getElementById('m-i-name').value.trim();
    const category = document.getElementById('m-i-cat').value;
    const price = parseFloat(document.getElementById('m-i-price').value);
    const stock = parseInt(document.getElementById('m-i-stock').value);
    const warehouseId = document.getElementById('m-i-wh').value;
    if (!name||!category||isNaN(price)||isNaN(stock)||!warehouseId) { showToast('Validation','Fill all required fields','warning'); return; }
    const data = { name, category, price, stock, warehouseId, sku: document.getElementById('m-i-sku').value||`SKU-${Date.now()}`, unit: document.getElementById('m-i-unit').value, taxCategory: document.getElementById('m-i-tax').value };
    if (isEdit) { updateItem(item.id, data); showToast('Item updated',`${name} updated`,'success'); }
    else { createItem(data); showToast('Item added',`${name} added to inventory`,'success'); }
    modal.close();
    renderItemStats();
    renderItemsTable();
  });
}

function showImportModal() {
  const body = `
    <div style="padding:16px">
      <div id="drag-drop-zone" style="border:2px dashed var(--border-default);border-radius:12px;padding:32px;text-align:center;cursor:pointer;background:rgba(99,102,241,0.02);transition:all 0.2s">
        <div style="font-size:36px;margin-bottom:12px">📥</div>
        <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Drag & Drop CSV File here</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">or click to browse from your computer</div>
        <input type="file" id="csv-file-input" accept=".csv" style="display:none" />
        <span class="btn btn-secondary btn-sm">Browse File</span>
      </div>
      <div id="upload-progress-container" style="margin-top:20px;display:none">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:6px">
          <span>Uploading & processing items...</span>
          <span id="upload-percentage">0%</span>
        </div>
        <div style="height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden">
          <div id="upload-progress-bar" style="height:100%;width:0%;background:var(--brand-500);transition:width 0.1s"></div>
        </div>
      </div>
      <div id="import-errors-container" style="margin-top:20px;display:none;background:rgba(244,63,94,0.06);border:1px solid rgba(244,63,94,0.15);border-radius:10px;padding:12px;max-height:160px;overflow-y:auto">
        <div style="font-size:12px;font-weight:700;color:var(--accent-rose);margin-bottom:8px">⚠️ Import Warnings/Errors:</div>
        <ul id="import-errors-list" style="font-size:11px;color:var(--text-muted);margin:0;padding-left:16px;line-height:1.6"></ul>
      </div>
      <div style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:8px;font-size:11px;color:var(--text-muted)">
        ℹ️ <strong>Expected columns:</strong> <code>name</code>, <code>sku</code>, <code>category</code>, <code>price</code>, <code>stock</code> (and optional <code>warehouseId</code>).
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="import-cancel">Cancel</button>
    <button class="btn btn-primary" id="import-start-btn" disabled>✓ Upload & Import</button>
  `;

  const modal = createModal({ title: '📥 Bulk Import Inventory', body, footer });
  const fileInput = modal.el.querySelector('#csv-file-input');
  const zone = modal.el.querySelector('#drag-drop-zone');
  const startBtn = modal.el.querySelector('#import-start-btn');
  const cancelBtn = modal.el.querySelector('#import-cancel');
  
  let selectedFile = null;

  zone.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--brand-500)';
    zone.style.background = 'rgba(99,102,241,0.08)';
  });

  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = 'var(--border-default)';
    zone.style.background = 'rgba(99,102,241,0.02)';
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--border-default)';
    zone.style.background = 'rgba(99,102,241,0.02)';
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  function handleFileSelected(file) {
    if (file.name.slice(-4).toLowerCase() !== '.csv') {
      showToast('Invalid File', 'Only standard CSV files are supported.', 'warning');
      return;
    }
    selectedFile = file;
    zone.querySelector('div:nth-child(2)').textContent = `📄 Selected: ${file.name}`;
    zone.querySelector('div:nth-child(3)').textContent = `Size: ${(file.size/1024).toFixed(1)} KB`;
    startBtn.removeAttribute('disabled');
  }

  startBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    startBtn.setAttribute('disabled', 'true');
    cancelBtn.setAttribute('disabled', 'true');
    
    const progressContainer = modal.el.querySelector('#upload-progress-container');
    const progressBar = modal.el.querySelector('#upload-progress-bar');
    const percentage = modal.el.querySelector('#upload-percentage');
    
    progressContainer.style.display = 'block';
    
    // Simulate initial uploading animation progress smoothly
    let p = 0;
    const interval = setInterval(() => {
      if (p < 85) {
        p += 5;
        progressBar.style.width = p + '%';
        percentage.textContent = p + '%';
      }
    }, 100);

    const formData = new FormData();
    formData.append('file', selectedFile);

    const token = localStorage.getItem('access_token');
    const url = 'http://localhost:8000/api/v1/items/import';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      clearInterval(interval);
      progressBar.style.width = '100%';
      percentage.textContent = '100%';

      const data = await res.json();
      
      if (!res.ok) {
        showToast('Import Failed', data.message || 'An error occurred during CSV parsing.', 'error');
        startBtn.removeAttribute('disabled');
        cancelBtn.removeAttribute('disabled');
        return;
      }

      if (data.success) {
        showToast('Import Complete', `Successfully registered ${data.imported} items.`, 'success');
        
        // Show validation warnings/errors if any skipped
        if (data.errors && data.errors.length > 0) {
          const errContainer = modal.el.querySelector('#import-errors-container');
          const errList = modal.el.querySelector('#import-errors-list');
          errList.innerHTML = data.errors.map(err => `<li>${err}</li>`).join('');
          errContainer.style.display = 'block';
          
          startBtn.style.display = 'none';
          cancelBtn.textContent = 'Close';
          cancelBtn.removeAttribute('disabled');
          cancelBtn.className = 'btn btn-primary';
          cancelBtn.addEventListener('click', () => {
            modal.close();
            // trigger parallel frontend sync
            import('../modules/store.js').then(m => m.syncWithBackend()).then(() => {
              renderItemStats();
              renderItemsTable();
            });
          });
        } else {
          modal.close();
          // trigger parallel frontend sync
          import('../modules/store.js').then(m => m.syncWithBackend()).then(() => {
            renderItemStats();
            renderItemsTable();
          });
        }
      } else {
        showToast('Import Failed', data.message || 'Malformed CSV format.', 'error');
        startBtn.removeAttribute('disabled');
        cancelBtn.removeAttribute('disabled');
      }
    } catch (err) {
      clearInterval(interval);
      console.error('CSV upload network failure:', err);
      showToast('Network Error', 'Check if server is active.', 'error');
      startBtn.removeAttribute('disabled');
      cancelBtn.removeAttribute('disabled');
    }
  });
}
