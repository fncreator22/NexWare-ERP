/**
 * App Shell — Sidebar + Topbar + Main layout (v3 — Dynamic Nav)
 */
import { getCurrentUser, logout, getWarehouses, getNotifications, markNotificationRead, markAllNotificationsRead, clearNotifications, getSubscription, getStockHealth } from '../modules/store.js';
import { navigate, getCurrentPath } from '../modules/router.js';
import { capitalize, positionFixedElement, getSvgIcon, timeSince, renderAvatar, renderAvatarContainer } from '../modules/ui.js';
import { initPalette, togglePalette } from './palette.js';
import { getDynamicNav } from '../modules/permissions.js';


// Navigation is now dynamically generated from permissions — see js/modules/permissions.js


export function renderShell(pageTitle, pageSubtitle, content) {
  const user = getCurrentUser();
  if (!user) { navigate('/login'); return; }

  const whs = getWarehouses();
  const whCount = user.role === 'super_admin' ? whs.length : (user.warehouseId ? 1 : 0);
  const whName = user.role === 'super_admin'
    ? `${whCount} Warehouse${whCount !== 1 ? 's' : ''}`
    : (whs.find(w => w.id === user.warehouseId)?.name || 'No Warehouse');
  const whAccessText = `${whCount} Warehouse${whCount !== 1 ? 's' : ''}`;

  const nav = getDynamicNav(user);
  const currentPath = getCurrentPath();
  const notifications = getNotifications();
  const unreadCount = notifications.filter(n => !n.read).length;

  const isCollapsed = localStorage.getItem('wareops_sidebar_collapsed') === 'true';

  const navHTML = nav.map(section => `
    <div class="sidebar-section">
      <div class="sidebar-section-label">${section.section}</div>
      ${section.items.map(item => `
        <div class="sidebar-item ${currentPath === item.path ? 'active' : ''}" data-path="${item.path}" data-tooltip="${item.label}">
          <span class="sidebar-item-icon">${getSvgIcon(item.icon)}</span>
          <span class="sidebar-item-label">${item.label}</span>
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
    <div class="app-shell ${isCollapsed ? 'collapsed' : ''}">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo" style="cursor:pointer" onclick="location.hash='#/dashboard'">
          <div class="sidebar-logo-icon" style="color:var(--brand-500);display:flex;align-items:center;justify-content:center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
          <div class="sidebar-logo-text-wrapper">
            <div class="sidebar-logo-name">WareOps</div>
            <div class="sidebar-logo-tagline">Enterprise ERP</div>
          </div>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav">${navHTML}</nav>
        ${sidebarWidget}
        <div class="sidebar-footer">
          <div class="sidebar-user" id="user-menu-btn" data-tooltip="${user.name} (${capitalize(user.role)})">
            <div class="sidebar-user-avatar">${renderAvatarContainer(user.avatar, user.name, 36)}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">${user.name}</div>
              <div class="sidebar-user-role" style="font-size:11px;color:var(--text-muted);font-weight:500;">${capitalize(user.role.replace('_', ' '))} · ${whAccessText}</div>
            </div>
          </div>
        </div>
      </aside>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <main class="main-content">
        <header class="topbar">
          <button class="topbar-collapse-btn" id="topbar-collapse-btn" data-tooltip="${isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}">
            ${getSvgIcon(isCollapsed ? 'panel_left_open' : 'panel_left_close', 20)}
          </button>
          <div class="topbar-breadcrumb">${breadcrumb}</div>
          <div class="topbar-actions">
            <div class="topbar-search-wrapper" id="topbar-search-wrapper" style="position:relative">
              <span class="topbar-search-icon">${getSvgIcon('search', 14)}</span>
              <input type="text" id="global-search" class="topbar-search-input"
                placeholder="Search inventory, invoices..." style="cursor:text" />
              <span class="topbar-search-kb-hint">⌘K</span>
              <div id="global-search-results" style="display:none;position:absolute;top:100%;left:0;right:0;margin-top:8px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:var(--radius-md);box-shadow:var(--shadow-xl);z-index:var(--z-dropdown);max-height:320px;overflow-y:auto;padding:6px;"></div>
            </div>
            <div class="icon-btn notif-btn" id="notif-btn" data-tooltip="Notifications" style="position:relative">
              ${getSvgIcon('bell', 18)}
              ${unreadCount > 0 ? `<span class="badge" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;background:var(--accent-rose);border-radius:50%;font-size:10px;font-weight:700;color:white;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg-base)">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
            </div>
            <div class="icon-btn" data-tooltip="Profile" id="profile-btn" style="overflow:hidden;padding:0;">${renderAvatarContainer(user.avatar, user.name, 34)}</div>
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

  // Collapsible sidebar toggle
  document.getElementById('topbar-collapse-btn')?.addEventListener('click', (e) => {
    const shell = document.querySelector('.app-shell');
    if (shell) {
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        toggleSidebar();
      } else {
        shell.classList.toggle('collapsed');
        const collapsed = shell.classList.contains('collapsed');
        localStorage.setItem('wareops_sidebar_collapsed', collapsed);
        const btn = e.currentTarget;
        btn.innerHTML = getSvgIcon(collapsed ? 'panel_left_open' : 'panel_left_close', 20);
        btn.dataset.tooltip = collapsed ? 'Expand Sidebar' : 'Collapse Sidebar';
      }
    }
  });

  // Mobile sidebar overlay close
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

  // Topbar Direct Search Logic
  const searchInput = document.getElementById('global-search');
  const searchResults = document.getElementById('global-search-results');

  if (searchInput && searchResults) {
    searchInput.addEventListener('focus', () => {
      showSearchResults(searchInput.value);
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
      }
    });

    searchInput.addEventListener('input', (e) => {
      showSearchResults(e.target.value);
    });
    
    // Keyboard listener to focus on search
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  function showSearchResults(val) {
    const query = val.toLowerCase().trim();
    if (!query) {
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
      return;
    }

    const s = getStore();
    const matches = [];

    // Search Warehouses
    if (s.warehouses) {
      s.warehouses.forEach(w => {
        if (w.name.toLowerCase().includes(query) || (w.location && w.location.toLowerCase().includes(query))) {
          matches.push({
            type: 'warehouse',
            title: w.name,
            subtitle: w.location || 'Warehouse Hub',
            path: `#/warehouses`
          });
        }
      });
    }

    // Search Items (Inventory)
    if (s.items) {
      s.items.forEach(i => {
        if (i.name.toLowerCase().includes(query) || (i.sku && i.sku.toLowerCase().includes(query))) {
          matches.push({
            type: 'item',
            title: i.name,
            subtitle: `SKU: ${i.sku || 'N/A'} · Stock: ${i.stock || 0}`,
            path: `#/items`
          });
        }
      });
    }

    // Search Bills (Invoices)
    if (s.bills) {
      s.bills.forEach(b => {
        const num = b.billNumber || '';
        const client = b.customerName || '';
        if (num.toLowerCase().includes(query) || client.toLowerCase().includes(query)) {
          matches.push({
            type: 'bill',
            title: num || 'Invoice',
            subtitle: `Client: ${client} · Total: $${(b.total || 0).toFixed(2)}`,
            path: `#/billing`
          });
        }
      });
    }

    // Search Workforce
    if (s.users) {
      s.users.forEach(u => {
        if (u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)) {
          matches.push({
            type: 'user',
            title: u.name,
            subtitle: `Email: ${u.email} · Role: ${u.role}`,
            path: `#/workforce`
          });
        }
      });
    }

    if (matches.length === 0) {
      searchResults.innerHTML = `<div style="padding:12px;text-align:center;font-size:12px;color:var(--text-muted)">No matches found for "${val}"</div>`;
      searchResults.style.display = 'block';
      return;
    }

    const typeLabels = { item: 'Inventory', bill: 'Invoice', warehouse: 'Warehouse', user: 'Workforce' };
    const typeIcons = { item: 'items', bill: 'billing', warehouse: 'warehouses', user: 'user' };

    searchResults.innerHTML = matches.slice(0, 8).map((m, idx) => `
      <div class="search-result-item" data-path="${m.path}" data-index="${idx}"
        style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--radius-sm);cursor:pointer;transition:all 0.15s;margin-bottom:2px">
        <span style="color:var(--text-muted);display:flex;align-items:center">${getSvgIcon(typeIcons[m.type], 14)}</span>
        <div style="flex:1;min-width:0;text-align:left">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.title}</div>
          <div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.subtitle}</div>
        </div>
        <span class="badge badge-muted" style="font-size:9px;padding:2px 6px;text-transform:uppercase">${typeLabels[m.type]}</span>
      </div>
    `).join('');

    // Attach click/hover events
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--bg-card-hover)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
      item.addEventListener('click', () => {
        const path = item.dataset.path;
        navigate(path);
        searchInput.value = '';
        searchResults.style.display = 'none';
      });
    });

    searchResults.style.display = 'block';
  }

  // Command Palette
  initPalette();

  // Intelligent JS tooltips system initialization
  initGlobalTooltips();
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

  const typeIconNames = { warehouse_create:'warehouses', bill_create:'billing', user_create:'user', login:'lock', settings_update:'settings', default:'bell' };

  dropdown.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between">
      <div style="font-weight:700;font-size:14px;color:var(--text-primary);display:flex;align-items:center;gap:6px">${getSvgIcon('bell', 16)} Notifications</div>
      <div style="display:flex;gap:12px;align-items:center">
        ${unread.length > 0 ? `<button id="mark-all-read" style="font-size:12px;color:var(--text-brand);background:none;border:none;cursor:pointer;font-family:var(--font-sans)">Mark all read</button>` : '<span style="font-size:12px;color:var(--text-muted)">All caught up</span>'}
        ${notifications.length > 0 ? `<button id="clear-all-notif" style="font-size:12px;color:var(--accent-rose);background:none;border:none;cursor:pointer;font-family:var(--font-sans)">Clear all</button>` : ''}
      </div>
    </div>
    <div style="max-height:360px;overflow-y:auto">
      ${notifications.length === 0 ? `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">No notifications yet</div>` :
        notifications.slice(0,10).map(n => `
          <div class="notif-item" data-nid="${n.id}" data-link="${n.link||'/dashboard'}" style="padding:12px 16px;border-bottom:1px solid var(--border-subtle);cursor:pointer;background:${n.read ? 'transparent' : 'rgba(99,102,241,0.06)'};transition:background 0.15s;display:flex;gap:12px;align-items:flex-start">
            <div style="display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0;margin-top:2px">${getSvgIcon(typeIconNames[n.type]||typeIconNames.default, 16)}</div>
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

function showProfileDropdown(anchor) {
  const existing = document.getElementById('profile-dropdown');
  if (existing) { existing.remove(); return; }
  const user = getCurrentUser();
  const sub = getSubscription();
  const planBadge = sub.plan === 'starter' 
    ? '<span class="badge badge-info" style="font-size:10px;padding:2px 6px">Starter</span>' 
    : '<span class="badge badge-brand" style="font-size:10px;padding:2px 6px">Enterprise</span>';

  const dropdown = document.createElement('div');
  dropdown.id = 'profile-dropdown';
  dropdown.className = 'dropdown-menu animate-scaleUp';
  dropdown.style.cssText = 'min-width:220px;';
  
  const isSidebar = anchor.id === 'user-menu-btn';
  
  if (isSidebar) {
    // Append to body FIRST so we can measure its rendered height
    document.body.appendChild(dropdown);
    // Force layout calculation
    dropdown.getBoundingClientRect();
    
    const rect = anchor.getBoundingClientRect();
    const elRect = dropdown.getBoundingClientRect();
    const winH = window.innerHeight;
    const winW = window.innerWidth;
    
    // Position outside sidebar (to the right of the sidebar)
    let left = rect.right + 8;
    // Default: open upward so bottom of popup aligns to bottom of anchor
    let top = rect.bottom - elRect.height;
    
    // Clamp vertically within viewport
    if (top < 8) top = 8;
    if (top + elRect.height > winH - 8) top = winH - elRect.height - 8;
    // Clamp horizontally (if collapsed sidebar is very narrow)
    if (left + elRect.width > winW - 8) left = winW - elRect.width - 8;
    
    dropdown.style.position = 'fixed';
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
    dropdown.style.right = 'auto';
    dropdown.style.zIndex = '9999';
  } else {
    positionFixedElement(anchor, dropdown, {
      offset: 8,
      preferredAlign: 'right',
      preferredVertical: 'bottom'
    });
  }

  dropdown.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border-subtle)">
      <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${user.name}</div>
      <div style="font-size:12px;color:var(--text-muted)">${user.email}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:var(--text-muted)">Plan: ${planBadge}</div>
    </div>
    <div id="dd-settings" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">${getSvgIcon('settings', 14)} Settings</div>
    ${user.role === 'super_admin' ? `<div id="dd-subscription" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">${getSvgIcon('subscription', 14)} Subscription</div>` : ''}
    <div style="height:1px;background:var(--border-subtle);margin:4px 0"></div>
    <div id="dd-logout" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--accent-rose);display:flex;align-items:center;gap:8px">${getSvgIcon('logout', 14)} Sign Out</div>
  `;

  document.body.appendChild(dropdown);

  dropdown.querySelectorAll('.dropdown-item').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = 'rgba(99,102,241,0.08)');
    el.addEventListener('mouseleave', () => el.style.background = 'transparent');
  });

  setTimeout(() => document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) dropdown.remove();
  }, { once: true }), 50);
  
  dropdown.querySelector('#dd-logout')?.addEventListener('click', async () => { dropdown.remove(); await logout(); navigate('/login'); });
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

// ---- DYNAMIC JS TOOLTIPS ENGINE ----
let tooltipsInitialized = false;

function initGlobalTooltips() {
  if (tooltipsInitialized) return;
  tooltipsInitialized = true;

  document.addEventListener('mouseenter', (e) => {
    const trigger = e.target.closest?.('[data-tooltip]');
    if (!trigger) return;

    // Avoid redundant or duplicate tooltips for sidebar elements when expanded
    if (trigger.classList.contains('sidebar-item') || trigger.classList.contains('sidebar-user')) {
      const isCollapsed = document.querySelector('.app-shell')?.classList.contains('collapsed');
      if (!isCollapsed) return;
    }

    // Do not show tooltip if the dropdown is already active
    if (trigger.id === 'notif-btn' && document.getElementById('notif-dropdown')) return;
    if ((trigger.id === 'profile-btn' || trigger.id === 'user-menu-btn') && document.getElementById('profile-dropdown')) return;

    const text = trigger.getAttribute('data-tooltip');
    if (!text) return;

    // Cache original text and temporarily strip attribute to prevent CSS tooltip double-renders
    trigger.dataset.tooltipVal = text;
    trigger.removeAttribute('data-tooltip');

    const tooltip = document.createElement('div');
    tooltip.className = 'js-tooltip animate-scaleUp';
    tooltip.textContent = text;
    tooltip.style.cssText = `
      position: fixed;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      padding: 6px 12px;
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--text-primary);
      box-shadow: var(--shadow-md);
      pointer-events: none;
      z-index: 10000;
      white-space: nowrap;
      transition: opacity var(--transition-fast);
      opacity: 0;
    `;

    document.body.appendChild(tooltip);

    const rect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const tW = tooltipRect.width;
    const tH = tooltipRect.height;
    const offset = 8;

    // Calculate vertical position (default to above)
    let top = rect.top - tH - offset;

    // Edge check: If top space is restricted, display below trigger
    if (top < 10) {
      top = rect.bottom + offset;
    }

    // Centered horizontal positioning
    let left = rect.left + (rect.width - tW) / 2;

    // Horizontal margins boundary clamping to prevent off-screen clipping
    if (left < 10) {
      left = 10;
    } else if (left + tW > winW - 10) {
      left = winW - tW - 10;
    }

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
    tooltip.style.opacity = '1';

    const cleanTooltip = () => {
      tooltip.style.opacity = '0';
      setTimeout(() => tooltip.remove(), 100);
      trigger.setAttribute('data-tooltip', text);
      trigger.removeEventListener('mouseleave', cleanTooltip);
      trigger.removeEventListener('click', cleanTooltip);
    };

    trigger.addEventListener('mouseleave', cleanTooltip);
    trigger.addEventListener('click', cleanTooltip);
  }, { capture: true });
}
