/**
 * Workforce Management Page — User CRUD with role assignment, view modes, and user profile panel
 */
import { getCurrentUser, getAllUsers, createUser, updateUser, deleteUser, getWarehouses, getAuditLogs, apiFetch } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, confirm, createModal, formatDate, formatDateTime, filterData, roleBadge, statusBadge, capitalize, debounce, getSvgIcon, renderAvatar, renderAvatarContainer, generateBarcodeSVG, updateDOMAvatars } from '../modules/ui.js';
import { navigate } from '../modules/router.js';
import { resolvePermissions, getAllRoles, ALL_MODULES, ALL_ACTIONS, canDo } from '../modules/permissions.js';

let wf_searchQ = '';
let roleFilter = '';
let wf_whFilter = '';
let wf_page = 1;
const wf_PER_PAGE = 10;
let wf_viewMode = localStorage.getItem('wareops_wf_view') || 'table'; // table | card | grid

export function renderWorkforce() {
  const user = getCurrentUser();
  if (!user || !canDo('workforce', 'view')) { navigate('/dashboard'); return; }

  const whs = getWarehouses();
  let activeWfTab = 'members';

  const updateWfTabUI = () => {
    const tabHeaders = document.querySelectorAll('.wf-tab-header');
    tabHeaders.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === activeWfTab);
    });

    const contentArea = document.getElementById('workforce-tab-content');
    if (!contentArea) return;

    if (activeWfTab === 'members') {
      contentArea.innerHTML = `
        <!-- Table Toolbar -->
        <div class="table-toolbar">
          <div class="table-search">
            <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span>
            <input type="text" id="wf-search" placeholder="Search by name, email..." value="${wf_searchQ}" />
          </div>
          <div class="table-filter">
            <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="role-filter">
              <option value="">All Roles</option>
              ${getAllRoles().map(r => `<option value="${r.id}" ${roleFilter === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
            </select>
            <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="wh-filter-wf">
              <option value="">All Warehouses</option>
              ${whs.map(w=>`<option value="${w.id}" ${wf_whFilter === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
            </select>
          </div>
          <!-- View Mode Toggle -->
          <div class="view-mode-toggle" id="wf-view-toggle">
            <button class="view-mode-btn ${wf_viewMode==='table'?'active':''}" data-view="table" title="Table View">${getSvgIcon('tables', 14)}</button>
            <button class="view-mode-btn ${wf_viewMode==='card'?'active':''}" data-view="card" title="Card View">${getSvgIcon('warehouse', 14)}</button>
            <button class="view-mode-btn ${wf_viewMode==='grid'?'active':''}" data-view="grid" title="Grid View">${getSvgIcon('dashboard', 14)}</button>
          </div>
        </div>

        <!-- User List Container -->
        <div id="workforce-table-container"></div>
        <div id="workforce-pagination" style="margin-top:0"></div>
      `;

      renderWorkforceTable();
      bindMembersTabEvents();
    } else {
      renderPendingDocumentsQueue(contentArea);
    }
  };

  const bindMembersTabEvents = () => {
    document.getElementById('create-user-btn')?.addEventListener('click', () => showUserModal(null));
    
    const debouncedSearch = debounce(q => {
      wf_searchQ = q;
      wf_page = 1;
      renderWorkforceTable();
    }, 300);

    document.getElementById('wf-search')?.addEventListener('input', e => debouncedSearch(e.target.value));
    document.getElementById('role-filter')?.addEventListener('change', e => { roleFilter = e.target.value; wf_page = 1; renderWorkforceTable(); });
    document.getElementById('wh-filter-wf')?.addEventListener('change', e => { wf_whFilter = e.target.value; wf_page = 1; renderWorkforceTable(); });

    // View mode buttons
    document.getElementById('wf-view-toggle')?.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        wf_viewMode = btn.dataset.view;
        localStorage.setItem('wareops_wf_view', wf_viewMode);
        document.querySelectorAll('#wf-view-toggle .view-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.view === wf_viewMode));
        renderWorkforceTable();
      });
    });
  };

  renderShell('Workforce', 'Manage users, roles, and warehouse assignments', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Workforce Management</h1>
          <p class="page-subtitle">Centralized user and role management across all warehouses</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canDo('settings', 'manage') ? `<button class="btn btn-ghost btn-sm" onclick="location.hash='#/roles'">${getSvgIcon('workforce', 13)} Roles</button>` : ''}
          ${canDo('workforce', 'create') ? `<button class="btn btn-primary" id="create-user-btn">+ Add User</button>` : ''}
        </div>
      </div>

      <!-- Stats Row -->
      <div id="workforce-stats"></div>

      <!-- Tab Navigation -->
      <div class="table-toolbar" style="margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:0;gap:4px">
        <button class="wf-tab-header btn btn-ghost btn-sm active" data-tab="members" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Workforce Members</button>
        ${(user.role === 'super_admin' || user.role === 'admin' || user.role === 'manager') ? `
          <button class="wf-tab-header btn btn-ghost btn-sm" data-tab="documents" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Document Review Queue</button>
        ` : ''}
      </div>

      <!-- Tab Content Area -->
      <div id="workforce-tab-content"></div>
    </div>
  `);

  renderWorkforceStats();
  updateWfTabUI();

  // Bind tab header click events
  document.querySelectorAll('.wf-tab-header').forEach(btn => {
    btn.addEventListener('click', () => {
      activeWfTab = btn.dataset.tab;
      updateWfTabUI();
    });
  });

  const _handleWorkforceStorageSync = () => {
    const u = getCurrentUser();
    if (!u) {
      window.removeEventListener('wareops_storage_sync', _handleWorkforceStorageSync);
      return;
    }
    renderWorkforceStats();
    if (activeWfTab === 'members') {
      renderWorkforceTable();
    } else {
      const contentArea = document.getElementById('workforce-tab-content');
      if (contentArea) renderPendingDocumentsQueue(contentArea);
    }
  };

  window.removeEventListener('wareops_storage_sync', _handleWorkforceStorageSync);
  window.addEventListener('wareops_storage_sync', _handleWorkforceStorageSync);
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
        <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">${getSvgIcon('user', 20)}</div>
        <div class="stat-card-value">${users.length}</div>
        <div class="stat-card-label">Total Users</div>
      </div>
      ${roles.map(r => {
        const count = users.filter(u=>u.role===r).length;
        const colors = {admin:'rgba(6,182,212,0.15)',manager:'rgba(16,185,129,0.15)',staff:'rgba(245,158,11,0.15)',employee:'rgba(100,116,139,0.15)'};
        const icons = {
          admin: getSvgIcon('warehouses', 20),
          manager: getSvgIcon('workforce', 20),
          staff: getSvgIcon('billing', 20),
          employee: getSvgIcon('user', 20)
        };
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
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="margin-bottom:16px;opacity:0.4;display:flex;justify-content:center">${getSvgIcon('user', 40)}</div><h3 style="color:var(--text-secondary)">No users found</h3></div>`;
    document.getElementById('workforce-pagination').innerHTML = '';
    return;
  }

  if (wf_viewMode === 'card') {
    renderCardView(wf_pageUsers, whs, currentUser, container);
  } else if (wf_viewMode === 'grid') {
    renderGridView(wf_pageUsers, whs, currentUser, container);
  } else {
    renderTableView(wf_pageUsers, whs, currentUser, container, start, total);
  }

  // Pagination
  const paginationEl = document.getElementById('workforce-pagination');
  if (paginationEl && wf_viewMode !== 'table') {
    paginationEl.innerHTML = `
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+wf_PER_PAGE,total)} of ${total} users</div>
        <div class="pagination-controls">
          <button class="wf_page-btn" id="pg-prev" ${wf_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:wf_pages},(_,i)=>`<button class="wf_page-btn ${wf_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="wf_page-btn" id="pg-next" ${wf_page>=wf_pages?'disabled':''}>›</button>
        </div>
      </div>`;
  }

  bindProfileButtons(container);
  bindPaginationButtons(container, paginationEl, wf_pages);

  // Edit/Delete
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
}

function renderTableView(pageUsers, whs, currentUser, container, start, total) {
  const wf_pages = Math.ceil(total / wf_PER_PAGE);
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
          ${pageUsers.map(u => {
            const wh = whs.find(w => w.id === u.warehouseId);
            return `<tr>
                <td data-label="Name">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="wf-avatar-cell" data-uid="${u.id}" style="cursor:pointer" title="View Profile">
                    ${renderAvatarContainer(u.avatar, u.name, 32)}
                  </div>
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
                <div class="table-actions">
                  <button class="action-btn view profile-btn" data-uid="${u.id}" title="View Profile">${getSvgIcon('view', 14)}</button>
                  <button class="action-btn view idcard-btn" data-uid="${u.id}" title="Generate ID Card">🪪</button>
                  ${canDo('workforce', 'edit') ? `<button class="action-btn edit" data-uid="${u.id}" title="Edit">${getSvgIcon('edit', 14)}</button>` : ''}
                  ${canDo('workforce', 'delete') ? `<button class="action-btn delete" data-uid="${u.id}" title="Delete">${getSvgIcon('trash', 14)}</button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+wf_PER_PAGE,total)} of ${total} users</div>
        <div class="pagination-controls">
          <button class="wf_page-btn" id="pg-prev" ${wf_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:wf_pages},(_,i)=>`<button class="wf_page-btn ${wf_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="wf_page-btn" id="pg-next" ${wf_page>=wf_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;
}

function renderCardView(pageUsers, whs, currentUser, container) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin-bottom:16px">
      ${pageUsers.map(u => {
        const wh = whs.find(w => w.id === u.warehouseId);
        return `
          <div class="card" style="padding:0;overflow:hidden;transition:transform 0.15s,box-shadow 0.15s" onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow-lg)'" onmouseleave="this.style.transform='';this.style.boxShadow=''">
            <div style="height:4px;background:var(--gradient-brand)"></div>
            <div style="padding:20px">
              <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
                <div class="wf-avatar-cell" data-uid="${u.id}" style="cursor:pointer;flex-shrink:0" title="View Profile">
                  ${renderAvatarContainer(u.avatar, u.name, 48)}
                </div>
                <div style="min-width:0">
                  <div style="font-size:15px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${u.email}</div>
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
                ${roleBadge(u.role)}
                ${statusBadge(u.status)}
                <span class="badge badge-info">${wh ? wh.name : '—'}</span>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Since ${formatDate(u.assignedAt || u.createdAt)}</div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-secondary btn-xs profile-btn" data-uid="${u.id}">${getSvgIcon('view', 12)} Profile</button>
                <button class="btn btn-secondary btn-xs idcard-btn" data-uid="${u.id}">🪪 ID Card</button>
                ${canDo('workforce', 'edit') ? `<button class="action-btn edit btn-xs" data-uid="${u.id}">${getSvgIcon('edit', 12)}</button>` : ''}
                ${canDo('workforce', 'delete') ? `<button class="action-btn delete btn-xs" data-uid="${u.id}">${getSvgIcon('trash', 12)}</button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderGridView(pageUsers, whs, currentUser, container) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:16px">
      ${pageUsers.map(u => {
        const wh = whs.find(w => w.id === u.warehouseId);
        return `
          <div class="card" style="padding:20px 16px;text-align:center;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s" 
            onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='var(--shadow-lg)'" 
            onmouseleave="this.style.transform='';this.style.boxShadow=''">
            <div class="wf-avatar-cell" data-uid="${u.id}" style="display:inline-block;cursor:pointer;margin-bottom:12px" title="View Profile">
              ${renderAvatarContainer(u.avatar, u.name, 56)}
            </div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
            <div style="margin:6px 0">${roleBadge(u.role)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${wh ? wh.name : '—'}</div>
            <div style="margin-top:10px;display:flex;gap:6px;justify-content:center">
              <button class="action-btn view btn-xs profile-btn" data-uid="${u.id}" title="Profile">${getSvgIcon('view', 12)}</button>
              <button class="action-btn view btn-xs idcard-btn" data-uid="${u.id}" title="ID Card">🪪</button>
              ${canDo('workforce', 'edit') ? `
                <button class="action-btn edit btn-xs" data-uid="${u.id}" title="Edit">${getSvgIcon('edit', 12)}</button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function bindProfileButtons(container) {
  const allUsers = getAllUsers();
  container.querySelectorAll('.profile-btn, .wf-avatar-cell').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const uid = el.dataset.uid;
      const u = allUsers.find(u => u.id === uid);
      if (u) showUserProfilePanel(u);
    });
  });
  container.querySelectorAll('.idcard-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const uid = el.dataset.uid;
      const u = allUsers.find(usr => usr.id === uid);
      if (u) {
        const { showIDCardModal } = await import('./profile.js');
        showIDCardModal(u);
      }
    });
  });
}

