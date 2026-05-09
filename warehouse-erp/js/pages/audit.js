/**
 * Audit Logs Page
 */
import { getCurrentUser, getAuditLogs } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { formatDateTime, filterData } from '../modules/ui.js';

let au_searchQ = '';
let au_page = 1;
const au_PER_PAGE = 15;

export function renderAudit() {
  const user = getCurrentUser();
  renderShell('Audit Logs', 'System activity and security trail', `
    <div class="animate-slideUp">
      <div class="au_page-header">
        <div class="au_page-header-left">
          <h1 class="au_page-title">🔍 Audit Logs</h1>
          <p class="au_page-subtitle">Complete activity trail for compliance and monitoring</p>
        </div>
        <div class="au_page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>
      <div class="table-toolbar">
        <div class="table-search"><span>🔍</span><input type="text" id="audit-search" placeholder="Search logs..." /></div>
        <div class="table-filter">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="audit-action-filter">
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="user_create">User Create</option>
            <option value="warehouse_create">Warehouse Create</option>
            <option value="bill_create">Bill Create</option>
            <option value="table_create">Table Create</option>
            <option value="item_create">Item Create</option>
          </select>
        </div>
      </div>
      <div id="audit-table-container"></div>
    </div>
  `);

  renderAuditTable();
  document.getElementById('audit-search')?.addEventListener('input', e=>{au_searchQ=e.target.value;au_page=1;renderAuditTable();});
  document.getElementById('audit-action-filter')?.addEventListener('change',()=>{au_page=1;renderAuditTable();});
}

const ACTION_ICONS = { login:'🔐', logout:'🚪', user_create:'👤➕', user_update:'👤✏️', user_delete:'👤🗑️', warehouse_create:'🏭➕', warehouse_update:'🏭✏️', warehouse_delete:'🏭🗑️', bill_create:'🧾', table_create:'📋➕', item_create:'📦➕' };
const ACTION_CLASSES = { login:'badge-info', user_create:'badge-success', user_delete:'badge-danger', warehouse_create:'badge-success', warehouse_delete:'badge-danger', bill_create:'badge-brand', table_create:'badge-success', item_create:'badge-success' };

function renderAuditTable() {
  let logs = getAuditLogs();
  const actionFilter = document.getElementById('audit-action-filter')?.value||'';
  if (au_searchQ) logs = filterData(logs, au_searchQ, ['description','userName','action']);
  if (actionFilter) logs = logs.filter(l=>l.action===actionFilter);

  const total = logs.length;
  const au_pages = Math.ceil(total/au_PER_PAGE);
  const start = (au_page-1)*au_PER_PAGE;
  const au_pageLogs = logs.slice(start, start+au_PER_PAGE);

  const container = document.getElementById('audit-table-container');
  if (!container) return;

  if (logs.length === 0) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:40px;margin-bottom:16px;opacity:0.4">🔍</div><h3 style="color:var(--text-secondary)">No logs found</h3></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Action</th><th>Description</th><th>User</th><th>Timestamp</th></tr></thead>
        <tbody>
          ${au_pageLogs.map((log,i)=>`<tr>
            <td data-label="#" style="color:var(--text-muted);font-size:12px">${start+i+1}</td>
            <td data-label="Action">
              <span class="badge ${ACTION_CLASSES[log.action]||'badge-muted'}">
                ${ACTION_ICONS[log.action]||'📝'} ${log.action.replace(/_/g,' ')}
              </span>
            </td>
            <td data-label="Description" style="font-size:13px">${log.description}</td>
            <td data-label="User">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:26px;height:26px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;flex-shrink:0">${log.userName.slice(0,2).toUpperCase()}</div>
                <span style="font-size:13px">${log.userName}</span>
              </div>
            </td>
            <td data-label="Timestamp" style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono)">${formatDateTime(log.timestamp)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+au_PER_PAGE,total)} of ${total} logs</div>
        <div class="pagination-controls">
          <button class="au_page-btn" id="ap-prev" ${au_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:Math.min(au_pages,7)},(_,i)=>`<button class="au_page-btn ${au_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="au_page-btn" id="ap-next" ${au_page>=au_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('.page-btn[data-pg]').forEach(btn=>btn.addEventListener('click',()=>{au_page=parseInt(btn.dataset.pg);renderAuditTable();}));
  container.querySelector('#ap-prev')?.addEventListener('click',()=>{if(au_page>1){au_page--;renderAuditTable();}});
  container.querySelector('#ap-next')?.addEventListener('click',()=>{if(au_page<au_pages){au_page++;renderAuditTable();}});
}
