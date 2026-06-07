/**
 * User Profile Page — Comprehensive personal identity, compliance, and corporate assignments
 */
import { getCurrentUser, getStore, saveStore, updateUser, getWarehouses } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, getSvgIcon, renderAvatar, updateDOMAvatars, formatDate, createModal, generateBarcodeSVG } from '../modules/ui.js';
import { canDo } from '../modules/permissions.js';
import { navigate } from '../modules/router.js';

export function renderProfile() {
  const user = getCurrentUser();
  if (!user) {
    navigate('/login');
    return;
  }

  // Populate default profile structure if missing to satisfy foundation requirements
  if (!user.profile) {
    user.profile = {
      jobTitle: user.role === 'super_admin' ? 'Chief Technology Officer' : 'Operations Logistics Manager',
      department: 'Operations & Engineering',
      joiningDate: '2025-06-15',
      managerId: 'super_admin',
      workType: 'Full-time',
      phone: '+1 (555) 019-2834',
      slackUsername: '@' + user.name.toLowerCase().replace(/\s+/g, '.'),
      documents: [
        { id: 'doc_1', name: 'Employment Offer Contract.pdf', status: 'Approved', uploadedAt: '2025-06-12' },
        { id: 'doc_2', name: 'NDA_Confidentiality_Agreement.pdf', status: 'Approved', uploadedAt: '2025-06-13' },
        { id: 'doc_3', name: 'W4_Tax_Declaration_2026.pdf', status: 'Pending Review', uploadedAt: '2026-01-05' }
      ],
      privacy: {
        twoFactor: false,
        sessionTimeout: 60,
        telemetry: true,
        sessionSharing: true
      },
      communicationIdentity: {
        preferredChannel: 'Slack',
        whatsappNotifications: true
      }
    };
  }

  let activeTab = 'personal';

  const updateProfileUI = () => {
    const container = document.getElementById('profile-page-content');
    if (!container) return;

    // Toggle active state classes on tab headers
    document.querySelectorAll('.profile-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === activeTab);
    });

    container.innerHTML = renderTabContent(activeTab, user);
    bindTabContentEvents(activeTab);
  };

  const html = `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">User Profile</h1>
          <p class="page-subtitle">Manage your personal credentials, documents, corporate assignments, and privacy settings</p>
        </div>
        <div class="page-header-actions" style="display:flex;gap:12px">
          <button class="btn btn-primary btn-sm" id="p-generate-id-btn" style="display:flex;align-items:center;gap:6px">
            🪪 Generate ID Card
          </button>
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <!-- Profile Header Banner -->
      <div style="background:var(--gradient-card);border:1px solid var(--border-brand);border-radius:var(--radius-xl);padding:24px;margin-bottom:24px;display:flex;align-items:center;gap:24px;flex-wrap:wrap">
        <div id="profile-avatar-wrapper" style="width:80px;height:80px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:800;color:white;flex-shrink:0;box-shadow:var(--shadow-brand);overflow:hidden;border:3px solid var(--bg-card)">
          ${renderAvatar(user.avatar, "width:100%;height:100%;object-fit:cover;border-radius:50%")}
        </div>
        <div style="flex-grow:1">
          <h2 style="font-size:22px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:8px">
            ${user.name}
            <span class="badge badge-brand" style="font-size:11px;padding:2px 8px;text-transform:capitalize">${user.role.replace('_', ' ')}</span>
          </h2>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:8px">${user.email}</p>
          <div style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:12px">
            <span>${getSvgIcon('warehouses', 12)} ${getWarehouses().find(w => w.id === user.warehouseId)?.name || 'Global Operations'}</span>
            <span>·</span>
            <span>ID: ${user.employeeId || user.enterprise_id || 'N/A'}</span>
          </div>
        </div>
      </div>

      <!-- Tab navigation -->
      <div class="table-toolbar" style="margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:0;gap:4px">
        <button class="profile-tab btn btn-ghost btn-sm active" data-tab="personal" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Personal Details</button>
        <button class="profile-tab btn btn-ghost btn-sm" data-tab="corporate" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Corporate Identity</button>
        <button class="profile-tab btn btn-ghost btn-sm" data-tab="documents" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Documents</button>
        <button class="profile-tab btn btn-ghost btn-sm" data-tab="activity" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Activity Logs</button>
        <button class="profile-tab btn btn-ghost btn-sm" data-tab="privacy" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Privacy & Security</button>
      </div>

      <!-- Tab content box -->
      <div id="profile-page-content"></div>
    </div>
  `;

  renderShell('User Profile', 'Your platform identity', html);

  // Bind tab navigation clicks
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      updateProfileUI();
    });
  });

  document.getElementById('p-generate-id-btn')?.addEventListener('click', () => {
    showIDCardModal(user);
  });

  // Initial draw
  updateProfileUI();
}

