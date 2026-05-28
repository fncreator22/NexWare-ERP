/**
 * Dynamic Table Builder — Create, manage, and populate custom tables
 */
import { getCurrentUser, getTables, createTable, updateTable, deleteTable, getTableData, addTableRow, updateTableRow, deleteTableRow, getWarehouses } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, confirm, createModal, formatDate, filterData, capitalize } from '../modules/ui.js';
import { navigate } from '../modules/router.js';

const COLUMN_TYPES = ['text','number','date','dropdown','checkbox','price','tags','status'];
const CATEGORY_OPTIONS = ['Operations','HR','Finance','Inventory','Sales','Logistics','Custom'];
const HEADER_COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#f43f5e','#8b5cf6','#ec4899','#64748b'];

let activeTblId = null;

export function renderTables() {
  const user = getCurrentUser();
  const canCreate = ['super_admin','admin'].includes(user.role);
  const tables = getTables();
  const whs = getWarehouses();

  renderShell('Tables', 'Dynamic table builder and data management', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">📋 Table Builder</h1>
          <p class="page-subtitle">Airtable-style dynamic table management system</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canCreate ? `<button class="btn btn-primary" id="create-tbl-btn">+ New Table</button>` : ''}
        </div>
      </div>

      ${activeTblId ? renderTableView(activeTblId) : renderTableList(tables, whs, canCreate)}
    </div>
  `);

  if (canCreate) {
    document.getElementById('create-tbl-btn')?.addEventListener('click', () => showTableBuilderModal(null));
  }

  attachTableListEvents();
}

function renderTableList(tables, whs, canCreate) {
  if (tables.length === 0) return `
    <div class="card" style="text-align:center;padding:80px 40px">
      <div style="font-size:56px;margin-bottom:20px;opacity:0.4">📋</div>
      <h2 style="color:var(--text-secondary);margin-bottom:8px">No tables yet</h2>
      <p style="color:var(--text-muted);font-size:14px;margin-bottom:28px">Build custom tables to manage any kind of data</p>
      ${canCreate ? `<button class="btn btn-primary" id="create-tbl-btn-empty">+ Create Your First Table</button>` : ''}
    </div>
  `;

  return `
    <!-- Table List Header -->
    <div class="table-toolbar">
      <div class="table-search"><span>🔍</span><input type="text" id="tbl-search" placeholder="Search tables..." /></div>
      <div class="table-filter">
        <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="tbl-cat-filter">
          <option value="">All Categories</option>
          ${CATEGORY_OPTIONS.map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Table Name</th><th>Category</th><th>Warehouse</th>
          <th>Columns</th><th>Rows</th><th>Created By</th>
          <th>Created Date</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody id="table-list-body">
          ${tables.map(t => {
            const wh = whs.find(w=>w.id===t.warehouseId);
            const data = getTableData(t.id);
            return `<tr>
              <td data-label="Table">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:32px;height:32px;border-radius:8px;background:${t.headerColor||'#6366f1'};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">📋</div>
                  <div>
                    <div class="primary-cell">${t.name}</div>
                    <div class="sub-cell">${t.description||'No description'}</div>
                  </div>
                </div>
              </td>
              <td data-label="Category"><span class="badge badge-brand">${t.category||'—'}</span></td>
              <td data-label="Warehouse"><span class="badge badge-info">${wh?.name||'All'}</span></td>
              <td data-label="Columns">${(t.columns||[]).length}</td>
              <td data-label="Rows">${data.length}</td>
              <td data-label="Created By" style="font-size:12px;color:var(--text-muted)">${t.createdBy||'—'}</td>
              <td data-label="Created">${formatDate(t.createdAt)}</td>
              <td data-label="Status"><span class="badge badge-success">Active</span></td>
              <td data-label="Actions">
                <div class="table-actions">
                  <button class="action-btn view" data-tid="${t.id}" title="Open Table">👁️</button>
                  ${canCreate ? `<button class="action-btn edit" data-tid="${t.id}" title="Edit Table">✏️</button>` : ''}
                  ${canCreate ? `<button class="action-btn delete" data-tid="${t.id}" title="Delete">🗑️</button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTableView(tableId) {
  const tables = getTables();
  const table = tables.find(t => t.id === tableId);
  if (!table) { activeTblId = null; return renderTableList(tables, getWarehouses(), true); }

  const data = getTableData(tableId);
  const cols = table.columns || [];
  const user = getCurrentUser();
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role);

  return `
    <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px">
      <button class="btn btn-secondary btn-sm" id="back-to-tables">← All Tables</button>
      <div style="width:32px;height:32px;border-radius:8px;background:${table.headerColor||'#6366f1'};display:flex;align-items:center;justify-content:center;font-size:14px">📋</div>
      <div>
        <h2 style="font-size:18px;font-weight:700">${table.name}</h2>
        <p style="font-size:12px;color:var(--text-muted)">${table.category} · ${data.length} rows · ${cols.length} columns</p>
      </div>
      ${canEdit ? `<button class="btn btn-primary btn-sm" style="margin-left:auto" id="add-row-btn">+ Add Row</button>` : ''}
    </div>

    <div class="table-wrap" style="overflow-x:auto">
      <table id="dynamic-table">
        <thead style="background:${table.headerColor||'#6366f1'}22">
          <tr>
            <th>#</th>
            ${cols.map(c=>`<th style="color:${table.headerColor||'#818cf8'}">${c.name}</th>`).join('')}
            ${canEdit ? '<th>Actions</th>' : ''}
          </tr>
        </thead>
        <tbody id="dynamic-tbody">
          ${data.length === 0 ? `
            <tr><td colspan="${cols.length+2}" class="table-empty">
              <div class="table-empty-icon">📭</div>
              <div class="table-empty-title">No data yet</div>
              <div class="table-empty-desc">Click "Add Row" to start filling this table</div>
            </td></tr>
          ` : data.map((row, i) => `
            <tr data-row-id="${row.id}">
              <td data-label="#" style="color:var(--text-muted);font-size:12px;width:40px">${i+1}</td>
              ${cols.map(c => `<td data-label="${c.name}">${renderCellValue(row[c.id], c)}</td>`).join('')}
              ${canEdit ? `<td data-label="Actions">
                <div class="table-actions">
                  <button class="action-btn edit" data-row="${row.id}" title="Edit">✏️</button>
                  <button class="action-btn delete" data-row="${row.id}" title="Delete">🗑️</button>
                </div>
              </td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCellValue(val, col) {
  if (val === undefined || val === null || val === '') return '<span style="color:var(--text-disabled)">—</span>';
  switch (col.type) {
    case 'checkbox': return val ? '✅' : '⬜';
    case 'price': return `<strong>$${Number(val).toFixed(2)}</strong>`;
    case 'date': return `<span style="font-family:var(--font-mono);font-size:12px">${val}</span>`;
    case 'status': {
      const cls = val === 'Done' ? 'badge-success' : val === 'In Progress' ? 'badge-warning' : 'badge-muted';
      return `<span class="badge ${cls}">${val}</span>`;
    }
    case 'dropdown': return `<span class="badge badge-info">${val}</span>`;
    case 'tags': return val.split(',').map(t=>`<span class="badge badge-purple" style="margin-right:4px">${t.trim()}</span>`).join('');
    default: return `<span>${val}</span>`;
  }
}

function attachTableListEvents() {
  const user = getCurrentUser();
  const canCreate = ['super_admin','admin'].includes(user.role);

  document.getElementById('create-tbl-btn-empty')?.addEventListener('click', () => showTableBuilderModal(null));
  document.getElementById('back-to-tables')?.addEventListener('click', () => { activeTblId = null; renderTables(); });
  document.getElementById('add-row-btn')?.addEventListener('click', () => showRowModal(activeTblId, null));
  document.getElementById('tbl-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#table-list-body tr').forEach(tr => {
      const text = tr.textContent.toLowerCase();
      tr.style.display = text.includes(q) ? '' : 'none';
    });
  });

  document.querySelectorAll('.action-btn.view[data-tid]').forEach(btn => {
    btn.addEventListener('click', () => { activeTblId = btn.dataset.tid; renderTables(); });
  });
  if (canCreate) {
    document.querySelectorAll('.action-btn.edit[data-tid]').forEach(btn => {
      btn.addEventListener('click', () => { const t = getTables().find(t=>t.id===btn.dataset.tid); showTableBuilderModal(t); });
    });
    document.querySelectorAll('.action-btn.delete[data-tid]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await confirm('Delete this table and all its data?', 'Delete Table');
        if (ok) {
          const res = await deleteTable(btn.dataset.tid);
          if (res && res.error) {
            showToast('Error Deleting Table', res.error, 'error');
            return;
          }
          showToast('Table deleted','','success');
          renderTables();
        }
      });
    });
  }

  // Row events (when in table view)
  document.querySelectorAll('.action-btn.edit[data-row]').forEach(btn => {
    btn.addEventListener('click', () => {
      const data = getTableData(activeTblId);
      const row = data.find(r => r.id === btn.dataset.row);
      showRowModal(activeTblId, row);
    });
  });
  document.querySelectorAll('.action-btn.delete[data-row]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirm('Delete this row?', 'Delete Row');
      if (ok) {
        const res = await deleteTableRow(activeTblId, btn.dataset.row);
        if (res && res.error) {
          showToast('Error Deleting Row', res.error, 'error');
          return;
        }
        showToast('Row deleted','','success');
        renderTables();
      }
    });
  });
}

function showTableBuilderModal(table) {
  const isEdit = !!table;
  const whs = getWarehouses();
  let columns = isEdit ? [...(table.columns||[])] : [];
  let selectedColor = table?.headerColor || '#6366f1';

  const body = document.createElement('div');
  body.innerHTML = `
    <form id="tbl-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Table Name <span class="req">*</span></label>
          <input type="text" id="t-name" class="form-control" value="${table?.name||''}" required placeholder="e.g. Operations Tracker" />
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="t-cat" class="form-control">
            ${CATEGORY_OPTIONS.map(c=>`<option value="${c}" ${table?.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input type="text" id="t-desc" class="form-control" value="${table?.description||''}" placeholder="Brief description of this table" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Assign to Warehouse</label>
          <select id="t-wh" class="form-control">
            <option value="">All warehouses</option>
            ${whs.map(w=>`<option value="${w.id}" ${table?.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Access Roles</label>
          <select id="t-roles" class="form-control" multiple style="height:80px">
            ${['admin','manager','staff','employee'].map(r=>`<option value="${r}" ${(table?.roles||[]).includes(r)?'selected':''}>${capitalize(r)}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Header Color -->
      <div class="form-group">
        <label class="form-label">Header Color</label>
        <div class="color-picker-row" id="color-picker">
          ${HEADER_COLORS.map(c=>`<div class="color-swatch ${c===selectedColor?'selected':''}" style="background:${c}" data-color="${c}"></div>`).join('')}
        </div>
      </div>

      <!-- Columns Builder -->
      <div class="form-group">
        <label class="form-label">Columns <span class="req">*</span></label>
        <div id="columns-list" style="display:flex;flex-direction:column;gap:8px">
          ${columns.map((c,i)=>renderColumnRow(c,i)).join('')}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="add-col-btn" style="margin-top:10px">+ Add Column</button>
      </div>
    </form>
  `;

  // Color picker
  body.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      body.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  });

  // Add column button
  body.querySelector('#add-col-btn')?.addEventListener('click', () => {
    const id = 'c' + Date.now();
    columns.push({ id, name: '', type: 'text', required: false });
    const colList = body.querySelector('#columns-list');
    const div = document.createElement('div');
    div.innerHTML = renderColumnRow(columns[columns.length-1], columns.length-1);
    div.firstElementChild && colList.appendChild(div.firstElementChild);
  });

  const footer = `
    <button class="btn btn-secondary" id="t-cancel">Cancel</button>
    <button class="btn btn-primary" id="t-save">${isEdit?'✓ Update':'+ Create'} Table</button>
  `;

  const modal = createModal({ title: isEdit?'✏️ Edit Table':'📋 Build New Table', body, footer, size: 'lg' });
  modal.el.querySelector('#t-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#t-save')?.addEventListener('click', async () => {
    const name = document.getElementById('t-name').value.trim();
    if (!name) { showToast('Validation','Table name is required','warning'); return; }
    // Collect columns
    const colEls = body.querySelectorAll('.col-row');
    const cols = Array.from(colEls).map((row, i) => ({
      id: columns[i]?.id || 'c'+Date.now()+i,
      name: row.querySelector('.col-name').value.trim() || `Column ${i+1}`,
      type: row.querySelector('.col-type').value,
      required: row.querySelector('.col-req').checked,
      options: row.querySelector('.col-options')?.value || ''
    })).filter(c=>c.name);

    const roles = Array.from(document.getElementById('t-roles').selectedOptions).map(o=>o.value);
    const data = { name, category: document.getElementById('t-cat').value, description: document.getElementById('t-desc').value, warehouseId: document.getElementById('t-wh').value, columns: cols, roles, headerColor: selectedColor };

    let res;
    if (isEdit) {
      res = await updateTable(table.id, data);
      if (res && res.error) {
        showToast('Error Updating Table', res.error, 'error');
        return;
      }
      showToast('Table updated',`${name} updated`,'success');
    } else {
      res = await createTable(data);
      if (res && res.error) {
        showToast('Error Creating Table', res.error, 'error');
        return;
      }
      showToast('Table created',`${name} is ready`,'success');
    }
    modal.close();
    activeTblId = null;
    renderTables();
  });
}

function renderColumnRow(col, i) {
  return `
    <div class="col-row" style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;background:var(--bg-input);border:1px solid var(--border-default);border-radius:8px;padding:10px">
      <input type="text" class="col-name form-control" value="${col.name||''}" placeholder="Column name" style="margin:0" />
      <select class="col-type form-control" style="margin:0;width:130px">
        ${COLUMN_TYPES.map(t=>`<option value="${t}" ${col.type===t?'selected':''}>${capitalize(t)}</option>`).join('')}
      </select>
      <label class="checkbox-group" style="white-space:nowrap">
        <input type="checkbox" class="col-req" ${col.required?'checked':''} />
        <label style="font-size:12px">Req.</label>
      </label>
      <button type="button" class="action-btn delete" title="Remove" style="flex-shrink:0" onclick="this.closest('.col-row').remove()">🗑️</button>
    </div>
  `;
}

function showRowModal(tableId, row) {
  const tables = getTables();
  const table = tables.find(t=>t.id===tableId);
  if (!table) return;
  const isEdit = !!row;
  const cols = table.columns || [];

  const body = `
    <form id="row-form">
      ${cols.map(col => `
        <div class="form-group">
          <label class="form-label">${col.name}${col.required?'<span class="req"> *</span>':''}</label>
          ${renderFieldInput(col, row?row[col.id]:'')}
        </div>
      `).join('')}
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="r-cancel">Cancel</button>
    <button class="btn btn-primary" id="r-save">${isEdit?'✓ Update':'+ Add'} Row</button>
  `;

  const modal = createModal({ title: isEdit?'✏️ Edit Row':'➕ Add New Row', body, footer });
  modal.el.querySelector('#r-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#r-save')?.addEventListener('click', async () => {
    const rowData = {};
    let hasValidationError = false;
    cols.forEach(col => {
      const inp = document.getElementById(`rf-${col.id}`);
      if (!inp) return;
      rowData[col.id] = col.type === 'checkbox' ? inp.checked : inp.value;
      if (col.required && !rowData[col.id] && col.type !== 'checkbox') {
        showToast('Validation',`${col.name} is required`,'warning');
        hasValidationError = true;
      }
    });
    if (hasValidationError) return;

    let res;
    if (isEdit) {
      res = await updateTableRow(tableId, row.id, rowData);
      if (res && res.error) {
        showToast('Error Updating Row', res.error, 'error');
        return;
      }
      showToast('Row updated','','success');
    } else {
      res = await addTableRow(tableId, rowData);
      if (res && res.error) {
        showToast('Error Adding Row', res.error, 'error');
        return;
      }
      showToast('Row added','','success');
    }
    modal.close();
    renderTables();
  });
}

function renderFieldInput(col, value) {
  const id = `rf-${col.id}`;
  switch (col.type) {
    case 'text': return `<input type="text" id="${id}" class="form-control" value="${value||''}" />`;
    case 'number': return `<input type="number" id="${id}" class="form-control" value="${value||''}" />`;
    case 'price': return `<input type="number" id="${id}" class="form-control" value="${value||''}" step="0.01" min="0" />`;
    case 'date': return `<input type="date" id="${id}" class="form-control" value="${value||''}" />`;
    case 'checkbox': return `<label class="checkbox-group"><input type="checkbox" id="${id}" ${value?'checked':''} /><label>Check if applicable</label></label>`;
    case 'dropdown': {
      const opts = (col.options||'').split(',').filter(Boolean);
      return `<select id="${id}" class="form-control">${opts.map(o=>`<option value="${o}" ${value===o?'selected':''}>${o}</option>`).join('')}</select>`;
    }
    case 'status': return `<select id="${id}" class="form-control"><option value="Todo" ${value==='Todo'?'selected':''}>Todo</option><option value="In Progress" ${value==='In Progress'?'selected':''}>In Progress</option><option value="Done" ${value==='Done'?'selected':''}>Done</option></select>`;
    case 'tags': return `<input type="text" id="${id}" class="form-control" value="${value||''}" placeholder="Separate tags with commas" />`;
    default: return `<input type="text" id="${id}" class="form-control" value="${value||''}" />`;
  }
}
