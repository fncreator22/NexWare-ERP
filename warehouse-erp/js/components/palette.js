/**
 * Command Palette Component — Ctrl+K for pro navigation
 */
import { getItems, getWarehouses, getCurrentUser } from '../modules/store.js';
import { navigate } from '../modules/router.js';
import { formatCurrency } from '../modules/ui.js';

let paletteOpen = false;
let query = '';
let selectedIndex = 0;
let results = [];

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
    renderPalette();
    document.getElementById('palette-input')?.focus();
  } else {
    document.getElementById('palette-overlay')?.remove();
  }
}

function renderPalette() {
  const overlay = document.createElement('div');
  overlay.id = 'palette-overlay';
  overlay.className = 'palette-overlay animate-fadeIn';
  overlay.innerHTML = `
    <div class="palette-container animate-scaleUp">
      <div class="palette-search">
        <span class="palette-search-icon">🔍</span>
        <input type="text" id="palette-input" placeholder="Search commands, items, or pages..." autocomplete="off" />
        <span class="palette-search-kb">ESC</span>
      </div>
      <div id="palette-results" class="palette-results"></div>
      <div class="palette-footer">
        <span><b>↑↓</b> to navigate</span>
        <span><b>↵</b> to select</span>
        <span><b>ESC</b> to close</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) togglePalette();
  });

  const input = overlay.querySelector('#palette-input');
  input.addEventListener('input', (e) => {
    query = e.target.value.toLowerCase();
    selectedIndex = 0;
    updateResults();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % results.length;
      renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + results.length) % results.length;
      renderResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) executeCommand(results[selectedIndex]);
    }
  });

  updateResults();
}

function updateResults() {
  const user = getCurrentUser();
  const items = getItems();
  const whs = getWarehouses();

  const commands = [
    { type: 'page', label: 'Go to Dashboard', path: '/dashboard', icon: '📊' },
    { type: 'page', label: 'Manage Inventory', path: '/items', icon: '📦' },
    { type: 'page', label: 'Billing & Invoices', path: '/billing', icon: '💰' },
    { type: 'page', label: 'Analytics Reports', path: '/analytics', icon: '📈' },
    { type: 'action', label: 'Create New Bill', action: 'billing', icon: '➕' },
    { type: 'action', label: 'Add New Item', action: 'items', icon: '📦' },
  ];

  if (user.role === 'super_admin') {
    commands.push({ type: 'page', label: 'Manage Warehouses', path: '/warehouses', icon: '🏭' });
    commands.push({ type: 'page', label: 'User Management', path: '/workforce', icon: '👥' });
    commands.push({ type: 'page', label: 'Audit Logs', path: '/audit', icon: '🔍' });
  }

  const matches = [];

  // Filter commands
  commands.forEach(c => {
    if (c.label.toLowerCase().includes(query)) matches.push(c);
  });

  // Filter items
  if (query.length > 1) {
    items.forEach(i => {
      if (i.name.toLowerCase().includes(query) || i.sku.toLowerCase().includes(query)) {
        matches.push({ type: 'item', label: i.name, sub: `SKU: ${i.sku} · ${formatCurrency(i.price)}`, id: i.id, icon: '📦' });
      }
    });
  }

  // Filter warehouses
  if (user.role === 'super_admin' && query.length > 1) {
    whs.forEach(w => {
      if (w.name.toLowerCase().includes(query)) {
        matches.push({ type: 'warehouse', label: w.name, sub: w.address, id: w.id, icon: '🏭' });
      }
    });
  }

  results = matches.slice(0, 8);
  renderResults();
}

function renderResults() {
  const container = document.getElementById('palette-results');
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = `<div class="palette-no-results">No matches found for "${query}"</div>`;
    return;
  }

  container.innerHTML = results.map((res, i) => `
    <div class="palette-item ${i === selectedIndex ? 'active' : ''}" data-index="${i}">
      <span class="palette-item-icon">${res.icon}</span>
      <div class="palette-item-info">
        <div class="palette-item-label">${res.label}</div>
        ${res.sub ? `<div class="palette-item-sub">${res.sub}</div>` : ''}
      </div>
      <span class="palette-item-type">${res.type}</span>
    </div>
  `).join('');

  container.querySelectorAll('.palette-item').forEach(el => {
    el.addEventListener('click', () => {
      selectedIndex = parseInt(el.dataset.index);
      executeCommand(results[selectedIndex]);
    });
  });
}

function executeCommand(cmd) {
  togglePalette();
  if (cmd.type === 'page') {
    navigate(cmd.path);
  } else if (cmd.type === 'action') {
    navigate('/' + cmd.action);
    // Potentially trigger a modal in the target page
  } else if (cmd.type === 'item') {
    navigate('/items');
    // Potentially filter or highlight item
  } else if (cmd.type === 'warehouse') {
    navigate('/warehouses/' + cmd.id);
  }
}
