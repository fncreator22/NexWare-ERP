/**
 * Role Manager Page — Custom role builder with permission matrix
 * Route: /roles  (Super Admin only)
 */
import { getCurrentUser, getStore, saveStore } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, createModal, getSvgIcon, confirm, renderAvatarContainer } from '../modules/ui.js';
import { navigate } from '../modules/router.js';
import {
  ALL_MODULES, ALL_ACTIONS, DEFAULT_ROLE_PERMISSIONS,
  BUILTIN_ROLES, getAllRoles, getRoles, createRole, updateRole, deleteRole, cloneRole,
  PERMISSION_PRESETS
} from '../modules/permissions.js';

let activeRoleId = null;

export function renderRoles() {
  const user = getCurrentUser();
  if (!user || user.role !== 'super_admin') { navigate('/dashboard'); return; }

  renderShell('Role Manager', 'Define roles and permission matrices', buildPageHTML(user));
  bindEvents();
  selectRole(activeRoleId || null);
}

function buildPageHTML(user) {
  const allRoles = getAllRoles();
  return `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Role Manager</h1>
          <p class="page-subtitle">Create and configure enterprise roles with granular permission matrices</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/settings'">← Settings</button>
          <button class="btn btn-primary" id="new-role-btn">${getSvgIcon('plus', 14)} New Role</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:280px 1fr;gap:24px;align-items:start">

        <!-- Left: Role List -->
        <div>
          <div class="card" style="padding:0;overflow:hidden">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle)">
              <div style="font-size:13px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">All Roles</div>
            </div>
            <div id="role-list" style="max-height:600px;overflow-y:auto">
              ${renderRoleList(allRoles)}
            </div>
          </div>
        </div>

        <!-- Right: Permission Editor -->
        <div id="permission-editor">
          <div class="card" style="padding:48px;text-align:center;color:var(--text-muted)">
            ${getSvgIcon('workforce', 40)}
            <div style="margin-top:16px;font-size:15px;font-weight:600">Select a role to view or edit its permissions</div>
            <div style="font-size:13px;margin-top:6px;opacity:0.7">Built-in roles are read-only. Create a custom role to configure permissions.</div>
          </div>
        </div>

      </div>
    </div>
  `;
}

function renderRoleList(allRoles) {
  return allRoles.map(role => `
    <div class="role-list-item ${activeRoleId === role.id ? 'active' : ''}" data-id="${role.id}"
      style="display:flex;align-items:center;gap:12px;padding:14px 20px;cursor:pointer;
             border-left:3px solid ${activeRoleId === role.id ? role.color : 'transparent'};
             transition:all 0.15s;background:${activeRoleId === role.id ? 'var(--glass-bg)' : 'transparent'}">
      <div style="width:10px;height:10px;border-radius:50%;background:${role.color};flex-shrink:0;${role.disabled ? 'opacity:0.4' : ''}"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);${role.disabled ? 'text-decoration:line-through;opacity:0.5' : ''}">${role.name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${role.isSystem ? 'Built-in' : 'Custom'}</div>
      </div>
      ${role.disabled ? `<span class="badge badge-muted" style="font-size:9px">Off</span>` : ''}
    </div>
  `).join('');
}