function bindPaginationButtons(container, paginationEl, wf_pages) {
  const allContainers = [container, paginationEl];
  allContainers.forEach(el => {
    if (!el) return;
    el.querySelectorAll('.wf_page-btn[data-pg]').forEach(btn => {
      btn.addEventListener('click', () => { wf_page = parseInt(btn.dataset.pg); renderWorkforceTable(); });
    });
    el.querySelector('#pg-prev')?.addEventListener('click', () => { if (wf_page > 1) { wf_page--; renderWorkforceTable(); } });
    el.querySelector('#pg-next')?.addEventListener('click', () => { if (wf_page < wf_pages) { wf_page++; renderWorkforceTable(); } });
  });
}

function showUserProfilePanel(u) {
  const whs = getWarehouses();
  const allRoles = getAllRoles();
  const wh = whs.find(w => w.id === u.warehouseId);
  const perms = resolvePermissions(u);
  const roleObj = allRoles.find(r => r.id === u.role || r.key === u.role);
  const logs = getAuditLogs().filter(l => l.userId === u.id).slice(0, 6);

  // Permission summary rows
  const permRows = Object.entries(perms).filter(([,v]) => v.view).map(([mod]) => `
    <div style="display:flex;align-items:center;gap:6px;padding:3px 0">
      <div style="width:6px;height:6px;border-radius:50%;background:var(--accent-emerald);flex-shrink:0"></div>
      <span style="font-size:12px;color:var(--text-secondary);text-transform:capitalize">${mod}</span>
    </div>
  `).join('');

  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <!-- Left: User Info -->
      <div>
        <div style="text-align:center;padding:20px 0 16px;border-bottom:1px solid var(--border-subtle);margin-bottom:16px">
          <div style="display:inline-block;margin-bottom:12px">${renderAvatarContainer(u.avatar, u.name, 72)}</div>
          <div style="font-size:18px;font-weight:800;color:var(--text-primary)">${u.name}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${u.email}</div>
          <div style="margin-top:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
            ${roleBadge(u.role)}
            ${statusBadge(u.status)}
          </div>
        </div>
        <div style="font-size:12px;line-height:1.8;color:var(--text-secondary)">
          <div><strong>Role:</strong> ${roleObj ? roleObj.name : u.role}</div>
          <div><strong>Warehouse:</strong> ${wh ? wh.name : '—'}</div>
          <div><strong>User ID:</strong> <span style="font-family:var(--font-mono)">${u.id.slice(0,12)}...</span></div>
          <div><strong>Joined:</strong> ${formatDate(u.assignedAt || u.createdAt)}</div>
          ${u.barcode ? `<div><strong>Barcode:</strong> <span style="font-family:var(--font-mono);font-size:11px">${u.barcode}</span></div>` : ''}
        </div>

        <div style="margin-top:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:8px">Module Access</div>
          <div style="columns:2;column-gap:16px">${permRows || '<span style="font-size:12px;color:var(--text-muted)">No module access</span>'}</div>
        </div>
      </div>

      <!-- Right: Activity -->
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:12px">Recent Activity</div>
        ${logs.length === 0 ? `<div style="font-size:13px;color:var(--text-muted);text-align:center;padding:24px">No recent activity</div>` : 
          logs.map(l => `
            <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
              <div style="width:6px;height:6px;border-radius:50%;background:var(--accent-indigo);flex-shrink:0;margin-top:5px"></div>
              <div>
                <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${l.action.replace(/_/g,' ')}</div>
                <div style="font-size:11px;color:var(--text-muted)">${l.description}</div>
                <div style="font-size:10px;color:var(--text-disabled);margin-top:2px">${formatDateTime(l.timestamp)}</div>
              </div>
            </div>
          `).join('')
        }

        ${wh ? `
          <div style="margin-top:20px;padding:14px;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle)">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:8px">Assigned Warehouse</div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${wh.name}</div>
            ${wh.address ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${wh.address}</div>` : ''}
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${wh.staffCount || 0} staff · ${wh.items || 0} items</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  const footer = `
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" id="pp-close">Close</button>
      <button class="btn btn-secondary" id="pp-idcard" data-uid="${u.id}">🪪 ID Card</button>
      ${canDo('workforce', 'edit') ? `<button class="btn btn-primary" id="pp-edit" data-uid="${u.id}">Edit User</button>` : ''}
    </div>
  `;

  const modal = createModal({ title: `User Profile — ${u.name}`, body, footer, width: '820px' });
  modal.el.querySelector('#pp-close')?.addEventListener('click', modal.close);
  modal.el.querySelector('#pp-idcard')?.addEventListener('click', async () => {
    modal.close();
    const { showIDCardModal } = await import('./profile.js');
    showIDCardModal(u);
  });
  modal.el.querySelector('#pp-edit')?.addEventListener('click', () => {
    modal.close();
    showUserModal(u);
  });
}


