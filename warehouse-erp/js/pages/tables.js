/**
 * WareOps ERP — Dynamic Tables Spreadsheet Workspace
 * Airtable / Notion style inline-editable grid with realtime collaboration
 */
import {
  getCurrentUser, getWarehouses, apiFetch, sendWebSocketMessage, addAuditLog, getStore
} from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, confirm, createModal, formatDate, capitalize, debounce, getSvgIcon, renderAvatar, generateBarcodeSVG } from '../modules/ui.js';
import { navigate } from '../modules/router.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const COLUMN_TYPES   = ['text','number','date','dropdown','checkbox','price','tags','status'];
const CATEGORY_OPTS  = ['Operations','HR','Finance','Inventory','Sales','Logistics','Custom'];
const HEADER_COLORS  = ['#6366f1','#06b6d4','#10b981','#f59e0b','#f43f5e','#8b5cf6','#ec4899','#64748b'];
const VIRTUAL_ROWS   = 80;   // empty ghost rows below real data
const SAVE_DEBOUNCE  = 800;  // ms before auto-save fires

// ─── Module-level state ────────────────────────────────────────────────────────
let _activeTableId   = null;   // which table is open
let _schema          = null;   // loaded schema object
let _rows            = [];     // loaded row array
let _wsRef           = null;   // WebSocket reference (shared with store.js ws)
let _savingRows      = new Set();       // rowIds currently being saved
let _lockedRows      = new Map();       // rowId → { userId, userName } — locked by another user
let _pendingCells    = new Map();       // `${rowIndex}:${colId}` → cellEl — dirty cells
let _debounceSavers  = new Map();       // rowIndex → debounced save fn
let _activePage      = 1;      // active page tracking

// NexWare Upgrade Module States
let _columnWidths      = {};
let _sidebarCollapsed  = false;
let _selectedCell      = null;
let _undoStack         = [];
let _redoStack         = [];
let _cellFormats       = new Map(); // `${rowId}:${colId}` -> format styles
let _cellPreValue      = null;
let _lastSavedTime     = Date.now();
let _isOffline         = false;
let _saveStatusInterval= null;
let _pendingSaveRows   = new Set();

// Central Registry dynamic filters
let _registrySearchQ   = '';
let _registryTypeFilter = '';
let _registryWhFilter   = '';


// ─── Entry point ──────────────────────────────────────────────────────────────
export async function renderTables() {
  const user     = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }

  // Parse deep-linked table ID from hash query parameters if present
  const hash = window.location.hash;
  const match = hash.match(/[?&]id=([^&]+)/);
  if (match && match[1]) {
    _activeTableId = decodeURIComponent(match[1]);
  } else {
    _activeTableId = null;
  }

  const whs      = getWarehouses();
  const canManage = ['super_admin','admin'].includes(user.role);

  // Auto-seed system tables on list view entry
  if (!_activeTableId && canManage) {
    await _ensureSystemTables();
  }

  if (_activeTableId) {
    // ── Spreadsheet workspace ──
    await _openSpreadsheet(user, canManage);
  } else {
    // ── Table list view ──
    await _renderTableList(user, whs, canManage);
  }
}

