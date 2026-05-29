/**
 * UI Helpers — Toast, Modal, DOM utilities
 */

// ---- TOAST ----
let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(title, message = '', type = 'info', duration = 4000) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-msg">${message}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  getToastContainer().appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ---- MODAL ----
export function createModal({ title, body, footer, size = '', onClose }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${size ? 'modal-' + size : ''}">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="btn btn-ghost btn-icon modal-close-btn" style="font-size:20px">×</button>
      </div>
      <div class="modal-body">${typeof body === 'string' ? body : ''}</div>
      <div class="modal-footer"></div>
    </div>
  `;
  if (typeof body !== 'string' && body instanceof HTMLElement) {
    backdrop.querySelector('.modal-body').appendChild(body);
  }
  if (footer) {
    const footerEl = backdrop.querySelector('.modal-footer');
    if (typeof footer === 'string') footerEl.innerHTML = footer;
    else if (footer instanceof HTMLElement) footerEl.appendChild(footer);
  }
  const close = () => { backdrop.remove(); if (onClose) onClose(); };
  backdrop.querySelector('.modal-close-btn').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.appendChild(backdrop);
  return { el: backdrop, close };
}

// ---- CONFIRM DIALOG ----
export function confirm(message, title = 'Confirm') {
  return new Promise(resolve => {
    const footer = document.createElement('div');
    footer.innerHTML = `
      <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
      <button class="btn btn-danger" id="confirm-ok">Delete</button>
    `;
    const modal = createModal({ title, body: `<p style="color:var(--text-secondary)">${message}</p>`, footer });
    modal.el.querySelector('#confirm-cancel').addEventListener('click', () => { modal.close(); resolve(false); });
    modal.el.querySelector('#confirm-ok').addEventListener('click', () => { modal.close(); resolve(true); });
  });
}

// ---- DOM HELPERS ----
export function el(tag, classes = '', innerHTML = '', attrs = {}) {
  const elem = document.createElement(tag);
  if (classes) elem.className = classes;
  if (innerHTML) elem.innerHTML = innerHTML;
  Object.entries(attrs).forEach(([k, v]) => elem.setAttribute(k, v));
  return elem;
}

export function render(selector, content) {
  const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!container) return;
  if (typeof content === 'string') container.innerHTML = content;
  else { container.innerHTML = ''; container.appendChild(content); }
}

// ---- FORMATTERS ----
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatCurrency(val, currencyCode) {
  const code = currencyCode || window.wareops_currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val || 0);
  } catch (err) {
    const symbol = { USD: '$', INR: '₹', EUR: '€', GBP: '£', AED: 'د.إ ', SGD: 'S$' }[code] || '$';
    return symbol + Number(val || 0).toFixed(2);
  }
}

export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

export function roleBadge(role) {
  const labels = { super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager', staff: 'Staff', employee: 'Employee' };
  const cls = { super_admin: 'role-super-admin', admin: 'role-admin', manager: 'role-manager', staff: 'role-staff', employee: 'role-employee' };
  return `<span class="badge ${cls[role] || 'badge-muted'}">${labels[role] || role}</span>`;
}

export function statusBadge(status) {
  const map = { active: 'badge-success', inactive: 'badge-danger', pending: 'badge-warning' };
  return `<span class="badge ${map[status] || 'badge-muted'}"><span class="status-dot ${status}"></span>${capitalize(status)}</span>`;
}

// ---- TABLE BUILDER ----
export function buildDataTable({ columns, data, onEdit, onDelete, onView, emptyMsg = 'No records found' }) {
  const wrap = el('div', 'table-wrap');
  const table = el('table');
  const thead = el('thead');
  const headerRow = el('tr');
  columns.forEach(col => {
    const th = el('th', '', col.label);
    if (col.sortable !== false) th.innerHTML += ' <span class="sort-icon">↕</span>';
    headerRow.appendChild(th);
  });
  const thActions = el('th', '', 'Actions');
  headerRow.appendChild(thActions);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  if (!data || data.length === 0) {
    const emptyRow = el('tr');
    const emptyTd = el('td', 'table-empty', `<div class="table-empty-icon">📭</div><div class="table-empty-title">${emptyMsg}</div>`, { colspan: columns.length + 1 });
    emptyRow.appendChild(emptyTd);
    tbody.appendChild(emptyRow);
  } else {
    data.forEach(row => {
      const tr = el('tr');
      columns.forEach((col, i) => {
        const td = el('td', '', '', { 'data-label': col.label });
        td.innerHTML = col.render ? col.render(row[col.key], row) : `<span class="${i === 0 ? 'primary-cell' : ''}">${row[col.key] ?? '—'}</span>`;
        tr.appendChild(td);
      });
      const tdActions = el('td', '', '', { 'data-label': 'Actions' });
      const actionsDiv = el('div', 'table-actions');
      if (onView) { const btn = el('button', 'action-btn view', '👁️', { title: 'View' }); btn.onclick = () => onView(row); actionsDiv.appendChild(btn); }
      if (onEdit) { const btn = el('button', 'action-btn edit', '✏️', { title: 'Edit' }); btn.onclick = () => onEdit(row); actionsDiv.appendChild(btn); }
      if (onDelete) { const btn = el('button', 'action-btn delete', '🗑️', { title: 'Delete' }); btn.onclick = () => onDelete(row); actionsDiv.appendChild(btn); }
      tdActions.appendChild(actionsDiv);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// ---- SEARCH FILTER ----
export function filterData(data, query, fields) {
  if (!query) return data;
  const q = query.toLowerCase();
  return data.filter(item => fields.some(f => String(item[f] || '').toLowerCase().includes(q)));
}

// ---- PAGINATE ----
export function paginate(data, page, perPage = 10) {
  const total = data.length;
  const pages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  const items = data.slice(start, start + perPage);
  return { items, total, pages, page, perPage, from: start + 1, to: Math.min(start + perPage, total) };
}
// ---- VIEWPORT HELPERS ----
/**
 * Auto-positions a fixed element relative to an anchor, ensuring it stays within the viewport.
 */
export function positionFixedElement(anchor, element, options = {}) {
  const { offset = 8, preferredAlign = 'right', preferredVertical = 'bottom' } = options;
  const rect = anchor.getBoundingClientRect();
  const winW = window.innerWidth;
  const winH = window.innerHeight;

  // Append to body if not already there to measure
  if (!element.parentElement) document.body.appendChild(element);

  // Set max width to fit viewport dynamically and prevent horizontal clipping
  element.style.maxWidth = (winW - 20) + 'px';
  element.style.boxSizing = 'border-box';
  
  const elRect = element.getBoundingClientRect();
  const elW = elRect.width;
  const elH = elRect.height;

  let top = preferredVertical === 'top' ? rect.top - elH - offset : rect.bottom + offset;
  let left = preferredAlign === 'left' ? rect.left : rect.right - elW;

  // Horizontal edge detection
  if (left < 10) {
    left = 10;
  } else if (left + elW > winW - 10) {
    left = winW - elW - 10;
  }

  // Vertical edge detection
  if (preferredVertical === 'top') {
    if (top < 10 && rect.bottom + elH + offset < winH - 10) {
      top = rect.bottom + offset; // Flip to bottom
    }
  } else {
    if (top + elH > winH - 10 && rect.top > elH + offset) {
      top = rect.top - elH - offset; // Flip to top
    }
  }

  // Hard boundaries viewport clamping (NEVER clip under any screen size)
  if (top < 10) {
    top = 10;
  } else if (top + elH > winH - 10) {
    top = winH - elH - 10;
  }

  element.style.position = 'fixed';
  element.style.top = top + 'px';
  element.style.left = left + 'px';
  element.style.right = 'auto';
  element.style.zIndex = '9999';
}

// ---- TIME HELPERS ----
export function timeSince(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return Math.floor(seconds) + "s ago";
}

export function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

export function debounce(func, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

// ---- JS GLOBAL TOOLTIP ENGINE ----
export function initTooltipEngine() {
  const tooltipEl = document.createElement('div');
  tooltipEl.id = 'global-tooltip';
  tooltipEl.style.cssText = `
    position: fixed;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    color: var(--text-primary);
    box-shadow: var(--shadow-md);
    pointer-events: none;
    opacity: 0;
    transform: scale(0.95);
    transition: opacity 150ms ease, transform 150ms ease;
    z-index: 10000;
    white-space: nowrap;
  `;
  document.body.appendChild(tooltipEl);

  let activeElement = null;

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tooltip], [title]');
    if (!el) {
      hideTooltip();
      return;
    }

    // Do not show tooltips for expanded sidebar items to keep UI premium
    if (el.closest('.sidebar:not(.collapsed) .sidebar-item')) {
      hideTooltip();
      return;
    }

    // Convert standard title tags to data-tooltip tags on demand to prevent browser yellow double-tooltips
    if (el.hasAttribute('title')) {
      const titleText = el.getAttribute('title');
      if (titleText) {
        el.setAttribute('data-tooltip', titleText);
        el.removeAttribute('title');
      }
    }

    const text = el.getAttribute('data-tooltip');
    if (!text || text.trim() === '') return;

    activeElement = el;
    tooltipEl.textContent = text;
    tooltipEl.style.opacity = '1';
    tooltipEl.style.transform = 'scale(1)';

    positionTooltip(el, tooltipEl);
  });

  document.addEventListener('mouseout', (e) => {
    if (activeElement && !activeElement.contains(e.target)) {
      hideTooltip();
    }
  });

  function hideTooltip() {
    activeElement = null;
    tooltipEl.style.opacity = '0';
    tooltipEl.style.transform = 'scale(0.95)';
  }

  function positionTooltip(anchor, tooltip) {
    const rect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const offset = 8;
    let top, left;

    // Collapsed sidebar items prefer alignment to the right of the sidebar
    const position = anchor.getAttribute('data-tooltip-position') || 
      (anchor.closest('.sidebar.collapsed') ? 'right' : 'auto');

    if (position === 'right') {
      top = rect.top + (rect.height - tooltipRect.height) / 2;
      left = rect.right + offset;
    } else if (position === 'left') {
      top = rect.top + (rect.height - tooltipRect.height) / 2;
      left = rect.left - tooltipRect.width - offset;
    } else {
      // Auto vertical placement with viewport check (Issue 4 placement direction rules)
      const showBelow = rect.top < 80;
      if (showBelow) {
        top = rect.bottom + offset;
      } else {
        top = rect.top - tooltipRect.height - offset;
      }
      left = rect.left + (rect.width - tooltipRect.width) / 2;
    }

    // Clamp horizontal & vertical to prevent viewport boundary clipping
    if (left < 10) left = 10;
    if (left + tooltipRect.width > winW - 10) left = winW - tooltipRect.width - 10;
    if (top < 10) top = 10;
    if (top + tooltipRect.height > winH - 10) top = winH - tooltipRect.height - 10;

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }
}

// ---- SVG ICON ENGINE ----
/**
 * Returns an inline SVG string for the given icon name and size.
 * Used across dashboard, shell, and page components for consistent iconography.
 * @param {string} name - Icon identifier
 * @param {number} size - Width/height in pixels (default 20)
 * @returns {string} SVG HTML string
 */
export function getSvgIcon(name, size = 20) {
  const s = size;
  const icons = {
    warehouses: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    revenue:    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    billing:    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    workforce:  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    items:      `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    subscription:`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
    analytics:  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    clock:      `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    warning:    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    bulb:       `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`,
    tables:     `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/></svg>`,
    collapse:   `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    search:     `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    bell:       `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    settings:   `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    audit:      `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
    dashboard:  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    logout:     `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    user:       `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    check:      `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    plus:       `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    edit:       `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    trash:      `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    download:   `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    upload:     `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    filter:     `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
    refresh:    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    close:      `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    chevron_down:`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
    chevron_right:`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
    lock:       `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    info:       `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    palette:    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="14" r="1" fill="currentColor"/><circle cx="12" cy="8" r="1" fill="currentColor"/><circle cx="16" cy="14" r="1" fill="currentColor"/></svg>`,
  };
  return icons[name] || `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
}
