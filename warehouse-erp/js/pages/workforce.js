/**
 * Workforce Management Page — User CRUD with role assignment
 */
import { getCurrentUser, getAllUsers, createUser, updateUser, deleteUser, getWarehouses } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, confirm, createModal, formatDate, formatDateTime, filterData, roleBadge, statusBadge, capitalize, debounce } from '../modules/ui.js';
import { navigate } from '../modules/router.js';

let wf_searchQ = '';
let roleFilter = '';
let wf_whFilter = '';
let wf_page = 1;
const wf_PER_PAGE = 10;

export function renderWorkforce() {
  const user = getCurrentUser();
  if (!user || user.role === 'employee' || user.role === 'staff') { navigate('/dashboard'); return; }

  const whs = getWarehouses();

  renderShell('Workforce', 'Manage users, roles, and warehouse assignments', `
    <div class="animate-slideUp">
      <div class="wf_page-header">
        <div class="wf_page-header-left">
          <h1 class="wf_page-title">👥 Workforce Management</h1>
          <p class="wf_page-subtitle">Centralized user and role management across all warehouses</p>
        </div>
        <div class="wf_page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${['super_admin', 'admin'].includes(user.role) ? `<button class="btn btn-primary" id="create-user-btn">+ Add User</button>` : ''}
        </div>
      </div>

      <!-- Stats Row -->
      <div id="workforce-stats"></div>

      <!-- Table Toolbar -->
      <div class="table-toolbar">
        <div class="table-search">
          <span>🔍</span>
          <input type="text" id="wf-search" placeholder="Search by name, email..." />
        </div>
        <div class="table-filter">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="role-filter">
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="staff">Staff</option>
            <option value="employee">Employee</option>
          </select>
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="wh-filter-wf">
            <option value="">All Warehouses</option>
            ${whs.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Table -->
      <div id="workforce-table-container"></div>
      <div id="workforce-pagination" style="margin-top:0"></div>
    </div>
  `);

  renderWorkforceStats();
  renderWorkforceTable();

  document.getElementById('create-user-btn')?.addEventListener('click', () => showUserModal(null));
  const debouncedSearch = debounce(q => {
    wf_searchQ = q;
    wf_page = 1;
    renderWorkforceTable();
  }, 300);

  document.getElementById('wf-search')?.addEventListener('input', e => debouncedSearch(e.target.value));
  document.getElementById('role-filter')?.addEventListener('change', e => { roleFilter = e.target.value; wf_page = 1; renderWorkforceTable(); });
  document.getElementById('wh-filter-wf')?.addEventListener('change', e => { wf_whFilter = e.target.value; wf_page = 1; renderWorkforceTable(); });
}

function renderWorkforceStats() {
  const users = getAllUsers();
  const whs = getWarehouses();
  const roles = ['admin','manager','staff','employee'];
  const el = document.getElementById('workforce-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">👤</div>
        <div class="stat-card-value">${users.length}</div>
        <div class="stat-card-label">Total Users</div>
      </div>
      ${roles.map(r => {
        const count = users.filter(u=>u.role===r).length;
        const colors = {admin:'rgba(6,182,212,0.15)',manager:'rgba(16,185,129,0.15)',staff:'rgba(245,158,11,0.15)',employee:'rgba(100,116,139,0.15)'};
        const icons = {admin:'🏭',manager:'👔',staff:'🧾',employee:'👨‍💼'};
        return `<div class="stat-card"><div class="stat-card-icon" style="background:${colors[r]}">${icons[r]}</div><div class="stat-card-value">${count}</div><div class="stat-card-label">${capitalize(r)}s</div></div>`;
      }).join('')}
    </div>
  `;
}

function renderWorkforceTable() {
  const currentUser = getCurrentUser();
  let users = getAllUsers();
  const whs = getWarehouses();
  if (wf_searchQ) users = filterData(users, wf_searchQ, ['name','email','role']);
  if (roleFilter) users = users.filter(u => u.role === roleFilter);
  if (wf_whFilter) users = users.filter(u => u.warehouseId === wf_whFilter);

  const total = users.length;
  const wf_pages = Math.ceil(total / wf_PER_PAGE);
  const start = (wf_page - 1) * wf_PER_PAGE;
  const wf_pageUsers = users.slice(start, start + wf_PER_PAGE);

  const container = document.getElementById('workforce-table-container');
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:40px;margin-bottom:16px;opacity:0.4">👤</div><h3 style="color:var(--text-secondary)">No users found</h3></div>`;
    document.getElementById('workforce-pagination').innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Warehouse</th>
          <th>Status</th>
          <th>Assigned Date</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>
          ${wf_pageUsers.map(u => {
            const wh = whs.find(w => w.id === u.warehouseId);
            return `<tr>
              <td data-label="Name">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:32px;height:32px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0">${u.avatar}</div>
                  <div>
                    <div class="primary-cell">${u.name}</div>
                    <div class="sub-cell">ID: ${u.id.slice(0,8)}</div>
                  </div>
                </div>
              </td>
              <td data-label="Email"><span style="font-family:var(--font-mono);font-size:12px">${u.email}</span></td>
              <td data-label="Role">${roleBadge(u.role)}</td>
              <td data-label="Warehouse"><span class="badge badge-info">${wh ? wh.name : '—'}</span></td>
              <td data-label="Status">${statusBadge(u.status)}</td>
              <td data-label="Assigned">${formatDate(u.assignedAt || u.createdAt)}</td>
              <td data-label="Actions">
                ${['super_admin', 'admin'].includes(currentUser.role) ? `
                <div class="table-actions">
                  <button class="action-btn edit" data-uid="${u.id}" title="Edit">✏️</button>
                  <button class="action-btn delete" data-uid="${u.id}" title="Delete">🗑️</button>
                </div>` : '—'}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+wf_PER_PAGE,total)} of ${total} users</div>
        <div class="pagination-controls">
          <button class="wf_page-btn" id="pg-prev" ${wf_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:wf_pages},(_, i)=>`<button class="wf_page-btn ${wf_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="wf_page-btn" id="pg-next" ${wf_page>=wf_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;

  // Events
  container.querySelectorAll('.action-btn.edit[data-uid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = getAllUsers().find(u => u.id === btn.dataset.uid);
      showUserModal(u);
    });
  });
  container.querySelectorAll('.action-btn.delete[data-uid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirm('Remove this user from the platform?', 'Remove User');
      if (ok) {
        const result = await deleteUser(btn.dataset.uid);
        if (result && result.error) {
          showToast('Error', result.error, 'error');
        } else {
          showToast('User removed', '', 'success');
          renderWorkforceStats();
          renderWorkforceTable();
        }
      }
    });
  });
  container.querySelectorAll('.wf_page-btn[data-pg]').forEach(btn => {
    btn.addEventListener('click', () => { wf_page = parseInt(btn.dataset.pg); renderWorkforceTable(); });
  });
  container.querySelector('#pg-prev')?.addEventListener('click', () => { if (wf_page > 1) { wf_page--; renderWorkforceTable(); } });
  container.querySelector('#pg-next')?.addEventListener('click', () => { if (wf_page < wf_pages) { wf_page++; renderWorkforceTable(); } });
}

