/**
 * Notifications Management Page
 */
import { getCurrentUser, getNotifications, markNotificationRead, markAllNotificationsRead, clearNotifications, syncWithBackend } from '../modules/store.js';
import { renderShell } from '../components/shell.js';
import { getSvgIcon, timeSince, showToast } from '../modules/ui.js';
import { navigate } from '../modules/router.js';
import { sanitizeHTML } from '../modules/sanitize.js';

let notif_filter = 'all'; // 'all' or 'unread'

export async function renderNotifications() {
  const user = getCurrentUser();
  if (!user) {
    navigate('/login');
    return;
  }

  // Always sync from backend before rendering — prevents stale/forged localStorage state
  try {
    await syncWithBackend();
  } catch (e) {
    console.warn('[Notifications] Backend sync failed, rendering from local cache:', e);
  }

  const notifications = getNotifications();
  const unreadCount = notifications.filter(n => !n.read).length;

  renderShell('Notifications', 'Manage notifications and system alerts', `
    <div class="animate-fadeIn">
      <div class="page-header" style="margin-bottom:24px">
        <div class="page-header-left">
          <h1 class="page-title">Notification Center</h1>
          <p class="page-subtitle">Real-time alerts, system logs, and transactional updates</p>
        </div>
        <div class="page-header-actions" style="display:flex;gap:10px">
          ${unreadCount > 0 ? `<button class="btn btn-secondary btn-sm" id="btn-mark-all-read" style="display:inline-flex;align-items:center;gap:6px">${getSvgIcon('lock', 14)} Mark All Read</button>` : ''}
          ${notifications.length > 0 ? `<button class="btn btn-danger btn-sm" id="btn-clear-all" style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-rose);border-color:var(--accent-rose);color:white">${getSvgIcon('trash', 14)} Clear All</button>` : ''}
        </div>
      </div>

      <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-md)">
        <div class="table-toolbar" style="border-bottom:1px solid var(--border-subtle);padding:14px 20px;display:flex;justify-content:space-between;align-items:center;background:var(--bg-sidebar)">
          <div style="display:flex;gap:8px">
            <button class="btn ${notif_filter === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="tab-all-notifs">All (${notifications.length})</button>
            <button class="btn ${notif_filter === 'unread' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="tab-unread-notifs">Unread (${unreadCount})</button>
          </div>
        </div>

        <div id="notifications-list-container"></div>
      </div>
    </div>
  `);

  renderNotificationsList();

  // Tab switcher
  document.getElementById('tab-all-notifs')?.addEventListener('click', () => {
    notif_filter = 'all';
    renderNotifications();
  });
  document.getElementById('tab-unread-notifs')?.addEventListener('click', () => {
    notif_filter = 'unread';
    renderNotifications();
  });

  // Action buttons
  document.getElementById('btn-mark-all-read')?.addEventListener('click', async () => {
    try {
      await markAllNotificationsRead();
      showToast('Notifications Updated', 'All notifications marked as read', 'success');
      renderNotifications();
    } catch (err) {
      showToast('Error', 'Failed to update notifications', 'error');
    }
  });

  document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
    try {
      await clearNotifications();
      showToast('Notifications Cleared', 'All notifications cleared', 'success');
      renderNotifications();
    } catch (err) {
      showToast('Error', 'Failed to clear notifications', 'error');
    }
  });
}

function renderNotificationsList() {
  const container = document.getElementById('notifications-list-container');
  if (!container) return;

  const allNotifications = getNotifications();
  const filtered = notif_filter === 'unread' 
    ? allNotifications.filter(n => !n.read) 
    : allNotifications;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding:64px 24px;text-align:center;color:var(--text-muted)">
        <div style="font-size:48px;margin-bottom:16px;opacity:0.3">🔔</div>
        <h3 style="color:var(--text-secondary);font-size:16px;font-weight:600">No notifications found</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-top:8px">
          ${notif_filter === 'unread' ? 'You do not have any unread notifications.' : 'Your notification tray is empty.'}
        </p>
      </div>
    `;
    return;
  }

  const typeIconNames = {
    warehouse_create: 'warehouses',
    bill_create: 'billing',
    user_create: 'user',
    login: 'lock',
    settings_update: 'settings',
    default: 'bell'
  };

  container.innerHTML = `
    <div style="display:flex;flex-direction:column">
      ${filtered.map(n => `
        <div class="notif-detail-row" data-nid="${n.id}" data-link="${n.link || '/dashboard'}" style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:flex-start;gap:16px;transition:background 0.2s, transform 0.2s;cursor:pointer;background:${n.read ? 'transparent' : 'rgba(99,102,241,0.04)'}">
          <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--border-default);color:var(--text-secondary);flex-shrink:0;margin-top:2px">
            ${getSvgIcon(typeIconNames[n.type] || typeIconNames.default, 18)}
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:4px">
              <span style="font-size:14px;font-weight:${n.read ? '600' : '700'};color:var(--text-primary)">${sanitizeHTML(n.title)}</span>
              <span style="font-size:11px;color:var(--text-disabled);font-family:var(--font-mono)">${timeSince(n.timestamp)}</span>
            </div>
            <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin:0 0 8px 0">${sanitizeHTML(n.message)}</p>
            <div style="display:flex;gap:12px;align-items:center">
              ${!n.read ? `
                <button class="btn-mark-read-action" data-nid="${n.id}" style="font-size:11px;font-weight:600;color:var(--text-brand);background:none;border:none;padding:0;cursor:pointer;font-family:var(--font-sans);display:inline-flex;align-items:center;gap:4px">
                  ● Mark as read
                </button>
              ` : `
                <span style="font-size:11px;color:var(--text-disabled);display:inline-flex;align-items:center;gap:4px">✓ Read</span>
              `}
            </div>
          </div>
          ${!n.read ? `
            <div style="width:8px;height:8px;border-radius:50%;background:var(--text-brand);flex-shrink:0;margin-top:6px"></div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;

  // Row navigation click listeners
  container.querySelectorAll('.notif-detail-row').forEach(row => {
    row.addEventListener('mouseenter', () => {
      row.style.background = 'rgba(99,102,241,0.08)';
    });
    row.addEventListener('mouseleave', () => {
      const nid = row.dataset.nid;
      const n = allNotifications.find(x => x.id === nid);
      row.style.background = (n && !n.read) ? 'rgba(99,102,241,0.04)' : 'transparent';
    });
    row.addEventListener('click', async (e) => {
      // Prevent navigation trigger if clicking on action button
      if (e.target.closest('.btn-mark-read-action')) return;
      
      const nid = row.dataset.nid;
      const link = row.dataset.link;
      await markNotificationRead(nid);
      navigate(link);
    });
  });

  // Action click listeners
  container.querySelectorAll('.btn-mark-read-action').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nid = btn.dataset.nid;
      try {
        await markNotificationRead(nid);
        showToast('Notification Read', 'Notification marked as read', 'success');
        renderNotifications();
      } catch (err) {
        showToast('Error', 'Failed to mark read', 'error');
      }
    });
  });
}
