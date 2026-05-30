/**
 * Command Palette Component — Ctrl+K for pro navigation
 */
import { getItems, getWarehouses, getCurrentUser, getBills, getStockHealth, getStore, getAllUsers } from '../modules/store.js';
import { navigate } from '../modules/router.js';
import { formatCurrency, formatNumber, getSvgIcon, capitalize } from '../modules/ui.js';

let paletteOpen = false;
let query = '';
let selectedIndex = 0;
let results = [];

/**
 * Initializes the global keyboard listener for the Command Palette.
 * Listens for Ctrl+K (or Cmd+K on macOS) to trigger the overlay,
 * and Esc key to dismiss it when active.
 */
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

/**
 * Toggles the Command Palette visibility.
 * Handles overlay setup, initial query/selection state, element focusing,
 * and cleans up overlay elements from the DOM when closing.
 */
export function togglePalette() {
  paletteOpen = !paletteOpen;
  if (paletteOpen) {
    query = '';
    selectedIndex = 0;
    renderPalette();
    document.getElementById('palette-input')?.focus();
  } else {
    document.getElementById('palette-overlay')?.remove();
  }
}

/**
 * Creates and appends the Command Palette overlay element to the DOM body.
 * Mounts the search bar, results list, shortcuts footer, and attaches key/mouse event listeners.
 * @private
 */
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
      let next = (selectedIndex + 1) % results.length;
      while (results[next]?.type === 'divider' || results[next]?.type === 'insight') {
        next = (next + 1) % results.length;
        if (next === selectedIndex) break;
      }
      selectedIndex = next;
      renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      let prev = (selectedIndex - 1 + results.length) % results.length;
      while (results[prev]?.type === 'divider' || results[prev]?.type === 'insight') {
        prev = (prev - 1 + results.length) % results.length;
        if (prev === selectedIndex) break;
      }
      selectedIndex = prev;
      renderResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) executeCommand(results[selectedIndex]);
    }
  });

  updateResults();
}

/**
 * Queries active store collections (items, bills, warehouses) to filter items
 * matching the query prefix. Populates default quick insights when query is empty.
 * @private
 */
function updateResults() {
  const user = getCurrentUser();
  const items = getItems();
  const whs = getWarehouses();
  const bills = getBills();

  const commands = [
    { type: 'page', label: 'Go to Dashboard', path: '/dashboard', icon: getSvgIcon('dashboard', 16) },
    { type: 'page', label: 'Manage Inventory', path: '/items', icon: getSvgIcon('items', 16) },
    { type: 'page', label: 'Billing & Invoices', path: '/billing', icon: getSvgIcon('billing', 16) },
    { type: 'page', label: 'Analytics Reports', path: '/analytics', icon: getSvgIcon('analytics', 16) },
    { type: 'action', label: 'Create New Bill', action: 'billing', icon: getSvgIcon('plus', 16) },
    { type: 'action', label: 'Add New Item', action: 'items', icon: getSvgIcon('plus', 16) },
  ];

  if (user.role === 'super_admin') {
    commands.push({ type: 'page', label: 'Manage Warehouses', path: '/warehouses', icon: getSvgIcon('warehouses', 16) });
    commands.push({ type: 'page', label: 'User Management', path: '/workforce', icon: getSvgIcon('workforce', 16) });
    commands.push({ type: 'page', label: 'Audit Logs', path: '/audit', icon: getSvgIcon('audit', 16) });
  }

  const matches = [];

  // Show Quick Insights if no query
  if (!query) {
    const totalRev = bills.reduce((sum, b) => sum + (b.total || 0), 0);
    const health = getStockHealth();
    matches.push({ type: 'insight', label: 'Quick Insight: Revenue', sub: `Total across all warehouses: ${formatCurrency(totalRev)}`, icon: getSvgIcon('revenue', 16) });
    matches.push({ type: 'insight', label: 'Quick Insight: Inventory', sub: `Total items tracked: ${formatNumber(items.length)}`, icon: getSvgIcon('items', 16) });
    matches.push({ type: 'insight', label: 'Quick Insight: Stock Health', sub: `Current status: ${health}% healthy`, icon: getSvgIcon('check', 16) });
    matches.push({ type: 'divider', label: 'Suggested Commands' });
  }

  // Filter commands
  commands.forEach(c => {
    if (c.label.toLowerCase().includes(query)) matches.push(c);
  });

  // Filter items (Inventory)
  if (query.length > 1) {
    items.forEach(i => {
      if (i.name.toLowerCase().includes(query) || i.sku.toLowerCase().includes(query)) {
        matches.push({ type: 'item', label: i.name, sub: `SKU: ${i.sku} · ${formatCurrency(i.price)}`, id: i.id, icon: getSvgIcon('items', 16) });
      }
    });
  }

  // Filter warehouses
  if (user.role === 'super_admin' && query.length > 1) {
    whs.forEach(w => {
      if (w.name.toLowerCase().includes(query)) {
        matches.push({ type: 'warehouse', label: w.name, sub: w.address, id: w.id, icon: getSvgIcon('warehouses', 16) });
      }
    });
  }

  // Filter workforce (User Management)
  if (query.length > 1) {
    const allUsers = getAllUsers();
    allUsers.forEach(u => {
      if (u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)) {
        matches.push({ type: 'workforce', label: u.name, sub: `${capitalize(u.role.replace('_', ' '))} · ${u.email}`, id: u.id, icon: getSvgIcon('workforce', 16) });
      }
    });
  }

  // Filter dynamic tables
  if (query.length > 1) {
    const tables = getStore().tables || [];
    tables.forEach(t => {
      const title = t.displayName || t.name;
      if (title.toLowerCase().includes(query)) {
        matches.push({ type: 'table', label: title, sub: `Custom Table · ${t.columns?.length || 0} columns`, id: t.id, icon: getSvgIcon('tables', 16) });
      }
    });
  }

  // Filter billing invoices
  if (query.length > 1) {
    bills.forEach(b => {
      if (b.billNo.toLowerCase().includes(query) || b.customer.toLowerCase().includes(query)) {
        matches.push({ type: 'billing', label: b.billNo, sub: `Invoice · ${b.customer} · ${formatCurrency(b.total)}`, id: b.id, icon: getSvgIcon('billing', 16) });
      }
    });
  }

  // Filter CRM Customers
  if (query.length > 1) {
    const uniqueCustomers = [];
    const seenCusts = new Set();
    bills.forEach(b => {
      if (b.customer && !seenCusts.has(b.customer.toLowerCase())) {
        seenCusts.add(b.customer.toLowerCase());
        uniqueCustomers.push({
          name: b.customer,
          email: b.customerEmail || 'No email',
          phone: b.customerPhone || 'No phone'
        });
      }
    });
    uniqueCustomers.forEach(cust => {
      if (cust.name.toLowerCase().includes(query) || cust.email.toLowerCase().includes(query)) {
        matches.push({ type: 'customer', label: cust.name, sub: `CRM Customer · ${cust.email} · ${cust.phone}`, id: cust.name, icon: getSvgIcon('customer', 16) });
      }
    });
  }

  results = matches.slice(0, 10);
  
  // Ensure selectedIndex is valid for new results
  if (selectedIndex >= results.length) selectedIndex = 0;
  if (results.length > 0 && (results[selectedIndex]?.type === 'divider' || results[selectedIndex]?.type === 'insight')) {
    const next = results.findIndex(r => r.type !== 'divider' && r.type !== 'insight');
    if (next !== -1) selectedIndex = next;
  }

  renderResults();
}

