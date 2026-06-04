/**
 * Command Palette — Enterprise Search (Ctrl+K)
 * Features: instant results, text highlight, search history, keyboard navigation
 */
import { getItems, getWarehouses, getCurrentUser, getBills, getStockHealth, getStore, getAllUsers } from '../modules/store.js';
import { navigate } from '../modules/router.js';
import { formatCurrency, formatNumber, getSvgIcon, capitalize } from '../modules/ui.js';

const HISTORY_KEY = 'wareops_search_history';
const MAX_HISTORY = 8;
const MAX_RESULTS = 12;

let paletteOpen = false;
let query = '';
let selectedIndex = 0;
let results = [];

// ---- Search History ----
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function addHistory(label, type) {
  const h = getHistory().filter(i => i.label !== label);
  h.unshift({ label, type, ts: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, MAX_HISTORY)));
}
function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

// ---- Text Highlight ----
function highlight(text, q) {
  if (!q || q.length < 1) return escHtml(text);
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escHtml(text).replace(
    new RegExp(`(${escaped})`, 'gi'),
    '<mark style="background:rgba(255,255,255,0.18);color:var(--text-primary);border-radius:2px;padding:0 1px;">$1</mark>'
  );
}
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Type Color Map ----
const TYPE_COLORS = {
  page:      { bg: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)' },
  action:    { bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
  item:      { bg: 'rgba(6,182,212,0.12)',   color: '#06b6d4' },
  warehouse: { bg: 'rgba(139,92,246,0.12)',  color: '#8b5cf6' },
  workforce: { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
  billing:   { bg: 'rgba(244,63,94,0.12)',   color: '#f43f5e' },
  customer:  { bg: 'rgba(99,102,241,0.12)',  color: '#818cf8' },
  table:     { bg: 'rgba(14,165,233,0.12)',  color: '#0ea5e9' },
  history:   { bg: 'rgba(113,113,122,0.12)', color: '#71717a' },
  insight:   { bg: 'transparent',            color: 'var(--text-muted)' },
};

export function initPalette() {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      togglePalette();
    }
    if (e.key === 'Escape' && paletteOpen) {
      togglePalette();
    }
  });
}

export function togglePalette() {
  paletteOpen = !paletteOpen;
  if (paletteOpen) {
    query = '';
    selectedIndex = 0;
    renderPalette();
    requestAnimationFrame(() => document.getElementById('palette-input')?.focus());
  } else {
    const overlay = document.getElementById('palette-overlay');
    if (overlay) {
      overlay.classList.add('palette-closing');
      setTimeout(() => overlay.remove(), 150);
    }
  }
}