function renderTabContent(tab, user) {
  const profile = user.profile;
  if (tab === 'personal') {
    return `
      <div class="card animate-slideUp" style="max-width:640px">
        <div class="card-header"><div class="card-title">Personal Information</div></div>
        <form id="p-personal-form">
          <div class="form-group">
            <label class="form-label">Full Name <span class="req">*</span></label>
            <input type="text" id="p-name" class="form-control" value="${user.name}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Email Address (Read-only)</label>
            <input type="email" class="form-control" value="${user.email}" readonly style="opacity:0.7" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Phone Number</label>
              <input type="text" id="p-phone" class="form-control" value="${profile.phone || ''}" placeholder="+1 (555) 000-0000" />
            </div>
            <div class="form-group">
              <label class="form-label">Slack Handle</label>
              <input type="text" id="p-slack" class="form-control" value="${profile.slackUsername || ''}" placeholder="@username" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Residential Address</label>
            <textarea id="p-address" class="form-control" rows="2" placeholder="123 Logistics Way, Suite A">${profile.address || ''}</textarea>
          </div>
          <div style="border-top:1px solid var(--border-subtle);margin:20px 0;padding-top:16px">
            <h4 style="margin-bottom:12px;font-size:14px;font-weight:700;color:var(--text-primary)">Emergency Contact Info</h4>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Contact Name</label>
                <input type="text" id="p-emergency-name" class="form-control" value="${profile.emergencyContactName || ''}" placeholder="Contact Name" />
              </div>
              <div class="form-group">
                <label class="form-label">Relationship</label>
                <input type="text" id="p-emergency-relation" class="form-control" value="${profile.emergencyContactRelation || ''}" placeholder="Relation (e.g. Spouse)" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Emergency Phone Number</label>
              <input type="text" id="p-emergency-phone" class="form-control" value="${profile.emergencyContactPhone || ''}" placeholder="+1 (555) 000-0000" />
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Save Changes</button>
        </form>
      </div>
    `;
  } else if (tab === 'corporate') {
    const hasWorkforceEdit = canDo('workforce', 'edit', user);
    return `
      <div class="card animate-slideUp" style="max-width:640px">
        <div class="card-header"><div class="card-title">Corporate Assignment</div></div>
        <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:var(--text-muted);display:flex;align-items:center;gap:8px">
          <span style="color:var(--brand-500);flex-shrink:0">${getSvgIcon('info', 16)}</span>
          <span>Corporate assignments are managed by administration. ${hasWorkforceEdit ? 'You have permissions to edit these fields.' : 'These fields are read-only.'}</span>
        </div>
        <form id="p-corporate-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Job Title</label>
              <input type="text" id="p-title" class="form-control" value="${profile.jobTitle || ''}" ${!hasWorkforceEdit ? 'readonly style="opacity:0.7"' : ''} />
            </div>
            <div class="form-group">
              <label class="form-label">Department</label>
              <input type="text" id="p-dept" class="form-control" value="${profile.department || ''}" ${!hasWorkforceEdit ? 'readonly style="opacity:0.7"' : ''} />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Date of Joining</label>
              <input type="date" id="p-joining" class="form-control" value="${profile.joiningDate || ''}" ${!hasWorkforceEdit ? 'readonly style="opacity:0.7"' : ''} />
            </div>
            <div class="form-group">
              <label class="form-label">Work Type</label>
              <select id="p-worktype" class="form-control" ${!hasWorkforceEdit ? 'disabled style="opacity:0.7"' : ''}>
                <option value="Full-time" ${profile.workType === 'Full-time' ? 'selected' : ''}>Full-time Employee</option>
                <option value="Part-time" ${profile.workType === 'Part-time' ? 'selected' : ''}>Part-time Employee</option>
                <option value="Contract" ${profile.workType === 'Contract' ? 'selected' : ''}>Contractual</option>
                <option value="Remote" ${profile.workType === 'Remote' ? 'selected' : ''}>Remote / Distributed</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Work Shift</label>
              <select id="p-shift" class="form-control" ${!hasWorkforceEdit ? 'disabled style="opacity:0.7"' : ''}>
                <option value="Day Shift" ${profile.shift === 'Day Shift' ? 'selected' : ''}>Day Shift (08:00 - 16:00)</option>
                <option value="Swing Shift" ${profile.shift === 'Swing Shift' ? 'selected' : ''}>Swing Shift (16:00 - 00:00)</option>
                <option value="Night Shift" ${profile.shift === 'Night Shift' ? 'selected' : ''}>Night Shift (00:00 - 08:00)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Duty Location</label>
              <input type="text" id="p-location" class="form-control" value="${profile.location || ''}" placeholder="Zone B Docks" ${!hasWorkforceEdit ? 'readonly style="opacity:0.7"' : ''} />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Assigned Duty Warehouse</label>
            <select id="p-warehouse-assigned" class="form-control" ${!hasWorkforceEdit ? 'disabled style="opacity:0.7"' : ''}>
              <option value="">Global / Unassigned</option>
              ${getWarehouses().map(w => `<option value="${w.id}" ${profile.assignedWarehouseId === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
            </select>
          </div>
          ${hasWorkforceEdit ? `<button type="submit" class="btn btn-primary btn-sm">Update Corporate Assignment</button>` : ''}
        </form>
      </div>
    `;
  } else if (tab === 'documents') {
    return `
      <div class="card animate-slideUp">
        <div class="card-header" style="justify-content:space-between;align-items:center">
          <div>
            <div class="card-title">Employee Document Repository</div>
            <div class="card-subtitle">Secure employment and compliance documents</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="p-upload-doc-btn" style="display:flex;align-items:center;gap:6px">
            ${getSvgIcon('plus', 14)} Secure Upload
          </button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Type</th>
                <th>Uploaded Date</th>
                <th>Expiry Date</th>
                <th>Status</th>
                <th>Remarks / Reviewer</th>
                <th style="text-align:right">Action</th>
              </tr>
            </thead>
            <tbody>
              ${(profile.documents || []).map(d => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <span style="color:var(--text-muted)">${getSvgIcon('audit', 16)}</span>
                      <span style="font-weight:600">${d.name}</span>
                    </div>
                  </td>
                  <td><span class="badge badge-secondary" style="font-size:11px;padding:2px 8px">${d.type || 'ID Proof'}</span></td>
                  <td>${d.uploadedAt}</td>
                  <td>${d.expiryDate || '—'}</td>
                  <td>
                    <span class="badge ${d.status === 'Approved' ? 'badge-success' : d.status === 'Rejected' ? 'badge-danger' : 'badge-warning'}">
                      ${d.status}
                    </span>
                  </td>
                  <td style="font-size:12px;color:var(--text-secondary)">
                    ${d.status === 'Pending Review' ? '<em>Pending Review</em>' : `
                      <div><strong>Reviewed by:</strong> ${d.reviewerName || 'Supervisor'}</div>
                      ${d.remarks ? `<div style="font-style:italic;margin-top:2px;color:var(--text-muted)">"${d.remarks}"</div>` : ''}
                    `}
                  </td>
                  <td style="text-align:right">
                    <button class="btn btn-ghost btn-xs" onclick="showToast('Secure Download', 'Document download requested securely', 'info')">Download</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (tab === 'activity') {
    const allLogs = getStore().auditLogs || [];
    const userLogs = allLogs.filter(l => l.userId === user.id).slice(0, 10);
    return `
      <div class="card animate-slideUp">
        <div class="card-header">
          <div class="card-title">Recent Activity Logs</div>
          <div class="card-subtitle">Recent security and administrative actions logged under your credentials</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:10px">
          ${userLogs.length === 0 ? `
            <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">No recent logs recorded under your profile</div>
          ` : userLogs.map(log => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--glass-bg);border:1px solid var(--border-subtle);border-radius:8px">
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${log.description}</div>
                <div style="font-size:11px;color:var(--text-muted)">IP: 127.0.0.1 · Action: ${log.action}</div>
              </div>
              <span style="font-size:11px;color:var(--text-muted)">${formatDate(log.timestamp)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'privacy') {
    const p = profile.privacy || { twoFactor: false, sessionTimeout: 60, telemetry: true, sessionSharing: true };
    return `
      <div class="card animate-slideUp" style="max-width:640px">
        <div class="card-header">
          <div class="card-title">Privacy & Security Controls</div>
          <div class="card-subtitle">Manage multi-factor authentication, sessions, and telemetry consents</div>
        </div>
        <form id="p-privacy-form" style="display:flex;flex-direction:column;gap:20px;margin-top:10px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary)">Two-Factor Authentication (2FA)</div>
              <div style="font-size:12px;color:var(--text-muted)">Enforce secure one-time passcode confirmation on logins</div>
            </div>
            <label style="display:flex;align-items:center;cursor:pointer">
              <input type="checkbox" id="p-2fa" class="privacy-toggle" ${p.twoFactor ? 'checked' : ''} style="display:none" />
              <div class="toggle-switch ${p.twoFactor ? 'on' : ''}" style="width:40px;height:22px;border-radius:11px;background:${p.twoFactor ? 'var(--brand-500)' : 'var(--bg-input)'};border:1px solid var(--border-default);position:relative;transition:all 0.2s;cursor:pointer">
                <div style="position:absolute;top:2px;left:${p.twoFactor ? '18px' : '2px'};width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>
              </div>
            </label>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary)">Performance Telemetry</div>
              <div style="font-size:12px;color:var(--text-muted)">Allow sharing loading metric details to improve load speed</div>
            </div>
            <label style="display:flex;align-items:center;cursor:pointer">
              <input type="checkbox" id="p-telemetry" class="privacy-toggle" ${p.telemetry ? 'checked' : ''} style="display:none" />
              <div class="toggle-switch ${p.telemetry ? 'on' : ''}" style="width:40px;height:22px;border-radius:11px;background:${p.telemetry ? 'var(--brand-500)' : 'var(--bg-input)'};border:1px solid var(--border-default);position:relative;transition:all 0.2s;cursor:pointer">
                <div style="position:absolute;top:2px;left:${p.telemetry ? '18px' : '2px'};width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>
              </div>
            </label>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary)">Active Session Logs sharing</div>
              <div style="font-size:12px;color:var(--text-muted)">Display active logged-in device details in security dashboard</div>
            </div>
            <label style="display:flex;align-items:center;cursor:pointer">
              <input type="checkbox" id="p-sessionsharing" class="privacy-toggle" ${p.sessionSharing ? 'checked' : ''} style="display:none" />
              <div class="toggle-switch ${p.sessionSharing ? 'on' : ''}" style="width:40px;height:22px;border-radius:11px;background:${p.sessionSharing ? 'var(--brand-500)' : 'var(--bg-input)'};border:1px solid var(--border-default);position:relative;transition:all 0.2s;cursor:pointer">
                <div style="position:absolute;top:2px;left:${p.sessionSharing ? '18px' : '2px'};width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>
              </div>
            </label>
          </div>

          <div class="form-group" style="margin-top:10px">
            <label class="form-label">Automatic Logout Timeout (Minutes)</label>
            <input type="range" id="p-timeout" min="10" max="240" step="10" value="${p.sessionTimeout || 60}" style="width:100%;accent-color:var(--brand-500)" />
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:4px">
              <span>10 mins</span>
              <span id="p-timeout-lbl" style="font-weight:700;color:var(--text-primary)">${p.sessionTimeout || 60} minutes</span>
              <span>240 mins</span>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Save Security Preferences</button>
        </form>
      </div>
    `;
  }
}

function bindTabContentEvents(tab) {
  const s = getStore();
  const currentUserDoc = s.users.find(u => u.id === s.currentUserId);
  if (!currentUserDoc) return;

  // Ensure default profile structure is initialized under doc context
  if (!currentUserDoc.profile) {
    currentUserDoc.profile = {
      jobTitle: currentUserDoc.role === 'super_admin' ? 'Chief Technology Officer' : 'Operations Logistics Manager',
      department: 'Operations & Engineering',
      joiningDate: '2025-06-15',
      managerId: 'super_admin',
      workType: 'Full-time',
      phone: '+1 (555) 019-2834',
      slackUsername: '@' + currentUserDoc.name.toLowerCase().replace(/\s+/g, '.'),
      documents: [
        { id: 'doc_1', name: 'Employment Offer Contract.pdf', status: 'Approved', uploadedAt: '2025-06-12' },
        { id: 'doc_2', name: 'NDA_Confidentiality_Agreement.pdf', status: 'Approved', uploadedAt: '2025-06-13' },
        { id: 'doc_3', name: 'W4_Tax_Declaration_2026.pdf', status: 'Pending Review', uploadedAt: '2026-01-05' }
      ],
      privacy: {
        twoFactor: false,
        sessionTimeout: 60,
        telemetry: true,
        sessionSharing: true
      },
      communicationIdentity: {
        preferredChannel: 'Slack',
        whatsappNotifications: true
      }
    };
  }

  if (tab === 'personal') {
    document.getElementById('p-personal-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameVal = document.getElementById('p-name').value.trim();
      const phoneVal = document.getElementById('p-phone').value.trim();
      const slackVal = document.getElementById('p-slack').value.trim();
      const addressVal = document.getElementById('p-address').value.trim();
      const emName = document.getElementById('p-emergency-name').value.trim();
      const emRelation = document.getElementById('p-emergency-relation').value.trim();
      const emPhone = document.getElementById('p-emergency-phone').value.trim();

      if (!nameVal) return;

      currentUserDoc.name = nameVal;
      currentUserDoc.profile.phone = phoneVal;
      currentUserDoc.profile.slackUsername = slackVal;
      currentUserDoc.profile.address = addressVal;
      currentUserDoc.profile.emergencyContactName = emName;
      currentUserDoc.profile.emergencyContactRelation = emRelation;
      currentUserDoc.profile.emergencyContactPhone = emPhone;

      saveStore();
      updateDOMAvatars(currentUserDoc.avatar, nameVal);
      await updateUser(currentUserDoc.id, {
        name: nameVal,
        profile: currentUserDoc.profile
      });
      showToast('Personal info saved', 'Your profile details have been updated', 'success');
      renderProfile();
    });
  } else if (tab === 'corporate') {
    document.getElementById('p-corporate-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const jobTitleVal = document.getElementById('p-title').value.trim();
      const deptVal = document.getElementById('p-dept').value.trim();
      const joiningVal = document.getElementById('p-joining').value;
      const workTypeVal = document.getElementById('p-worktype').value;
      const shiftVal = document.getElementById('p-shift').value;
      const locVal = document.getElementById('p-location').value.trim();
      const assignedWhVal = document.getElementById('p-warehouse-assigned').value;

      currentUserDoc.profile.jobTitle = jobTitleVal;
      currentUserDoc.profile.department = deptVal;
      currentUserDoc.profile.joiningDate = joiningVal;
      currentUserDoc.profile.workType = workTypeVal;
      currentUserDoc.profile.shift = shiftVal;
      currentUserDoc.profile.location = locVal;
      currentUserDoc.profile.assignedWarehouseId = assignedWhVal;
      if (assignedWhVal) {
        currentUserDoc.warehouseId = assignedWhVal;
      }

      saveStore();
      await updateUser(currentUserDoc.id, {
        warehouseId: assignedWhVal || null,
        profile: currentUserDoc.profile
      });
      showToast('Corporate assignment saved', 'Corporate settings updated', 'success');
      renderProfile();
    });
  } else if (tab === 'documents') {
    document.getElementById('p-upload-doc-btn')?.addEventListener('click', () => {
      const modalBody = document.createElement('div');
      modalBody.innerHTML = `
        <form id="p-upload-form" style="display:flex;flex-direction:column;gap:16px">
          <div class="form-group">
            <label class="form-label">Document Type <span class="req">*</span></label>
            <select id="p-upload-type" class="form-control" style="background:var(--bg-input)" required>
              <option value="ID Proof">ID Proof</option>
              <option value="Passport">Passport</option>
              <option value="Contract">Contract / Agreement</option>
              <option value="Certificate">Professional Certificate</option>
              <option value="License">Driving / Equipment License</option>
              <option value="Tax Document">Tax Document</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Expiry Date</label>
            <input type="date" id="p-upload-expiry" class="form-control" />
          </div>
          <div class="form-group">
            <label class="form-label">Select File <span class="req">*</span></label>
            <input type="file" id="p-upload-file" class="form-control" required accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
          </div>
        </form>
      `;

      const modalFooter = document.createElement('div');
      modalFooter.style.display = 'flex';
      modalFooter.style.gap = '12px';
      modalFooter.style.justifyContent = 'flex-end';
      modalFooter.innerHTML = `
        <button class="btn btn-secondary" id="p-upload-cancel">Cancel</button>
        <button class="btn btn-primary" id="p-upload-submit">Upload Document</button>
      `;

      const modal = createModal({
        title: 'Upload Compliance Document',
        body: modalBody,
        footer: modalFooter
      });

      modal.el.querySelector('#p-upload-cancel').addEventListener('click', () => modal.close());

      modal.el.querySelector('#p-upload-submit').addEventListener('click', async (evt) => {
        evt.preventDefault();
        const typeVal = modal.el.querySelector('#p-upload-type').value;
        const expiryVal = modal.el.querySelector('#p-upload-expiry').value;
        const fileInput = modal.el.querySelector('#p-upload-file');
        const file = fileInput.files[0];

        if (!file) {
          showToast('Validation Error', 'Please select a file to upload.', 'warning');
          return;
        }

        const newDoc = {
          id: 'doc_' + Date.now(),
          name: file.name,
          type: typeVal,
          expiryDate: expiryVal || null,
          status: 'Pending Review',
          uploadedAt: new Date().toISOString().split('T')[0]
        };

        currentUserDoc.profile.documents = currentUserDoc.profile.documents || [];
        currentUserDoc.profile.documents.push(newDoc);
        saveStore();
        
        await updateUser(currentUserDoc.id, {
          profile: currentUserDoc.profile
        });

        showToast('Document Uploaded', `${file.name} is now pending compliance review.`, 'success');
        modal.close();
        renderProfile();
      });
    });
  } else if (tab === 'privacy') {
    const slider = document.getElementById('p-timeout');
    const label = document.getElementById('p-timeout-lbl');
    if (slider && label) {
      slider.addEventListener('input', (e) => {
        label.textContent = e.target.value + ' minutes';
      });
    }

    document.querySelectorAll('.privacy-toggle').forEach(chk => {
      chk.addEventListener('change', () => {
        const switchDiv = chk.nextElementSibling;
        if (switchDiv) {
          switchDiv.classList.toggle('on', chk.checked);
          switchDiv.style.background = chk.checked ? 'var(--brand-500)' : 'var(--bg-input)';
          switchDiv.firstElementChild.style.left = chk.checked ? '18px' : '2px';
        }
      });
    });

    document.getElementById('p-privacy-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const twoFactor = document.getElementById('p-2fa').checked;
      const telemetry = document.getElementById('p-telemetry').checked;
      const sessionSharing = document.getElementById('p-sessionsharing').checked;
      const sessionTimeout = parseInt(document.getElementById('p-timeout').value);

      currentUserDoc.profile.privacy = {
        twoFactor,
        telemetry,
        sessionSharing,
        sessionTimeout
      };

      saveStore();
      await updateUser(currentUserDoc.id, {
        profile: currentUserDoc.profile
      });
      showToast('Security preferences saved', 'Privacy settings successfully updated', 'success');
      renderProfile();
    });
  }
}

export function showIDCardModal(u) {
  const barcodeHTML = generateBarcodeSVG(u.employeeId || u.enterprise_id || u.id, { barWidth: 1.2, height: 35 });
  const whName = getWarehouses().find(w => w.id === u.warehouseId)?.name || 'Global Operations';
  
  const body = document.createElement('div');
  body.style.display = 'flex';
  body.style.gap = '32px';
  body.style.justifyContent = 'center';
  body.style.alignItems = 'center';
  body.style.padding = '24px';
  body.style.flexWrap = 'wrap';
  body.style.background = '#0d0e1f';
  
  body.innerHTML = `
    <style>
      .id-card {
        width: 230px;
        height: 360px;
        border-radius: 16px;
        background: linear-gradient(145deg, #1e2040, #131428);
        border: 1px solid rgba(99, 102, 241, 0.25);
        box-shadow: 0 12px 24px rgba(0,0,0,0.5);
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 20px;
        color: white;
        font-family: 'Inter', sans-serif;
      }
      .id-card::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 60%);
        pointer-events: none;
      }
      .id-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        padding-bottom: 10px;
      }
      .id-logo {
        font-weight: 800;
        font-size: 13px;
        color: var(--brand-400, #818cf8);
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .id-badge {
        font-size: 8px;
        letter-spacing: 1px;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #ef4444;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 700;
      }
      .id-profile {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 15px;
      }
      .id-avatar {
        width: 85px;
        height: 85px;
        border-radius: 50%;
        border: 3px solid rgba(99, 102, 241, 0.4);
        background: var(--gradient-brand);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        font-weight: 800;
        overflow: hidden;
        box-shadow: 0 8px 16px rgba(0,0,0,0.3);
      }
      .id-name {
        font-size: 17px;
        font-weight: 800;
        margin-top: 12px;
        text-align: center;
        text-shadow: 0 2px 4px rgba(0,0,0,0.4);
      }
      .id-role {
        font-size: 11px;
        color: #a5b4fc;
        margin-top: 4px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .id-footer {
        border-top: 1px solid rgba(255,255,255,0.08);
        padding-top: 10px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
      }
      .id-meta-title {
        font-size: 8px;
        text-transform: uppercase;
        color: #64748b;
        font-weight: 700;
      }
      .id-meta-value {
        font-size: 11px;
        font-weight: 700;
        color: #f8fafc;
      }
      .id-card-back {
        background: linear-gradient(145deg, #131428, #0b0c16);
      }
      .id-back-title {
        font-size: 10px;
        font-weight: 800;
        color: #64748b;
        text-transform: uppercase;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        padding-bottom: 4px;
        margin-bottom: 8px;
      }
      .id-detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 12px;
      }
      .id-barcode-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: white;
        padding: 8px;
        border-radius: 8px;
        margin-top: auto;
      }
      .id-barcode-wrap svg {
        max-width: 100%;
      }
    </style>

    <!-- FRONT SIDE -->
    <div class="id-card">
      <div class="id-card-header">
        <div class="id-logo">⚡ WAREOPS</div>
        <div class="id-badge">ACCESS ID</div>
      </div>
      <div class="id-profile">
        <div class="id-avatar">
          ${renderAvatar(u.avatar, "width:100%;height:100%;object-fit:cover;border-radius:50%")}
        </div>
        <div class="id-name">${u.name}</div>
        <div class="id-role">${(u.profile?.jobTitle || u.role).replace('_', ' ')}</div>
      </div>
      <div class="id-footer">
        <div>
          <div class="id-meta-title">Duty Warehouse</div>
          <div class="id-meta-value">${whName}</div>
        </div>
        <div style="text-align:right">
          <div class="id-meta-title">Enterprise ID</div>
          <div class="id-meta-value" style="color:#818cf8">${u.employeeId || u.enterprise_id || 'N/A'}</div>
        </div>
      </div>
    </div>

    <!-- BACK SIDE -->
    <div class="id-card id-card-back">
      <div>
        <div class="id-back-title">Corporate Info</div>
        <div class="id-detail-grid">
          <div>
            <div class="id-meta-title">Department</div>
            <div class="id-meta-value" style="font-size:10px">${u.profile?.department || 'Operations'}</div>
          </div>
          <div>
            <div class="id-meta-title">Join Date</div>
            <div class="id-meta-value" style="font-size:10px">${u.profile?.joiningDate || '2025-06-15'}</div>
          </div>
          <div>
            <div class="id-meta-title">Work Shift</div>
            <div class="id-meta-value" style="font-size:10px">${u.profile?.shift || 'Day Shift'}</div>
          </div>
          <div>
            <div class="id-meta-title">Duty Location</div>
            <div class="id-meta-value" style="font-size:10px">${u.profile?.location || 'Zone A Hub'}</div>
          </div>
        </div>

        <div class="id-back-title" style="margin-top:14px">In Case of Emergency</div>
        <div>
          <div class="id-meta-value" style="font-size:12px">${u.profile?.emergencyContactName || 'Contact Admin'}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">
            Relation: ${u.profile?.emergencyContactRelation || 'Supervisor'}<br/>
            Phone: ${u.profile?.emergencyContactPhone || 'N/A'}
          </div>
        </div>
      </div>

      <div class="id-barcode-wrap">
        ${barcodeHTML}
        <div style="font-size:8px;color:#0f172a;font-family:monospace;margin-top:4px;font-weight:700">${u.employeeId || u.enterprise_id || u.id}</div>
      </div>
    </div>
  `;

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary" id="id-card-close">Close Preview</button>
  `;

  const modal = createModal({
    title: `Access Badge — ${u.name}`,
    body,
    footer,
    size: 'lg'
  });

  modal.el.querySelector('#id-card-close').addEventListener('click', modal.close);
}