// ─── TABLE LIST ───────────────────────────────────────────────────────────────
async function _renderTableList(user, whs, canManage) {
  // Fetch schemas from backend
  const res = await apiFetch('/dynamic-tables/');
  let schemas = (res?.success && Array.isArray(res.data)) ? res.data : [];

  // Role-based schema filtering: non-admins only see tables assigned to their role
  if (!canManage) {
    schemas = schemas.filter(t => {
      if (!t.roles || t.roles.length === 0) return true; // no restriction = visible to all
      return t.roles.includes(user.role);
    });
  }


  const canEdit = ['super_admin','admin','manager'].includes(user.role);

  renderShell('Tables', 'Dynamic table builder and spreadsheet workspace', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Table Builder</h1>
          <p class="page-subtitle">Airtable-style inline spreadsheet workspaces</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canEdit ? `<button class="btn btn-secondary btn-sm" id="generate-barcodes-btn-tbl">Generate Barcodes</button>` : ''}
          ${canManage ? `<button class="btn btn-primary" id="create-tbl-btn">+ New Table</button>` : ''}
        </div>
      </div>

      ${schemas.length === 0 ? `
        <div class="card" style="text-align:center;padding:80px 40px">
          <div style="font-size:48px;margin-bottom:20px;opacity:0.4;display:flex;justify-content:center;color:var(--text-muted)">${getSvgIcon('tables', 48)}</div>
          <h2 style="color:var(--text-secondary);margin-bottom:8px">No tables yet</h2>
          <p style="color:var(--text-muted);font-size:14px;margin-bottom:28px">Create your first table and start tracking data like a spreadsheet</p>
          ${canManage ? `<button class="btn btn-primary" id="create-tbl-btn-empty">+ Create First Table</button>` : ''}
        </div>
      ` : `
        <div class="table-toolbar" style="margin-bottom:16px">
          <div class="table-search"><span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span><input type="text" id="tbl-search" placeholder="Search tables..." /></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Table Name</th><th>Category</th><th>Warehouse</th>
              <th>Columns</th><th>Access Users</th><th>Created</th><th>Actions</th>
            </tr></thead>
            <tbody id="tbl-list-body">
              ${schemas.map(t => {
                const wh = whs.find(w => w.id === t.warehouseId);
                return `<tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <div style="width:32px;height:32px;border-radius:8px;background:${t.headerColor||'#6366f1'};display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0">
                        ${getSvgIcon('tables', 16)}
                      </div>
                      <div>
                        <div class="primary-cell">${t.name}</div>
                        <div class="sub-cell">${t.description||'No description'}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="badge badge-brand">${t.category||'—'}</span></td>
                  <td><span class="badge badge-info">${wh?.name||'All Warehouses'}</span></td>
                  <td>${(t.columns||[]).length} cols</td>
                  <td>${_renderAccessUsersStack(t)}</td>
                  <td>${formatDate(t.createdAt)}</td>
                  <td>
                    <div class="table-actions">
                      <button class="action-btn view" data-tid="${t.id}" title="Open Spreadsheet">${getSvgIcon('analytics', 14)}</button>
                      ${canManage ? `<button class="action-btn edit" data-tid="${t.id}" title="Edit Schema">${getSvgIcon('edit', 14)}</button>` : ''}
                      ${canManage ? `<button class="action-btn delete" data-tid="${t.id}" title="Delete">${getSvgIcon('trash', 14)}</button>` : ''}
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `);

  // Events
  document.getElementById('create-tbl-btn')?.addEventListener('click', () => _showSchemaModal(null, whs));
  document.getElementById('create-tbl-btn-empty')?.addEventListener('click', () => _showSchemaModal(null, whs));
  document.getElementById('generate-barcodes-btn-tbl')?.addEventListener('click', () => {
    if (typeof window.showBarcodeGenerationModal === 'function') {
      window.showBarcodeGenerationModal();
    } else {
      showToast('Error', 'Barcode module not loaded.', 'error');
    }
  });
  document.getElementById('tbl-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#tbl-list-body tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  document.querySelectorAll('.action-btn.view[data-tid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      _activePage = 1;
      window.location.hash = '#/tables?id=' + encodeURIComponent(btn.dataset.tid);
    });
  });
  document.querySelectorAll('.action-btn.edit[data-tid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = await apiFetch(`/dynamic-tables/`);
      const s = r?.data?.find(t => t.id === btn.dataset.tid);
      if (s) _showSchemaModal(s, whs);
    });
  });
  document.querySelectorAll('.action-btn.delete[data-tid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirm('Delete this table and all its data permanently?', 'Delete Table');
      if (!ok) return;
      const r = await apiFetch(`/dynamic-tables/${btn.dataset.tid}`, { method: 'DELETE' });
      if (r?.success) { showToast('Table deleted', '', 'success'); await renderTables(); }
      else showToast('Error', r?.error || 'Delete failed', 'error');
    });
  });
}

// ─── SPREADSHEET WORKSPACE ────────────────────────────────────────────────────
// ─── SPREADSHEET WORKSPACE ────────────────────────────────────────────────────
async function _openSpreadsheet(user, canManage) {
  const whs = getWarehouses();
  // Fetch schema + rows
  let schema = null;
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}`);
  if (res?.success) {
    schema = res.data;
  } else {
    const schemaRes = await apiFetch(`/dynamic-tables/`);
    if (schemaRes?.success && Array.isArray(schemaRes.data)) {
      schema = schemaRes.data.find(t => t.id === _activeTableId) || null;
      if (!schema) {
        schema = schemaRes.data.find(t => t.name === _activeTableId || t.name?.toLowerCase() === _activeTableId.toLowerCase()) || null;
      }
    }
  }
  _schema = schema;

  if (!_schema) {
    showToast('Error', 'Table not found', 'error');
    _activeTableId = null;
    await renderTables();
    return;
  }

  // Canonicalize the active table ID and URL hash to use the actual resolved ID
  if (_activeTableId !== _schema.id) {
    _activeTableId = _schema.id;
    window.location.hash = `#/tables?id=${encodeURIComponent(_activeTableId)}`;
  }

  // Enforce role-based access on schema open
  if (!canManage && _schema.roles && _schema.roles.length > 0) {
    if (!_schema.roles.includes(user.role)) {
      showToast('Access Denied', `You don't have permission to access this table`, 'error');
      _activeTableId = null;
      await renderTables();
      return;
    }
  }

  let url = `/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`;
  if (_activeTableId === 'central_registry') {
    if (_registrySearchQ) url += `&search=${encodeURIComponent(_registrySearchQ)}`;
    if (_registryTypeFilter) url += `&entityType=${encodeURIComponent(_registryTypeFilter)}`;
    if (_registryWhFilter) url += `&warehouseId=${encodeURIComponent(_registryWhFilter)}`;
  }
  const rowsRes = await apiFetch(url);
  _rows = (rowsRes?.success && Array.isArray(rowsRes.data)) ? rowsRes.data : [];

  const isRegistry = _activeTableId === 'central_registry';
  const canEdit   = ['super_admin','admin','manager','staff'].includes(user.role) && !isRegistry;
  const canImport = ['super_admin','admin','manager'].includes(user.role) && !isRegistry;
  const cols      = _schema.columns || [];
  const headerColor = _schema.headerColor || '#6366f1';

  // Resolve metadata values
  const accessUsers = _getAccessUsers(_schema);
  const ownerUser = getStore().users.find(u => u.id === _schema.createdBy) || { name: 'System' };
  const ownerName = ownerUser.name;
  
  // Total storage usage estimation
  const totalStorage = _schema.pages ? _schema.pages.reduce((acc, p) => acc + (p.storage_usage || 0), 0) : 0;

  renderShell(_schema.name, `Spreadsheet Workspace · ${_rows.length} rows · ${cols.length} columns`, `
    <div class="animate-slideUp" id="spreadsheet-workspace">
      <!-- Layout Header -->
      <div class="page-header" style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div class="page-header-left" style="display:flex;align-items:center;gap:10px">
          <button class="btn btn-secondary btn-sm" id="ss-back">← All Tables</button>
          <h1 class="page-title" style="margin:0;font-size:18px;display:flex;align-items:center;gap:8px">
            <span style="color:${headerColor};display:flex;align-items:center">${getSvgIcon('tables', 18)}</span>
            <span>${_schema.name}</span>
          </h1>
          <span class="badge badge-brand">${_schema.category}</span>
        </div>

        ${isRegistry ? `
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div class="table-search" style="max-width:200px;margin:0">
              <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 14)}</span>
              <input type="text" id="ss-grid-search" placeholder="Search ID, barcode..." value="${_registrySearchQ || ''}" />
            </div>
            <select class="form-control" style="width:auto;padding:4px 8px;font-size:12px;height:30px;border-radius:6px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle)" id="ss-registry-type-filter">
              <option value="">All Types</option>
              <option value="invoice" ${_registryTypeFilter === 'invoice' ? 'selected' : ''}>Invoices (INV)</option>
              <option value="warehouse" ${_registryTypeFilter === 'warehouse' ? 'selected' : ''}>Warehouses (WH)</option>
              <option value="employee" ${_registryTypeFilter === 'employee' ? 'selected' : ''}>Workforce (EMP)</option>
              <option value="inventory" ${_registryTypeFilter === 'inventory' ? 'selected' : ''}>Inventory (ITEM)</option>
              <option value="table_registry" ${_registryTypeFilter === 'table_registry' ? 'selected' : ''}>Operational Tables (TBL)</option>
              <option value="customer" ${_registryTypeFilter === 'customer' ? 'selected' : ''}>CRM Customers (CUST)</option>
            </select>
            ${user.role === 'super_admin' ? `
              <select class="form-control" style="width:auto;padding:4px 8px;font-size:12px;height:30px;border-radius:6px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle)" id="ss-registry-wh-filter">
                <option value="">All Warehouses</option>
                <option value="Global" ${_registryWhFilter === 'Global' ? 'selected' : ''}>Global Scoped</option>
                ${whs.map(w => `<option value="${w.id}" ${_registryWhFilter === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
              </select>
            ` : ''}
          </div>
        ` : `
          <div class="table-search" style="max-width:240px;margin:0">
            <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 14)}</span>
            <input type="text" id="ss-grid-search" placeholder="Search rows..." />
          </div>
        `}

        <div class="page-header-actions" style="display:flex;align-items:center;gap:8px">
          ${isRegistry ? `
            <button class="btn btn-primary btn-sm" id="ss-print-barcodes-btn" style="display:flex;align-items:center;gap:4px">
              ${getSvgIcon('export', 14)} Print Barcodes
            </button>
          ` : `
            <div id="ss-save-status-container" style="display:inline-flex;align-items:center;gap:6px;font-size:12px">
              <span id="ss-save-status-indicator" class="badge badge-success">Saved just now</span>
              <button class="btn btn-primary btn-sm" id="ss-save-now-btn" style="padding:4px 8px;font-size:11px;font-weight:600">Save</button>
            </div>
            <button class="btn btn-secondary btn-sm" id="ss-toggle-sidebar" style="display:flex;align-items:center;gap:4px">
              ${getSvgIcon('info', 14)} Details
            </button>
            ${canEdit ? `<button class="btn btn-secondary btn-sm" id="ss-scan-btn" style="display:flex;align-items:center;gap:4px">${getSvgIcon('search', 14)} Scan Entity</button>` : ''}
          `}
        </div>
      </div>

      <!-- Google Sheets-style drop-down menus -->
      <div class="ss-toolbar-menus">
        <div class="ss-menu-item">
          <button class="ss-menu-btn">File</button>
          <div class="ss-menu-dropdown">
            ${canManage ? `<button class="ss-menu-dropdown-item" id="menu-file-new">New Spreadsheet</button>` : ''}
            ${canImport ? `<button class="ss-menu-dropdown-item" id="menu-file-import">Import</button>` : ''}
            <button class="ss-menu-dropdown-item" id="menu-file-export">Download</button>
            <button class="ss-menu-dropdown-item" id="menu-file-copy">Make a copy</button>
            <button class="ss-menu-dropdown-item" id="menu-file-share">Share</button>
            <button class="ss-menu-dropdown-item" id="menu-file-rename">Rename</button>
            ${canManage ? `<button class="ss-menu-dropdown-item" id="menu-file-bin">Move to bin</button>` : ''}
            <button class="ss-menu-dropdown-item" id="menu-file-history">Version history</button>
          </div>
        </div>

        <div class="ss-menu-item">
          <button class="ss-menu-btn">Edit</button>
          <div class="ss-menu-dropdown">
            <button class="ss-menu-dropdown-item" id="menu-edit-undo">Undo <span style="font-size:10px;color:var(--text-muted)">Ctrl+Z</span></button>
            <button class="ss-menu-dropdown-item" id="menu-edit-redo">Redo <span style="font-size:10px;color:var(--text-muted)">Ctrl+Y</span></button>
            <button class="ss-menu-dropdown-item" id="menu-edit-find">Find and replace</button>
          </div>
        </div>

        <div class="ss-menu-item">
          <button class="ss-menu-btn">View</button>
          <div class="ss-menu-dropdown">
            <button class="ss-menu-dropdown-item" id="menu-view-formula">Formula bar toggle</button>
            <button class="ss-menu-dropdown-item" id="menu-view-gridlines">Gridline toggle</button>
            <button class="ss-menu-dropdown-item ss-zoom-opt" data-zoom="0.5">Zoom 50%</button>
            <button class="ss-menu-dropdown-item ss-zoom-opt" data-zoom="0.75">Zoom 75%</button>
            <button class="ss-menu-dropdown-item ss-zoom-opt" data-zoom="1">Zoom 100%</button>
            <button class="ss-menu-dropdown-item ss-zoom-opt" data-zoom="1.25">Zoom 125%</button>
            <button class="ss-menu-dropdown-item ss-zoom-opt" data-zoom="1.5">Zoom 150%</button>
            <div class="ss-menu-dropdown-divider"></div>
            <button class="ss-menu-dropdown-item" id="menu-view-fullscreen">Toggle Fullscreen</button>
          </div>
        </div>

        <div class="ss-menu-item">
          <button class="ss-menu-btn">Insert</button>
          <div class="ss-menu-dropdown">
            <button class="ss-menu-dropdown-item" id="menu-insert-row">Row</button>
            ${canManage ? `<button class="ss-menu-dropdown-item" id="menu-insert-col">Column</button>` : ''}
            <button class="ss-menu-dropdown-item" id="menu-insert-image">Image</button>
            <button class="ss-menu-dropdown-item" id="menu-insert-link">Link</button>
            <button class="ss-menu-dropdown-item" id="menu-insert-comment">Comment</button>
            <div class="ss-menu-dropdown-divider"></div>
            <button class="ss-menu-dropdown-item ss-func-opt" data-func="SUM">Function: SUM</button>
            <button class="ss-menu-dropdown-item ss-func-opt" data-func="AVERAGE">Function: AVERAGE</button>
            <button class="ss-menu-dropdown-item ss-func-opt" data-func="MIN">Function: MIN</button>
            <button class="ss-menu-dropdown-item ss-func-opt" data-func="MAX">Function: MAX</button>
          </div>
        </div>

        <div class="ss-menu-item">
          <button class="ss-menu-btn">Format</button>
          <div class="ss-menu-dropdown">
            <button class="ss-menu-dropdown-item" id="menu-fmt-bold">Bold</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-italic">Italic</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-underline">Underline</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-strike">Strikethrough</button>
            <div class="ss-menu-dropdown-divider"></div>
            <button class="ss-menu-dropdown-item" id="menu-fmt-currency">Currency ($)</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-percent">Percentage (%)</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-dec-inc">Increase Decimals</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-dec-dec">Decrease Decimals</button>
          </div>
        </div>
      </div>

      <!-- Quick formatting bar -->
      <div class="ss-format-bar">
        <button class="ss-format-btn" id="fmt-bold" title="Bold" style="font-weight:bold">B</button>
        <button class="ss-format-btn" id="fmt-italic" title="Italic" style="font-style:italic">I</button>
        <button class="ss-format-btn" id="fmt-underline" title="Underline" style="text-decoration:underline">U</button>
        <button class="ss-format-btn" id="fmt-strike" title="Strikethrough" style="text-decoration:line-through">S</button>
        
        <div class="ss-format-divider"></div>
        
        <select class="ss-format-select" id="fmt-align" title="Text Alignment">
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>

        <select class="ss-format-select" id="fmt-size" title="Font Size">
          <option value="11px">11px</option>
          <option value="12px">12px</option>
          <option value="13px" selected>13px</option>
          <option value="14px">14px</option>
          <option value="16px">16px</option>
        </select>

        <div class="ss-format-divider"></div>

        <button class="ss-format-btn" id="fmt-currency" title="Format Currency">$</button>
        <button class="ss-format-btn" id="fmt-percent" title="Format Percentage">%</button>
        <button class="ss-format-btn" id="fmt-dec-inc" title="Increase Decimals">.00→</button>
        <button class="ss-format-btn" id="fmt-dec-dec" title="Decrease Decimals">←.0</button>

        <div class="ss-format-divider"></div>
        
        <!-- Visible Color Pickers -->
        <div style="display:inline-flex;align-items:center;gap:6px">
          <label title="Text Color" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary);margin:0">
            Font:
            <input type="color" id="fmt-color" style="width:22px;height:22px;border:1px solid #d1d5db;padding:0;cursor:pointer;border-radius:4px" value="#111827" />
          </label>
          <label title="Fill Background Color" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary);margin:0">
            Fill:
            <input type="color" id="fmt-bg" style="width:22px;height:22px;border:1px solid #d1d5db;padding:0;cursor:pointer;border-radius:4px" value="#ffffff" />
          </label>
        </div>

        <div class="ss-format-divider"></div>
        
        <!-- Tab pages selector container -->
        <div id="ss-pages-tabs-container" style="display:flex;align-items:center"></div>
        <div id="ss-collab-badges" class="ss-collab-area" style="margin-left:auto"></div>
      </div>

      <!-- Formula Bar -->
      <div class="ss-formula-bar" id="ss-formula-bar-container">
        <div class="ss-formula-label">fx</div>
        <div class="ss-formula-divider"></div>
        <input type="text" id="ss-formula-input" class="ss-formula-input" placeholder="Enter cell value or formula..." />
      </div>

      <!-- Main workspace container with side panel layout -->
      <div class="ss-layout-container">
        <!-- Main dynamic grid -->
        <div class="ss-grid-main">
          <div class="ss-container" id="ss-container" style="height: calc(100vh - 310px)">
            <div class="ss-grid-wrap" id="ss-grid-wrap">
              <table class="ss-grid" id="ss-grid" style="--header-color:${headerColor}">
                <thead>
                  <tr>
                    <th class="ss-th ss-th-row-num">#</th>
                    ${cols.map((c, colIdx) => `
                      <th class="ss-th" data-col="${c.id}" style="width:${_columnWidths[c.id] || 150}px">
                        <div class="ss-th-inner-excel">
                          <div class="ss-th-letter">${_getColLetter(colIdx)}</div>
                          <div class="ss-th-inner">
                            <span class="ss-col-type-icon">${_colTypeIcon(c.type)}</span>
                            <span class="ss-col-name">${c.name}</span>
                            ${c.required ? '<span class="ss-req-dot">*</span>' : ''}
                          </div>
                          <div class="col-resize-handle" data-col="${c.id}"></div>
                        </div>
                      </th>
                    `).join('')}
                    ${canEdit ? '<th class="ss-th ss-th-actions">Actions</th>' : ''}
                  </tr>
                </thead>
                <tbody id="ss-tbody">
                  ${_buildAllRows(cols, canEdit, user)}
                </tbody>
              </table>
            </div>
            <div class="ss-status-bar" style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;font-size:12px;border-top:1px solid #e5e7eb;background:#f9fafb;color:#4b5563">
              <div style="display:flex;align-items:center;gap:8px">
                <button class="btn btn-secondary btn-sm" id="ss-prev-page-btn" title="Previous Page" style="padding:2px 6px">◀</button>
                <span style="font-weight:600" id="ss-active-sheet-name">Sheet: ${_schema.name} (Page ${_activePage})</span>
                <button class="btn btn-secondary btn-sm" id="ss-next-page-btn" title="Next Page" style="padding:2px 6px">▶</button>
              </div>
              
              <div style="display:flex;align-items:center;gap:16px">
                <span id="ss-row-count">${_rows.length} / 100 capacity</span>
                <span id="ss-footer-save-status">Sync State: Saved just now</span>
                <span id="ss-footer-buttons">
                  ${canEdit ? `
                    <button class="btn btn-secondary btn-sm" id="ss-duplicate-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600">Duplicate Sheet</button>
                    <button class="btn btn-secondary btn-sm" id="ss-add-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600">+ New Page</button>
                    ${_schema.pages?.length > 1 ? `
                      <button class="btn btn-danger btn-sm" id="ss-delete-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600;background:var(--accent-rose);border-color:var(--accent-rose);color:white">Delete Page</button>
                    ` : ''}
                  ` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar metadata panel -->
        <div class="ss-sidebar-panel ${_sidebarCollapsed ? 'collapsed' : ''}" id="ss-sidebar-panel">
          <div class="ss-sidebar-header">
            <span class="ss-sidebar-title">Table Details</span>
            <button class="action-btn" id="ss-close-sidebar" title="Collapse sidebar">${getSvgIcon('close', 14)}</button>
          </div>
          
          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Table Owner</span>
            <span class="ss-sidebar-value" style="font-weight:600">${ownerName}</span>
          </div>

          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Created Date</span>
            <span class="ss-sidebar-value">${formatDate(_schema.createdAt)}</span>
          </div>

          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Page Count</span>
            <span class="ss-sidebar-value">${_schema.pages?.length || 1} pages</span>
          </div>

          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Storage Usage</span>
            <span class="ss-sidebar-value">${totalStorage} B</span>
          </div>

          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Access Permissions</span>
            <span class="ss-sidebar-value" style="margin-top:2px">
              ${_schema.roles?.length > 0 ? _schema.roles.map(r => `<span class="badge badge-muted" style="margin-right:2px">${capitalize(r)}</span>`).join('') : '<span class="badge badge-muted">Public (All)</span>'}
            </span>
          </div>

          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Access Users</span>
            <div style="margin-top:4px">
              ${_renderAccessUsersStack(_schema)}
            </div>
          </div>
          
          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Barcode Value</span>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);margin-top:2px">
              ${_schema.barcode || 'N/A'}
            </div>
            ${_schema.barcode ? `
              <div class="barcode-container">
                ${generateBarcodeSVG(_schema.barcode, { height: 32, showLabel: false })}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Hidden CSV input -->
    <input type="file" id="ss-csv-file" accept=".csv" style="display:none" />
  `);

  // Initialize save status states
  _lastSavedTime = Date.now();
  _updateSaveStatusText();
  if (_saveStatusInterval) clearInterval(_saveStatusInterval);
  _saveStatusInterval = setInterval(() => _updateSaveStatusText(), 10000);

  // Wire toolbar events
  document.getElementById('ss-back')?.addEventListener('click', () => {
    _activeTableId = null; _schema = null; _rows = [];
    _lockedRows.clear(); _pendingCells.clear(); _debounceSavers.clear();
    _undoStack = []; _redoStack = []; _selectedCell = null;
    if (_saveStatusInterval) {
      clearInterval(_saveStatusInterval);
      _saveStatusInterval = null;
    }
    window.location.hash = '#/tables';
    renderTables();
  });
  document.getElementById('ss-toggle-sidebar')?.addEventListener('click', () => {
    _sidebarCollapsed = !_sidebarCollapsed;
    const panel = document.getElementById('ss-sidebar-panel');
    if (panel) panel.classList.toggle('collapsed', _sidebarCollapsed);
  });
  document.getElementById('ss-close-sidebar')?.addEventListener('click', () => {
    _sidebarCollapsed = true;
    const panel = document.getElementById('ss-sidebar-panel');
    if (panel) panel.classList.add('collapsed');
  });
  document.getElementById('ss-scan-btn')?.addEventListener('click', () => {
    _showBarcodeScanModal();
  });

  // Save button
  document.getElementById('ss-save-now-btn')?.addEventListener('click', () => {
    _forceSaveAllPending();
  });
  
  // Hidden CSV Import triggers
  document.getElementById('ss-csv-file')?.addEventListener('change', e => _handleCSVImport(e, cols));

  // Toolbar menus events
  document.getElementById('menu-file-new')?.addEventListener('click', () => _showSchemaModal(null, getWarehouses()));
  document.getElementById('menu-file-import')?.addEventListener('click', () => document.getElementById('ss-csv-file').click());
  document.getElementById('menu-file-export')?.addEventListener('click', () => _exportCSV());
  document.getElementById('menu-file-copy')?.addEventListener('click', () => _cloneTable());
  document.getElementById('menu-file-share')?.addEventListener('click', () => _shareTableLink());
  document.getElementById('menu-file-rename')?.addEventListener('click', async () => {
    const newName = prompt('Enter new table name:', _schema.name);
    if (!newName || newName.trim() === _schema.name) return;
    
    const data = {
      name: newName.trim(),
      category: _schema.category,
      description: _schema.description,
      warehouseId: _schema.warehouseId,
      columns: _schema.columns,
      roles: _schema.roles,
      headerColor: _schema.headerColor
    };
    
    const res = await apiFetch(`/dynamic-tables/${_activeTableId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    
    if (res?.success) {
      showToast('Table Renamed', newName, 'success');
      _schema = res.data;
      await renderTables();
    } else {
      showToast('Error', res?.error || 'Could not rename table', 'error');
    }
  });

  document.getElementById('menu-file-bin')?.addEventListener('click', async () => {
    const ok = await confirm('Move this table to the bin and delete all its data permanently?', 'Delete Table');
    if (!ok) return;
    const res = await apiFetch(`/dynamic-tables/${_activeTableId}`, { method: 'DELETE' });
    if (res?.success) {
      showToast('Table deleted', '', 'success');
      _activeTableId = null; _schema = null; _rows = [];
      if (_saveStatusInterval) {
        clearInterval(_saveStatusInterval);
        _saveStatusInterval = null;
      }
      window.location.hash = '#/tables';
      renderTables();
    } else {
      showToast('Error', res?.error || 'Delete failed', 'error');
    }
  });

  document.getElementById('menu-file-history')?.addEventListener('click', () => {
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <p style="color:var(--text-secondary);font-size:13px">Showing revision history logs for table: <strong>${_schema.name}</strong></p>
        <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-elevated);padding:10px">
          <div style="border-left:2px solid var(--brand-500);padding-left:12px;margin-bottom:12px">
            <div style="font-weight:600;font-size:12px;color:var(--text-primary)">Current Version (Page ${_activePage})</div>
            <div style="font-size:11px;color:var(--text-muted)">Modified by you · Just now</div>
          </div>
          <div style="border-left:2px solid var(--border-default);padding-left:12px;margin-bottom:12px">
            <div style="font-weight:600;font-size:12px;color:var(--text-secondary)">Schema Registered</div>
            <div style="font-size:11px;color:var(--text-muted)">System Auto-Generation · ${formatDate(_schema.createdAt)}</div>
          </div>
        </div>
      </div>
    `;
    createModal({ title: 'Version History', body, footer: '<button class="btn btn-secondary modal-close-btn">Close</button>' });
  });

  document.getElementById('menu-edit-undo')?.addEventListener('click', () => _undo());
  document.getElementById('menu-edit-redo')?.addEventListener('click', () => _redo());
  document.getElementById('menu-edit-find')?.addEventListener('click', () => _showFindReplaceModal());

  document.querySelectorAll('.ss-zoom-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const zoom = btn.dataset.zoom;
      const grid = document.getElementById('ss-grid');
      if (grid) grid.style.fontSize = `${zoom * 13}px`;
      showToast('Zoom', `Zoom scale set to ${zoom * 100}%`, 'info');
    });
  });

  const toggleFullscreen = () => {
    const ws = document.getElementById('spreadsheet-workspace');
    if (ws) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        ws.requestFullscreen().catch(() => {
          ws.classList.toggle('fullscreen-active');
        });
      }
    }
  };
  document.getElementById('menu-view-fullscreen')?.addEventListener('click', toggleFullscreen);
  document.getElementById('menu-view-formula')?.addEventListener('click', () => {
    const fbar = document.getElementById('ss-formula-bar-container');
    if (fbar) {
      const isHidden = fbar.style.display === 'none';
      fbar.style.display = isHidden ? 'flex' : 'none';
      showToast('Formula Bar', isHidden ? 'Formula bar shown' : 'Formula bar hidden', 'info');
    }
  });
  document.getElementById('menu-view-gridlines')?.addEventListener('click', () => {
    const grid = document.getElementById('ss-grid');
    if (grid) {
      const active = grid.classList.toggle('ss-grid-no-gridlines');
      showToast('Gridlines', active ? 'Gridlines hidden' : 'Gridlines visible', 'info');
    }
  });

  document.getElementById('menu-insert-row')?.addEventListener('click', () => _appendVirtualRow(cols, canEdit, user));
  document.getElementById('menu-insert-col')?.addEventListener('click', () => _showSchemaModal(_schema, getWarehouses()));
  document.getElementById('menu-insert-image')?.addEventListener('click', () => {
    if (!_selectedCell) { showToast('Insert Image', 'Please select a cell first', 'warning'); return; }
    const url = prompt('Enter image URL:');
    if (url) _applyCellChange(_selectedCell.rowId, _selectedCell.colId, url);
  });
  document.getElementById('menu-insert-link')?.addEventListener('click', () => {
    if (!_selectedCell) { showToast('Insert Link', 'Please select a cell first', 'warning'); return; }
    const url = prompt('Enter link URL:');
    if (url) _applyCellChange(_selectedCell.rowId, _selectedCell.colId, url);
  });
  document.getElementById('menu-insert-comment')?.addEventListener('click', () => {
    if (!_selectedCell) { showToast('Insert Comment', 'Please select a cell first', 'warning'); return; }
    const comment = prompt('Enter cell comment:');
    if (comment) {
      const cellInp = _selectedCell.el.querySelector('.ss-input');
      if (cellInp) cellInp.title = comment;
      showToast('Comment added', '', 'success');
    }
  });

  // Functions buttons in insert
  document.querySelectorAll('.ss-func-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!_selectedCell) {
        showToast('Function Error', 'Please select a cell first', 'warning');
        return;
      }
      
      const func = btn.dataset.func;
      const colId = _selectedCell.colId;
      
      const numValues = _rows
        .map(r => parseFloat(r[colId]))
        .filter(v => !isNaN(v));
        
      if (numValues.length === 0) {
        showToast('Function Error', 'No numeric data in the selected column to calculate', 'warning');
        return;
      }
      
      let result = 0;
      if (func === 'SUM') {
        result = numValues.reduce((acc, v) => acc + v, 0);
      } else if (func === 'AVERAGE') {
        result = numValues.reduce((acc, v) => acc + v, 0) / numValues.length;
      } else if (func === 'MIN') {
        result = Math.min(...numValues);
      } else if (func === 'MAX') {
        result = Math.max(...numValues);
      }
      
      const finalVal = Number.isInteger(result) ? result : result.toFixed(2);
      
      _applyCellChange(_selectedCell.rowId, _selectedCell.colId, finalVal);
      showToast('Calculated ' + func, `Result: ${finalVal}`, 'success');
    });
  });

  document.getElementById('menu-data-filter')?.addEventListener('click', () => {
    const q = prompt('Filter rows containing:');
    if (q !== null) {
      document.querySelectorAll('#ss-tbody tr').forEach(tr => {
        if (tr.dataset.virtual === 'true') return;
        tr.style.display = tr.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
      });
      showToast('Filtered View', `Showing rows containing: "${q}"`, 'info');
    }
  });
  document.getElementById('menu-data-sort-asc')?.addEventListener('click', () => _sortRows('asc'));
  document.getElementById('menu-data-sort-desc')?.addEventListener('click', () => _sortRows('desc'));

  // Format menus
  const wireFmt = (btnId, type, val = null) => {
    document.getElementById(btnId)?.addEventListener('click', () => _applyFormatting(type, val));
  };
  wireFmt('menu-fmt-bold', 'bold');
  wireFmt('fmt-bold', 'bold');
  wireFmt('menu-fmt-italic', 'italic');
  wireFmt('fmt-italic', 'italic');
  wireFmt('menu-fmt-underline', 'underline');
  wireFmt('fmt-underline', 'underline');
  wireFmt('menu-fmt-strike', 'strike');
  wireFmt('fmt-strike', 'strike');
  wireFmt('menu-fmt-currency', 'currency');
  wireFmt('fmt-currency', 'currency');
  wireFmt('menu-fmt-percent', 'percent');
  wireFmt('fmt-percent', 'percent');
  wireFmt('menu-fmt-dec-inc', 'dec-inc');
  wireFmt('fmt-dec-inc', 'dec-inc');
  wireFmt('menu-fmt-dec-dec', 'dec-dec');
  wireFmt('fmt-dec-dec', 'dec-dec');

  document.getElementById('fmt-align')?.addEventListener('change', e => _applyFormatting('align', e.target.value));
  document.getElementById('fmt-size')?.addEventListener('change', e => _applyFormatting('size', e.target.value));
  document.getElementById('fmt-color')?.addEventListener('change', e => _applyFormatting('color', e.target.value));
  document.getElementById('fmt-bg')?.addEventListener('change', e => _applyFormatting('bg', e.target.value));

  // Formula input bar listener
  const formulaInput = document.getElementById('ss-formula-input');
  formulaInput?.addEventListener('input', e => {
    if (!_selectedCell) return;
    const { rowId, colId, el } = _selectedCell;
    const inp = el.querySelector('.ss-input');
    if (!inp) return;
    
    const val = formulaInput.value;
    if (inp.type === 'checkbox') {
      inp.checked = val.toLowerCase() === 'true' || val === '1' || val.toUpperCase() === 'TRUE';
    } else {
      inp.value = val;
    }
    
    const rowIdx = parseInt(el.dataset.rowIdx || el.dataset.rowidx || '0');
    _scheduleSave(rowId, rowIdx, cols, inp);
  });

  // Search input filter
  document.getElementById('ss-grid-search')?.addEventListener('input', debounce(async (e) => {
    if (_activeTableId === 'central_registry') {
      _registrySearchQ = e.target.value;
      _activePage = 1;
      await _reloadRegistryRows();
    } else {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#ss-tbody tr').forEach(tr => {
        if (tr.dataset.virtual === 'true') return;
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }
  }, 300));

  // Central Registry filters
  document.getElementById('ss-registry-type-filter')?.addEventListener('change', async (e) => {
    _registryTypeFilter = e.target.value;
    _activePage = 1;
    await _reloadRegistryRows();
  });

  document.getElementById('ss-registry-wh-filter')?.addEventListener('change', async (e) => {
    _registryWhFilter = e.target.value;
    _activePage = 1;
    await _reloadRegistryRows();
  });

  // Print barcodes action
  document.getElementById('ss-print-barcodes-btn')?.addEventListener('click', async () => {
    await _showBarcodePrintSheet();
  });

  // Footer page navigation buttons
  document.getElementById('ss-prev-page-btn')?.addEventListener('click', () => {
    if (_activePage > 1) {
      _switchPage(_activePage - 1);
    } else {
      showToast('Pagination', 'Already on the first page', 'info');
    }
  });
  document.getElementById('ss-next-page-btn')?.addEventListener('click', () => {
    const totalPages = _schema.pages?.length || 1;
    if (_activePage < totalPages) {
      _switchPage(_activePage + 1);
    } else {
      showToast('Pagination', 'Already on the last page. Use "+ New Page" to add more pages.', 'info');
    }
  });

  // Footer buttons setup
  _updateFooterButtons();

  // Attach cell + row events
  _attachGridEvents(cols, canEdit, user);
  _renderPageTabs(canEdit);
  _updatePageMeta();
  _initColumnResizer();

  // Connect WebSocket for realtime collaboration
  _subscribeToTableEvents();
}