/**
 * Renders the compiled search results matching the active query.
 * Focuses active selections and mounts click event listeners on items.
 * @private
 */
function renderResults() {
  const container = document.getElementById('palette-results');
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = `<div class="palette-no-results">No matches found for "${query}"</div>`;
    return;
  }

  container.innerHTML = results.map((res, i) => {
    if (res.type === 'divider') {
      return `<div class="palette-divider">${res.label}</div>`;
    }
    return `
      <div class="palette-item ${i === selectedIndex ? 'active' : ''}" data-index="${i}">
        <span class="palette-item-icon">${res.icon}</span>
        <div class="palette-item-info">
          <div class="palette-item-label">${res.label}</div>
          ${res.sub ? `<div class="palette-item-sub">${res.sub}</div>` : ''}
        </div>
        <span class="palette-item-type">${res.type}</span>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.palette-item').forEach(el => {
    el.addEventListener('click', () => {
      selectedIndex = parseInt(el.dataset.index);
      executeCommand(results[selectedIndex]);
    });
  });
}

/**
 * Resolves actions, page routing, and deep-linking targets selected from the palette.
 * Cleans up navigation state and calls callbacks for modal actions.
 * @param {Object} cmd - The matched command, action, or item payload.
 * @private
 */
function executeCommand(cmd) {
  if (cmd.type === 'divider' || cmd.type === 'insight') return;
  togglePalette();
  if (cmd.type === 'page') {
    navigate(cmd.path);
  } else if (cmd.type === 'action') {
    if (cmd.action === 'billing') {
      navigate('/billing');
      setTimeout(() => window._showBillModal?.(), 300);
    } else if (cmd.action === 'items') {
      navigate('/items');
      setTimeout(() => window._showItemModal?.(), 300);
    }
  } else if (cmd.type === 'item') {
    navigate('/items');
  } else if (cmd.type === 'warehouse') {
    navigate('/warehouses/' + cmd.id);
  } else if (cmd.type === 'workforce') {
    navigate('/workforce');
  } else if (cmd.type === 'table') {
    navigate('/tables');
  } else if (cmd.type === 'billing') {
    navigate('/billing');
  } else if (cmd.type === 'customer') {
    navigate('/customers');
  }
}
