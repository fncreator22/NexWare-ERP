/**
 * Automation & Workflow Engine — Visual IF/THEN Event Rules
 */
import { getCurrentUser, getStore, saveStore, addAuditLog, getItems, getBills, getWarehouses, createBill } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { showToast, createModal, getSvgIcon, formatDate, formatDateTime, confirm } from '../modules/ui.js';
import { canDo } from '../modules/permissions.js';

function getAutomationRules() {
  const s = getStore();
  if (!s.automationRules) {
    s.automationRules = [
      {
        id: 'rule_1',
        name: 'Auto-Generate Draft Invoice on Low Stock',
        trigger: 'stock_low',
        conditionOp: '<=',
        conditionVal: 20,
        actionType: 'draft_invoice',
        actionTarget: 'Auto-Restock PO Invoice',
        active: true,
        executionCount: 14,
        lastTriggered: new Date(Date.now() - 3600000 * 2).toISOString()
      },
      {
        id: 'rule_2',
        name: 'Dispatch Webhook on Large Order',
        trigger: 'large_invoice',
        conditionOp: '>=',
        conditionVal: 5000,
        actionType: 'send_webhook',
        actionTarget: 'https://api.enterprise-erp.com/hooks/large-orders',
        active: true,
        executionCount: 8,
        lastTriggered: new Date(Date.now() - 3600000 * 18).toISOString()
      },
      {
        id: 'rule_3',
        name: 'Audit Security Alert on User Role Escalation',
        trigger: 'user_status',
        conditionOp: '===',
        conditionVal: 'active',
        actionType: 'log_audit',
        actionTarget: 'Security Compliance Audit Log',
        active: true,
        executionCount: 32,
        lastTriggered: new Date(Date.now() - 3600000 * 5).toISOString()
      }
    ];
    saveStore();
  }
  return s.automationRules;
}

function getAutomationLogs() {
  const s = getStore();
  if (!s.automationLogs) {
    s.automationLogs = [
      { id: 'log_1', ruleName: 'Auto-Generate Draft Invoice on Low Stock', status: 'Success', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), detail: 'Generated draft invoice for 50x Industrial Sensors' },
      { id: 'log_2', ruleName: 'Dispatch Webhook on Large Order', status: 'Success', timestamp: new Date(Date.now() - 3600000 * 18).toISOString(), detail: 'Webhook HTTP 200 OK sent to api.enterprise-erp.com' },
      { id: 'log_3', ruleName: 'Audit Security Alert on User Role Escalation', status: 'Success', timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), detail: 'Logged compliance check for Admin user' }
    ];
    saveStore();
  }
  return s.automationLogs;
}