// ─── ROW RENDERING ────────────────────────────────────────────────────────────
function _buildAllRows(cols, canEdit, user) {
  let html = '';
  // Real rows
  for (let i = 0; i < _rows.length; i++) {
    html += _buildRow(_rows[i], i, cols, canEdit, user, false);
  }
  // Virtual empty rows to fill up to exactly 100 capacity
  const virtualCount = Math.max(0, 100 - _rows.length);
  for (let v = 0; v < virtualCount; v++) {
    html += _buildVirtualRow(_rows.length + v, cols, canEdit);
  }
  return html;
}

// ─── PAGE SYSTEM UTILITIES ──────────────────────────────────────────────────
function _renderPageTabs(canEdit) {
  const container = document.getElementById('ss-pages-tabs-container');
  if (!container) return;

  const pages = _schema.pages && _schema.pages.length > 0 ? _schema.pages : [{
    page_number: 1,
    created_at: _schema.createdAt,
    created_by: _schema.createdBy,
    permissions: _schema.roles || [],
    storage_usage: 0
  }];

  if (pages.length <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="ss-pages-tabs" style="display:flex;align-items:center;gap:4px;margin-left:16px;background:var(--bg-input);padding:3px;border-radius:8px;border:1px solid var(--border-default)">
      ${pages.map(p => `
        <button class="ss-page-tab ${p.page_number === _activePage ? 'active' : ''}" data-page="${p.page_number}" 
                style="border:none;padding:6px 12px;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;
                       background:${p.page_number === _activePage ? 'var(--brand-500)' : 'transparent'};
                       color:${p.page_number === _activePage ? 'white' : 'var(--text-secondary)'};
                       transition:all 0.15s">
          Page ${p.page_number}
        </button>
      `).join('')}
    </div>
  `;

  _bindPageEvents(canEdit);
}

async function _switchPage(pageNumber) {
  _activePage = pageNumber;
  
  // Show smooth loading state in tbody for fast feedback
  const tbody = document.getElementById('ss-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="100" style="text-align:center;padding:48px;color:var(--text-muted)">
          <span class="ss-save-spinner" style="display:inline-block;margin-right:8px">⟳</span> Loading Page ${pageNumber}…
        </td>
      </tr>
    `;
  }
  
  let url = `/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`;
  if (_activeTableId === 'central_registry') {
    if (_registrySearchQ) url += `&search=${encodeURIComponent(_registrySearchQ)}`;
    if (_registryTypeFilter) url += `&entityType=${encodeURIComponent(_registryTypeFilter)}`;
    if (_registryWhFilter) url += `&warehouseId=${encodeURIComponent(_registryWhFilter)}`;
  }
  const rowsRes = await apiFetch(url);
  _rows = (rowsRes?.success && Array.isArray(rowsRes.data)) ? rowsRes.data : [];
  _updateRowCount();
  _updatePageMeta();
  
  const cols = _schema.columns || [];
  const user = getCurrentUser();
  const isRegistry = _activeTableId === 'central_registry';
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role) && !isRegistry;
  if (tbody) {
    tbody.innerHTML = _buildAllRows(cols, canEdit, user);
    _attachGridEvents(cols, canEdit, user);
  }
  
  const sheetNameEl = document.getElementById('ss-active-sheet-name');
  if (sheetNameEl) {
    sheetNameEl.textContent = `Sheet: ${_schema.name} (Page ${_activePage})`;
  }
  
  _updateFooterButtons();
  _renderPageTabs(canEdit);
}

function _bindPageEvents(canEdit) {
  document.querySelectorAll('.ss-page-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const pageNum = parseInt(btn.dataset.page);
      if (pageNum !== _activePage) {
        _switchPage(pageNum);
      }
    });
  });
}