function renderPermissionMatrix(role) {
  const isSystem = role.isSystem;
  const perms = isSystem ? DEFAULT_ROLE_PERMISSIONS[role.key] || {} : (role.permissions || {});

  const presetHTML = !isSystem ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <span style="font-size:12px;color:var(--text-muted);align-self:center;font-weight:600">Presets:</span>
      ${Object.keys(PERMISSION_PRESETS).map(name => `
        <button class="btn btn-secondary btn-sm preset-btn" data-preset="${name}">${name}</button>
      `).join('')}
    </div>
  ` : '';

  const rowsHTML = ALL_MODULES.map(mod => {
    const modPerms = perms[mod.key] || {};
    return `
      <tr>
        <td style="padding:10px 12px;white-space:nowrap">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="color:var(--text-muted)">${getSvgIcon(mod.icon, 14)}</span>
            <span style="font-size:13px;font-weight:600">${mod.label}</span>
          </div>
        </td>
        ${ALL_ACTIONS.map(action => {
          const checked = modPerms[action] === true;
          const id = `perm_${mod.key}_${action}`;
          return `
            <td style="text-align:center;padding:10px 6px">
              <input type="checkbox" id="${id}" name="${id}"
                data-mod="${mod.key}" data-action="${action}"
                class="perm-checkbox"
                ${checked ? 'checked' : ''}
                ${isSystem ? 'disabled' : ''}
                style="width:16px;height:16px;cursor:${isSystem ? 'not-allowed' : 'pointer'};accent-color:var(--accent-emerald)" />
            </td>
          `;
        }).join('')}
        ${!isSystem ? `
          <td style="text-align:center;padding:10px 6px">
            <input type="checkbox" class="module-select-all" data-mod="${mod.key}"
              ${ALL_ACTIONS.every(a => modPerms[a]) ? 'checked' : ''}
              style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent-sky)"
              title="Toggle all for ${mod.label}" />
          </td>
        ` : '<td></td>'}
      </tr>
    `;
  }).join('');

  const actionColHeaders = ALL_ACTIONS.map(a => `
    <th style="text-align:center;padding:8px 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted)">
      ${a}
      ${!isSystem ? `<br><input type="checkbox" class="action-select-all" data-action="${a}"
        style="margin-top:4px;width:14px;height:14px;cursor:pointer;accent-color:var(--accent-amber)" title="Select all ${a}" />` : ''}
    </th>
  `).join('');

  // Editable fields for custom roles
  let editFieldsHTML = '';
  if (!isSystem) {
    editFieldsHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;margin-bottom:20px;padding:16px;background:var(--glass-bg);border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:11px;font-weight:700;color:var(--text-secondary)">Role Name</label>
          <input type="text" id="role-name-input" class="form-control" value="${role.name}" placeholder="e.g. Lead Operator" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:11px;font-weight:700;color:var(--text-secondary)">Description</label>
          <input type="text" id="role-desc-input" class="form-control" value="${role.description || ''}" placeholder="Scope details" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:11px;font-weight:700;color:var(--text-secondary)">Color Tag</label>
          <input type="color" id="role-color-input" class="form-control" value="${role.color || '#71717a'}" style="height:38px;padding:2px;cursor:pointer" />
        </div>
      </div>
    `;
  }

  // Assigned active users list
  const allUsers = getStore().users || [];
  const assignedUsers = allUsers.filter(u => u.role === role.id || u.role === role.key);
  
  let assignedUsersHTML = '';
  if (assignedUsers.length > 0) {
    assignedUsersHTML = `
      <div style="margin-bottom:20px;padding:16px;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle)">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:10px;letter-spacing:0.05em">Assigned Users (${assignedUsers.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${assignedUsers.map(u => {
            const avatarHTML = renderAvatarContainer(u.avatar, u.name, 28);
            const empId = u.employeeId || u.enterprise_id || 'N/A';
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:4px 10px;background:var(--card-bg);border:1px solid var(--border-subtle);border-radius:20px" title="${u.email}">
                ${avatarHTML}
                <div style="text-align:left;line-height:1.2">
                  <div style="font-size:11px;font-weight:600;color:var(--text-primary)">${u.name || u.email}</div>
                  <div style="font-size:9px;color:var(--text-muted)">ID: ${empId}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } else {
    assignedUsersHTML = `
      <div style="margin-bottom:20px;padding:12px;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle);font-size:11px;color:var(--text-muted)">
        No users currently assigned to this role.
      </div>
    `;
  }

  // Sidebar Layout, ordering and visibility
  let extraSettingsHTML = '';
  if (!isSystem) {
    const pageOrder = role.pageOrder || role.page_order || ALL_MODULES.map(m => m.key);
    const visibility = role.moduleVisibility || role.module_visibility || {};
    
    const sortedModules = [...ALL_MODULES].sort((a, b) => {
      const idxA = pageOrder.indexOf(a.key);
      const idxB = pageOrder.indexOf(b.key);
      const valA = idxA === -1 ? 999 : idxA;
      const valB = idxB === -1 ? 999 : idxB;
      return valA - valB;
    });

    extraSettingsHTML = `
      <div style="margin-top:24px;border-top:1px solid var(--border-subtle);padding-top:20px">
        <h3 style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Sidebar Navigation Layout</h3>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Customize sidebar order and visibility for this role.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(230px, 1fr));gap:12px">
          ${sortedModules.map((mod, index) => {
            const isVisible = visibility[mod.key] !== false;
            return `
              <div class="nav-order-item" data-key="${mod.key}" style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--glass-bg);border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
                <div style="display:flex;flex-direction:column;gap:2px">
                  <button type="button" class="btn-move-up" data-key="${mod.key}" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:2px;font-size:10px;line-height:1" title="Move Up">▲</button>
                  <button type="button" class="btn-move-down" data-key="${mod.key}" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:2px;font-size:10px;line-height:1" title="Move Down">▼</button>
                </div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${mod.label}</div>
                  <div style="font-size:10px;color:var(--text-muted)">Seq: ${index + 1}</div>
                </div>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;font-weight:600;color:var(--text-secondary);flex-shrink:0">
                  <input type="checkbox" class="nav-visibility-checkbox" data-key="${mod.key}" ${isVisible ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--accent-sky)" />
                  Show
                </label>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header" style="gap:12px;flex-wrap:wrap">
        <div>
          <div class="card-title" style="display:flex;align-items:center;gap:8px">
            <div style="width:12px;height:12px;border-radius:3px;background:${role.color}"></div>
            ${role.name}
            ${role.isSystem ? `<span class="badge badge-muted" style="font-size:10px">System</span>` : `<span class="badge badge-success" style="font-size:10px">Custom</span>`}
          </div>
          <div class="card-subtitle">${role.description || 'Permission matrix for this role'}</div>
        </div>
        ${!isSystem ? `
          <div style="display:flex;gap:8px;margin-left:auto;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="clone-role-btn" data-id="${role.id}">Clone</button>
            <button class="btn btn-danger btn-sm" id="delete-role-btn" data-id="${role.id}">Delete</button>
            <button class="btn btn-secondary btn-sm" id="toggle-role-btn" data-id="${role.id}">${role.disabled ? 'Enable' : 'Disable'}</button>
            <button class="btn btn-primary btn-sm" id="save-role-btn" data-id="${role.id}">${getSvgIcon('save', 14)} Save</button>
          </div>
        ` : `
          <div style="margin-left:auto">
            <button class="btn btn-secondary btn-sm" id="clone-role-btn" data-id="${role.id}">Clone as Custom</button>
          </div>
        `}
      </div>

      ${editFieldsHTML}
      ${assignedUsersHTML}
      ${presetHTML}

      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border-subtle)">
              <th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted)">Module</th>
              ${actionColHeaders}
              ${!isSystem ? `<th style="text-align:center;padding:8px 6px;font-size:10px;font-weight:700;color:var(--accent-sky)">All</th>` : '<th></th>'}
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>
      </div>

      ${extraSettingsHTML}

      ${isSystem ? `
        <div style="margin-top:20px;padding:14px;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle)">
          <div style="font-size:12px;color:var(--text-muted)">
            ${getSvgIcon('warning', 14)} Built-in roles cannot be modified. Clone this role to create a custom variant with adjusted permissions.
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function selectRole(roleId) {
  activeRoleId = roleId;
  const allRoles = getAllRoles();
  const role = allRoles.find(r => r.id === roleId);
  const editor = document.getElementById('permission-editor');
  const list = document.getElementById('role-list');
  if (!editor) return;

  // Update active state in list
  if (list) list.innerHTML = renderRoleList(allRoles);
  bindRoleListClicks();

  if (!role) {
    editor.innerHTML = `
      <div class="card" style="padding:48px;text-align:center;color:var(--text-muted)">
        ${getSvgIcon('workforce', 40)}
        <div style="margin-top:16px;font-size:15px;font-weight:600">Select a role to view its permissions</div>
      </div>`;
    return;
  }

  editor.innerHTML = renderPermissionMatrix(role);
  bindEditorEvents(role);
}

function bindEvents() {
  document.getElementById('new-role-btn')?.addEventListener('click', showNewRoleModal);
  bindRoleListClicks();
}

function bindRoleListClicks() {
  document.querySelectorAll('.role-list-item').forEach(el => {
    el.addEventListener('click', () => selectRole(el.dataset.id));
  });
}

function moveRoleNav(role, key, direction) {
  const currentOrder = role.pageOrder || role.page_order || ALL_MODULES.map(m => m.key);
  const allKeys = ALL_MODULES.map(m => m.key);
  const cleanOrder = currentOrder.filter(k => allKeys.includes(k));
  allKeys.forEach(k => {
    if (!cleanOrder.includes(k)) cleanOrder.push(k);
  });
  
  const idx = cleanOrder.indexOf(key);
  if (idx === -1) return;
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= cleanOrder.length) return;
  
  const temp = cleanOrder[idx];
  cleanOrder[idx] = cleanOrder[newIdx];
  cleanOrder[newIdx] = temp;
  
  role.pageOrder = cleanOrder;
  role.page_order = cleanOrder;
  
  const editor = document.getElementById('permission-editor');
  if (editor) {
    editor.innerHTML = renderPermissionMatrix(role);
    bindEditorEvents(role);
  }
}

function bindEditorEvents(role) {
  // Save
  document.getElementById('save-role-btn')?.addEventListener('click', () => saveRolePermissions(role));

  // Clone
  document.getElementById('clone-role-btn')?.addEventListener('click', async () => {
    try {
      const newRole = await cloneRole(role.id);
      if (newRole) {
        showToast('Role cloned', `"${newRole.name}" created`, 'success');
        activeRoleId = newRole.id;
        renderRoles();
      }
    } catch (err) {
      showToast('Error cloning role', err.message, 'error');
    }
  });

  // Delete
  document.getElementById('delete-role-btn')?.addEventListener('click', async () => {
    const ok = await confirm(`Delete role "${role.name}"? Users with this role will fall back to Employee access.`, 'danger');
    if (!ok) return;
    try {
      await deleteRole(role.id);
      activeRoleId = null;
      showToast('Role deleted', role.name, 'warning');
      renderRoles();
    } catch (err) {
      showToast('Error deleting role', err.message, 'error');
    }
  });

  // Toggle disable
  document.getElementById('toggle-role-btn')?.addEventListener('click', async () => {
    try {
      await updateRole(role.id, { disabled: !role.disabled });
      showToast('Role updated', role.disabled ? 'Role enabled' : 'Role disabled', 'info');
      renderRoles();
    } catch (err) {
      showToast('Error updating role', err.message, 'error');
    }
  });

  // Navigation ordering movement buttons
  document.querySelectorAll('.btn-move-up').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      moveRoleNav(role, btn.dataset.key, 'up');
    });
  });

  document.querySelectorAll('.btn-move-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      moveRoleNav(role, btn.dataset.key, 'down');
    });
  });

  // Module "Select All" checkboxes
  document.querySelectorAll('.module-select-all').forEach(cb => {
    cb.addEventListener('change', () => {
      const mod = cb.dataset.mod;
      document.querySelectorAll(`.perm-checkbox[data-mod="${mod}"]`).forEach(c => { c.checked = cb.checked; });
    });
  });

  // Action "Select All" column checkboxes
  document.querySelectorAll('.action-select-all').forEach(cb => {
    cb.addEventListener('change', () => {
      const action = cb.dataset.action;
      document.querySelectorAll(`.perm-checkbox[data-action="${action}"]`).forEach(c => { c.checked = cb.checked; });
    });
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = PERMISSION_PRESETS[btn.dataset.preset];
      if (!preset) return;
      const perms = preset();
      document.querySelectorAll('.perm-checkbox').forEach(cb => {
        const mod = cb.dataset.mod;
        const action = cb.dataset.action;
        cb.checked = !!(perms[mod]?.[action]);
      });
      showToast('Preset applied', btn.dataset.preset, 'info');
    });
  });
}

