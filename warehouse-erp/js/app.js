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
import { getCurrentUser, getWarehouses, getStore, seedDemoData, getActiveCurrency } from './modules/store.js';

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

// Route handler map
const routes = {
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
};

// Expose printBill globally for inline onclick handlers
window.printBill = printBill;

function getActivePath() {
  const hash = window.location.hash.slice(1);
  return hash.split('?')[0] || '';
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
    const publicRoutes = ['/login', '/signup', '/privacy', '/terms'];
    const redirectIfLoggedIn = ['/login', '/signup'];

    // Not logged in
    if (!user) {
      if (!publicRoutes.includes(path)) {
        if (path === '' || path === '/') {
          window.location.href = 'landing.html';
          return;
        }
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
      // Seeding demo data disabled for pristine zero-data vanilla reset

    }

    const handler = routes[path];
    if (handler) {
      handler();
    } else if (path && path.startsWith('/warehouses/')) {
      // Warehouse detail: /warehouses/:id
      const whId = path.replace('/warehouses/', '');
      renderWarehouseDetail(whId);
    } else if (path && path !== '') {
      safeNavigate(user ? '/dashboard' : '/login');
    } else {
      if (!user) {
        window.location.href = 'landing.html';
      } else {
        safeNavigate('/dashboard');
      }
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
        <div style="font-size:64px;margin-bottom:24px">⚠️</div>
        <h1 style="font-size:24px;font-weight:800;margin-bottom:12px">Application Startup Error</h1>
        <p style="color:#94a3b8;font-size:14px;margin-bottom:16px;line-height:1.6">${err?.message || 'An unexpected error occurred during initialization.'}</p>
        <div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:12px;margin-bottom:24px;text-align:left;overflow-x:auto">
          <code style="color:#f43f5e;font-size:11px;font-family:monospace;white-space:pre">${err?.stack || 'No stack trace available'}</code>
        </div>
        <div style="display:flex;gap:12px;justify-content:center">
          <button class="btn btn-primary" onclick="window.location.reload()" style="background:#6366f1;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600">Retry Loading</button>
          <button class="btn btn-ghost" onclick="window.location.href='landing.html'" style="background:transparent;color:#f8fafc;border:1px solid rgba(255,255,255,0.1);padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600">Back to Home</button>
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

    const currentPath = getActivePath();
    const user = getCurrentUser();

    // Prioritize full synchronization before routing to prevent race conditions on page load/refresh
    if (user && localStorage.getItem('access_token')) {
      try {
        const { syncWithBackend } = await import('./modules/store.js');
        await syncWithBackend();
      } catch (syncErr) {
        console.warn('[WareOps] Initial background sync failed:', syncErr);
      }
    }

    if (!currentPath) {
      if (!user) {
        window.location.href = 'landing.html';
      } else {
        safeNavigate('/dashboard');
        // If we just changed the hash, resolveRoute will be called by hashchange
        // But if we didn't (rare), we call it manually
        if (getActivePath() === '/dashboard') resolveRoute();
      }
    } else {
      resolveRoute();
    }
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