function _updatePageMeta() {
  const metaEl = document.getElementById('ss-page-meta');
  if (!metaEl) return;
  const pages = _schema.pages && _schema.pages.length > 0 ? _schema.pages : [{
    page_number: 1,
    created_at: _schema.createdAt,
    created_by: _schema.createdBy,
    permissions: _schema.roles || [],
    storage_usage: 0
  }];
  const currentPageMeta = pages.find(p => p.page_number === _activePage) || pages[0];
  const dateStr = currentPageMeta.created_at ? new Date(currentPageMeta.created_at).toLocaleDateString() : '—';
  const storageStr = currentPageMeta.storage_usage !== undefined ? `${currentPageMeta.storage_usage} B` : '0 B';
  const rolesStr = (currentPageMeta.permissions || []).length > 0 ? currentPageMeta.permissions.join(', ') : 'All';
  const ownerStr = currentPageMeta.created_by ? `Owner: ID ${currentPageMeta.created_by.slice(0, 8)}` : 'System';

  metaEl.innerHTML = `
    <span>📄 Page ${_activePage}</span>
    <span>📅 Created: ${dateStr}</span>
    <span>👤 ${ownerStr}</span>
    <span>🔒 Roles: ${rolesStr}</span>
    <span>💾 Storage: ${storageStr}</span>
  `;
}

function _buildRow(row, idx, cols, canEdit, user, isNew = false) {
  const locked = _lockedRows.has(row.id);
  const lockInfo = locked ? _lockedRows.get(row.id) : null;
  const isLockedByOther = locked && lockInfo?.userId !== String(user.id || user._id);

  return `<tr class="ss-row ${isNew ? 'ss-row-new' : ''} ${locked ? 'ss-row-locked' : ''}"
      data-row-id="${row.id}" data-row-idx="${idx}">
    <td class="ss-td ss-td-row-num">
      ${isLockedByOther
        ? `<span class="ss-lock-indicator" style="display:inline-flex;align-items:center;color:var(--brand-500)" title="${lockInfo.userName} is editing">${getSvgIcon('edit', 12)}</span>`
        : `<span class="ss-row-num">${idx + 1}</span>`
      }
    </td>
    ${cols.map(col => `
      <td class="ss-td ss-cell" data-col="${col.id}" data-row="${row.id}" data-row-idx="${idx}"
          data-type="${col.type}" ${!canEdit || isLockedByOther ? 'data-readonly="true"' : ''}>
        ${canEdit && !isLockedByOther
          ? _buildEditableCell(row[col.id], col, row.id, idx)
          : _buildReadonlyCell(row[col.id], col)
        }
      </td>
    `).join('')}
    ${canEdit ? `
      <td class="ss-td ss-td-actions">
        <button class="ss-action-btn ss-del-row" data-row-id="${row.id}" data-row-idx="${idx}" title="Delete row">${getSvgIcon('trash', 12)}</button>
      </td>
    ` : ''}
  </tr>`;
}

function _buildVirtualRow(idx, cols, canEdit) {
  return `<tr class="ss-row ss-row-virtual" data-row-idx="${idx}" data-virtual="true">
    <td class="ss-td ss-td-row-num"><span class="ss-row-num" style="opacity:0.3">${idx + 1}</span></td>
    ${cols.map(col => `
      <td class="ss-td ss-cell ss-cell-virtual" data-col="${col.id}" data-row-idx="${idx}"
          data-type="${col.type}" data-virtual="true">
        <span class="ss-cell-placeholder"></span>
      </td>
    `).join('')}
    ${canEdit ? `<td class="ss-td ss-td-actions"></td>` : ''}
  </tr>`;
}

function _buildEditableCell(value, col, rowId, rowIdx) {
  const v = value ?? '';
  const id = `cell-${rowId}-${col.id}`;
  
  // Resolve cell formats
  const fmtKey = `${rowId}:${col.id}`;
  const fmt = _cellFormats.get(fmtKey) || {};
  let style = '';
  if (fmt.bold) style += 'font-weight:bold;';
  if (fmt.italic) style += 'font-style:italic;';
  if (fmt.underline) style += 'text-decoration:underline;';
  if (fmt.strike) style += 'text-decoration:line-through;';
  if (fmt.align) style += `text-align:${fmt.align};`;
  if (fmt.size) style += `font-size:${fmt.size};`;
  if (fmt.color) style += `color:${fmt.color};`;
  if (fmt.bg) style += `background-color:${fmt.bg};`;

  switch (col.type) {
    case 'checkbox':
      return `<label class="ss-checkbox">
        <input type="checkbox" id="${id}" class="ss-input" ${v ? 'checked' : ''}
          data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}" />
      </label>`;

    case 'dropdown': {
      const opts = _parseOptions(col.options);
      const normalized = String(v).trim();
      return `<select id="${id}" class="ss-input ss-select" data-row-id="${rowId}"
          data-col-id="${col.id}" data-row-idx="${rowIdx}" style="${style}">
        <option value="">—</option>
        ${opts.map(o => `<option value="${o}" ${normalized === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>`;
    }

    case 'status':
      return `<select id="${id}" class="ss-input ss-select ss-status-select" data-row-id="${rowId}"
          data-col-id="${col.id}" data-row-idx="${rowIdx}" style="${style}">
        <option value="">—</option>
        ${['Todo','In Progress','Done'].map(s => `<option value="${s}" ${v === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>`;

    case 'number':
    case 'price':
      return `<input type="number" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}"
        step="${col.type === 'price' ? '0.01' : '1'}" min="0" style="${style}" />`;

    case 'date':
      return `<input type="date" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}" style="${style}" />`;

    default:
      return `<input type="text" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}"
        placeholder="…" style="${style}" />`;
  }
}

function _buildReadonlyCell(value, col) {
  const v = value ?? '';
  if (v === '' || v === null || v === undefined) return '<span style="color:var(--text-disabled)">—</span>';
  switch (col.type) {
    case 'checkbox': return v 
      ? `<span style="color:var(--accent-emerald);font-weight:700;display:inline-flex;align-items:center">${getSvgIcon('check', 12)}</span>` 
      : `<span style="color:var(--text-disabled);font-size:14px;font-family:sans-serif;user-select:none">☐</span>`;
    case 'price':    return `<strong>$${Number(v).toFixed(2)}</strong>`;
    case 'date':     return `<span style="font-size:12px;font-family:var(--font-mono)">${v}</span>`;
    case 'tags':     return String(v).split(',').map(t => `<span class="badge badge-purple" style="margin-right:2px">${t.trim()}</span>`).join('');
    case 'status': {
      const cls = v === 'Done' ? 'badge-success' : v === 'In Progress' ? 'badge-warning' : 'badge-muted';
      return `<span class="badge ${cls}">${v}</span>`;
    }
    case 'dropdown': return `<span class="badge badge-info">${v}</span>`;
    default: {
      const isUrlOrPath = typeof v === 'string' && (
        v.startsWith('data:') || 
        v.startsWith('http://') || 
        v.startsWith('https://') || 
        v.startsWith('http') || 
        v.startsWith('/') || 
        v.startsWith('./') || 
        v.startsWith('../') ||
        v.match(/\.(jpeg|jpg|gif|png|svg|webp)($|\?)/i)
      );
      if (isUrlOrPath) {
        const srcVal = v.startsWith('/api/') ? 'http://localhost:8000' + v : v;
        return `<img src="${srcVal}" style="max-height:28px;max-width:80px;object-fit:contain;border-radius:4px;display:block;cursor:pointer;margin:0 auto;" onclick="window.showImagePreviewModal('${srcVal}')" />`;
      }
      return `<span>${v}</span>`;
    }
  }
}

// ─── GRID EVENT ATTACHMENT ─────────────────────────────────────────────────────
function _attachGridEvents(cols, canEdit, user) {
  const tbody = document.getElementById('ss-tbody');
  if (!tbody) return;

  // Selection handler
  tbody.addEventListener('mousedown', e => {
    const td = e.target.closest('.ss-cell');
    if (!td) return;

    document.querySelectorAll('.ss-cell-selected').forEach(el => el.classList.remove('ss-cell-selected'));
    td.classList.add('ss-cell-selected');

    const rowId = td.dataset.row;
    const colId = td.dataset.col;
    const colName = cols.find(c => c.id === colId)?.name || '';

    _selectedCell = { rowId, colId, el: td };

    const selInfo = document.getElementById('ss-selected-info');
    if (selInfo) {
      selInfo.textContent = `Selected: ${colName} (Row ${parseInt(td.dataset.rowIdx) + 1})`;
    }

    // Sync selected cell value with the formula input bar
    const inp = td.querySelector('.ss-input');
    const formulaBar = document.getElementById('ss-formula-input');
    if (formulaBar) {
      if (inp) {
        formulaBar.value = inp.type === 'checkbox' ? (inp.checked ? 'TRUE' : 'FALSE') : inp.value;
      } else {
        formulaBar.value = '';
      }
    }

    // Update formatting toolbar states based on cell styling cache
    const fmtKey = `${rowId}:${colId}`;
    const fmt = _cellFormats.get(fmtKey) || {};
    _updateFormatBtnStates(fmt);
  });

  // Event delegation for all ss-input changes
  tbody.addEventListener('change', e => {
    const inp = e.target.closest('.ss-input');
    if (!inp) return;
    const rowId   = inp.dataset.rowId;
    const colId   = inp.dataset.colId;
    const rowIdx  = parseInt(inp.dataset.rowIdx);

    if (rowId && colId) {
      const newValue = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (newValue !== _cellPreValue) {
        _pushToUndoStack({ rowId, colId, oldValue: _cellPreValue, newValue });
      }
    }

    if (inp.dataset.virtual === 'true' || !rowId) {
      // Click on virtual row → promote to real row
      _handleVirtualCellChange(inp, cols, canEdit, user);
      return;
    }
    _scheduleSave(rowId, rowIdx, cols, inp);
  });

  tbody.addEventListener('input', e => {
    const inp = e.target.closest('.ss-input[type="text"], .ss-input[type="number"], .ss-input[type="date"]');
    if (!inp || !inp.dataset.rowId) return;
    const rowIdx = parseInt(inp.dataset.rowIdx);
    _scheduleSave(inp.dataset.rowId, rowIdx, cols, inp);

    // Sync typing value to formula input bar dynamically
    const formulaBar = document.getElementById('ss-formula-input');
    if (formulaBar) {
      formulaBar.value = inp.value;
    }
  });

  // Virtual row — click activates it
  tbody.addEventListener('click', e => {
    const cell = e.target.closest('.ss-cell-virtual');
    if (!cell) return;
    const tr = cell.closest('tr');
    if (tr && tr.dataset.virtual) {
      _activateVirtualRow(tr, cols, canEdit, user);
    }
  });

  // Delete row
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('.ss-del-row');
    if (!btn) return;
    const rowId  = btn.dataset.rowId;
    const rowIdx = parseInt(btn.dataset.rowIdx);
    _deleteRow(rowId, rowIdx, cols, canEdit, user);
  });

  // Emit row_lock over WebSocket on focusin
  tbody.addEventListener('focusin', e => {
    const inp = e.target.closest('.ss-input');
    if (!inp) return;
    
    // Capture pre-edit value for undo stack
    _cellPreValue = inp.type === 'checkbox' ? inp.checked : inp.value;

    const rowId = inp.dataset.rowId;
    if (!rowId || inp.dataset.virtual === 'true') return;

    sendWebSocketMessage({
      event: 'row_lock',
      tableId: _activeTableId,
      rowId: rowId,
      userName: user.name
    });
  });

  // Emit row_unlock over WebSocket on focusout
  tbody.addEventListener('focusout', e => {
    const inp = e.target.closest('.ss-input');
    if (!inp) return;
    const rowId = inp.dataset.rowId;
    if (!rowId || inp.dataset.virtual === 'true') return;

    sendWebSocketMessage({
      event: 'row_unlock',
      tableId: _activeTableId,
      rowId: rowId,
      userName: user.name
    });
  });
}

// ─── VIRTUAL ROW ACTIVATION ───────────────────────────────────────────────────
function _activateVirtualRow(tr, cols, canEdit, user) {
  tr.dataset.virtual = '';
  tr.classList.remove('ss-row-virtual');

  // Replace placeholders with actual inputs (but no row id yet)
  const idx = parseInt(tr.dataset.rowIdx);
  cols.forEach(col => {
    const td = tr.querySelector(`td[data-col="${col.id}"]`);
    if (!td) return;
    td.innerHTML = _buildEditableCell('', col, '__new__', idx).replace(
      /data-row-id="__new__"/g, `data-row-id="" data-virtual="true"`
    );
    td.dataset.virtual = 'true';
  });

  // Replace actions cell
  const actionsTd = tr.querySelector('.ss-td-actions');
  if (actionsTd && canEdit) {
    actionsTd.innerHTML = '';
  }

  // Auto-focus first input
  const firstInput = tr.querySelector('.ss-input');
  firstInput?.focus();
}

async function _saveNewVirtualRow(tr, cols, canEdit, user) {
  const rowData = _collectRowData(tr, cols);
  const isBlank = Object.values(rowData).every(v => v === '' || v === null || v === undefined);
  if (isBlank) return;

  _showSavingIndicator(true);
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`, {
    method: 'POST',
    body: JSON.stringify(rowData)
  });
  _showSavingIndicator(false);

  if (res?.success && res.data) {
    _rows.push(res.data);
    const idx = _rows.length - 1;
    // Replace virtual row with real row
    tr.outerHTML = _buildRow(res.data, idx, cols, canEdit, user, true);
    _updateRowCount();
    // Refresh grid event bindings
    _attachGridEvents(cols, canEdit, user);
    _lastSavedTime = Date.now();
    _updateSaveStatusText();
    showToast('Row saved', '', 'success');
  } else {
    showToast('Save failed', res?.error || 'Check field values', 'error');
    _updateSaveStatusText('Save error');
  }
}

// ─── AUTO-SAVE ─────────────────────────────────────────────────────────────────
function _scheduleSave(rowId, rowIdx, cols, triggerInput) {
  _pendingSaveRows.add(rowId);
  _updateSaveStatusText('Syncing...');

  const key = `${rowId}`;
  if (!_debounceSavers.has(key)) {
    _debounceSavers.set(key, debounce(async () => {
      await _saveRow(rowId, rowIdx, cols);
    }, SAVE_DEBOUNCE));
  }
  _debounceSavers.get(key)();
  _showSavingIndicator(true);
}

async function _saveRow(rowId, rowIdx, cols) {
  if (_savingRows.has(rowId)) return;
  _savingRows.add(rowId);

  // Find the row's <tr> in DOM
  const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
  if (!tr) { 
    _savingRows.delete(rowId); 
    _pendingSaveRows.delete(rowId);
    return; 
  }

  const rowData = _collectRowData(tr, cols);

  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows/${rowId}`, {
    method: 'PUT',
    body: JSON.stringify(rowData)
  });

  _savingRows.delete(rowId);
  _pendingSaveRows.delete(rowId);
  _showSavingIndicator(false);

  if (res?.success && res.data) {
    // Optimistic update — update local array
    const localIdx = _rows.findIndex(r => r.id === rowId);
    if (localIdx !== -1) _rows[localIdx] = res.data;
    _lastSavedTime = Date.now();
    _updateSaveStatusText();
  } else {
    showToast('Save error', res?.error || 'Row could not be saved', 'error');
    _updateSaveStatusText('Save error');
  }
}

function _collectRowData(tr, cols) {
  const data = {};
  cols.forEach(col => {
    const inp = tr.querySelector(`[data-col-id="${col.id}"]`);
    if (!inp) { data[col.id] = null; return; }

    if (col.type === 'checkbox') {
      data[col.id] = inp.checked;
    } else if (col.type === 'number' || col.type === 'price') {
      const num = parseFloat(inp.value);
      data[col.id] = isNaN(num) ? null : num;
    } else {
      data[col.id] = inp.value === '' ? null : inp.value;
    }
  });
  return data;
}

function _appendVirtualRow(cols, canEdit, user) {
  const tbody = document.getElementById('ss-tbody');
  if (!tbody) return;
  const firstVirtual = tbody.querySelector('tr.ss-row-virtual');
  if (firstVirtual) {
    _activateVirtualRow(firstVirtual, cols, canEdit, user);
  }
}

// ─── DELETE ROW ───────────────────────────────────────────────────────────────
async function _deleteRow(rowId, rowIdx, cols, canEdit, user) {
  const ok = await confirm('Delete this row permanently?', 'Delete Row');
  if (!ok) return;

  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows/${rowId}`, { method: 'DELETE' });
  if (res?.success) {
    _rows = _rows.filter(r => r.id !== rowId);
    const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
    tr?.remove();
    _updateRowCount();
    showToast('Row deleted', '', 'success');
  } else {
    showToast('Delete failed', res?.error || 'Could not delete row', 'error');
  }
}

function _updateRowCount() {
  const el = document.getElementById('ss-row-count');
  if (el) el.textContent = `${_rows.length} rows`;
}

function _updateSaveStatusText(statusOverride = null) {
  const indicator = document.getElementById('ss-save-status-indicator');
  const footerStatus = document.getElementById('ss-footer-save-status');
  
  let text = '';
  let badgeClass = 'badge-success';
  
  if (statusOverride) {
    text = statusOverride;
    if (statusOverride === 'Syncing...') {
      badgeClass = 'badge-warning';
    } else if (statusOverride.startsWith('Offline') || statusOverride.includes('error') || statusOverride.includes('failed')) {
      badgeClass = 'badge-danger';
    }
  } else if (!window.navigator.onLine || _isOffline) {
    text = 'Offline / reconnecting';
    badgeClass = 'badge-danger';
  } else {
    const diffMs = Date.now() - _lastSavedTime;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 5) {
      text = 'Saved just now';
    } else if (diffSec < 60) {
      text = 'Saved a few seconds ago';
    } else if (diffSec < 3600) {
      text = 'Saved a few minutes ago';
    } else {
      text = 'Saved a few hours ago';
    }
  }
  
  if (indicator) {
    indicator.textContent = text;
    indicator.className = `badge ${badgeClass}`;
  }
  if (footerStatus) {
    footerStatus.textContent = `Sync State: ${text}`;
  }
}

async function _forceSaveAllPending() {
  if (_pendingSaveRows.size === 0) {
    showToast('Save', 'No pending changes to save', 'info');
    _updateSaveStatusText();
    return;
  }
  
  _updateSaveStatusText('Syncing...');
  _showSavingIndicator(true);
  
  const cols = _schema.columns || [];
  const savePromises = Array.from(_pendingSaveRows).map(async (rowId) => {
    const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
    if (!tr) return;
    const rowIdx = parseInt(tr.dataset.rowIdx);
    await _saveRow(rowId, rowIdx, cols);
  });
  
  await Promise.all(savePromises);
  _pendingSaveRows.clear();
  _showSavingIndicator(false);
  _lastSavedTime = Date.now();
  _updateSaveStatusText();
  showToast('Save Complete', 'All changes saved to database', 'success');
}

// Register network status listeners
window.addEventListener('online', () => { _isOffline = false; _updateSaveStatusText(); });
window.addEventListener('offline', () => { _isOffline = true; _updateSaveStatusText(); });

// ─── SAVE INDICATOR ───────────────────────────────────────────────────────────
let _saveIndicatorTimer = null;
function _showSavingIndicator(on) {
  const el = document.getElementById('ss-save-indicator');
  if (!el) return;
  clearTimeout(_saveIndicatorTimer);
  el.style.display = on ? 'flex' : 'none';
  if (!on) return;
  // Auto-hide after 3s if nothing else triggers
  _saveIndicatorTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ─── REALTIME COLLABORATION ────────────────────────────────────────────────────
function _subscribeToTableEvents() {
  // Listen on the global ws created in store.js via a CustomEvent bridge
  // We add a handler on the window for the custom event dispatched from store.js WS onmessage
  window.removeEventListener('wareops_ws_event', _handleWsEvent);
  window.addEventListener('wareops_ws_event', _handleWsEvent);
}

function _handleWsEvent(e) {
  const user = getCurrentUser();
  if (!user) {
    window.removeEventListener('wareops_ws_event', _handleWsEvent);
    return;
  }
  const payload = e.detail;
  if (!payload || !payload.type || !_activeTableId) return;

  const { type, data } = payload;
  if (!data?.tableId || data.tableId !== _activeTableId) return;

  const userId = String(user.id || user._id || '');
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role);

  switch (type) {
    case 'table_page_created': {
      if (data.tableId === _activeTableId) {
        _schema.pages = data.pages;
        _renderPageTabs(canEdit);
        _showCollabToast(`Page ${data.pageNumber} was added to this table`);
      }
      break;
    }
    case 'table_row_created': {
      // Another user added a row — refresh rows from server
      if (data.actorId !== userId) {
        _refreshRowsFromServer();
        _showCollabToast(`${data.actorName} added a new row`);
      }
      break;
    }
    case 'table_row_updated': {
      if (data.actorId !== userId && data.row) {
        _applyRemoteRowUpdate(data.row);
        _showCollabToast(`${data.actorName} updated row`);
      }
      break;
    }
    case 'table_row_deleted': {
      if (data.actorId !== userId && data.rowId) {
        _applyRemoteRowDelete(data.rowId);
        _showCollabToast(`${data.actorName} deleted a row`);
      }
      break;
    }
    case 'row_lock': {
      if (data.userId !== userId) {
        _lockedRows.set(data.rowId, { userId: data.userId, userName: data.userName });
        _applyRowLockStatus(data.rowId, true, data.userName);
      }
      break;
    }
    case 'row_unlock': {
      if (data.userId !== userId) {
        _lockedRows.delete(data.rowId);
        _applyRowLockStatus(data.rowId, false);
      }
      break;
    }
    case 'table_rows_imported': {
      if (data.actorId !== userId) {
        if (data.page === _activePage) {
          _refreshRowsFromServer();
        }
        _showCollabToast(`${data.actorName} imported ${data.inserted} rows to Page ${data.page || 1}`);
      }
      break;
    }
    case 'table_schema_updated':
    case 'table_schema_deleted': {
      if (data.tableId === _activeTableId) {
        showToast('Schema changed', 'The table structure was updated. Refreshing…', 'warning');
        setTimeout(() => renderTables(), 1500);
      }
      break;
    }
  }
}

function _showCollabToast(msg) {
  showToast('👥 Collaboration', msg, 'info', 3000);
}

async function _refreshRowsFromServer() {
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`);
  if (!res?.success) return;
  _rows = res.data || [];
  _updateRowCount();

  const cols   = _schema?.columns || [];
  const user   = getCurrentUser();
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role);
  const tbody  = document.getElementById('ss-tbody');
  if (tbody) {
    tbody.innerHTML = _buildAllRows(cols, canEdit, user);
    _attachGridEvents(cols, canEdit, user);
  }
}

