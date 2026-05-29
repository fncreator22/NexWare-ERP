/**
 * WareOps ERP — Dynamic Tables Spreadsheet Workspace
 * Airtable / Notion style inline-editable grid with realtime collaboration
 */
import {
  getCurrentUser, getWarehouses, apiFetch
} from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, confirm, createModal, formatDate, capitalize, debounce } from '../modules/ui.js';
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

// ─── Entry point ──────────────────────────────────────────────────────────────
export async function renderTables() {
  const user     = getCurrentUser();
  const whs      = getWarehouses();
  const canManage = ['super_admin','admin'].includes(user.role);

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
  const schemas = (res?.success && Array.isArray(res.data)) ? res.data : [];

  renderShell('Tables', 'Dynamic table builder and spreadsheet workspace', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">📋 Table Builder</h1>
          <p class="page-subtitle">Airtable-style inline spreadsheet workspaces</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canManage ? `<button class="btn btn-primary" id="create-tbl-btn">+ New Table</button>` : ''}
        </div>
      </div>

      ${schemas.length === 0 ? `
        <div class="card" style="text-align:center;padding:80px 40px">
          <div style="font-size:56px;margin-bottom:20px;opacity:0.4">📋</div>
          <h2 style="color:var(--text-secondary);margin-bottom:8px">No tables yet</h2>
          <p style="color:var(--text-muted);font-size:14px;margin-bottom:28px">Create your first table and start tracking data like a spreadsheet</p>
          ${canManage ? `<button class="btn btn-primary" id="create-tbl-btn-empty">+ Create First Table</button>` : ''}
        </div>
      ` : `
        <div class="table-toolbar" style="margin-bottom:16px">
          <div class="table-search"><span>🔍</span><input type="text" id="tbl-search" placeholder="Search tables..." /></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Table Name</th><th>Category</th><th>Warehouse</th>
              <th>Columns</th><th>Access Roles</th><th>Created</th><th>Actions</th>
            </tr></thead>
            <tbody id="tbl-list-body">
              ${schemas.map(t => {
                const wh = whs.find(w => w.id === t.warehouseId);
                return `<tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <div style="width:32px;height:32px;border-radius:8px;background:${t.headerColor||'#6366f1'};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">📋</div>
                      <div>
                        <div class="primary-cell">${t.name}</div>
                        <div class="sub-cell">${t.description||'No description'}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="badge badge-brand">${t.category||'—'}</span></td>
                  <td><span class="badge badge-info">${wh?.name||'All Warehouses'}</span></td>
                  <td>${(t.columns||[]).length} cols</td>
                  <td>${(t.roles||[]).length > 0 ? t.roles.map(r => `<span class="badge badge-muted" style="margin-right:2px">${capitalize(r)}</span>`).join('') : '<span class="badge badge-muted">All</span>'}</td>
                  <td>${formatDate(t.createdAt)}</td>
                  <td>
                    <div class="table-actions">
                      <button class="action-btn view" data-tid="${t.id}" title="Open Spreadsheet">📊</button>
                      ${canManage ? `<button class="action-btn edit" data-tid="${t.id}" title="Edit Schema">✏️</button>` : ''}
                      ${canManage ? `<button class="action-btn delete" data-tid="${t.id}" title="Delete">🗑️</button>` : ''}
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
  document.getElementById('tbl-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#tbl-list-body tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  document.querySelectorAll('.action-btn.view[data-tid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      _activeTableId = btn.dataset.tid;
      await renderTables();
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
async function _openSpreadsheet(user, canManage) {
  // Fetch schema + rows
  const schemaRes = await apiFetch(`/dynamic-tables/`);
  _schema = schemaRes?.data?.find(t => t.id === _activeTableId) || null;

  if (!_schema) {
    showToast('Error', 'Table not found', 'error');
    _activeTableId = null;
    await renderTables();
    return;
  }

  const rowsRes = await apiFetch(`/dynamic-tables/${_activeTableId}/rows`);
  _rows = (rowsRes?.success && Array.isArray(rowsRes.data)) ? rowsRes.data : [];

  const canEdit   = ['super_admin','admin','manager','staff'].includes(user.role);
  const canImport = ['super_admin','admin','manager'].includes(user.role);
  const cols      = _schema.columns || [];
  const headerColor = _schema.headerColor || '#6366f1';

  renderShell(_schema.name, `Spreadsheet Workspace · ${_rows.length} rows · ${cols.length} columns`, `
    <div class="animate-slideUp" id="spreadsheet-workspace">
      <!-- Toolbar -->
      <div class="ss-toolbar">
        <div class="ss-toolbar-left">
          <button class="btn btn-secondary btn-sm" id="ss-back">← All Tables</button>
          <div class="ss-table-badge" style="background:${headerColor}22;border-color:${headerColor}44">
            <span style="color:${headerColor}">📊</span>
            <span style="font-weight:700;color:var(--text-primary)">${_schema.name}</span>
            <span class="badge badge-muted" style="font-size:11px">${_schema.category}</span>
          </div>
          <div id="ss-collab-badges" class="ss-collab-area"></div>
        </div>
        <div class="ss-toolbar-right">
          <div id="ss-save-indicator" class="ss-save-indicator" style="display:none">
            <span class="ss-save-spinner">⟳</span> Saving…
          </div>
          ${canImport ? `
            <button class="btn btn-secondary btn-sm" id="ss-import-btn">📥 Import CSV</button>
            <button class="btn btn-secondary btn-sm" id="ss-export-btn">📤 Export CSV</button>
          ` : ''}
          ${canManage ? `<button class="btn btn-secondary btn-sm" id="ss-schema-btn">⚙️ Edit Schema</button>` : ''}
          ${canEdit ? `<button class="btn btn-primary btn-sm" id="ss-add-row-btn">+ Add Row</button>` : ''}
        </div>
      </div>

      <!-- Spreadsheet Grid -->
      <div class="ss-container" id="ss-container">
        <div class="ss-grid-wrap" id="ss-grid-wrap">
          <table class="ss-grid" id="ss-grid" style="--header-color:${headerColor}">
            <thead>
              <tr>
                <th class="ss-th ss-th-row-num">#</th>
                ${cols.map(c => `
                  <th class="ss-th" data-col="${c.id}" title="${c.type}${c.required ? ' · Required' : ''}">
                    <div class="ss-th-inner">
                      <span class="ss-col-type-icon">${_colTypeIcon(c.type)}</span>
                      <span class="ss-col-name">${c.name}</span>
                      ${c.required ? '<span class="ss-req-dot" title="Required">*</span>' : ''}
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
        <div class="ss-status-bar">
          <span id="ss-row-count">${_rows.length} rows</span>
          <span id="ss-selected-info" style="color:var(--text-muted)"></span>
        </div>
      </div>
    </div>

    <!-- Hidden CSV input -->
    <input type="file" id="ss-csv-file" accept=".csv" style="display:none" />
  `);

  // Wire toolbar events
  document.getElementById('ss-back')?.addEventListener('click', () => {
    _activeTableId = null; _schema = null; _rows = [];
    _lockedRows.clear(); _pendingCells.clear(); _debounceSavers.clear();
    renderTables();
  });
  document.getElementById('ss-add-row-btn')?.addEventListener('click', () => _appendVirtualRow(cols, canEdit, user));
  document.getElementById('ss-schema-btn')?.addEventListener('click', () => _showSchemaModal(_schema, getWarehouses()));
  document.getElementById('ss-import-btn')?.addEventListener('click', () => document.getElementById('ss-csv-file').click());
  document.getElementById('ss-export-btn')?.addEventListener('click', () => _exportCSV());
  document.getElementById('ss-csv-file')?.addEventListener('change', e => _handleCSVImport(e, cols));

  // Attach cell + row events
  _attachGridEvents(cols, canEdit, user);

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
  // Virtual empty rows
  const virtualCount = Math.max(VIRTUAL_ROWS, 20);
  for (let v = 0; v < virtualCount; v++) {
    html += _buildVirtualRow(_rows.length + v, cols, canEdit);
  }
  return html;
}

function _buildRow(row, idx, cols, canEdit, user, isNew = false) {
  const locked = _lockedRows.has(row.id);
  const lockInfo = locked ? _lockedRows.get(row.id) : null;
  const isLockedByOther = locked && lockInfo?.userId !== String(user.id || user._id);

  return `<tr class="ss-row ${isNew ? 'ss-row-new' : ''} ${locked ? 'ss-row-locked' : ''}"
      data-row-id="${row.id}" data-row-idx="${idx}">
    <td class="ss-td ss-td-row-num">
      ${isLockedByOther
        ? `<span class="ss-lock-indicator" title="${lockInfo.userName} is editing">✏️</span>`
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
        <button class="ss-action-btn ss-del-row" data-row-id="${row.id}" data-row-idx="${idx}" title="Delete row">🗑️</button>
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
          data-col-id="${col.id}" data-row-idx="${rowIdx}">
        <option value="">—</option>
        ${opts.map(o => `<option value="${o}" ${normalized === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>`;
    }

    case 'status':
      return `<select id="${id}" class="ss-input ss-select ss-status-select" data-row-id="${rowId}"
          data-col-id="${col.id}" data-row-idx="${rowIdx}">
        <option value="">—</option>
        ${['Todo','In Progress','Done'].map(s => `<option value="${s}" ${v === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>`;

    case 'number':
    case 'price':
      return `<input type="number" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}"
        step="${col.type === 'price' ? '0.01' : '1'}" min="0" />`;

    case 'date':
      return `<input type="date" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}" />`;

    default:
      return `<input type="text" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}"
        placeholder="…" />`;
  }
}

function _buildReadonlyCell(value, col) {
  const v = value ?? '';
  if (v === '' || v === null || v === undefined) return '<span style="color:var(--text-disabled)">—</span>';
  switch (col.type) {
    case 'checkbox': return v ? '✅' : '☐';
    case 'price':    return `<strong>$${Number(v).toFixed(2)}</strong>`;
    case 'date':     return `<span style="font-size:12px;font-family:var(--font-mono)">${v}</span>`;
    case 'tags':     return String(v).split(',').map(t => `<span class="badge badge-purple" style="margin-right:2px">${t.trim()}</span>`).join('');
    case 'status': {
      const cls = v === 'Done' ? 'badge-success' : v === 'In Progress' ? 'badge-warning' : 'badge-muted';
      return `<span class="badge ${cls}">${v}</span>`;
    }
    case 'dropdown': return `<span class="badge badge-info">${v}</span>`;
    default:         return `<span>${v}</span>`;
  }
}

// ─── GRID EVENT ATTACHMENT ─────────────────────────────────────────────────────
function _attachGridEvents(cols, canEdit, user) {
  const tbody = document.getElementById('ss-tbody');
  if (!tbody) return;

  // Event delegation for all ss-input changes
  tbody.addEventListener('change', e => {
    const inp = e.target.closest('.ss-input');
    if (!inp) return;
    const rowId   = inp.dataset.rowId;
    const colId   = inp.dataset.colId;
    const rowIdx  = parseInt(inp.dataset.rowIdx);

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
    actionsTd.innerHTML = `<button class="ss-action-btn ss-save-new-row" title="Save new row">💾</button>`;
    actionsTd.querySelector('.ss-save-new-row')?.addEventListener('click', () => _saveNewVirtualRow(tr, cols, canEdit, user));
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
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows`, {
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
    showToast('Row saved', '', 'success');
  } else {
    showToast('Save failed', res?.error || 'Check field values', 'error');
  }
}

// ─── AUTO-SAVE ─────────────────────────────────────────────────────────────────
function _scheduleSave(rowId, rowIdx, cols, triggerInput) {
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
  if (!tr) { _savingRows.delete(rowId); return; }

  const rowData = _collectRowData(tr, cols);

  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows/${rowId}`, {
    method: 'PUT',
    body: JSON.stringify(rowData)
  });

  _savingRows.delete(rowId);
  _showSavingIndicator(false);

  if (res?.success && res.data) {
    // Optimistic update — update local array
    const localIdx = _rows.findIndex(r => r.id === rowId);
    if (localIdx !== -1) _rows[localIdx] = res.data;
  } else {
    showToast('Save error', res?.error || 'Row could not be saved', 'error');
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
  const idx = _rows.length + tbody.querySelectorAll('tr.ss-row:not(.ss-row-virtual)').length;
  const tr = document.createElement('tr');
  tr.className = 'ss-row';
  tr.dataset.rowIdx = idx;
  tr.innerHTML = `
    <td class="ss-td ss-td-row-num"><span class="ss-row-num">${idx + 1}</span></td>
    ${cols.map(col => `<td class="ss-td ss-cell" data-col="${col.id}" data-type="${col.type}">
      ${_buildEditableCell('', col, `__new_${Date.now()}__`, idx)}
    </td>`).join('')}
    <td class="ss-td ss-td-actions">
      <button class="ss-action-btn ss-save-new-row" title="Save new row">💾</button>
    </td>
  `;
  // Insert before first virtual row
  const firstVirtual = tbody.querySelector('tr.ss-row-virtual');
  if (firstVirtual) tbody.insertBefore(tr, firstVirtual);
  else tbody.appendChild(tr);

  tr.querySelector('.ss-save-new-row')?.addEventListener('click', () => _saveNewVirtualRow(tr, cols, canEdit, user));
  tr.querySelector('.ss-input')?.focus();
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
  const payload = e.detail;
  if (!payload || !payload.type || !_activeTableId) return;

  const { type, data } = payload;
  if (!data?.tableId || data.tableId !== _activeTableId) return;

  const user = getCurrentUser();
  const userId = String(user?.id || user?._id || '');

  switch (type) {
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
    case 'table_rows_imported': {
      if (data.actorId !== userId) {
        _refreshRowsFromServer();
        _showCollabToast(`${data.actorName} imported ${data.inserted} rows`);
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
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows`);
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

function _handleVirtualCellChange(inp, cols, canEdit, user) {
  // No-op: handled via virtual row click activation
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
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows/import`, {
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
          <label class="form-label">Access Roles <span style="font-size:11px;color:var(--text-muted)">(hold Ctrl/Cmd for multi)</span></label>
          <select id="t-roles" class="form-control" multiple style="height:80px">
            ${['admin','manager','staff','employee'].map(r=>`<option value="${r}" ${(schema?.roles||[]).includes(r)?'selected':''}>${capitalize(r)}</option>`).join('')}
          </select>
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
    <button class="btn btn-primary" id="t-save">${isEdit?'✓ Update':'+ Create'} Table</button>
  `;

  const modal = createModal({ title: isEdit?'✏️ Edit Table':'📋 Build New Table', body, footer, size: 'lg' });
  modal.el.querySelector('#t-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#t-save')?.addEventListener('click', async () => {
    const name = document.getElementById('t-name').value.trim();
    if (!name) { showToast('Validation', 'Table name is required', 'warning'); return; }

    const colEls = body.querySelectorAll('.col-row');
    const cols   = Array.from(colEls).map((row, i) => {
      const typeEl    = row.querySelector('.col-type');
      const optEl     = row.querySelector('.col-options');
      const rawOpts   = optEl?.value || '';
      // Normalize options: trim each, remove empties
      const normOpts  = rawOpts.split(',').map(o => o.trim()).filter(Boolean).join(',');
      return {
        id:       columns[i]?.id || 'c' + Date.now() + i,
        name:     row.querySelector('.col-name').value.trim() || `Column ${i+1}`,
        type:     typeEl?.value || 'text',
        required: row.querySelector('.col-req').checked,
        options:  normOpts
      };
    }).filter(c => c.name);

    const roles = Array.from(document.getElementById('t-roles').selectedOptions).map(o => o.value);
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
    <div class="col-row" style="display:grid;grid-template-columns:1fr 140px auto auto auto;gap:8px;align-items:start;background:var(--bg-input);border:1px solid var(--border-default);border-radius:8px;padding:10px">
      <input type="text" class="col-name form-control" value="${col.name||''}" placeholder="Column name" style="margin:0" />
      <select class="col-type form-control" style="margin:0">
        ${COLUMN_TYPES.map(t=>`<option value="${t}" ${col.type===t?'selected':''}>${capitalize(t)}</option>`).join('')}
      </select>
      <label class="checkbox-group" style="white-space:nowrap;margin-top:8px">
        <input type="checkbox" class="col-req" ${col.required?'checked':''} />
        <label style="font-size:12px">Req.</label>
      </label>
      <button type="button" class="action-btn delete" title="Remove" onclick="this.closest('.col-row').remove()">🗑️</button>
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
    text: '𝐓', number: '#', price: '$', date: '📅',
    checkbox: '☑', dropdown: '▾', status: '●', tags: '🏷'
  };
  return icons[type] || '𝐓';
}
