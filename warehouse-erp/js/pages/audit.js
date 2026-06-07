/**
 * Audit Logs Page
 */
import { getCurrentUser, apiFetch, getStore } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { formatDateTime, renderAvatarContainer } from '../modules/ui.js';
import { canDo } from '../modules/permissions.js';

let au_searchQ = '';
let au_page = 1;
const au_PER_PAGE = 100;
let au_actionFilter = '';

let activeAuditTab = 'personal';

export function renderAudit() {
  const user = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
  
  const canViewEnterprise = canDo('audit', 'view');
  if (activeAuditTab === 'enterprise' && !canViewEnterprise) {
    activeAuditTab = 'personal';
  }

  const updateAuditTabUI = () => {
    const tabHeaders = document.querySelectorAll('.audit-tab-header');
    tabHeaders.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === activeAuditTab);
    });
    au_page = 1;
    renderAuditTable();
  };
  
  renderShell('Audit Logs', 'System activity and security trail', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Audit Logs</h1>
          <p class="page-subtitle">Complete activity trail for compliance and monitoring</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="table-toolbar" style="margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:0;gap:4px">
        <button class="audit-tab-header btn btn-ghost btn-sm active" data-tab="personal" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">My Activity</button>
        ${canViewEnterprise ? `
          <button class="audit-tab-header btn btn-ghost btn-sm" data-tab="enterprise" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Company Activity</button>
        ` : ''}
      </div>
      
      <div class="table-toolbar">
        <div class="table-search">
          <span>🔍</span>
          <input type="text" id="audit-search" placeholder="Search by description, user, or action..." value="${au_searchQ}" />
        </div>
        <div class="table-filter">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="audit-action-filter">
            <option value="" ${au_actionFilter === '' ? 'selected' : ''}>All Actions</option>
            <option value="login" ${au_actionFilter === 'login' ? 'selected' : ''}>Login</option>
            <option value="logout" ${au_actionFilter === 'logout' ? 'selected' : ''}>Logout</option>
            <option value="signup" ${au_actionFilter === 'signup' ? 'selected' : ''}>Signup</option>
            <option value="item_create" ${au_actionFilter === 'item_create' ? 'selected' : ''}>Item Create</option>
            <option value="item_edit" ${au_actionFilter === 'item_edit' ? 'selected' : ''}>Item Edit</option>
            <option value="item_delete" ${au_actionFilter === 'item_delete' ? 'selected' : ''}>Item Delete</option>
            <option value="item_import" ${au_actionFilter === 'item_import' ? 'selected' : ''}>Item Import</option>
            <option value="invoice_create" ${au_actionFilter === 'invoice_create' ? 'selected' : ''}>Invoice Create</option>
            <option value="invoice_update" ${au_actionFilter === 'invoice_update' ? 'selected' : ''}>Invoice Update</option>
            <option value="table_row_create" ${au_actionFilter === 'table_row_create' ? 'selected' : ''}>Row Add</option>
            <option value="table_row_update" ${au_actionFilter === 'table_row_update' ? 'selected' : ''}>Row Edit</option>
            <option value="table_row_delete" ${au_actionFilter === 'table_row_delete' ? 'selected' : ''}>Row Delete</option>
            <option value="table_rows_import" ${au_actionFilter === 'table_rows_import' ? 'selected' : ''}>Row Import</option>
            <option value="export" ${au_actionFilter === 'export' ? 'selected' : ''}>Export</option>
            <option value="settings_change" ${au_actionFilter === 'settings_change' ? 'selected' : ''}>Settings Change</option>
          </select>
        </div>
      </div>
      
      <div id="audit-table-container"></div>
    </div>
  `);

  updateAuditTabUI();

  // Bind tab header click events
  document.querySelectorAll('.audit-tab-header').forEach(btn => {
    btn.addEventListener('click', () => {
      activeAuditTab = btn.dataset.tab;
      updateAuditTabUI();
    });
  });
  
  // Set up event listeners with debounce for search
  let debounceTimeout;
  const searchInput = document.getElementById('audit-search');
  searchInput?.addEventListener('input', e => {
    au_searchQ = e.target.value;
    au_page = 1;
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      renderAuditTable();
    }, 300);
  });
  
  const filterSelect = document.getElementById('audit-action-filter');
  filterSelect?.addEventListener('change', e => {
    au_actionFilter = e.target.value;
    au_page = 1;
    renderAuditTable();
  });
}

const ACTION_CLASSES = {
  'login': 'badge-success',
  'logout': 'badge-muted',
  'signup': 'badge-info',
  
  'item_create': 'badge-success',
  'item_edit': 'badge-info',
  'item_delete': 'badge-danger',
  'item_import': 'badge-brand',
  
  'invoice_create': 'badge-success',
  'invoice_update': 'badge-info',
  
  'table_schema_create': 'badge-success',
  'table_schema_update': 'badge-info',
  'table_schema_delete': 'badge-danger',
  
  'table_row_create': 'badge-success',
  'table_row_update': 'badge-info',
  'table_row_delete': 'badge-danger',
  'table_rows_import': 'badge-brand',
  
  'export': 'badge-brand',
  'import': 'badge-brand',
  'settings_change': 'badge-warning',
  'role_change': 'badge-warning',
  'permission_update': 'badge-warning',
  'restore': 'badge-success',
  'error': 'badge-danger'
};

async function renderAuditTable() {
  const container = document.getElementById('audit-table-container');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:64px;color:var(--text-muted);font-size:14px">
      <span style="display:inline-block;animation:spin 1s linear infinite;margin-right:12px">⏳</span> Loading activity logs...
    </div>
  `;

  try {
    let url = `/audit-logs/?page=${au_page}&limit=${au_PER_PAGE}&scope=${activeAuditTab}`;
    if (au_searchQ.trim()) {
      url += `&search=${encodeURIComponent(au_searchQ.trim())}`;
    }
    if (au_actionFilter) {
      url += `&action=${encodeURIComponent(au_actionFilter)}`;
    }

    const res = await apiFetch(url);
    if (!res || !res.success || !Array.isArray(res.data)) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:48px">
          <div style="font-size:40px;margin-bottom:16px;opacity:0.4">⚠️</div>
          <h3 style="color:var(--text-secondary)">Failed to load audit logs</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-top:8px">${res?.error || 'Unable to fetch audit logs from backend.'}</p>
        </div>
      `;
      return;
    }

    const logs = res.data;
    const total = res.total || 0;
    const au_pages = res.pages || 1;
    const start = (au_page - 1) * au_PER_PAGE;

    if (logs.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:64px">
          <div style="font-size:48px;margin-bottom:16px;opacity:0.3">📋</div>
          <h3 style="color:var(--text-secondary);font-weight:600">No activity logs recorded</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-top:8px">No system actions matched the selected filters.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);overflow:hidden">
        <table style="width:100%;border-collapse:collapse;text-align:left">
          <thead>
            <tr style="border-bottom:1px solid var(--border-color);background:var(--bg-sidebar)">
              <th style="padding:14px 16px;font-size:12px;font-weight:600;color:var(--text-secondary);width:60px">#</th>
              <th style="padding:14px 16px;font-size:12px;font-weight:600;color:var(--text-secondary);width:160px">Action</th>
              <th style="padding:14px 16px;font-size:12px;font-weight:600;color:var(--text-secondary)">Description</th>
              <th style="padding:14px 16px;font-size:12px;font-weight:600;color:var(--text-secondary);width:180px">User</th>
              <th style="padding:14px 16px;font-size:12px;font-weight:600;color:var(--text-secondary);width:180px">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map((log, i) => {
              const rowNum = start + i + 1;
              const actionClass = ACTION_CLASSES[log.action] || 'badge-muted';
              const actionText = (log.action || 'unknown').toUpperCase().replace(/_/g, ' ');
              const userName = log.userName || 'System';
              const allUsers = getStore().users || [];
              const targetUser = allUsers.find(usr => usr.id === log.userId || usr.name === log.userName);
              const avatarVal = targetUser ? targetUser.avatar : '';
              
              return `
                <tr style="border-bottom:1px solid var(--border-color);transition:background 0.2s" class="hover-row">
                  <td data-label="#" style="padding:12px 16px;color:var(--text-muted);font-size:12px;font-family:var(--font-mono)">${rowNum}</td>
                  <td data-label="Action" style="padding:12px 16px">
                    <span class="badge ${actionClass}" style="font-weight:600;font-size:11px;letter-spacing:0.5px">
                      ${actionText}
                    </span>
                  </td>
                  <td data-label="Description" style="padding:12px 16px;font-size:13px;color:var(--text-primary);line-height:1.5">${log.description || ''}</td>
                  <td data-label="User" style="padding:12px 16px">
                    <div style="display:flex;align-items:center;gap:10px">
                      ${renderAvatarContainer(avatarVal, userName, 28)}
                      <span style="font-size:13px;font-weight:500;color:var(--text-primary)">${userName}</span>
                    </div>
                  </td>
                  <td data-label="Timestamp" style="padding:12px 16px;font-size:12px;color:var(--text-muted);font-family:var(--font-mono)">${formatDateTime(log.timestamp)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div class="table-pagination" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-top:1px solid var(--border-color);background:var(--bg-sidebar);flex-wrap:wrap;gap:16px">
          <div class="pagination-info" style="font-size:13px;color:var(--text-muted)">
            Showing <strong style="color:var(--text-primary)">${start + 1}</strong>–<strong style="color:var(--text-primary)">${Math.min(start + logs.length, total)}</strong> of <strong style="color:var(--text-primary)">${total}</strong> logs
          </div>
          <div class="pagination-controls" style="display:flex;align-items:center;gap:6px">
            <button class="au_page-btn" id="ap-prev" ${au_page <= 1 ? 'disabled' : ''} style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-primary);border-radius:var(--radius-md);cursor:pointer;font-size:16px;transition:all 0.2s">‹</button>
            ${(() => {
              let startPage = Math.max(1, au_page - 3);
              let endPage = Math.min(au_pages, startPage + 6);
              if (endPage - startPage < 6) {
                startPage = Math.max(1, endPage - 6);
              }
              let html = '';
              for (let i = startPage; i <= endPage; i++) {
                if (i >= 1 && i <= au_pages) {
                  html += `<button class="au_page-btn ${au_page === i ? 'active' : ''}" data-pg="${i}" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid ${au_page === i ? 'var(--color-brand)' : 'var(--border-color)'};background:${au_page === i ? 'var(--color-brand)' : 'var(--bg-card)'};color:${au_page === i ? 'white' : 'var(--text-primary)'};font-weight:${au_page === i ? '600' : '500'};border-radius:var(--radius-md);cursor:pointer;font-size:13px;transition:all 0.2s">${i}</button>`;
                }
              }
              return html;
            })()}
            <button class="au_page-btn" id="ap-next" ${au_page >= au_pages ? 'disabled' : ''} style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-primary);border-radius:var(--radius-md);cursor:pointer;font-size:16px;transition:all 0.2s">›</button>
          </div>
        </div>
      </div>
    `;

    // Hook up pagination listeners
    container.querySelectorAll('.au_page-btn[data-pg]').forEach(btn => {
      btn.addEventListener('click', () => {
        au_page = parseInt(btn.dataset.pg);
        renderAuditTable();
      });
    });
    container.querySelector('#ap-prev')?.addEventListener('click', () => {
      if (au_page > 1) {
        au_page--;
        renderAuditTable();
      }
    });
    container.querySelector('#ap-next')?.addEventListener('click', () => {
      if (au_page < au_pages) {
        au_page++;
        renderAuditTable();
      }
    });
  } catch (err) {
    console.error('[AuditLog] Error rendering table:', err);
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <div style="font-size:40px;margin-bottom:16px;opacity:0.4">⚠️</div>
        <h3 style="color:var(--text-secondary)">An unexpected error occurred</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-top:8px">Unable to connect to the ERP server.</p>
      </div>
    `;
  }
}
