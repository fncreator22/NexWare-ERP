/**
 * Items / Inventory Management Page
 */
import { getCurrentUser, getItems, createItem, updateItem, deleteItem, getWarehouses, getTaxConfig, syncWithBackend, getStore, apiFetch, addAuditLog } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, confirm, createModal, formatDate, formatCurrency, filterData, capitalize, debounce, getSvgIcon, renderEntityImage, generateBarcodeSVG } from '../modules/ui.js';
import { navigate } from '../modules/router.js';
import { canDo } from '../modules/permissions.js';

let it_searchQ = '';
let categoryFilter = '';
let it_whFilter = '';
let it_page = 1;
const it_PER_PAGE = 10;
let it_layout = localStorage.getItem('wareops_items_layout') || 'table';

const CATEGORIES = ['Electronics','Furniture','Apparel','Food & Beverage','Tools','Medical','Automotive','Books','Sports','Other'];

export function renderItems() {
  const user = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
  const whs = getWarehouses();

  renderShell('Inventory', 'Manage items, stock, and categories', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Inventory Management</h1>
          <p class="page-subtitle">Track items, stock levels, and pricing</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canDo('inventory', 'manage') ? `<button class="btn btn-secondary btn-sm" id="generate-barcodes-btn">Generate Barcodes</button>` : ''}
          ${canDo('inventory', 'create') ? `
            <button class="btn btn-secondary btn-sm" id="import-csv-btn">Import CSV</button>
            <button class="btn btn-primary" id="create-item-btn">+ Add Item</button>
          ` : ''}
        </div>
      </div>

      <!-- Stats -->
      <div id="item-stats"></div>

      <!-- Toolbar -->
      <div class="table-toolbar">
        <div class="table-search">
          <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span>
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
          <!-- View Mode Toggle -->
          <div class="view-mode-toggle" id="it-view-toggle" style="margin-left: 8px;">
            <button class="view-mode-btn ${it_layout==='table'?'active':''}" data-view="table" title="Table View">${getSvgIcon('tables', 14)}</button>
            <button class="view-mode-btn ${it_layout==='card'?'active':''}" data-view="card" title="Card View">${getSvgIcon('warehouse', 14)}</button>
            <button class="view-mode-btn ${it_layout==='grid'?'active':''}" data-view="grid" title="Grid View">${getSvgIcon('dashboard', 14)}</button>
          </div>
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
  document.getElementById('generate-barcodes-btn')?.addEventListener('click', () => showBarcodeGenerationModal());
  const debouncedSearch = debounce(q => {
    it_searchQ = q;
    it_page = 1;
    renderItemsTable();
  }, 300);

  document.getElementById('item-search')?.addEventListener('input', e => debouncedSearch(e.target.value));
  document.getElementById('cat-filter')?.addEventListener('change', e => { categoryFilter = e.target.value; it_page = 1; renderItemsTable(); });
  document.getElementById('wh-filter-item')?.addEventListener('change', e => { it_whFilter = e.target.value; it_page = 1; renderItemsTable(); });

  // View mode buttons
  document.getElementById('it-view-toggle')?.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      it_layout = btn.dataset.view;
      localStorage.setItem('wareops_items_layout', it_layout);
      document.querySelectorAll('#it-view-toggle .view-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.view === it_layout));
      renderItemsTable();
    });
  });

  window._showItemModal = (item) => showItemModal(item);
  window._showItemCardModalById = (id) => {
    const item = getItems().find(i => i.id === id);
    if (item) showItemCardModal(item);
  };
  
  // Realtime storage sync auto-refresh for inventory
  window.removeEventListener('wareops_storage_sync', _handleInventoryStorageSync);
  window.addEventListener('wareops_storage_sync', _handleInventoryStorageSync);

  // Deep-link target item if id query parameter is present in URL hash
  const hash = window.location.hash || '';
  const queryPart = hash.split('?')[1];
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    const itemId = params.get('id');
    if (itemId) {
      setTimeout(() => {
        const item = getItems().find(i => i.id === itemId);
        if (item) {
          showItemCardModal(item);
        }
      }, 300);
    }
  }
}

function renderItemStats() {
  const items = getItems();
  const el = document.getElementById('item-stats');
  if (!el) return;
  const totalStock = items.reduce((s,i)=>s+(i.stock||0),0);
  const totalValue = items.reduce((s,i)=>s+((i.price||0)*(i.stock||0)),0);
  const lowStock = items.filter(i => {
    const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
    return (i.stock || 0) < threshold;
  }).length;
  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(99,102,241,0.15);display:flex;align-items:center;justify-content:center;color:#6366f1">${getSvgIcon('items', 18)}</div><div class="stat-card-value">${items.length}</div><div class="stat-card-label">Total Items</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(16,185,129,0.15);display:flex;align-items:center;justify-content:center;color:#10b981">${getSvgIcon('analytics', 18)}</div><div class="stat-card-value">${totalStock.toLocaleString()}</div><div class="stat-card-label">Total Stock</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(6,182,212,0.15);display:flex;align-items:center;justify-content:center;color:#06b6d4">${getSvgIcon('revenue', 18)}</div><div class="stat-card-value">${formatCurrency(totalValue)}</div><div class="stat-card-label">Inventory Value</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(244,63,94,0.15);display:flex;align-items:center;justify-content:center;color:#f43f5e">${getSvgIcon('warning', 18)}</div><div class="stat-card-value">${lowStock}</div><div class="stat-card-label">Low Stock Items</div></div>
    </div>
  `;
}

function renderItemsTable() {
  const user = getCurrentUser();
  const whs = getWarehouses();
  const canEdit = canDo('inventory', 'edit') || canDo('inventory', 'delete');
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
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="color:var(--text-muted);margin-bottom:16px">${getSvgIcon('items', 40)}</div><h3 style="color:var(--text-secondary)">No items found</h3></div>`;
    return;
  }

  if (it_layout === 'card') {
    renderItemsCardView(it_pageItems, whs, canEdit, container, start, total, it_pages);
  } else if (it_layout === 'grid') {
    renderItemsGridView(it_pageItems, whs, canEdit, container, start, total, it_pages);
  } else {
    renderItemsTableView(it_pageItems, whs, canEdit, container, start, total, it_pages);
  }

  bindItemsEvents(container, it_pages);
}