async function saveRolePermissions(role) {
  const perms = {};
  ALL_MODULES.forEach(mod => {
    perms[mod.key] = {};
    ALL_ACTIONS.forEach(action => {
      const cb = document.getElementById(`perm_${mod.key}_${action}`);
      perms[mod.key][action] = cb ? cb.checked : false;
    });
  });

  const nameEl = document.getElementById('role-name-input');
  const descEl = document.getElementById('role-desc-input');
  const colorEl = document.getElementById('role-color-input');
  
  const updates = { permissions: perms };
  if (nameEl) updates.name = nameEl.value.trim() || role.name;
  if (descEl) updates.description = descEl.value.trim();
  if (colorEl) updates.color = colorEl.value;

  const visibility = {};
  document.querySelectorAll('.nav-visibility-checkbox').forEach(cb => {
    visibility[cb.dataset.key] = cb.checked;
  });
  updates.moduleVisibility = visibility;

  const pageOrder = Array.from(document.querySelectorAll('.nav-order-item')).map(el => el.dataset.key);
  if (pageOrder.length > 0) {
    updates.pageOrder = pageOrder;
  }

  try {
    await updateRole(role.id, updates);
    showToast('Role saved', `${updates.name || role.name} permissions updated`, 'success');
    renderRoles();
  } catch (err) {
    showToast('Error saving role', err.message, 'error');
  }
}

