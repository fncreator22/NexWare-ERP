import { getCurrentUser, getStore, saveStore, getTaxConfig, saveTaxConfig, getBills, getAllUsers, getWarehouses, getItems, getCurrency, saveCurrency, addAuditLog, updateUser } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, confirm, getSvgIcon, applyTheme, renderAvatar } from '../modules/ui.js';
import { exportCSV, exportXLSX, exportPDF } from '../modules/exporter.js';

export function renderSettings() {
  const user = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = ['super_admin','admin'].includes(user.role);
  const taxCfg = getTaxConfig();
  const currency = getCurrency();

  renderShell('Settings', 'Platform configuration and preferences', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">System Settings</h1>
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
              <div class="card-title">Profile Settings</div>
              <div class="card-subtitle">Your account information</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px">
            <div style="width:72px;height:72px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:white;flex-shrink:0;box-shadow:var(--shadow-brand);overflow:hidden">${renderAvatar(user.avatar, "width:100%;height:100%;object-fit:cover;border-radius:50%")}</div>
            <div>
              <div style="font-size:20px;font-weight:800;margin-bottom:2px">${user.name}</div>
              <div style="font-size:13px;color:var(--text-muted)">${user.email}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
                <button class="btn btn-secondary btn-xs" id="s-upload-photo-btn" type="button" style="padding:4px 8px;font-size:11px">Upload Photo</button>
                ${user.avatar?.startsWith('data:image/') ? `<button class="btn btn-danger btn-xs" id="s-remove-photo-btn" type="button" style="padding:4px 8px;font-size:11px;background:var(--accent-rose)">Remove Photo</button>` : ''}
              </div>
              <input type="file" id="s-photo-input" accept="image/*" style="display:none" />
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
              <div class="card-title">Security</div>
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
        <div class="card col-12">
          <div class="card-header">
            <div>
              <div class="card-title">Enterprise Tax Engine</div>
              <div class="card-subtitle">Configure multi-tax stacks, percentage rates, and flat handling fees</div>
            </div>
          </div>
          <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:var(--text-muted);display:flex;align-items:flex-start;gap:8px">
            <span style="color:var(--brand-500);margin-top:2px;flex-shrink:0">${getSvgIcon('info', 16)}</span>
            <div>
              The enterprise tax engine supports stacked percentage taxes (e.g. CGST + SGST) and flat fixed transaction fees. 
              Past invoices remain structurally unchanged.
              ${!isSuperAdmin ? '<br><span style="color:var(--accent-amber)">Note: Editing requires Super Admin role.</span>' : ''}
            </div>
          </div>
          
          <div style="overflow-x:auto;">
            <table class="table" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
              <thead>
                <tr style="border-bottom: 2px solid var(--border-default); text-align: left;">
                  <th style="padding: 10px; color: var(--text-secondary); font-size: 13px; font-weight: 700;">Tax Name</th>
                  <th style="padding: 10px; color: var(--text-secondary); font-size: 13px; font-weight: 700;">Type</th>
                  <th style="padding: 10px; color: var(--text-secondary); font-size: 13px; font-weight: 700;">Rate / Value</th>
                  <th style="padding: 10px; width: 100px; text-align: center; color: var(--text-secondary); font-size: 13px; font-weight: 700;">Actions</th>
                </tr>
              </thead>
              <tbody id="tax-grid-body">
                <!-- Rendered dynamically via Javascript -->
              </tbody>
            </table>
          </div>

          <div style="display:flex; justify-content: space-between; align-items:center; margin-top: 12px; gap: 16px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" id="add-tax-row-btn" ${!isSuperAdmin ? 'disabled' : ''} style="display:flex;align-items:center;gap:6px">${getSvgIcon('plus', 14)} Add Tax Component</button>
            <div style="display:flex;align-items:center;gap:12px">
              <button class="btn btn-primary btn-sm" id="save-tax-btn" ${!isSuperAdmin ? 'disabled title="Super Admin only"' : ''} style="display:flex;align-items:center;gap:6px">${getSvgIcon('save', 14)} Save Tax Rules</button>
              <span id="tax-saved-msg" style="font-size:12px;color:var(--accent-emerald);display:none;align-items:center;gap:4px">${getSvgIcon('check', 14)} Saved!</span>
            </div>
          </div>
        </div>` : ''}

        <!-- Currency Configuration -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">Currency Settings</div>
              <div class="card-subtitle">Select global and warehouse currency preferences</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Global Base Currency</label>
            <select id="s-global-currency" class="form-control" ${!isSuperAdmin ? 'disabled style="opacity:0.7"' : ''}>
              <option value="USD" ${currency==='USD'?'selected':''}>USD ($) - US Dollar</option>
              <option value="INR" ${currency==='INR'?'selected':''}>INR (₹) - Indian Rupee</option>
              <option value="EUR" ${currency==='EUR'?'selected':''}>EUR (€) - Euro</option>
              <option value="GBP" ${currency==='GBP'?'selected':''}>GBP (£) - British Pound</option>
              <option value="AED" ${currency==='AED'?'selected':''}>AED (د.إ) - UAE Dirham</option>
              <option value="SGD" ${currency==='SGD'?'selected':''}>SGD (S$) - Singapore Dollar</option>
            </select>
            <div class="form-hint">Sets the base currency for global financial metrics, invoices, and analytics.</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
            <button class="btn btn-primary btn-sm" id="save-currency-btn" ${!isSuperAdmin ? 'disabled title="Super Admin only"' : ''} style="display:flex;align-items:center;gap:6px">${getSvgIcon('save', 14)} Save Currency</button>
            <span id="currency-saved-msg" style="font-size:12px;color:var(--accent-emerald);display:none;align-items:center;gap:4px">${getSvgIcon('check', 14)} Saved!</span>
          </div>
        </div>

        <!-- Theme Configuration -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">Theme Preferences</div>
              <div class="card-subtitle">Select your enterprise visual identity</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Active Theme</label>
            <select id="s-theme" class="form-control">
              <option value="enterprise" ${getStore().theme==='enterprise'?'selected':''}>Enterprise Black & White (Default)</option>
              <option value="classic" ${getStore().theme==='classic'?'selected':''}>Classic Space Neon (Optional)</option>
            </select>
            <div class="form-hint">Applies theme styling immediately across all dashboards, ledgers, and pages.</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
            <button class="btn btn-primary btn-sm" id="save-theme-btn" style="display:flex;align-items:center;gap:6px">${getSvgIcon('save', 14)} Save Theme</button>
            <span id="theme-saved-msg" style="font-size:12px;color:var(--accent-emerald);display:none;align-items:center;gap:4px">${getSvgIcon('check', 14)} Saved!</span>
          </div>
        </div>

        <!-- Notifications -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">Notifications</div>
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
                  <!-- Export Panel -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">Export Center</div>
              <div class="card-subtitle">Download secure reports and tables in CSV, Excel, or PDF</div>
            </div>
          </div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;line-height:1.5">
            Access secure, tenant-scoped data exports. Select custom modular ranges, formats, and export categories in our secure center.
          </p>
          <button class="btn btn-secondary btn-sm" id="open-export-center-btn" style="display:flex;align-items:center;gap:6px">
            ${getSvgIcon('export', 16)} Open Export Center
          </button>
        </div>

        <!-- Danger Zone -->
        <div class="card col-6" style="border-color:rgba(244,63,94,0.2);background:rgba(244,63,94,0.03)">
          <div class="card-header">
            <div>
              <div class="card-title" style="color:var(--accent-rose)">Danger Zone</div>
              <div class="card-subtitle">Irreversible administrative actions</div>
            </div>
          </div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;line-height:1.5">
            Resetting the platform will permanently wipe all logs, workforce registries, tables, and bills. Your super_admin account will be kept.
          </p>
          <button class="btn btn-danger btn-sm" id="reset-btn" style="display:flex;align-items:center;gap:6px">
            ${getSvgIcon('trash', 16)} Reset System Data
          </button>
        </div>
      </div>
    </div>
  `);

  // Local cache for dynamic multi-tax list
  let localTaxes = taxCfg.taxes || [
    { name: "CGST", taxType: "percentage", rate: 2.5 },
    { name: "SGST", taxType: "percentage", rate: 2.5 }
  ];

  function renderTaxRows() {
    const tbody = document.getElementById('tax-grid-body');
    if (!tbody) return;
    tbody.innerHTML = localTaxes.map((tax, idx) => `
      <tr data-index="${idx}" style="border-bottom: 1px solid var(--border-default);">
        <td style="padding: 8px;">
          <input type="text" class="form-control tax-row-name" value="${tax.name}" placeholder="e.g. CGST" ${!isSuperAdmin ? 'readonly' : ''} style="width: 100%;" />
        </td>
        <td style="padding: 8px;">
          <select class="form-control tax-row-type" ${!isSuperAdmin ? 'disabled' : ''} style="width: 100%; border: 1px solid var(--border-default); border-radius: 6px; padding: 4px 8px; background: var(--bg-card); color: var(--text-primary);">
            <option value="percentage" ${tax.taxType === 'percentage' ? 'selected' : ''}>Percentage (%)</option>
            <option value="fixed" ${tax.taxType === 'fixed' ? 'selected' : ''}>Fixed Fee ($)</option>
          </select>
        </td>
        <td style="padding: 8px;">
          <input type="number" class="form-control tax-row-rate" value="${tax.rate}" step="0.01" min="0" ${!isSuperAdmin ? 'readonly' : ''} style="width: 100%;" />
        </td>
        <td style="padding: 8px; text-align: center;">
          <button class="btn btn-danger btn-sm remove-tax-row-btn" data-index="${idx}" ${!isSuperAdmin ? 'disabled' : ''} style="padding: 4px 8px;">${getSvgIcon('trash', 14)}</button>
        </td>
      </tr>
    `).join('');

    // Attach listeners to input changes
    tbody.querySelectorAll('.tax-row-name').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('tr').dataset.index);
        localTaxes[idx].name = e.target.value;
      });
    });

    tbody.querySelectorAll('.tax-row-type').forEach(select => {
      select.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('tr').dataset.index);
        localTaxes[idx].taxType = e.target.value;
      });
    });

    tbody.querySelectorAll('.tax-row-rate').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('tr').dataset.index);
        localTaxes[idx].rate = parseFloat(e.target.value) || 0;
      });
    });

    tbody.querySelectorAll('.remove-tax-row-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        localTaxes.splice(idx, 1);
        renderTaxRows();
      });
    });
  }

  if (isAdmin) {
    setTimeout(renderTaxRows, 50);
    document.getElementById('add-tax-row-btn')?.addEventListener('click', () => {
      localTaxes.push({ name: '', taxType: 'percentage', rate: 0 });
      renderTaxRows();
    });
  }

  // Profile save
  document.getElementById('profile-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('s-name').value.trim();
    if (!name) return;
    const s = getStore();
    const u = s.users.find(u=>u.id===s.currentUserId);
    if (u) {
      u.name = name;
      // If photo is initials, recreate them from the new name
      if (!u.avatar || !u.avatar.startsWith('data:image/')) {
        u.avatar = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
      }
      saveStore();
      await updateUser(u.id, { name, avatar: u.avatar });
      showToast('Profile updated','Your profile has been updated','success');
      renderSettings();
    }
  });

  // Photo upload triggers
  const photoInput = document.getElementById('s-photo-input');
  document.getElementById('s-upload-photo-btn')?.addEventListener('click', () => {
    photoInput?.click();
  });

  photoInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Size check: limit to 2MB to keep base64 storage compact
    if (file.size > 2 * 1024 * 1024) {
      showToast('File too large', 'Please upload an image smaller than 2MB', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target.result;
      const s = getStore();
      const u = s.users.find(usr => usr.id === s.currentUserId);
      if (u) {
        u.avatar = base64;
        saveStore();
        await updateUser(u.id, { avatar: base64 });
        showToast('Photo uploaded', 'Profile photo updated successfully', 'success');
        renderSettings();
      }
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('s-remove-photo-btn')?.addEventListener('click', async () => {
    const s = getStore();
    const u = s.users.find(usr => usr.id === s.currentUserId);
    if (u) {
      const fallbackInitials = u.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
      u.avatar = fallbackInitials;
      saveStore();
      await updateUser(u.id, { avatar: fallbackInitials });
      showToast('Photo removed', 'Profile photo reverted to initials', 'success');
      renderSettings();
    }
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
  document.getElementById('save-tax-btn')?.addEventListener('click', () => {
    if (!isSuperAdmin) { showToast('Permission denied','Only Super Admin can change tax rates','error'); return; }
    
    // Validate inputs
    for (const tax of localTaxes) {
      if (!tax.name.trim()) {
        showToast('Validation Error', 'Tax component name cannot be empty', 'error');
        return;
      }
      if (isNaN(tax.rate) || tax.rate < 0) {
        showToast('Validation Error', 'Tax rate must be a positive number', 'error');
        return;
      }
    }

    // Preserve legacy normal and luxury rates internally for backward compatibility
    const normalRate = localTaxes.find(t => t.taxType === 'percentage' && t.name.toLowerCase().includes('normal'))?.rate 
                       || localTaxes.filter(t => t.taxType === 'percentage')[0]?.rate 
                       || taxCfg.normal || 5.0;
    const luxuryRate = localTaxes.find(t => t.taxType === 'percentage' && t.name.toLowerCase().includes('luxury'))?.rate 
                       || localTaxes.filter(t => t.taxType === 'percentage')[1]?.rate 
                       || taxCfg.luxury || 15.0;

    const newConfig = {
      normal: normalRate,
      luxury: luxuryRate,
      taxes: localTaxes
    };

    saveTaxConfig(newConfig).then(() => {
      showToast('Tax rules saved', 'Enterprise tax engine configuration successfully updated', 'success');
      // Show inline confirmation
      const msg = document.getElementById('tax-saved-msg');
      if (msg) { msg.style.display = 'inline-flex'; setTimeout(() => msg.style.display = 'none', 3000); }
    });
  });

  // CURRENCY SAVE — actually persist to store
  document.getElementById('save-currency-btn')?.addEventListener('click', () => {
    if (!isSuperAdmin) { showToast('Permission denied','Only Super Admin can change base currency','error'); return; }
    const currency = document.getElementById('s-global-currency').value;
    saveCurrency(currency);
    showToast('Currency updated', `Platform currency set to: ${currency}`, 'success');
    const msg = document.getElementById('currency-saved-msg');
    if (msg) { msg.style.display = 'inline-flex'; setTimeout(() => msg.style.display = 'none', 3000); }
  });

  // THEME SAVE — actually persist to store
  document.getElementById('save-theme-btn')?.addEventListener('click', () => {
    const selectedTheme = document.getElementById('s-theme').value;
    const s = getStore();
    s.theme = selectedTheme;
    saveStore();
    applyTheme(selectedTheme);
    showToast('Theme updated', `Visual theme set to: ${selectedTheme === 'classic' ? 'Classic Space Neon' : 'Enterprise Black & White'}`, 'success');
    
    // Show inline confirmation
    const msg = document.getElementById('theme-saved-msg');
    if (msg) { msg.style.display = 'inline-flex'; setTimeout(() => msg.style.display = 'none', 3000); }
  });

  // Notification toggles
  document.querySelectorAll('.notif-toggle-input').forEach(input => {
    input.addEventListener('change', () => {
      const s = getStore();
      const u = s.users.find(usr => usr.id === s.currentUserId);
      if (!u.settings) u.settings = {};
      if (!u.settings.notifications) u.settings.notifications = {};
      u.settings.notifications[input.dataset.key] = input.checked;
      saveStore();
      showToast('Preference saved', `${input.dataset.key} alerts ${input.checked ? 'enabled' : 'disabled'}`, 'info');
      renderSettings(); // Re-render to update toggle colors
    });
  });

  // EXPORT POPUP CENTER
  document.getElementById('open-export-center-btn')?.addEventListener('click', () => {
    const isSuperAdmin = user.role === 'super_admin';
    const isAdmin = ['super_admin','admin'].includes(user.role);
    const isManager = ['super_admin','admin','manager'].includes(user.role);

    const categories = [
      { key:'bills',      label:'Billing & Invoices (Manager+)',   role:'manager' },
      { key:'inventory',  label:'Inventory Records (Manager+)',    role:'manager' },
      { key:'workforce',  label:'Workforce Members (Admin+)',      role:'admin'   },
      { key:'warehouses', label:'Warehouse Hubs (Super Admin)',    role:'super_admin' },
      { key:'audit',      label:'Security Audit Logs (Super Admin)', role:'super_admin' },
      { key:'all',        label:'Full Platform Ledger (Admin+)',   role:'admin'   },
    ].filter(e => {
      if (e.role === 'super_admin') return isSuperAdmin;
      if (e.role === 'admin') return isAdmin;
      if (e.role === 'manager') return isManager;
      return true;
    });

    // Create Modal Body Element
    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div class="form-group" style="margin-bottom: 16px;">
        <label class="form-label">Export Category</label>
        <select id="export-category" class="form-control" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;width:100%">
          ${categories.map(c => `<option value="${c.key}">${c.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom: 16px;">
        <label class="form-label" style="margin-bottom:8px;display:block">Export Format</label>
        <div style="display:flex;gap:20px;align-items:center">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
            <input type="radio" name="export-fmt" value="csv" checked style="accent-color:var(--brand-500)" /> CSV Sheets
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
            <input type="radio" name="export-fmt" value="xlsx" style="accent-color:var(--brand-500)" /> Excel Spreadsheet (XLSX)
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
            <input type="radio" name="export-fmt" value="pdf" style="accent-color:var(--brand-500)" /> PDF Document Report
          </label>
        </div>
      </div>
      <div class="form-hint" style="font-size:12px;color:var(--text-muted);background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:6px;padding:8px 12px;line-height:1.5;display:flex;align-items:flex-start;gap:6px">
        <span style="color:var(--brand-500);flex-shrink:0">${getSvgIcon('info', 16)}</span>
        <span>All data exports are fully tenant-partitioned and role-gated.</span>
      </div>
    `;

    // Create Modal Footer Element
    const modalFooter = document.createElement('div');
    modalFooter.style.cssText = 'display:flex;justify-content:flex-end;gap:12px;width:100%';
    modalFooter.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="export-modal-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="export-modal-run" style="display:flex;align-items:center;gap:6px">
        ${getSvgIcon('save', 14)} Run Export
      </button>
    `;

    // Create custom modal wrapper
    import('../modules/ui.js').then(({ createModal }) => {
      const modal = createModal({
        title: 'Secure Export Center',
        body: modalBody,
        footer: modalFooter
      });

      modal.el.querySelector('#export-modal-cancel').addEventListener('click', () => modal.close());
      modal.el.querySelector('#export-modal-run').addEventListener('click', () => {
        const category = modal.el.querySelector('#export-category').value;
        const fmt = modal.el.querySelector('input[name="export-fmt"]:checked').value;
        const runBtn = modal.el.querySelector('#export-modal-run');

        runBtn.textContent = '⏳ Exporting...';
        runBtn.disabled = true;

        setTimeout(() => {
          try {
            let result;
            if (fmt === 'csv')  result = exportCSV(category);
            else if (fmt === 'xlsx') result = exportXLSX(category);
            else if (fmt === 'pdf')  result = exportPDF(category);
            
            if (result?.error) {
              showToast('Export failed', result.error, 'error');
            } else {
              showToast('Export complete', `${result?.entity}: ${result?.count} records exported`, 'success');
              addAuditLog('export', `Exported ${category} data as ${fmt.toUpperCase()} (${result?.count || 0} records)`, user.id);
              modal.close();
            }
          } catch(e) {
            showToast('Export error', e.message, 'error');
          }
          runBtn.textContent = 'Run Export';
          runBtn.disabled = false;
        }, 400);
      });
    });
  });

  // SECURE PASSWORD-CONFIRMED RESET
  document.getElementById('reset-btn')?.addEventListener('click', () => {
    if (!isSuperAdmin) {
      showToast('Unauthorized Action', 'Only the Super Administrator role is permitted to perform platform resets.', 'error');
      return;
    }

    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div style="background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.2);border-radius:8px;padding:12px;margin-bottom:12px;font-size:13px;color:var(--accent-rose);display:flex;align-items:flex-start;gap:8px">
        <span style="color:var(--accent-rose);margin-top:2px;flex-shrink:0">${getSvgIcon('warning', 16)}</span>
        <div style="font-weight:700;line-height:1.4">
          WARNING: THIS WILL PERMANENTLY ERASE ALL PLATFORM WAREHOUSES, STAFF USERS, LEDGERS, AND CUSTOM SCHEMAS!
        </div>
      </div>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;line-height:1.5">
        Your current Super Admin account will remain intact. To confirm this highly sensitive action, please re-authenticate by entering your password below.
      </p>
      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label">Verify Super Admin Password</label>
        <input type="password" id="reset-confirm-password" class="form-control" placeholder="Enter password to confirm" style="width:100%" />
      </div>
    `;

    const modalFooter = document.createElement('div');
    modalFooter.style.cssText = 'display:flex;justify-content:flex-end;gap:12px;width:100%';
    modalFooter.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="reset-modal-cancel">Cancel Erase</button>
      <button class="btn btn-danger btn-sm" id="reset-modal-confirm">Confirm System Reset</button>
    `;

    import('../modules/ui.js').then(({ createModal }) => {
      const modal = createModal({
        title: 'Secure System Reset Confirmation',
        body: modalBody,
        footer: modalFooter
      });

      modal.el.querySelector('#reset-modal-cancel').addEventListener('click', () => modal.close());
      modal.el.querySelector('#reset-modal-confirm').addEventListener('click', () => {
        const passwordVal = modal.el.querySelector('#reset-confirm-password').value;
        if (!passwordVal) {
          showToast('Verification Required', 'Password is required to authenticate system reset.', 'warning');
          return;
        }
        
        const s = getStore();
        const currentUser = s.users.find(u=>u.id===s.currentUserId);
        if (currentUser.password !== passwordVal) {
          showToast('Access Denied', 'Authentication failed: Incorrect password.', 'error');
          return;
        }

        // Proceed with system reset!
        s.warehouses=[];s.bills=[];s.items=[];s.tables=[];s.tableData={};s.auditLogs=[];s.notifications=[];
        s.users = [currentUser];
        saveStore();
        showToast('System Reset Complete', 'Platform ledgers and databases have been wiped to fresh state.', 'success');
        modal.close();
        location.hash='#/dashboard';
      });
    });
  });
}
