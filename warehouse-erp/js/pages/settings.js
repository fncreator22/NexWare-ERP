import { getCurrentUser, getStore, saveStore, getTaxConfig, saveTaxConfig, getBills, getAllUsers, getWarehouses, getItems, apiFetch, updateUser } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, confirm } from '../modules/ui.js';
import { exportCSV, exportXLSX, exportPDF } from '../modules/exporter.js';

export function renderSettings() {
  const user = getCurrentUser();
  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = ['super_admin','admin'].includes(user.role);
  const taxCfg = getTaxConfig();

  renderShell('Settings', 'Platform configuration and preferences', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">⚙️ System Settings</h1>
          <p class="page-subtitle">Platform configuration, preferences, and account management</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <div class="dashboard-grid">
        <!-- Profile Card -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">👤 Profile Settings</div>
              <div class="card-subtitle">Your account information</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px">
            <div style="width:72px;height:72px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:white;flex-shrink:0;box-shadow:var(--shadow-brand)">${user.avatar}</div>
            <div>
              <div style="font-size:20px;font-weight:800;margin-bottom:2px">${user.name}</div>
              <div style="font-size:13px;color:var(--text-muted)">${user.email}</div>
              <span class="badge role-${user.role.replace('_','-')}" style="margin-top:6px">${user.role.replace('_',' ')}</span>
            </div>
          </div>
          <form id="profile-form">
            <div class="form-group">
              <label class="form-label">Display Name</label>
              <input type="text" id="s-name" class="form-control" value="${user.name}" />
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="s-email" class="form-control" value="${user.email}" readonly style="opacity:0.7" />
              <div class="form-hint">Email cannot be changed</div>
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Save Profile</button>
          </form>
        </div>

        <!-- Security -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">🔒 Security</div>
              <div class="card-subtitle">Password and access settings</div>
            </div>
          </div>
          <form id="pw-form">
            <div class="form-group">
              <label class="form-label">Current Password</label>
              <input type="password" id="s-current-pw" class="form-control" placeholder="Enter current password" />
            </div>
            <div class="form-group">
              <label class="form-label">New Password</label>
              <input type="password" id="s-new-pw" class="form-control" placeholder="Min 8 characters" minlength="8" />
            </div>
            <div class="form-group">
              <label class="form-label">Confirm New Password</label>
              <input type="password" id="s-confirm-pw" class="form-control" placeholder="Repeat new password" />
            </div>
            <button type="submit" class="btn btn-secondary btn-sm">Update Password</button>
          </form>
        </div>

        ${isAdmin ? `
        <!-- Tax Configuration -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">🏛️ Tax Configuration</div>
              <div class="card-subtitle">Configure global tax rates for billing engine</div>
            </div>
          </div>
          <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:var(--text-muted)">
            ⚠️ Changes affect all <strong>future</strong> bills. Past invoices remain unchanged.
            ${!isSuperAdmin ? '<br><span style="color:var(--accent-amber)">Note: Full edit requires Super Admin.</span>' : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Normal Category Tax Rate</label>
            <div style="display:flex;align-items:center;gap:12px">
              <input type="number" id="tax-normal" class="form-control" value="${taxCfg.normal}" min="0" max="100" step="0.5" style="width:110px" ${!isSuperAdmin ? 'readonly style="opacity:0.6;pointer-events:none"' : ''} />
              <span style="color:var(--text-muted)">%</span>
              <span class="badge badge-info">Standard items</span>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Luxury Category Tax Rate</label>
            <div style="display:flex;align-items:center;gap:12px">
              <input type="number" id="tax-luxury" class="form-control" value="${taxCfg.luxury}" min="0" max="100" step="0.5" style="width:110px" ${!isSuperAdmin ? 'readonly style="opacity:0.6;pointer-events:none"' : ''} />
              <span style="color:var(--text-muted)">%</span>
              <span class="badge badge-purple">Premium items</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
            <button class="btn btn-primary btn-sm" id="save-tax-btn" ${!isSuperAdmin ? 'disabled title="Super Admin only"' : ''}>💾 Save Tax Rules</button>
            <span id="tax-saved-msg" style="font-size:12px;color:var(--accent-emerald);display:none">✓ Saved!</span>
          </div>
          <div style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:8px;font-size:12px">
            <div style="font-weight:600;margin-bottom:6px;color:var(--text-secondary)">Currently Active Rates:</div>
            <div style="display:flex;gap:16px">
              <div>Normal: <strong style="color:var(--accent-emerald)">${taxCfg.normal}%</strong></div>
              <div>Luxury: <strong style="color:var(--accent-amber)">${taxCfg.luxury}%</strong></div>
            </div>
          </div>
        </div>` : ''}

        <!-- Notifications -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">🔔 Notifications</div>
              <div class="card-subtitle">Manage alert preferences</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${[
              { id:'notif-billing', key: 'billing', label:'Billing alerts', desc:'Get notified for new invoices' },
              { id:'notif-stock', key: 'stock', label:'Low stock alerts', desc:'Alert when stock drops below 20 units' },
              { id:'notif-user', key: 'user', label:'User activity', desc:'Notifications for login/logout events' },
              { id:'notif-system', key: 'system', label:'System updates', desc:'Platform maintenance and updates' },
            ].map(n => {
              const isOn = user.settings?.notifications?.[n.key] !== false;
              return `
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                  <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${n.label}</div>
                  <div style="font-size:12px;color:var(--text-muted)">${n.desc}</div>
                </div>
                <label style="display:flex;align-items:center;cursor:pointer">
                  <input type="checkbox" id="${n.id}" data-key="${n.key}" class="notif-toggle-input" ${isOn?'checked':''} style="display:none" />
                  <div class="toggle-switch ${isOn?'on':''}" style="width:40px;height:22px;border-radius:11px;background:${isOn?'var(--brand-500)':'var(--bg-input)'};border:1px solid var(--border-default);position:relative;transition:all 0.2s;cursor:pointer">
                    <div style="position:absolute;top:2px;left:${isOn?'18px':'2px'};width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>
                  </div>
                </label>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Export Panel -->
        <div class="card col-12">
          <div class="card-header">
            <div>
              <div class="card-title">📤 Export Data</div>
              <div class="card-subtitle">Download platform data in your preferred format</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:20px">
            ${[
              { key:'bills',      icon:'🧾', label:'Billing & Invoices',   desc:'All invoices with tax breakdown',   role:'manager' },
              { key:'inventory',  icon:'📦', label:'Inventory',            desc:'Items, SKUs, stock, prices',        role:'manager' },
              { key:'workforce',  icon:'👥', label:'Workforce',            desc:'Team members, roles, assignments',  role:'admin'   },
              { key:'warehouses', icon:'🏭', label:'Warehouses',           desc:'All warehouse locations & stats',   role:'super_admin' },
              { key:'audit',      icon:'🔍', label:'Audit Logs',           desc:'System activity and changes',       role:'super_admin' },
              { key:'all',        icon:'📊', label:'Full Export',          desc:'All accessible data combined',      role:'admin'   },
            ].filter(e => {
              if (e.role === 'super_admin') return isSuperAdmin;
              if (e.role === 'admin') return isAdmin;
              return true;
            }).map(e => `
              <div style="background:var(--bg-input);border:1px solid var(--border-default);border-radius:12px;padding:16px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                  <span style="font-size:22px">${e.icon}</span>
                  <div>
                    <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${e.label}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${e.desc}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn btn-secondary btn-sm export-btn" data-entity="${e.key}" data-fmt="csv" style="font-size:11px;padding:4px 10px">CSV</button>
                  <button class="btn btn-secondary btn-sm export-btn" data-entity="${e.key}" data-fmt="xlsx" style="font-size:11px;padding:4px 10px">Excel</button>
                  <button class="btn btn-secondary btn-sm export-btn" data-entity="${e.key}" data-fmt="pdf" style="font-size:11px;padding:4px 10px">PDF</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="card col-12" style="border-color:rgba(244,63,94,0.2);background:rgba(244,63,94,0.03)">
          <div class="card-header">
            <div><div class="card-title" style="color:var(--accent-rose)">⚠️ Danger Zone</div></div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-size:14px;font-weight:600">Reset Demo Data</div>
              <div style="font-size:12px;color:var(--text-muted)">Clear all data and restore to fresh state (keeps your account)</div>
            </div>
            <button class="btn btn-danger btn-sm" id="reset-btn">🗑️ Reset Data</button>
          </div>
        </div>
      </div>
    </div>
  `);

  // Profile save
  document.getElementById('profile-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('s-name').value.trim();
    if (!name) return;
    
    const res = await updateUser(user.id, { name });
    if (res && res.error) {
      showToast('Error Updating Profile', res.error, 'error');
      return;
    }
    showToast('Profile updated','Your name has been updated','success');
    renderSettings();
  });

  // Password change
  document.getElementById('pw-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const current = document.getElementById('s-current-pw').value;
    const newPw = document.getElementById('s-new-pw').value;
    const conf = document.getElementById('s-confirm-pw').value;
    if (newPw !== conf) { showToast('Mismatch','Passwords do not match','error'); return; }
    if (newPw.length < 8) { showToast('Validation','Password must be 8+ characters','warning'); return; }
    const s = getStore();
    const u = s.users.find(u=>u.id===s.currentUserId);
    if (!u || u.password !== current) { showToast('Wrong password','Current password is incorrect','error'); return; }
    u.password = newPw;
    saveStore();
    showToast('Password changed','Your password has been updated','success');
    e.target.reset();
  });

  // TAX SAVE — actually persist to store
  document.getElementById('save-tax-btn')?.addEventListener('click', async () => {
    if (!isSuperAdmin) { showToast('Permission denied','Only Super Admin can change tax rates','error'); return; }
    const normal = parseFloat(document.getElementById('tax-normal')?.value);
    const luxury = parseFloat(document.getElementById('tax-luxury')?.value);
    if (isNaN(normal) || isNaN(luxury) || normal < 0 || luxury < 0 || normal > 100 || luxury > 100) {
      showToast('Invalid values','Tax rates must be between 0 and 100','error');
      return;
    }
    await saveTaxConfig({ normal, luxury });
    showToast('Tax rules saved', `Normal: ${normal}% | Luxury: ${luxury}% — applied to future bills`, 'success');
    // Show inline confirmation
    const msg = document.getElementById('tax-saved-msg');
    if (msg) { msg.style.display = 'inline'; setTimeout(() => msg.style.display = 'none', 3000); }
    // Update the displayed active rates
    document.querySelectorAll('#tax-saved-msg').forEach(el => el.style.display='inline');
  });

  // Notification toggles
  document.querySelectorAll('.notif-toggle-input').forEach(input => {
    input.addEventListener('change', async () => {
      const s = getStore();
      const u = s.users.find(usr => usr.id === s.currentUserId);
      if (!u.settings) u.settings = {};
      if (!u.settings.notifications) u.settings.notifications = {};
      u.settings.notifications[input.dataset.key] = input.checked;
      
      const res = await updateUser(u.id, { settings: u.settings });
      if (res && res.error) {
        showToast('Error Saving Preference', res.error, 'error');
        return;
      }
      
      await apiFetch('/audit-logs/', {
        method: 'POST',
        body: JSON.stringify({
          action: 'settings_update',
          description: `Notification preference changed: ${input.dataset.key} set to ${input.checked ? 'enabled' : 'disabled'}`,
          warehouseId: s.currentWarehouseId || null
        })
      });
      
      showToast('Preference saved', `${input.dataset.key} alerts ${input.checked ? 'enabled' : 'disabled'}`, 'info');
      renderSettings(); // Re-render to update toggle colors
    });
  });

  // EXPORT — delegated to exporter module
  document.querySelectorAll('.export-btn[data-entity]').forEach(btn => {
    btn.addEventListener('click', () => {
      const entity = btn.dataset.entity;
      const fmt = btn.dataset.fmt;
      btn.textContent = '⏳';
      btn.disabled = true;
      setTimeout(() => {
        let result;
        try {
          if (fmt === 'csv')  result = exportCSV(entity);
          else if (fmt === 'xlsx') result = exportXLSX(entity);
          else if (fmt === 'pdf')  result = exportPDF(entity);
          if (result?.error) {
            showToast('Export failed', result.error, 'error');
          } else {
            showToast('Export complete', `${result?.entity}: ${result?.count} records exported`, 'success');
          }
        } catch(e) {
          showToast('Export error', e.message, 'error');
        }
        btn.textContent = fmt.toUpperCase();
        btn.disabled = false;
      }, 50);
    });
  });

  // RESET
  document.getElementById('reset-btn')?.addEventListener('click', async () => {
    const ok = await confirm('This will delete all warehouses, users, bills and tables. Your admin account will remain.', '⚠️ Reset All Data');
    if (ok) {
      const s = getStore();
      const currentUser = s.users.find(u=>u.id===s.currentUserId);
      s.warehouses=[];s.bills=[];s.items=[];s.tables=[];s.tableData={};s.auditLogs=[];s.notifications=[];
      s.users = [currentUser];
      saveStore();
      showToast('Data reset','Platform reset to fresh state','success');
      location.hash='#/dashboard';
    }
  });
}
