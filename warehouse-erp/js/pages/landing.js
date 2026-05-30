/**
 * Premium Landing Page — Unified SPA Component
 */
import { getSvgIcon } from '../modules/ui.js';

export function renderLanding() {
  const appEl = document.getElementById('app');
  if (!appEl) return;

  appEl.innerHTML = `
    <!-- ═══════════ NAV ═══════════════════════════════════════ -->
    <nav id="lp-nav">
      <div class="lp-container lp-nav-inner">
        <a href="#/" class="lp-logo">
          <div class="lp-logo-icon">⚡</div>
          <span>Nex<em>Ware</em></span>
        </a>
        <div class="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#interactive-demo">Live Demo</a>
          <a href="#workflow">How It Works</a>
          <a href="#pricing">Pricing</a>
          <a href="#/login" class="lp-btn lp-btn-ghost" style="padding:7px 16px;font-size:13px;border-radius:8px">Log In</a>
          <a href="#/signup" class="lp-btn lp-btn-primary" style="padding:7px 16px;font-size:13px;border-radius:8px">Get Started →</a>
        </div>
        <button class="lp-mob-btn" id="mobBtn">☰</button>
      </div>
    </nav>
    <div class="lp-mob-menu" id="mobMenu">
      <a href="#features">Features</a>
      <a href="#interactive-demo">Live Demo</a>
      <a href="#workflow">How It Works</a>
      <a href="#pricing">Pricing</a>
      <div class="sep"></div>
      <a href="#/login" style="color:var(--text-primary);font-weight:600">Log In</a>
      <a href="#/signup" class="lp-btn lp-btn-primary" style="margin-top:4px;justify-content:center">Get Started Free →</a>
    </div>

    <!-- ═══════════ HERO ══════════════════════════════════════ -->
    <section class="hero">
      <div class="hero-orb orb1"></div>
      <div class="hero-orb orb2"></div>
      <div class="hero-orb orb3"></div>
      <div class="lp-container">
        <div class="hero-pill">
          <span class="dot"></span>
          Enterprise ERP Platform &nbsp;·&nbsp; v2.0 · Fully Interactive Demo Below
        </div>
        <h1>The Modern ERP for<br>Enterprise Logistics</h1>
        <p class="hero-sub">
          Unify your entire warehouse operation — multi-location inventory, automated billing,
          workforce access control, and compliance audit logs — in one beautiful real-time platform.
        </p>
        <div class="hero-actions">
          <a href="#/signup" class="lp-btn lp-btn-primary lp-btn-lg">🚀 Start Free Trial</a>
          <a href="#interactive-demo" class="lp-btn lp-btn-ghost lp-btn-lg">🖥 Try Live Demo ↓</a>
        </div>
        <div class="hero-stats">
          <div class="hs"><div class="hs-val"><span>∞</span></div><div class="hs-lbl">Warehouses</div></div>
          <div class="hs"><div class="hs-val"><span>100%</span></div><div class="hs-lbl">Real-time sync</div></div>
          <div class="hs"><div class="hs-val"><span>5</span>-tier</div><div class="hs-lbl">RBAC system</div></div>
          <div class="hs"><div class="hs-val">10/10</div><div class="hs-lbl">E2E test pass</div></div>
        </div>
        <!-- Hero browser preview -->
        <div class="browser-wrap">
          <div class="browser-glow"></div>
          <div class="browser-frame">
            <div class="browser-bar">
              <div class="browser-dots"><span></span><span></span><span></span></div>
              <div class="browser-url">app.nexware.io/dashboard</div>
            </div>
            <div class="browser-fade">
              <img src="assets/dashboard-preview.png" class="browser-img" alt="NexWare ERP Dashboard" loading="eager">
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ TRUST BAR ═════════════════════════════════ -->
    <div class="trust-bar reveal">
      <div class="lp-container trust-inner">
        <span class="trust-lbl">Trusted by teams at</span>
        <div class="trust-divider"></div>
        <div class="trust-logos">
          <span class="trust-logo">DallasFlex</span>
          <span class="trust-logo">NorthTex Logistics</span>
          <span class="trust-logo">Apex Manufacturing</span>
          <span class="trust-logo">GlobalParts Co.</span>
          <span class="trust-logo">IronWorks Ltd.</span>
          <span class="trust-logo">SwiftDepot</span>
        </div>
      </div>
    </div>

    <!-- ═══════════ METRICS ═══════════════════════════════════ -->
    <section class="lp-section" style="padding-bottom:40px">
      <div class="lp-container">
        <div class="metrics-grid reveal">
          <div class="m-cell"><div class="m-val brand">10/10</div><div class="m-lbl">E2E Test Coverage</div><div class="m-sub">All workflows verified</div></div>
          <div class="m-cell"><div class="m-val em">&lt;15ms</div><div class="m-lbl">API Response Latency</div><div class="m-sub">p50 read latency</div></div>
          <div class="m-cell"><div class="m-val cy">&lt;500ms</div><div class="m-lbl">Full Onboarding Flow</div><div class="m-sub">Signup → first invoice</div></div>
          <div class="m-cell"><div class="m-val vi">5-tier</div><div class="m-lbl">Role-Based Access</div><div class="m-sub">Super Admin → Employee</div></div>
        </div>
      </div>
    </section>

    <!-- ═══════════ FEATURES ══════════════════════════════════ -->
    <section id="features" class="lp-section">
      <div class="lp-container">
        <div class="text-center reveal">
          <div class="lp-label">⚡ Platform Capabilities</div>
          <h2 class="lp-h2">Everything your operations<br><span>need to scale</span></h2>
          <p class="lp-sub">A complete, modular suite engineered for modern warehouse operations at any scale.</p>
        </div>
        <div class="feat-grid">
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(99,102,241,.15)">🏭</div>
            <h3 class="feat-title">Multi-Warehouse Management</h3>
            <p class="feat-desc">Register unlimited locations. Each warehouse has its own inventory, staff, billing history, and analytics — all linked to a single super admin tenant.</p>
            <span class="feat-tag" style="background:rgba(99,102,241,.15);color:var(--brand-light)">Enterprise</span>
          </div>
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(16,185,129,.15)">👥</div>
            <h3 class="feat-title">5-Tier Workforce RBAC</h3>
            <p class="feat-desc">Super Admin, Admin, Manager, Staff, and Employee tiers. Permissions cascade hierarchically — users only see data at or below their access level.</p>
            <span class="feat-tag" style="background:rgba(16,185,129,.15);color:var(--emerald)">Security</span>
          </div>
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(245,158,11,.15)">🧾</div>
            <h3 class="feat-title">Automated Invoice Billing</h3>
            <p class="feat-desc">Generate professional invoices instantly. Supports configurable luxury and standard tax rates with automatic atomic stock decrement on every sale.</p>
            <span class="feat-tag" style="background:rgba(245,158,11,.15);color:var(--amber)">Finance</span>
          </div>
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(6,182,212,.15)">📦</div>
            <h3 class="feat-title">Real-Time Inventory Tracking</h3>
            <p class="feat-desc">Monitor stock levels across all locations. Get low-stock alerts, manage SKU uniqueness per warehouse, and bulk import via CSV.</p>
            <span class="feat-tag" style="background:rgba(6,182,212,.15);color:var(--cyan)">Operations</span>
          </div>
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(168,85,247,.15)">📋</div>
            <h3 class="feat-title">Dynamic Custom Tables</h3>
            <p class="feat-desc">Build custom data schemas — text, number, dropdown, date. Create maintenance logs, shipment trackers, or any operational table your team needs.</p>
            <span class="feat-tag" style="background:rgba(168,85,247,.15);color:var(--violet)">Customizable</span>
          </div>
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(244,63,94,.15)">🔒</div>
            <h3 class="feat-title">Compliance Audit Logs</h3>
            <p class="feat-desc">Every critical action is automatically logged with user identity, timestamp, and tenant scoping. Built-in role-aware visibility controls.</p>
            <span class="feat-tag" style="background:rgba(244,63,94,.15);color:var(--rose)">Compliance</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ INTERACTIVE DEMO ═════════════════════════ -->
    <section id="interactive-demo" class="showcase-section" style="background:rgba(0,0,0,.15)">
      <div class="lp-container">
        <div class="showcase-section-header reveal">
          <div class="demo-pill"><span class="dot"></span>Interactive Demo — No sign-in required</div>
          <h2 class="lp-h2">Experience NexWare ERP<br><span>right here, right now</span></h2>
          <p class="lp-sub" style="margin:0 auto">Click any sidebar item or tab below to explore the full ERP interface with realistic demo data. Everything is interactive — nothing is saved.</p>
        </div>

        <!-- Tab switcher above demo -->
        <div class="showcase-tabs reveal">
          <button class="showcase-tab active" data-page="dashboard"><span class="tab-icon">📊</span> Dashboard</button>
          <button class="showcase-tab" data-page="inventory"><span class="tab-icon">📦</span> Inventory</button>
          <button class="showcase-tab" data-page="billing"><span class="tab-icon">🧾</span> Billing</button>
          <button class="showcase-tab" data-page="workforce"><span class="tab-icon">👥</span> Workforce</button>
          <button class="showcase-tab" data-page="tables"><span class="tab-icon">📋</span> Tables</button>
          <button class="showcase-tab" data-page="audit"><span class="tab-icon">🔍</span> Audit Logs</button>
          <button class="showcase-tab" data-page="analytics"><span class="tab-icon">📈</span> Analytics</button>
          <button class="showcase-tab" data-page="settings"><span class="tab-icon">⚙️</span> Settings</button>
        </div>

        <!-- ERP Device Frame -->
        <div class="erp-device reveal">
          <div class="erp-device-glow"></div>
          <div class="erp-frame">

            <!-- Demo Top Bar -->
            <div class="demo-topbar">
              <div class="demo-topbar-dots"><span></span><span></span><span></span></div>
              <div class="demo-topbar-url" id="demo-url">app.nexware.io/dashboard</div>
              <div class="demo-topbar-user">
                <div class="demo-avatar">AM</div>
                <span>Alex Mercer&nbsp;&nbsp;<span style="color:var(--text-muted);font-size:10px">Super Admin</span></span>
                <div style="position:relative;margin-left:6px;cursor:pointer">🔔<span class="notif-badge">3</span></div>
              </div>
            </div>

            <!-- App Shell -->
            <div class="demo-shell">

              <!-- ─── DEMO SIDEBAR ──────────────────────── -->
              <nav class="demo-sidebar">
                <div class="demo-logo">
                  <div class="demo-logo-icon">⚡</div>
                  <div class="demo-logo-name">NexWare</div>
                </div>
                <div class="demo-nav">
                  <div class="demo-section-label">Overview</div>
                  <div class="demo-item active" data-target="dashboard">
                    <span class="demo-item-icon">📊</span><span>Dashboard</span>
                  </div>
                  <div class="demo-section-label">Operations</div>
                  <div class="demo-item" data-target="inventory">
                    <span class="demo-item-icon">📦</span><span>Inventory</span>
                  </div>
                  <div class="demo-item" data-target="workforce">
                    <span class="demo-item-icon">👥</span><span>Workforce</span>
                  </div>
                  <div class="demo-item" data-target="tables">
                    <span class="demo-item-icon">📋</span><span>Tables</span>
                  </div>
                  <div class="demo-section-label">Finance</div>
                  <div class="demo-item" data-target="billing">
                    <span class="demo-item-icon">🧾</span><span>Billing</span>
                  </div>
                  <div class="demo-item" data-target="analytics">
                    <span class="demo-item-icon">📈</span><span>Analytics</span>
                  </div>
                  <div class="demo-section-label">System</div>
                  <div class="demo-item" data-target="audit">
                    <span class="demo-item-icon">🔍</span><span>Audit Logs</span>
                  </div>
                  <div class="demo-item" data-target="settings">
                    <span class="demo-item-icon">⚙️</span><span>Settings</span>
                  </div>
                </div>
                <div class="demo-sidebar-footer">
                  <div class="demo-user-row">
                    <div class="demo-user-av">AM</div>
                    <div>
                      <div class="demo-user-name">Alex Mercer</div>
                      <div class="demo-user-role">Super Admin</div>
                    </div>
                  </div>
                </div>
              </nav>

              <!-- ─── DEMO CONTENT ──────────────────────── -->
              <div class="demo-content">

                <!-- ── PAGE: DASHBOARD ──────────────────── -->
                <div class="demo-page active" id="page-dashboard">
                  <div class="d-page-header">
                    <div>
                      <div class="d-page-title">📊 Dashboard</div>
                      <div class="d-page-sub">Global Overview · 4 Warehouses Active</div>
                    </div>
                    <div style="display:flex;gap:8px">
                      <button class="d-btn d-btn-secondary">Export</button>
                      <button class="d-btn d-btn-primary">Warehouses</button>
                    </div>
                  </div>
                  <!-- KPI row -->
                  <div class="d-stat-grid">
                    <div class="d-stat-card">
                      <div class="d-stat-icon" style="background:rgba(99,102,241,.15)">🏭</div>
                      <div class="d-stat-val" style="color:var(--brand-light)">4</div>
                      <div class="d-stat-lbl">Warehouses</div>
                      <div class="d-stat-trend trend-up">Enterprise plan</div>
                    </div>
                    <div class="d-stat-card">
                      <div class="d-stat-icon" style="background:rgba(16,185,129,.15)">💰</div>
                      <div class="d-stat-val" style="color:var(--emerald)">$124.7k</div>
                      <div class="d-stat-lbl">Total Revenue</div>
                      <div class="d-stat-trend trend-up">↑ Tax: $8,920</div>
                    </div>
                    <div class="d-stat-card">
                      <div class="d-stat-icon" style="background:rgba(139,92,246,.15)">🧾</div>
                      <div class="d-stat-val" style="color:var(--violet)">38</div>
                      <div class="d-stat-lbl">Invoices</div>
                      <div class="d-stat-trend trend-up">↑ This period</div>
                    </div>
                    <div class="d-stat-card">
                      <div class="d-stat-icon" style="background:rgba(245,158,11,.15)">📦</div>
                      <div class="d-stat-val" style="color:var(--amber)">4,280</div>
                      <div class="d-stat-lbl">Stock Units</div>
                      <div class="d-stat-trend trend-dn">3 low stock</div>
                    </div>
                  </div>
                  <!-- Charts row -->
                  <div class="d-grid2">
                    <div class="d-card">
                      <div class="d-card-hd">
                        <div><div class="d-card-title">📈 Revenue Trend</div><div class="d-card-sub">Last 6 months</div></div>
                        <div style="display:flex;gap:5px">
                          <button class="d-btn d-btn-secondary d-btn-sm">6M</button>
                          <button class="d-btn d-btn-secondary d-btn-sm">1Y</button>
                        </div>
                      </div>
                      <div class="d-chart-wrap"><canvas id="demo-rev-chart"></canvas></div>
                    </div>
                    <div class="d-card">
                      <div class="d-card-hd">
                        <div class="d-card-title">⚡ Live Activity</div>
                        <button class="d-btn d-btn-secondary d-btn-sm">All →</button>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:0">
                        <div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span class="act-dot act-green" style="margin-top:4px"></span>
                          <div><div style="font-size:11px;color:var(--text-secondary)">Inventory item created — Steel Pipes</div><div style="font-size:10px;color:var(--text-muted)">Alex Mercer · 2 min ago</div></div>
                        </div>
                        <div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span class="act-dot act-blue" style="margin-top:4px"></span>
                          <div><div style="font-size:11px;color:var(--text-secondary)">Invoice INV-0038 generated — $955.50</div><div style="font-size:10px;color:var(--text-muted)">Sarah Connor · 8 min ago</div></div>
                        </div>
                        <div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span class="act-dot act-amber" style="margin-top:4px"></span>
                          <div><div style="font-size:11px;color:var(--text-secondary)">Warehouse Dallas Depot updated</div><div style="font-size:10px;color:var(--text-muted)">Alex Mercer · 22 min ago</div></div>
                        </div>
                        <div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span class="act-dot act-green" style="margin-top:4px"></span>
                          <div><div style="font-size:11px;color:var(--text-secondary)">Staff member Kim Park added</div><div style="font-size:10px;color:var(--text-muted)">Sarah Connor · 45 min ago</div></div>
                        </div>
                        <div style="display:flex;gap:8px;padding:7px 0">
                          <span class="act-dot act-cyan" style="margin-top:4px"></span>
                          <div><div style="font-size:11px;color:var(--text-secondary)">User logged in — Marcus Kim</div><div style="font-size:10px;color:var(--text-muted)">System · 1 hr ago</div></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- Warehouse + Stock row -->
                  <div class="d-grid2">
                    <div class="d-card">
                      <div class="d-card-hd">
                        <div class="d-card-title">🏭 Warehouses</div>
                        <button class="d-btn d-btn-primary d-btn-sm">Manage</button>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:8px">
                        <div style="display:flex;align-items:center;gap:10px;padding:7px;background:var(--bg-input);border-radius:8px;cursor:pointer">
                          <span style="font-size:18px">🏭</span>
                          <div style="flex:1"><div style="font-size:12px;font-weight:600">Dallas Logistics Depot</div><div style="font-size:10px;color:var(--text-muted)">5 staff · $42,300 revenue</div></div>
                          <span class="d-badge success">●</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;padding:7px;background:var(--bg-input);border-radius:8px;cursor:pointer">
                          <span style="font-size:18px">🏬</span>
                          <div style="flex:1"><div style="font-size:12px;font-weight:600">Houston HQ Distribution</div><div style="font-size:10px;color:var(--text-muted)">8 staff · $58,900 revenue</div></div>
                          <span class="d-badge success">●</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;padding:7px;background:var(--bg-input);border-radius:8px;cursor:pointer">
                          <span style="font-size:18px">🏗️</span>
                          <div style="flex:1"><div style="font-size:12px;font-weight:600">Austin Depot North</div><div style="font-size:10px;color:var(--text-muted)">3 staff · $23,550 revenue</div></div>
                          <span class="d-badge success">●</span>
                        </div>
                      </div>
                    </div>
                    <div class="d-card">
                      <div class="d-card-hd">
                        <div class="d-card-title">⚠️ Low Stock Alerts</div>
                        <button class="d-btn d-btn-secondary d-btn-sm">View →</button>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:0">
                        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span style="font-size:12px;color:var(--text-secondary)">Industrial Tape Roll</span>
                          <span style="font-size:11px;font-weight:700;color:var(--rose)">4 left</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span style="font-size:12px;color:var(--text-secondary)">Safety Helmets M</span>
                          <span style="font-size:11px;font-weight:700;color:var(--rose)">7 left</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span style="font-size:12px;color:var(--text-secondary)">Forklift Chains</span>
                          <span style="font-size:11px;font-weight:700;color:var(--amber)">14 left</span>
                        </div>
                      </div>
                      <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
                        <button class="d-btn d-btn-secondary d-btn-sm" style="justify-content:flex-start;gap:5px">📦 Add Item</button>
                        <button class="d-btn d-btn-secondary d-btn-sm" style="justify-content:flex-start;gap:5px">🧾 New Bill</button>
                        <button class="d-btn d-btn-secondary d-btn-sm" style="justify-content:flex-start;gap:5px">👥 Workforce</button>
                        <button class="d-btn d-btn-secondary d-btn-sm" style="justify-content:flex-start;gap:5px">📈 Reports</button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ── PAGE: INVENTORY ──────────────────── -->
                <div class="demo-page" id="page-inventory">
                  <div class="d-page-header">
                    <div><div class="d-page-title">📦 Inventory Management</div><div class="d-page-sub">Track items, stock levels, and pricing across all warehouses</div></div>
                    <div style="display:flex;gap:8px">
                      <button class="d-btn d-btn-secondary">Import CSV</button>
                      <button class="d-btn d-btn-primary">+ Add Item</button>
                    </div>
                  </div>
                  <div class="d-stat-grid">
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(99,102,241,.15)">📦</div><div class="d-stat-val" style="color:var(--brand-light)">247</div><div class="d-stat-lbl">Total Items</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(16,185,129,.15)">📊</div><div class="d-stat-val" style="color:var(--emerald)">18,420</div><div class="d-stat-lbl">Total Stock</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(6,182,212,.15)">💎</div><div class="d-stat-val" style="color:var(--cyan)">$94.3k</div><div class="d-stat-lbl">Inventory Value</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(244,63,94,.15)">⚠️</div><div class="d-stat-val" style="color:var(--rose)">8</div><div class="d-stat-lbl">Low Stock</div></div>
                  </div>
                  <div class="d-card">
                    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
                      <div class="d-search" style="max-width:200px"><span>🔍</span><input placeholder="Search items..." value="Steel"></div>
                      <select class="d-input" style="width:auto;padding:6px 10px;font-size:12px"><option>All Categories</option><option>Tools</option><option>Electronics</option><option>Furniture</option></select>
                      <select class="d-input" style="width:auto;padding:6px 10px;font-size:12px"><option>All Warehouses</option><option>Dallas Depot</option><option>Houston HQ</option></select>
                    </div>
                    <div style="overflow-x:auto">
                      <table class="d-table">
                        <thead><tr><th>Item</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th>Tax</th><th>Warehouse</th><th>Actions</th></tr></thead>
                        <tbody>
                          <tr><td><div style="font-weight:600;font-size:12px">Industrial Steel Pipes</div><div style="font-size:10px;color:var(--text-muted)">Added May 28, 2026</div></td><td><code style="font-size:10px;color:var(--text-muted)">SKU-PIPE-001</code></td><td><span class="d-badge brand">Tools</span></td><td><strong>$45.50</strong></td><td><span class="d-badge success">80 pcs</span></td><td><span class="d-badge muted">Normal 5%</span></td><td><span class="d-badge cyan">Dallas</span></td><td style="white-space:nowrap"><button class="d-btn d-btn-secondary d-btn-sm">✏️</button>&nbsp;<button class="d-btn d-btn-secondary d-btn-sm">🗑️</button></td></tr>
                          <tr><td><div style="font-weight:600;font-size:12px">Premium Electronics Kit</div><div style="font-size:10px;color:var(--text-muted)">Added May 26, 2026</div></td><td><code style="font-size:10px;color:var(--text-muted)">SKU-ELEC-002</code></td><td><span class="d-badge violet">Electronics</span></td><td><strong>$299.00</strong></td><td><span class="d-badge success">120 pcs</span></td><td><span class="d-badge violet">Luxury 15%</span></td><td><span class="d-badge cyan">Houston</span></td><td style="white-space:nowrap"><button class="d-btn d-btn-secondary d-btn-sm">✏️</button>&nbsp;<button class="d-btn d-btn-secondary d-btn-sm">🗑️</button></td></tr>
                          <tr><td><div style="font-weight:600;font-size:12px">Safety Helmets M</div><div style="font-size:10px;color:var(--text-muted)">Added May 24, 2026</div></td><td><code style="font-size:10px;color:var(--text-muted)">SKU-SAFE-003</code></td><td><span class="d-badge brand">Tools</span></td><td><strong>$32.00</strong></td><td><span class="d-badge danger">7 pcs</span></td><td><span class="d-badge muted">Normal 5%</span></td><td><span class="d-badge brand">Austin</span></td><td style="white-space:nowrap"><button class="d-btn d-btn-secondary d-btn-sm">✏️</button>&nbsp;<button class="d-btn d-btn-secondary d-btn-sm">🗑️</button></td></tr>
                          <tr><td><div style="font-weight:600;font-size:12px">Office Furniture Set</div><div style="font-size:10px;color:var(--text-muted)">Added May 20, 2026</div></td><td><code style="font-size:10px;color:var(--text-muted)">SKU-FURN-004</code></td><td><span class="d-badge success">Furniture</span></td><td><strong>$189.00</strong></td><td><span class="d-badge warning">35 pcs</span></td><td><span class="d-badge muted">Normal 5%</span></td><td><span class="d-badge cyan">Dallas</span></td><td style="white-space:nowrap"><button class="d-btn d-btn-secondary d-btn-sm">✏️</button>&nbsp;<button class="d-btn d-btn-secondary d-btn-sm">🗑️</button></td></tr>
                          <tr><td><div style="font-weight:600;font-size:12px">Forklift Chains Heavy</div><div style="font-size:10px;color:var(--text-muted)">Added May 18, 2026</div></td><td><code style="font-size:10px;color:var(--text-muted)">SKU-FORK-005</code></td><td><span class="d-badge brand">Tools</span></td><td><strong>$78.00</strong></td><td><span class="d-badge warning">14 pcs</span></td><td><span class="d-badge muted">Normal 5%</span></td><td><span class="d-badge cyan">Houston</span></td><td style="white-space:nowrap"><button class="d-btn d-btn-secondary d-btn-sm">✏️</button>&nbsp;<button class="d-btn d-btn-secondary d-btn-sm">🗑️</button></td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:11px;color:var(--text-muted)">
                      <span>Showing 1–5 of 247 items</span>
                      <div style="display:flex;gap:5px">
                        <button class="d-btn d-btn-secondary d-btn-sm">‹</button>
                        <button class="d-btn d-btn-primary d-btn-sm">1</button>
                        <button class="d-btn d-btn-secondary d-btn-sm">2</button>
                        <button class="d-btn d-btn-secondary d-btn-sm">3</button>
                        <button class="d-btn d-btn-secondary d-btn-sm">›</button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ── PAGE: BILLING ───────────────────── -->
                <div class="demo-page" id="page-billing">
                  <div class="d-page-header">
                    <div><div class="d-page-title">🧾 Billing & Invoices</div><div class="d-page-sub">Generate and manage invoices with automated tax calculation</div></div>
                    <button class="d-btn d-btn-primary">+ New Invoice</button>
                  </div>
                  <div class="d-stat-grid">
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(16,185,129,.15)">💰</div><div class="d-stat-val" style="color:var(--emerald)">$124.7k</div><div class="d-stat-lbl">Total Revenue</div><div class="d-stat-trend trend-up">Gross earnings</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(245,158,11,.15)">🏛️</div><div class="d-stat-val" style="color:var(--amber)">$8,920</div><div class="d-stat-lbl">Total Tax</div><div class="d-stat-trend">Normal + Luxury</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(99,102,241,.15)">💵</div><div class="d-stat-val" style="color:var(--brand-light)">$115.8k</div><div class="d-stat-lbl">Net Revenue</div><div class="d-stat-trend trend-up">After tax</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(6,182,212,.15)">📋</div><div class="d-stat-val" style="color:var(--cyan)">$3,283</div><div class="d-stat-lbl">Avg Invoice</div><div class="d-stat-trend">38 total invoices</div></div>
                  </div>
                  <div class="d-card">
                    <div class="d-card-hd">
                      <div class="d-card-title">Recent Invoices</div>
                      <div class="d-search" style="max-width:180px"><span>🔍</span><input placeholder="Search invoices..."></div>
                    </div>
                    <table class="d-table">
                      <thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Items</th><th>Tax</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        <tr><td><code style="font-size:10px;color:var(--brand-light)">INV-0038</code></td><td style="font-weight:600;font-size:12px">Texas Ironworks Ltd.</td><td style="color:var(--text-muted);font-size:11px">May 28, 2026</td><td>3 items</td><td style="color:var(--amber)">$45.50</td><td><strong style="color:var(--emerald)">$955.50</strong></td><td><span class="d-badge success">Paid</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">👁️</button></td></tr>
                        <tr><td><code style="font-size:10px;color:var(--brand-light)">INV-0037</code></td><td style="font-weight:600;font-size:12px">Global Parts Co.</td><td style="color:var(--text-muted);font-size:11px">May 27, 2026</td><td>7 items</td><td style="color:var(--amber)">$145.00</td><td><strong style="color:var(--emerald)">$2,340.00</strong></td><td><span class="d-badge success">Paid</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">👁️</button></td></tr>
                        <tr><td><code style="font-size:10px;color:var(--brand-light)">INV-0036</code></td><td style="font-weight:600;font-size:12px">Apex Manufacturing</td><td style="color:var(--text-muted);font-size:11px">May 25, 2026</td><td>12 items</td><td style="color:var(--amber)">$420.00</td><td><strong style="color:var(--emerald)">$7,820.00</strong></td><td><span class="d-badge success">Paid</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">👁️</button></td></tr>
                        <tr><td><code style="font-size:10px;color:var(--brand-light)">INV-0035</code></td><td style="font-weight:600;font-size:12px">NorthTex Logistics</td><td style="color:var(--text-muted);font-size:11px">May 24, 2026</td><td>5 items</td><td style="color:var(--amber)">$275.00</td><td><strong style="color:var(--emerald)">$5,200.00</strong></td><td><span class="d-badge warning">Pending</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">👁️</button></td></tr>
                        <tr><td><code style="font-size:10px;color:var(--brand-light)">INV-0034</code></td><td style="font-weight:600;font-size:12px">SwiftDepot Inc.</td><td style="color:var(--text-muted);font-size:11px">May 22, 2026</td><td>2 items</td><td style="color:var(--amber)">$62.00</td><td><strong style="color:var(--emerald)">$1,490.00</strong></td><td><span class="d-badge success">Paid</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">👁️</button></td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- ── PAGE: WORKFORCE ─────────────────── -->
                <div class="demo-page" id="page-workforce">
                  <div class="d-page-header">
                    <div><div class="d-page-title">👥 Workforce Management</div><div class="d-page-sub">Manage team members, roles, and warehouse assignments</div></div>
                    <button class="d-btn d-btn-primary">+ Invite Member</button>
                  </div>
                  <div class="d-stat-grid">
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(99,102,241,.15)">👤</div><div class="d-stat-val" style="color:var(--brand-light)">2</div><div class="d-stat-lbl">Admins</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(16,185,129,.15)">🎯</div><div class="d-stat-val" style="color:var(--emerald)">4</div><div class="d-stat-lbl">Managers</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(245,158,11,.15)">⭐</div><div class="d-stat-val" style="color:var(--amber)">8</div><div class="d-stat-lbl">Staff</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(100,116,139,.15)">👷</div><div class="d-stat-val">14</div><div class="d-stat-lbl">Employees</div></div>
                  </div>
                  <div class="d-card">
                    <div style="display:flex;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
                      <div class="d-tabs">
                        <div class="d-tab active" data-demotab="all">All Members</div>
                        <div class="d-tab" data-demotab="managers">Managers</div>
                        <div class="d-tab" data-demotab="staff">Staff</div>
                      </div>
                      <div class="d-search" style="max-width:180px"><span>🔍</span><input placeholder="Search members..."></div>
                    </div>
                    <table class="d-table">
                      <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Warehouse</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="demo-user-av" style="width:28px;height:28px;font-size:10px">SC</div><div style="font-size:12px;font-weight:600">Sarah Connor</div></div></td><td style="font-size:11px;color:var(--text-muted)">sarah@nexware.com</td><td><span class="role-mg">Manager</span></td><td><span class="d-badge cyan">Dallas Depot</span></td><td><span class="d-badge success">Active</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="demo-user-av" style="width:28px;height:28px;font-size:10px">KP</div><div style="font-size:12px;font-weight:600">Kim Park</div></div></td><td style="font-size:11px;color:var(--text-muted)">kim@nexware.com</td><td><span class="role-st">Staff</span></td><td><span class="d-badge cyan">Houston HQ</span></td><td><span class="d-badge success">Active</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="demo-user-av" style="width:28px;height:28px;font-size:10px">AT</div><div style="font-size:12px;font-weight:600">Alex Torres</div></div></td><td style="font-size:11px;color:var(--text-muted)">atorres@nexware.com</td><td><span class="role-ad">Admin</span></td><td><span class="d-badge brand">Austin Depot</span></td><td><span class="d-badge success">Active</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="demo-user-av" style="width:28px;height:28px;font-size:10px">MK</div><div style="font-size:12px;font-weight:600">Marcus Kim</div></div></td><td style="font-size:11px;color:var(--text-muted)">mkim@nexware.com</td><td><span class="role-mg">Manager</span></td><td><span class="d-badge cyan">Houston HQ</span></td><td><span class="d-badge success">Active</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="demo-user-av" style="width:28px;height:28px;font-size:10px">JR</div><div style="font-size:12px;font-weight:600">James Rodriguez</div></div></td><td style="font-size:11px;color:var(--text-muted)">jrod@nexware.com</td><td><span class="role-em">Employee</span></td><td><span class="d-badge cyan">Dallas Depot</span></td><td><span class="d-badge warning">Inactive</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- ── PAGE: TABLES ─────────────────────── -->
                <div class="demo-page" id="page-tables">
                  <div class="d-page-header">
                    <div><div class="d-page-title">📋 Dynamic Tables</div><div class="d-page-sub">Custom operational data schemas with typed columns</div></div>
                    <button class="d-btn d-btn-primary">+ New Table</button>
                  </div>
                  <div class="d-grid3" style="margin-bottom:14px">
                    <div class="d-card" style="cursor:pointer;border-color:var(--border-brand)">
                      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                        <div style="width:36px;height:36px;border-radius:10px;background:rgba(99,102,241,.2);display:flex;align-items:center;justify-content:center;font-size:18px">🔧</div>
                        <div>
                          <div style="font-size:13px;font-weight:700">Maintenance Logs</div>
                          <div style="font-size:10px;color:var(--text-muted)">3 columns · 42 rows</div>
                        </div>
                      </div>
                      <div style="display:flex;gap:5px;flex-wrap:wrap">
                        <span class="d-badge brand">text</span><span class="d-badge brand">text</span><span class="d-badge violet">dropdown</span>
                      </div>
                    </div>
                    <div class="d-card" style="cursor:pointer">
                      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                        <div style="width:36px;height:36px;border-radius:10px;background:rgba(16,185,129,.2);display:flex;align-items:center;justify-content:center;font-size:18px">🚚</div>
                        <div>
                          <div style="font-size:13px;font-weight:700">Shipment Tracker</div>
                          <div style="font-size:10px;color:var(--text-muted)">5 columns · 128 rows</div>
                        </div>
                      </div>
                      <div style="display:flex;gap:5px;flex-wrap:wrap">
                        <span class="d-badge success">text</span><span class="d-badge cyan">date</span><span class="d-badge violet">dropdown</span>
                      </div>
                    </div>
                    <div class="d-card" style="cursor:pointer">
                      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                        <div style="width:36px;height:36px;border-radius:10px;background:rgba(245,158,11,.2);display:flex;align-items:center;justify-content:center;font-size:18px">📦</div>
                        <div>
                          <div style="font-size:13px;font-weight:700">Returns Register</div>
                          <div style="font-size:10px;color:var(--text-muted)">4 columns · 19 rows</div>
                        </div>
                      </div>
                      <div style="display:flex;gap:5px;flex-wrap:wrap">
                        <span class="d-badge brand">text</span><span class="d-badge warning">number</span><span class="d-badge violet">dropdown</span>
                      </div>
                    </div>
                  </div>
                  <div class="d-card">
                    <div class="d-card-hd" style="margin-bottom:12px">
                      <div><div class="d-card-title">🔧 Maintenance Logs</div><div class="d-card-sub">Dallas Logistics Depot · Daily forklift checkups</div></div>
                      <div style="display:flex;gap:6px">
                        <button class="d-btn d-btn-secondary d-btn-sm">Export</button>
                        <button class="d-btn d-btn-primary d-btn-sm">+ Add Row</button>
                      </div>
                    </div>
                    <table class="d-table">
                      <thead><tr><th>Forklift ID</th><th>Inspector</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                      <tbody>
                        <tr><td style="font-family:var(--font-mono);font-size:11px">FL-004</td><td>Sarah Connor</td><td><span class="d-badge success">OK</span></td><td style="font-size:11px;color:var(--text-muted)">May 28, 2026</td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td style="font-family:var(--font-mono);font-size:11px">FL-007</td><td>Kim Park</td><td><span class="d-badge danger">Maintenance Required</span></td><td style="font-size:11px;color:var(--text-muted)">May 27, 2026</td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td style="font-family:var(--font-mono);font-size:11px">FL-002</td><td>James Rodriguez</td><td><span class="d-badge success">OK</span></td><td style="font-size:11px;color:var(--text-muted)">May 27, 2026</td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td style="font-family:var(--font-mono);font-size:11px">FL-009</td><td>Sarah Connor</td><td><span class="d-badge warning">Under Review</span></td><td style="font-size:11px;color:var(--text-muted)">May 26, 2026</td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- ── PAGE: AUDIT LOGS ─────────────────── -->
                <div class="demo-page" id="page-audit">
                  <div class="d-page-header">
                    <div><div class="d-page-title">🔍 Audit Logs</div><div class="d-page-sub">Tamper-evident record of all system events — tenant-scoped</div></div>
                    <button class="d-btn d-btn-secondary">Export CSV</button>
                  </div>
                  <div class="d-card" style="margin-bottom:14px">
                    <div style="display:flex;gap:10px;flex-wrap:wrap">
                      <div class="d-search" style="max-width:200px"><span>🔍</span><input placeholder="Search logs..."></div>
                      <select class="d-input" style="width:auto;padding:6px 10px;font-size:12px"><option>All Actions</option><option>Login</option><option>Create</option><option>Update</option><option>Delete</option></select>
                      <select class="d-input" style="width:auto;padding:6px 10px;font-size:12px"><option>All Warehouses</option><option>Dallas Depot</option><option>Houston HQ</option></select>
                    </div>
                  </div>
                  <div class="d-card">
                    <table class="d-table">
                      <thead><tr><th>Action</th><th>Description</th><th>User</th><th>Warehouse</th><th>Timestamp</th></tr></thead>
                      <tbody>
                        <tr><td><span class="d-badge success">item_create</span></td><td style="font-size:11px;color:var(--text-secondary)">Created inventory item: Industrial Steel Pipes (SKU-PIPE-001)</td><td style="font-size:11px">Alex Mercer</td><td style="font-size:11px;color:var(--text-muted)">Dallas Depot</td><td style="font-size:10px;color:var(--text-muted)">May 28 · 14:32</td></tr>
                        <tr><td><span class="d-badge brand">login</span></td><td style="font-size:11px;color:var(--text-secondary)">User logged in successfully: sarah@nexware.com</td><td style="font-size:11px">Sarah Connor</td><td style="font-size:11px;color:var(--text-muted)">Dallas Depot</td><td style="font-size:10px;color:var(--text-muted)">May 28 · 14:18</td></tr>
                        <tr><td><span class="d-badge cyan">bill_create</span></td><td style="font-size:11px;color:var(--text-secondary)">Invoice INV-0038 created — Total: $955.50 (Tax: $45.50)</td><td style="font-size:11px">Sarah Connor</td><td style="font-size:11px;color:var(--text-muted)">Dallas Depot</td><td style="font-size:10px;color:var(--text-muted)">May 28 · 13:55</td></tr>
                        <tr><td><span class="d-badge warning">warehouse_update</span></td><td style="font-size:11px;color:var(--text-secondary)">Warehouse settings updated: Dallas Logistics Depot</td><td style="font-size:11px">Alex Mercer</td><td style="font-size:11px;color:var(--text-muted)">Dallas Depot</td><td style="font-size:10px;color:var(--text-muted)">May 28 · 11:20</td></tr>
                        <tr><td><span class="d-badge success">workforce_create</span></td><td style="font-size:11px;color:var(--text-secondary)">New workforce member added: Kim Park (Staff)</td><td style="font-size:11px">Alex Mercer</td><td style="font-size:11px;color:var(--text-muted)">Houston HQ</td><td style="font-size:10px;color:var(--text-muted)">May 27 · 16:45</td></tr>
                        <tr><td><span class="d-badge brand">signup</span></td><td style="font-size:11px;color:var(--text-secondary)">New Super Admin registered: alex@nexware.com (Tenant provisioned)</td><td style="font-size:11px">Alex Mercer</td><td style="font-size:11px;color:var(--text-muted)">—</td><td style="font-size:10px;color:var(--text-muted)">May 26 · 09:00</td></tr>
                        <tr><td><span class="d-badge danger">logout</span></td><td style="font-size:11px;color:var(--text-secondary)">User logged out: marcus@nexware.com</td><td style="font-size:11px">Marcus Kim</td><td style="font-size:11px;color:var(--text-muted)">Houston HQ</td><td style="font-size:10px;color:var(--text-muted)">May 25 · 18:10</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- ── PAGE: ANALYTICS ─────────────────── -->
                <div class="demo-page" id="page-analytics">
                  <div class="d-page-header">
                    <div><div class="d-page-title">📈 Analytics & Reports</div><div class="d-page-sub">Global revenue, inventory, and workforce insights</div></div>
                    <button class="d-btn d-btn-secondary">Export PDF</button>
                  </div>
                  <div class="d-stat-grid">
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(16,185,129,.15)">📈</div><div class="d-stat-val" style="color:var(--emerald)">+18%</div><div class="d-stat-lbl">Revenue Growth</div><div class="d-stat-trend trend-up">vs last month</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(99,102,241,.15)">🔄</div><div class="d-stat-val" style="color:var(--brand-light)">94%</div><div class="d-stat-lbl">Stock Health</div><div class="d-stat-trend trend-up">All locations</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(6,182,212,.15)">⚡</div><div class="d-stat-val" style="color:var(--cyan)">38</div><div class="d-stat-lbl">Invoices This Month</div><div class="d-stat-trend trend-up">↑ 12 from last</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(245,158,11,.15)">👥</div><div class="d-stat-val" style="color:var(--amber)">28</div><div class="d-stat-lbl">Active Team Members</div><div class="d-stat-trend">Across 4 warehouses</div></div>
                  </div>
                  <div class="d-grid2">
                    <div class="d-card">
                      <div class="d-card-hd"><div class="d-card-title">📊 Monthly Revenue Breakdown</div></div>
                      <div class="d-chart-wrap" style="height:160px"><canvas id="demo-analytics-chart"></canvas></div>
                    </div>
                    <div class="d-card">
                      <div class="d-card-hd"><div class="d-card-title">🏭 Revenue by Warehouse</div></div>
                      <div class="d-chart-wrap" style="height:160px"><canvas id="demo-wh-pie-chart"></canvas></div>
                    </div>
                  </div>
                  <div class="d-card">
                    <div class="d-card-hd"><div class="d-card-title">📦 Revenue Summary by Warehouse</div></div>
                    <table class="d-table">
                      <thead><tr><th>Warehouse</th><th>Items</th><th>Invoices</th><th>Revenue</th><th>% Share</th><th>Growth</th></tr></thead>
                      <tbody>
                        <tr><td style="font-weight:600">Houston HQ Distribution</td><td>98</td><td>16</td><td style="color:var(--emerald);font-weight:700">$58,900</td><td><span class="d-badge success">47%</span></td><td class="trend-up">+22%</td></tr>
                        <tr><td style="font-weight:600">Dallas Logistics Depot</td><td>74</td><td>12</td><td style="color:var(--emerald);font-weight:700">$42,300</td><td><span class="d-badge brand">34%</span></td><td class="trend-up">+14%</td></tr>
                        <tr><td style="font-weight:600">Austin Depot North</td><td>52</td><td>7</td><td style="color:var(--emerald);font-weight:700">$23,550</td><td><span class="d-badge muted">19%</span></td><td class="trend-up">+8%</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- ── PAGE: SETTINGS ──────────────────── -->
                <div class="demo-page" id="page-settings">
                  <div class="d-page-header">
                    <div><div class="d-page-title">⚙️ System Settings</div><div class="d-page-sub">Manage account, security, tax config, and notification preferences</div></div>
                  </div>
                  <div class="d-tabs" style="margin-bottom:16px">
                    <div class="d-tab active">Profile</div>
                    <div class="d-tab">Tax Config</div>
                    <div class="d-tab">Notifications</div>
                    <div class="d-tab">Security</div>
                  </div>
                  <div class="d-grid2">
                    <div class="d-card">
                      <div class="d-card-title" style="margin-bottom:16px">Account Profile</div>
                      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
                        <div class="demo-user-av" style="width:52px;height:52px;font-size:18px">AM</div>
                        <div>
                          <div style="font-size:15px;font-weight:700">Alex Mercer</div>
                          <div style="font-size:12px;color:var(--text-muted)">alex@nexware.com</div>
                          <span class="role-sa" style="margin-top:5px;display:inline-flex">Super Admin</span>
                        </div>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:10px">
                        <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Full Name</label><input class="d-input" value="Alex Mercer"></div>
                        <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Email Address</label><input class="d-input" value="alex@nexware.com"></div>
                        <button class="d-btn d-btn-primary" style="margin-top:4px">Save Changes</button>
                      </div>
                    </div>
                    <div class="d-card">
                      <div class="d-card-title" style="margin-bottom:16px">Tax Configuration</div>
                      <div style="display:flex;flex-direction:column;gap:12px">
                        <div>
                          <div style="display:flex;justify-content:space-between;margin-bottom:6px"><label style="font-size:12px;color:var(--text-secondary)">Normal Tax Rate</label><strong style="color:var(--emerald)">5%</strong></div>
                          <div class="d-progress"><div class="d-progress-fill" style="width:5%;background:var(--emerald)"></div></div>
                          <input type="range" min="0" max="30" value="5" style="width:100%;margin-top:6px;accent-color:var(--emerald)">
                        </div>
                        <div>
                          <div style="display:flex;justify-content:space-between;margin-bottom:6px"><label style="font-size:12px;color:var(--text-secondary)">Luxury Tax Rate</label><strong style="color:var(--violet)">15%</strong></div>
                          <div class="d-progress"><div class="d-progress-fill" style="width:15%;background:var(--violet)"></div></div>
                          <input type="range" min="0" max="30" value="15" style="width:100%;margin-top:6px;accent-color:var(--violet)">
                        </div>
                        <div style="padding:10px;background:rgba(99,102,241,.07);border-radius:8px;font-size:12px;color:var(--text-secondary)">
                          💡 Tax rates apply to all new invoices. Historical invoices retain their original snapshot.
                        </div>
                        <button class="d-btn d-btn-primary">Update Tax Config</button>
                      </div>
                    </div>
                  </div>
                </div>

              </div><!-- /demo-content -->
            </div><!-- /demo-shell -->
          </div><!-- /erp-frame -->
        </div><!-- /erp-device -->

        <div class="demo-hint">
          <span class="kbd">Click</span> any sidebar item or tab above to switch views
          &nbsp;·&nbsp; <span class="kbd">Scroll</span> inside the demo to see more data
          &nbsp;·&nbsp; All interactions are <strong style="color:var(--emerald)">read-only</strong> — nothing is saved
        </div>
      </div>
    </section>

    <!-- ═══════════ WORKFLOW ══════════════════════════════════ -->
    <section id="workflow" class="lp-section">
      <div class="lp-container">
        <div class="text-center reveal">
          <div class="lp-label">🔄 How It Works</div>
          <h2 class="lp-h2">Up and running in<br><span>under 5 minutes</span></h2>
          <p class="lp-sub">From zero to a fully operational multi-warehouse ERP with one streamlined onboarding flow.</p>
        </div>
        <div class="workflow-grid">
          <div class="wf-step reveal"><div class="wf-num">👤</div><h3 class="wf-title">Create Account</h3><p class="wf-desc">Sign up as a Super Admin. Your private isolated tenant is provisioned instantly with Argon2id-secured credentials.</p></div>
          <div class="wf-step reveal"><div class="wf-num">🏭</div><h3 class="wf-title">Register Warehouses</h3><p class="wf-desc">Add unlimited warehouse locations with contact details, tax preferences, and branding.</p></div>
          <div class="wf-step reveal"><div class="wf-num">👥</div><h3 class="wf-title">Invite Your Team</h3><p class="wf-desc">Send email invitations to managers, staff, and employees. Assign roles and warehouse access instantly.</p></div>
          <div class="wf-step reveal"><div class="wf-num">🚀</div><h3 class="wf-title">Start Operating</h3><p class="wf-desc">Add inventory, create invoices, build custom tables — real-time sync keeps every user updated instantly.</p></div>
        </div>
      </div>
    </section>

    <!-- ═══════════ ALL FEATURES ══════════════════════════════ -->
    <section class="lp-section" style="background:rgba(0,0,0,.15)">
      <div class="lp-container">
        <div class="text-center reveal">
          <div class="lp-label">🛠 Full Feature Set</div>
          <h2 class="lp-h2">Built for serious<br><span>enterprise operations</span></h2>
        </div>
        <div class="af-grid">
          <div class="af-cell reveal"><div class="af-icon">🔐</div><div class="af-title">JWT Auth + Refresh Tokens</div><div class="af-desc">15-min access tokens with 7-day rotating refresh tokens and database-backed session revocation.</div></div>
          <div class="af-cell reveal"><div class="af-icon">📡</div><div class="af-title">Real-Time WebSocket Sync</div><div class="af-desc">Live updates pushed via WebSocket connections backed by MongoDB Change Streams. Every tab stays synchronized.</div></div>
          <div class="af-cell reveal"><div class="af-icon">📥</div><div class="af-title">CSV Bulk Import & Export</div><div class="af-desc">Import thousands of inventory items at once. Export any table, bill list, or audit log to CSV or PDF.</div></div>
          <div class="af-cell reveal"><div class="af-icon">📋</div><div class="af-title">Dynamic Table Builder</div><div class="af-desc">Design custom data schemas with typed columns: text, number, dropdown, date. Build any operational table.</div></div>
          <div class="af-cell reveal"><div class="af-icon">🌐</div><div class="af-title">Multi-Tenant Isolation</div><div class="af-desc">Every tenant's data is triple-isolated at the token, service, and repository layer — architecturally impossible to cross.</div></div>
          <div class="af-cell reveal"><div class="af-icon">📈</div><div class="af-title">Analytics & Revenue Charts</div><div class="af-desc">Interactive Chart.js visualizations: 6-month revenue trend, warehouse distribution, and projected growth.</div></div>
          <div class="af-cell reveal"><div class="af-icon">🔔</div><div class="af-title">Smart Notifications</div><div class="af-desc">Role-aware in-app notifications with granular per-user preference controls for billing, stock, and system events.</div></div>
          <div class="af-cell reveal"><div class="af-icon">⚡</div><div class="af-title">Rate Limiting & Security</div><div class="af-desc">Production-grade sliding-window rate limiter (Redis + in-memory fallback), full CORS policy, Argon2id hashing.</div></div>
          <div class="af-cell reveal"><div class="af-icon">🏥</div><div class="af-title">Health & Monitoring</div><div class="af-desc">Live system health checks for database, cache, and realtime services at /health endpoints for ops teams.</div></div>
        </div>
      </div>
    </section>

    <!-- ═══════════ TESTIMONIALS ══════════════════════════════ -->
    <section class="lp-section">
      <div class="lp-container">
        <div class="text-center reveal">
          <div class="lp-label">💬 What Teams Say</div>
          <h2 class="lp-h2">Built for real<br><span>logistics teams</span></h2>
        </div>
        <div class="t-grid">
          <div class="t-card reveal">
            <div class="t-stars">★★★★★</div>
            <p class="t-quote">"NexWare replaced three separate tools we were using. The audit log alone saves us hours of compliance reporting every month. Real-time sync between warehouses is a game changer."</p>
            <div class="t-author"><div class="t-av">JR</div><div><div class="t-name">James Rodriguez</div><div class="t-role">VP Operations, DallasFlex</div></div></div>
          </div>
          <div class="t-card reveal">
            <div class="t-stars">★★★★★</div>
            <p class="t-quote">"The dynamic table builder is genius. We built a custom forklift maintenance log in 5 minutes. The role-based visibility means managers see exactly what they need — nothing more."</p>
            <div class="t-author"><div class="t-av">SC</div><div><div class="t-name">Sarah Chen</div><div class="t-role">Warehouse Manager, Apex Mfg.</div></div></div>
          </div>
          <div class="t-card reveal">
            <div class="t-stars">★★★★★</div>
            <p class="t-quote">"Tax snapshots on every invoice means our historical reports never change. Our accounting team signed off immediately. The billing system is exactly what we needed."</p>
            <div class="t-author"><div class="t-av">MK</div><div><div class="t-name">Marcus Kim</div><div class="t-role">CFO, GlobalParts Co.</div></div></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ PRICING ════════════════════════════════════ -->
    <section id="pricing" class="lp-section" style="background:rgba(0,0,0,.15)">
      <div class="lp-container">
        <div class="text-center reveal">
          <div class="lp-label">💳 Pricing</div>
          <h2 class="lp-h2">Simple, honest pricing.<br><span>No surprises.</span></h2>
          <p class="lp-sub">Choose the plan that matches your operation scale. Upgrade anytime.</p>
        </div>
        <div class="pricing-grid">
          <div class="p-card reveal">
            <div class="p-plan-lbl">Starter</div>
            <div class="p-price"><span class="amount">$49</span><span class="per">/month</span></div>
            <p class="p-tagline">Perfect for small businesses starting with digital inventory management.</p>
            <ul class="p-feats">
              <li><span class="tick">✓</span> 1 Warehouse Location</li>
              <li><span class="tick">✓</span> Up to 10 Team Members</li>
              <li><span class="tick">✓</span> Full Inventory Management</li>
              <li><span class="tick">✓</span> Invoice Billing with Tax</li>
              <li><span class="tick">✓</span> Basic Audit Logging</li>
              <li><span class="tick">✓</span> CSV Import / Export</li>
              <li><span class="tick">✓</span> Email Support</li>
            </ul>
            <a href="#/signup" class="p-cta p-cta-ghost">Get Started</a>
          </div>
          <div class="p-card popular reveal">
            <div class="p-pop-tag">MOST POPULAR</div>
            <div class="p-plan-lbl">Enterprise</div>
            <div class="p-price"><span class="amount">$199</span><span class="per">/month</span></div>
            <p class="p-tagline">For scaling operations needing multi-location sync, advanced controls, and compliance.</p>
            <ul class="p-feats">
              <li><span class="tick">✓</span> Unlimited Warehouses</li>
              <li><span class="tick">✓</span> Unlimited Team Members</li>
              <li><span class="tick">✓</span> 5-Tier RBAC System</li>
              <li><span class="tick">✓</span> Dynamic Custom Table Builder</li>
              <li><span class="tick">✓</span> Full Compliance Audit Logs</li>
              <li><span class="tick">✓</span> Advanced Analytics & Charts</li>
              <li><span class="tick">✓</span> Real-Time WebSocket Sync</li>
              <li><span class="tick">✓</span> Priority 24/7 Support</li>
            </ul>
            <a href="#/signup" class="p-cta p-cta-brand">Start Enterprise Trial →</a>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ CTA ════════════════════════════════════════ -->
    <section class="lp-section">
      <div class="lp-container">
        <div class="cta-box reveal">
          <h2>Ready to transform your<br><span>warehouse operations?</span></h2>
          <p>Join modern logistics teams already running on NexWare ERP.<br>Setup takes minutes, not months.</p>
          <div class="cta-actions">
            <a href="#/signup" class="lp-btn lp-btn-primary lp-btn-lg">🚀 Create Free Account</a>
            <a href="#interactive-demo" class="lp-btn lp-btn-ghost lp-btn-lg">🖥 Try Demo First</a>
          </div>
          <p class="cta-note">No credit card required · Free trial · Cancel anytime</p>
        </div>
      </div>
    </section>

    <!-- ═══════════ FOOTER ════════════════════════════════════ -->
    <footer>
      <div class="lp-container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a href="#/" class="lp-logo"><div class="lp-logo-icon">🏭</div><span>Nex<em>Ware</em></span></a>
            <p>Enterprise warehouse management platform built for modern logistics. Unify inventory, billing, workforce, and compliance in one powerful system.</p>
            <div style="margin-top:14px"><span class="footer-badge">● System Operational</span></div>
          </div>
          <div class="footer-col">
            <h4>Platform</h4>
            <a href="#features">Features</a>
            <a href="#interactive-demo">Live Demo</a>
            <a href="#workflow">How It Works</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div class="footer-col">
            <h4>Product</h4>
            <a href="#/signup">Get Started</a>
            <a href="#/login">Log In</a>
            <a href="#/dashboard">Dashboard</a>
            <a href="#/items">Inventory</a>
          </div>
          <div class="footer-col">
            <h4>Technology</h4>
            <a href="#">FastAPI Backend</a>
            <a href="#">MongoDB Atlas</a>
            <a href="#">WebSocket Realtime</a>
            <a href="#">Argon2id Security</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© 2026 NexWare ERP. Built for enterprise efficiency. · <a href="#/privacy" style="text-decoration:underline;color:var(--text-secondary)">Privacy Policy</a> · <a href="#/terms" style="text-decoration:underline;color:var(--text-secondary)">Terms & Conditions</a></span>
          <span>FastAPI · MongoDB · Vanilla JS · JWT Auth</span>
        </div>
      </div>
    </footer>
  `;

  // ── NAV TOGGLE ──────────────────────────────────────────
  const mobBtn = document.getElementById('mobBtn');
  const mobMenu = document.getElementById('mobMenu');
  if (mobBtn && mobMenu) {
    mobBtn.addEventListener('click', () => {
      mobMenu.classList.toggle('open');
      mobBtn.textContent = mobMenu.classList.contains('open') ? '✕' : '☰';
    });
    mobMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      mobMenu.classList.remove('open');
      mobBtn.textContent = '☰';
    }));
  }

  // ── SCROLL NAVBAR EFFECT ────────────────────────────────
  const onScroll = () => {
    const navEl = document.getElementById('lp-nav');
    if (navEl) {
      navEl.style.background = window.scrollY > 40 ? 'rgba(10,11,26,.97)' : 'rgba(10,11,26,.85)';
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // ── SMOOTH SCROLL LOCAL ANCHORS ────────────────────────
  appEl.querySelectorAll('a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href');
    if (href.startsWith('#/')) return; // Ignore SPA routes
    
    a.addEventListener('click', e => {
      const targetEl = document.querySelector(href);
      if (targetEl) {
        e.preventDefault();
        window.scrollTo({ top: targetEl.offsetTop - 76, behavior: 'smooth' });
      }
    });
  });

  // ── SCROLL REVEAL ──────────────────────────────────────
  const revObs = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 55);
        revObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
  appEl.querySelectorAll('.reveal').forEach(el => revObs.observe(el));

  // ── INTERACTIVE DEMO PAGE CONTROLLER ────────────────────
  const urlMap = {
    dashboard: 'app.nexware.io/dashboard',
    inventory: 'app.nexware.io/inventory',
    billing: 'app.nexware.io/billing',
    workforce: 'app.nexware.io/workforce',
    tables: 'app.nexware.io/tables',
    audit: 'app.nexware.io/audit',
    analytics: 'app.nexware.io/analytics',
    settings: 'app.nexware.io/settings'
  };

  const demoCharts = {};
  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1d3a', titleColor: '#f1f5f9',
        bodyColor: '#94a3b8', borderColor: '#2a2d4a', borderWidth: 1
      }
    }
  };

  function destroyChart(id) {
    if (demoCharts[id]) { demoCharts[id].destroy(); delete demoCharts[id]; }
  }

  function initDemoCharts(page) {
    if (page === 'dashboard') {
      const rc = document.getElementById('demo-rev-chart');
      if (rc && window.Chart) {
        destroyChart('rev');
        demoCharts['rev'] = new window.Chart(rc, {
          type: 'bar',
          data: {
            labels: ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
            datasets: [{
              label: 'Revenue',
              data: [18200, 24500, 19800, 31200, 28600, 35400],
              backgroundColor: ['rgba(99,102,241,.35)','rgba(99,102,241,.35)','rgba(99,102,241,.35)','rgba(99,102,241,.35)','rgba(99,102,241,.35)','rgba(99,102,241,.85)'],
              borderColor: '#6366f1', borderWidth: 1, borderRadius: 5
            }]
          },
          options: {
            ...CHART_DEFAULTS,
            scales: {
              x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
              y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => '$' + (v/1000).toFixed(0) + 'k' }, border: { display: false } }
            }
          }
        });
      }
    }

    if (page === 'analytics') {
      const ac = document.getElementById('demo-analytics-chart');
      if (ac && window.Chart) {
        destroyChart('analytics');
        demoCharts['analytics'] = new window.Chart(ac, {
          type: 'line',
          data: {
            labels: ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
            datasets: [{
              label: 'Revenue',
              data: [18200, 24500, 19800, 31200, 28600, 35400],
              borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.12)',
              fill: true, tension: 0.4, pointRadius: 4,
              pointBackgroundColor: '#6366f1'
            }]
          },
          options: {
            ...CHART_DEFAULTS,
            scales: {
              x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
              y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => '$' + (v/1000).toFixed(0) + 'k' }, border: { display: false } }
            }
          }
        });
      }
      const pc = document.getElementById('demo-wh-pie-chart');
      if (pc && window.Chart) {
        destroyChart('whpie');
        demoCharts['whpie'] = new window.Chart(pc, {
          type: 'doughnut',
          data: {
            labels: ['Houston HQ', 'Dallas Depot', 'Austin Depot'],
            datasets: [{
              data: [58900, 42300, 23550],
              backgroundColor: ['rgba(99,102,241,.85)', 'rgba(16,185,129,.85)', 'rgba(6,182,212,.85)'],
              borderColor: '#0f1029', borderWidth: 2
            }]
          },
          options: {
            ...CHART_DEFAULTS,
            plugins: {
              ...CHART_DEFAULTS.plugins,
              legend: { display: true, position: 'right', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 12 } }
            },
            cutout: '65%'
          }
        });
      }
    }
  }

  function switchDemoPage(page) {
    appEl.querySelectorAll('.demo-page').forEach(p => p.classList.remove('active'));
    appEl.querySelectorAll('.demo-item').forEach(i => i.classList.remove('active'));
    appEl.querySelectorAll('.showcase-tab').forEach(t => t.classList.remove('active'));

    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');

    const sideItem = appEl.querySelector(`.demo-item[data-target="${page}"]`);
    if (sideItem) sideItem.classList.add('active');

    const sTab = appEl.querySelector(`.showcase-tab[data-page="${page}"]`);
    if (sTab) sTab.classList.add('active');

    const urlEl = document.getElementById('demo-url');
    if (urlEl) urlEl.textContent = urlMap[page] || 'app.nexware.io/' + page;

    requestAnimationFrame(() => initDemoCharts(page));
  }

  appEl.querySelectorAll('.demo-item[data-target]').forEach(item => {
    item.addEventListener('click', () => switchDemoPage(item.dataset.target));
  });

  appEl.querySelectorAll('.showcase-tab[data-page]').forEach(tab => {
    tab.addEventListener('click', () => switchDemoPage(tab.dataset.page));
  });

  appEl.querySelectorAll('.d-tab[data-demotab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const parent = tab.closest('.d-tabs');
      if (parent) {
        parent.querySelectorAll('.d-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      }
    });
  });

  appEl.querySelectorAll('.d-tab:not([data-demotab])').forEach(tab => {
    tab.addEventListener('click', () => {
      const parent = tab.closest('.d-tabs');
      if (parent) {
        parent.querySelectorAll('.d-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      }
    });
  });

  // ── TAX RANGE SLIDERS ──────────────────────────────────
  appEl.querySelectorAll('input[type="range"]').forEach(slider => {
    slider.addEventListener('input', function() {
      const label = this.parentElement.querySelector('strong');
      if (label) label.textContent = this.value + '%';
      const fill = this.parentElement.querySelector('.d-progress-fill');
      if (fill) fill.style.width = this.value + '%';
    });
  });

  // Clean scroll listener on hash change
  const onHashChange = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('hashchange', onHashChange);
  };
  window.addEventListener('hashchange', onHashChange);

  // Trigger default demo dashboard charts
  initDemoCharts('dashboard');
}