function renderItemsTableView(pageItems, whs, canEdit, container, start, total, it_pages) {
  const hasEdit = canDo('inventory', 'edit');
  const hasDelete = canDo('inventory', 'delete');
  const showActions = hasEdit || hasDelete;
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Item</th><th>SKU</th><th>Category</th><th>Price</th>
          <th>Stock</th><th>Warehouse</th>
          ${showActions ? '<th>Actions</th>' : ''}
        </tr></thead>
        <tbody>
          ${pageItems.map(item => {
            const wh = whs.find(w=>w.id===item.warehouseId);
            const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 20;
            const healthStatus = item.healthStatus || ((item.stock || 0) === 0 ? 'Critical' : (item.stock || 0) < threshold ? 'Low Stock' : 'Healthy');
            const stockClass = healthStatus === 'Critical' ? 'badge-danger' : healthStatus === 'Low Stock' ? 'badge-warning' : 'badge-success';
            const itemImg = (item.images && item.images.length > 0) ? item.images[0] : '';
            return `<tr>
              <td data-label="Item">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="clickable-item-name" data-iid="${item.id}" style="cursor:pointer;flex-shrink:0" title="View Product Card">
                    ${renderEntityImage(itemImg, 'inventory', item.name, 36)}
                  </div>
                  <div>
                    <div class="primary-cell clickable-item-name" data-iid="${item.id}" style="cursor:pointer;color:var(--text-brand);text-decoration:underline;text-underline-offset:4px;" title="View Product Card">${item.name}</div>
                    <div class="sub-cell">Added ${formatDate(item.createdAt)}</div>
                  </div>
                </div>
              </td>
              <td data-label="SKU"><span style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${item.sku||'—'}</span></td>
              <td data-label="Category"><span class="badge badge-brand">${item.category}</span></td>
              <td data-label="Price"><strong style="color:var(--text-primary)">${formatCurrency(item.price||0)}</strong></td>
              <td data-label="Stock"><span class="badge ${stockClass}">${item.stock||0} ${item.unit||'pcs'}</span></td>
              <td data-label="Warehouse"><span class="badge badge-muted">${wh?.name||'—'}</span></td>
              ${showActions ? `<td data-label="Actions">
                <div class="table-actions">
                  ${hasEdit ? `
                    <button class="action-btn add-stock" data-iid="${item.id}" title="Add Stock" style="color:var(--accent-emerald)">${getSvgIcon('plus', 14)}</button>
                    <button class="action-btn edit" data-iid="${item.id}" title="Edit">${getSvgIcon('edit', 14)}</button>
                  ` : ''}
                  ${hasDelete ? `<button class="action-btn delete" data-iid="${item.id}" title="Delete">${getSvgIcon('trash', 14)}</button>` : ''}
                </div>
              </td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+it_PER_PAGE,total)} of ${total} items</div>
        <div class="pagination-controls">
          <button class="it_page-btn" id="ip-prev" ${it_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:it_pages},(_,i)=>`<button class="it_page-btn ${it_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="it_page-btn" id="ip-next" ${it_page>=it_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;
}

function renderItemsGridView(pageItems, whs, canEdit, container, start, total, it_pages) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:16px">
      ${pageItems.map(item => {
        const wh = whs.find(w=>w.id===item.warehouseId);
        const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 20;
        const healthStatus = item.healthStatus || ((item.stock || 0) === 0 ? 'Critical' : (item.stock || 0) < threshold ? 'Low Stock' : 'Healthy');
        const stockClass = healthStatus === 'Critical' ? 'badge-danger' : healthStatus === 'Low Stock' ? 'badge-warning' : 'badge-success';
        const itemImg = (item.images && item.images.length > 0) ? item.images[0] : '';
        return `
          <div class="card clickable-card" data-iid="${item.id}" style="padding:16px;display:flex;flex-direction:column;justify-content:space-between;transition:transform 0.15s,box-shadow 0.15s;cursor:pointer" 
               onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='var(--shadow-lg)'" 
               onmouseleave="this.style.transform='';this.style.boxShadow=''">
            <div>
              <div style="display:flex;justify-content:center;margin-bottom:12px;background:var(--bg-elevated);border-radius:6px;padding:8px">
                ${renderEntityImage(itemImg, 'inventory', item.name, 72)}
              </div>
              <div style="font-size:14px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
              <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin:4px 0">${item.sku||'—'}</div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
                <strong style="color:var(--text-primary);font-size:14px">${formatCurrency(item.price||0)}</strong>
                <span class="badge ${stockClass}">${item.stock||0} ${item.unit||'pcs'}</span>
              </div>
            </div>
            <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center">
              <span class="badge badge-brand" style="font-size:10px">${item.category}</span>
              <div style="display:flex;gap:6px">
                <button class="action-btn view profile-btn" data-iid="${item.id}" title="View Details" style="padding: 4px;">${getSvgIcon('view', 12)}</button>
                ${canDo('inventory', 'edit') ? `
                  <button class="action-btn edit" data-iid="${item.id}" title="Edit" style="padding: 4px;">${getSvgIcon('edit', 12)}</button>
                ` : ''}
                ${canDo('inventory', 'delete') ? `
                  <button class="action-btn delete" data-iid="${item.id}" title="Delete" style="padding: 4px;">${getSvgIcon('trash', 12)}</button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="table-pagination" style="margin-top: 16px;">
      <div class="pagination-info">Showing ${start+1}–${Math.min(start+it_PER_PAGE,total)} of ${total} items</div>
      <div class="pagination-controls">
        <button class="it_page-btn" id="ip-prev" ${it_page<=1?'disabled':''}>‹</button>
        ${Array.from({length:it_pages},(_,i)=>`<button class="it_page-btn ${it_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
        <button class="it_page-btn" id="ip-next" ${it_page>=it_pages?'disabled':''}>›</button>
      </div>
    </div>
  `;
}

function renderItemsCardView(pageItems, whs, canEdit, container, start, total, it_pages) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;margin-bottom:16px">
      ${pageItems.map(item => {
        const wh = whs.find(w=>w.id===item.warehouseId);
        const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 20;
        const healthStatus = item.healthStatus || ((item.stock || 0) === 0 ? 'Critical' : (item.stock || 0) < threshold ? 'Low Stock' : 'Healthy');
        const stockClass = healthStatus === 'Critical' ? 'badge-danger' : healthStatus === 'Low Stock' ? 'badge-warning' : 'badge-success';
        const itemImg = (item.images && item.images.length > 0) ? item.images[0] : '';
        const barcodeStr = item.barcode || item.sku || `ITEM-${item.id.slice(-6)}`;
        const barcodeSVG = generateBarcodeSVG(barcodeStr, { height: 30, showLabel: false });
        return `
          <div class="card clickable-card" data-iid="${item.id}" style="padding:0;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;transition:transform 0.15s,box-shadow 0.15s" 
               onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='var(--shadow-lg)'" 
               onmouseleave="this.style.transform='';this.style.boxShadow=''">
            <div>
              <div style="height: 180px; width: 100%; overflow: hidden; position: relative; background: var(--bg-elevated); display: flex; align-items: center; justify-content: center;">
                ${itemImg ? `<img src="${itemImg}" style="width: 100%; height: 100%; object-fit: cover;" alt="${item.name}" />` : `<div style="color: var(--text-muted);">${getSvgIcon('items', 48)}</div>`}
              </div>
              <div style="padding: 16px 16px 0 16px;">
                <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
                <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:12px">${item.sku||'—'}</div>
                
                <div style="display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--border-subtle);padding-top:10px;">
                  <div style="display:flex;justify-content:space-between;font-size:12px;">
                    <span style="color:var(--text-secondary)">Warehouse</span>
                    <strong style="color:var(--text-primary)">${wh?.name || '—'}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:12px;">
                    <span style="color:var(--text-secondary)">Category</span>
                    <strong style="color:var(--text-primary)">${item.category}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:12px;">
                    <span style="color:var(--text-secondary)">Price</span>
                    <strong style="color:var(--text-primary)">${formatCurrency(item.price||0)}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">
                    <span style="color:var(--text-secondary)">Stock Status</span>
                    <span class="badge ${stockClass}">${item.stock||0} ${item.unit||'pcs'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div style="padding: 12px 16px 16px 16px;">
              <!-- Barcode Display -->
              <div style="background:white;border-radius:4px;border:1px solid var(--border-subtle);padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;margin-bottom:12px;">
                <div style="width:100%;display:flex;justify-content:center;mix-blend-mode:multiply;">
                  ${barcodeSVG}
                </div>
                <span style="font-family:var(--font-mono);font-size:9px;color:#555;margin-top:2px;letter-spacing:1px">${barcodeStr}</span>
              </div>
              
              <!-- Actions -->
              <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border-subtle);padding-top:10px;">
                <button class="btn btn-secondary btn-xs clickable-card" data-iid="${item.id}" style="font-size:11px;">${getSvgIcon('view', 12)} View Details</button>
                <div style="display:flex;gap:6px">
                  ${canDo('inventory', 'edit') ? `
                    <button class="action-btn add-stock" data-iid="${item.id}" title="Add Stock" style="padding: 4px;color:var(--accent-emerald)">${getSvgIcon('plus', 12)}</button>
                    <button class="action-btn edit" data-iid="${item.id}" title="Edit" style="padding: 4px;">${getSvgIcon('edit', 12)}</button>
                  ` : ''}
                  ${canDo('inventory', 'delete') ? `
                    <button class="action-btn delete" data-iid="${item.id}" title="Delete" style="padding: 4px;">${getSvgIcon('trash', 12)}</button>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="table-pagination" style="margin-top: 16px;">
      <div class="pagination-info">Showing ${start+1}–${Math.min(start+it_PER_PAGE,total)} of ${total} items</div>
      <div class="pagination-controls">
        <button class="it_page-btn" id="ip-prev" ${it_page<=1?'disabled':''}>‹</button>
        ${Array.from({length:it_pages},(_,i)=>`<button class="it_page-btn ${it_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
        <button class="it_page-btn" id="ip-next" ${it_page>=it_pages?'disabled':''}>›</button>
      </div>
    </div>
  `;
}

function bindItemsEvents(container, it_pages) {
  const user = getCurrentUser();

  if (canDo('inventory', 'edit')) {
    container.querySelectorAll('.add-stock[data-iid]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = getItems().find(i => i.id === btn.dataset.iid);
        if (item) showAddStockModal(item);
      });
    });
    container.querySelectorAll('.edit[data-iid]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = getItems().find(i=>i.id===btn.dataset.iid);
        if (item) showItemModal(item);
      });
    });
  }
  if (canDo('inventory', 'delete')) {
    container.querySelectorAll('.delete[data-iid]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await confirm('Delete this item from inventory?', 'Delete Item');
        if (ok) {
          const res = await deleteItem(btn.dataset.iid);
          if (res && res.error) {
            showToast('Delete failed', res.error, 'error');
            return;
          }
          showToast('Item deleted','','success');
          renderItemStats();
          renderItemsTable();
        }
      });
    });
  }

  container.querySelectorAll('.clickable-item-name[data-iid], .clickable-card[data-iid]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('.edit') || e.target.closest('.delete') || e.target.closest('.btn')) {
        return;
      }
      const item = getItems().find(i => i.id === el.dataset.iid);
      if (item) showItemCardModal(item);
    });
  });

  container.querySelectorAll('.it_page-btn[data-pg]').forEach(btn => { 
    btn.addEventListener('click', () => { 
      it_page = parseInt(btn.dataset.pg); 
      renderItemsTable(); 
    }); 
  });
  
  container.querySelector('#ip-prev')?.addEventListener('click', () => { 
    if (it_page > 1) { 
      it_page--; 
      renderItemsTable(); 
    } 
  });
  
  container.querySelector('#ip-next')?.addEventListener('click', () => { 
    if (it_page < it_pages) { 
      it_page++; 
      renderItemsTable(); 
    } 
  });
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
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Warehouse <span class="req">*</span></label>
          <select id="m-i-wh" class="form-control" required>
            <option value="">Select warehouse</option>
            ${whs.map(w=>`<option value="${w.id}" ${item?.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Low Stock Alert Limit <span class="req">*</span></label>
          <input type="number" id="m-i-threshold" class="form-control" value="${item?.lowStockThreshold !== undefined ? item.lowStockThreshold : 20}" required min="1" />
        </div>
      </div>
      
      <!-- Product Media Gallery -->
      <div class="form-group" style="margin-top: 16px;">
        <label class="form-label">Product Media Gallery</label>
        <div class="item-media-gallery-container" style="border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 12px; background: var(--bg-card);">
          <!-- Thumbnail Grid -->
          <div class="item-media-grid" id="m-item-media-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; margin-bottom: 12px;">
            <!-- Rendered thumbnails will go here -->
          </div>
          
          <!-- Dropzone/Upload Button -->
          <div class="item-media-dropzone" style="border: 1.5px dashed var(--border-default); border-radius: var(--radius-sm); padding: 16px; text-align: center; cursor: pointer; background: var(--bg-elevated); transition: all 0.2s;" id="item-media-upload-trigger">
            <span style="color: var(--brand-500); display: block; margin-bottom: 4px;">${getSvgIcon('upload', 20)}</span>
            <span style="font-size: 12px; font-weight: 600; color: var(--text-primary);">Upload Product Images</span>
            <span style="font-size: 10px; color: var(--text-secondary); display: block; margin-top: 2px;">PNG, JPG, WebP up to 2MB (multiple allowed)</span>
            <input type="file" id="m-item-file-input" accept="image/*" multiple style="display:none;" />
          </div>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="m-i-cancel">Cancel</button>
    <button class="btn btn-primary" id="m-i-save">${isEdit?'Update':'Create'} Item</button>
  `;

  let selectedImages = item?.images ? [...item.images] : [];

  const modal = createModal({ title: isEdit ? 'Edit Item' : 'Add New Item', body, footer });

  function renderThumbnails() {
    const grid = modal.el.querySelector('#m-item-media-grid');
    if (!grid) return;
    if (selectedImages.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 16px; color: var(--text-muted); font-size: 11px;">No product images uploaded yet</div>`;
      return;
    }
    
    grid.innerHTML = selectedImages.map((img, index) => {
      return `
        <div class="item-media-thumb" style="position: relative; width: 80px; height: 80px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); overflow: hidden; background: var(--bg-elevated); display: flex; align-items: center; justify-content: center;" data-index="${index}">
          <img src="${img}" style="width: 100%; height: 100%; object-fit: cover;" />
          
          <div class="item-media-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; gap: 4px; opacity: 0; transition: opacity 0.15s; z-index: 2;">
            <button type="button" class="action-btn-sm move-left-btn" style="background: rgba(255,255,255,0.2); border: none; border-radius: 4px; color: white; width: 20px; height: 20px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;" title="Move Left" ${index === 0 ? 'disabled style="opacity:0.3;pointer-events:none;"' : ''}>←</button>
            <button type="button" class="action-btn-sm delete-thumb-btn" style="background: rgba(239,68,68,0.8); border: none; border-radius: 4px; color: white; width: 20px; height: 20px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;" title="Remove">×</button>
            <button type="button" class="action-btn-sm move-right-btn" style="background: rgba(255,255,255,0.2); border: none; border-radius: 4px; color: white; width: 20px; height: 20px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;" title="Move Right" ${index === selectedImages.length - 1 ? 'disabled style="opacity:0.3;pointer-events:none;"' : ''}>→</button>
          </div>
        </div>
      `;
    }).join('');

    const thumbs = grid.querySelectorAll('.item-media-thumb');
    thumbs.forEach(thumb => {
      thumb.addEventListener('mouseenter', () => {
        const overlay = thumb.querySelector('.item-media-overlay');
        if (overlay) overlay.style.opacity = '1';
      });
      thumb.addEventListener('mouseleave', () => {
        const overlay = thumb.querySelector('.item-media-overlay');
        if (overlay) overlay.style.opacity = '0';
      });

      const index = parseInt(thumb.dataset.index);
      thumb.querySelector('.delete-thumb-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedImages.splice(index, 1);
        renderThumbnails();
      });
      thumb.querySelector('.move-left-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index > 0) {
          const temp = selectedImages[index];
          selectedImages[index] = selectedImages[index - 1];
          selectedImages[index - 1] = temp;
          renderThumbnails();
        }
      });
      thumb.querySelector('.move-right-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index < selectedImages.length - 1) {
          const temp = selectedImages[index];
          selectedImages[index] = selectedImages[index + 1];
          selectedImages[index + 1] = temp;
          renderThumbnails();
        }
      });
    });
  }

  // Initial render
  renderThumbnails();

  const trigger = modal.el.querySelector('#item-media-upload-trigger');
  const fileInput = modal.el.querySelector('#m-item-file-input');
  
  trigger?.addEventListener('click', () => fileInput?.click());
  
  fileInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    let processedCount = 0;
    if (files.length === 0) return;

    files.forEach(file => {
      if (file.size > 2 * 1024 * 1024) {
        showToast('File too large', `Image "${file.name}" exceeds 2MB limit`, 'warning');
        processedCount++;
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        selectedImages.push(event.target.result);
        processedCount++;
        if (processedCount === files.length) {
          renderThumbnails();
        }
      };
      reader.readAsDataURL(file);
    });
  });

  modal.el.querySelector('#m-i-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#m-i-save')?.addEventListener('click', async () => {
    const name = document.getElementById('m-i-name').value.trim();
    const category = document.getElementById('m-i-cat').value;
    const price = parseFloat(document.getElementById('m-i-price').value);
    const stock = parseInt(document.getElementById('m-i-stock').value);
    const warehouseId = document.getElementById('m-i-wh').value;
    const lowStockThreshold = parseInt(document.getElementById('m-i-threshold').value);
    if (!name||!category||isNaN(price)||isNaN(stock)||!warehouseId||isNaN(lowStockThreshold)) { showToast('Validation','Fill all required fields','warning'); return; }
    
    const data = {
      name, category, price, stock, warehouseId,
      sku: document.getElementById('m-i-sku').value || `SKU-${Date.now()}`,
      unit: document.getElementById('m-i-unit').value,
      taxCategory: 'normal',
      images: selectedImages,
      lowStockThreshold
    };
    
    let res;
    if (isEdit) {
      res = await updateItem(item.id, data);
      if (res && res.error) { showToast('Error', res.error, 'error'); return; }
      showToast('Item updated',`${name} updated`,'success');
    } else {
      res = await createItem(data);
      if (res && res.error) { showToast('Error', res.error, 'error'); return; }
      showToast('Item added',`${name} added to inventory`,'success');
    }
    modal.close();
    renderItemStats();
    renderItemsTable();
  });
}

