// Handle unhandled promise rejections and global errors for visible debugging
window.addEventListener('error', (event) => {
  console.error('[WareOps] Global Error:', event.error);
  if (!document.getElementById('app')?.innerHTML) {
    renderErrorPage(event.error || new Error(event.message));
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[WareOps] Unhandled Rejection:', event.reason);
  if (!document.getElementById('app')?.innerHTML) {
    renderErrorPage(new Error(event.reason || 'Unhandled Async Error'));
  }
});

// Modules
import { getCurrentUser, getWarehouses, getStore, seedDemoData, getActiveCurrency, syncWithBackend } from './modules/store.js';
import { getSvgIcon, applyTheme } from './modules/ui.js';
import { canDo } from './modules/permissions.js';

// Pages
import { renderLogin, renderSignup, renderWarehouseRegistration } from './pages/auth.js';
import { renderPrivacy, renderTerms } from './pages/legal.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderWarehouses } from './pages/warehouses.js';
import { renderWorkforce } from './pages/workforce.js';
import { renderItems } from './pages/items.js';
import { renderTables } from './pages/tables.js';
import { renderBilling, printBill } from './pages/billing.js';
import { renderAnalytics } from './pages/analytics.js';
import { renderAudit } from './pages/audit.js';
import { renderSettings } from './pages/settings.js';
import { renderSubscription } from './pages/subscription.js';
import { renderWarehouseDetail } from './pages/warehouses.js';
import { renderLanding } from './pages/landing.js';
import { renderRegistry } from './pages/registry.js';
import { renderCustomers } from './pages/customers.js';
import { renderRoles } from './pages/roles.js';

// Route handler map
const routes = {
  '/': renderLanding,
  '/login': renderLogin,
  '/signup': renderSignup,
  '/register-warehouse': renderWarehouseRegistration,
  '/dashboard': renderDashboard,
  '/warehouses': renderWarehouses,
  '/workforce': renderWorkforce,
  '/items': renderItems,
  '/tables': renderTables,
  '/billing': renderBilling,
  '/analytics': renderAnalytics,
  '/audit': renderAudit,
  '/settings': renderSettings,
  '/subscription': renderSubscription,
  '/privacy': renderPrivacy,
  '/terms': renderTerms,
  '/registry': renderRegistry,
  '/customers': renderCustomers,
  '/roles': renderRoles,
};

// Expose printBill globally for inline onclick handlers
window.printBill = printBill;

function getActivePath() {
  const hash = window.location.hash.slice(1);
  return hash.split('?')[0] || '/';
}

let _lastResolvedPath = null;

function safeNavigate(path) {
  const currentPath = getActivePath();
  if (currentPath === path) return;
  window.location.hash = '#' + path;
}

function cleanupGlobalUI() {
  document.getElementById('profile-dropdown')?.remove();
  document.getElementById('notif-dropdown')?.remove();
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
}

function resolveRoute() {
  cleanupGlobalUI();
  const appEl = document.getElementById('app');
  if (!appEl) return;

  const path = getActivePath();
  // Prevent redundant renders if the path hasn't changed
  if (_lastResolvedPath === path && appEl.innerHTML !== '') return;
  _lastResolvedPath = path;

  try {
    const path = getActivePath();
    const user = getCurrentUser();
    const publicRoutes = ['/', '/login', '/signup', '/privacy', '/terms'];
    const redirectIfLoggedIn = ['/', '/login', '/signup'];

    // Not logged in
    if (!user) {
      if (!publicRoutes.includes(path)) {
        safeNavigate('/login');
        return;
      }
    } else {
      // Logged in user — check if super admin needs a warehouse
      const whs = getWarehouses();
      if (user.role === 'super_admin' && whs.length === 0 && path !== '/register-warehouse') {
        safeNavigate('/register-warehouse');
        return;
      }
      // Redirect away from certain public routes if already logged in
      if (redirectIfLoggedIn.includes(path)) {
        safeNavigate('/dashboard');
        return;
      }

      // Granular Page Access Guard check
      const routeModuleMap = {
        '/dashboard': 'dashboard',
        '/warehouses': 'warehouses',
        '/workforce': 'workforce',
        '/items': 'inventory',
        '/tables': 'tables',
        '/billing': 'billing',
        '/analytics': 'reports',
        '/audit': 'audit',
        '/settings': 'settings',
        '/customers': 'crm',
      };

      if (['/registry', '/roles', '/subscription'].includes(path) && user.role !== 'super_admin') {
        safeNavigate('/dashboard');
        return;
      }

      if (routeModuleMap[path] && !canDo(routeModuleMap[path], 'view', user)) {
        safeNavigate('/dashboard');
        return;
      }
    }

    const handler = routes[path];
    if (handler) {
      handler();
    } else if (path && path.startsWith('/warehouses/')) {
      // Warehouse detail: /warehouses/:id
      const whId = path.replace('/warehouses/', '');
      renderWarehouseDetail(whId);
    } else {
      safeNavigate(user ? '/dashboard' : '/');
    }
  } catch (err) {
    console.error('[WareOps] Route resolution crash:', err);
    renderErrorPage(err);
  }
}

function renderErrorPage(err) {
  const appEl = document.getElementById('app');
  if (!appEl) return;
  
  appEl.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0f1029;color:#f8fafc;font-family:sans-serif">
      <div style="text-align:center;max-width:480px;background:rgba(255,255,255,0.03);padding:40px;border-radius:24px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 20px 50px rgba(0,0,0,0.3)">
        <div style="margin-bottom:24px;color:#f43f5e;display:flex;justify-content:center">${getSvgIcon('warning', 64)}</div>
        <h1 style="font-size:24px;font-weight:800;margin-bottom:12px">Application Startup Error</h1>
        <p style="color:#94a3b8;font-size:14px;margin-bottom:16px;line-height:1.6">${err?.message || 'An unexpected error occurred during initialization.'}</p>
        <div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:12px;margin-bottom:24px;text-align:left;overflow-x:auto">
          <code style="color:#f43f5e;font-size:11px;font-family:monospace;white-space:pre">${err?.stack || 'No stack trace available'}</code>
        </div>
        <div style="display:flex;gap:12px;justify-content:center">
          <button class="btn btn-primary" onclick="window.location.reload()" style="background:#6366f1;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600">Retry Loading</button>
          <button class="btn btn-ghost" onclick="window.location.hash='#/'" style="background:transparent;color:#f8fafc;border:1px solid rgba(255,255,255,0.1);padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600">Back to Home</button>
        </div>
      </div>
    </div>
  `;
}

// Handle hash changes
window.addEventListener('hashchange', resolveRoute);

// Force SPA UI re-render when store and backend synchronize successfully
window.addEventListener('wareops_storage_sync', () => {
  _lastResolvedPath = null;
  resolveRoute();
});

// Initialize app when DOM is ready
async function init() {
  try {
    // Bind active currency dynamically for formatting sync
    window.wareops_currency = getActiveCurrency();

    // Apply active global theme — first from localStorage for instant load (no flash),
    // then confirm from store (handles fresh logins / resets)
    const cachedTheme = localStorage.getItem('wareops_theme') || 'enterprise';
    applyTheme(cachedTheme);
    const storeTheme = getStore().theme;
    if (storeTheme && storeTheme !== cachedTheme) applyTheme(storeTheme);


    const user = getCurrentUser();

    // Prioritize full synchronization before routing to prevent race conditions on page load/refresh
    if (user && localStorage.getItem('access_token')) {
      try {
        await syncWithBackend();
      } catch (syncErr) {
        console.warn('[WareOps] Initial background sync failed:', syncErr);
      }
    }

    resolveRoute();
  } catch (err) {
    console.error('[WareOps] Critical initialization failure:', err);
    renderErrorPage(err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