function _applyRemoteRowUpdate(updatedRow) {
  const idx = _rows.findIndex(r => r.id === updatedRow.id);
  if (idx === -1) return;
  _rows[idx] = updatedRow;

  const tr = document.querySelector(`tr[data-row-id="${updatedRow.id}"]`);
  if (!tr) return;

  const cols = _schema?.columns || [];
  cols.forEach(col => {
    const td   = tr.querySelector(`td[data-col="${col.id}"]`);
    const inp  = td?.querySelector('.ss-input');
    if (!inp) return;
    const val  = updatedRow[col.id] ?? '';
    if (col.type === 'checkbox') {
      inp.checked = Boolean(val);
    } else {
      inp.value = val;
    }
    // Flash highlight
    td?.classList.add('ss-cell-updated');
    setTimeout(() => td?.classList.remove('ss-cell-updated'), 1000);
  });
}

function _applyRemoteRowDelete(rowId) {
  _rows = _rows.filter(r => r.id !== rowId);
  const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
  tr?.remove();
  _updateRowCount();
}

function _applyRowLockStatus(rowId, isLocked, userName = '') {
  const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
  if (!tr) return;

  if (isLocked) {
    tr.classList.add('ss-row-locked');
    const rowNumTd = tr.querySelector('.ss-td-row-num');
    if (rowNumTd) {
      rowNumTd.innerHTML = `<span class="ss-lock-indicator" style="cursor:help;display:inline-flex;align-items:center;color:var(--brand-500)" title="${userName} is editing">${getSvgIcon('edit', 12)}</span>`;
    }
    // Set all cells to readonly for other users
    tr.querySelectorAll('.ss-cell').forEach(cell => {
      cell.dataset.readonly = 'true';
      const inp = cell.querySelector('.ss-input');
      if (inp) {
        inp.disabled = true;
      }
    });
  } else {
    tr.classList.remove('ss-row-locked');
    const rowIdx = parseInt(tr.dataset.rowIdx);
    const rowNumTd = tr.querySelector('.ss-td-row-num');
    if (rowNumTd) {
      rowNumTd.innerHTML = `<span class="ss-row-num">${rowIdx + 1}</span>`;
    }
    // Set cells back to editable if canEdit
    const user = getCurrentUser();
    const canEdit = ['super_admin','admin','manager','staff'].includes(user.role);
    tr.querySelectorAll('.ss-cell').forEach(cell => {
      if (canEdit) {
        delete cell.dataset.readonly;
        const inp = cell.querySelector('.ss-input');
        if (inp) {
          inp.disabled = false;
        }
      }
    });
  }
}

async function _promoteAndSaveVirtualRow(tr, cols, canEdit, user, changedInput) {
  const rowData = _collectRowData(tr, cols);
  const isBlank = Object.values(rowData).every(v => v === '' || v === null || v === undefined);
  if (isBlank) return;

  _showSavingIndicator(true);
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`, {
    method: 'POST',
    body: JSON.stringify(rowData)
  });
  _showSavingIndicator(false);

  if (res?.success && res.data) {
    _rows.push(res.data);
    const idx = _rows.length - 1;
    
    // Replace virtual row with real row in DOM
    const newTrHtml = _buildRow(res.data, idx, cols, canEdit, user, true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = `<table><tbody>${newTrHtml}</tbody></table>`;
    const newTr = tempDiv.querySelector('tr');
    tr.replaceWith(newTr);
    
    _updateRowCount();
    
    // Broadcast creation event to other collaborators
    sendWebSocketMessage({
      event: 'table_row_created',
      tableId: _activeTableId,
      rowId: res.data.id
    });
    
    // Re-attach grid events
    _attachGridEvents(cols, canEdit, user);
    
    // Restore focus to the edited cell in the new real row
    if (changedInput) {
      const colId = changedInput.dataset.colId;
      const targetInput = newTr.querySelector(`[data-col-id="${colId}"]`);
      if (targetInput) {
        targetInput.focus();
        if (targetInput.type === 'text') {
          const val = targetInput.value;
          targetInput.value = '';
          targetInput.value = val;
        }
      }
    }
    _lastSavedTime = Date.now();
    _updateSaveStatusText();
    showToast('Row created', '', 'success');
  } else {
    showToast('Save failed', res?.error || 'Check field values', 'error');
    _updateSaveStatusText('Save error');
  }
}

function _handleVirtualCellChange(inp, cols, canEdit, user) {
  const tr = inp.closest('tr');
  if (!tr) return;
  _promoteAndSaveVirtualRow(tr, cols, canEdit, user, inp);
}

// ─── CSV EXPORT ────────────────────────────────────────────────────────────────
function _exportCSV() {
  const cols = _schema?.columns || [];
  if (!cols.length || !_rows.length) {
    showToast('Nothing to export', 'No data rows in this table', 'warning');
    return;
  }

  const header = cols.map(c => `"${c.name}"`).join(',');
  const body   = _rows.map(row =>
    cols.map(col => {
      const v = row[col.id] ?? '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',')
  ).join('\n');

  const csv  = header + '\n' + body;
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${_schema.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);

  showToast('Export complete', `${_rows.length} rows exported as CSV`, 'success');
  const user = getCurrentUser();
  if (user) {
    addAuditLog('export', `Exported spreadsheet table '${_schema.name}' as CSV (${_rows.length} rows)`, user.id);
  }
}

// ─── CSV IMPORT ────────────────────────────────────────────────────────────────
async function _handleCSVImport(e, cols) {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = '';

  const text   = await file.text();
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    showToast('Import error', 'CSV must have a header row and at least one data row', 'error');
    return;
  }

  // Parse header → match to columns by name (case-insensitive)
  const headerNames = _parseCSVLine(lines[0]);
  const colMap = {};    // csvColIdx → colId
  headerNames.forEach((name, idx) => {
    const col = cols.find(c => c.name.toLowerCase() === name.toLowerCase().trim());
    if (col) colMap[idx] = col;
  });

  const rowsData = [];
  for (let i = 1; i < lines.length; i++) {
    const values = _parseCSVLine(lines[i]);
    const rowObj = {};
    Object.entries(colMap).forEach(([idx, col]) => {
      let val = (values[idx] || '').trim();
      if (col.type === 'number' || col.type === 'price') {
        val = parseFloat(val);
        if (isNaN(val)) val = null;
      } else if (col.type === 'checkbox') {
        val = val.toLowerCase() === 'true' || val === '1';
      } else if (col.type === 'dropdown') {
        // Normalize dropdown value
        const opts = _parseOptions(col.options);
        const matched = opts.find(o => o.toLowerCase() === val.toLowerCase());
        val = matched || null;
      }
      rowObj[col.id] = val;
    });
    rowsData.push(rowObj);
  }

  if (!rowsData.length) {
    showToast('No valid rows', 'CSV contained no parseable data rows', 'warning');
    return;
  }

  _showSavingIndicator(true);
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows/import?page=${_activePage}`, {
    method: 'POST',
    body: JSON.stringify(rowsData)
  });
  _showSavingIndicator(false);

  if (res?.success) {
    showToast('Import complete', `${res.data?.inserted} rows imported. ${res.data?.errors?.length || 0} errors.`, 'success');
    await _refreshRowsFromServer();
  } else {
    showToast('Import failed', res?.error || 'Server error during import', 'error');
  }
}

