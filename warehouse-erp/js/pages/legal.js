/**
 * Legal/Compliance Pages — Privacy Policy & Terms of Service
 */

export function renderPrivacy() {
  const appEl = document.getElementById('app');
  if (!appEl) return;
  
  appEl.innerHTML = `
    <div class="auth-page animate-fadeIn">
      <div class="auth-bg"></div>
      <div class="auth-bg-grid"></div>
      <div class="auth-card" style="max-width:720px;padding:var(--space-8) var(--space-10)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:16px;flex-wrap:wrap;gap:12px">
          <div class="auth-logo" style="cursor:pointer;margin-bottom:0" onclick="window.location.hash='#/'">
            <div class="auth-logo-icon" style="width:36px;height:36px;font-size:16px">⚡</div>
            <span class="auth-logo-name" style="font-size:20px">WareOps</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/signup'" style="font-size:12px;padding:6px 12px;cursor:pointer">← Back to Signup</button>
        </div>
        
        <h1 class="auth-title" style="font-size:24px;margin-bottom:8px">Privacy Policy</h1>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:24px">Last Updated: May 29, 2026</p>
        
        <div style="color:var(--text-secondary);font-size:14px;line-height:1.6;max-height:480px;overflow-y:auto;padding-right:12px;scrollbar-width:thin">
          <p style="margin-bottom:16px">At <strong>WareOps ERP</strong>, we take your privacy and the security of your operational data extremely seriously. This Privacy Policy describes how we collect, use, and safeguard information when you use our multi-warehouse enterprise resource planning SaaS platform.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">1. Information Collection</h3>
          <p style="margin-bottom:12px">We collect operational and personal information necessary to deliver enterprise services, including:</p>
          <ul style="margin-bottom:16px;padding-left:20px">
            <li style="margin-bottom:6px"><strong>Account Data:</strong> Usernames, business emails, securely hashed credentials, and billing contacts.</li>
            <li style="margin-bottom:6px"><strong>Warehouse Operations Data:</strong> Workforce registries, inventory metrics, table schemas, and regional tax specifications.</li>
            <li style="margin-bottom:6px"><strong>System Activity Logs:</strong> Automated audit records capturing system operations (e.g. logouts, item creations) for security audits.</li>
          </ul>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">2. Processing of Data</h3>
          <p style="margin-bottom:16px">Your data is processed strictly to maintain multi-tenant enterprise isolation, support live synchronization between warehouses, generate audit trails, and calculate historical tax snaps. We do not sell, trade, or monetize your business operations data.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">3. Multi-Tenant Enterprise Security</h3>
          <p style="margin-bottom:16px">We implement strict multi-tenant boundary configurations using isolated database schemas, authorization guards, and JWT-based session security to prevent unauthorized access and data leaks between business entities.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">4. Retention Policy</h3>
          <p style="margin-bottom:16px">We retain operational files, billing records, and audit logs as long as your corporate subscription remains active. Upon subscription closure or workspace deletion, all records are permanently purged from active dynamic databases within 30 days.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">5. Updates and Compliance</h3>
          <p style="margin-bottom:16px">We may update this policy periodically to reflect changes in global compliance and enterprise security parameters. The updated date at the top will indicate when revisions took effect.</p>
        </div>
      </div>
    </div>
  `;
}

export function renderTerms() {
  const appEl = document.getElementById('app');
  if (!appEl) return;
  
  appEl.innerHTML = `
    <div class="auth-page animate-fadeIn">
      <div class="auth-bg"></div>
      <div class="auth-bg-grid"></div>
      <div class="auth-card" style="max-width:720px;padding:var(--space-8) var(--space-10)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:16px;flex-wrap:wrap;gap:12px">
          <div class="auth-logo" style="cursor:pointer;margin-bottom:0" onclick="window.location.hash='#/'">
            <div class="auth-logo-icon" style="width:36px;height:36px;font-size:16px">⚡</div>
            <span class="auth-logo-name" style="font-size:20px">WareOps</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/signup'" style="font-size:12px;padding:6px 12px;cursor:pointer">← Back to Signup</button>
        </div>
        
        <h1 class="auth-title" style="font-size:24px;margin-bottom:8px">Terms & Conditions</h1>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:24px">Effective Date: May 29, 2026</p>
        
        <div style="color:var(--text-secondary);font-size:14px;line-height:1.6;max-height:480px;overflow-y:auto;padding-right:12px;scrollbar-width:thin">
          <p style="margin-bottom:16px">Welcome to <strong>WareOps ERP</strong>. By registering an account, establishing a corporate workspace, or utilising our multi-warehouse enterprise resource planning system, you agree to comply with and be bound by the following Terms and Conditions.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">1. SaaS Subscription and License</h3>
          <p style="margin-bottom:16px">We grant you a non-exclusive, non-transferable, revocable license to access and use the WareOps ERP platform in accordance with your subscribed plan (Starter or Enterprise). Standard multi-warehouse configurations, role assignments (RBAC), and table operations are governed by this plan limit.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">2. Account Responsibility & Security</h3>
          <p style="margin-bottom:16px">You are fully responsible for maintaining the confidentiality of your credentials, authorization tokens, and all activities conducted under your workspace registry. You agree to notify us immediately of any unauthorized usage or breaches of tenant boundary security.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">3. Permitted Operational Use</h3>
          <p style="margin-bottom:16px">The platform must be used solely for lawful inventory coordination, billing management, workforce organization, and audit analysis. You must not attempt to bypass security layers, perform denial-of-service activities, or inject malicious payloads into shared enterprise schemas.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">4. Service Availability & SLA</h3>
          <p style="margin-bottom:16px">We aim to maintain 99.9% uptime for active production databases and dynamic synchronization layers. Scheduled system maintenance and security patches will be conducted during off-peak hours with advance notification to warehouse administrators.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">5. Limitation of Liability</h3>
          <p style="margin-bottom:16px">WareOps ERP is provided on an "as is" and "as available" basis. To the maximum extent permitted by applicable law, we shall not be liable for any indirect, incidental, or consequential damages resulting from operational downtime or database synchronization interruptions.</p>
        </div>
      </div>
    </div>
  `;
}