function showNewRoleModal() {
  const allBuiltin = BUILTIN_ROLES.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  const body = `
    <div class="form-group">
      <label class="form-label">Role Name <span class="req">*</span></label>
      <input type="text" id="nr-name" class="form-control" placeholder="e.g., Logistics Coordinator" />
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <input type="text" id="nr-desc" class="form-control" placeholder="Brief description of this role's scope" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Role Color</label>
        <input type="color" id="nr-color" class="form-control" value="#06b6d4" style="height:42px;cursor:pointer" />
      </div>
      <div class="form-group">
        <label class="form-label">Clone Permissions From</label>
        <select id="nr-clone" class="form-control">
          <option value="">Empty (No Access)</option>
          ${allBuiltin}
        </select>
      </div>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" id="nr-cancel">Cancel</button>
    <button class="btn btn-primary" id="nr-create">${getSvgIcon('plus', 14)} Create Role</button>
  `;
  const modal = createModal({ title: 'Create New Role', body, footer });
  modal.el.querySelector('#nr-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#nr-create')?.addEventListener('click', async () => {
    const name = modal.el.querySelector('#nr-name').value.trim();
    if (!name) { showToast('Name required', '', 'error'); return; }
    const desc = modal.el.querySelector('#nr-desc').value.trim();
    const color = modal.el.querySelector('#nr-color').value;
    const cloneFrom = modal.el.querySelector('#nr-clone').value;

    let basePerms = {};
    if (cloneFrom && DEFAULT_ROLE_PERMISSIONS[cloneFrom]) {
      basePerms = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS[cloneFrom]));
    }
    
    try {
      const newRole = await createRole({ name, description: desc, color, permissions: basePerms });
      modal.close();
      activeRoleId = newRole.id;
      showToast('Role created', name, 'success');
      renderRoles();
    } catch (err) {
      showToast('Error creating role', err.message, 'error');
    }
  });
}