function _parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuote  = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      result.push(current); current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

// ─── SCHEMA MODAL (Create / Edit Table) ──────────────────────────────────────
function _showSchemaModal(schema, whs) {
  const isEdit = !!schema;
  let columns  = isEdit ? [...(schema.columns || [])] : [];
  let selectedColor = schema?.headerColor || '#6366f1';

  const body = document.createElement('div');
  body.innerHTML = `
    <form id="tbl-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Table Name <span class="req">*</span></label>
          <input type="text" id="t-name" class="form-control" value="${schema?.name||''}" required placeholder="e.g. Operations Tracker" />
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="t-cat" class="form-control">
            ${CATEGORY_OPTS.map(c=>`<option value="${c}" ${schema?.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input type="text" id="t-desc" class="form-control" value="${schema?.description||''}" placeholder="Brief description" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Assign to Warehouse</label>
          <select id="t-wh" class="form-control">
            <option value="">All warehouses</option>
            ${whs.map(w=>`<option value="${w.id}" ${schema?.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Access Roles</label>
          <div style="display:flex;gap:16px;flex-wrap:wrap;background:var(--bg-input);border:1px solid var(--border-default);border-radius:8px;padding:10px 14px;align-items:center;height:44px">
            ${['admin','manager','staff','employee'].map(r=>`
              <label class="checkbox-group" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0">
                <input type="checkbox" class="role-checkbox" value="${r}" ${(schema?.roles||[]).includes(r)?'checked':''} />
                <span style="font-size:13px">${capitalize(r)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Header Color</label>
        <div class="color-picker-row" id="color-picker">
          ${HEADER_COLORS.map(c=>`<div class="color-swatch ${c===selectedColor?'selected':''}" style="background:${c}" data-color="${c}"></div>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Columns <span class="req">*</span></label>
        <div id="columns-list" style="display:flex;flex-direction:column;gap:8px">
          ${columns.map((c,i)=>_renderColumnRow(c,i)).join('')}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="add-col-btn" style="margin-top:10px">+ Add Column</button>
      </div>
    </form>
  `;

  body.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      body.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  });

  body.querySelector('#add-col-btn')?.addEventListener('click', () => {
    const id = 'c' + Date.now();
    columns.push({ id, name: '', type: 'text', required: false, options: '' });
    const colList = body.querySelector('#columns-list');
    const div = document.createElement('div');
    div.innerHTML = _renderColumnRow(columns[columns.length-1], columns.length-1);
    while (div.firstChild) colList.appendChild(div.firstChild);
    // Attach dropdown toggle for new col
    _attachColumnTypeToggle(colList.lastElementChild);
  });

  // Attach type toggles to existing cols
  body.querySelectorAll('.col-row').forEach(row => _attachColumnTypeToggle(row));

  const footer = `
    <button class="btn btn-secondary" id="t-cancel">Cancel</button>
    <button class="btn btn-primary" id="t-save">${isEdit?'Update':'Create'} Table</button>
  `;

  const modal = createModal({ title: isEdit?'Edit Table':'Build New Table', body, footer, size: 'lg' });
  modal.el.querySelector('#t-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#t-save')?.addEventListener('click', async () => {
    const name = document.getElementById('t-name').value.trim();
    if (!name) { showToast('Validation', 'Table name is required', 'warning'); return; }

    const colEls = body.querySelectorAll('.col-row');
    const cols   = Array.from(colEls).map((row) => {
      const colId     = row.dataset.colId;
      const typeEl    = row.querySelector('.col-type');
      const optEl     = row.querySelector('.col-options');
      const rawOpts   = optEl?.value || '';
      const normOpts  = rawOpts.split(',').map(o => o.trim()).filter(Boolean).join(',');
      return {
        id:       colId || 'c' + Date.now(),
        name:     row.querySelector('.col-name').value.trim() || 'Column',
        type:     typeEl?.value || 'text',
        required: row.querySelector('.col-req').checked,
        options:  normOpts
      };
    }).filter(c => c.name);

    const roles = Array.from(body.querySelectorAll('.role-checkbox:checked')).map(cb => cb.value);
    const data  = {
      name,
      category:    document.getElementById('t-cat').value,
      description: document.getElementById('t-desc').value,
      warehouseId: document.getElementById('t-wh').value || null,
      columns:     cols,
      roles,
      headerColor: selectedColor
    };

    let res;
    if (isEdit) {
      res = await apiFetch(`/dynamic-tables/${schema.id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      res = await apiFetch('/dynamic-tables/', { method: 'POST', body: JSON.stringify(data) });
    }

    if (res?.success) {
      showToast(isEdit ? 'Table updated' : 'Table created', name, 'success');
      modal.close();
      if (_activeTableId) {
        // Re-open the updated schema
        await renderTables();
      } else {
        await renderTables();
      }
    } else {
      showToast('Error', res?.error || 'Could not save table', 'error');
    }
  });
}

function _renderColumnRow(col, i) {
  const isDropdown = col.type === 'dropdown';
  return `
    <div class="col-row" data-col-id="${col.id}" style="display:grid;grid-template-columns:1fr 140px auto auto auto;gap:8px;align-items:start;background:var(--bg-input);border:1px solid var(--border-default);border-radius:8px;padding:10px">
      <input type="text" class="col-name form-control" value="${col.name||''}" placeholder="Column name" style="margin:0" />
      <select class="col-type form-control" style="margin:0">
        ${COLUMN_TYPES.map(t=>`<option value="${t}" ${col.type===t?'selected':''}>${capitalize(t)}</option>`).join('')}
      </select>
      <label class="checkbox-group" style="white-space:nowrap;margin-top:8px">
        <input type="checkbox" class="col-req" ${col.required?'checked':''} />
        <label style="font-size:12px">Req.</label>
      </label>
      <button type="button" class="action-btn delete" title="Remove" onclick="this.closest('.col-row').remove()">${getSvgIcon('trash', 12)}</button>
      <div class="col-options-wrap" style="grid-column:1/-1;display:${isDropdown?'block':'none'}">
        <input type="text" class="col-options form-control" value="${col.options||''}"
          placeholder="Dropdown options (comma separated: Yes, No, Pending)" style="margin-top:6px" />
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Enter values separated by commas. Spaces around commas are automatically trimmed.</div>
      </div>
    </div>
  `;
}

function _attachColumnTypeToggle(colRow) {
  const typeEl = colRow?.querySelector('.col-type');
  const optWrap = colRow?.querySelector('.col-options-wrap');
  if (!typeEl || !optWrap) return;
  typeEl.addEventListener('change', () => {
    optWrap.style.display = typeEl.value === 'dropdown' ? 'block' : 'none';
  });
}

// ─── UTILITIES ─────────────────────────────────────────────────────────────────
function _parseOptions(rawOpts) {
  if (!rawOpts) return [];
  return rawOpts.split(',').map(o => o.trim()).filter(Boolean);
}

function _colTypeIcon(type) {
  const icons = {
    text: getSvgIcon('edit', 12), 
    number: '<span style="font-weight:bold;font-size:11px">#</span>', 
    price: '<span style="font-weight:bold;font-size:12px">$</span>', 
    date: getSvgIcon('clock', 12),
    checkbox: getSvgIcon('check', 12), 
    dropdown: getSvgIcon('chevron_down', 12), 
    status: getSvgIcon('info', 12), 
    tags: getSvgIcon('palette', 12)
  };
  return icons[type] || getSvgIcon('edit', 12);
}

// ─── NEXWARE UPGRADE SPREADSHEET ENGINE HELPERS ───────────────────────────────

function _getColLetter(idx) {
  let letter = '';
  while (idx >= 0) {
    letter = String.fromCharCode((idx % 26) + 65) + letter;
    idx = Math.floor(idx / 26) - 1;
  }
  return letter;
}

function _getAccessUsers(schema) {
  const store = getStore();
  const allUsers = store.users || [];
  const roles = schema.roles || [];
  
  return allUsers.filter(u => {
    if (['super_admin', 'admin'].includes(u.role)) return true;
    if (roles.length === 0) return true;
    return roles.includes(u.role);
  });
}

function _renderAccessUsersStack(schema) {
  const accessUsers = _getAccessUsers(schema);

  if (accessUsers.length === 0) {
    return `<span class="badge badge-muted">No Users</span>`;
  }

  const limit = 3;
  const displayUsers = accessUsers.slice(0, limit);
  const remaining = accessUsers.length - limit;
  const currentUser = getCurrentUser() || {};
  const isAdmin = ['super_admin', 'admin'].includes(currentUser.role);

  const tooltipHtml = accessUsers.map(u => {
    const permLevel = _getPermissionLevel(u.role);
    const avatarImg = renderAvatar(u.avatar || u.name.slice(0, 2), 'width:100%;height:100%;object-fit:cover;border-radius:50%');
    return `
      <div class="tooltip-user-row">
        <div style="width:20px;height:20px;border-radius:50%;overflow:hidden;background:var(--gradient-brand);flex-shrink:0;display:flex;align-items:center;justify-content:center">${avatarImg}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:11px;color:#111827">${u.name}</div>
          <div style="font-size:9px;color:#6b7280">${capitalize(u.role)} · ${permLevel}</div>
          ${isAdmin ? `<div style="font-family:var(--font-mono);font-size:8px;color:#9ca3af;margin-top:1px">ID: ${u.id}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const avatarItems = displayUsers.map(u => {
    const avatarImg = renderAvatar(u.avatar || u.name.slice(0, 2), 'width:100%;height:100%;object-fit:cover;border-radius:50%');
    return `<div class="avatar-stack-item">${avatarImg}</div>`;
  }).join('');

  return `
    <div class="avatar-stack-container">
      <div class="avatar-stack">
        ${avatarItems}
        ${remaining > 0 ? `<div class="avatar-stack-more">+${remaining}</div>` : ''}
      </div>
      <div class="avatar-stack-tooltip">
        <div style="font-weight:700;font-size:10px;color:#9ca3af;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Access Users (${accessUsers.length})</div>
        ${tooltipHtml}
      </div>
    </div>
  `;
}

function _getPermissionLevel(role) {
  const mapping = {
    super_admin: 'Owner / Full Admin',
    admin: 'Administrator',
    manager: 'Write & Export',
    staff: 'Write Only',
    employee: 'Read Only'
  };
  return mapping[role] || 'Read Only';
}

function _initColumnResizer() {
  let startX, startWidth, activeHandle, activeColId;
  
  document.querySelectorAll('.col-resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      activeHandle = handle;
      activeColId = handle.dataset.col;
      const th = handle.closest('.ss-th');
      startWidth = th.offsetWidth;
      startX = e.clientX;
      handle.classList.add('active');
      
      document.addEventListener('mousemove', _onMouseMove);
      document.addEventListener('mouseup', _onMouseUp);
    });
  });
  
  function _onMouseMove(e) {
    if (!activeHandle) return;
    const diff = e.clientX - startX;
    const newWidth = Math.max(80, startWidth + diff);
    const th = activeHandle.closest('.ss-th');
    th.style.width = newWidth + 'px';
    _columnWidths[activeColId] = newWidth;
    
    document.querySelectorAll(`td[data-col="${activeColId}"]`).forEach(td => {
      td.style.width = newWidth + 'px';
    });
  }
  
  function _onMouseUp() {
    if (activeHandle) {
      activeHandle.classList.remove('active');
    }
    activeHandle = null;
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('mouseup', _onMouseUp);
  }
}

function _pushToUndoStack(change) {
  _undoStack.push(change);
  _redoStack = []; // Clear redo
}

function _undo() {
  if (_undoStack.length === 0) {
    showToast('Undo', 'Nothing to undo', 'info');
    return;
  }
  const change = _undoStack.pop();
  _redoStack.push(change);
  _applyCellChange(change.rowId, change.colId, change.oldValue);
  showToast('Undo', 'Action reverted', 'success');
}

function _redo() {
  if (_redoStack.length === 0) {
    showToast('Redo', 'Nothing to redo', 'info');
    return;
  }
  const change = _redoStack.pop();
  _undoStack.push(change);
  _applyCellChange(change.rowId, change.colId, change.newValue);
  showToast('Redo', 'Action re-applied', 'success');
}

async function _applyCellChange(rowId, colId, value) {
  const cellInp = document.querySelector(`[data-row-id="${rowId}"][data-col-id="${colId}"]`);
  if (cellInp) {
    if (cellInp.type === 'checkbox') {
      cellInp.checked = Boolean(value);
    } else {
      cellInp.value = value ?? '';
    }
    const cols = _schema.columns || [];
    const localIdx = _rows.findIndex(r => r.id === rowId);
    _scheduleSave(rowId, localIdx, cols, cellInp);
  }
}

function _applyFormatting(formatType, formatValue) {
  if (!_selectedCell) {
    showToast('Format', 'Please select a cell first', 'warning');
    return;
  }
  const { rowId, colId, el } = _selectedCell;
  const key = `${rowId}:${colId}`;
  if (!_cellFormats.has(key)) {
    _cellFormats.set(key, {});
  }
  const fmt = _cellFormats.get(key);
  const inp = el.querySelector('.ss-input');
  if (!inp) return;

  if (formatType === 'bold') {
    fmt.bold = !fmt.bold;
    inp.style.fontWeight = fmt.bold ? 'bold' : 'normal';
    document.getElementById('fmt-bold')?.classList.toggle('active', fmt.bold);
  } else if (formatType === 'italic') {
    fmt.italic = !fmt.italic;
    inp.style.fontStyle = fmt.italic ? 'italic' : 'normal';
    document.getElementById('fmt-italic')?.classList.toggle('active', fmt.italic);
  } else if (formatType === 'underline') {
    fmt.underline = !fmt.underline;
    inp.style.textDecoration = fmt.underline ? 'underline' : 'none';
    document.getElementById('fmt-underline')?.classList.toggle('active', fmt.underline);
  } else if (formatType === 'strike') {
    fmt.strike = !fmt.strike;
    inp.style.textDecoration = fmt.strike ? 'line-through' : 'none';
    document.getElementById('fmt-strike')?.classList.toggle('active', fmt.strike);
  } else if (formatType === 'align') {
    fmt.align = formatValue;
    inp.style.textAlign = formatValue;
  } else if (formatType === 'size') {
    fmt.size = formatValue;
    inp.style.fontSize = formatValue;
  } else if (formatType === 'currency') {
    const num = parseFloat(inp.value);
    if (!isNaN(num)) {
      inp.value = num.toFixed(2);
      const localIdx = _rows.findIndex(r => r.id === rowId);
      _scheduleSave(rowId, localIdx, _schema.columns, inp);
    }
  } else if (formatType === 'percent') {
    const num = parseFloat(inp.value);
    if (!isNaN(num)) {
      inp.value = num + '%';
    }
  } else if (formatType === 'dec-inc') {
    const num = parseFloat(inp.value);
    if (!isNaN(num)) {
      inp.value = (num * 10).toFixed(2);
    }
  } else if (formatType === 'dec-dec') {
    const num = parseFloat(inp.value);
    if (!isNaN(num)) {
      inp.value = (num / 10).toFixed(2);
    }
  } else if (formatType === 'color') {
    fmt.color = formatValue;
    inp.style.color = formatValue;
  } else if (formatType === 'bg') {
    fmt.bg = formatValue;
    inp.style.backgroundColor = formatValue;
  }
}

function _updateFormatBtnStates(fmt) {
  document.getElementById('fmt-bold')?.classList.toggle('active', !!fmt.bold);
  document.getElementById('fmt-italic')?.classList.toggle('active', !!fmt.italic);
  document.getElementById('fmt-underline')?.classList.toggle('active', !!fmt.underline);
  document.getElementById('fmt-strike')?.classList.toggle('active', !!fmt.strike);
  
  const alignEl = document.getElementById('fmt-align');
  if (alignEl && fmt.align) alignEl.value = fmt.align;
  
  const sizeEl = document.getElementById('fmt-size');
  if (sizeEl && fmt.size) sizeEl.value = fmt.size;

  const colorEl = document.getElementById('fmt-color');
  if (colorEl) colorEl.value = fmt.color || '#111827';

  const bgEl = document.getElementById('fmt-bg');
  if (bgEl) bgEl.value = fmt.bg || '#ffffff';
}

function _sortRows(direction) {
  if (!_selectedCell) {
    showToast('Sort', 'Please select a cell in the column to sort', 'warning');
    return;
  }
  const colId = _selectedCell.colId;
  _rows.sort((a, b) => {
    let valA = a[colId] ?? '';
    let valB = b[colId] ?? '';
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  
  const tbody = document.getElementById('ss-tbody');
  const cols = _schema.columns || [];
  const user = getCurrentUser();
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role);
  if (tbody) {
    tbody.innerHTML = _buildAllRows(cols, canEdit, user);
    _attachGridEvents(cols, canEdit, user);
  }
  showToast('Sort Complete', `Rows sorted by column`, 'success');
}

async function _cloneTable() {
  const newName = prompt('Enter a name for the copied table:', `Copy of ${_schema.name}`);
  if (!newName) return;
  
  _showSavingIndicator(true);
  _updateSaveStatusText('Syncing...');
  
  const schemaPayload = {
    name: newName,
    category: _schema.category,
    description: _schema.description || '',
    warehouseId: _schema.warehouseId || null,
    columns: _schema.columns || [],
    roles: _schema.roles || [],
    headerColor: _schema.headerColor || '#6366f1'
  };
  
  const createRes = await apiFetch('/dynamic-tables/', {
    method: 'POST',
    body: JSON.stringify(schemaPayload)
  });
  
  if (!createRes?.success || !createRes.data) {
    _showSavingIndicator(false);
    _updateSaveStatusText();
    showToast('Clone Failed', createRes?.error || 'Could not create new schema', 'error');
    return;
  }
  
  const newTable = createRes.data;
  
  const rowsToCopy = _rows.map(r => {
    const cleanRow = { ...r };
    delete cleanRow.id;
    delete cleanRow._id;
    delete cleanRow.createdAt;
    delete cleanRow.updatedAt;
    return cleanRow;
  });
  
  if (rowsToCopy.length > 0) {
    const importRes = await apiFetch(`/dynamic-tables/${newTable.id}/rows/import?page=1`, {
      method: 'POST',
      body: JSON.stringify(rowsToCopy)
    });
    
    if (!importRes?.success) {
      showToast('Clone Warning', 'Schema cloned but rows could not be imported', 'warning');
    }
  }
  
  _showSavingIndicator(false);
  _lastSavedTime = Date.now();
  _updateSaveStatusText();
  showToast('Table Cloned Successfully', newName, 'success');
  
  _activeTableId = newTable.id;
  _activePage = 1;
  await renderTables();
}

function _shareTableLink() {
  const url = `${window.location.origin}${window.location.pathname}#/tables?id=${_activeTableId}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link Shared', 'Direct link to this table copied to clipboard', 'success');
  }).catch(() => {
    const inp = document.createElement('input');
    inp.value = url;
    document.body.appendChild(inp);
    inp.select();
    document.execCommand('copy');
    inp.remove();
    showToast('Link Shared', 'Direct link to this table copied to clipboard', 'success');
  });
}

function _showFindReplaceModal() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-group">
      <label class="form-label">Find Text</label>
      <input type="text" id="find-text" class="form-control" placeholder="Search cell text..." style="margin:0" />
    </div>
    <div class="form-group" style="margin-top:12px">
      <label class="form-label">Replace With</label>
      <input type="text" id="replace-text" class="form-control" placeholder="Replacement text..." style="margin:0" />
    </div>
    <div class="form-group" style="margin-top:12px">
      <label class="checkbox-group" style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="find-match-case" />
        <span style="font-size:13px">Match case</span>
      </label>
    </div>
  `;
  
  const footer = `
    <button class="btn btn-secondary" id="fr-cancel">Cancel</button>
    <button class="btn btn-primary" id="fr-submit">Replace All</button>
  `;
  
  const modal = createModal({ title: 'Find and Replace', body, footer });
  modal.el.querySelector('#fr-cancel').addEventListener('click', modal.close);
  modal.el.querySelector('#fr-submit').addEventListener('click', async () => {
    const findText = document.getElementById('find-text').value;
    const replaceText = document.getElementById('replace-text').value;
    const matchCase = document.getElementById('find-match-case').checked;
    
    if (findText === '') {
      showToast('Validation', 'Please enter text to find', 'warning');
      return;
    }
    
    modal.close();
    
    let replaceCount = 0;
    const cols = _schema.columns || [];
    
    _showSavingIndicator(true);
    _updateSaveStatusText('Syncing...');
    
    for (let rIdx = 0; rIdx < _rows.length; rIdx++) {
      const row = _rows[rIdx];
      let rowChanged = false;
      
      cols.forEach(col => {
        if (col.id === 'id' || col.id === '_id') return;
        
        const val = row[col.id];
        if (val === null || val === undefined) return;
        
        const strVal = String(val);
        let match = false;
        if (matchCase) {
          match = strVal.includes(findText);
        } else {
          match = strVal.toLowerCase().includes(findText.toLowerCase());
        }
        
        if (match) {
          let newVal;
          if (matchCase) {
            newVal = strVal.replaceAll(findText, replaceText);
          } else {
            const regex = new RegExp(findText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
            newVal = strVal.replace(regex, replaceText);
          }
          
          if (col.type === 'number' || col.type === 'price') {
            const num = parseFloat(newVal);
            newVal = isNaN(num) ? null : num;
          } else if (col.type === 'checkbox') {
            newVal = newVal.toLowerCase() === 'true' || newVal === '1';
          }
          
          row[col.id] = newVal;
          rowChanged = true;
          replaceCount++;
          
          const cellInp = document.querySelector(`[data-row-id="${row.id}"][data-col-id="${col.id}"]`);
          if (cellInp) {
            if (cellInp.type === 'checkbox') {
              cellInp.checked = Boolean(newVal);
            } else {
              cellInp.value = newVal ?? '';
            }
          }
        }
      });
      
      if (rowChanged) {
        await _saveRow(row.id, rIdx, cols);
      }
    }
    
    _showSavingIndicator(false);
    _lastSavedTime = Date.now();
    _updateSaveStatusText();
    
    showToast('Replace Complete', `Replaced ${replaceCount} occurrences across all cells`, 'success');
  });
}

function _showBarcodeScanModal() {
  const store = getStore();
  const allBarcodes = [];
  store.tables?.forEach(t => { if (t.barcode) allBarcodes.push({ type: 'Table', name: t.name, code: t.barcode }); });
  store.warehouses?.forEach(w => { if (w.barcode) allBarcodes.push({ type: 'Warehouse', name: w.name, code: w.barcode }); });
  store.users?.forEach(u => { if (u.barcode) allBarcodes.push({ type: 'Employee', name: u.name, code: u.barcode }); });
  store.items?.forEach(i => { if (i.barcode) allBarcodes.push({ type: 'Inventory Item', name: i.name, code: i.barcode }); });

  const body = document.createElement('div');
  body.className = 'scanner-viewfinder-modal';
  body.innerHTML = `
    <div class="scanner-modal-tabs" style="display:flex;gap:8px;border-bottom:1px solid var(--border-subtle);margin-bottom:12px;padding-bottom:8px;width:100%">
      <button class="btn btn-secondary btn-sm scanner-tab-btn active" data-tab="camera" style="flex:1">Webcam Camera</button>
      <button class="btn btn-secondary btn-sm scanner-tab-btn" data-tab="usb" style="flex:1">USB Intercept</button>
      <button class="btn btn-secondary btn-sm scanner-tab-btn" data-tab="manual" style="flex:1">Manual Fallback</button>
    </div>

    <!-- Webcam Tab -->
    <div class="scanner-tab-content" id="tab-camera" style="width:100%; display:flex; flex-direction:column; align-items:center; gap:10px">
      <div class="form-group" style="width:100%">
        <label class="form-label" style="font-size:12px">Select Camera Device</label>
        <select id="scanner-camera-select" class="form-control" style="margin:0"></select>
      </div>
      <div class="scanner-video-feed">
        <video id="scanner-video" autoplay playsinline></video>
        <div class="scanner-overlay-box">
          <div class="scanner-laser-line"></div>
        </div>
      </div>
      <div class="form-group" style="width:100%; margin-top:8px">
        <label class="form-label" style="font-size:12px">Simulated Snap-Capture Target</label>
        <select id="sim-barcode-select" class="form-control" style="margin:0">
          ${allBarcodes.map(b => `<option value="${b.code}">[${b.type}] ${b.name} (${b.code})</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-snap-simulate" style="width:100%">Simulate Scan / Snap Capture</button>
    </div>

    <!-- USB Tab -->
    <div class="scanner-tab-content" id="tab-usb" style="width:100%; display:none; flex-direction:column; gap:12px">
      <div class="form-group">
        <label class="form-label">USB Hardware Scanner Catcher</label>
        <input type="text" id="usb-scan-catcher" class="form-control" placeholder="Click here to focus scanner..." style="text-align:center;font-size:16px;font-family:var(--font-mono);border:2px solid var(--brand-500);margin:0" />
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.4">Ensure this field is focused. When the scanner sweeps a barcode, hardware keystrokes (latency &lt; 30ms) will be intercepted automatically.</div>
      </div>
    </div>

    <!-- Manual Tab -->
    <div class="scanner-tab-content" id="tab-manual" style="width:100%; display:none; flex-direction:column; gap:12px">
      <div class="form-group">
        <label class="form-label">Manual Barcode Input</label>
        <input type="text" id="manual-scan-input" class="form-control" placeholder="e.g. ITM-2026-0001, WH-2026-0002" style="font-family:var(--font-mono);margin:0" />
      </div>
      <button class="btn btn-primary" id="btn-manual-submit" style="width:100%">Locate Entity</button>
    </div>
  `;

  const footer = `<button class="btn btn-secondary" id="scan-modal-close" style="width:100%">Close</button>`;

  let activeStream = null;

  const modal = createModal({ 
    title: 'Dynamic Barcode Scan Engine', 
    body, 
    footer,
    onClose: () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
      }
    }
  });

  // Handle Close Button
  modal.el.querySelector('#scan-modal-close').addEventListener('click', modal.close);

  // Tab switching logic
  const tabBtns = modal.el.querySelectorAll('.scanner-tab-btn');
  const tabContents = modal.el.querySelectorAll('.scanner-tab-content');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetTab = btn.dataset.tab;
      tabContents.forEach(c => {
        c.style.display = c.id === `tab-${targetTab}` ? 'flex' : 'none';
      });
      if (targetTab === 'usb') {
        setTimeout(() => modal.el.querySelector('#usb-scan-catcher')?.focus(), 100);
      }
    });
  });

  // Webcam stream logic
  const cameraSelect = modal.el.querySelector('#scanner-camera-select');
  const videoEl = modal.el.querySelector('#scanner-video');

  async function startCamera(deviceId = null) {
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
    }
    try {
      const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
      };
      activeStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoEl) videoEl.srcObject = activeStream;
    } catch (err) {
      console.warn('Camera stream error:', err);
    }
  }

  // Enumerate cameras
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (cameraSelect) {
          cameraSelect.innerHTML = videoDevices.map(d => `<option value="${d.deviceId}">${d.label || 'Camera ' + (cameraSelect.options.length + 1)}</option>`).join('');
          cameraSelect.addEventListener('change', () => {
            startCamera(cameraSelect.value);
          });
        }
        return startCamera(videoDevices[0]?.deviceId);
      })
      .catch(err => console.warn('Could not enumerate cameras:', err));
  } else {
    startCamera();
  }

  // Simulated capture logic
  modal.el.querySelector('#btn-snap-simulate').addEventListener('click', () => {
    const code = modal.el.querySelector('#sim-barcode-select').value;
    if (code) {
      _handleScannedBarcode(code, modal);
    }
  });

  // USB Scanner interception logic
  let lastKeyTime = Date.now();
  let scanBuffer = '';
  const usbInput = modal.el.querySelector('#usb-scan-catcher');
  if (usbInput) {
    usbInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const finalCode = scanBuffer.trim();
        scanBuffer = '';
        usbInput.value = '';
        if (finalCode) {
          _handleScannedBarcode(finalCode, modal);
        }
        e.preventDefault();
        return;
      }
      
      const now = Date.now();
      const diff = now - lastKeyTime;
      lastKeyTime = now;
      
      // Keystroke latency < 30ms identifies barcode scanner typing
      if (diff < 30 || scanBuffer.length === 0) {
        if (e.key.length === 1) {
          scanBuffer += e.key;
          usbInput.value = scanBuffer;
        }
      } else {
        scanBuffer = e.key.length === 1 ? e.key : '';
        usbInput.value = scanBuffer;
      }
    });
  }

  // Manual fallback logic
  modal.el.querySelector('#btn-manual-submit').addEventListener('click', () => {
    const code = modal.el.querySelector('#manual-scan-input').value.trim();
    if (code) {
      _handleScannedBarcode(code, modal);
    } else {
      showToast('Validation', 'Please enter a barcode', 'warning');
    }
  });
}