function showImportModal() {
  const body = `
    <div style="padding:16px">
      <div id="drag-drop-zone" style="border:2px dashed var(--border-default);border-radius:12px;padding:32px;text-align:center;cursor:pointer;background:rgba(99,102,241,0.02);transition:all 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="color:var(--brand-500);margin-bottom:12px">${getSvgIcon('upload', 36)}</div>
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
        <div style="font-size:12px;font-weight:700;color:var(--accent-rose);margin-bottom:8px;display:flex;align-items:center;gap:6px">${getSvgIcon('warning', 14)} Import Warnings/Errors:</div>
        <ul id="import-errors-list" style="font-size:11px;color:var(--text-muted);margin:0;padding-left:16px;line-height:1.6"></ul>
      </div>
      <div style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:8px;font-size:11px;color:var(--text-muted);display:flex;align-items:flex-start;gap:6px">
        <span style="color:var(--brand-500);flex-shrink:0;margin-top:1px">${getSvgIcon('info', 14)}</span>
        <span><strong>Expected columns:</strong> <code>name</code>, <code>sku</code>, <code>category</code>, <code>price</code>, <code>stock</code> (and optional <code>warehouseId</code>).</span>
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="import-cancel">Cancel</button>
    <button class="btn btn-primary" id="import-start-btn" disabled style="display:flex;align-items:center;gap:6px">${getSvgIcon('check', 14)} Upload & Import</button>
  `;

  const modal = createModal({ title: 'Bulk Import Inventory', body, footer });
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
    zone.querySelector('div:nth-child(2)').textContent = `Selected: ${file.name}`;
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
            syncWithBackend().then(() => {
              renderItemStats();
              renderItemsTable();
            });
          });
        } else {
          modal.close();
          // trigger parallel frontend sync
          syncWithBackend().then(() => {
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

function _handleInventoryStorageSync() {
  const user = getCurrentUser();
  if (!user) {
    window.removeEventListener('wareops_storage_sync', _handleInventoryStorageSync);
    return;
  }
  renderItemStats();
  renderItemsTable();
}

function showItemCardModal(item) {
  const whs = getWarehouses();
  const wh = whs.find(w => w.id === item.warehouseId);
  const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 20;
  const healthStatus = item.healthStatus || ((item.stock || 0) === 0 ? 'Critical' : (item.stock || 0) < threshold ? 'Low Stock' : 'Healthy');
  const stockClass = healthStatus === 'Critical' ? 'badge-danger' : healthStatus === 'Low Stock' ? 'badge-warning' : 'badge-success';
  const statusLabel = healthStatus;
  
  const images = item.images && item.images.length > 0 ? item.images : [];
  
  // Custom Sliding Carousel HTML
  let carouselHTML = '';
  if (images.length === 0) {
    carouselHTML = `
      <div style="width:100%;height:220px;border-radius:var(--radius-lg);background:var(--bg-elevated);border:1px solid var(--border-default);display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);">
        ${getSvgIcon('items', 48)}
        <span style="font-size:12px;margin-top:8px;">No product media available</span>
      </div>
    `;
  } else {
    carouselHTML = `
      <div class="item-carousel" style="position:relative;width:100%;height:220px;border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--border-default);background:black;">
        <!-- Slides -->
        <div class="carousel-slides" style="display:flex;width:100%;height:100%;transition:transform 0.3s ease-in-out;">
          ${images.map((img, i) => `
            <div class="carousel-slide" style="min-width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
              <img src="${img}" style="width:100%;height:100%;object-fit:contain;" />
            </div>
          `).join('')}
        </div>
        
        <!-- Chevron Controls (if >1 image) -->
        ${images.length > 1 ? `
          <button type="button" class="carousel-prev" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:none;border-radius:50%;color:white;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:bold;z-index:3;">‹</button>
          <button type="button" class="carousel-next" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:none;border-radius:50%;color:white;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:bold;z-index:3;">›</button>
          
          <!-- Indicator Dots -->
          <div class="carousel-dots" style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:3;">
            ${images.map((_, i) => `
              <div class="carousel-dot ${i===0?'active':''}" data-slide="${i}" style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.4);cursor:pointer;transition:all 0.2s;"></div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  const barcodeStr = item.barcode || item.sku || `ITEM-${item.id.slice(-6)}`;

  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:8px;" class="item-card-grid">
      <!-- Media/Gallery Slide Column -->
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${carouselHTML}
        <!-- Specs Highlights -->
        <div style="padding:12px;background:var(--bg-input);border-radius:var(--radius-md);border:1px solid var(--border-default);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;font-weight:700;">Status</span>
            <span class="badge ${stockClass}" style="display:block;margin-top:4px;">${statusLabel}</span>
          </div>
          <div style="text-align:right;">
            <span style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;font-weight:700;">Stock Valuation</span>
            <strong style="display:block;font-size:14px;color:var(--text-primary);margin-top:4px;">${formatCurrency((item.price||0)*(item.stock||0))}</strong>
          </div>
        </div>
      </div>
      
      <!-- Specifications & Details Column -->
      <div style="display:flex;flex-direction:column;gap:16px;justify-content:space-between;">
        <div>
          <h2 style="font-size:20px;font-weight:800;color:var(--text-primary);margin:0 0 4px 0;">${item.name}</h2>
          <span style="font-size:12px;color:var(--text-brand);font-weight:600;display:inline-block;margin-bottom:12px;">Category: ${item.category}</span>
          
          <div style="display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--border-default);padding-top:12px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-secondary)">SKU Code</span>
              <strong style="color:var(--text-primary);font-family:var(--font-mono);">${item.sku || '—'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-secondary)">Unit Value</span>
              <strong style="color:var(--text-primary);">${formatCurrency(item.price||0)} / ${item.unit||'pcs'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-secondary)">Total Qty</span>
              <strong style="color:var(--text-primary);">${item.stock||0} ${item.unit||'pcs'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-secondary)">Low Stock Alert Limit</span>
              <strong style="color:var(--text-primary);">${threshold} ${item.unit||'pcs'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-secondary)">Assigned Hub</span>
              <strong style="color:var(--text-primary);">${wh?.name || '—'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-secondary)">Created Date</span>
              <strong style="color:var(--text-primary);">${formatDate(item.createdAt)}</strong>
            </div>
          </div>
        </div>
        
        <!-- Live Scannable Barcode SVG Block -->
        <div style="padding:12px;background:white;border-radius:var(--radius-md);border:1px solid var(--border-default);display:flex;flex-direction:column;align-items:center;justify-content:center;margin-top:12px;">
          <img src="http://localhost:8000/api/v1/registry/barcode?code=${barcodeStr}" style="height:45px;max-width:100%;mix-blend-mode:multiply;" title="Item Barcode" />
          <span style="font-family:var(--font-mono);font-size:10px;color:#555;margin-top:4px;letter-spacing:1.5px;">${barcodeStr}</span>
        </div>
      </div>
    </div>
  `;

  const footer = `<button class="btn btn-secondary" id="item-card-close" style="width:100%">Close Card</button>`;

  const modal = createModal({ title: 'Inventory Item Card', body, footer, size: 'medium' });
  modal.el.querySelector('#item-card-close')?.addEventListener('click', modal.close);

  // Wire up sliding carousel events
  if (images.length > 1) {
    const slides = modal.el.querySelector('.carousel-slides');
    const dots = modal.el.querySelectorAll('.carousel-dot');
    let currentIdx = 0;

    const updateCarousel = (idx) => {
      currentIdx = idx;
      slides.style.transform = `translateX(-${currentIdx * 100}%)`;
      dots.forEach((dot, dIdx) => {
        if (dIdx === currentIdx) {
          dot.style.background = 'white';
          dot.style.transform = 'scale(1.2)';
        } else {
          dot.style.background = 'rgba(255,255,255,0.4)';
          dot.style.transform = 'scale(1)';
        }
      });
    };

    modal.el.querySelector('.carousel-prev')?.addEventListener('click', () => {
      let idx = currentIdx - 1;
      if (idx < 0) idx = images.length - 1;
      updateCarousel(idx);
    });

    modal.el.querySelector('.carousel-next')?.addEventListener('click', () => {
      let idx = currentIdx + 1;
      if (idx >= images.length) idx = 0;
      updateCarousel(idx);
    });

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        updateCarousel(idx);
      });
      // Initial style positioning
      if (idx === 0) {
        dot.style.background = 'white';
        dot.style.transform = 'scale(1.2)';
      }
    });
  }
}

export function showBarcodeGenerationModal() {
  const whs = getWarehouses();
  const user = getCurrentUser();
  const items = getStore().items || [];

  const body = `
    <form id="barcode-gen-form" style="display:flex;flex-direction:column;gap:16px">
      <div class="form-group">
        <label class="form-label" style="font-weight:600;margin-bottom:8px">Generation Mode</label>
        <div style="display:flex;gap:16px;margin-bottom:8px">
          <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <input type="radio" name="gen-mode" value="existing" checked style="accent-color:var(--brand-500)" />
            Existing Inventory Item
          </label>
          <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <input type="radio" name="gen-mode" value="new" style="accent-color:var(--brand-500)" />
            Register New Item
          </label>
        </div>
      </div>

      <!-- Existing Item Section -->
      <div id="gen-existing-section" class="form-group">
        <label class="form-label">Select Inventory Item <span class="req">*</span></label>
        <select id="gen-item-select" class="form-control" style="width:100%" required>
          <option value="">-- Choose Item --</option>
          ${items.map(i => `<option value="${i.id}">${i.name} (${i.sku || 'No SKU'}) - Stock: ${i.stock}</option>`).join('')}
        </select>
        <div id="gen-item-info" style="margin-top:10px;padding:10px;border-radius:6px;background:var(--bg-elevated);border:1px solid var(--border-subtle);display:none;font-size:12px;"></div>
      </div>

      <!-- New Item Section (Hidden by default) -->
      <div id="gen-new-section" style="display:none;flex-direction:column;gap:12px;border:1px solid var(--border-subtle);padding:14px;border-radius:8px;background:var(--bg-elevated)">
        <div style="font-weight:600;font-size:13px;color:var(--brand-500);margin-bottom:4px">New Catalog Item Details</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Item Name <span class="req">*</span></label>
            <input type="text" id="gen-new-name" class="form-control" />
          </div>
          <div class="form-group">
            <label class="form-label">SKU</label>
            <input type="text" id="gen-new-sku" class="form-control" placeholder="Auto-generated if empty" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category <span class="req">*</span></label>
            <select id="gen-new-cat" class="form-control">
              ${CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Price ($) <span class="req">*</span></label>
            <input type="number" id="gen-new-price" class="form-control" min="0" step="0.01" value="0.00" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Unit</label>
            <select id="gen-new-unit" class="form-control">
              ${['pcs','kg','lbs','box','pallet','set','m','ft'].map(u=>`<option value="${u}">${u}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tax Category</label>
            <select id="gen-new-tax" class="form-control">
              <option value="normal">Normal</option>
              <option value="reduced">Reduced</option>
              <option value="exempt">Exempt</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Warehouse Partition <span class="req">*</span></label>
          <select id="gen-new-wh" class="form-control">
            <option value="">Select warehouse</option>
            ${whs.map(w=>`<option value="${w.id}" ${user.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Quantity Field -->
      <div class="form-group">
        <label class="form-label">Quantity to Generate (Max 50) <span class="req">*</span></label>
        <input type="number" id="gen-qty" class="form-control" value="10" min="1" max="50" required />
        <span id="gen-qty-hint" style="font-size:11px;color:var(--text-muted);margin-top:4px;display:block">This will generate 10 unique serial codes, register them in the registry tracker ledger, and increase the item stock count by 10.</span>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="gen-cancel-btn">Cancel</button>
    <button class="btn btn-primary" id="gen-submit-btn" style="display:inline-flex;align-items:center;gap:6px">
      ${getSvgIcon('export', 14)} Generate Barcodes
    </button>
  `;

  const modal = createModal({ title: 'Batch Generate Barcodes & Sync Stock', body, footer });

  // Bind change listeners to update item details and quantity hint dynamically
  const itemSelectEl = modal.el.querySelector('#gen-item-select');
  const itemInfoEl = modal.el.querySelector('#gen-item-info');
  const qtyInputEl = modal.el.querySelector('#gen-qty');
  const qtyHintEl = modal.el.querySelector('#gen-qty-hint');

  itemSelectEl?.addEventListener('change', () => {
    const selectedItem = items.find(i => i.id === itemSelectEl.value);
    if (selectedItem) {
      itemInfoEl.style.display = 'block';
      itemInfoEl.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div><span style="color:var(--text-secondary)">SKU:</span> <strong style="font-family:var(--font-mono)">${selectedItem.sku || '—'}</strong></div>
          <div><span style="color:var(--text-secondary)">Current Stock:</span> <strong>${selectedItem.stock} ${selectedItem.unit || 'pcs'}</strong></div>
          <div><span style="color:var(--text-secondary)">Unit Price:</span> <strong>${formatCurrency(selectedItem.price || 0)}</strong></div>
          <div><span style="color:var(--text-secondary)">Category:</span> <strong>${selectedItem.category}</strong></div>
        </div>
      `;
    } else {
      itemInfoEl.style.display = 'none';
      itemInfoEl.innerHTML = '';
    }
  });

  qtyInputEl?.addEventListener('input', () => {
    const val = parseInt(qtyInputEl.value) || 0;
    qtyHintEl.textContent = `This will generate ${val} unique serial codes, register them in the registry tracker ledger, and increase the item stock count by ${val}.`;
  });

  // Toggle Mode Listeners
  modal.el.querySelectorAll('input[name="gen-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = e.target.value;
      const existingSec = modal.el.querySelector('#gen-existing-section');
      const newSec = modal.el.querySelector('#gen-new-section');
      const itemSelect = modal.el.querySelector('#gen-item-select');
      
      const newName = modal.el.querySelector('#gen-new-name');
      const newWh = modal.el.querySelector('#gen-new-wh');

      if (mode === 'existing') {
        existingSec.style.display = 'block';
        newSec.style.display = 'none';
        itemSelect.setAttribute('required', 'true');
        newName.removeAttribute('required');
        newWh.removeAttribute('required');
      } else {
        existingSec.style.display = 'none';
        newSec.style.display = 'flex';
        itemSelect.removeAttribute('required');
        newName.setAttribute('required', 'true');
        newWh.setAttribute('required', 'true');
      }
    });
  });

  // Cancel Button
  modal.el.querySelector('#gen-cancel-btn').addEventListener('click', () => modal.close());

  // Form Submission
  modal.el.querySelector('#gen-submit-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    const form = modal.el.querySelector('#barcode-gen-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const genMode = modal.el.querySelector('input[name="gen-mode"]:checked').value;
    const qty = parseInt(modal.el.querySelector('#gen-qty').value);
    
    if (isNaN(qty) || qty < 1 || qty > 50) {
      showToast('Validation Error', 'Quantity must be between 1 and 50.', 'warning');
      return;
    }

    const submitBtn = modal.el.querySelector('#gen-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating...';

    const payload = {
      quantity: qty,
      itemId: null,
      newItem: null
    };

    if (genMode === 'existing') {
      payload.itemId = modal.el.querySelector('#gen-item-select').value;
    } else {
      payload.newItem = {
        name: modal.el.querySelector('#gen-new-name').value.trim(),
        sku: modal.el.querySelector('#gen-new-sku').value.trim() || null,
        category: modal.el.querySelector('#gen-new-cat').value,
        price: parseFloat(modal.el.querySelector('#gen-new-price').value) || 0,
        stock: 0,
        unit: modal.el.querySelector('#gen-new-unit').value,
        taxCategory: modal.el.querySelector('#gen-new-tax').value,
        warehouseId: modal.el.querySelector('#gen-new-wh').value
      };
    }

    const res = await apiFetch('/items/generate-barcodes', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res?.success) {
      showToast('Barcodes Generated', `Successfully generated ${qty} barcodes and synced stock level.`, 'success');
      modal.close();
      await syncWithBackend();
      await renderItems();
    } else {
      showToast('Error', res?.error || 'Failed to generate barcodes.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${getSvgIcon('export', 14)} Generate Barcodes`;
    }
  });
}
window.showBarcodeGenerationModal = showBarcodeGenerationModal;

export function showAddStockModal(item) {
  const body = `
    <form id="add-stock-modal-form" style="display:flex;flex-direction:column;gap:16px">
      <div style="background:var(--bg-elevated);border-left:4px solid var(--brand-500);padding:12px;border-radius:0 6px 6px 0">
        <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;font-weight:700">Target Item</div>
        <div style="font-weight:800;font-size:15px;color:var(--text-primary);margin-top:2px">${item.name}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px;font-size:12px">
          <div><span style="color:var(--text-muted)">SKU:</span> <strong style="font-family:var(--font-mono)">${item.sku || '—'}</strong></div>
          <div><span style="color:var(--text-muted)">Current Stock:</span> <strong>${item.stock} ${item.unit || 'pcs'}</strong></div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" style="font-weight:600">Quantity to Add <span class="req">*</span></label>
        <input type="number" id="stock-qty-add" class="form-control" min="1" required placeholder="Enter positive number..." />
      </div>
      <div class="form-group">
        <label class="form-label" style="font-weight:600">Adjustment Notes / Reason</label>
        <textarea id="stock-notes" class="form-control" style="resize:vertical;min-height:80px" placeholder="Optional audit trail note (e.g. Restock delivery, supplier check)..."></textarea>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="add-stock-cancel">Cancel</button>
    <button class="btn btn-primary" id="add-stock-submit" style="display:inline-flex;align-items:center;gap:6px">
      ${getSvgIcon('check', 14)} Adjust Stock
    </button>
  `;

  const modal = createModal({ title: 'Add Inventory Stock', body, footer });

  modal.el.querySelector('#add-stock-cancel').addEventListener('click', () => modal.close());

  modal.el.querySelector('#add-stock-submit').addEventListener('click', async (e) => {
    e.preventDefault();
    const qtyInput = modal.el.querySelector('#stock-qty-add');
    const notesInput = modal.el.querySelector('#stock-notes');
    
    if (!qtyInput.checkValidity()) {
      qtyInput.reportValidity();
      return;
    }
    
    const qty = parseInt(qtyInput.value) || 0;
    if (qty <= 0) {
      showToast('Validation Error', 'Quantity must be a positive number greater than 0.', 'warning');
      return;
    }
    
    const newStock = item.stock + qty;
    const notes = notesInput.value.trim() || 'Manual stock intake';
    
    const submitBtn = modal.el.querySelector('#add-stock-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';
    
    const res = await updateItem(item.id, {
      ...item,
      stock: newStock
    });
    
    if (res && res.error) {
      showToast('Error', res.error, 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${getSvgIcon('check', 14)} Adjust Stock`;
      return;
    }
    
    const user = getCurrentUser();
    addAuditLog('stock_adjust', `Added ${qty} units to ${item.name} (New Stock: ${newStock}). Reason: ${notes}`, user.id);
    
    showToast('Stock Updated', `Successfully added ${qty} units to ${item.name}.`, 'success');
    modal.close();
    renderItemStats();
    renderItemsTable();
  });
}
window.showAddStockModal = showAddStockModal;


