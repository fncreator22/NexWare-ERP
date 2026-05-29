/**
 * Subscription Management Page
 */
import { getCurrentUser, getSubscription, getWarehouses } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { navigate } from '../modules/router.js';
import { formatDate, showToast } from '../modules/ui.js';

export function renderSubscription() {
  const user = getCurrentUser();
  if (!user || user.role !== 'super_admin') { navigate('/dashboard'); return; }

  const sub = getSubscription();
  const whs = getWarehouses();
  const isEnterprise = sub.plan === 'enterprise';
  const isStarter = sub.plan === 'starter';
  const warehouseLimit = isStarter ? 1 : '∞';
  const warehousesUsed = whs.length;

  const expiry = sub.expiryDate ? formatDate(sub.expiryDate) : 'No expiry (Demo)';
  const startDate = formatDate(sub.startDate);

  renderShell('Subscription', 'Manage your SaaS plan and billing', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">💳 Subscription Management</h1>
          <p class="page-subtitle">Your current plan, limits, and upgrade options</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <!-- Current Plan Card -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
        <div style="background:${isEnterprise ? 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(168,85,247,0.15))' : 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.15))'};border:1px solid ${isEnterprise ? 'rgba(99,102,241,0.4)' : 'rgba(16,185,129,0.4)'};border-radius:16px;padding:28px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div style="font-size:36px">${isEnterprise ? '🟣' : '🟢'}</div>
            <div>
              <div style="font-size:22px;font-weight:900;color:var(--text-primary)">${isEnterprise ? 'Enterprise' : 'Starter'} Plan</div>
              <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Current Active Plan</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
            <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:12px">
              <div style="color:var(--text-muted);margin-bottom:4px;font-size:11px;text-transform:uppercase">Status</div>
              <div style="font-weight:700;color:var(--accent-emerald)">● Active</div>
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:12px">
              <div style="color:var(--text-muted);margin-bottom:4px;font-size:11px;text-transform:uppercase">Plan Start</div>
              <div style="font-weight:700">${startDate}</div>
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:12px">
              <div style="color:var(--text-muted);margin-bottom:4px;font-size:11px;text-transform:uppercase">Warehouses</div>
              <div style="font-weight:700">${warehousesUsed} / ${warehouseLimit}</div>
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:12px">
              <div style="color:var(--text-muted);margin-bottom:4px;font-size:11px;text-transform:uppercase">Expiry</div>
              <div style="font-weight:700">${expiry}</div>
            </div>
          </div>
        </div>

        <!-- Quick Stats -->
        <div style="display:flex;flex-direction:column;gap:12px">
          ${[
            { icon:'🏭', label:'Warehouses Active', val: warehousesUsed, color:'var(--accent-violet)' },
            { icon:'📦', label:'Warehouse Limit', val: warehouseLimit, color:'var(--accent-emerald)' },
            { icon:'👑', label:'Account Type', val: 'Super Admin', color:'var(--accent-amber)' },
          ].map(s=>`
            <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:12px;padding:16px;display:flex;align-items:center;gap:12px;flex:1">
              <div style="font-size:24px">${s.icon}</div>
              <div>
                <div style="font-size:18px;font-weight:800;color:${s.color}">${s.val}</div>
                <div style="font-size:12px;color:var(--text-muted)">${s.label}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Plan Features -->
      <div style="margin-bottom:32px">
        <h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:16px">Plan Features</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          ${[
            { icon:'🏭', feat:'Multi-Warehouse Support', starter: isStarter ? '1 Warehouse' : '✓', enterprise: '✓ Unlimited' },
            { icon:'👥', feat:'Workforce Management', starter:'✓', enterprise:'✓ + Cross-Warehouse' },
            { icon:'💰', feat:'Billing & Invoicing', starter:'✓', enterprise:'✓' },
            { icon:'📊', feat:'Analytics & Reports', starter:'Basic', enterprise:'✓ Global' },
            { icon:'📋', feat:'Dynamic Table Builder', starter:'Limited', enterprise:'✓ Unlimited' },
            { icon:'🔍', feat:'Audit Logs', starter:'30 days', enterprise:'✓ Full History' },
          ].map(f=>`
            <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px">
              <span style="font-size:20px">${f.icon}</span>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${f.feat}</div>
                <div style="font-size:12px;color:var(--text-muted)">Starter: ${f.starter}</div>
              </div>
              <div style="font-size:13px;font-weight:700;color:var(--accent-emerald)">${f.enterprise}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Upgrade Banner (if starter) -->
      ${isStarter ? `
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:16px;padding:28px;text-align:center;color:white">
        <div style="font-size:28px;margin-bottom:8px">🚀</div>
        <h3 style="font-size:20px;font-weight:800;margin-bottom:8px">Upgrade to Enterprise</h3>
        <p style="font-size:14px;opacity:0.85;margin-bottom:20px">Unlock unlimited warehouses, global analytics, and full ERP capabilities</p>
        <button class="btn" style="background:white;color:#6366f1;font-weight:700;padding:10px 28px;border-radius:8px" id="upgrade-btn">Contact Sales to Upgrade</button>
      </div>` : `
      <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:24px;margin-bottom:8px">✅</div>
        <div style="font-size:15px;font-weight:700;color:var(--accent-emerald)">You're on the Enterprise Plan</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:4px">All features are unlocked. No restrictions apply.</div>
      </div>`}

      <div style="margin-top:16px;padding:16px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px;font-size:12px;color:var(--text-muted);text-align:center">
        ⚠️ <strong>Demo Mode:</strong> No real payment gateway active. All subscription features are for demonstration purposes only.
      </div>
    </div>
  `);

  document.getElementById('upgrade-btn')?.addEventListener('click', () => {
    showToast('Enterprise Plan', 'Contact sales@wareops.io to upgrade your plan.', 'info');
  });
}