function showUserModal(u) {
  const isEdit = !!u;
  const whs = getWarehouses();
  const currentUser = getCurrentUser();
  const allRoles = getAllRoles();
  const availableRoles = currentUser.role === 'super_admin'
    ? allRoles.filter(r => r.id !== 'super_admin')
    : allRoles.filter(r => r.id !== 'super_admin' && r.id !== 'admin');

  let m_avatar = u?.avatar || '';
  const barcodeUrl = u?.barcode ? `http://localhost:8000/api/v1/registry/barcode?code=${u.barcode}` : '';

  const body = `
    <form id="user-modal-form">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-subtle)">
        <div id="m-u-avatar-preview" style="width:60px;height:60px;border-radius:50%;${m_avatar && (m_avatar.startsWith('data:') || m_avatar.startsWith('http')) ? 'background:transparent;border:1px solid var(--border-default);' : 'background:var(--gradient-brand);'}display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:white;overflow:hidden;flex-shrink:0">
          ${renderAvatar(m_avatar, "width:100%;height:100%;object-fit:cover;border-radius:50%")}
        </div>
        <div style="flex:1">
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-xs" id="m-u-upload-photo-btn" type="button" style="padding:4px 8px;font-size:11px">Upload Photo</button>
            <button class="btn btn-ghost btn-xs" id="m-u-remove-photo-btn" type="button" style="padding:4px 8px;font-size:11px;color:var(--text-danger)">Remove</button>
          </div>
          <input type="file" id="m-u-photo-input" accept="image/*" style="display:none" />
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Upload profile photo (max 2MB)</div>
        </div>
        ${u?.barcode ? `
        <div style="text-align:right">
          <div style="background:white;padding:4px;border-radius:4px;display:inline-block;border:1px solid var(--border-default);">
            ${generateBarcodeSVG(u.barcode, { height: 32, color: '#111', showLabel: true })}
          </div>
        </div>
        ` : ''}
      </div>
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
            ${availableRoles.map(r=>`<option value="${r.id}" ${u?.role===r.id?'selected':''}>${r.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Assign Warehouse</label>
          <select id="m-u-wh" class="form-control">
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

      ${isEdit && currentUser.role === 'super_admin' ? `
      <!-- User-Level Permission Overrides -->
      <div style="border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;margin-top:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">User-Level Permission Overrides</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Overrides take priority over role defaults. Only set what differs.</div>
          </div>
          <button type="button" class="btn btn-ghost btn-xs" id="m-u-clear-overrides">Clear All</button>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle)">
                <th style="text-align:left;padding:4px 6px;color:var(--text-muted);font-weight:600">Module</th>
                ${ALL_ACTIONS.map(a => `<th style="text-align:center;padding:4px 3px;color:var(--text-muted);font-weight:600;font-size:10px;text-transform:uppercase">${a.slice(0,3)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${ALL_MODULES.map(mod => {
                const rolePerms = resolvePermissions(u);
                const overrides = u?.permissionOverrides?.[mod.key] || {};
                return `<tr style="border-bottom:1px solid var(--border-subtle)">
                  <td style="padding:4px 6px;font-weight:600;color:var(--text-secondary)">${mod.label}</td>
                  ${ALL_ACTIONS.map(action => {
                    // tri-state: override-true (checked+data-ov), override-false (unchecked+data-ov), inherit (no data-ov)
                    const hasOverride = mod.key in (u?.permissionOverrides || {}) && action in overrides;
                    const isChecked = hasOverride ? overrides[action] : rolePerms[mod.key]?.[action];
                    return `<td style="text-align:center;padding:4px 2px">
                      <input type="checkbox" class="user-perm-ov" data-mod="${mod.key}" data-action="${action}"
                        ${isChecked ? 'checked' : ''}
                        ${hasOverride ? 'data-override="1"' : ''}
                        style="width:13px;height:13px;cursor:pointer;accent-color:${hasOverride ? 'var(--accent-amber)' : 'var(--accent-emerald)'}" />
                    </td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:8px">
          <span style="color:var(--accent-amber)">●</span> Amber = user override active &nbsp;
          <span style="color:var(--accent-emerald)">●</span> Green = inherited from role
        </div>
      </div>` : ''}

      <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:12px;font-size:12px;color:var(--text-muted)">
        ℹ️ Auto-generated: Created date, assignment timestamp, and audit trail will be recorded automatically.
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="m-u-cancel">Cancel</button>
    <button class="btn btn-primary" id="m-u-save">${isEdit ? 'Update' : 'Add'} User</button>
  `;

  const modal = createModal({ title: isEdit ? 'Edit User' : 'Add New User', body, footer });
  modal.el.querySelector('#m-u-cancel')?.addEventListener('click', modal.close);

  modal.el.querySelector('#m-u-upload-photo-btn')?.addEventListener('click', () => {
    modal.el.querySelector('#m-u-photo-input')?.click();
  });

  // Clear all overrides button
  modal.el.querySelector('#m-u-clear-overrides')?.addEventListener('click', () => {
    modal.el.querySelectorAll('.user-perm-ov').forEach(cb => {
      cb.removeAttribute('data-override');
      cb.style.accentColor = 'var(--accent-emerald)';
    });
    showToast('Overrides cleared', 'All permissions will inherit from role', 'info');
  });

  // Live accent color toggle as user edits
  modal.el.addEventListener('change', (e) => {
    if (e.target.classList.contains('user-perm-ov')) {
      e.target.setAttribute('data-override', '1');
      e.target.style.accentColor = 'var(--accent-amber)';
    }
  });

  modal.el.querySelector('#m-u-photo-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('File too large', 'Please upload an image smaller than 2MB', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      m_avatar = base64;
      const preview = modal.el.querySelector('#m-u-avatar-preview');
      if (preview) {
        preview.style.background = 'transparent';
        preview.style.border = '1px solid var(--border-default)';
        preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`;
      }
    };
    reader.readAsDataURL(file);
  });

  modal.el.querySelector('#m-u-remove-photo-btn')?.addEventListener('click', () => {
    m_avatar = '';
    const preview = modal.el.querySelector('#m-u-avatar-preview');
    if (preview) {
      preview.style.background = 'var(--gradient-brand)';
      preview.style.border = 'none';
      preview.innerHTML = `<svg style="width:60%;height:60%;display:block;color:rgba(255,255,255,0.95);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
  });

  modal.el.querySelector('#m-u-save')?.addEventListener('click', async () => {
    const name = document.getElementById('m-u-name').value.trim();
    const email = document.getElementById('m-u-email').value.trim();
    const role = document.getElementById('m-u-role').value;
    const warehouseId = document.getElementById('m-u-wh').value;
    if (!name || !email || !role || (role !== 'super_admin' && !warehouseId)) { showToast('Validation', 'Fill all required fields', 'warning'); return; }
    
    // Set avatar fallback if empty
    if (!m_avatar) {
      m_avatar = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    }

    if (isEdit) {
      // Collect user-level permission overrides (super_admin only)
      let permissionOverrides = u?.permissionOverrides || {};
      if (currentUser.role === 'super_admin') {
        permissionOverrides = {};
        const rolePerms = resolvePermissions(u);
        modal.el.querySelectorAll('.user-perm-ov').forEach(cb => {
          const mod = cb.dataset.mod;
          const action = cb.dataset.action;
          const roleDefault = !!(rolePerms[mod]?.[action]);
          if (cb.checked !== roleDefault) {
            if (!permissionOverrides[mod]) permissionOverrides[mod] = {};
            permissionOverrides[mod][action] = cb.checked;
          }
        });
      }
      const data = { name, role, warehouseId, status: document.getElementById('m-u-status').value, avatar: m_avatar, permissionOverrides };
      const result = await updateUser(u.id, data);
      if (result && result.error) { showToast('Error', result.error, 'error'); return; }
      showToast('User updated', `${name}'s details updated`, 'success');
      const curUser = getCurrentUser();
      if (u.id === curUser.id) {
        updateDOMAvatars(m_avatar, name);
      }
    } else {
      const password = document.getElementById('m-u-password').value;
      if (!password || password.length < 8) { showToast('Validation', 'Password must be at least 8 characters', 'warning'); return; }
      const result = await createUser({ name, email, password, role, warehouseId, avatar: m_avatar });
      if (result && result.error) { showToast('Error', result.error, 'error'); return; }
      showToast('User created', `${name} added as ${role}`, 'success');
    }
    modal.close();
    renderWorkforceStats();
    renderWorkforceTable();
  });
}

async function renderPendingDocumentsQueue(container) {
  container.innerHTML = `
    <div style="display:flex;justify-content:center;padding:48px" id="doc-queue-spinner">
      <div class="spinner"></div>
    </div>
  `;
  
  const res = await apiFetch('/workforce/documents/pending');
  if (res.error) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <div style="color:var(--text-danger);margin-bottom:12px;display:flex;justify-content:center">${getSvgIcon('warning', 32)}</div>
        <h3 style="color:var(--text-secondary)">Failed to load documents queue</h3>
        <p style="color:var(--text-muted);font-size:13px">${res.error}</p>
      </div>
    `;
    return;
  }
  
  const pendingDocs = res.data || [];
  if (pendingDocs.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <div style="margin-bottom:16px;opacity:0.4;display:flex;justify-content:center">${getSvgIcon('audit', 40)}</div>
        <h3 style="color:var(--text-secondary)">No documents pending review</h3>
        <p style="color:var(--text-muted);font-size:13px">All workforce compliance documents are currently up to date.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="card animate-slideUp">
      <div class="card-header">
        <div>
          <div class="card-title">Compliance Document Queue</div>
          <div class="card-subtitle">Pending reviews for workforce credentials and identity verifications</div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Document Name</th>
              <th>Type</th>
              <th>Uploaded Date</th>
              <th>Expiry Date</th>
              <th style="text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pendingDocs.map(d => `
              <tr data-docid="${d.id}" data-userid="${d.userId}">
                <td>
                  <div>
                    <div class="primary-cell">${d.userName}</div>
                    <div class="sub-cell">${d.userEmail}</div>
                  </div>
                </td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="color:var(--text-muted)">${getSvgIcon('audit', 16)}</span>
                    <span style="font-weight:600">${d.name}</span>
                  </div>
                </td>
                <td><span class="badge badge-secondary" style="font-size:11px;padding:2px 8px">${d.type}</span></td>
                <td>${d.uploadedAt || '—'}</td>
                <td>${d.expiryDate || '—'}</td>
                <td style="text-align:right">
                  <div style="display:flex;gap:6px;justify-content:flex-end">
                    <button class="btn btn-secondary btn-xs download-btn">Download</button>
                    <button class="btn btn-success btn-xs approve-btn" style="background:var(--accent-emerald);border-color:var(--accent-emerald)">Approve</button>
                    <button class="btn btn-danger btn-xs reject-btn" style="background:var(--text-danger);border-color:var(--text-danger)">Reject</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  // Bind events
  container.querySelectorAll('tbody tr').forEach(row => {
    const docId = row.dataset.docid;
    const userId = row.dataset.userid;
    const doc = pendingDocs.find(item => item.id === docId);
    
    row.querySelector('.download-btn')?.addEventListener('click', () => {
      showToast('Secure Download', 'Retrieving encrypted document file...', 'info');
    });
    
    row.querySelector('.approve-btn')?.addEventListener('click', () => {
      handleDocumentReview(userId, docId, 'Approved', doc.name);
    });
    
    row.querySelector('.reject-btn')?.addEventListener('click', () => {
      handleDocumentReview(userId, docId, 'Rejected', doc.name);
    });
  });
}

function handleDocumentReview(userId, docId, status, docName) {
  const isApprove = status === 'Approved';
  const actionTitle = isApprove ? 'Approve Document' : 'Reject Document';
  const actionBtnClass = isApprove ? 'btn-success' : 'btn-danger';
  const actionBtnStyle = isApprove ? 'background:var(--accent-emerald);border-color:var(--accent-emerald)' : 'background:var(--text-danger);border-color:var(--text-danger)';
  
  const body = document.createElement('div');
  body.innerHTML = `
    <div style="margin-bottom:16px;font-size:13px;color:var(--text-secondary)">
      Are you sure you want to <strong>${status.toLowerCase()}</strong> the document <strong>${docName}</strong>?
    </div>
    <div class="form-group">
      <label class="form-label">${isApprove ? 'Approval Remarks (Optional)' : 'Rejection Reason (Required)'}</label>
      <textarea id="review-remarks" class="form-control" rows="3" placeholder="${isApprove ? 'Add any optional notes...' : 'Please explain why this document is rejected...'}" required></textarea>
    </div>
  `;
  
  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.gap = '12px';
  footer.style.justifyContent = 'flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary" id="review-cancel">Cancel</button>
    <button class="btn ${actionBtnClass}" id="review-submit" style="${actionBtnStyle}">${status}</button>
  `;
  
  const modal = createModal({
    title: actionTitle,
    body,
    footer
  });
  
  modal.el.querySelector('#review-cancel').addEventListener('click', () => modal.close());
  
  modal.el.querySelector('#review-submit').addEventListener('click', async () => {
    const remarks = modal.el.querySelector('#review-remarks').value.trim();
    if (!isApprove && !remarks) {
      showToast('Validation Error', 'A rejection reason is required.', 'warning');
      return;
    }
    
    modal.close();
    
    const { reviewDocument } = await import('../modules/store.js');
    const res = await reviewDocument(userId, docId, status, remarks);
    if (res && res.error) {
      showToast('Review Failed', res.error, 'error');
    } else {
      showToast('Review Recorded', `Document has been ${status.toLowerCase()}.`, 'success');
      const contentArea = document.getElementById('workforce-tab-content');
      if (contentArea) {
        renderPendingDocumentsQueue(contentArea);
      }
    }
  });
}