async function _handleScannedBarcode(code, modal) {
  const codeClean = code.trim();
  if (!codeClean) return;
  modal.close();
  
  const store = getStore();
  
  // 1. Check Tables
  const schema = store.tables?.find(t => t.barcode === codeClean || t.enterprise_id === codeClean || t.id === codeClean);
  if (schema) {
    _activeTableId = schema.id;
    _activePage = 1;
    renderTables();
    showToast('Located Table', schema.name, 'success');
    return;
  }
  
  // 2. Check Warehouses
  const wh = store.warehouses?.find(w => w.barcode === codeClean || w.id === codeClean);
  if (wh) {
    location.hash = '#/warehouses';
    showToast('Located Warehouse', wh.name, 'success');
    return;
  }

  // 3. Check Workforce Users
  const u = store.users?.find(usr => usr.barcode === codeClean || usr.id === codeClean);
  if (u) {
    location.hash = '#/workforce';
    showToast('Located employee', u.name, 'success');
    return;
  }

  // 4. Check Inventory Items (fix redirect to #/items)
  const item = store.items?.find(i => i.barcode === codeClean || (i.barcodes && i.barcodes.includes(codeClean)) || i.sku === codeClean || i.id === codeClean);
  if (item) {
    location.hash = '#/items';
    showToast('Located Item', item.name, 'success');
    return;
  }

  // 5. Fallback API lookup
  try {
    const res = await apiFetch(`/registry/lookup?code=${encodeURIComponent(codeClean)}`);
    if (res?.success && res.data) {
      const type = res.data.entity_type;
      const entityId = res.data.entity_id;
      const name = res.data.snapshot?.name || res.data.snapshot?.billNo || entityId;
      if (type === 'inventory' || type === 'item') {
        location.hash = '#/items';
        showToast('Located Item', name, 'success');
        return;
      } else if (type === 'warehouse') {
        location.hash = '#/warehouses';
        showToast('Located Warehouse', name, 'success');
        return;
      } else if (type === 'employee' || type === 'user') {
        location.hash = '#/workforce';
        showToast('Located employee', name, 'success');
        return;
      } else if (type === 'invoice') {
        location.hash = '#/billing';
        showToast('Located Invoice', name, 'success');
        return;
      } else if (type === 'customer') {
        location.hash = '#/customers';
        showToast('Located Customer', name, 'success');
        return;
      } else if (type === 'table_registry') {
        location.hash = '#/tables';
        showToast('Located Table', name, 'success');
        return;
      }
    }
  } catch (err) {
    console.error('Scanned barcode lookup failed:', err);
  }
  
  // If we are currently editing a cell, let's write it to the cell!
  if (_selectedCell) {
    _applyCellChange(_selectedCell.rowId, _selectedCell.colId, codeClean);
    showToast('Barcode Written', `Wrote "${codeClean}" to cell`, 'success');
    return;
  }
  
  showToast('Not Found', `Barcode '${codeClean}' not registered.`, 'warning');
}

