/**
 * App Shell — Sidebar + Topbar + Main layout (v2)
 */
import { getCurrentUser, logout, getWarehouses, getNotifications, markNotificationRead, markAllNotificationsRead, clearNotifications, getSubscription, getStockHealth } from '../modules/store.js';
import { navigate, getCurrentPath } from '../modules/router.js';
import { capitalize, positionFixedElement } from '../modules/ui.js';
import { initPalette, togglePalette } from './palette.js';

const SUPER_ADMIN_NAV = [
  { section: 'Overview', items: [
    { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  ]},
  { section: 'Operations', items: [
    { path: '/warehouses', icon: '🏭', label: 'Warehouses' },
    { path: '/workforce', icon: '👥', label: 'Workforce' },
    { path: '/items', icon: '📦', label: 'Inventory' },
    { path: '/tables', icon: '📋', label: 'Tables' },
  ]},
  { section: 'Finance', items: [
    { path: '/billing', icon: '💰', label: 'Billing' },
    { path: '/analytics', icon: '📈', label: 'Global Reports' },
  ]},
  { section: 'System', items: [
    { path: '/settings', icon: '⚙️', label: 'System Settings' },
    { path: '/audit', icon: '🔍', label: 'Audit Logs' },
  ]},
];

const ADMIN_NAV = [
  { section: 'Overview', items: [
    { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  ]},
  { section: 'Operations', items: [
    { path: '/warehouses', icon: '🏭', label: 'Warehouse' },
    { path: '/workforce', icon: '👥', label: 'User Management' },
    { path: '/items', icon: '📦', label: 'Item Management' },
    { path: '/tables', icon: '📋', label: 'Tables' },
  ]},
  { section: 'Finance', items: [
    { path: '/billing', icon: '💰', label: 'Billing' },
    { path: '/analytics', icon: '📈', label: 'Reports' },
  ]},
  { section: 'System', items: [
    { path: '/audit', icon: '🔍', label: 'Audit Logs' },
  ]},
];

const MANAGER_NAV = [
  { section: 'Overview', items: [
    { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  ]},
  { section: 'Operations', items: [
    { path: '/items', icon: '📦', label: 'Items' },
    { path: '/tables', icon: '📋', label: 'Tables' },
    { path: '/billing', icon: '💰', label: 'Billing' },
  ]},
  { section: 'Reports', items: [
    { path: '/analytics', icon: '📈', label: 'Analytics' },
  ]},
];

const STAFF_NAV = [
  { section: 'Overview', items: [
    { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  ]},
  { section: 'Work', items: [
    { path: '/tables', icon: '📋', label: 'My Tables' },
    { path: '/billing', icon: '💰', label: 'Billing' },
  ]},
];

const EMPLOYEE_NAV = [
  { section: 'Overview', items: [
    { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  ]},
  { section: 'My Work', items: [
    { path: '/tables', icon: '📋', label: 'My Tables' },
  ]},
];

function getNav(role) {
  const map = { super_admin: SUPER_ADMIN_NAV, admin: ADMIN_NAV, manager: MANAGER_NAV, staff: STAFF_NAV, employee: EMPLOYEE_NAV };
  return map[role] || EMPLOYEE_NAV;
}

export function renderShell(pageTitle, pageSubtitle, content) {
  const user = getCurrentUser();
  if (!user) { navigate('/login'); return; }

  const whs = getWarehouses();
  const whName = user.role === 'super_admin'
    ? `${whs.length} Warehouse${whs.length !== 1 ? 's' : ''}`
    : (whs.find(w => w.id === user.warehouseId)?.name || 'No Warehouse');

  const nav = getNav(user.role);
  const currentPath = getCurrentPath();
  const notifications = getNotifications();
  const unreadCount = notifications.filter(n => !n.read).length;

  const navHTML = nav.map(section => `
    <div class="sidebar-section">
      <div class="sidebar-section-label">${section.section}</div>
      ${section.items.map(item => `
        <div class="sidebar-item ${currentPath === item.path ? 'active' : ''}" data-path="${item.path}">
          <span class="sidebar-item-icon">${item.icon}</span>
          <span>${item.label}</span>
        </div>
      `).join('')}
    </div>
  `).join('');

  const breadcrumb = pageTitle
    ? `<span class="breadcrumb-item">WareOps</span><span class="breadcrumb-sep">›</span><span class="breadcrumb-item current">${pageTitle}</span>`
    : `<span class="breadcrumb-item current">WareOps ERP</span>`;

  const stockHealth = getStockHealth(user.role === 'super_admin' ? null : user.warehouseId);
  const healthColor = stockHealth > 80 ? 'var(--accent-emerald)' : stockHealth > 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';

  const sidebarWidget = `
    <div class="sidebar-widget">
      <div class="widget-label">Inventory Health</div>
      <div class="health-bar"><div class="health-bar-fill" style="width:${stockHealth}%; background:${healthColor}"></div></div>
      <div class="health-val">
        <span>Stock Status</span>
        <span style="color:${healthColor}">${stockHealth}%</span>
      </div>
    </div>
  `;

  document.getElementById('app').innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <div style="display:flex;align-items:center;gap:var(--space-3);flex:1">
            <div class="sidebar-logo-icon">⚡</div>
            <div class="sidebar-logo-text">
              <div class="sidebar-logo-name">WareOps</div>
              <div class="sidebar-logo-tagline">Enterprise ERP</div>
            </div>
          </div>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav">${navHTML}</nav>
        ${sidebarWidget}
        <div class="sidebar-footer">
          <div class="sidebar-user" id="user-menu-btn">
            <div class="sidebar-user-avatar">${user.avatar}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">${user.name}</div>
              <div class="sidebar-user-role">${capitalize(user.role)} · ${whName}</div>
            </div>
          </div>
        </div>
      </aside>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <main class="main-content">
        <header class="topbar">
          <button class="topbar-menu-btn" id="topbar-menu-btn">☰</button>
          <div class="topbar-breadcrumb">${breadcrumb}</div>
          <div class="topbar-actions">
            <div class="topbar-search" id="cmd-palette-btn" style="cursor:pointer" title="Search Everything (Ctrl+K)">
              <span style="color:var(--text-muted);font-size:14px">🔍</span>
              <input type="text" placeholder="Search (Ctrl+K)" id="global-search" readonly style="cursor:pointer" />
            </div>
            <div class="icon-btn notif-btn" id="notif-btn" data-tooltip="Notifications" style="position:relative">
              🔔
              ${unreadCount > 0 ? `<span class="badge" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;background:var(--accent-rose);border-radius:50%;font-size:10px;font-weight:700;color:white;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg-base)">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
            </div>
            <div class="icon-btn" data-tooltip="Profile" id="profile-btn">${user.avatar}</div>
          </div>
        </header>
        <div class="page-content" id="page-content">
          ${content || ''}
        </div>
      </main>
    </div>
    <div id="modal-root"></div>
    <div class="toast-container" id="toast-container"></div>
  `;

  // Sidebar navigation
  document.querySelectorAll('.sidebar-item[data-path]').forEach(item => {
    item.addEventListener('click', () => {
      navigate(item.dataset.path);
      closeSidebar();
    });
  });

  // Mobile sidebar toggle
  document.getElementById('topbar-menu-btn')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);
  document.getElementById('sidebar-close-btn')?.addEventListener('click', closeSidebar);

  // Notification bell
  document.getElementById('notif-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showNotificationDropdown(e.currentTarget);
  });

  // Profile dropdown
  document.getElementById('profile-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showProfileDropdown(e.currentTarget);
  });

  document.getElementById('user-menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showProfileDropdown(e.currentTarget);
  });

  // Command Palette
  initPalette();
  document.getElementById('cmd-palette-btn')?.addEventListener('click', togglePalette);
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar?.classList.toggle('open');
  overlay?.classList.toggle('visible');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar?.classList.remove('open');
  overlay?.classList.remove('visible');
}

function showNotificationDropdown(anchor) {
  const existing = document.getElementById('notif-dropdown');
  if (existing) { existing.remove(); return; }

  const notifications = getNotifications();
  const unread = notifications.filter(n => !n.read);

  const dropdown = document.createElement('div');
  dropdown.id = 'notif-dropdown';
  dropdown.style.cssText = 'width:340px;background:var(--bg-card);border:1px solid var(--border-default);border-radius:12px;box-shadow:var(--shadow-xl);overflow:hidden;';
  
  positionFixedElement(anchor, dropdown, { offset: 8, preferredAlign: 'right' });

  const typeIcons = { warehouse_create:'🏭', bill_create:'🧾', user_create:'👤', login:'🔐', settings_update:'⚙️', default:'🔔' };

  dropdown.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between">
      <div style="font-weight:700;font-size:14px;color:var(--text-primary)">🔔 Notifications</div>
      <div style="display:flex;gap:12px;align-items:center">
        ${unread.length > 0 ? `<button id="mark-all-read" style="font-size:12px;color:var(--text-brand);background:none;border:none;cursor:pointer;font-family:var(--font-sans)">Mark all read</button>` : '<span style="font-size:12px;color:var(--text-muted)">All caught up</span>'}
        ${notifications.length > 0 ? `<button id="clear-all-notif" style="font-size:12px;color:var(--accent-rose);background:none;border:none;cursor:pointer;font-family:var(--font-sans)">Clear all</button>` : ''}
      </div>
    </div>
    <div style="max-height:360px;overflow-y:auto">
      ${notifications.length === 0 ? `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">No notifications yet</div>` :
        notifications.slice(0,10).map(n => `
          <div class="notif-item" data-nid="${n.id}" data-link="${n.link||'/dashboard'}" style="padding:12px 16px;border-bottom:1px solid var(--border-subtle);cursor:pointer;background:${n.read ? 'transparent' : 'rgba(99,102,241,0.06)'};transition:background 0.15s;display:flex;gap:12px;align-items:flex-start">
            <div style="font-size:18px;flex-shrink:0;margin-top:2px">${typeIcons[n.type]||typeIcons.default}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:${n.read?'500':'700'};color:var(--text-primary);margin-bottom:2px">${n.title}</div>
              <div style="font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n.message}</div>
              <div style="font-size:11px;color:var(--text-disabled);margin-top:4px">${timeSince(n.timestamp)}</div>
            </div>
            ${!n.read ? `<div style="width:8px;height:8px;border-radius:50%;background:var(--text-brand);flex-shrink:0;margin-top:4px"></div>` : ''}
          </div>
        `).join('')}
    </div>
  `;

  document.body.appendChild(dropdown);

  dropdown.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('mouseenter', () => item.style.background = 'rgba(99,102,241,0.1)');
    item.addEventListener('mouseleave', () => item.style.background = item.dataset.read ? 'transparent' : 'rgba(99,102,241,0.06)');
    item.addEventListener('click', () => {
      markNotificationRead(item.dataset.nid);
      dropdown.remove();
      navigate(item.dataset.link);
    });
  });

  dropdown.querySelector('#mark-all-read')?.addEventListener('click', (e) => {
    e.stopPropagation();
    markAllNotificationsRead();
    dropdown.remove();
    navigate(getCurrentPath());
  });

  dropdown.querySelector('#clear-all-notif')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearNotifications();
    dropdown.remove();
    navigate(getCurrentPath());
  });

  setTimeout(() => document.addEventListener('click', () => dropdown.remove(), { once: true }), 50);
}

function timeSince(iso) {
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return Math.floor(secs/60) + 'm ago';
  if (secs < 86400) return Math.floor(secs/3600) + 'h ago';
  return Math.floor(secs/86400) + 'd ago';
}

function showProfileDropdown(anchor) {
  const existing = document.getElementById('profile-dropdown');
  if (existing) { existing.remove(); return; }
  const user = getCurrentUser();
  const sub = getSubscription();
  const planLabel = sub.plan === 'starter' ? '🟢 Starter' : '🟣 Enterprise';

  const dropdown = document.createElement('div');
  dropdown.id = 'profile-dropdown';
  dropdown.className = 'dropdown-menu animate-scaleUp';
  dropdown.style.cssText = 'position:absolute;top:calc(100% + 8px);right:0;min-width:220px;z-index:var(--z-dropdown);';
  
  anchor.style.position = 'relative';
  anchor.appendChild(dropdown);

  dropdown.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border-subtle)">
      <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${user.name}</div>
      <div style="font-size:12px;color:var(--text-muted)">${user.email}</div>
      <div style="font-size:11px;color:var(--text-brand);margin-top:4px;font-weight:600">${planLabel} Plan</div>
    </div>
    <div id="dd-settings" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">⚙️ Settings</div>
    ${user.role === 'super_admin' ? `<div id="dd-subscription" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">💳 Subscription</div>` : ''}
    <div style="height:1px;background:var(--border-subtle);margin:4px 0"></div>
    <div id="dd-logout" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--accent-rose);display:flex;align-items:center;gap:8px">🚪 Sign Out</div>
  `;

  dropdown.querySelectorAll('.dropdown-item').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = 'rgba(99,102,241,0.08)');
    el.addEventListener('mouseleave', () => el.style.background = 'transparent');
  });

  setTimeout(() => document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) dropdown.remove();
  }, { once: true }), 50);
  
  dropdown.querySelector('#dd-logout')?.addEventListener('click', () => { logout(); navigate('/login'); });
  dropdown.querySelector('#dd-settings')?.addEventListener('click', () => { navigate('/settings'); dropdown.remove(); });
  dropdown.querySelector('#dd-subscription')?.addEventListener('click', () => { navigate('/subscription'); dropdown.remove(); });
}

export function setPageContent(html) {
  const pc = document.getElementById('page-content');
  if (pc) { pc.innerHTML = html; pc.classList.add('page-enter'); }
}

export function getPageContent() {
  return document.getElementById('page-content');
}
