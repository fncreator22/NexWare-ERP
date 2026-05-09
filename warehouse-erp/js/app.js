/**
 * WareOps ERP — Main Application Entry Point
 */
import { getCurrentUser, seedDemoData, getWarehouses, getStore } from './modules/store.js';

// Global performance optimizations
if (window.Chart) {
  Chart.defaults.animation = false;
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;
}

// Global tooltip repositioning to prevent viewport overflow
document.addEventListener('mouseover', (e) => {
  const target = e.target.closest('[data-tooltip]');
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const winW = window.innerWidth;
  target.classList.remove('tooltip-left', 'tooltip-right');
  if (rect.left < 80) target.classList.add('tooltip-left');
  else if (winW - rect.right < 80) target.classList.add('tooltip-right');
});


// Pages
import { renderLogin, renderSignup, renderWarehouseRegistration } from './pages/auth.js';
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
};

// Expose printBill globally for inline onclick handlers
window.printBill = printBill;

function getActivePath() {
  const hash = window.location.hash.slice(1);
  return hash.split('?')[0] || '';
}

let _isNavigating = false;

function safeNavigate(path) {
  if (_isNavigating) return;
  _isNavigating = true;
  window.location.hash = '#' + path;
  // Reset flag after the hashchange fires
  setTimeout(() => { _isNavigating = false; }, 100);
}

function resolveRoute() {
  if (_isNavigating) return;

  const path = getActivePath();
  const user = getCurrentUser();
  const publicRoutes = ['/login', '/signup', '/register-warehouse'];

  // Not logged in
  if (!user) {
    if (!publicRoutes.includes(path)) {
      if (path === '') {
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
    // Redirect away from public routes if already logged in
    if (publicRoutes.includes(path)) {
      safeNavigate('/dashboard');
      return;
    }
    // Seed demo data if super admin has warehouses but no items
    if (user.role === 'super_admin') {
      const s = getStore();
      if (s.warehouses.length > 0 && s.items.length === 0) {
        seedDemoData();
      }
    }
  }

  const handler = routes[path];
  if (handler) {
    try {
      handler();
    } catch (err) {
      console.error('[WareOps] Route render error:', err);
      renderErrorPage(err);
    }
  } else if (path && path.startsWith('/warehouses/')) {
    // Warehouse detail: /warehouses/:id
    const whId = path.replace('/warehouses/', '');
    try { renderWarehouseDetail(whId); } catch(err) { renderErrorPage(err); }
  } else if (path && path !== '') {
    safeNavigate(user ? '/dashboard' : '/login');
  } else {
    if (!user) {
      window.location.href = 'landing.html';
    } else {
      safeNavigate('/dashboard');
    }
  }
}

function renderErrorPage(err) {
  document.getElementById('app').innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg-base)">
      <div style="text-align:center;max-width:480px">
        <div style="font-size:64px;margin-bottom:24px">💥</div>
        <h1 style="font-size:24px;font-weight:800;margin-bottom:8px;color:var(--text-primary)">Something went wrong</h1>
        <p style="color:var(--text-muted);font-size:14px;margin-bottom:8px">${err?.message || 'An unexpected error occurred'}</p>
        <p style="color:var(--text-disabled);font-size:11px;font-family:monospace;margin-bottom:24px;word-break:break-all">${err?.stack?.split('\n').slice(0,3).join('<br>') || ''}</p>
        <button class="btn btn-primary" onclick="location.hash='#/dashboard'">Go to Dashboard</button>
        <button class="btn btn-ghost" style="margin-left:8px" onclick="location.hash='#/login'">Sign Out</button>
      </div>
    </div>
  `;
}

// Handle hash changes
window.addEventListener('hashchange', resolveRoute);

// Initialize app
function init() {
  const currentPath = getActivePath();
  // If no hash, set a default and let the hashchange + resolveRoute handle it
  if (!currentPath) {
    const user = getCurrentUser();
    if (!user) {
      window.location.href = 'landing.html';
      return;
    }
    safeNavigate('/dashboard');
    setTimeout(resolveRoute, 50);
  } else {
    resolveRoute();
  }
}

init();