async function _reloadRegistryRows() {
  const tbody = document.getElementById('ss-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="100" style="text-align:center;padding:48px;color:var(--text-muted)">
          <span class="ss-save-spinner" style="display:inline-block;margin-right:8px">⟳</span> Refreshing Ledger…
        </td>
      </tr>
    `;
  }
  
  const schemaRes = await apiFetch(`/dynamic-tables/${_activeTableId}`);
  if (schemaRes?.success && schemaRes.data) {
    _schema = schemaRes.data;
  }
  
  let url = `/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`;
  if (_registrySearchQ) url += `&search=${encodeURIComponent(_registrySearchQ)}`;
  if (_registryTypeFilter) url += `&entityType=${encodeURIComponent(_registryTypeFilter)}`;
  if (_registryWhFilter) url += `&warehouseId=${encodeURIComponent(_registryWhFilter)}`;

  const rowsRes = await apiFetch(url);
  _rows = (rowsRes?.success && Array.isArray(rowsRes.data)) ? rowsRes.data : [];
  _updateRowCount();
  _updatePageMeta();

  const cols = _schema.columns || [];
  const user = getCurrentUser();
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role) && _activeTableId !== 'central_registry';
  if (tbody) {
    tbody.innerHTML = _buildAllRows(cols, canEdit, user);
    _attachGridEvents(cols, canEdit, user);
  }
  
  _renderPageTabs(canEdit);
  _updateFooterButtons();
}

function _updateFooterButtons() {
  const user = getCurrentUser();
  const isRegistry = _activeTableId === 'central_registry';
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role) && !isRegistry;
  const container = document.getElementById('ss-footer-buttons');
  if (!container) return;

  container.innerHTML = canEdit ? `
    <button class="btn btn-secondary btn-sm" id="ss-duplicate-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600">Duplicate Sheet</button>
    <button class="btn btn-secondary btn-sm" id="ss-add-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600">+ New Page</button>
    ${_schema.pages?.length > 1 ? `
      <button class="btn btn-danger btn-sm" id="ss-delete-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600;background:var(--accent-rose);border-color:var(--accent-rose);color:white">Delete Page</button>
    ` : ''}
  ` : '';

  _bindFooterButtonsEvents();
}

function _bindFooterButtonsEvents() {
  const user = getCurrentUser();
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role) && _activeTableId !== 'central_registry';
  if (!canEdit) return;

  document.getElementById('ss-duplicate-sheet-btn')?.addEventListener('click', async () => {
    const pages = _schema.pages && _schema.pages.length > 0 ? _schema.pages : [{}];
    const storeSub = localStorage.getItem('wareops_store');
    let plan = 'enterprise';
    try {
      if (storeSub) {
        const parsed = JSON.parse(storeSub);
        if (parsed.subscription?.plan) plan = parsed.subscription.plan;
      }
    } catch (e) {}

    const maxPages = plan === 'starter' ? 2 : 50;
    if (pages.length >= maxPages) {
      showToast('Plan Limit Exceeded', `Starter plan tables are limited to ${maxPages} pages. Please upgrade your subscription.`, 'warning');
      return;
    }

    _showSavingIndicator(true);
    _updateSaveStatusText('Syncing...');
    
    const res = await apiFetch(`/dynamic-tables/${_activeTableId}/pages`, { method: 'POST' });
    if (!res?.success || !res.data) {
      _showSavingIndicator(false);
      _updateSaveStatusText();
      showToast('Error', res?.error || 'Could not create new page', 'error');
      return;
    }
    
    const newSchema = res.data;
    const newPageNum = newSchema.pages.length;
    
    const rowsToDuplicate = _rows.map(r => {
      const clean = { ...r };
      delete clean.id;
      delete clean._id;
      delete clean.createdAt;
      delete clean.updatedAt;
      return clean;
    });
    
    if (rowsToDuplicate.length > 0) {
      const importRes = await apiFetch(`/dynamic-tables/${_activeTableId}/rows/import?page=${newPageNum}`, {
        method: 'POST',
        body: JSON.stringify(rowsToDuplicate)
      });
      if (!importRes?.success) {
        showToast('Duplicate Sheet', 'Page created but could not clone rows', 'warning');
      }
    }
    
    _schema = newSchema;
    _showSavingIndicator(false);
    _lastSavedTime = Date.now();
    _updateSaveStatusText();
    showToast('Page Duplicated', `Page ${newPageNum} created as a copy of Page ${_activePage}`, 'success');
    
    _activePage = newPageNum;
    await _switchPage(newPageNum);
  });

  document.getElementById('ss-add-sheet-btn')?.addEventListener('click', async () => {
    const pages = _schema.pages && _schema.pages.length > 0 ? _schema.pages : [{}];
    const storeSub = localStorage.getItem('wareops_store');
    let plan = 'enterprise';
    try {
      if (storeSub) {
        const parsed = JSON.parse(storeSub);
        if (parsed.subscription?.plan) plan = parsed.subscription.plan;
      }
    } catch (e) {}

    const maxPages = plan === 'starter' ? 2 : 50;
    if (pages.length >= maxPages) {
      showToast('Plan Limit Exceeded', `Starter plan tables are limited to ${maxPages} pages. Please upgrade your subscription.`, 'warning');
      return;
    }

    _showSavingIndicator(true);
    _updateSaveStatusText('Creating Page...');
    const res = await apiFetch(`/dynamic-tables/${_activeTableId}/pages`, { method: 'POST' });
    _showSavingIndicator(false);
    _updateSaveStatusText();

    if (res?.success && res.data) {
      _schema = res.data;
      showToast('Page Created', `Page ${_schema.pages.length} added to table`, 'success');
      _activePage = _schema.pages.length;
      await _switchPage(_schema.pages.length);
    } else {
      showToast('Error', res?.error || 'Could not create new page', 'error');
    }
  });

  document.getElementById('ss-delete-sheet-btn')?.addEventListener('click', async () => {
    const ok = await confirm(`Are you sure you want to delete Page ${_activePage} and purge all its rows? Subsequent pages will be shifted down contiguously.`, 'Delete Page');
    if (!ok) return;

    _showSavingIndicator(true);
    _updateSaveStatusText('Deleting Page...');
    const res = await apiFetch(`/dynamic-tables/${_activeTableId}/pages/${_activePage}`, { method: 'DELETE' });
    _showSavingIndicator(false);
    _updateSaveStatusText();

    if (res?.success && res.data) {
      _schema = res.data;
      showToast('Page Deleted', `Page ${_activePage} deleted successfully.`, 'success');
      const nextPage = _activePage > 1 ? _activePage - 1 : 1;
      _activePage = nextPage;
      await _switchPage(nextPage);
    } else {
      showToast('Error', res?.error || 'Could not delete page', 'error');
    }
  });
}

async function _showBarcodePrintSheet() {
  let query = `/registry/?page=1&limit=60`;
  if (_registryTypeFilter) query += `&entityType=${_registryTypeFilter}`;
  if (_registryWhFilter) query += `&warehouseId=${_registryWhFilter}`;
  if (_registrySearchQ) query += `&search=${encodeURIComponent(_registrySearchQ)}`;

  const res = await apiFetch(query);
  if (!res?.success || !res.data) {
    showToast('Failed to load barcodes', res?.error || 'Unknown error', 'error');
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
            const snap = e.metadata_snapshot || {};
            const name = snap.name || snap.customer || e.entity_type.toUpperCase();
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

async function _ensureSystemTables() {
  const res = await apiFetch('/dynamic-tables/');
  if (!res?.success || !Array.isArray(res.data)) return;
  const schemas = res.data;
  
  const warehouseExists = schemas.some(s => s.name === 'Warehouse Table' || s.name === 'Warehouse');
  const workforceExists = schemas.some(s => s.name === 'Workforce Table' || s.name === 'Workforce');
  const inventoryExists = schemas.some(s => s.name === 'Inventory Table' || s.name === 'Inventory');
  
  const user = getCurrentUser();
  if (!user || !['super_admin', 'admin'].includes(user.role)) return;

  if (!warehouseExists) {
    await apiFetch('/dynamic-tables/', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Warehouse Table',
        category: 'Operations',
        description: 'System-generated Warehouses Directory',
        columns: [
          { id: 'c_id', name: 'ID', type: 'text', required: true },
          { id: 'c_barcode', name: 'Barcode', type: 'text', required: true },
          { id: 'c_name', name: 'Name', type: 'text', required: true },
          { id: 'c_logo', name: 'Logo', type: 'text', required: false },
          { id: 'c_location', name: 'Location', type: 'text', required: false },
          { id: 'c_created', name: 'Created Date', type: 'date', required: false },
          { id: 'c_owner', name: 'Owner', type: 'text', required: false },
          { id: 'c_users', name: 'Access Users', type: 'text', required: false }
        ],
        roles: [],
        headerColor: '#06b6d4'
      })
    });
  }

  if (!workforceExists) {
    await apiFetch('/dynamic-tables/', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Workforce Table',
        category: 'HR',
        description: 'System-generated Employee Roster',
        columns: [
          { id: 'c_emp_id', name: 'Employee ID', type: 'text', required: true },
          { id: 'c_barcode', name: 'Barcode', type: 'text', required: true },
          { id: 'c_profile', name: 'Profile', type: 'text', required: false },
          { id: 'c_role', name: 'Role', type: 'text', required: true },
          { id: 'c_warehouse', name: 'Warehouse', type: 'text', required: false },
          { id: 'c_created', name: 'Created Date', type: 'date', required: false }
        ],
        roles: [],
        headerColor: '#10b981'
      })
    });
  }

  if (!inventoryExists) {
    await apiFetch('/dynamic-tables/', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Inventory Table',
        category: 'Inventory',
        description: 'System-generated Stock Catalog',
        columns: [
          { id: 'c_item_id', name: 'Item ID', type: 'text', required: true },
          { id: 'c_barcode', name: 'Barcode', type: 'text', required: true },
          { id: 'c_image', name: 'Image', type: 'text', required: false },
          { id: 'c_sku', name: 'SKU', type: 'text', required: true },
          { id: 'c_stock', name: 'Stock', type: 'number', required: false },
          { id: 'c_category', name: 'Category', type: 'text', required: false },
          { id: 'c_warehouse', name: 'Warehouse', type: 'text', required: false }
        ],
        roles: [],
        headerColor: '#f59e0b'
      })
    });
  }
}