function showUserModal(u) {
  const isEdit = !!u;
  const whs = getWarehouses();
  const currentUser = getCurrentUser();
  const availableRoles = currentUser.role === 'super_admin'
    ? ['admin','manager','staff','employee']
    : ['manager','staff','employee'];

  const body = `
    <form id="user-modal-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Full Name <span class="req">*</span></label>
          <input type="text" id="m-u-name" class="form-control" value="${u?.name||''}" required placeholder="First and last name" />
        </div>
        <div class="form-group">
          <label class="form-label">Email <span class="req">*</span></label>
          <input type="email" id="m-u-email" class="form-control" value="${u?.email||''}" required placeholder="work@company.com" ${isEdit?'readonly':''} />
        </div>
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label class="form-label">Password <span class="req">*</span></label>
        <input type="password" id="m-u-password" class="form-control" required placeholder="Min 8 characters" minlength="8" />
      </div>` : ''}
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Role <span class="req">*</span></label>
          <select id="m-u-role" class="form-control" required>
            ${availableRoles.map(r=>`<option value="${r}" ${u?.role===r?'selected':''}>${capitalize(r)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Assign Warehouse <span class="req">*</span></label>
          <select id="m-u-wh" class="form-control" required>
            <option value="">Select warehouse</option>
            ${whs.map(w=>`<option value="${w.id}" ${u?.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
      </div>
      ${isEdit ? `
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="m-u-status" class="form-control">
          <option value="active" ${u?.status==='active'?'selected':''}>Active</option>
          <option value="inactive" ${u?.status==='inactive'?'selected':''}>Inactive</option>
        </select>
      </div>` : ''}
      <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:12px;font-size:12px;color:var(--text-muted)">
        ℹ️ Auto-generated: Created date, assignment timestamp, and audit trail will be recorded automatically.
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="m-u-cancel">Cancel</button>
    <button class="btn btn-primary" id="m-u-save">${isEdit ? '✓ Update' : '+ Add'} User</button>
  `;

  const modal = createModal({ title: isEdit ? '✏️ Edit User' : '👤 Add New User', body, footer });
  modal.el.querySelector('#m-u-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#m-u-save')?.addEventListener('click', async () => {
    const name = document.getElementById('m-u-name').value.trim();
    const email = document.getElementById('m-u-email').value.trim();
    const role = document.getElementById('m-u-role').value;
    const warehouseId = document.getElementById('m-u-wh').value;
    if (!name || !email || !role || !warehouseId) { showToast('Validation', 'Fill all required fields', 'warning'); return; }
    if (isEdit) {
      const data = { name, role, warehouseId, status: document.getElementById('m-u-status').value };
      const result = await updateUser(u.id, data);
      if (result && result.error) { showToast('Error', result.error, 'error'); return; }
      showToast('User updated', `${name}'s details updated`, 'success');
    } else {
      const password = document.getElementById('m-u-password').value;
      if (!password || password.length < 8) { showToast('Validation', 'Password must be at least 8 characters', 'warning'); return; }
      const result = await createUser({ name, email, password, role, warehouseId });
      if (result && result.error) { showToast('Error', result.error, 'error'); return; }
      showToast('User created', `${name} added as ${role}`, 'success');
    }
    modal.close();
    renderWorkforceStats();
    renderWorkforceTable();
  });
}