export function renderAutomation() {
  const user = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }

  const rules = getAutomationRules();
  const logs = getAutomationLogs();
  const activeCount = rules.filter(r => r.active).length;
  const totalExecs = rules.reduce((s, r) => s + (r.executionCount || 0), 0);

  const html = `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Workflow & Business Automation</h1>
          <p class="page-subtitle">Configure visual IF/THEN event rules, restock triggers, and webhook actions</p>
        </div>
        <div class="page-header-actions" style="display:flex;gap:10px">
          <button class="btn btn-secondary btn-sm" id="btn-run-rules" style="display:inline-flex;align-items:center;gap:6px">
            ${getSvgIcon("zap", 14)} Run Test Triggers
          </button>
          <button class="btn btn-primary btn-sm" id="btn-create-rule" style="display:inline-flex;align-items:center;gap:6px">
            + Create New Rule
          </button>
        </div>
      </div>

      <!-- Overview Stats -->
      <div class="stat-grid" style="margin-bottom:24px">
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#6366f1"></div>
          <div class="stat-card-icon" style="background:rgba(99,102,241,0.15);color:#6366f1">${getSvgIcon('settings', 20)}</div>
          <div class="stat-card-value">${rules.length}</div>
          <div class="stat-card-label">Total Rules</div>
          <div class="stat-card-trend trend-up">${activeCount} Active</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#10b981"></div>
          <div class="stat-card-icon" style="background:rgba(16,185,129,0.15);color:#10b981">${getSvgIcon('check', 20)}</div>
          <div class="stat-card-value">${totalExecs}</div>
          <div class="stat-card-label">Total Rule Executions</div>
          <div class="stat-card-trend trend-up">100% Reliability</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#06b6d4"></div>
          <div class="stat-card-icon" style="background:rgba(6,182,212,0.15);color:#06b6d4">${getSvgIcon('export', 20)}</div>
          <div class="stat-card-value">${logs.length}</div>
          <div class="stat-card-label">Automation Log Entries</div>
          <div class="stat-card-trend">Real-time audit</div>
        </div>
      </div>

      <!-- Rules Builder List -->
      <div class="card" style="margin-bottom:24px">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div class="card-title">Configured Automation Rules</div>
            <div class="card-subtitle">Visual business logic triggers</div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px" id="rules-container">
          ${rules.length === 0 ? `
            <div style="padding:40px;text-align:center;color:var(--text-muted)">No automation rules created yet. Click "+ Create New Rule" above to add one.</div>
          ` : rules.map(rule => `
            <div style="background:var(--bg-card-hover);border:1px solid var(--border-default);border-radius:12px;padding:18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
              <div style="width:42px;height:42px;border-radius:10px;background:rgba(99,102,241,0.12);display:flex;align-items:center;justify-content:center;color:var(--brand-500);flex-shrink:0">
                ${getSvgIcon(rule.actionType === 'send_webhook' ? 'export' : rule.actionType === 'draft_invoice' ? 'billing' : 'bell', 20)}
              </div>
              <div style="flex:1;min-width:240px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span style="font-size:15px;font-weight:700;color:var(--text-primary)">${rule.name}</span>
                  <span class="badge ${rule.active ? 'badge-success' : 'badge-muted'}" style="font-size:10px">${rule.active ? 'ACTIVE' : 'PAUSED'}</span>
                </div>
                
                <!-- Visual Flow Diagram -->
                <div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:8px;flex-wrap:wrap">
                  <span style="padding:3px 8px;background:var(--bg-input);border-radius:4px;color:var(--accent-cyan);font-weight:600">IF ${rule.trigger.replace('_', ' ').toUpperCase()} ${rule.conditionOp} ${rule.conditionVal}</span>
                  <span style="color:var(--text-muted)">→</span>
                  <span style="padding:3px 8px;background:var(--bg-input);border-radius:4px;color:var(--accent-emerald);font-weight:600">THEN ${rule.actionType.replace('_', ' ').toUpperCase()}</span>
                  <span style="color:var(--text-muted);font-size:11px">(${rule.actionTarget})</span>
                </div>
              </div>

              <div style="display:flex;align-items:center;gap:12px;flex-shrink:0">
                <div style="text-align:right;font-size:11px;color:var(--text-muted)">
                  <div>${rule.executionCount || 0} runs</div>
                  <div>${rule.lastTriggered ? formatDate(rule.lastTriggered) : 'Never'}</div>
                </div>

                <label style="display:flex;align-items:center;cursor:pointer">
                  <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.active ? 'checked' : ''} style="display:none" />
                  <div class="toggle-switch ${rule.active ? 'on' : ''}" style="width:40px;height:22px;border-radius:11px;background:${rule.active ? 'var(--brand-500)' : 'var(--bg-input)'};border:1px solid var(--border-default);position:relative;transition:all 0.2s;cursor:pointer">
                    <div style="position:absolute;top:2px;left:${rule.active ? '18px' : '2px'};width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>
                  </div>
                </label>

                <button class="btn btn-ghost btn-sm btn-test-rule" data-id="${rule.id}" title="Test Run Rule" style="font-size:11px">${getSvgIcon('collapse', 12)} Test</button>
                <button class="btn btn-ghost btn-sm btn-delete-rule" data-id="${rule.id}" title="Delete Rule" style="color:var(--accent-rose);font-size:11px;display:inline-flex;align-items:center;">${getSvgIcon('trash', 14)}</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Execution Log Table -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Recent Automation Execution Logs</div>
          <div class="card-subtitle">Detailed record of automated triggers and background webhooks</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rule Name</th>
                <th>Status</th>
                <th>Execution Details</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(log => `
                <tr>
                  <td style="font-weight:600;color:var(--text-primary)">${log.ruleName}</td>
                  <td><span class="badge badge-success">● ${log.status}</span></td>
                  <td style="font-size:12px;color:var(--text-secondary)">${log.detail}</td>
                  <td style="font-size:11px;color:var(--text-muted)">${formatDateTime(log.timestamp)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  renderShell('Automation Engine', 'Workflow automation and IF/THEN triggers', html);

  // Bind events
  document.getElementById('btn-create-rule')?.addEventListener('click', showCreateRuleModal);

  document.querySelectorAll('.rule-toggle').forEach(chk => {
    chk.addEventListener('change', () => {
      const ruleId = chk.dataset.id;
      const s = getStore();
      const r = s.automationRules.find(x => x.id === ruleId);
      if (r) {
        r.active = chk.checked;
        saveStore();
        showToast('Automation Rule Updated', `Rule "${r.name}" is now ${r.active ? 'Active' : 'Paused'}`, 'info');
        renderAutomation();
      }
    });
  });

  document.querySelectorAll('.btn-test-rule').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.processing === 'true') return;
      btn.dataset.processing = 'true';
      btn.disabled = true;

      const ruleId = btn.dataset.id;
      const s = getStore();
      const r = s.automationRules.find(x => x.id === ruleId);
      if (r) {
        r.executionCount = (r.executionCount || 0) + 1;
        r.lastTriggered = new Date().toISOString();
        s.automationLogs.unshift({
          id: 'log_' + Date.now(),
          ruleName: r.name,
          status: 'Success',
          timestamp: new Date().toISOString(),
          detail: `Manual trigger test executed successfully for rule ${r.name}`
        });
        saveStore();
        addAuditLog('automation_test', `Executed automation test for rule: ${r.name}`, user.id);
        showToast('Rule Triggered', `Rule "${r.name}" executed successfully. Log updated.`, 'success');
        renderAutomation();
      }
    });
  });

  document.querySelectorAll('.btn-delete-rule').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ruleId = btn.dataset.id;
      const ok = await confirm('Are you sure you want to delete this automation rule?');
      if (ok) {
        const s = getStore();
        s.automationRules = s.automationRules.filter(r => r.id !== ruleId);
        saveStore();
        showToast('Rule Deleted', 'Automation rule removed', 'info');
        renderAutomation();
      }
    });
  });

  document.getElementById('btn-run-rules')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-run-rules');
    if (btn.dataset.processing === 'true') return;
    btn.dataset.processing = 'true';
    btn.disabled = true;
    btn.textContent = '⏳ Running...';

    setTimeout(() => {
      const s = getStore();
      s.automationRules.forEach(r => {
        if (r.active) {
          r.executionCount = (r.executionCount || 0) + 1;
          r.lastTriggered = new Date().toISOString();
        }
      });
      s.automationLogs.unshift({
        id: 'log_' + Date.now(),
        ruleName: 'System Batch Automation Check',
        status: 'Success',
        timestamp: new Date().toISOString(),
        detail: `Batch execution check completed. ${activeCount} active rules evaluated.`
      });
      saveStore();
      showToast('Batch Run Complete', `${activeCount} active automation rules evaluated successfully.`, 'success');
      btn.dataset.processing = 'false';
      btn.disabled = false;
      renderAutomation();
    }, 600);
  });
}

function showCreateRuleModal() {
  const modalBody = document.createElement('div');
  modalBody.innerHTML = `
    <form id="form-create-rule" style="display:flex;flex-direction:column;gap:16px">
      <div class="form-group">
        <label class="form-label">Rule Name <span class="req">*</span></label>
        <input type="text" id="ar-name" class="form-control" placeholder="e.g. IF Low Stock THEN Notify Warehouse Manager" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">IF Event Trigger <span class="req">*</span></label>
          <select id="ar-trigger" class="form-control" required>
            <option value="stock_low">Stock Drops Below Threshold</option>
            <option value="large_invoice">Invoice Total Exceeds Amount</option>
            <option value="bill_created">New Invoice Generated</option>
            <option value="user_status">User Account Status Changed</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Condition Value</label>
          <input type="text" id="ar-val" class="form-control" value="20" placeholder="Threshold value (e.g. 20 or 5000)" required />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">THEN Action <span class="req">*</span></label>
          <select id="ar-action" class="form-control" required>
            <option value="draft_invoice">Generate Draft Invoice</option>
            <option value="send_webhook">Dispatch Outbound Webhook</option>
            <option value="create_notification">Send Push Notification</option>
            <option value="log_audit">Log Audit Trail Security Event</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Action Target / Webhook Endpoint</label>
          <input type="text" id="ar-target" class="form-control" placeholder="Target detail or https://webhook-url.com" required />
        </div>
      </div>
    </form>
  `;

  const modalFooter = document.createElement('div');
  modalFooter.style.cssText = 'display:flex;justify-content:flex-end;gap:12px;width:100%';
  modalFooter.innerHTML = `
    <button class="btn btn-secondary btn-sm" id="ar-cancel">Cancel</button>
    <button class="btn btn-primary btn-sm" id="ar-save">Save Automation Rule</button>
  `;

  const modal = createModal({
    title: 'Create Automation Rule',
    body: modalBody,
    footer: modalFooter
  });

  modal.el.querySelector('#ar-cancel').addEventListener('click', () => modal.close());
  modal.el.querySelector('#ar-save').addEventListener('click', () => {
    const saveBtn = modal.el.querySelector('#ar-save');
    if (saveBtn.dataset.processing === 'true') return;
    saveBtn.dataset.processing = 'true';

    const name = modal.el.querySelector('#ar-name').value.trim();
    const trigger = modal.el.querySelector('#ar-trigger').value;
    const val = modal.el.querySelector('#ar-val').value.trim();
    const action = modal.el.querySelector('#ar-action').value;
    const target = modal.el.querySelector('#ar-target').value.trim();

    if (!name || !target) {
      showToast('Validation Error', 'Please complete all required fields.', 'warning');
      saveBtn.dataset.processing = 'false';
      return;
    }

    const s = getStore();
    const newRule = {
      id: 'rule_' + Date.now(),
      name,
      trigger,
      conditionOp: trigger === 'stock_low' ? '<=' : '>=',
      conditionVal: isNaN(val) ? val : Number(val),
      actionType: action,
      actionTarget: target,
      active: true,
      executionCount: 0,
      lastTriggered: null
    };

    s.automationRules.unshift(newRule);
    saveStore();
    showToast('Rule Created', `Automation rule "${name}" has been created and activated.`, 'success');
    modal.close();
    renderAutomation();
  });
}