function renderPalette() {
  // Remove existing if any
  document.getElementById('palette-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'palette-overlay';
  overlay.className = 'palette-overlay';
  overlay.innerHTML = `
    <div class="palette-container" id="palette-container">
      <div class="palette-search">
        <span class="palette-search-icon">${getSvgIcon('search', 18)}</span>
        <input type="text" id="palette-input" class="palette-input"
          placeholder="Search inventory, users, invoices, reports..."
          autocomplete="off" spellcheck="false" />
        <span class="palette-search-kb">ESC</span>
      </div>
      <div id="palette-results" class="palette-results"></div>
      <div class="palette-footer">
        <span>${getSvgIcon('chevron_down', 12)}<b style="margin-left:2px">↑↓</b> Navigate</span>
        <span>↵ Open</span>
        <span>ESC Close</span>
        <button id="palette-clear-history" style="margin-left:auto;background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer;font-family:var(--font-sans);padding:0;opacity:0.7;">Clear history</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) togglePalette();
  });

  // Clear history
  overlay.querySelector('#palette-clear-history')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearHistory();
    updateResults();
  });

  const input = overlay.querySelector('#palette-input');

  input.addEventListener('input', (e) => {
    query = e.target.value.toLowerCase().trim();
    selectedIndex = 0;
    updateResults();
  });

  input.addEventListener('keydown', (e) => {
    const navigable = results.filter(r => r.type !== 'divider' && r.type !== 'insight');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      let next = selectedIndex;
      do { next = (next + 1) % results.length; }
      while ((results[next]?.type === 'divider') && next !== selectedIndex);
      selectedIndex = next;
      renderResults();
      scrollActiveIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      let prev = selectedIndex;
      do { prev = (prev - 1 + results.length) % results.length; }
      while ((results[prev]?.type === 'divider') && prev !== selectedIndex);
      selectedIndex = prev;
      renderResults();
      scrollActiveIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[selectedIndex];
      if (r && r.type !== 'divider' && r.type !== 'insight') executeCommand(r);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      let next = selectedIndex;
      do { next = (next + 1) % results.length; }
      while ((results[next]?.type === 'divider') && next !== selectedIndex);
      selectedIndex = next;
      renderResults();
    }
  });

  updateResults();
}

function scrollActiveIntoView() {
  const activeEl = document.querySelector('.palette-item.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function updateResults() {
  const user = getCurrentUser();
  if (!user) return;

  const items    = getItems();
  const whs      = getWarehouses();
  const bills    = getBills();
  const allUsers = getAllUsers();
  const tables   = getStore().tables || [];
  const isAdmin  = ['super_admin','admin'].includes(user.role);
  const isSA     = user.role === 'super_admin';

  const matches = [];

  if (!query) {
    // ── Show search history ──
    const history = getHistory();
    if (history.length > 0) {
      matches.push({ type: 'divider', label: 'Recent Searches' });
      history.slice(0, 5).forEach(h => {
        matches.push({
          type: 'history',
          label: h.label,
          sub: capitalize(h.type || 'page'),
          icon: getSvgIcon('refresh', 14),
          _hist: h
        });
      });
    }

    // ── Quick Stats ──
    const totalRev = bills.reduce((s, b) => s + (b.total || 0), 0);
    const health   = getStockHealth();
    matches.push({ type: 'divider', label: 'Quick Insights' });
    matches.push({ type: 'insight', label: `Revenue: ${formatCurrency(totalRev)}`, sub: `Across ${whs.length} warehouse${whs.length !== 1 ? 's' : ''}`, icon: getSvgIcon('revenue', 16) });
    matches.push({ type: 'insight', label: `Inventory: ${formatNumber(items.length)} items`, sub: `Stock health: ${health}%`, icon: getSvgIcon('items', 16) });
    if (isSA) matches.push({ type: 'insight', label: `Team: ${allUsers.length} members`, sub: `Across all roles`, icon: getSvgIcon('workforce', 16) });

    // ── Suggested commands ──
    matches.push({ type: 'divider', label: 'Quick Actions' });
    matches.push({ type: 'page',   label: 'Dashboard',       path: '/dashboard', icon: getSvgIcon('dashboard', 16) });
    matches.push({ type: 'action', label: 'New Invoice',     action: 'billing',  icon: getSvgIcon('billing', 16) });
    matches.push({ type: 'page',   label: 'Inventory',       path: '/items',     icon: getSvgIcon('items', 16) });
    matches.push({ type: 'page',   label: 'Analytics',       path: '/analytics', icon: getSvgIcon('analytics', 16) });
    if (isSA) matches.push({ type: 'page', label: 'Settings', path: '/settings', icon: getSvgIcon('settings', 16) });

    results = matches.slice(0, 20);
    renderResults();
    return;
  }

  // ── NAVIGATION COMMANDS ──
  const pages = [
    { label: 'Dashboard',       path: '/dashboard', icon: getSvgIcon('dashboard', 16) },
    { label: 'Inventory',       path: '/items',     icon: getSvgIcon('items', 16) },
    { label: 'Billing',         path: '/billing',   icon: getSvgIcon('billing', 16) },
    { label: 'Analytics',       path: '/analytics', icon: getSvgIcon('analytics', 16) },
    { label: 'Tables',          path: '/tables',    icon: getSvgIcon('tables', 16) },
    { label: 'Registry Ledger', path: '/registry',  icon: getSvgIcon('audit', 16) },
    { label: 'CRM Customers',   path: '/customers', icon: getSvgIcon('customer', 16) },
  ];
  if (isAdmin) {
    pages.push({ label: 'Workforce',    path: '/workforce', icon: getSvgIcon('workforce', 16) });
    pages.push({ label: 'Warehouses',   path: '/warehouses', icon: getSvgIcon('warehouses', 16) });
    pages.push({ label: 'Audit Logs',   path: '/audit',     icon: getSvgIcon('audit', 16) });
    pages.push({ label: 'Settings',     path: '/settings',  icon: getSvgIcon('settings', 16) });
  }
  pages.forEach(p => {
    if (p.label.toLowerCase().includes(query)) matches.push({ type: 'page', ...p });
  });

  // ── INVENTORY ──
  const itemMatches = items.filter(i =>
    (i.name || '').toLowerCase().includes(query) ||
    (i.sku  || '').toLowerCase().includes(query) ||
    (i.category || '').toLowerCase().includes(query)
  ).slice(0, 4);
  itemMatches.forEach(i => matches.push({
    type: 'item',
    label: i.name,
    sub: `SKU: ${i.sku || '—'} · ${formatCurrency(i.price)} · Stock: ${i.stock || 0}`,
    id: i.id,
    icon: getSvgIcon('items', 16)
  }));

  // ── WAREHOUSES ──
  if (isSA) {
    whs.filter(w => (w.name || '').toLowerCase().includes(query) || (w.address || '').toLowerCase().includes(query))
      .slice(0, 3)
      .forEach(w => matches.push({
        type: 'warehouse', label: w.name, sub: w.address, id: w.id, icon: getSvgIcon('warehouses', 16)
      }));
  }

  // ── WORKFORCE ──
  if (isAdmin) {
    allUsers.filter(u =>
      (u.name  || '').toLowerCase().includes(query) ||
      (u.email || '').toLowerCase().includes(query)
    ).slice(0, 3).forEach(u => matches.push({
      type: 'workforce',
      label: u.name,
      sub: `${capitalize((u.role || '').replace('_', ' '))} · ${u.email}`,
      id: u.id,
      icon: getSvgIcon('workforce', 16)
    }));
  }

  // ── BILLING ──
  bills.filter(b =>
    (b.billNo   || '').toLowerCase().includes(query) ||
    (b.customer || '').toLowerCase().includes(query)
  ).slice(0, 3).forEach(b => matches.push({
    type: 'billing',
    label: b.billNo,
    sub: `${b.customer} · ${formatCurrency(b.total)}`,
    id: b.id,
    icon: getSvgIcon('billing', 16)
  }));

  // ── CUSTOMERS ──
  const seenC = new Set();
  bills.forEach(b => {
    if (b.customer && !seenC.has(b.customer.toLowerCase())) {
      seenC.add(b.customer.toLowerCase());
      if (b.customer.toLowerCase().includes(query) || (b.customerEmail || '').toLowerCase().includes(query)) {
        matches.push({
          type: 'customer',
          label: b.customer,
          sub: `CRM · ${b.customerEmail || 'No email'} · ${b.customerPhone || ''}`,
          id: b.customer,
          icon: getSvgIcon('customer', 16)
        });
      }
    }
  });

  // ── TABLES ──
  tables.filter(t => (t.displayName || t.name || '').toLowerCase().includes(query))
    .slice(0, 2)
    .forEach(t => matches.push({
      type: 'table',
      label: t.displayName || t.name,
      sub: `Table · ${t.columns?.length || 0} columns`,
      id: t.id,
      icon: getSvgIcon('tables', 16)
    }));

  results = matches.slice(0, MAX_RESULTS);

  // ensure selectedIndex is on a navigable result
  if (results.length > 0) {
    while (results[selectedIndex]?.type === 'divider' || results[selectedIndex]?.type === 'insight') {
      selectedIndex = (selectedIndex + 1) % results.length;
    }
  }

  renderResults();
}

function renderResults() {
  const container = document.getElementById('palette-results');
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-muted)">
        <div style="margin-bottom:8px;opacity:0.4">${getSvgIcon('search', 32)}</div>
        <div style="font-size:14px;font-weight:500">No results for "<em>${escHtml(query)}</em>"</div>
        <div style="font-size:12px;margin-top:4px;opacity:0.7">Try a different keyword</div>
      </div>`;
    return;
  }

  container.innerHTML = results.map((res, i) => {
    if (res.type === 'divider') {
      return `<div class="palette-divider">${res.label}</div>`;
    }
    if (res.type === 'insight') {
      return `
        <div class="palette-insight">
          <span class="palette-item-icon" style="background:rgba(255,255,255,0.04)">${res.icon}</span>
          <div class="palette-item-info">
            <div class="palette-item-label" style="font-weight:600">${res.label}</div>
            ${res.sub ? `<div class="palette-item-sub">${res.sub}</div>` : ''}
          </div>
        </div>`;
    }

    const tc = TYPE_COLORS[res.type] || TYPE_COLORS.page;
    const isActive = i === selectedIndex;
    const isHistory = res.type === 'history';
    return `
      <div class="palette-item ${isActive ? 'active' : ''}" data-index="${i}" role="option" aria-selected="${isActive}">
        <span class="palette-item-icon" style="background:${tc.bg};color:${tc.color}">${res.icon}</span>
        <div class="palette-item-info">
          <div class="palette-item-label">${highlight(res.label, query)}</div>
          ${res.sub ? `<div class="palette-item-sub">${highlight(res.sub, query)}</div>` : ''}
        </div>
        <span class="palette-item-type" style="color:${tc.color};background:${tc.bg}">
          ${isHistory ? '↩ recent' : res.type}
        </span>
      </div>`;
  }).join('');

  container.querySelectorAll('.palette-item').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const idx = parseInt(el.dataset.index);
      if (results[idx]?.type !== 'divider' && results[idx]?.type !== 'insight') {
        selectedIndex = idx;
        renderResults();
      }
    });
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      if (results[idx]?.type !== 'divider' && results[idx]?.type !== 'insight') {
        selectedIndex = idx;
        executeCommand(results[selectedIndex]);
      }
    });
  });
}

function executeCommand(cmd) {
  if (!cmd || cmd.type === 'divider' || cmd.type === 'insight') return;

  // Save to history (except dividers/insights)
  addHistory(cmd.label, cmd.type);

  togglePalette();

  if (cmd.type === 'history' && cmd._hist) {
    // Re-execute the historical item as best we can
    const h = cmd._hist;
    if (h.path) navigate(h.path);
    else navigate('/dashboard');
    return;
  }

  switch (cmd.type) {
    case 'page':      navigate(cmd.path); break;
    case 'action':
      if (cmd.action === 'billing') {
        navigate('/billing');
        setTimeout(() => window._showBillModal?.(), 300);
      } else if (cmd.action === 'items') {
        navigate('/items');
        setTimeout(() => window._showItemModal?.(), 300);
      }
      break;
    case 'item':      navigate('/items'); break;
    case 'warehouse': navigate('/warehouses/' + cmd.id); break;
    case 'workforce': navigate('/workforce'); break;
    case 'table':     navigate('/tables'); break;
    case 'billing':   navigate('/billing'); break;
    case 'customer':  navigate('/customers'); break;
    default:          navigate('/dashboard');
  }
}
