// WareOps ERP — Bundled v2.0  Generated: 2026-05-28T19:14:20.871Z


// ===== modules/store.js =====
/**
 * WareOps ERP — Central Store (In-Memory State)
 * Simulates a database using localStorage + in-memory state
 */

const STORAGE_KEY = 'wareops_data';

function getDefaultData() {
  const now = new Date().toISOString();

  const taxConfig = { luxury: 15, normal: 5 };
  const subscription = { plan: 'enterprise', startDate: now, status: 'active', warehouseLimit: -1 };

  return {
    users: [],
    warehouses: [],
    workforce: [],
    tables: [],
    tableData: {},
    bills: [],
    items: [],
    auditLogs: [],
    notifications: [],
    taxConfig,
    subscription,
    currentUserId: null,
    currentWarehouseId: null,
  };
}

let _store = null;

// Cross-tab synchronization: Listen for changes from other tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        _store = JSON.parse(e.newValue);
        // Dispatch event for UI components to optionally re-render
        window.dispatchEvent(new CustomEvent('wareops_storage_sync'));
      } catch (err) {
        console.error('Store sync error:', err);
      }
    }
  });
}

function getStore() {
  if (_store) return _store;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _store = raw ? JSON.parse(raw) : getDefaultData();

    // Trigger silent background synchronization if access token exists
    if (typeof window !== 'undefined' && localStorage.getItem('access_token')) {
      setTimeout(syncWithBackend, 0);
    }

    // Migration: Ensure all bills have tax snapshots for historical integrity
    if (_store.bills) {
      _store.bills.forEach(b => {
        if (!b.taxConfigSnapshot) {
          b.taxConfigSnapshot = { normal: 5, luxury: 15 };
        }
        if (b.items) {
          b.items.forEach(i => {
            if (i.taxRate === undefined) {
              i.taxRate = i.taxCategory === 'luxury' ? 0.15 : 0.05;
            }
          });
        }
      });
    }
  } catch {
    _store = getDefaultData();
  }
  return _store;
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_store));
}

function resetStore() {
  _store = getDefaultData();
  saveStore();
}

// ---- API AND SYNCHRONIZATION ----
const getApiBaseUrl = () => {
  if (typeof window === 'undefined') return 'http://127.0.0.1:8000/api/v1';
  let hostname = window.location.hostname || '127.0.0.1';
  if (hostname === 'localhost' || hostname === '[::1]') {
    hostname = '127.0.0.1';
  }
  return `http://${hostname}:8000/api/v1`;
};
const API_BASE_URL = getApiBaseUrl();

async function apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const token = localStorage.getItem('access_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const config = {
    ...options,
    headers,
    credentials: 'include'
  };
  
  try {
    const res = await fetch(url, config);
    if (res.status === 401) {
      localStorage.removeItem('access_token');
      if (_store) {
        _store.currentUserId = null;
        saveStore();
      }
      if (typeof window !== 'undefined') {
        window.location.hash = '#/login';
      }
      return { error: 'Session expired. Please sign in again.' };
    }
    
    const data = await res.json();
    if (!res.ok) {
      const errMsg = (data.error && data.error.message) || data.message || 'An error occurred.';
      return { error: errMsg };
    }
    return data;
  } catch (err) {
    console.error(`API Fetch Error [${path}]:`, err);
    return { error: 'Network error. Please check if the server is running.' };
  }
}

function normalize(data) {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map(item => normalize(item));
  }
  if (typeof data === 'object') {
    const item = { ...data };
    if (item._id && !item.id) {
      item.id = String(item._id);
    }
    if (item.warehouse_id !== undefined && item.warehouseId === undefined) {
      item.warehouseId = item.warehouse_id;
    }
    if (item.tenant_id !== undefined && item.tenantId === undefined) {
      item.tenantId = item.tenant_id;
    }
    if (item.user_id !== undefined && item.userId === undefined) {
      item.userId = item.user_id;
    }
    if (item.user_name !== undefined && item.userName === undefined) {
      item.userName = item.user_name;
    }
    return item;
  }
  return data;
}

async function syncWithBackend() {
  const token = localStorage.getItem('access_token');
  if (!token) return;
  
  try {


    // 1. Fetch Warehouses
    const whRes = await apiFetch('/warehouses/');
    if (whRes && whRes.success && Array.isArray(whRes.data)) {
      _store.warehouses = normalize(whRes.data);
    } else {
      _store.warehouses = [];
    }

    // 2. Fetch Workforce (Users)
    const wfRes = await apiFetch('/workforce/');
    if (wfRes && wfRes.success && Array.isArray(wfRes.data)) {
      const normalizedWf = normalize(wfRes.data);
      const currentUser = getCurrentUser();
      const otherUsers = normalizedWf.filter(u => u.id !== _store.currentUserId);
      _store.users = currentUser ? [currentUser, ...otherUsers] : normalizedWf;
    } else {
      const currentUser = getCurrentUser();
      _store.users = currentUser ? [currentUser] : [];
    }

    // 3. Fetch Items (Inventory)
    const itemsRes = await apiFetch('/items/');
    if (itemsRes && itemsRes.success && Array.isArray(itemsRes.data)) {
      _store.items = normalize(itemsRes.data);
    } else {
      _store.items = [];
    }

    // 4. Fetch Bills (Billing)
    const billsRes = await apiFetch('/billing/');
    if (billsRes && billsRes.success && Array.isArray(billsRes.data)) {
      _store.bills = normalize(billsRes.data);
    } else {
      _store.bills = [];
    }

    // 5. Fetch Audit Logs
    const auditRes = await apiFetch('/audit-logs/');
    if (auditRes && auditRes.success && Array.isArray(auditRes.data)) {
      _store.auditLogs = normalize(auditRes.data);
    } else {
      _store.auditLogs = [];
    }

    // 6. Fetch Notifications
    const notifRes = await apiFetch('/realtime/notifications');
    if (notifRes && notifRes.success && Array.isArray(notifRes.data)) {
      _store.notifications = normalize(notifRes.data);
    } else {
      _store.notifications = [];
    }

    // 7. Fetch Dynamic Tables & Row Data
    const tableRes = await apiFetch('/dynamic-tables/');
    if (tableRes && tableRes.success && Array.isArray(tableRes.data)) {
      _store.tables = normalize(tableRes.data);
      const tableRowsData = {};
      await Promise.all(_store.tables.map(async (table) => {
        const rowsRes = await apiFetch(`/dynamic-tables/${table.id}/rows`);
        tableRowsData[table.id] = (rowsRes && rowsRes.success && Array.isArray(rowsRes.data)) ? normalize(rowsRes.data) : [];
      }));
      _store.tableData = tableRowsData;
    } else {
      _store.tables = [];
      _store.tableData = {};
    }

    saveStore();
    
    // Automatically trigger/maintain WebSocket connection broker
    if (typeof window !== 'undefined') {
      setTimeout(connectWebSocket, 0);
    }
    
    // Dispatch synchronization event to trigger SPA UI re-renders
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wareops_storage_sync'));
    }
  } catch (err) {
    console.error('Error synchronizing with backend:', err);
  }
}

// ---- AUTH ----
function getCurrentUser() {
  const s = getStore();
  return s.users.find(u => u.id === s.currentUserId) || null;
}

async function login(email, password) {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  
  if (res.error) {
    return { error: res.error };
  }
  
  let { access_token, user } = res.data;
  user = normalize(user);
  localStorage.setItem('access_token', access_token);
  
  const s = getStore();
  s.currentUserId = user.id;
  
  // Cache user document locally
  const idx = s.users.findIndex(u => u.id === user.id);
  if (idx === -1) {
    s.users.push(user);
  } else {
    s.users[idx] = user;
  }
  
  saveStore();
  
  // Synchronize dynamic tenant database state
  await syncWithBackend();
  
  return user;
}

async function logout() {
  const token = localStorage.getItem('access_token');
  
  // Clear client-side authentication and session state synchronously first
  localStorage.removeItem('access_token');
  const s = getStore();
  s.currentUserId = null;
  saveStore();

  // Perform backend logout notification in the background
  if (token) {
    try {
      await apiFetch('/auth/logout', { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (err) {
      console.warn('[Store] Backend logout request failed:', err);
    }
  }
}

async function signup(name, email, password) {
  const res = await apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
  
  if (res.error) {
    return { error: res.error };
  }
  
  const loginRes = await login(email, password);
  if (loginRes && loginRes.error) {
    return { error: loginRes.error };
  }
  
  return { user: loginRes };
}

// ---- WAREHOUSES ----
function getWarehouses() {
  const s = getStore();
  const u = getCurrentUser();
  if (!u) return [];
  let whs = [];
  if (u.role === 'super_admin') {
    whs = s.warehouses.filter(w => w.ownerId === u.id);
  } else {
    whs = s.warehouses.filter(w => w.id === u.warehouseId);
  }
  
  // Dynamically compute math/statistics for true global synchronization
  return whs.map(w => ({
    ...w,
    staffCount: s.users.filter(user => user.warehouseId === w.id).length,
    items: s.items.filter(item => item.warehouseId === w.id).length,
    revenue: s.bills.filter(bill => bill.warehouseId === w.id).reduce((sum, bill) => sum + (bill.total || 0), 0)
  }));
}

function getStockHealth(warehouseId) {
  const s = getStore();
  const items = warehouseId ? s.items.filter(i => i.warehouseId === warehouseId) : s.items;
  if (items.length === 0) return 0;
  const lowStock = items.filter(i => (i.stock || 0) < 20).length;
  return Math.round(((items.length - lowStock) / items.length) * 100);
}

async function createWarehouse(data) {
  const res = await apiFetch('/warehouses/', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  
  if (res.error) {
    return { error: res.error };
  }
  
  const warehouse = res.data;
  const s = getStore();
  s.warehouses.push(warehouse);
  saveStore();
  
  // Re-sync with backend to populate correct lists
  await syncWithBackend();
  
  return warehouse;
}

function updateWarehouse(id, data) {
  const s = getStore();
  const u = getCurrentUser();
  if (u.role !== 'super_admin' && (u.role !== 'admin' || u.warehouseId !== id)) return null;

  const idx = s.warehouses.findIndex(w => w.id === id);
  if (idx === -1) return null;
  s.warehouses[idx] = { ...s.warehouses[idx], ...data, updatedAt: new Date().toISOString() };
  saveStore();
  addAuditLog('warehouse_update', `Warehouse updated: ${s.warehouses[idx].name}`, s.currentUserId);
  return s.warehouses[idx];
}

function deleteWarehouse(id) {
  const s = getStore();
  const u = getCurrentUser();
  if (u.role !== 'super_admin') return;

  // Cascade Deletion to associated records to maintain data integrity
  s.users = s.users.filter(usr => usr.warehouseId !== id);
  s.items = s.items.filter(item => item.warehouseId !== id);
  s.bills = s.bills.filter(bill => bill.warehouseId !== id);
  
  // Also cascade to operational tables and their rows
  const affectedTables = s.tables.filter(t => t.warehouseId === id).map(t => t.id);
  affectedTables.forEach(tId => { delete s.tableData[tId]; });
  s.tables = s.tables.filter(t => t.warehouseId !== id);

  s.warehouses = s.warehouses.filter(w => w.id !== id);
  saveStore();
  addAuditLog('warehouse_delete', `Warehouse deleted (cascade)`, s.currentUserId);
}

// ---- USERS / WORKFORCE ----
function getAllUsers() {
  const s = getStore();
  const u = getCurrentUser();
  if (!u) return [];
  const myWhs = getWarehouses().map(w => w.id);
  if (u.role === 'super_admin') return s.users.filter(usr => usr.id !== u.id);
  
  const levels = { employee: 1, staff: 2, manager: 3, admin: 4, super_admin: 5 };
  const myLevel = levels[u.role] || 1;
  
  return s.users.filter(usr => 
    myWhs.includes(usr.warehouseId) && 
    (levels[usr.role] || 1) <= myLevel
  );
}

async function createUser(data) {
  const u = getCurrentUser();
  if (u.role !== 'super_admin' && u.role !== 'admin') {
    return { error: 'Unauthorized: Only Super Admins and Admins can create workforce members.' };
  }
  
  const res = await apiFetch('/workforce/', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  
  if (res.error) {
    return { error: res.error };
  }
  
  const user = res.data;
  if (user._id && !user.id) {
    user.id = user._id;
  }
  
  const s = getStore();
  s.users.push(user);
  saveStore();
  
  await syncWithBackend();
  return { user };
}

async function updateUser(id, data) {
  const res = await apiFetch(`/workforce/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  
  if (res.error) {
    return { error: res.error };
  }
  
  const user = res.data;
  if (user._id && !user.id) {
    user.id = user._id;
  }
  
  const s = getStore();
  const idx = s.users.findIndex(usr => usr.id === id);
  if (idx !== -1) {
    s.users[idx] = { ...s.users[idx], ...user };
  } else {
    s.users.push(user);
  }
  saveStore();
  
  await syncWithBackend();
  return user;
}

async function deleteUser(id) {
  const res = await apiFetch(`/workforce/${id}`, {
    method: 'DELETE'
  });
  
  if (res.error) {
    return { error: res.error };
  }
  
  const s = getStore();
  s.users = s.users.filter(usr => usr.id !== id);
  saveStore();
  
  await syncWithBackend();
  return { success: true };
}

// ---- ITEMS / INVENTORY ----
function getItems(warehouseId) {
  const s = getStore();
  if (warehouseId) return s.items.filter(i => i.warehouseId === warehouseId);
  const u = getCurrentUser();
  if (!u) return [];
  if (u.role === 'super_admin') {
    const myWhs = getWarehouses().map(w => w.id);
    return s.items.filter(i => myWhs.includes(i.warehouseId));
  }
  return s.items.filter(i => i.warehouseId === u.warehouseId);
}

async function createItem(data) {
  const res = await apiFetch('/items/', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

async function updateItem(id, data) {
  const res = await apiFetch(`/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

async function deleteItem(id) {
  const res = await apiFetch(`/items/${id}`, {
    method: 'DELETE'
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return true;
}

// ---- TABLES ----
function getTables(warehouseId) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u) return [];
  let tables = s.tables;
  if (u.role === 'super_admin') {
    const myWhs = getWarehouses().map(w => w.id);
    tables = tables.filter(t => !t.warehouseId || myWhs.includes(t.warehouseId));
  } else {
    tables = tables.filter(t => t.warehouseId === u.warehouseId);
  }
  if (warehouseId) tables = tables.filter(t => t.warehouseId === warehouseId);
  return tables;
}

async function createTable(data) {
  const res = await apiFetch('/dynamic-tables/', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

async function updateTable(id, data) {
  const res = await apiFetch(`/dynamic-tables/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

async function deleteTable(id) {
  const res = await apiFetch(`/dynamic-tables/${id}`, {
    method: 'DELETE'
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return true;
}

function getTableData(tableId) {
  const s = getStore();
  return s.tableData[tableId] || [];
}

async function addTableRow(tableId, row) {
  const res = await apiFetch(`/dynamic-tables/${tableId}/rows`, {
    method: 'POST',
    body: JSON.stringify(row)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

async function updateTableRow(tableId, rowId, data) {
  const res = await apiFetch(`/dynamic-tables/${tableId}/rows/${rowId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

async function deleteTableRow(tableId, rowId) {
  const res = await apiFetch(`/dynamic-tables/${tableId}/rows/${rowId}`, {
    method: 'DELETE'
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return true;
}

// ---- BILLS ----
function getBills(warehouseId) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u) return [];
  if (u.role === 'super_admin') {
    const myWhs = getWarehouses().map(w => w.id);
    const bills = s.bills.filter(b => myWhs.includes(b.warehouseId));
    if (warehouseId) return bills.filter(b => b.warehouseId === warehouseId);
    return bills;
  }
  
  const levels = { employee: 1, staff: 2, manager: 3, admin: 4, super_admin: 5 };
  const myLevel = levels[u.role] || 1;
  const visibleUsers = s.users.filter(usr => 
    usr.warehouseId === u.warehouseId && 
    (levels[usr.role] || 1) <= myLevel
  ).map(usr => usr.id);
  
  if (!visibleUsers.includes(u.id)) visibleUsers.push(u.id);

  return s.bills.filter(b => 
    b.warehouseId === u.warehouseId && 
    visibleUsers.includes(b.createdBy)
  );
}

async function createBill(data) {
  const res = await apiFetch('/billing/', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

// ---- AUDIT LOGS ----
function addAuditLog(action, description, userId) {
  const s = getStore();
  const u = s.users.find(u => u.id === userId);
  s.auditLogs.unshift({
    id: 'log' + Date.now(), action, description,
    userId, userName: u ? u.name : 'System',
    warehouseId: u ? u.warehouseId : null,
    timestamp: new Date().toISOString()
  });
  // Increased limit for enterprise compliance and historical tracking
  if (s.auditLogs.length > 5000) s.auditLogs = s.auditLogs.slice(0, 5000);
  saveStore();
}

function getAuditLogs() {
  const s = getStore();
  const u = getCurrentUser();
  if (!u) return [];
  if (u.role === 'super_admin') {
    const myWhs = getWarehouses().map(w => w.id);
    return s.auditLogs.filter(l => !l.warehouseId || myWhs.includes(l.warehouseId) || l.userId === u.id);
  }
  
  const levels = { employee: 1, staff: 2, manager: 3, admin: 4, super_admin: 5 };
  const myLevel = levels[u.role] || 1;
  
  // Find users in the same warehouse with a role level <= myLevel
  // This ensures upward-reflection only (a Manager sees Staff logs, but Staff doesn't see Manager logs)
  const visibleUsers = s.users.filter(usr => 
    usr.warehouseId === u.warehouseId && 
    (levels[usr.role] || 1) <= myLevel
  ).map(usr => usr.id);
  
  if (!visibleUsers.includes(u.id)) visibleUsers.push(u.id);

  return s.auditLogs.filter(l => 
    l.warehouseId === u.warehouseId && 
    visibleUsers.includes(l.userId)
  );
}

// ---- NOTIFICATIONS ----
function getNotifications() {
  const s = getStore();
  const u = getCurrentUser();
  if (!u) return [];
  if (!s.notifications) s.notifications = [];
  return s.notifications.filter(n => n.userId === u.id).sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp));
}

async function addNotification(type, title, message, link, targetWarehouseId = null) {
  const s = getStore();
  const u = getCurrentUser();
  let targets = [];

  if (type === 'global') {
    targets = s.users.map(usr => usr.id);
  } else if (u) {
    const levels = { employee: 1, staff: 2, manager: 3, admin: 4, super_admin: 5 };
    const myLevel = levels[u.role] || 1;
    
    // Find superiors in the same warehouse (upward reflection)
    const whId = targetWarehouseId || u.warehouseId;
    if (whId) {
      const superiors = s.users.filter(usr => 
        usr.warehouseId === whId && 
        (levels[usr.role] || 1) >= myLevel
      ).map(usr => usr.id);
      targets.push(...superiors);
    }
    
    // Always notify super admins
    const superAdmins = s.users.filter(usr => usr.role === 'super_admin').map(usr => usr.id);
    targets.push(...superAdmins);
    
    // Always include the user who triggered it
    targets.push(u.id);
    
    targets = [...new Set(targets)];
  } else {
    // System generated - notify super admins
    targets = s.users.filter(usr => usr.role === 'super_admin').map(usr => usr.id);
  }

  const notificationsToCreate = [];
  targets.forEach(uid => {
    const usr = s.users.find(usr => usr.id === uid);
    
    // Respect granular user notification settings
    const prefs = usr?.settings?.notifications;
    if (prefs) {
      if ((type.includes('bill')) && prefs.billing === false) return;
      if ((type.includes('item') || type.includes('stock')) && prefs.stock === false) return;
      if ((type.includes('user')) && prefs.user === false) return;
      if ((type === 'system') && prefs.system === false) return;
    }
    
    notificationsToCreate.push({
      type, title, message, userId: uid,
      targetWarehouseId: targetWarehouseId || (usr ? usr.warehouseId : null),
      link: link || '/dashboard',
      timestamp: new Date().toISOString()
    });
  });

  if (notificationsToCreate.length > 0) {
    await apiFetch('/realtime/notifications', {
      method: 'POST',
      body: JSON.stringify(notificationsToCreate)
    });
  }

  await syncWithBackend();
}

async function clearNotifications() {
  await apiFetch('/realtime/notifications/clear', { method: 'DELETE' });
  await syncWithBackend();
}

async function markNotificationRead(id) {
  await apiFetch(`/realtime/notifications/${id}/read`, { method: 'PUT' });
  await syncWithBackend();
}

async function markAllNotificationsRead() {
  await apiFetch('/realtime/notifications/read-all', { method: 'PUT' });
  await syncWithBackend();
}

// ---- TAX CONFIG ----
function getTaxConfig(warehouseId) {
  const s = getStore();
  if (!s.taxConfig) s.taxConfig = { luxury: 15, normal: 5 };
  
  // Support for regional compliance: Check for warehouse-specific overrides
  if (warehouseId) {
    const wh = s.warehouses.find(w => w.id === warehouseId);
    if (wh && wh.taxConfig) return wh.taxConfig;
  }
  
  return s.taxConfig;
}

function getTaxRates(warehouseId) {
  const cfg = getTaxConfig(warehouseId);
  return { luxury: (cfg.luxury || 0) / 100, normal: (cfg.normal || 0) / 100 };
}

async function saveTaxConfig(config) {
  const s = getStore();
  s.taxConfig = { ...s.taxConfig, ...config };
  saveStore();
  
  await apiFetch('/audit-logs/', {
    method: 'POST',
    body: JSON.stringify({
      action: 'settings_update',
      description: `Tax config updated: Normal ${config.normal}%, Luxury ${config.luxury}%`,
      warehouseId: s.currentWarehouseId || null
    })
  });
  
  await syncWithBackend();
}

// ---- SUBSCRIPTION ----
function getSubscription() {
  const s = getStore();
  if (!s.subscription) s.subscription = { plan: 'enterprise', startDate: new Date().toISOString(), status: 'active', warehouseLimit: -1 };
  return s.subscription;
}

function getPlanWarehouseLimit() {
  const sub = getSubscription();
  if (sub.plan === 'starter') return 1;
  return -1; // unlimited
}

// ---- SEED DATA ----
function seedDemoData() {
  // Safe zero-data startup starter: No demo seeding
}

// ---- WEB-SOCKET CONNECTION CLIENT ----
let ws = null;
function connectWebSocket() {
  if (typeof window === 'undefined') return;
  const token = localStorage.getItem('access_token');
  if (!token) return;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  let hostname = window.location.hostname || '127.0.0.1';
  if (hostname === 'localhost' || hostname === '[::1]') {
    hostname = '127.0.0.1';
  }
  const wsUrl = `ws://${hostname}:8000/api/v1/realtime/ws?token=${token}`;
  console.log('[WebSocket] Connecting to:', wsUrl);
  ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      console.log('[WebSocket] Event received:', payload);
      
      // Auto-synchronize the client dataset when real-time updates are received
      if (payload.type || payload.event_type) {
        syncWithBackend();
      }
    } catch (err) {
      console.error('[WebSocket] Failed parsing message:', err);
    }
  };

  ws.onclose = (event) => {
    console.log('[WebSocket] Connection closed. Reason:', event.reason);
    // Exponential backoff / auto reconnect in 5 seconds
    if (localStorage.getItem('access_token')) {
      setTimeout(connectWebSocket, 5000);
    }
  };

  ws.onerror = (err) => {
    console.error('[WebSocket] Error:', err);
    ws.close();
  };
}

// ===== modules/router.js =====
/**
 * Router — Hash-based SPA routing (simplified, not used directly by app.js)
 */


function navigate(path) {
  window.location.hash = '#' + path;
}

function getCurrentPath() {
  const hash = window.location.hash.slice(1);
  return hash.split('?')[0] || '/';
}

function getCurrentParams() {
  const hash = window.location.hash.slice(1);
  const [, qs] = hash.split('?');
  if (!qs) return {};
  return Object.fromEntries(new URLSearchParams(qs));
}

function isActive(path) {
  return getCurrentPath() === path;
}

// ===== modules/ui.js =====
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

function showToast(title, message = '', type = 'info', duration = 4000) {
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
function createModal({ title, body, footer, size = '', onClose }) {
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
function confirm(message, title = 'Confirm') {
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
function el(tag, classes = '', innerHTML = '', attrs = {}) {
  const elem = document.createElement(tag);
  if (classes) elem.className = classes;
  if (innerHTML) elem.innerHTML = innerHTML;
  Object.entries(attrs).forEach(([k, v]) => elem.setAttribute(k, v));
  return elem;
}

function render(selector, content) {
  const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!container) return;
  if (typeof content === 'string') container.innerHTML = content;
  else { container.innerHTML = ''; container.appendChild(content); }
}

// ---- FORMATTERS ----
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(val) {
  return '$' + Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

function roleBadge(role) {
  const labels = { super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager', staff: 'Staff', employee: 'Employee' };
  const cls = { super_admin: 'role-super-admin', admin: 'role-admin', manager: 'role-manager', staff: 'role-staff', employee: 'role-employee' };
  return `<span class="badge ${cls[role] || 'badge-muted'}">${labels[role] || role}</span>`;
}

function statusBadge(status) {
  const map = { active: 'badge-success', inactive: 'badge-danger', pending: 'badge-warning' };
  return `<span class="badge ${map[status] || 'badge-muted'}"><span class="status-dot ${status}"></span>${capitalize(status)}</span>`;
}

// ---- TABLE BUILDER ----
function buildDataTable({ columns, data, onEdit, onDelete, onView, emptyMsg = 'No records found' }) {
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
function filterData(data, query, fields) {
  if (!query) return data;
  const q = query.toLowerCase();
  return data.filter(item => fields.some(f => String(item[f] || '').toLowerCase().includes(q)));
}

// ---- PAGINATE ----
function paginate(data, page, perPage = 10) {
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
function positionFixedElement(anchor, element, options = {}) {
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

  element.style.position = 'fixed';
  element.style.top = top + 'px';
  element.style.left = left + 'px';
  element.style.right = 'auto';
  element.style.zIndex = '9999';
}

// ---- TIME HELPERS ----
function timeSince(iso) {
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

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function debounce(func, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

// ===== modules/exporter.js =====
/**
 * WareOps ERP — Export Engine
 * Supports CSV, XLSX-compatible TSV, and print-to-PDF
 * Role-gated: only exports data the current user can see
 */


// ─── helpers ────────────────────────────────────────────────────────────────

function esc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCSV(rows, cols, headers) {
  const head = (headers || cols).map(esc).join(',');
  const body = rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n');
  return head + '\n' + body;
}

function download(content, filename, mimeType) {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType + ';charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ─── role-gated data getters ────────────────────────────────────────────────

function getExportableData() {
  const user = getCurrentUser();
  if (!user) return null;

  const role = user.role;
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuperAdmin;
  const isManager = role === 'manager' || isAdmin;

  const warehouses = isSuperAdmin ? getWarehouses() : [];
  const users = isAdmin ? getAllUsers() : [];
  const items = getItems();         // already role-filtered in store
  const bills = getBills();         // already role-filtered in store
  const tables = getTables();       // already role-filtered in store
  const audit = isSuperAdmin ? getAuditLogs().slice(0, 500) : [];
  const taxCfg = isAdmin ? getTaxConfig() : null;

  return { user, role, isSuperAdmin, isAdmin, isManager, warehouses, users, items, bills, tables, audit, taxCfg };
}

// ─── CSV exports ─────────────────────────────────────────────────────────────

function exportCSV(entity) {
  const d = getExportableData();
  if (!d) return { error: 'Not logged in' };

  const ts = stamp();

  switch (entity) {
    case 'bills': {
      if (!d.isManager) return { error: 'Permission denied' };
      const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
      const rows = d.bills.map(b => ({
        'Invoice #': b.billNo,
        'Customer': b.customer,
        'Warehouse': whs[b.warehouseId] || b.warehouseId,
        'Items Count': (b.items||[]).length,
        'Subtotal': b.subtotal?.toFixed(2),
        'Tax': b.tax?.toFixed(2),
        'Total': b.total?.toFixed(2),
        'Date': new Date(b.createdAt).toLocaleDateString(),
        'Created By': b.createdBy,
      }));
      const cols = ['Invoice #','Customer','Warehouse','Items Count','Subtotal','Tax','Total','Date','Created By'];
      const csv = toCSV(rows, cols, cols);
      download(csv, `wareops-billing-${ts}.csv`, 'text/csv');
      return { count: rows.length, entity: 'Billing' };
    }

    case 'workforce': {
      if (!d.isAdmin) return { error: 'Permission denied: Admin+ required' };
      const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
      const rows = d.users.map(u => ({
        'Name': u.name,
        'Email': u.email,
        'Role': u.role,
        'Warehouse': whs[u.warehouseId] || (u.warehouseId || 'N/A'),
        'Status': u.status,
        'Employee ID': u.id,
        'Joined': new Date(u.createdAt).toLocaleDateString(),
        'Assigned By': u.assignedBy || '',
      }));
      const cols = ['Name','Email','Role','Warehouse','Status','Employee ID','Joined','Assigned By'];
      const csv = toCSV(rows, cols, cols);
      download(csv, `wareops-workforce-${ts}.csv`, 'text/csv');
      return { count: rows.length, entity: 'Workforce' };
    }

    case 'inventory': {
      if (!d.isManager) return { error: 'Permission denied' };
      const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
      const rows = d.items.map(i => ({
        'Name': i.name,
        'SKU': i.sku,
        'Category': i.category,
        'Tax Category': i.taxCategory,
        'Price': i.price?.toFixed(2),
        'Stock': i.stock,
        'Unit': i.unit,
        'Warehouse': whs[i.warehouseId] || i.warehouseId,
        'Added': new Date(i.createdAt).toLocaleDateString(),
      }));
      const cols = ['Name','SKU','Category','Tax Category','Price','Stock','Unit','Warehouse','Added'];
      const csv = toCSV(rows, cols, cols);
      download(csv, `wareops-inventory-${ts}.csv`, 'text/csv');
      return { count: rows.length, entity: 'Inventory' };
    }

    case 'warehouses': {
      if (!d.isSuperAdmin) return { error: 'Permission denied: Super Admin only' };
      const rows = d.warehouses.map(w => ({
        'Name': w.name,
        'Business': w.businessName,
        'Address': w.address,
        'Contact': w.contact,
        'Email': w.email,
        'Tax Pref': w.taxPreference,
        'Status': w.status,
        'Revenue': (w.revenue||0).toFixed(2),
        'Staff': w.staffCount||0,
        'Items': w.items||0,
        'Created': new Date(w.createdAt).toLocaleDateString(),
      }));
      const cols = ['Name','Business','Address','Contact','Email','Tax Pref','Status','Revenue','Staff','Items','Created'];
      const csv = toCSV(rows, cols, cols);
      download(csv, `wareops-warehouses-${ts}.csv`, 'text/csv');
      return { count: rows.length, entity: 'Warehouses' };
    }

    case 'audit': {
      if (!d.isSuperAdmin) return { error: 'Permission denied: Super Admin only' };
      const rows = d.audit.map(l => ({
        'Action': l.action,
        'Description': l.description,
        'User': l.userName,
        'User ID': l.userId,
        'Warehouse': l.warehouseId || 'Global',
        'Timestamp': new Date(l.timestamp).toLocaleString(),
      }));
      const cols = ['Action','Description','User','User ID','Warehouse','Timestamp'];
      const csv = toCSV(rows, cols, cols);
      download(csv, `wareops-audit-${ts}.csv`, 'text/csv');
      return { count: rows.length, entity: 'Audit Logs' };
    }

    case 'all': {
      if (!d.isAdmin) return { error: 'Permission denied: Admin+ required' };
      // Multi-sheet CSV separated by section markers
      const sections = [];

      if (d.isSuperAdmin && d.warehouses.length) {
        sections.push('## WAREHOUSES');
        const cols = ['name','businessName','address','contact','email','taxPreference','status','revenue'];
        const headers = ['Name','Business','Address','Contact','Email','Tax Pref','Status','Revenue'];
        sections.push(toCSV(d.warehouses, cols, headers));
      }

      if (d.users.length) {
        sections.push('\n## WORKFORCE');
        const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
        const rows = d.users.map(u => ({ ...u, warehouseName: whs[u.warehouseId]||'' }));
        sections.push(toCSV(rows, ['name','email','role','warehouseName','status','createdAt'],
          ['Name','Email','Role','Warehouse','Status','Joined']));
      }

      if (d.items.length) {
        sections.push('\n## INVENTORY');
        const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
        const rows = d.items.map(i => ({ ...i, warehouseName: whs[i.warehouseId]||'' }));
        sections.push(toCSV(rows, ['name','sku','category','taxCategory','price','stock','warehouseName'],
          ['Name','SKU','Category','Tax Cat','Price','Stock','Warehouse']));
      }

      if (d.bills.length) {
        sections.push('\n## BILLING');
        const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
        const rows = d.bills.map(b => ({ ...b, warehouseName: whs[b.warehouseId]||'' }));
        sections.push(toCSV(rows, ['billNo','customer','warehouseName','subtotal','tax','total','createdAt'],
          ['Invoice #','Customer','Warehouse','Subtotal','Tax','Total','Date']));
      }

      const full = `WareOps ERP — Full Export\nGenerated: ${new Date().toLocaleString()}\nUser: ${d.user.name} (${d.role})\n\n` + sections.join('\n');
      download(full, `wareops-full-export-${ts}.csv`, 'text/csv');
      return { count: d.bills.length + d.users.length + d.items.length, entity: 'Full Export' };
    }

    default:
      return { error: 'Unknown export entity: ' + entity };
  }
}

// ─── XLSX-compatible (Tab-Separated) ─────────────────────────────────────────

function exportXLSX(entity) {
  const d = getExportableData();
  if (!d) return { error: 'Not logged in' };

  // We generate a true XLSX-compatible HTML table file that Excel opens natively
  const ts = stamp();
  let sheetHTML = '';
  let filename = '';

  function htmlTable(headers, rows) {
    const head = '<tr>' + headers.map(h=>`<th style="background:#1e1b4b;color:white;padding:8px;font-weight:bold">${h}</th>`).join('') + '</tr>';
    const body = rows.map(r => '<tr>' + headers.map((h,i) => `<td style="padding:6px;border:1px solid #ddd">${esc(Object.values(r)[i]??'')}</td>`).join('') + '</tr>').join('');
    return `<table border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px">${head}${body}</table>`;
  }

  if (entity === 'bills' || entity === 'all') {
    if (!d.isManager) return { error: 'Permission denied' };
    const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
    const headers = ['Invoice #','Customer','Warehouse','Subtotal','Tax','Total','Date'];
    const rows = d.bills.map(b => ({
      a: b.billNo, b: b.customer, c: whs[b.warehouseId]||'',
      d: b.subtotal?.toFixed(2), e: b.tax?.toFixed(2), f: b.total?.toFixed(2),
      g: new Date(b.createdAt).toLocaleDateString()
    }));
    sheetHTML += `<h2 style="color:#1e1b4b">Billing (${rows.length} records)</h2>${htmlTable(headers, rows)}<br>`;
    filename = `wareops-billing-${ts}.xls`;
  }

  if (entity === 'workforce' || entity === 'all') {
    if (!d.isAdmin) return { error: 'Permission denied' };
    const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
    const headers = ['Name','Email','Role','Warehouse','Status','Employee ID','Joined'];
    const rows = d.users.map(u => ({
      a: u.name, b: u.email, c: u.role, d: whs[u.warehouseId]||'',
      e: u.status, f: u.id, g: new Date(u.createdAt).toLocaleDateString()
    }));
    sheetHTML += `<h2 style="color:#1e1b4b">Workforce (${rows.length} records)</h2>${htmlTable(headers, rows)}<br>`;
    if (entity === 'workforce') filename = `wareops-workforce-${ts}.xls`;
  }

  if (entity === 'inventory' || entity === 'all') {
    if (!d.isManager) return { error: 'Permission denied' };
    const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
    const headers = ['Name','SKU','Category','Tax Cat','Price','Stock','Warehouse'];
    const rows = d.items.map(i => ({
      a: i.name, b: i.sku, c: i.category, d: i.taxCategory,
      e: i.price?.toFixed(2), f: i.stock, g: whs[i.warehouseId]||''
    }));
    sheetHTML += `<h2 style="color:#1e1b4b">Inventory (${rows.length} records)</h2>${htmlTable(headers, rows)}<br>`;
    if (entity === 'inventory') filename = `wareops-inventory-${ts}.xls`;
  }

  if (entity === 'warehouses' || entity === 'all') {
    if (!d.isSuperAdmin) return entity === 'warehouses' ? { error: 'Super Admin only' } : null;
    if (d.isSuperAdmin) {
      const headers = ['Name','Business','Address','Contact','Email','Tax Pref','Status','Revenue'];
      const rows = d.warehouses.map(w => ({
        a: w.name, b: w.businessName, c: w.address, d: w.contact,
        e: w.email, f: w.taxPreference, g: w.status, h: (w.revenue||0).toFixed(2)
      }));
      sheetHTML += `<h2 style="color:#1e1b4b">Warehouses (${rows.length} records)</h2>${htmlTable(headers, rows)}<br>`;
      if (entity === 'warehouses') filename = `wareops-warehouses-${ts}.xls`;
    }
  }

  if (entity === 'all') filename = `wareops-full-export-${ts}.xls`;

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
    <x:ExcelWorksheet><x:Name>WareOps Export</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
    </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
    <style>body{font-family:Arial,sans-serif}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px}</style>
    </head><body>
    <h1 style="color:#1e1b4b">WareOps ERP Export</h1>
    <p>Generated: ${new Date().toLocaleString()} | User: ${d.user.name} (${d.role})</p>
    ${sheetHTML}
    </body></html>`;

  download(html, filename || `wareops-export-${ts}.xls`, 'application/vnd.ms-excel');
  return { count: d.bills.length + d.users.length + d.items.length, entity: 'Excel Export' };
}

// ─── Print-to-PDF ─────────────────────────────────────────────────────────────

function exportPDF(entity) {
  const d = getExportableData();
  if (!d) return { error: 'Not logged in' };
  if (!d.isManager) return { error: 'Permission denied' };

  const ts = new Date().toLocaleString();
  const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});

  let sections = '';

  if (entity === 'bills' || entity === 'all') {
    const rows = d.bills.map(b => `
      <tr>
        <td>${b.billNo}</td><td>${b.customer}</td>
        <td>${whs[b.warehouseId]||''}</td>
        <td>$${b.subtotal?.toFixed(2)}</td>
        <td>$${b.tax?.toFixed(2)}</td>
        <td><strong>$${b.total?.toFixed(2)}</strong></td>
        <td>${new Date(b.createdAt).toLocaleDateString()}</td>
      </tr>`).join('');
    sections += `<h2>💰 Billing (${d.bills.length} invoices)</h2>
      <table><thead><tr><th>Invoice #</th><th>Customer</th><th>Warehouse</th><th>Subtotal</th><th>Tax</th><th>Total</th><th>Date</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  if ((entity === 'workforce' || entity === 'all') && d.isAdmin) {
    const rows = d.users.map(u => `
      <tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>
      <td>${whs[u.warehouseId]||'Global'}</td><td>${u.status}</td></tr>`).join('');
    sections += `<h2>👥 Workforce (${d.users.length} members)</h2>
      <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Warehouse</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  if (entity === 'inventory' || entity === 'all') {
    const rows = d.items.map(i => `
      <tr><td>${i.name}</td><td>${i.sku}</td><td>${i.category}</td>
      <td>${i.taxCategory}</td><td>$${i.price?.toFixed(2)}</td><td>${i.stock}</td>
      <td>${whs[i.warehouseId]||''}</td></tr>`).join('');
    sections += `<h2>📦 Inventory (${d.items.length} items)</h2>
      <table><thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Tax Cat</th><th>Price</th><th>Stock</th><th>Warehouse</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  const win = window.open('', '_blank', 'width=1000,height=700');
  win.document.write(`<!DOCTYPE html><html><head><title>WareOps Export</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;padding:20mm;color:#111;background:#fff}
    h1{color:#1e1b4b;font-size:22px;margin-bottom:4px}
    h2{color:#6366f1;font-size:15px;margin:24px 0 10px}
    p{font-size:12px;color:#6b7280;margin-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px}
    th{background:#1e1b4b;color:white;padding:8px;text-align:left;font-size:11px}
    td{padding:7px 8px;border-bottom:1px solid #e5e7eb}
    tr:nth-child(even) td{background:#f9fafb}
    .no-print{text-align:center;padding:12px;background:#6366f1;color:white;cursor:pointer;font-size:14px;margin-bottom:20px}
    @page{size:A4;margin:15mm}
    @media print{.no-print{display:none}}
  </style></head><body>
  <div class="no-print" onclick="window.print()">🖨️ Click to Print / Save as PDF</div>
  <h1>WareOps ERP — Data Export</h1>
  <p>Generated: ${ts}</p>
  <p>User: ${d.user.name} · Role: ${d.role}</p>
  ${sections}
  <script>setTimeout(()=>window.print(),500);<\/script>
  </body></html>`);
  win.document.close();

  return { count: d.bills.length + d.users.length + d.items.length, entity: 'PDF Export' };
}

// ===== components/shell.js =====
/**
 * App Shell — Sidebar + Topbar + Main layout (v2)
 */





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

function renderShell(pageTitle, pageSubtitle, content) {
  const user = getCurrentUser();
  if (!user) { navigate('/login'); return; }

  const whs = getWarehouses();
  const whCount = user.role === 'super_admin' ? whs.length : (user.warehouseId ? 1 : 0);
  const whName = user.role === 'super_admin'
    ? `${whCount} Warehouse${whCount !== 1 ? 's' : ''}`
    : (whs.find(w => w.id === user.warehouseId)?.name || 'No Warehouse');
  const whAccessText = `${whCount} Warehouse${whCount !== 1 ? 's' : ''}`;

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
              <div class="sidebar-user-role" style="font-size:11px;color:var(--text-muted);font-weight:500;">${capitalize(user.role.replace('_', ' '))} · ${whAccessText}</div>
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
  dropdown.style.cssText = 'min-width:220px;';
  
  const isSidebar = anchor.id === 'user-menu-btn';
  
  // Use positionFixedElement to position the profile dropdown perfectly relative to anchor
  positionFixedElement(anchor, dropdown, {
    offset: 8,
    preferredAlign: isSidebar ? 'left' : 'right',
    preferredVertical: isSidebar ? 'top' : 'bottom'
  });

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
    if (!dropdown.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) dropdown.remove();
  }, { once: true }), 50);
  
  dropdown.querySelector('#dd-logout')?.addEventListener('click', async () => { dropdown.remove(); await logout(); navigate('/login'); });
  dropdown.querySelector('#dd-settings')?.addEventListener('click', () => { navigate('/settings'); dropdown.remove(); });
  dropdown.querySelector('#dd-subscription')?.addEventListener('click', () => { navigate('/subscription'); dropdown.remove(); });
}

function setPageContent(html) {
  const pc = document.getElementById('page-content');
  if (pc) { pc.innerHTML = html; pc.classList.add('page-enter'); }
}

function getPageContent() {
  return document.getElementById('page-content');
}

// ===== components/palette.js =====
/**
 * Command Palette Component — Ctrl+K for pro navigation
 */




let paletteOpen = false;
let query = '';
let selectedIndex = 0;
let results = [];

/**
 * Initializes the global keyboard listener for the Command Palette.
 * Listens for Ctrl+K (or Cmd+K on macOS) to trigger the overlay,
 * and Esc key to dismiss it when active.
 */
function initPalette() {
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
function togglePalette() {
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

  // Show Quick Insights if no query
  if (!query) {
    const totalRev = bills.reduce((sum, b) => sum + (b.total || 0), 0);
    const health = getStockHealth();
    matches.push({ type: 'insight', label: 'Quick Insight: Revenue', sub: `Total across all warehouses: ${formatCurrency(totalRev)}`, icon: '💰' });
    matches.push({ type: 'insight', label: 'Quick Insight: Inventory', sub: `Total items tracked: ${formatNumber(items.length)}`, icon: '📦' });
    matches.push({ type: 'insight', label: 'Quick Insight: Stock Health', sub: `Current status: ${health}% healthy`, icon: '🛡️' });
    matches.push({ type: 'divider', label: 'Suggested Commands' });
  }

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
    // We could potentially pass state to filter by this item
  } else if (cmd.type === 'warehouse') {
    navigate('/warehouses/' + cmd.id);
  }
}

// ===== pages/auth.js =====
/**
 * Auth Pages — Login, Signup, Warehouse Registration
 */




function authBgHTML() {
  return `<div class="auth-bg"></div><div class="auth-bg-grid"></div>`;
}

function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      ${authBgHTML()}
      <div class="auth-card animate-slideUp">
        <div class="auth-logo">
          <div class="auth-logo-icon">⚡</div>
          <span class="auth-logo-name">WareOps</span>
        </div>
        <h1 class="auth-title">Welcome back</h1>
        <p class="auth-subtitle">Sign in to your enterprise workspace</p>
        <form id="login-form">
          <div class="auth-input-group">
            <span class="auth-input-icon">📧</span>
            <input type="email" id="login-email" class="form-control" placeholder="Email address" required autocomplete="email" />
          </div>
          <div class="auth-input-group">
            <span class="auth-input-icon">🔒</span>
            <input type="password" id="login-password" class="form-control" placeholder="Password" required autocomplete="current-password" />
            <button type="button" class="auth-password-toggle" id="toggle-pw">👁️</button>
          </div>
          <button type="submit" class="btn btn-primary" id="login-btn">
            Sign In
          </button>
        </form>
        <div class="auth-footer">
          Don't have an account? <a href="#/signup">Create account</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';
    await new Promise(r => setTimeout(r, 600));
    const result = await login(email, password);
    if (result.error) {
      showToast('Login failed', result.error, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Sign In';
      return;
    }
    showToast('Welcome back!', `Signed in as ${result.name}`, 'success');
    const whs = getStore().warehouses.filter(w => w.ownerId === result.id || w.id === result.warehouseId);
    if (result.role === 'super_admin' && whs.length === 0) navigate('/register-warehouse');
    else navigate('/dashboard');
  });

  document.getElementById('toggle-pw')?.addEventListener('click', () => {
    const pw = document.getElementById('login-password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });


}

function renderSignup() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      ${authBgHTML()}
      <div class="auth-card animate-slideUp">
        <div class="auth-logo">
          <div class="auth-logo-icon">⚡</div>
          <span class="auth-logo-name">WareOps</span>
        </div>
        <h1 class="auth-title">Create your account</h1>
        <p class="auth-subtitle">Start your free enterprise workspace</p>
        <form id="signup-form">
          <div class="auth-input-group">
            <span class="auth-input-icon">👤</span>
            <input type="text" id="signup-name" class="form-control" placeholder="Full name" required />
          </div>
          <div class="auth-input-group">
            <span class="auth-input-icon">📧</span>
            <input type="email" id="signup-email" class="form-control" placeholder="Work email" required autocomplete="email" />
          </div>
          <div class="auth-input-group">
            <span class="auth-input-icon">🔒</span>
            <input type="password" id="signup-password" class="form-control" placeholder="Create password (min 8 chars)" required minlength="8" />
            <button type="button" class="auth-password-toggle" id="toggle-pw2">👁️</button>
          </div>
          <div style="margin-bottom:16px">
            <label class="checkbox-group">
              <input type="checkbox" required />
              <label style="color:var(--text-muted);font-size:13px">I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></label>
            </label>
          </div>
          <button type="submit" class="btn btn-primary" id="signup-btn">Create Account — It's Free</button>
        </form>
        <div class="auth-footer">
          Already have an account? <a href="#/login">Sign in</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const btn = document.getElementById('signup-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating account...';
    await new Promise(r => setTimeout(r, 700));
    const result = await signup(name, email, password);
    if (result.error) {
      showToast('Signup failed', result.error, 'error');
      btn.disabled = false;
      btn.innerHTML = "Create Account — It's Free";
      return;
    }
    showToast('Account created!', 'Now set up your first warehouse', 'success');
    navigate('/register-warehouse');
  });

  document.getElementById('toggle-pw2')?.addEventListener('click', () => {
    const pw = document.getElementById('signup-password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });
}

function renderWarehouseRegistration() {
  const user = getCurrentUser();
  if (!user) { navigate('/login'); return; }

  document.getElementById('app').innerHTML = `
    <div class="warehouse-reg-page">
      ${authBgHTML()}
      <header class="warehouse-reg-header">
        <div class="auth-logo-icon" style="width:36px;height:36px;background:var(--gradient-brand);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⚡</div>
        <span style="font-size:18px;font-weight:800;background:var(--gradient-brand);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">WareOps</span>
        <div style="margin-left:auto;display:flex;align-items:center;gap:12px">
          <div style="font-size:13px;color:var(--text-muted)">Signed in as <strong style="color:var(--text-primary)">${user.name}</strong></div>
          <button class="btn btn-ghost btn-sm" id="wh-signout-btn">Sign out</button>
        </div>
      </header>
      <div class="warehouse-reg-body">
        <div class="warehouse-reg-card animate-slideUp">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <span style="font-size:32px">🏭</span>
            <div>
              <h1 class="warehouse-reg-title">Register Your First Warehouse</h1>
              <p class="warehouse-reg-subtitle">This warehouse will be your primary operational hub</p>
            </div>
          </div>
          <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px 16px;margin-bottom:28px;display:flex;align-items:center;gap:10px">
            <span>👑</span>
            <span style="font-size:13px;color:var(--text-secondary)">You're registering as <strong style="color:var(--text-primary)">Super Admin</strong>. You can add more warehouses later from your dashboard.</span>
          </div>
          <form id="warehouse-form">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Warehouse Name <span class="req">*</span></label>
                <input type="text" id="wh-name" class="form-control" placeholder="e.g. North Hub" required />
              </div>
              <div class="form-group">
                <label class="form-label">Business Name <span class="req">*</span></label>
                <input type="text" id="wh-biz" class="form-control" placeholder="e.g. Acme Logistics Inc." required />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Address <span class="req">*</span></label>
              <input type="text" id="wh-address" class="form-control" placeholder="Full address including city, state, ZIP" required />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Contact Number <span class="req">*</span></label>
                <input type="tel" id="wh-contact" class="form-control" placeholder="+1-555-000-0000" required />
              </div>
              <div class="form-group">
                <label class="form-label">Email <span class="req">*</span></label>
                <input type="email" id="wh-email" class="form-control" placeholder="ops@company.com" required />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tax Preference <span style="color:var(--text-muted);font-size:11px">(Optional)</span></label>
                <select id="wh-tax" class="form-control">
                  <option value="standard">Standard (Normal: ${getTaxConfig().normal}%, Luxury: ${getTaxConfig().luxury}%)</option>
                  <option value="custom">Custom</option>
                  <option value="none">No Tax</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Warehouse Logo <span style="color:var(--text-muted);font-size:11px">(Optional)</span></label>
                <select id="wh-logo" class="form-control">
                  <option value="🏭">🏭 Factory</option>
                  <option value="🏗️">🏗️ Construction</option>
                  <option value="🚛">🚛 Logistics</option>
                  <option value="📦">📦 Storage</option>
                  <option value="🏢">🏢 Office</option>
                  <option value="⚙️">⚙️ Manufacturing</option>
                </select>
              </div>
            </div>
            <div style="display:flex;gap:12px;margin-top:8px">
              <button type="submit" class="btn btn-primary" style="flex:1;height:48px;font-size:15px" id="wh-submit-btn">
                🚀 Create Warehouse & Enter Dashboard
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById('wh-signout-btn')?.addEventListener('click', async () => {
    await logout();
    navigate('/login');
  });

  document.getElementById('warehouse-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('wh-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Setting up...';
    await new Promise(r => setTimeout(r, 800));
    const name = document.getElementById('wh-name').value.trim();
    const businessName = document.getElementById('wh-biz').value.trim();
    const address = document.getElementById('wh-address').value.trim();
    const contact = document.getElementById('wh-contact').value.trim();
    const email = document.getElementById('wh-email').value.trim();
    if (!name || !businessName || !address || !contact || !email) {
      showToast('Validation', 'Please fill all required fields', 'warning');
      btn.disabled = false;
      btn.innerHTML = '🚀 Create Warehouse & Enter Dashboard';
      return;
    }
    const wh = await createWarehouse({ name, businessName, address, contact, email, taxPreference: document.getElementById('wh-tax').value, logo: document.getElementById('wh-logo').value });
    if (wh.error) {
      showToast('Error', wh.error, 'error');
      btn.disabled = false;
      btn.innerHTML = '🚀 Create Warehouse & Enter Dashboard';
      return;
    }
    showToast('Warehouse created!', `${wh.name} is ready`, 'success');
    navigate('/dashboard');
  });
}

// ===== pages/dashboard.js =====
/**
 * Dashboard Page — Optimized compact layout
 */




// Track chart instances so we can destroy before re-rendering
const _dashboardCharts = {};

/**
 * Renders the main dashboard page for the ERP platform.
 * Dynamically computes key operational metrics (total revenue, taxes, stock units, active workforce)
 * based on user privileges (Super Admin global view or Warehouse-specific views).
 * Displays KPI cards, revenue charts, recent activity logs, and automated restock suggestions.
 * Mounts standard interaction buttons and floating actions.
 */
function renderDashboard() {
  const user = getCurrentUser();
  const whs = getWarehouses();
  const users = getAllUsers();
  const items = getItems();
  const bills = getBills();
  const logs = getAuditLogs().slice(0, 6);
  const sub = getSubscription();

  const totalRevenue = bills.reduce((s,b)=>s+(b.total||0),0);
  const totalTax    = bills.reduce((s,b)=>s+(b.tax||0),0);
  const totalStock  = items.reduce((s,i)=>s+(i.stock||0),0);
  const activeUsers = users.filter(u=>u.status==='active').length;
  const isSA = user.role === 'super_admin';
  const isAdmin = isSA || user.role === 'admin';

  // Low stock items
  const lowStock = items.filter(i=>(i.stock||0)<20).slice(0,5);

  // Top warehouse by revenue
  const topWh = whs.length ? [...whs].sort((a,b)=>(b.revenue||0)-(a.revenue||0))[0] : null;

  // Recent bills
  const recentBills = bills.slice(0,5);

  // Role-specific warehouse
  const myWh = !isSA ? whs.find(w=>w.id===user.warehouseId) : null;
  const roleLabel = isSA ? 'Global Overview' : `${myWh?.name || 'Warehouse'} Overview`;

  // Smart Restock Logic: Identify items with low stock relative to sales velocity
  const restockSuggestions = items
    .filter(i => (i.stock || 0) < 50)
    .map(i => {
      const salesCount = bills.reduce((acc, b) => acc + (b.items?.filter(bi => bi.id === i.id).reduce((s, bi) => s + bi.qty, 0) || 0), 0);
      const priority = (salesCount * 2) + (50 - (i.stock || 0));
      return { ...i, priority, salesCount };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);

  renderShell('Dashboard', roleLabel, `
    <div class="animate-slideUp">

      <!-- Welcome Banner -->
      <div style="background:var(--gradient-card);border:1px solid var(--border-brand);border-radius:var(--radius-xl);padding:20px 24px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="width:48px;height:48px;background:var(--gradient-brand);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:var(--shadow-brand);flex-shrink:0">👋</div>
        <div style="flex:1;min-width:0">
          <h2 style="font-size:20px;font-weight:800;margin-bottom:2px">Welcome back, ${user.name.split(' ')[0]}!</h2>
          <p style="color:var(--text-muted);font-size:13px">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})} · ${roleLabel}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isSA ? `<button class="btn btn-primary btn-sm" onclick="location.hash='#/warehouses'">🏭 Warehouses</button>
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/billing'">🧾 New Bill</button>` : ''}
          ${!isSA ? `<button class="btn btn-primary btn-sm" onclick="location.hash='#/billing'">🧾 New Bill</button>` : ''}
        </div>
      </div>

      <!-- KPI Cards — compact row -->
      <div class="stat-grid" style="margin-bottom:20px">
        ${isSA ? `<div class="stat-card">
          <div class="stat-card-glow" style="background:#6366f1"></div>
          <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">🏭</div>
          <div class="stat-card-value">${whs.length}</div>
          <div class="stat-card-label">Warehouses</div>
          <div class="stat-card-trend trend-up">${sub.plan} plan</div>
        </div>` : ''}
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#10b981"></div>
          <div class="stat-card-icon" style="background:rgba(16,185,129,0.15)">💰</div>
          <div class="stat-card-value">${formatCurrency(totalRevenue)}</div>
          <div class="stat-card-label">Revenue</div>
          <div class="stat-card-trend trend-up">Tax: ${formatCurrency(totalTax)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#8b5cf6"></div>
          <div class="stat-card-icon" style="background:rgba(139,92,246,0.15)">🧾</div>
          <div class="stat-card-value">${bills.length}</div>
          <div class="stat-card-label">Invoices</div>
          <div class="stat-card-trend trend-up">↑ This period</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#06b6d4"></div>
          <div class="stat-card-icon" style="background:rgba(6,182,212,0.15)">👥</div>
          <div class="stat-card-value">${activeUsers}</div>
          <div class="stat-card-label">Active Users</div>
          <div class="stat-card-trend">${users.length} total</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#f59e0b"></div>
          <div class="stat-card-icon" style="background:rgba(245,158,11,0.15)">📦</div>
          <div class="stat-card-value">${totalStock.toLocaleString()}</div>
          <div class="stat-card-label">Stock Units</div>
          <div class="stat-card-trend ${lowStock.length>0?'trend-down':'trend-up'}">${lowStock.length} low stock</div>
        </div>
        ${isSA ? `<div class="stat-card" style="cursor:pointer" onclick="location.hash='#/subscription'">
          <div class="stat-card-glow" style="background:#f43f5e"></div>
          <div class="stat-card-icon" style="background:rgba(244,63,94,0.15)">💳</div>
          <div class="stat-card-value" style="font-size:16px;text-transform:capitalize">${sub.plan}</div>
          <div class="stat-card-label">Plan</div>
          <div class="stat-card-trend trend-up">● Active</div>
        </div>` : ''}
      </div>

      <!-- Main content grid -->
      <div class="dashboard-grid">

        <!-- Revenue Chart -->
        <div class="chart-card col-8">
          <div class="chart-card-header">
            <div>
              <div class="chart-card-title">📈 Revenue Trend</div>
              <div class="chart-card-subtitle">Last 6 months across all warehouses</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" id="chart-6m" style="font-size:11px;padding:4px 8px">6M</button>
              <button class="btn btn-ghost btn-sm" id="chart-1y" style="font-size:11px;padding:4px 8px">1Y</button>
            </div>
          </div>
          <div class="chart-container" style="height:180px"><canvas id="revenue-chart"></canvas></div>
        </div>

        <!-- Activity Feed -->
        <div class="chart-card col-4">
          <div class="chart-card-header">
            <div class="chart-card-title">⚡ Activity</div>
            <button class="btn btn-ghost btn-sm" onclick="location.hash='#/audit'" style="font-size:11px">All →</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:0">
            ${logs.length === 0 ? `<div style="color:var(--text-muted);font-size:13px;padding:12px 0">No recent activity</div>` :
              logs.map(log=>`
                <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
                  <div style="width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0;background:${log.action.includes('create')?'var(--accent-emerald)':log.action.includes('delete')?'var(--accent-rose)':'var(--accent-cyan)'}"></div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${log.description}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${log.userName} · ${formatDate(log.timestamp)}</div>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
      </div>

      <!-- Second row -->
      <div class="dashboard-grid">

        <!-- Warehouse Summary -->
        ${isSA ? `
        <div class="chart-card col-4">
          <div class="chart-card-header">
            <div class="chart-card-title">🏭 Warehouses</div>
            <button class="btn btn-primary btn-sm" onclick="location.hash='#/warehouses'" style="font-size:11px;padding:4px 10px">Manage</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${whs.slice(0,4).map(wh=>`
              <div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg-input);border-radius:8px;cursor:pointer" onclick="location.hash='#/warehouses/${wh.id}'">
                <div style="font-size:20px">${wh.logo||'🏭'}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${wh.name}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${wh.staffCount||0} staff · ${formatCurrency(wh.revenue||0)}</div>
                </div>
                <span class="badge badge-success" style="font-size:10px">●</span>
              </div>
            `).join('')}
            ${whs.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No warehouses yet</div>` : ''}
          </div>
        </div>` : `<div class="chart-card">
          <div class="chart-card-header">
            <div class="chart-card-title">🏭 My Warehouse</div>
          </div>
          ${myWh ? `
          <div style="text-align:center;padding:8px 0">
            <div style="font-size:40px;margin-bottom:8px">${myWh.logo||'🏭'}</div>
            <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${myWh.name}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${myWh.businessName}</div>
            <div style="display:flex;justify-content:center;gap:20px">
              <div><div style="font-weight:700;font-size:18px">${myWh.staffCount||0}</div><div style="font-size:11px;color:var(--text-muted)">Staff</div></div>
              <div><div style="font-weight:700;font-size:18px">${myWh.items||0}</div><div style="font-size:11px;color:var(--text-muted)">Items</div></div>
            </div>
          </div>` : '<div style="color:var(--text-muted);text-align:center;padding:20px">Not assigned</div>'}
        </div>`}

        <!-- Billing Quick Stats -->
        <div class="chart-card col-4">
          <div class="chart-card-header">
            <div class="chart-card-title">💰 Billing Stats</div>
            <button class="btn btn-ghost btn-sm" onclick="location.hash='#/billing'" style="font-size:11px">View →</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
            ${[
              { label:'Total Revenue', val: formatCurrency(totalRevenue), color:'var(--accent-emerald)' },
              { label:'Total Tax',     val: formatCurrency(totalTax),    color:'var(--accent-amber)'   },
              { label:'Net Revenue',   val: formatCurrency(totalRevenue-totalTax), color:'var(--text-brand)' },
              { label:'Avg Invoice',   val: bills.length ? formatCurrency(totalRevenue/bills.length) : '$0', color:'var(--accent-cyan)' },
            ].map(s=>`
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:12px;color:var(--text-muted)">${s.label}</span>
                <span style="font-size:14px;font-weight:700;color:${s.color}">${s.val}</span>
              </div>
            `).join('')}
          </div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px">Recent</div>
          ${recentBills.slice(0,3).map(b=>`
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border-subtle)">
              <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${b.billNo}</div>
              <div style="font-size:11px;font-weight:600;color:var(--accent-emerald)">${formatCurrency(b.total)}</div>
            </div>
          `).join('')}
        </div>

        <!-- Low Stock Alerts -->
        <div class="chart-card col-4">
          <div class="chart-card-header">
            <div class="chart-card-title">⚠️ Low Stock</div>
            <button class="btn btn-ghost btn-sm" onclick="location.hash='#/items'" style="font-size:11px">View →</button>
          </div>
          ${lowStock.length === 0
            ? `<div style="text-align:center;padding:16px;color:var(--accent-emerald);font-size:13px">✅ All stock levels healthy</div>`
            : lowStock.map(i=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-subtle)">
                <div style="font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${i.name}</div>
                <span style="font-size:11px;font-weight:700;color:${i.stock<10?'var(--accent-rose)':'var(--accent-amber)'};flex-shrink:0;margin-left:8px">${i.stock} left</span>
              </div>
            `).join('')}
          <div style="margin-top:12px;border-top:1px solid var(--border-subtle);padding-top:12px">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">Quick Actions</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              ${[
                { icon:'📦', label:'Add Item',   href:'/items'     },
                { icon:'🧾', label:'New Bill',   href:'/billing'   },
                { icon:'👥', label:'Workforce',  href:'/workforce' },
                { icon:'📈', label:'Reports',    href:'/analytics' },
              ].filter(a=>isAdmin || (a.href!=='/workforce')).map(a=>`
                <button class="btn btn-secondary btn-sm" onclick="location.hash='#${a.href}'" style="font-size:11px;padding:6px 8px;justify-content:flex-start;gap:5px">${a.icon} ${a.label}</button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Third Row -->
      <div class="dashboard-grid">
        
        <!-- Smart Restock Recommender -->
        <div class="chart-card col-5">
          <div class="chart-card-header">
            <div>
              <div class="chart-card-title">💡 Smart Restock</div>
              <div class="chart-card-subtitle">AI-prioritized inventory needs</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${restockSuggestions.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--text-muted)">Stock levels optimal</div>' :
              restockSuggestions.map(s => `
                <div style="background:rgba(99,102,241,0.05);padding:12px;border-radius:10px;border:1px solid rgba(99,102,241,0.1);display:flex;align-items:center;gap:12px">
                  <div style="width:36px;height:36px;background:var(--bg-card);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px">📦</div>
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${s.name}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${s.salesCount} sold recently · Priority: ${s.priority > 30 ? 'High 🔥' : 'Medium'}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:14px;font-weight:800;color:${s.stock < 10 ? 'var(--accent-rose)' : 'var(--accent-amber)'}">${s.stock}</div>
                    <div style="font-size:10px;color:var(--text-muted)">In Stock</div>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>

        <!-- Revenue Summary -->
        <div class="chart-card col-7">
          <div class="chart-card-header">
            <div class="chart-card-title">📊 Revenue Summary</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div style="padding:15px;background:var(--bg-input);border-radius:12px;text-align:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px">Gross Revenue</div>
              <div style="font-size:18px;font-weight:800;color:var(--accent-emerald)">${formatCurrency(totalRevenue).split('.')[0]}</div>
            </div>
            <div style="padding:15px;background:var(--bg-input);border-radius:12px;text-align:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px">Total Tax</div>
              <div style="font-size:18px;font-weight:800;color:var(--accent-amber)">${formatCurrency(totalTax).split('.')[0]}</div>
            </div>
            <div style="padding:15px;background:var(--bg-input);border-radius:12px;text-align:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px">Net Earnings</div>
              <div style="font-size:18px;font-weight:800;color:var(--text-brand)">${formatCurrency(totalRevenue-totalTax).split('.')[0]}</div>
            </div>
          </div>
          <div style="margin-top:15px;padding:15px;background:linear-gradient(90deg, rgba(99,102,241,0.1), transparent);border-radius:12px;display:flex;align-items:center;gap:12px">
            <div style="font-size:24px">📈</div>
            <div>
              <div style="font-size:13px;font-weight:700">Projected Growth</div>
              <div style="font-size:11px;color:var(--text-muted)">Expected +12% increase based on current month volume</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Workforce Summary -->
      ${isAdmin ? `
      <div class="dashboard-grid">
        <div class="chart-card col-6">
          <div class="chart-card-header">
            <div class="chart-card-title">👥 Workforce Summary</div>
            <button class="btn btn-primary btn-sm" onclick="location.hash='#/workforce'" style="font-size:11px;padding:4px 10px">Manage</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
            ${['admin','manager','staff','employee'].map(r=>{
              const count = users.filter(u=>u.role===r).length;
              const icons={admin:'🔵',manager:'🟢',staff:'🟡',employee:'⚫'};
              return `<div style="text-align:center;padding:10px;background:var(--bg-input);border-radius:8px">
                <div style="font-size:16px;margin-bottom:4px">${icons[r]}</div>
                <div style="font-size:18px;font-weight:800;color:var(--text-primary)">${count}</div>
                <div style="font-size:10px;color:var(--text-muted);text-transform:capitalize">${r}</div>
              </div>`;
            }).join('')}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${users.slice(0,4).map(u=>`
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:28px;height:28px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0">${u.avatar}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
                </div>
                <span style="font-size:10px;color:var(--text-muted)">${u.role}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Warehouse Distribution -->
        <div class="chart-card col-6">
          <div class="chart-card-header">
            <div class="chart-card-title">📊 Revenue by Warehouse</div>
          </div>
          <div class="chart-container" style="height:160px"><canvas id="wh-chart"></canvas></div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:8px">
            ${whs.slice(0,5).map((wh,i)=>{
              const palette = ['#6366f1','#10b981','#06b6d4','#f59e0b','#a855f7'];
              const pct = totalRevenue>0 ? Math.round((wh.revenue||0)/totalRevenue*100) : 0;
              return `<div style="display:flex;align-items:center;gap:8px;font-size:11px">
                <div style="width:10px;height:10px;border-radius:2px;background:${palette[i % palette.length]};flex-shrink:0"></div>
                <span style="color:var(--text-muted);flex:1">${wh.name}</span>
                <span style="font-weight:600;color:var(--text-primary)">${pct}%</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : `
        <div class="chart-card col-6">
          <div class="chart-card-header"><div class="chart-card-title">📋 My Tables</div></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="location.hash='#/tables'" style="width:100%">📋 View My Tables</button>
            <button class="btn btn-secondary btn-sm" onclick="location.hash='#/analytics'" style="width:100%">📈 View Reports</button>
            <button class="btn btn-secondary btn-sm" onclick="location.hash='#/items'" style="width:100%">📦 Manage Inventory</button>
          </div>
        </div>`}
      </div>

    </div>

    <!-- Floating Action Button for Quick Invoicing -->
    <button class="fab" onclick="location.hash='#/billing'" title="Quick Invoice">
      <span style="font-size:24px">🧾</span>
    </button>
  `);

  setTimeout(() => initDashboardCharts(bills, whs), 100);
}

/**
 * Initializes and draws the dashboard analytics charts.
 * Creates a monthly revenue bar chart and a warehouse revenue distribution doughnut chart.
 * Recreates instances as needed to avoid resource leaks or overlay duplication.
 * @param {Array<Object>} bills - Loaded invoices/billing items.
 * @param {Array<Object>} whs - Active warehouses.
 * @private
 */
function initDashboardCharts(bills, whs) {
  // Revenue trend chart
  const now = new Date();
  const labels = [];
  const data = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    labels.push(d.toLocaleString('default',{month:'short'}));
    const monthRevenue = bills.filter(b=>{
      const bd = new Date(b.createdAt);
      return bd.getMonth()===d.getMonth() && bd.getFullYear()===d.getFullYear();
    }).reduce((s,b)=>s+(b.total||0),0);
    data.push(monthRevenue || 0);
  }

  const rc = document.getElementById('revenue-chart');
  if (rc) {
    if (_dashboardCharts.revenue) _dashboardCharts.revenue.destroy();
    _dashboardCharts.revenue = new Chart(rc, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Revenue',
          data,
          backgroundColor: data.map((_,i)=>i===data.length-1?'rgba(99,102,241,0.9)':'rgba(99,102,241,0.35)'),
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor:'#1a1d3a', titleColor:'#f1f5f9', bodyColor:'#94a3b8', borderColor:'#2a2d4a', borderWidth:1,
            callbacks: { label: ctx => ' $' + ctx.raw.toLocaleString() }
          }
        },
        scales: {
          x: { grid: { display:false }, ticks: { color:'#64748b', font:{size:11} } },
          y: { grid: { color:'rgba(255,255,255,0.04)' }, ticks: { color:'#64748b', font:{size:11}, callback: v=>'$'+(v/1000).toFixed(0)+'k' }, border:{display:false} }
        }
      }
    });
  }

  // Doughnut chart
  const wc = document.getElementById('wh-chart');
  if (wc && whs.length > 0) {
    if (_dashboardCharts.wh) _dashboardCharts.wh.destroy();
    
    // Generate colors cyclically based on number of warehouses
    const palette = ['rgba(99,102,241,0.85)', 'rgba(16,185,129,0.85)', 'rgba(6,182,212,0.85)', 'rgba(245,158,11,0.85)', 'rgba(168,85,247,0.85)'];
    const bgColors = whs.map((_, i) => palette[i % palette.length]);
    
    _dashboardCharts.wh = new Chart(wc, {
      type: 'doughnut',
      data: {
        labels: whs.map(w=>w.name),
        datasets: [{
          data: whs.map(w=>w.revenue||0),
          backgroundColor: bgColors,
          borderColor: '#0f1029', borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor:'#1a1d3a', titleColor:'#f1f5f9', bodyColor:'#94a3b8',
            callbacks: { label: ctx => ' $' + ctx.raw.toLocaleString() }
          }
        },
        cutout: '70%'
      }
    });
  }
}

// ===== pages/warehouses.js =====
/**
 * Warehouses Page — CRUD for warehouse management (Super Admin only)
 */





let wh_currentView = 'grid';
let wh_searchQuery = '';

function renderWarehouses() {
  const user = getCurrentUser();
  if (!user || user.role !== 'super_admin') { navigate('/dashboard'); return; }

  refreshShell();
}

function refreshShell() {
  const user = getCurrentUser();
  const whs = getWarehouses();
  const allUsers = getAllUsers();
  const sub = getSubscription();
  const limit = getPlanWarehouseLimit();
  const atLimit = limit > 0 && whs.length >= limit;
  const planLabel = sub.plan === 'starter' ? 'Starter (1 warehouse)' : 'Enterprise (Unlimited)';

  renderShell('Warehouses', 'Manage all your warehouse locations', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">🏭 Warehouse Management</h1>
          <p class="page-subtitle">Centralized control for all warehouse locations · <span style="color:var(--text-brand);font-weight:600">${planLabel}</span></p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" id="view-toggle">☰ Table</button>
          <button class="btn btn-primary" id="create-wh-btn" ${atLimit ? 'disabled title="Warehouse limit reached for your plan"' : ''}>
            + New Warehouse ${atLimit ? '🔒' : ''}
          </button>
        </div>
      </div>

      ${atLimit ? `
      <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px">
        <span style="font-size:20px">⚠️</span>
        <div>
          <div style="font-weight:700;font-size:13px;color:var(--text-primary)">Warehouse Limit Reached</div>
          <div style="font-size:12px;color:var(--text-muted)">Your <strong>Starter plan</strong> allows only 1 warehouse. <a href="#/subscription" style="color:var(--text-brand)">Upgrade to Enterprise</a> for unlimited warehouses.</div>
        </div>
      </div>` : ''}

      <!-- Summary Stat Cards -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">🏭</div>
          <div class="stat-card-value" id="wh-count">${whs.length}</div>
          <div class="stat-card-label">Total Warehouses</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(16,185,129,0.15)">✅</div>
          <div class="stat-card-value">${whs.filter(w=>w.status==='active').length}</div>
          <div class="stat-card-label">Active</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(6,182,212,0.15)">👥</div>
          <div class="stat-card-value">${allUsers.length}</div>
          <div class="stat-card-label">Total Staff</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(245,158,11,0.15)">💰</div>
          <div class="stat-card-value">${formatCurrency(whs.reduce((s,w)=>s+(w.revenue||0),0))}</div>
          <div class="stat-card-label">Combined Revenue</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(168,85,247,0.15)">📊</div>
          <div class="stat-card-value">${limit < 0 ? '∞' : limit}</div>
          <div class="stat-card-label">Plan Limit</div>
        </div>
      </div>

      <!-- Search + Filter -->
      <div class="table-toolbar" style="margin-bottom:20px">
        <div class="table-search" style="max-width:400px;flex:none">
          <span>🔍</span>
          <input type="text" id="wh-search" placeholder="Search warehouses..." />
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="wh-status-filter">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div id="wh-container">${renderWarehouseGrid(whs, allUsers)}</div>
    </div>
  `);

  // Bind events
  document.getElementById('create-wh-btn')?.addEventListener('click', () => {
    const currentWhs = getWarehouses();
    const lim = getPlanWarehouseLimit();
    if (lim > 0 && currentWhs.length >= lim) {
      showToast('Plan limit reached', `Your Starter plan allows only ${lim} warehouse. Upgrade to Enterprise for unlimited.`, 'warning');
      return;
    }
    showWarehouseModal(null);
  });

  const debouncedSearch = debounce(q => {
    wh_searchQuery = q;
    refreshList();
  }, 300);

  document.getElementById('wh-search')?.addEventListener('input', e => debouncedSearch(e.target.value));
  document.getElementById('wh-status-filter')?.addEventListener('change', refreshList);
  document.getElementById('view-toggle')?.addEventListener('click', (e) => {
    wh_currentView = wh_currentView === 'grid' ? 'table' : 'grid';
    e.target.textContent = wh_currentView === 'grid' ? '☰ Table' : '⊞ Grid';
    refreshList();
  });

  attachWarehouseEvents();
}

function refreshList() {
  let whs = getWarehouses();
  const q = wh_searchQuery;
  const statusFilter = document.getElementById('wh-status-filter')?.value;
  if (q) whs = filterData(whs, q, ['name', 'businessName', 'address', 'email']);
  if (statusFilter) whs = whs.filter(w => w.status === statusFilter);
  const allUsers = getAllUsers();
  const container = document.getElementById('wh-container');
  if (container) {
    container.innerHTML = wh_currentView === 'table' ? renderWarehouseTable(whs, allUsers) : renderWarehouseGrid(whs, allUsers);
  }
  // Update count
  const countEl = document.getElementById('wh-count');
  if (countEl) countEl.textContent = getWarehouses().length;
  attachWarehouseEvents();
}

function renderWarehouseGrid(whs, allUsers) {
  if (whs.length === 0) return `
    <div class="card" style="text-align:center;padding:64px">
      <div style="font-size:48px;margin-bottom:16px;opacity:0.4">🏭</div>
      <h3 style="color:var(--text-secondary);margin-bottom:8px">No warehouses found</h3>
      <p style="color:var(--text-muted);font-size:14px;margin-bottom:24px">Create your first warehouse to get started</p>
      <button class="btn btn-primary" onclick="document.getElementById('create-wh-btn').click()">+ Create Warehouse</button>
    </div>
  `;

  return `<div class="warehouse-grid">
    ${whs.map(wh => {
      const staff = allUsers.filter(u => u.warehouseId === wh.id).length;
      return `
      <div class="warehouse-card animate-slideUp" data-wh-id="${wh.id}" style="cursor:pointer" title="Click to view warehouse dashboard">
        <div class="warehouse-card-top">
          <div class="warehouse-avatar">${wh.logo || '🏭'}</div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <span class="badge ${wh.status === 'active' ? 'badge-success' : 'badge-danger'} badge-dot"> ${wh.status}</span>
            <div style="display:flex;gap:4px">
              <button class="action-btn edit" data-id="${wh.id}" title="Edit" onclick="event.stopPropagation()">✏️</button>
              <button class="action-btn delete" data-id="${wh.id}" title="Delete" onclick="event.stopPropagation()">🗑️</button>
            </div>
          </div>
        </div>
        <div class="warehouse-name">${wh.name}</div>
        <div class="warehouse-biz">${wh.businessName}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px">📍 ${wh.address}</div>
        <div style="font-size:12px;color:var(--text-muted)">📧 ${wh.email} · 📞 ${wh.contact}</div>
        <div class="warehouse-stats">
          <div><div class="warehouse-stat-val">${staff}</div><div class="warehouse-stat-lbl">Staff</div></div>
          <div><div class="warehouse-stat-val">${wh.items || 0}</div><div class="warehouse-stat-lbl">Items</div></div>
          <div><div class="warehouse-stat-val">${formatCurrency(wh.revenue||0).split('.')[0]}</div><div class="warehouse-stat-lbl">Revenue</div></div>
        </div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:var(--text-muted)">Tax: ${wh.taxPreference || 'standard'} · ${formatDate(wh.createdAt)}</span>
          <span style="font-size:11px;color:var(--text-brand);font-weight:600">View →</span>
        </div>
      </div>
    `}).join('')}
  </div>`;
}

function renderWarehouseTable(whs, allUsers) {
  if (whs.length === 0) return `
    <div class="card" style="text-align:center;padding:64px">
      <div style="font-size:48px;margin-bottom:16px;opacity:0.4">🏭</div>
      <h3 style="color:var(--text-secondary);margin-bottom:8px">No warehouses found</h3>
      <p style="color:var(--text-muted);font-size:14px;margin-bottom:24px">Create your first warehouse to get started</p>
      <button class="btn btn-primary" onclick="document.getElementById('create-wh-btn').click()">+ Create Warehouse</button>
    </div>
  `;

  return `
    <div class="card animate-slideUp">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Logo</th>
              <th>Name</th>
              <th>Business Name</th>
              <th>Contact Info</th>
              <th>Staff</th>
              <th>Items</th>
              <th>Revenue</th>
              <th>Status</th>
              <th style="text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${whs.map(wh => {
              const staff = allUsers.filter(u => u.warehouseId === wh.id).length;
              return `
                <tr class="warehouse-row" data-wh-id="${wh.id}" style="cursor:pointer">
                  <td data-label="Logo"><div style="font-size:24px">${wh.logo || '🏭'}</div></td>
                  <td data-label="Name">
                    <div style="font-weight:600;color:var(--text-brand)">${wh.name}</div>
                    <div style="font-size:11px;color:var(--text-muted)">📍 ${wh.address}</div>
                  </td>
                  <td data-label="Business Name">${wh.businessName}</td>
                  <td data-label="Contact Info">
                    <div style="font-size:12px">${wh.email}</div>
                    <div style="font-size:11px;color:var(--text-muted)">📞 ${wh.contact}</div>
                  </td>
                  <td data-label="Staff"><span class="badge badge-brand">${staff}</span></td>
                  <td data-label="Items"><span class="badge badge-info">${wh.items || 0}</span></td>
                  <td data-label="Revenue"><strong style="color:var(--accent-emerald)">${formatCurrency(wh.revenue || 0)}</strong></td>
                  <td data-label="Status"><span class="badge ${wh.status === 'active' ? 'badge-success' : 'badge-danger'}">${wh.status}</span></td>
                  <td data-label="Actions" style="text-align:right" onclick="event.stopPropagation()">
                    <div style="display:inline-flex;gap:4px">
                      <button class="action-btn edit" data-id="${wh.id}" title="Edit">✏️</button>
                      <button class="action-btn delete" data-id="${wh.id}" title="Delete">🗑️</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function attachWarehouseEvents() {
  // Edit buttons
  document.querySelectorAll('.action-btn.edit[data-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wh = getWarehouses().find(w => w.id === btn.dataset.id);
      if (wh) showWarehouseModal(wh);
    });
  });

  // Delete buttons
  document.querySelectorAll('.action-btn.delete[data-id]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const wh = getWarehouses().find(w => w.id === btn.dataset.id);
      const ok = await confirm(`Delete "${wh?.name || 'this warehouse'}"? All associated data will be removed.`, 'Delete Warehouse');
      if (ok) {
        deleteWarehouse(btn.dataset.id);
        showToast('Warehouse deleted', `${wh?.name} has been removed`, 'success');
        refreshList();
      }
    });
  });

  // Warehouse card/row click → warehouse detail dashboard
  document.querySelectorAll('.warehouse-card[data-wh-id], .warehouse-row[data-wh-id]').forEach(el => {
    el.addEventListener('click', () => {
      const whId = el.dataset.whId;
      navigate('/warehouses/' + whId);
    });
  });
}

function showWarehouseModal(wh) {
  const isEdit = !!wh;

  // Check plan limit before opening create modal
  if (!isEdit) {
    const lim = getPlanWarehouseLimit();
    const current = getWarehouses();
    if (lim > 0 && current.length >= lim) {
      showToast('Plan limit reached', `Starter plan allows only ${lim} warehouse. Upgrade to Enterprise.`, 'warning');
      return;
    }
  }

  const body = `
    <form id="wh-modal-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Warehouse Name <span class="req">*</span></label>
          <input type="text" id="m-wh-name" class="form-control" value="${wh?.name||''}" required placeholder="e.g. North Hub" />
        </div>
        <div class="form-group">
          <label class="form-label">Business Name <span class="req">*</span></label>
          <input type="text" id="m-wh-biz" class="form-control" value="${wh?.businessName||''}" required placeholder="Legal business name" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Address <span class="req">*</span></label>
        <input type="text" id="m-wh-address" class="form-control" value="${wh?.address||''}" required placeholder="Full address" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Contact <span class="req">*</span></label>
          <input type="tel" id="m-wh-contact" class="form-control" value="${wh?.contact||''}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Email <span class="req">*</span></label>
          <input type="email" id="m-wh-email" class="form-control" value="${wh?.email||''}" required />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tax Preference</label>
          <select id="m-wh-tax" class="form-control">
            <option value="standard" ${wh?.taxPreference==='standard'||!wh?'selected':''}>Standard</option>
            <option value="luxury" ${wh?.taxPreference==='luxury'?'selected':''}>Luxury</option>
            <option value="none" ${wh?.taxPreference==='none'?'selected':''}>No Tax</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Logo</label>
          <select id="m-wh-logo" class="form-control">
            ${['🏭','🏗️','🚛','📦','🏢','⚙️','🌐','🏬'].map(l=>`<option value="${l}" ${wh?.logo===l?'selected':''}>${l} ${l}</option>`).join('')}
          </select>
        </div>
      </div>
      ${isEdit ? `
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="m-wh-status" class="form-control">
          <option value="active" ${wh?.status==='active'?'selected':''}>Active</option>
          <option value="inactive" ${wh?.status==='inactive'?'selected':''}>Inactive</option>
        </select>
      </div>` : ''}
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="m-cancel">Cancel</button>
    <button class="btn btn-primary" id="m-save">${isEdit ? '✓ Update' : '+ Create'} Warehouse</button>
  `;

  const modal = createModal({ title: isEdit ? '✏️ Edit Warehouse' : '🏭 New Warehouse', body, footer });

  modal.el.querySelector('#m-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#m-save')?.addEventListener('click', () => {
    const name         = document.getElementById('m-wh-name')?.value.trim();
    const businessName = document.getElementById('m-wh-biz')?.value.trim();
    const address      = document.getElementById('m-wh-address')?.value.trim();
    const contact      = document.getElementById('m-wh-contact')?.value.trim();
    const email        = document.getElementById('m-wh-email')?.value.trim();

    if (!name || !businessName || !address || !contact || !email) {
      showToast('Validation', 'Please fill all required fields', 'warning');
      return;
    }

    if (!isEdit) {
      const lim = getPlanWarehouseLimit();
      const curr = getWarehouses();
      if (lim > 0 && curr.length >= lim) {
        showToast('Plan limit reached', 'Upgrade to Enterprise for unlimited warehouses.', 'warning');
        modal.close(); return;
      }
    }

    const data = {
      name, businessName, address, contact, email,
      taxPreference: document.getElementById('m-wh-tax')?.value || 'standard',
      logo: document.getElementById('m-wh-logo')?.value || '🏭',
      ...(isEdit ? { status: document.getElementById('m-wh-status')?.value } : {})
    };

    if (isEdit) {
      updateWarehouse(wh.id, data);
      showToast('Warehouse updated', `${name} has been updated`, 'success');
    } else {
      createWarehouse(data);
      addNotification('warehouse_create', 'Warehouse Created', `${name} is now active and ready`, '/warehouses');
      showToast('Warehouse created', `${name} is ready`, 'success');
    }

    modal.close();
    refreshList();
  });
}

// ---- WAREHOUSE DETAIL DASHBOARD ----
function renderWarehouseDetail(whId) {
  const user    = getCurrentUser();
  const isSA    = user.role === 'super_admin';
  const isAdmin = isSA || user.role === 'admin';

  const whs = getWarehouses();
  const wh  = whs.find(w => w.id === whId);
  if (!wh) { navigate('/warehouses'); return; }
  if (!isSA && user.warehouseId !== whId) { navigate('/dashboard'); return; }

  const allUsers   = getAllUsers();
  const staff      = allUsers.filter(u => u.warehouseId === whId);
  const bills      = getBills(whId);
  const items      = getItems(whId);
  const taxCfg     = getTaxConfig(whId);

  const revenue    = bills.reduce((s,b)=>s+(b.total||0),0);
  const tax        = bills.reduce((s,b)=>s+(b.tax||0),0);
  const netRev     = revenue - tax;
  const avgBill    = bills.length ? revenue/bills.length : 0;
  const totalStock = items.reduce((s,i)=>s+(i.stock||0),0);
  const lowStock   = items.filter(i=>(i.stock||0)<20);
  const invValue   = items.reduce((s,i)=>s+(i.price||0)*(i.stock||0),0);

  const roleColors = { admin:'var(--accent-violet)',manager:'var(--accent-cyan)',staff:'var(--accent-amber)',employee:'var(--accent-emerald)' };

  const now = new Date();
  const monthLabels = [], monthRevs = [];
  for (let i=5;i>=0;i--) {
    const d = new Date(now.getFullYear(),now.getMonth()-i,1);
    monthLabels.push(d.toLocaleString('default',{month:'short'}));
    monthRevs.push(bills.filter(b=>{
      const bd=new Date(b.createdAt);
      return bd.getMonth()===d.getMonth()&&bd.getFullYear()===d.getFullYear();
    }).reduce((s,b)=>s+(b.total||0),0));
  }
  const maxRev = Math.max(...monthRevs,1);
  const cats = [...new Set(items.map(i=>i.category))].filter(Boolean);

  renderShell(wh.name, `${wh.businessName} · Warehouse Dashboard`, `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="font-size:44px;line-height:1">${wh.logo||'🏭'}</div>
            <div>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                <h1 class="page-title" style="margin:0">${wh.name}</h1>
                <span class="badge ${wh.status==='active'?'badge-success':'badge-danger'} badge-dot"> ${wh.status}</span>
              </div>
              <p class="page-subtitle">${wh.businessName} · ${wh.address}</p>
            </div>
          </div>
        </div>
        <div class="page-header-actions">
          ${isSA?`<button class="btn btn-secondary btn-sm" onclick="location.hash='#/warehouses'">← Warehouses</button>`:''}
          ${isSA?`<button class="btn btn-secondary btn-sm" id="wd-edit-btn">✏️ Edit</button>`:''}
          <button class="btn btn-primary btn-sm" onclick="location.hash='#/billing'">🧾 New Invoice</button>
        </div>
      </div>

      <div class="dashboard-grid">
        ${[
          {icon:'💰',val:formatCurrency(revenue), label:'Revenue',       color:'var(--accent-emerald)',glow:'#10b981'},
          {icon:'💵',val:formatCurrency(netRev),  label:'Net Revenue',   color:'var(--accent-cyan)',   glow:'#06b6d4'},
          {icon:'🏛️',val:formatCurrency(tax),     label:'Tax Collected', color:'var(--accent-amber)',  glow:'#f59e0b'},
          {icon:'🧾',val:bills.length,            label:'Invoices',      color:'var(--text-brand)',    glow:'#6366f1'},
          {icon:'👥',val:staff.length,            label:'Team Members',  color:'var(--accent-violet)', glow:'#8b5cf6'},
          {icon:'📦',val:totalStock.toLocaleString(),label:'Stock Units',color:'var(--text-primary)',  glow:'#64748b'},
          {icon:'💎',val:formatCurrency(invValue),label:'Inv. Value',    color:'var(--accent-rose)',   glow:'#f43f5e'},
          {icon:'⚠️',val:lowStock.length,         label:'Low Stock',     color:lowStock.length>0?'var(--accent-rose)':'var(--accent-emerald)',glow:'#f59e0b'},
        ].map(s=>`
          <div class="stat-card">
            <div class="stat-card-glow" style="background:${s.glow}"></div>
            <div class="stat-card-icon">${s.icon}</div>
            <div class="stat-card-value" style="color:${s.color};font-size:18px">${s.val}</div>
            <div class="stat-card-label">${s.label}</div>
          </div>
        `).join('')}
      </div>

      <div class="dashboard-grid">
        <div class="card col-8">
          <div class="card-header">
            <div class="card-title">📈 Revenue Trend (Last 6 Months)</div>
            <div style="font-size:12px;color:var(--text-muted)">Total: ${formatCurrency(revenue)}</div>
          </div>
          <div style="display:flex;align-items:flex-end;gap:6px;height:100px;padding:0 4px">
            ${monthRevs.map((v,i)=>{
              const h=maxRev>0?Math.max(Math.round(v/maxRev*100),2):2;
              const isLast=i===monthRevs.length-1;
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <div style="font-size:10px;color:var(--text-muted)">${v>0?'$'+(v/1000).toFixed(1)+'k':''}</div>
                <div style="width:100%;height:${h}%;background:${isLast?'var(--brand-500)':'rgba(99,102,241,0.4)'};border-radius:4px 4px 0 0;transition:height 0.3s;min-height:4px"></div>
                <div style="font-size:10px;color:var(--text-muted)">${monthLabels[i]}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="card col-4">
          <div class="card-header"><div class="card-title">💰 Billing Summary</div></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[
              {label:'Total Revenue',val:formatCurrency(revenue),color:'var(--accent-emerald)'},
              {label:'Tax Collected',val:formatCurrency(tax),    color:'var(--accent-amber)'},
              {label:'Net Revenue',  val:formatCurrency(netRev), color:'var(--text-brand)'},
              {label:'Avg Invoice',  val:formatCurrency(avgBill),color:'var(--accent-cyan)'},
              {label:'Invoice Count',val:bills.length,           color:'var(--text-primary)'},
            ].map(r=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border-subtle)">
                <span style="font-size:12px;color:var(--text-muted)">${r.label}</span>
                <span style="font-size:13px;font-weight:700;color:${r.color}">${r.val}</span>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:10px">
            <button class="btn btn-secondary btn-sm" style="width:100%" onclick="location.hash='#/billing'">View All Invoices →</button>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card col-6">
          <div class="card-header">
            <div class="card-title">👥 Team (${staff.length})</div>
            ${isAdmin?`<button class="btn btn-secondary btn-sm" onclick="location.hash='#/workforce'" style="font-size:11px">Manage →</button>`:''}
          </div>
          ${staff.length===0
            ?`<div style="text-align:center;padding:24px;color:var(--text-muted)">No staff assigned</div>`
            :`<div class="table-wrap"><table>
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Since</th></tr></thead>
              <tbody>${staff.map(u=>`
                <tr>
                  <td data-label="Name">
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="width:28px;height:28px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:white;flex-shrink:0">${u.avatar}</div>
                      <div>
                        <div style="font-size:13px;font-weight:600">${u.name}</div>
                        <div style="font-size:11px;color:var(--text-muted)">${u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Role"><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;background:rgba(99,102,241,0.1);color:${roleColors[u.role]||'var(--text-secondary)'}">${u.role}</span></td>
                  <td data-label="Status"><span class="badge ${u.status==='active'?'badge-success':'badge-danger'}" style="font-size:10px">${u.status}</span></td>
                  <td data-label="Since" style="font-size:11px;color:var(--text-muted)">${formatDate(u.assignedAt||u.createdAt)}</td>
                </tr>`).join('')}
              </tbody>
            </table></div>`}
        </div>

        <div class="card col-6">
          <div class="card-header">
            <div class="card-title">🧾 Recent Invoices</div>
            <button class="btn btn-primary btn-sm" onclick="location.hash='#/billing'" style="font-size:11px">+ New</button>
          </div>
          ${bills.length===0
            ?`<div style="text-align:center;padding:24px;color:var(--text-muted)">No invoices yet</div>`
            :`<div class="table-wrap"><table>
              <thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Date</th></tr></thead>
              <tbody>${bills.slice(0,8).map(b=>`
                <tr>
                  <td data-label="Invoice"><span style="font-family:var(--font-mono);font-size:12px;color:var(--text-brand)">${b.billNo}</span></td>
                  <td data-label="Customer"><div class="primary-cell">${b.customer}</div></td>
                  <td data-label="Total"><strong style="color:var(--accent-emerald)">${formatCurrency(b.total)}</strong></td>
                  <td data-label="Date" style="font-size:12px;color:var(--text-muted)">${formatDate(b.createdAt)}</td>
                </tr>`).join('')}
              </tbody>
            </table></div>`}
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div>
            <div class="card-title">📦 Inventory (${items.length} items · ${totalStock.toLocaleString()} units)</div>
            <div class="card-subtitle">Inventory value: ${formatCurrency(invValue)}</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/items'" style="font-size:11px">Manage →</button>
        </div>
        ${cats.length>0?`
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">By Category</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${cats.map((cat,ci)=>{
              const catItems=items.filter(i=>i.category===cat);
              const catStock=catItems.reduce((s,i)=>s+(i.stock||0),0);
              const catVal=catItems.reduce((s,i)=>s+(i.price||0)*(i.stock||0),0);
              const pct=totalStock>0?Math.round(catStock/totalStock*100):0;
              const colors=['#6366f1','#10b981','#06b6d4','#f59e0b','#f43f5e','#8b5cf6'];
              return `<div style="display:flex;align-items:center;gap:10px">
                <div style="width:80px;font-size:12px;color:var(--text-muted);flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cat}</div>
                <div style="flex:1;height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${colors[ci%colors.length]};border-radius:4px"></div>
                </div>
                <div style="font-size:11px;color:var(--text-muted);width:28px;text-align:right">${pct}%</div>
                <div style="font-size:11px;font-weight:600;width:70px;text-align:right;color:var(--text-primary)">${formatCurrency(catVal)}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`:''}
        <div class="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th>Tax</th><th>Value</th></tr></thead>
            <tbody>
              ${items.slice(0,10).map(i=>{
                const rate=i.taxCategory==='luxury'?taxCfg.luxury:taxCfg.normal;
                const sc=(i.stock||0)<10?'badge-danger':(i.stock||0)<20?'badge-warning':'badge-success';
                return `<tr>
                  <td><div class="primary-cell">${i.name}</div></td>
                  <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${i.sku||'—'}</span></td>
                  <td><span class="badge badge-brand">${i.category}</span></td>
                  <td>${formatCurrency(i.price||0)}</td>
                  <td><span class="badge ${sc}">${i.stock||0} ${i.unit||'pcs'}</span></td>
                  <td><span class="badge ${i.taxCategory==='luxury'?'badge-purple':'badge-info'}">${rate}%</span></td>
                  <td><strong>${formatCurrency((i.price||0)*(i.stock||0))}</strong></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          ${items.length>10?`<div style="padding:10px;text-align:center;font-size:12px;color:var(--text-muted)">Showing 10 of ${items.length} · <a href="#/items" style="color:var(--text-brand)">View all →</a></div>`:''}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">🏢 Warehouse Information</div></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;font-size:13px">
          ${[
            {label:'Business Name',  val:wh.businessName},
            {label:'Address',        val:wh.address},
            {label:'Contact',        val:wh.contact},
            {label:'Email',          val:wh.email},
            {label:'Tax Preference', val:wh.taxPreference},
            {label:'Status',         val:wh.status},
            {label:'Created',        val:formatDate(wh.createdAt)},
            {label:'Last Updated',   val:wh.updatedAt?formatDate(wh.updatedAt):'—'},
          ].map(f=>`
            <div>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:4px">${f.label}</div>
              <div style="font-weight:600;color:var(--text-primary)">${f.val||'—'}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `);

  document.getElementById('wd-edit-btn')?.addEventListener('click', () => showWarehouseModal(wh));
}

// ===== pages/workforce.js =====
/**
 * Workforce Management Page — User CRUD with role assignment
 */





let wf_searchQ = '';
let roleFilter = '';
let wf_whFilter = '';
let wf_page = 1;
const wf_PER_PAGE = 10;

function renderWorkforce() {
  const user = getCurrentUser();
  if (!user || user.role === 'employee' || user.role === 'staff') { navigate('/dashboard'); return; }

  const whs = getWarehouses();

  renderShell('Workforce', 'Manage users, roles, and warehouse assignments', `
    <div class="animate-slideUp">
      <div class="wf_page-header">
        <div class="wf_page-header-left">
          <h1 class="wf_page-title">👥 Workforce Management</h1>
          <p class="wf_page-subtitle">Centralized user and role management across all warehouses</p>
        </div>
        <div class="wf_page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${['super_admin', 'admin'].includes(user.role) ? `<button class="btn btn-primary" id="create-user-btn">+ Add User</button>` : ''}
        </div>
      </div>

      <!-- Stats Row -->
      <div id="workforce-stats"></div>

      <!-- Table Toolbar -->
      <div class="table-toolbar">
        <div class="table-search">
          <span>🔍</span>
          <input type="text" id="wf-search" placeholder="Search by name, email..." />
        </div>
        <div class="table-filter">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="role-filter">
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="staff">Staff</option>
            <option value="employee">Employee</option>
          </select>
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="wh-filter-wf">
            <option value="">All Warehouses</option>
            ${whs.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Table -->
      <div id="workforce-table-container"></div>
      <div id="workforce-pagination" style="margin-top:0"></div>
    </div>
  `);

  renderWorkforceStats();
  renderWorkforceTable();

  document.getElementById('create-user-btn')?.addEventListener('click', () => showUserModal(null));
  const debouncedSearch = debounce(q => {
    wf_searchQ = q;
    wf_page = 1;
    renderWorkforceTable();
  }, 300);

  document.getElementById('wf-search')?.addEventListener('input', e => debouncedSearch(e.target.value));
  document.getElementById('role-filter')?.addEventListener('change', e => { roleFilter = e.target.value; wf_page = 1; renderWorkforceTable(); });
  document.getElementById('wh-filter-wf')?.addEventListener('change', e => { wf_whFilter = e.target.value; wf_page = 1; renderWorkforceTable(); });
}

function renderWorkforceStats() {
  const users = getAllUsers();
  const whs = getWarehouses();
  const roles = ['admin','manager','staff','employee'];
  const el = document.getElementById('workforce-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">👤</div>
        <div class="stat-card-value">${users.length}</div>
        <div class="stat-card-label">Total Users</div>
      </div>
      ${roles.map(r => {
        const count = users.filter(u=>u.role===r).length;
        const colors = {admin:'rgba(6,182,212,0.15)',manager:'rgba(16,185,129,0.15)',staff:'rgba(245,158,11,0.15)',employee:'rgba(100,116,139,0.15)'};
        const icons = {admin:'🏭',manager:'👔',staff:'🧾',employee:'👨‍💼'};
        return `<div class="stat-card"><div class="stat-card-icon" style="background:${colors[r]}">${icons[r]}</div><div class="stat-card-value">${count}</div><div class="stat-card-label">${capitalize(r)}s</div></div>`;
      }).join('')}
    </div>
  `;
}

function renderWorkforceTable() {
  const currentUser = getCurrentUser();
  let users = getAllUsers();
  const whs = getWarehouses();
  if (wf_searchQ) users = filterData(users, wf_searchQ, ['name','email','role']);
  if (roleFilter) users = users.filter(u => u.role === roleFilter);
  if (wf_whFilter) users = users.filter(u => u.warehouseId === wf_whFilter);

  const total = users.length;
  const wf_pages = Math.ceil(total / wf_PER_PAGE);
  const start = (wf_page - 1) * wf_PER_PAGE;
  const wf_pageUsers = users.slice(start, start + wf_PER_PAGE);

  const container = document.getElementById('workforce-table-container');
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:40px;margin-bottom:16px;opacity:0.4">👤</div><h3 style="color:var(--text-secondary)">No users found</h3></div>`;
    document.getElementById('workforce-pagination').innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Warehouse</th>
          <th>Status</th>
          <th>Assigned Date</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>
          ${wf_pageUsers.map(u => {
            const wh = whs.find(w => w.id === u.warehouseId);
            return `<tr>
              <td data-label="Name">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:32px;height:32px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0">${u.avatar}</div>
                  <div>
                    <div class="primary-cell">${u.name}</div>
                    <div class="sub-cell">ID: ${u.id.slice(0,8)}</div>
                  </div>
                </div>
              </td>
              <td data-label="Email"><span style="font-family:var(--font-mono);font-size:12px">${u.email}</span></td>
              <td data-label="Role">${roleBadge(u.role)}</td>
              <td data-label="Warehouse"><span class="badge badge-info">${wh ? wh.name : '—'}</span></td>
              <td data-label="Status">${statusBadge(u.status)}</td>
              <td data-label="Assigned">${formatDate(u.assignedAt || u.createdAt)}</td>
              <td data-label="Actions">
                ${['super_admin', 'admin'].includes(currentUser.role) ? `
                <div class="table-actions">
                  <button class="action-btn edit" data-uid="${u.id}" title="Edit">✏️</button>
                  <button class="action-btn delete" data-uid="${u.id}" title="Delete">🗑️</button>
                </div>` : '—'}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+wf_PER_PAGE,total)} of ${total} users</div>
        <div class="pagination-controls">
          <button class="wf_page-btn" id="pg-prev" ${wf_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:wf_pages},(_, i)=>`<button class="wf_page-btn ${wf_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="wf_page-btn" id="pg-next" ${wf_page>=wf_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;

  // Events
  container.querySelectorAll('.action-btn.edit[data-uid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = getAllUsers().find(u => u.id === btn.dataset.uid);
      showUserModal(u);
    });
  });
  container.querySelectorAll('.action-btn.delete[data-uid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirm('Remove this user from the platform?', 'Remove User');
      if (ok) {
        const result = await deleteUser(btn.dataset.uid);
        if (result && result.error) {
          showToast('Error', result.error, 'error');
        } else {
          showToast('User removed', '', 'success');
          renderWorkforceStats();
          renderWorkforceTable();
        }
      }
    });
  });
  container.querySelectorAll('.wf_page-btn[data-pg]').forEach(btn => {
    btn.addEventListener('click', () => { wf_page = parseInt(btn.dataset.pg); renderWorkforceTable(); });
  });
  container.querySelector('#pg-prev')?.addEventListener('click', () => { if (wf_page > 1) { wf_page--; renderWorkforceTable(); } });
  container.querySelector('#pg-next')?.addEventListener('click', () => { if (wf_page < wf_pages) { wf_page++; renderWorkforceTable(); } });
}

function showUserModal(u) {
  const isEdit = !!u;
  const whs = getWarehouses();
  const currentUser = getCurrentUser();
  const availableRoles = currentUser.role === 'super_admin'
    ? ['admin','manager','staff','employee']
    : ['manager','staff','employee'];

  const body = `
    <form id="user-modal-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Full Name <span class="req">*</span></label>
          <input type="text" id="m-u-name" class="form-control" value="${u?.name||''}" required placeholder="First and last name" />
        </div>
        <div class="form-group">
          <label class="form-label">Email <span class="req">*</span></label>
          <input type="email" id="m-u-email" class="form-control" value="${u?.email||''}" required placeholder="work@company.com" ${isEdit?'readonly':''} />
        </div>
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label class="form-label">Password <span class="req">*</span></label>
        <input type="password" id="m-u-password" class="form-control" required placeholder="Min 8 characters" minlength="8" />
      </div>` : ''}
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Role <span class="req">*</span></label>
          <select id="m-u-role" class="form-control" required>
            ${availableRoles.map(r=>`<option value="${r}" ${u?.role===r?'selected':''}>${capitalize(r)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Assign Warehouse <span class="req">*</span></label>
          <select id="m-u-wh" class="form-control" required>
            <option value="">Select warehouse</option>
            ${whs.map(w=>`<option value="${w.id}" ${u?.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
      </div>
      ${isEdit ? `
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="m-u-status" class="form-control">
          <option value="active" ${u?.status==='active'?'selected':''}>Active</option>
          <option value="inactive" ${u?.status==='inactive'?'selected':''}>Inactive</option>
        </select>
      </div>` : ''}
      <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:12px;font-size:12px;color:var(--text-muted)">
        ℹ️ Auto-generated: Created date, assignment timestamp, and audit trail will be recorded automatically.
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="m-u-cancel">Cancel</button>
    <button class="btn btn-primary" id="m-u-save">${isEdit ? '✓ Update' : '+ Add'} User</button>
  `;

  const modal = createModal({ title: isEdit ? '✏️ Edit User' : '👤 Add New User', body, footer });
  modal.el.querySelector('#m-u-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#m-u-save')?.addEventListener('click', async () => {
    const name = document.getElementById('m-u-name').value.trim();
    const email = document.getElementById('m-u-email').value.trim();
    const role = document.getElementById('m-u-role').value;
    const warehouseId = document.getElementById('m-u-wh').value;
    if (!name || !email || !role || !warehouseId) { showToast('Validation', 'Fill all required fields', 'warning'); return; }
    if (isEdit) {
      const data = { name, role, warehouseId, status: document.getElementById('m-u-status').value };
      const result = await updateUser(u.id, data);
      if (result && result.error) { showToast('Error', result.error, 'error'); return; }
      showToast('User updated', `${name}'s details updated`, 'success');
    } else {
      const password = document.getElementById('m-u-password').value;
      if (!password || password.length < 8) { showToast('Validation', 'Password must be at least 8 characters', 'warning'); return; }
      const result = await createUser({ name, email, password, role, warehouseId });
      if (result && result.error) { showToast('Error', result.error, 'error'); return; }
      showToast('User created', `${name} added as ${role}`, 'success');
    }
    modal.close();
    renderWorkforceStats();
    renderWorkforceTable();
  });
}

// ===== pages/items.js =====
/**
 * Items / Inventory Management Page
 */





let it_searchQ = '';
let categoryFilter = '';
let it_whFilter = '';
let it_page = 1;
const it_PER_PAGE = 10;

const CATEGORIES = ['Electronics','Furniture','Apparel','Food & Beverage','Tools','Medical','Automotive','Books','Sports','Other'];
function getTaxCats() {
  const cfg = getTaxConfig();
  return [
    { val: 'normal', label: `Normal (${cfg.normal}%)` },
    { val: 'luxury', label: `Luxury (${cfg.luxury}%)` }
  ];
}

function renderItems() {
  const user = getCurrentUser();
  const whs = getWarehouses();
  const canEdit = ['super_admin','admin','manager'].includes(user.role);

  renderShell('Inventory', 'Manage items, stock, and categories', `
    <div class="animate-slideUp">
      <div class="it_page-header">
        <div class="it_page-header-left">
          <h1 class="it_page-title">📦 Inventory Management</h1>
          <p class="it_page-subtitle">Track items, stock levels, and pricing</p>
        </div>
        <div class="it_page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canEdit ? `
            <button class="btn btn-secondary btn-sm" id="import-csv-btn">📥 Import CSV</button>
            <button class="btn btn-primary" id="create-item-btn">+ Add Item</button>
          ` : ''}
        </div>
      </div>

      <!-- Stats -->
      <div id="item-stats"></div>

      <!-- Toolbar -->
      <div class="table-toolbar">
        <div class="table-search">
          <span>🔍</span>
          <input type="text" id="item-search" placeholder="Search items..." />
        </div>
        <div class="table-filter">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="cat-filter">
            <option value="">All Categories</option>
            ${CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
          ${user.role === 'super_admin' ? `
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="wh-filter-item">
            <option value="">All Warehouses</option>
            ${whs.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}
          </select>` : ''}
        </div>
      </div>

      <!-- Table -->
      <div id="items-table-container"></div>
    </div>
  `);

  renderItemStats();
  renderItemsTable();

  document.getElementById('create-item-btn')?.addEventListener('click', () => showItemModal(null));
  document.getElementById('import-csv-btn')?.addEventListener('click', () => showImportModal());
  const debouncedSearch = debounce(q => {
    it_searchQ = q;
    it_page = 1;
    renderItemsTable();
  }, 300);

  document.getElementById('item-search')?.addEventListener('input', e => debouncedSearch(e.target.value));
  document.getElementById('cat-filter')?.addEventListener('change', e => { categoryFilter = e.target.value; it_page = 1; renderItemsTable(); });
  document.getElementById('wh-filter-item')?.addEventListener('change', e => { it_whFilter = e.target.value; it_page = 1; renderItemsTable(); });

  window._showItemModal = (item) => showItemModal(item);
}

function renderItemStats() {
  const items = getItems();
  const el = document.getElementById('item-stats');
  if (!el) return;
  const totalStock = items.reduce((s,i)=>s+(i.stock||0),0);
  const totalValue = items.reduce((s,i)=>s+((i.price||0)*(i.stock||0)),0);
  const lowStock = items.filter(i=>(i.stock||0)<20).length;
  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">📦</div><div class="stat-card-value">${items.length}</div><div class="stat-card-label">Total Items</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(16,185,129,0.15)">📊</div><div class="stat-card-value">${totalStock.toLocaleString()}</div><div class="stat-card-label">Total Stock</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(6,182,212,0.15)">💎</div><div class="stat-card-value">${formatCurrency(totalValue)}</div><div class="stat-card-label">Inventory Value</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(244,63,94,0.15)">⚠️</div><div class="stat-card-value">${lowStock}</div><div class="stat-card-label">Low Stock Items</div></div>
    </div>
  `;
}

function renderItemsTable() {
  const user = getCurrentUser();
  const whs = getWarehouses();
  const canEdit = ['super_admin','admin','manager'].includes(user.role);
  let items = getItems();
  if (it_searchQ) items = filterData(items, it_searchQ, ['name','sku','category']);
  if (categoryFilter) items = items.filter(i => i.category === categoryFilter);
  if (it_whFilter) items = items.filter(i => i.warehouseId === it_whFilter);

  const total = items.length;
  const it_pages = Math.ceil(total / it_PER_PAGE);
  const start = (it_page-1)*it_PER_PAGE;
  const it_pageItems = items.slice(start, start+it_PER_PAGE);

  const container = document.getElementById('items-table-container');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:40px;margin-bottom:16px;opacity:0.4">📦</div><h3 style="color:var(--text-secondary)">No items found</h3></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Item</th><th>SKU</th><th>Category</th><th>Price</th>
          <th>Stock</th><th>Tax</th><th>Warehouse</th>
          ${canEdit ? '<th>Actions</th>' : ''}
        </tr></thead>
        <tbody>
          ${it_pageItems.map(item => {
            const wh = whs.find(w=>w.id===item.warehouseId);
            const stockClass = (item.stock||0) < 20 ? 'badge-danger' : (item.stock||0) < 50 ? 'badge-warning' : 'badge-success';
            return `<tr>
              <td data-label="Item">
                <div class="primary-cell">${item.name}</div>
                <div class="sub-cell">Added ${formatDate(item.createdAt)}</div>
              </td>
              <td data-label="SKU"><span style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${item.sku||'—'}</span></td>
              <td data-label="Category"><span class="badge badge-brand">${item.category}</span></td>
              <td data-label="Price"><strong style="color:var(--text-primary)">${formatCurrency(item.price||0)}</strong></td>
              <td data-label="Stock"><span class="badge ${stockClass}">${item.stock||0} ${item.unit||'pcs'}</span></td>
              <td data-label="Tax"><span class="badge ${item.taxCategory==='luxury'?'badge-purple':'badge-info'}">${item.taxCategory==='luxury' ? getTaxConfig(item.warehouseId).luxury+'%' : getTaxConfig(item.warehouseId).normal+'%'}</span></td>
              <td data-label="Warehouse"><span class="badge badge-muted">${wh?.name||'—'}</span></td>
              ${canEdit ? `<td data-label="Actions">
                <div class="table-actions">
                  <button class="action-btn edit" data-iid="${item.id}" title="Edit">✏️</button>
                  <button class="action-btn delete" data-iid="${item.id}" title="Delete">🗑️</button>
                </div>
              </td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+it_PER_PAGE,total)} of ${total}</div>
        <div class="pagination-controls">
          <button class="it_page-btn" id="ip-prev" ${it_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:it_pages},(_,i)=>`<button class="it_page-btn ${it_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="it_page-btn" id="ip-next" ${it_page>=it_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;

  if (canEdit) {
    container.querySelectorAll('.action-btn.edit[data-iid]').forEach(btn => {
      btn.addEventListener('click', () => { const item = getItems().find(i=>i.id===btn.dataset.iid); showItemModal(item); });
    });
    container.querySelectorAll('.action-btn.delete[data-iid]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await confirm('Delete this item from inventory?', 'Delete Item');
        if (ok) {
          const res = await deleteItem(btn.dataset.iid);
          if (res && res.error) {
            showToast('Error Deleting Item', res.error, 'error');
            return;
          }
          showToast('Item deleted','','success');
          renderItemStats();
          renderItemsTable();
        }
      });
    });
  }
  container.querySelectorAll('.it_page-btn[data-pg]').forEach(btn => { btn.addEventListener('click', () => { it_page=parseInt(btn.dataset.pg); renderItemsTable(); }); });
  container.querySelector('#ip-prev')?.addEventListener('click', () => { if(it_page>1){it_page--;renderItemsTable();} });
  container.querySelector('#ip-next')?.addEventListener('click', () => { if(it_page<it_pages){it_page++;renderItemsTable();} });
}

function showItemModal(item) {
  const isEdit = !!item;
  const whs = getWarehouses();
  const user = getCurrentUser();
  const body = `
    <form id="item-modal-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Item Name <span class="req">*</span></label>
          <input type="text" id="m-i-name" class="form-control" value="${item?.name||''}" required />
        </div>
        <div class="form-group">
          <label class="form-label">SKU</label>
          <input type="text" id="m-i-sku" class="form-control" value="${item?.sku||''}" placeholder="Auto-generated if empty" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Category <span class="req">*</span></label>
          <select id="m-i-cat" class="form-control" required>
            ${CATEGORIES.map(c=>`<option value="${c}" ${item?.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tax Category</label>
          <select id="m-i-tax" class="form-control">
            ${getTaxCats().map(t=>`<option value="${t.val}" ${item?.taxCategory===t.val?'selected':''}>${t.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Price <span class="req">*</span></label>
          <input type="number" id="m-i-price" class="form-control" value="${item?.price||''}" required min="0" step="0.01" />
        </div>
        <div class="form-group">
          <label class="form-label">Stock <span class="req">*</span></label>
          <input type="number" id="m-i-stock" class="form-control" value="${item?.stock||''}" required min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Unit</label>
          <select id="m-i-unit" class="form-control">
            ${['pcs','kg','lbs','box','pallet','set','m','ft'].map(u=>`<option value="${u}" ${item?.unit===u?'selected':''}>${u}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Warehouse <span class="req">*</span></label>
        <select id="m-i-wh" class="form-control" required>
          <option value="">Select warehouse</option>
          ${whs.map(w=>`<option value="${w.id}" ${item?.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
        </select>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="m-i-cancel">Cancel</button>
    <button class="btn btn-primary" id="m-i-save">${isEdit?'✓ Update':'+ Create'} Item</button>
  `;

  const modal = createModal({ title: isEdit ? '✏️ Edit Item' : '📦 Add New Item', body, footer });
  modal.el.querySelector('#m-i-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#m-i-save')?.addEventListener('click', async () => {
    const name = document.getElementById('m-i-name').value.trim();
    const category = document.getElementById('m-i-cat').value;
    const price = parseFloat(document.getElementById('m-i-price').value);
    const stock = parseInt(document.getElementById('m-i-stock').value);
    const warehouseId = document.getElementById('m-i-wh').value;
    if (!name||!category||isNaN(price)||isNaN(stock)||!warehouseId) { showToast('Validation','Fill all required fields','warning'); return; }
    const data = { name, category, price, stock, warehouseId, sku: document.getElementById('m-i-sku').value||`SKU-${Date.now()}`, unit: document.getElementById('m-i-unit').value, taxCategory: document.getElementById('m-i-tax').value };
    
    let res;
    if (isEdit) {
      res = await updateItem(item.id, data);
      if (res && res.error) {
        showToast('Error Updating Item', res.error, 'error');
        return;
      }
      showToast('Item updated',`${name} updated`,'success');
    } else {
      res = await createItem(data);
      if (res && res.error) {
        showToast('Error Creating Item', res.error, 'error');
        return;
      }
      showToast('Item added',`${name} added to inventory`,'success');
    }
    modal.close();
    renderItemStats();
    renderItemsTable();
  });
}

function showImportModal() {
  const body = `
    <div style="padding:16px">
      <div id="drag-drop-zone" style="border:2px dashed var(--border-default);border-radius:12px;padding:32px;text-align:center;cursor:pointer;background:rgba(99,102,241,0.02);transition:all 0.2s">
        <div style="font-size:36px;margin-bottom:12px">📥</div>
        <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Drag & Drop CSV File here</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">or click to browse from your computer</div>
        <input type="file" id="csv-file-input" accept=".csv" style="display:none" />
        <span class="btn btn-secondary btn-sm">Browse File</span>
      </div>
      <div id="upload-progress-container" style="margin-top:20px;display:none">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:6px">
          <span>Uploading & processing items...</span>
          <span id="upload-percentage">0%</span>
        </div>
        <div style="height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden">
          <div id="upload-progress-bar" style="height:100%;width:0%;background:var(--brand-500);transition:width 0.1s"></div>
        </div>
      </div>
      <div id="import-errors-container" style="margin-top:20px;display:none;background:rgba(244,63,94,0.06);border:1px solid rgba(244,63,94,0.15);border-radius:10px;padding:12px;max-height:160px;overflow-y:auto">
        <div style="font-size:12px;font-weight:700;color:var(--accent-rose);margin-bottom:8px">⚠️ Import Warnings/Errors:</div>
        <ul id="import-errors-list" style="font-size:11px;color:var(--text-muted);margin:0;padding-left:16px;line-height:1.6"></ul>
      </div>
      <div style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:8px;font-size:11px;color:var(--text-muted)">
        ℹ️ <strong>Expected columns:</strong> <code>name</code>, <code>sku</code>, <code>category</code>, <code>price</code>, <code>stock</code> (and optional <code>warehouseId</code>).
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="import-cancel">Cancel</button>
    <button class="btn btn-primary" id="import-start-btn" disabled>✓ Upload & Import</button>
  `;

  const modal = createModal({ title: '📥 Bulk Import Inventory', body, footer });
  const fileInput = modal.el.querySelector('#csv-file-input');
  const zone = modal.el.querySelector('#drag-drop-zone');
  const startBtn = modal.el.querySelector('#import-start-btn');
  const cancelBtn = modal.el.querySelector('#import-cancel');
  
  let selectedFile = null;

  zone.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--brand-500)';
    zone.style.background = 'rgba(99,102,241,0.08)';
  });

  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = 'var(--border-default)';
    zone.style.background = 'rgba(99,102,241,0.02)';
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--border-default)';
    zone.style.background = 'rgba(99,102,241,0.02)';
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  function handleFileSelected(file) {
    if (file.name.slice(-4).toLowerCase() !== '.csv') {
      showToast('Invalid File', 'Only standard CSV files are supported.', 'warning');
      return;
    }
    selectedFile = file;
    zone.querySelector('div:nth-child(2)').textContent = `📄 Selected: ${file.name}`;
    zone.querySelector('div:nth-child(3)').textContent = `Size: ${(file.size/1024).toFixed(1)} KB`;
    startBtn.removeAttribute('disabled');
  }

  startBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    startBtn.setAttribute('disabled', 'true');
    cancelBtn.setAttribute('disabled', 'true');
    
    const progressContainer = modal.el.querySelector('#upload-progress-container');
    const progressBar = modal.el.querySelector('#upload-progress-bar');
    const percentage = modal.el.querySelector('#upload-percentage');
    
    progressContainer.style.display = 'block';
    
    // Simulate initial uploading animation progress smoothly
    let p = 0;
    const interval = setInterval(() => {
      if (p < 85) {
        p += 5;
        progressBar.style.width = p + '%';
        percentage.textContent = p + '%';
      }
    }, 100);

    const formData = new FormData();
    formData.append('file', selectedFile);

    const token = localStorage.getItem('access_token');
    const hostname = window.location.hostname || '127.0.0.1';
    const url = `http://${hostname}:8000/api/v1/items/import`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
        credentials: 'include'
      });
      
      clearInterval(interval);
      progressBar.style.width = '100%';
      percentage.textContent = '100%';

      const data = await res.json();
      
      if (!res.ok) {
        const errMsg = (data.error && data.error.message) || data.message || 'An error occurred during CSV parsing.';
        showToast('Import Failed', errMsg, 'error');
        startBtn.removeAttribute('disabled');
        cancelBtn.removeAttribute('disabled');
        return;
      }

      if (data.success) {
        showToast('Import Complete', `Successfully registered ${data.imported} items.`, 'success');
        
        // Show validation warnings/errors if any skipped
        if (data.errors && data.errors.length > 0) {
          const errContainer = modal.el.querySelector('#import-errors-container');
          const errList = modal.el.querySelector('#import-errors-list');
          errList.innerHTML = data.errors.map(err => `<li>${err}</li>`).join('');
          errContainer.style.display = 'block';
          
          startBtn.style.display = 'none';
          cancelBtn.textContent = 'Close';
          cancelBtn.removeAttribute('disabled');
          cancelBtn.className = 'btn btn-primary';
          cancelBtn.addEventListener('click', () => {
            modal.close();
            // trigger parallel frontend sync
            import('../modules/store.js').then(m => m.syncWithBackend()).then(() => {
              renderItemStats();
              renderItemsTable();
            });
          });
        } else {
          modal.close();
          // trigger parallel frontend sync
          import('../modules/store.js').then(m => m.syncWithBackend()).then(() => {
            renderItemStats();
            renderItemsTable();
          });
        }
      } else {
        const errMsg = (data.error && data.error.message) || data.message || 'Malformed CSV format.';
        showToast('Import Failed', errMsg, 'error');
        startBtn.removeAttribute('disabled');
        cancelBtn.removeAttribute('disabled');
      }
    } catch (err) {
      clearInterval(interval);
      console.error('CSV upload network failure:', err);
      showToast('Network Error', 'Check if server is active.', 'error');
      startBtn.removeAttribute('disabled');
      cancelBtn.removeAttribute('disabled');
    }
  });
}

// ===== pages/tables.js =====
/**
 * Dynamic Table Builder — Create, manage, and populate custom tables
 */





const COLUMN_TYPES = ['text','number','date','dropdown','checkbox','price','tags','status'];
const CATEGORY_OPTIONS = ['Operations','HR','Finance','Inventory','Sales','Logistics','Custom'];
const HEADER_COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#f43f5e','#8b5cf6','#ec4899','#64748b'];

let activeTblId = null;

function renderTables() {
  const user = getCurrentUser();
  const canCreate = ['super_admin','admin'].includes(user.role);
  const tables = getTables();
  const whs = getWarehouses();

  renderShell('Tables', 'Dynamic table builder and data management', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">📋 Table Builder</h1>
          <p class="page-subtitle">Airtable-style dynamic table management system</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canCreate ? `<button class="btn btn-primary" id="create-tbl-btn">+ New Table</button>` : ''}
        </div>
      </div>

      ${activeTblId ? renderTableView(activeTblId) : renderTableList(tables, whs, canCreate)}
    </div>
  `);

  if (canCreate) {
    document.getElementById('create-tbl-btn')?.addEventListener('click', () => showTableBuilderModal(null));
  }

  attachTableListEvents();
}

function renderTableList(tables, whs, canCreate) {
  if (tables.length === 0) return `
    <div class="card" style="text-align:center;padding:80px 40px">
      <div style="font-size:56px;margin-bottom:20px;opacity:0.4">📋</div>
      <h2 style="color:var(--text-secondary);margin-bottom:8px">No tables yet</h2>
      <p style="color:var(--text-muted);font-size:14px;margin-bottom:28px">Build custom tables to manage any kind of data</p>
      ${canCreate ? `<button class="btn btn-primary" id="create-tbl-btn-empty">+ Create Your First Table</button>` : ''}
    </div>
  `;

  return `
    <!-- Table List Header -->
    <div class="table-toolbar">
      <div class="table-search"><span>🔍</span><input type="text" id="tbl-search" placeholder="Search tables..." /></div>
      <div class="table-filter">
        <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="tbl-cat-filter">
          <option value="">All Categories</option>
          ${CATEGORY_OPTIONS.map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Table Name</th><th>Category</th><th>Warehouse</th>
          <th>Columns</th><th>Rows</th><th>Created By</th>
          <th>Created Date</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody id="table-list-body">
          ${tables.map(t => {
            const wh = whs.find(w=>w.id===t.warehouseId);
            const data = getTableData(t.id);
            return `<tr>
              <td data-label="Table">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:32px;height:32px;border-radius:8px;background:${t.headerColor||'#6366f1'};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">📋</div>
                  <div>
                    <div class="primary-cell">${t.name}</div>
                    <div class="sub-cell">${t.description||'No description'}</div>
                  </div>
                </div>
              </td>
              <td data-label="Category"><span class="badge badge-brand">${t.category||'—'}</span></td>
              <td data-label="Warehouse"><span class="badge badge-info">${wh?.name||'All'}</span></td>
              <td data-label="Columns">${(t.columns||[]).length}</td>
              <td data-label="Rows">${data.length}</td>
              <td data-label="Created By" style="font-size:12px;color:var(--text-muted)">${t.createdBy||'—'}</td>
              <td data-label="Created">${formatDate(t.createdAt)}</td>
              <td data-label="Status"><span class="badge badge-success">Active</span></td>
              <td data-label="Actions">
                <div class="table-actions">
                  <button class="action-btn view" data-tid="${t.id}" title="Open Table">👁️</button>
                  ${canCreate ? `<button class="action-btn edit" data-tid="${t.id}" title="Edit Table">✏️</button>` : ''}
                  ${canCreate ? `<button class="action-btn delete" data-tid="${t.id}" title="Delete">🗑️</button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTableView(tableId) {
  const tables = getTables();
  const table = tables.find(t => t.id === tableId);
  if (!table) { activeTblId = null; return renderTableList(tables, getWarehouses(), true); }

  const data = getTableData(tableId);
  const cols = table.columns || [];
  const user = getCurrentUser();
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role);

  return `
    <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px">
      <button class="btn btn-secondary btn-sm" id="back-to-tables">← All Tables</button>
      <div style="width:32px;height:32px;border-radius:8px;background:${table.headerColor||'#6366f1'};display:flex;align-items:center;justify-content:center;font-size:14px">📋</div>
      <div>
        <h2 style="font-size:18px;font-weight:700">${table.name}</h2>
        <p style="font-size:12px;color:var(--text-muted)">${table.category} · ${data.length} rows · ${cols.length} columns</p>
      </div>
      ${canEdit ? `<button class="btn btn-primary btn-sm" style="margin-left:auto" id="add-row-btn">+ Add Row</button>` : ''}
    </div>

    <div class="table-wrap" style="overflow-x:auto">
      <table id="dynamic-table">
        <thead style="background:${table.headerColor||'#6366f1'}22">
          <tr>
            <th>#</th>
            ${cols.map(c=>`<th style="color:${table.headerColor||'#818cf8'}">${c.name}</th>`).join('')}
            ${canEdit ? '<th>Actions</th>' : ''}
          </tr>
        </thead>
        <tbody id="dynamic-tbody">
          ${data.length === 0 ? `
            <tr><td colspan="${cols.length+2}" class="table-empty">
              <div class="table-empty-icon">📭</div>
              <div class="table-empty-title">No data yet</div>
              <div class="table-empty-desc">Click "Add Row" to start filling this table</div>
            </td></tr>
          ` : data.map((row, i) => `
            <tr data-row-id="${row.id}">
              <td data-label="#" style="color:var(--text-muted);font-size:12px;width:40px">${i+1}</td>
              ${cols.map(c => `<td data-label="${c.name}">${renderCellValue(row[c.id], c)}</td>`).join('')}
              ${canEdit ? `<td data-label="Actions">
                <div class="table-actions">
                  <button class="action-btn edit" data-row="${row.id}" title="Edit">✏️</button>
                  <button class="action-btn delete" data-row="${row.id}" title="Delete">🗑️</button>
                </div>
              </td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCellValue(val, col) {
  if (val === undefined || val === null || val === '') return '<span style="color:var(--text-disabled)">—</span>';
  switch (col.type) {
    case 'checkbox': return val ? '✅' : '⬜';
    case 'price': return `<strong>$${Number(val).toFixed(2)}</strong>`;
    case 'date': return `<span style="font-family:var(--font-mono);font-size:12px">${val}</span>`;
    case 'status': {
      const cls = val === 'Done' ? 'badge-success' : val === 'In Progress' ? 'badge-warning' : 'badge-muted';
      return `<span class="badge ${cls}">${val}</span>`;
    }
    case 'dropdown': return `<span class="badge badge-info">${val}</span>`;
    case 'tags': return val.split(',').map(t=>`<span class="badge badge-purple" style="margin-right:4px">${t.trim()}</span>`).join('');
    default: return `<span>${val}</span>`;
  }
}

function attachTableListEvents() {
  const user = getCurrentUser();
  const canCreate = ['super_admin','admin'].includes(user.role);

  document.getElementById('create-tbl-btn-empty')?.addEventListener('click', () => showTableBuilderModal(null));
  document.getElementById('back-to-tables')?.addEventListener('click', () => { activeTblId = null; renderTables(); });
  document.getElementById('add-row-btn')?.addEventListener('click', () => showRowModal(activeTblId, null));
  document.getElementById('tbl-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#table-list-body tr').forEach(tr => {
      const text = tr.textContent.toLowerCase();
      tr.style.display = text.includes(q) ? '' : 'none';
    });
  });

  document.querySelectorAll('.action-btn.view[data-tid]').forEach(btn => {
    btn.addEventListener('click', () => { activeTblId = btn.dataset.tid; renderTables(); });
  });
  if (canCreate) {
    document.querySelectorAll('.action-btn.edit[data-tid]').forEach(btn => {
      btn.addEventListener('click', () => { const t = getTables().find(t=>t.id===btn.dataset.tid); showTableBuilderModal(t); });
    });
    document.querySelectorAll('.action-btn.delete[data-tid]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await confirm('Delete this table and all its data?', 'Delete Table');
        if (ok) {
          const res = await deleteTable(btn.dataset.tid);
          if (res && res.error) {
            showToast('Error Deleting Table', res.error, 'error');
            return;
          }
          showToast('Table deleted','','success');
          renderTables();
        }
      });
    });
  }

  // Row events (when in table view)
  document.querySelectorAll('.action-btn.edit[data-row]').forEach(btn => {
    btn.addEventListener('click', () => {
      const data = getTableData(activeTblId);
      const row = data.find(r => r.id === btn.dataset.row);
      showRowModal(activeTblId, row);
    });
  });
  document.querySelectorAll('.action-btn.delete[data-row]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirm('Delete this row?', 'Delete Row');
      if (ok) {
        const res = await deleteTableRow(activeTblId, btn.dataset.row);
        if (res && res.error) {
          showToast('Error Deleting Row', res.error, 'error');
          return;
        }
        showToast('Row deleted','','success');
        renderTables();
      }
    });
  });
}

function showTableBuilderModal(table) {
  const isEdit = !!table;
  const whs = getWarehouses();
  let columns = isEdit ? [...(table.columns||[])] : [];
  let selectedColor = table?.headerColor || '#6366f1';

  const body = document.createElement('div');
  body.innerHTML = `
    <form id="tbl-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Table Name <span class="req">*</span></label>
          <input type="text" id="t-name" class="form-control" value="${table?.name||''}" required placeholder="e.g. Operations Tracker" />
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="t-cat" class="form-control">
            ${CATEGORY_OPTIONS.map(c=>`<option value="${c}" ${table?.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input type="text" id="t-desc" class="form-control" value="${table?.description||''}" placeholder="Brief description of this table" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Assign to Warehouse</label>
          <select id="t-wh" class="form-control">
            <option value="">All warehouses</option>
            ${whs.map(w=>`<option value="${w.id}" ${table?.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Access Roles</label>
          <select id="t-roles" class="form-control" multiple style="height:80px">
            ${['admin','manager','staff','employee'].map(r=>`<option value="${r}" ${(table?.roles||[]).includes(r)?'selected':''}>${capitalize(r)}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Header Color -->
      <div class="form-group">
        <label class="form-label">Header Color</label>
        <div class="color-picker-row" id="color-picker">
          ${HEADER_COLORS.map(c=>`<div class="color-swatch ${c===selectedColor?'selected':''}" style="background:${c}" data-color="${c}"></div>`).join('')}
        </div>
      </div>

      <!-- Columns Builder -->
      <div class="form-group">
        <label class="form-label">Columns <span class="req">*</span></label>
        <div id="columns-list" style="display:flex;flex-direction:column;gap:8px">
          ${columns.map((c,i)=>renderColumnRow(c,i)).join('')}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="add-col-btn" style="margin-top:10px">+ Add Column</button>
      </div>
    </form>
  `;

  // Color picker
  body.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      body.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  });

  // Add column button
  body.querySelector('#add-col-btn')?.addEventListener('click', () => {
    const id = 'c' + Date.now();
    columns.push({ id, name: '', type: 'text', required: false });
    const colList = body.querySelector('#columns-list');
    const div = document.createElement('div');
    div.innerHTML = renderColumnRow(columns[columns.length-1], columns.length-1);
    div.firstElementChild && colList.appendChild(div.firstElementChild);
  });

  const footer = `
    <button class="btn btn-secondary" id="t-cancel">Cancel</button>
    <button class="btn btn-primary" id="t-save">${isEdit?'✓ Update':'+ Create'} Table</button>
  `;

  const modal = createModal({ title: isEdit?'✏️ Edit Table':'📋 Build New Table', body, footer, size: 'lg' });
  modal.el.querySelector('#t-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#t-save')?.addEventListener('click', async () => {
    const name = document.getElementById('t-name').value.trim();
    if (!name) { showToast('Validation','Table name is required','warning'); return; }
    // Collect columns
    const colEls = body.querySelectorAll('.col-row');
    const cols = Array.from(colEls).map((row, i) => ({
      id: columns[i]?.id || 'c'+Date.now()+i,
      name: row.querySelector('.col-name').value.trim() || `Column ${i+1}`,
      type: row.querySelector('.col-type').value,
      required: row.querySelector('.col-req').checked,
      options: row.querySelector('.col-options')?.value || ''
    })).filter(c=>c.name);

    const roles = Array.from(document.getElementById('t-roles').selectedOptions).map(o=>o.value);
    const data = { name, category: document.getElementById('t-cat').value, description: document.getElementById('t-desc').value, warehouseId: document.getElementById('t-wh').value, columns: cols, roles, headerColor: selectedColor };

    let res;
    if (isEdit) {
      res = await updateTable(table.id, data);
      if (res && res.error) {
        showToast('Error Updating Table', res.error, 'error');
        return;
      }
      showToast('Table updated',`${name} updated`,'success');
    } else {
      res = await createTable(data);
      if (res && res.error) {
        showToast('Error Creating Table', res.error, 'error');
        return;
      }
      showToast('Table created',`${name} is ready`,'success');
    }
    modal.close();
    activeTblId = null;
    renderTables();
  });
}

function renderColumnRow(col, i) {
  return `
    <div class="col-row" style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;background:var(--bg-input);border:1px solid var(--border-default);border-radius:8px;padding:10px">
      <input type="text" class="col-name form-control" value="${col.name||''}" placeholder="Column name" style="margin:0" />
      <select class="col-type form-control" style="margin:0;width:130px">
        ${COLUMN_TYPES.map(t=>`<option value="${t}" ${col.type===t?'selected':''}>${capitalize(t)}</option>`).join('')}
      </select>
      <label class="checkbox-group" style="white-space:nowrap">
        <input type="checkbox" class="col-req" ${col.required?'checked':''} />
        <label style="font-size:12px">Req.</label>
      </label>
      <button type="button" class="action-btn delete" title="Remove" style="flex-shrink:0" onclick="this.closest('.col-row').remove()">🗑️</button>
    </div>
  `;
}

function showRowModal(tableId, row) {
  const tables = getTables();
  const table = tables.find(t=>t.id===tableId);
  if (!table) return;
  const isEdit = !!row;
  const cols = table.columns || [];

  const body = `
    <form id="row-form">
      ${cols.map(col => `
        <div class="form-group">
          <label class="form-label">${col.name}${col.required?'<span class="req"> *</span>':''}</label>
          ${renderFieldInput(col, row?row[col.id]:'')}
        </div>
      `).join('')}
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="r-cancel">Cancel</button>
    <button class="btn btn-primary" id="r-save">${isEdit?'✓ Update':'+ Add'} Row</button>
  `;

  const modal = createModal({ title: isEdit?'✏️ Edit Row':'➕ Add New Row', body, footer });
  modal.el.querySelector('#r-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#r-save')?.addEventListener('click', async () => {
    const rowData = {};
    let hasValidationError = false;
    cols.forEach(col => {
      const inp = document.getElementById(`rf-${col.id}`);
      if (!inp) return;
      rowData[col.id] = col.type === 'checkbox' ? inp.checked : inp.value;
      if (col.required && !rowData[col.id] && col.type !== 'checkbox') {
        showToast('Validation',`${col.name} is required`,'warning');
        hasValidationError = true;
      }
    });
    if (hasValidationError) return;

    let res;
    if (isEdit) {
      res = await updateTableRow(tableId, row.id, rowData);
      if (res && res.error) {
        showToast('Error Updating Row', res.error, 'error');
        return;
      }
      showToast('Row updated','','success');
    } else {
      res = await addTableRow(tableId, rowData);
      if (res && res.error) {
        showToast('Error Adding Row', res.error, 'error');
        return;
      }
      showToast('Row added','','success');
    }
    modal.close();
    renderTables();
  });
}

function renderFieldInput(col, value) {
  const id = `rf-${col.id}`;
  switch (col.type) {
    case 'text': return `<input type="text" id="${id}" class="form-control" value="${value||''}" />`;
    case 'number': return `<input type="number" id="${id}" class="form-control" value="${value||''}" />`;
    case 'price': return `<input type="number" id="${id}" class="form-control" value="${value||''}" step="0.01" min="0" />`;
    case 'date': return `<input type="date" id="${id}" class="form-control" value="${value||''}" />`;
    case 'checkbox': return `<label class="checkbox-group"><input type="checkbox" id="${id}" ${value?'checked':''} /><label>Check if applicable</label></label>`;
    case 'dropdown': {
      const opts = (col.options||'').split(',').filter(Boolean);
      return `<select id="${id}" class="form-control">${opts.map(o=>`<option value="${o}" ${value===o?'selected':''}>${o}</option>`).join('')}</select>`;
    }
    case 'status': return `<select id="${id}" class="form-control"><option value="Todo" ${value==='Todo'?'selected':''}>Todo</option><option value="In Progress" ${value==='In Progress'?'selected':''}>In Progress</option><option value="Done" ${value==='Done'?'selected':''}>Done</option></select>`;
    case 'tags': return `<input type="text" id="${id}" class="form-control" value="${value||''}" placeholder="Separate tags with commas" />`;
    default: return `<input type="text" id="${id}" class="form-control" value="${value||''}" />`;
  }
}

// ===== pages/billing.js =====
/**
 * Billing & Taxation System — v2
 */




let billItems = [];
let bl_searchQ = '';
let bl_page = 1;
const bl_PER_PAGE = 10;

function renderBilling() {
  const user = getCurrentUser();
  const allowed = ['super_admin','admin','manager','staff'];
  if (!allowed.includes(user.role)) { navigate('/dashboard'); return; }

  const bills = getBills();
  const totalRev = bills.reduce((s,b)=>s+b.total,0);
  const totalTax = bills.reduce((s,b)=>s+b.tax,0);
  const whs = getWarehouses();

  renderShell('Billing', 'Invoice management and automated taxation', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">💰 Billing & Taxation</h1>
          <p class="page-subtitle">Automated bill generation with tax computation</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          <button class="btn btn-primary" id="new-bill-btn">+ New Bill</button>
        </div>
      </div>

      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:14px 20px;margin-bottom:24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <span style="font-size:20px">⚙️</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary)">Active Tax Rules</div>
          <div style="font-size:12px;color:var(--text-muted)">Normal items: ${getTaxConfig().normal}% GST &nbsp;|&nbsp; Luxury items: ${getTaxConfig().luxury}% GST</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:20px;flex-wrap:wrap">
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--accent-emerald)">${formatCurrency(totalRev)}</div><div style="font-size:11px;color:var(--text-muted)">Total Revenue</div></div>
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--accent-amber)">${formatCurrency(totalTax)}</div><div style="font-size:11px;color:var(--text-muted)">Total Tax</div></div>
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--text-primary)">${bills.length}</div><div style="font-size:11px;color:var(--text-muted)">Invoices</div></div>
        </div>
      </div>

      <div class="table-toolbar">
        <div class="table-search"><span>🔍</span><input type="text" id="bill-search" placeholder="Search bills, customers..." /></div>
        <div class="table-filter">
          ${user.role === 'super_admin' ? `
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="bill-wh-filter">
            <option value="">All Warehouses</option>
            ${whs.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}
          </select>` : ''}
        </div>
      </div>
      <div id="bills-table-container"></div>
    </div>
  `);

  renderBillsTable();
  document.getElementById('new-bill-btn')?.addEventListener('click', () => showBillModal());
  const debouncedSearch = debounce(q => {
    bl_searchQ = q;
    bl_page = 1;
    renderBillsTable();
  }, 300);

  document.getElementById('bill-search')?.addEventListener('input', e => debouncedSearch(e.target.value));
  document.getElementById('bill-wh-filter')?.addEventListener('change', () => { bl_page=1; renderBillsTable(); });

  // Expose printBill and showBillModal globally
  window.printBill = printBill;
  window._showBillModal = showBillModal;
}

function renderBillsTable() {
  const whs = getWarehouses();
  let bills = getBills();
  const whFilter = document.getElementById('bill-wh-filter')?.value || '';
  if (bl_searchQ) bills = filterData(bills, bl_searchQ, ['customer','billNo']);
  if (whFilter) bills = bills.filter(b=>b.warehouseId===whFilter);

  const total = bills.length;
  const bl_pages = Math.ceil(total/bl_PER_PAGE) || 1;
  
  // Bug fix: Reset page pointer if it's out of bounds after filtering
  if (bl_page > bl_pages) bl_page = 1;

  const start = (bl_page-1)*bl_PER_PAGE;
  const pageBills = bills.slice(start, start+bl_PER_PAGE);

  const container = document.getElementById('bills-table-container');
  if (!container) return;

  if (bills.length === 0) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:40px;margin-bottom:16px;opacity:0.4">🧾</div><h3 style="color:var(--text-secondary)">No bills found</h3><p style="color:var(--text-muted);margin-bottom:20px">Generate your first invoice</p><button class="btn btn-primary" onclick="document.getElementById('new-bill-btn').click()">+ New Bill</button></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Bill No.</th><th>Customer</th><th>Items</th>
          <th>Subtotal</th><th>Tax</th><th>Total</th>
          <th>Warehouse</th><th>Date</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${pageBills.map(b => {
            const wh = whs.find(w=>w.id===b.warehouseId);
            return `<tr>
              <td data-label="Bill No"><span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text-brand)">${b.billNo}</span></td>
              <td data-label="Customer"><div class="primary-cell">${b.customer}</div></td>
              <td data-label="Items"><span class="badge badge-muted">${(b.items||[]).length} item${(b.items||[]).length!==1?'s':''}</span></td>
              <td data-label="Subtotal">${formatCurrency(b.subtotal)}</td>
              <td data-label="Tax"><span style="color:var(--accent-amber)">${formatCurrency(b.tax)}</span></td>
              <td data-label="Total"><strong style="color:var(--text-primary);font-size:15px">${formatCurrency(b.total)}</strong></td>
              <td data-label="Warehouse"><span class="badge badge-info">${wh?.name||'—'}</span></td>
              <td data-label="Date" style="font-size:12px;color:var(--text-muted)">${formatDate(b.createdAt)}</td>
              <td data-label="Actions">
                <div class="table-actions">
                  <button class="action-btn view" data-bid="${b.id}" title="View Bill">👁️</button>
                  <button class="action-btn" data-print="${b.id}" title="Print Invoice" style="font-size:15px">🖨️</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+bl_PER_PAGE,total)} of ${total}</div>
        <div class="pagination-controls">
          <button class="page-btn" id="bp-prev" ${bl_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:Math.min(bl_pages,7)},(_,i)=>`<button class="page-btn ${bl_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="page-btn" id="bp-next" ${bl_page>=bl_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('.action-btn.view[data-bid]').forEach(btn => {
    btn.addEventListener('click', () => { const b = getBills().find(b=>b.id===btn.dataset.bid); if(b) showBillPreview(b); });
  });
  container.querySelectorAll('[data-print]').forEach(btn => {
    btn.addEventListener('click', () => { printBill(btn.dataset.print); });
  });
  container.querySelectorAll('.page-btn[data-pg]').forEach(btn=>btn.addEventListener('click',()=>{bl_page=parseInt(btn.dataset.pg);renderBillsTable();}));
  container.querySelector('#bp-prev')?.addEventListener('click',()=>{if(bl_page>1){bl_page--;renderBillsTable();}});
  container.querySelector('#bp-next')?.addEventListener('click',()=>{if(bl_page<bl_pages){bl_page++;renderBillsTable();}});
}

function showBillModal() {
  billItems = [];
  const whs = getWarehouses();
  const items = getItems();
  const body = document.createElement('div');

  function renderBillBody() {
    const savedCustomer = body.querySelector('#bill-customer')?.value || '';
    const savedWh = body.querySelector('#bill-wh')?.value || '';
    const warehouseId = savedWh || whs[0]?.id;
    const wh = whs.find(w => w.id === warehouseId);
    
    // Check if custom tax preference is unconfigured
    const isCustomUnconfigured = wh && wh.taxPreference === 'custom' && (!wh.taxConfig || Object.keys(wh.taxConfig).length === 0);
    const TAX_RATES = getTaxRates(warehouseId);
    
    const subtotal = billItems.reduce((s,i)=>s+(i.qty*(i.price||0)),0);
    const tax = billItems.reduce((s,i)=>s+(i.qty*(i.price||0)*(TAX_RATES[i.taxCategory]||TAX_RATES.normal)),0);
    const total = subtotal + tax;

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Customer Name <span class="req">*</span></label>
          <input type="text" id="bill-customer" class="form-control" placeholder="Customer or company name" value="${savedCustomer}" />
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Warehouse</label>
          <select id="bill-wh" class="form-control">
            ${whs.map(w=>`<option value="${w.id}" ${warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="background:var(--bg-input);border-radius:10px;padding:16px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text-secondary)">📦 Add Items</div>
        ${isCustomUnconfigured ? `
          <div style="color:var(--accent-rose);font-size:12px;font-weight:600;padding:10px;background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.2);border-radius:8px">
            ⚠️ Custom Tax Config Required: Please configure tax rates in settings for this warehouse before creating invoices.
          </div>
        ` : `
        <div style="display:grid;grid-template-columns:2fr 1fr auto;gap:8px;align-items:end">
          <div>
            <label class="form-label" style="font-size:11px">Item</label>
            <select id="item-select" class="form-control">
              <option value="">Select item...</option>
              ${items.map(i=>`<option value="${i.id}" data-price="${i.price}" data-tax="${i.taxCategory}" data-name="${i.name}">${i.name} — ${formatCurrency(i.price)} (${i.taxCategory})</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label" style="font-size:11px">Quantity</label>
            <input type="number" id="item-qty" class="form-control" value="1" min="1" />
          </div>
          <button class="btn btn-secondary btn-sm" id="add-item-btn" style="height:40px">+ Add</button>
        </div>
        `}
      </div>
      <div id="bill-items-list" style="margin-bottom:16px">
        ${billItems.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No items added yet</div>` : `
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:rgba(255,255,255,0.03)">
              <th style="padding:8px;text-align:left;font-size:11px;color:var(--text-muted)">ITEM</th>
              <th style="padding:8px;text-align:center;font-size:11px;color:var(--text-muted)">QTY</th>
              <th style="padding:8px;text-align:right;font-size:11px;color:var(--text-muted)">UNIT</th>
              <th style="padding:8px;text-align:right;font-size:11px;color:var(--text-muted)">TAX%</th>
              <th style="padding:8px;text-align:right;font-size:11px;color:var(--text-muted)">TAX AMT</th>
              <th style="padding:8px;text-align:right;font-size:11px;color:var(--text-muted)">TOTAL</th>
              <th style="width:30px"></th>
            </tr></thead>
            <tbody>
              ${billItems.map((bi,i)=>{
                const lineTotal = bi.qty * bi.price;
                const taxRate = TAX_RATES[bi.taxCategory] || TAX_RATES.normal;
                const lineTax = lineTotal * taxRate;
                return `<tr style="border-bottom:1px solid var(--border-subtle)">
                  <td style="padding:8px;font-size:13px"><strong>${bi.name}</strong></td>
                  <td style="padding:8px;text-align:center;font-size:13px">${bi.qty}</td>
                  <td style="padding:8px;text-align:right;font-size:13px">${formatCurrency(bi.price)}</td>
                  <td style="padding:8px;text-align:right;font-size:13px;color:var(--accent-amber)">${(taxRate*100).toFixed(0)}%</td>
                  <td style="padding:8px;text-align:right;font-size:13px;color:var(--accent-amber)">${formatCurrency(lineTax)}</td>
                  <td style="padding:8px;text-align:right;font-size:13px;font-weight:700">${formatCurrency(lineTotal+lineTax)}</td>
                  <td style="padding:4px"><button class="action-btn delete" onclick="window._removeBillItem(${i})">🗑️</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
      <div style="background:var(--bg-input);border-radius:10px;padding:16px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:var(--text-muted)">Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:var(--accent-amber)">Total Tax</span><span style="color:var(--accent-amber)">${formatCurrency(tax)}</span></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border-default);padding-top:10px;margin-top:4px"><span style="font-weight:700;font-size:16px">Grand Total</span><span style="font-weight:800;font-size:18px;color:var(--text-brand)">${formatCurrency(total)}</span></div>
      </div>
    `;

    // Bind dynamic warehouse selector switch to modal re-rendering
    setTimeout(() => {
      body.querySelector('#bill-wh')?.addEventListener('change', () => {
        renderBillBody();
      });
    }, 0);

    body.querySelector('#add-item-btn')?.addEventListener('click', () => {
      const sel = body.querySelector('#item-select');
      const opt = sel.selectedOptions[0];
      if (!opt || !opt.value) { showToast('Select an item','','warning'); return; }
      const qty = parseInt(body.querySelector('#item-qty').value) || 1;
      const rate = TAX_RATES[opt.dataset.tax] || TAX_RATES.normal;
      billItems.push({ id: opt.value, name: opt.dataset.name, price: parseFloat(opt.dataset.price), taxCategory: opt.dataset.tax, taxRate: rate, qty });
      renderBillBody();
    });
    window._removeBillItem = (i) => { billItems.splice(i,1); renderBillBody(); };
  }

  renderBillBody();

  const footer = `
    <button class="btn btn-secondary" id="bill-cancel">Cancel</button>
    <button class="btn btn-primary" id="bill-save">🧾 Generate Bill</button>
  `;

  const modal = createModal({ title: '🧾 New Invoice', body, footer, size: 'lg' });
  modal.el.querySelector('#bill-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#bill-save')?.addEventListener('click', async () => {
    const customer = document.getElementById('bill-customer')?.value.trim();
    if (!customer) { showToast('Validation','Customer name required','warning'); return; }
    if (billItems.length === 0) { showToast('Validation','Add at least one item','warning'); return; }
    const warehouseId = document.getElementById('bill-wh')?.value || getWarehouses()[0]?.id;
    
    // Custom tax configuration safeguard
    const wh = getWarehouses().find(w => w.id === warehouseId);
    if (wh && wh.taxPreference === 'custom' && (!wh.taxConfig || Object.keys(wh.taxConfig).length === 0)) {
      showToast('Tax Configuration Required', 'This warehouse is flagged with "Custom Tax Setup". Please configure regional tax rules in settings before generating invoices.', 'error');
      return;
    }

    const TAX_RATES = getTaxRates(warehouseId);
    const subtotal = billItems.reduce((s,i)=>s+(i.qty*i.price),0);
    const tax = billItems.reduce((s,i)=>s+(i.qty*i.price*(TAX_RATES[i.taxCategory]||TAX_RATES.normal)),0);
    const total = subtotal + tax;
    const res = await createBill({ customer, warehouseId, items: billItems.map(i=>({...i})), subtotal, tax, total });
    if (res && res.error) {
      showToast('Error Generating Bill', res.error, 'error');
      return;
    }
    showToast('Bill generated!', `${res.billNo} — ${formatCurrency(total)}`, 'success');
    billItems = [];
    modal.close();
    renderBilling();
  });
}



function showBillPreview(bill) {
  const whs = getWarehouses();
  const wh = whs.find(w=>w.id===bill.warehouseId);
  const body = buildInvoiceHTML(bill, wh, 'modal');
  const footer = `
    <button class="btn btn-secondary" id="prev-close">Close</button>
    <button class="btn btn-primary" id="prev-print">🖨️ Print Invoice</button>
  `;
  const modal = createModal({ title: `Invoice — ${bill.billNo}`, body, footer, size: 'lg' });
  modal.el.querySelector('#prev-close')?.addEventListener('click', modal.close);
  modal.el.querySelector('#prev-print')?.addEventListener('click', () => { modal.close(); printBill(bill.id); });
}

function buildInvoiceHTML(bill, wh, mode) {
  const cfg = bill.taxConfigSnapshot || getTaxConfig();
  const taxRateLabel = { luxury: `${cfg.luxury}%`, normal: `${cfg.normal}%` };
  const rows = (bill.items||[]).map(i => {
    // Use stored taxRate if available, otherwise fall back to snapshot or current config
    const taxRate = i.taxRate !== undefined ? i.taxRate : (cfg[i.taxCategory] / 100 || cfg.normal / 100);
    const lineBase = i.qty * i.price;
    const lineTax = lineBase * taxRate;
    const lineTotal = lineBase + lineTax;
    return `<tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb">${i.name}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${i.taxCategory}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${i.qty}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">$${i.price.toFixed(2)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:#b45309">${(taxRate * 100).toFixed(0)}%</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;color:#b45309">$${lineTax.toFixed(2)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700">$${lineTotal.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const containerStyle = mode === 'modal'
    ? 'font-family:Georgia,serif;color:#111;background:#fff;padding:8px'
    : 'font-family:Georgia,serif;color:#111;background:#fff;padding:0';

  return `<div style="${containerStyle}">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1e1b4b">
      <div>
        <div style="font-size:28px;font-weight:900;color:#1e1b4b;letter-spacing:-0.5px">${wh?.businessName || wh?.name || 'WareOps'}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px">${wh?.address || ''}</div>
        <div style="font-size:13px;color:#6b7280">${wh?.contact || ''} ${wh?.email ? '· '+wh.email : ''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:32px;font-weight:900;color:#6366f1;letter-spacing:1px">INVOICE</div>
        <div style="font-size:16px;font-weight:700;color:#1e1b4b;margin-top:4px">${bill.billNo}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Date: ${formatDate(bill.createdAt)}</div>
        <div style="font-size:12px;color:#6b7280">Time: ${new Date(bill.createdAt).toLocaleTimeString()}</div>
      </div>
    </div>

    <!-- Bill To -->
    <div style="display:flex;justify-content:space-between;margin-bottom:28px">
      <div style="background:#f8f9ff;border-left:4px solid #6366f1;padding:14px 18px;border-radius:0 8px 8px 0;min-width:200px">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#6366f1;margin-bottom:6px">Bill To</div>
        <div style="font-size:16px;font-weight:700;color:#111">${bill.customer}</div>
      </div>
      <div style="background:#f8f9ff;border-left:4px solid #10b981;padding:14px 18px;border-radius:0 8px 8px 0;min-width:160px">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#10b981;margin-bottom:6px">Warehouse</div>
        <div style="font-size:15px;font-weight:700;color:#111">${wh?.name || '—'}</div>
        <div style="font-size:12px;color:#6b7280">${wh?.businessName || ''}</div>
      </div>
    </div>

    <!-- Items Table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px">
      <thead>
        <tr style="background:#1e1b4b;color:#fff">
          <th style="padding:12px 8px;text-align:left;border-radius:6px 0 0 0">Item</th>
          <th style="padding:12px 8px;text-align:center">Category</th>
          <th style="padding:12px 8px;text-align:center">Qty</th>
          <th style="padding:12px 8px;text-align:right">Unit Price</th>
          <th style="padding:12px 8px;text-align:center">Tax %</th>
          <th style="padding:12px 8px;text-align:right">Tax Amt</th>
          <th style="padding:12px 8px;text-align:right;border-radius:0 6px 0 0">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Totals -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:28px">
      <div style="min-width:260px">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px">
          <span style="color:#6b7280">Subtotal</span><span style="font-weight:600">$${bill.subtotal.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px">
          <span style="color:#b45309">Total Tax</span><span style="color:#b45309;font-weight:600">$${bill.tax.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;background:#f8f9ff;border-radius:8px;padding:12px 16px;margin-top:4px">
          <span style="font-size:16px;font-weight:800;color:#1e1b4b">Grand Total</span>
          <span style="font-size:20px;font-weight:900;color:#6366f1">$${bill.total.toFixed(2)}</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top:2px solid #e5e7eb;padding-top:16px;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:11px;color:#9ca3af">
        <div>Generated by WareOps ERP</div>
        <div>${formatDateTime(bill.createdAt)}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:#10b981;background:#f0fdf4;padding:6px 16px;border-radius:99px;border:1px solid #bbf7d0">✓ PAID</div>
    </div>
  </div>`;
}

function printBill(billId) {
  const bills = getBills();
  const bill = bills.find(b=>b.id===billId);
  if (!bill) { showToast('Error','Bill not found','error'); return; }
  const whs = getWarehouses();
  const wh = whs.find(w=>w.id===bill.warehouseId);
  const invoiceHTML = buildInvoiceHTML(bill, wh, 'print');

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Invoice ${bill.billNo}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:Georgia,serif; background:#fff; color:#111; padding:20mm; }
    @page { size:A4; margin:15mm; }
    @media print {
      body { padding:0; }
      .no-print { display:none !important; }
    }
    table { border-collapse:collapse; width:100%; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;padding:12px;background:#6366f1;color:#fff;font-family:sans-serif;font-size:14px;cursor:pointer" onclick="window.print();window.close()">
    🖨️ Click here to Print / Save as PDF — then close this window
  </div>
  <div style="padding:20px">${invoiceHTML}</div>
  <script>setTimeout(()=>window.print(),600);<\/script>
</body>
</html>`);
  win.document.close();
}

// ===== pages/analytics.js =====
/**
 * Analytics & Reporting Page — Functional filters + stable data
 */




// Persisted filter state (survives re-renders within session)
let an_whFilter  = '';
let an_year      = new Date().getFullYear();
let an_month     = 0; // 0 = all months

// Track chart instances so we can destroy before re-rendering
const _charts = {};

function renderAnalytics() {
  const user = getCurrentUser();
  const isSA   = user.role === 'super_admin';
  const isAdmin = isSA || user.role === 'admin';
  const whs    = getWarehouses();

  // Build year options from actual bill data
  const allBills = getBills();
  const billYears = [...new Set(allBills.map(b => new Date(b.createdAt).getFullYear()))].sort((a,b)=>b-a);
  if (!billYears.includes(an_year)) an_year = billYears[0] || new Date().getFullYear();

  const months = ['All Months','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const taxCfg = getTaxConfig();

  renderShell('Analytics', 'Advanced reports and business insights', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">📈 Analytics & Reports</h1>
          <p class="page-subtitle">${isSA ? 'Global cross-warehouse analytics' : 'Warehouse performance analytics'}</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--bg-card);border:1px solid var(--border-default);border-radius:10px;padding:14px 18px;margin-bottom:24px">
        <span style="font-size:13px;font-weight:600;color:var(--text-secondary)">🔽 Filters:</span>

        <select class="form-control" style="width:auto;padding:7px 12px;font-size:13px" id="an-year">
          ${(billYears.length ? billYears : [new Date().getFullYear()]).map(y=>
            `<option value="${y}" ${y===an_year?'selected':''}>${y}</option>`
          ).join('')}
        </select>

        <select class="form-control" style="width:auto;padding:7px 12px;font-size:13px" id="an-month">
          ${months.map((m,i)=>`<option value="${i}" ${i===an_month?'selected':''}>${m}</option>`).join('')}
        </select>

        ${isSA ? `
        <select class="form-control" style="width:auto;padding:7px 12px;font-size:13px" id="an-wh">
          <option value="">All Warehouses</option>
          ${whs.map(w=>`<option value="${w.id}" ${w.id===an_whFilter?'selected':''}>${w.name}</option>`).join('')}
        </select>` : ''}

        <button class="btn btn-primary btn-sm" id="an-apply" style="padding:7px 16px">Apply</button>
        <button class="btn btn-ghost btn-sm" id="an-reset" style="padding:7px 12px">Reset</button>
        <span id="an-filter-label" style="font-size:12px;color:var(--text-muted);margin-left:4px"></span>
      </div>

      <!-- KPI Cards (dynamic) -->
      <div id="an-kpis"></div>

      <!-- Charts Grid -->
      <div class="dashboard-grid" style="margin-bottom:20px">
        <div class="chart-card col-8">
          <div class="chart-card-header">
            <div>
              <div class="chart-card-title">Revenue Over Time</div>
              <div class="chart-card-subtitle" id="an-chart-label">Monthly billing trend</div>
            </div>
          </div>
          <div class="chart-container" style="height:240px"><canvas id="analytics-revenue"></canvas></div>
        </div>

        <div class="chart-card col-4">
          <div class="chart-card-header">
            <div><div class="chart-card-title">Revenue by Warehouse</div></div>
          </div>
          <div class="chart-container" style="height:240px"><canvas id="analytics-wh"></canvas></div>
        </div>

        <div class="chart-card col-6">
          <div class="chart-card-header">
            <div><div class="chart-card-title">Inventory by Category</div></div>
          </div>
          <div class="chart-container" style="height:200px"><canvas id="analytics-cat"></canvas></div>
        </div>

        <div class="chart-card col-6">
          <div class="chart-card-header">
            <div><div class="chart-card-title">Team by Role</div></div>
          </div>
          <div class="chart-container" style="height:200px"><canvas id="analytics-roles"></canvas></div>
        </div>
      </div>

      <!-- Warehouse Revenue Breakdown Table -->
      ${isSA ? `
      <div class="chart-card" style="margin-bottom:20px">
        <div class="chart-card-header">
          <div><div class="chart-card-title">Warehouse Revenue Breakdown</div></div>
        </div>
        <div id="an-wh-breakdown"></div>
      </div>` : ''}

      <!-- Stock Overview Table -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-card-title">Stock Overview</div></div>
        </div>
        <div id="an-stock-table"></div>
      </div>
    </div>
  `);

  // Wire filter controls
  const applyBtn = document.getElementById('an-apply');
  const resetBtn = document.getElementById('an-reset');

  applyBtn?.addEventListener('click', applyFilters);
  resetBtn?.addEventListener('click', () => {
    an_whFilter = '';
    an_year = new Date().getFullYear();
    an_month = 0;
    const ys = document.getElementById('an-year');
    const ms = document.getElementById('an-month');
    const ws = document.getElementById('an-wh');
    if (ys) ys.value = an_year;
    if (ms) ms.value = 0;
    if (ws) ws.value = '';
    applyFilters();
  });

  // Also live-apply on any change
  ['an-year','an-month','an-wh'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFilters);
  });

  // Initial render
  applyFilters();
}

function applyFilters() {
  // Read current filter values
  const ySel = document.getElementById('an-year');
  const mSel = document.getElementById('an-month');
  const wSel = document.getElementById('an-wh');
  if (ySel) an_year    = parseInt(ySel.value);
  if (mSel) an_month   = parseInt(mSel.value);
  if (wSel) an_whFilter = wSel.value;

  // Filter bills
  const allBills = getBills();
  const items    = getItems();
  const users    = getAllUsers();
  const whs      = getWarehouses();
  const taxCfg   = getTaxConfig();
  const isSA     = getCurrentUser()?.role === 'super_admin';

  let filtered = allBills.filter(b => {
    const d = new Date(b.createdAt);
    const yearMatch  = d.getFullYear() === an_year;
    const monthMatch = an_month === 0 || (d.getMonth() + 1) === an_month;
    const whMatch    = !an_whFilter || b.warehouseId === an_whFilter;
    return yearMatch && monthMatch && whMatch;
  });

  const filtItems = an_whFilter ? items.filter(i=>i.warehouseId===an_whFilter) : items;

  // Update filter label
  const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const whName = an_whFilter ? (whs.find(w=>w.id===an_whFilter)?.name||'') : 'All Warehouses';
  const periodLabel = an_month === 0 ? `Full Year ${an_year}` : `${months[an_month]} ${an_year}`;
  const labelEl = document.getElementById('an-filter-label');
  if (labelEl) labelEl.textContent = `Showing: ${periodLabel} · ${whName} · ${filtered.length} invoices`;

  // Update chart subtitle
  const chartLabel = document.getElementById('an-chart-label');
  if (chartLabel) chartLabel.textContent = `${periodLabel} · ${whName}`;

  // Compute KPIs
  const totalRev = filtered.reduce((s,b)=>s+(b.total||0),0);
  const totalTax = filtered.reduce((s,b)=>s+(b.tax||0),0);
  const avgBill  = filtered.length ? totalRev/filtered.length : 0;
  const netRev   = totalRev - totalTax;

  updateKPIs(totalRev, totalTax, avgBill, netRev, filtered.length);
  updateCharts(filtered, filtItems, users, whs);
  if (isSA) updateWhBreakdown(filtered, whs, totalRev);
  updateStockTable(filtItems, taxCfg);
}

function updateKPIs(totalRev, totalTax, avgBill, netRev, count) {
  const el = document.getElementById('an-kpis');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-glow" style="background:#6366f1"></div>
        <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">💰</div>
        <div class="stat-card-value">${formatCurrency(totalRev)}</div>
        <div class="stat-card-label">Total Revenue</div>
        <div class="stat-card-trend trend-up">${count} invoices</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-glow" style="background:#10b981"></div>
        <div class="stat-card-icon" style="background:rgba(16,185,129,0.15)">💵</div>
        <div class="stat-card-value">${formatCurrency(netRev)}</div>
        <div class="stat-card-label">Net Revenue</div>
        <div class="stat-card-trend trend-up">After tax</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-glow" style="background:#f59e0b"></div>
        <div class="stat-card-icon" style="background:rgba(245,158,11,0.15)">🏛️</div>
        <div class="stat-card-value">${formatCurrency(totalTax)}</div>
        <div class="stat-card-label">Tax Collected</div>
        <div class="stat-card-trend">Automated</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-glow" style="background:#8b5cf6"></div>
        <div class="stat-card-icon" style="background:rgba(139,92,246,0.15)">🎯</div>
        <div class="stat-card-value">${formatCurrency(avgBill)}</div>
        <div class="stat-card-label">Avg. Invoice</div>
        <div class="stat-card-trend trend-up">${count} total</div>
      </div>
    </div>`;
}

function destroyChart(id) {
  if (_charts[id]) { try { _charts[id].destroy(); } catch(e){} delete _charts[id]; }
}

function updateCharts(bills, items, users, whs) {
  const CHART_OPTS = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color:'#94a3b8', font:{ size:11 } } },
      tooltip: { backgroundColor:'#1a1d3a', titleColor:'#f1f5f9', bodyColor:'#94a3b8', borderColor:'#2a2d4a', borderWidth:1 }
    }
  };

  // ── Revenue over time ─────────────────────────────────────────────────────
  // If a specific month is chosen, show daily breakdown; otherwise monthly
  const revCanvas = document.getElementById('analytics-revenue');
  destroyChart('analytics-revenue');
  if (revCanvas) {
    let labels, revData, taxData;
    if (an_month !== 0) {
      // Daily view for the selected month
      const daysInMonth = new Date(an_year, an_month, 0).getDate();
      labels = Array.from({length:daysInMonth},(_,i)=>String(i+1));
      revData = labels.map((_,i) => {
        const day = i+1;
        return bills.filter(b=>{
          const d=new Date(b.createdAt);
          return d.getDate()===day;
        }).reduce((s,b)=>s+(b.total||0),0);
      });
      taxData = labels.map((_,i) => {
        const day=i+1;
        return bills.filter(b=>{
          const d=new Date(b.createdAt);
          return d.getDate()===day;
        }).reduce((s,b)=>s+(b.tax||0),0);
      });
    } else {
      // Monthly view for the selected year
      const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      labels = monthNames;
      revData = monthNames.map((_,i) =>
        bills.filter(b=>new Date(b.createdAt).getMonth()===i).reduce((s,b)=>s+(b.total||0),0)
      );
      taxData = monthNames.map((_,i) =>
        bills.filter(b=>new Date(b.createdAt).getMonth()===i).reduce((s,b)=>s+(b.tax||0),0)
      );
    }

    _charts['analytics-revenue'] = new Chart(revCanvas, {
      type:'bar',
      data:{
        labels,
        datasets:[
          { label:'Revenue', data:revData, backgroundColor:'rgba(99,102,241,0.75)', borderColor:'#6366f1', borderWidth:1, borderRadius:4 },
          { label:'Tax',     data:taxData, backgroundColor:'rgba(245,158,11,0.55)', borderColor:'#f59e0b', borderWidth:1, borderRadius:4 }
        ]
      },
      options:{
        ...CHART_OPTS,
        scales:{
          x:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#64748b', maxTicksLimit:12 } },
          y:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#64748b', callback:v=>'$'+(v>=1000?(v/1000).toFixed(0)+'k':v) }, border:{display:false} }
        }
      }
    });
  }

  // ── Revenue by warehouse ─────────────────────────────────────────────────
  const whCanvas = document.getElementById('analytics-wh');
  destroyChart('analytics-wh');
  if (whCanvas && whs.length) {
    const whRevs = whs.map(w=>bills.filter(b=>b.warehouseId===w.id).reduce((s,b)=>s+(b.total||0),0));
    const hasData = whRevs.some(v=>v>0);
    _charts['analytics-wh'] = new Chart(whCanvas, {
      type:'doughnut',
      data:{
        labels: whs.map(w=>w.name),
        datasets:[{
          data: hasData ? whRevs : whs.map(()=>1),
          backgroundColor:['rgba(99,102,241,0.85)','rgba(16,185,129,0.85)','rgba(6,182,212,0.85)','rgba(245,158,11,0.85)','rgba(244,63,94,0.85)'],
          borderColor:'#0f1029', borderWidth:2
        }]
      },
      options:{
        ...CHART_OPTS, cutout:'62%',
        plugins:{
          ...CHART_OPTS.plugins,
          legend:{ position:'bottom', labels:{ color:'#94a3b8', padding:10, font:{size:11} } }
        }
      }
    });
  }

  // ── Inventory by category ────────────────────────────────────────────────
  const cats = [...new Set(items.map(i=>i.category))].filter(Boolean);
  const catCanvas = document.getElementById('analytics-cat');
  destroyChart('analytics-cat');
  if (catCanvas && cats.length) {
    _charts['analytics-cat'] = new Chart(catCanvas, {
      type:'bar',
      data:{
        labels: cats,
        datasets:[
          { label:'Stock', data:cats.map(c=>items.filter(i=>i.category===c).reduce((s,i)=>s+(i.stock||0),0)), backgroundColor:'rgba(6,182,212,0.75)', borderColor:'#06b6d4', borderWidth:1, borderRadius:4 },
          { label:'Value ($)', data:cats.map(c=>items.filter(i=>i.category===c).reduce((s,i)=>s+(i.price||0)*(i.stock||0),0)), backgroundColor:'rgba(16,185,129,0.55)', borderColor:'#10b981', borderWidth:1, borderRadius:4, yAxisID:'y2' }
        ]
      },
      options:{
        ...CHART_OPTS,
        indexAxis:'y',
        scales:{
          x:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#64748b'}, border:{display:false} },
          y:{ grid:{display:false}, ticks:{color:'#64748b'} },
          y2:{ position:'right', grid:{display:false}, ticks:{color:'#64748b', callback:v=>'$'+(v/1000).toFixed(0)+'k'}, border:{display:false} }
        }
      }
    });
  }

  // ── User roles ──────────────────────────────────────────────────────────
  const roles=['admin','manager','staff','employee'];
  const roleCounts = roles.map(r=>users.filter(u=>u.role===r).length);
  const roleCanvas = document.getElementById('analytics-roles');
  destroyChart('analytics-roles');
  if (roleCanvas) {
    _charts['analytics-roles'] = new Chart(roleCanvas, {
      type:'pie',
      data:{
        labels: roles.map(r=>r.charAt(0).toUpperCase()+r.slice(1)+` (${users.filter(u=>u.role===r).length})`),
        datasets:[{
          data: roleCounts.every(v=>v===0) ? [1,1,1,1] : roleCounts,
          backgroundColor:['rgba(6,182,212,0.85)','rgba(16,185,129,0.85)','rgba(245,158,11,0.85)','rgba(100,116,139,0.85)'],
          borderColor:'#0f1029', borderWidth:2
        }]
      },
      options:{
        ...CHART_OPTS,
        plugins:{
          ...CHART_OPTS.plugins,
          legend:{ position:'bottom', labels:{ color:'#94a3b8', padding:10, font:{size:11} } }
        }
      }
    });
  }
}

function updateWhBreakdown(bills, whs, totalRev) {
  const el = document.getElementById('an-wh-breakdown');
  if (!el) return;
  if (whs.length === 0) { el.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:20px">No warehouses</div>`; return; }
  el.innerHTML = whs.map(wh => {
    const rev = bills.filter(b=>b.warehouseId===wh.id).reduce((s,b)=>s+(b.total||0),0);
    const tax = bills.filter(b=>b.warehouseId===wh.id).reduce((s,b)=>s+(b.tax||0),0);
    const cnt = bills.filter(b=>b.warehouseId===wh.id).length;
    const pct = totalRev>0 ? Math.round(rev/totalRev*100) : 0;
    return `
      <div class="revenue-bar" style="margin-bottom:12px">
        <div class="revenue-bar-label">${wh.logo||'🏭'} ${wh.name}
          <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${cnt} invoice${cnt!==1?'s':''} · Tax: ${formatCurrency(tax)}</span>
        </div>
        <div class="revenue-bar-track"><div class="revenue-bar-fill" style="width:${pct}%"></div></div>
        <div class="revenue-bar-val">${formatCurrency(rev)} <span style="color:var(--text-muted);font-size:10px">${pct}%</span></div>
      </div>`;
  }).join('');
}

function updateStockTable(items, taxCfg) {
  const el = document.getElementById('an-stock-table');
  if (!el) return;
  if (items.length === 0) { el.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:20px">No inventory items</div>`; return; }
  const sorted = [...items].sort((a,b)=>(b.price*b.stock)-(a.price*a.stock));
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Item</th><th>Category</th><th>Price</th><th>Stock</th>
          <th>Value</th><th>Tax</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${sorted.slice(0,10).map(i=>{
            const rate = i.taxCategory==='luxury' ? taxCfg.luxury : taxCfg.normal;
            const val  = (i.price||0)*(i.stock||0);
            const stockClass = (i.stock||0)<10?'badge-danger':(i.stock||0)<20?'badge-warning':'badge-success';
            return `<tr>
              <td data-label="Item"><div class="primary-cell">${i.name}</div><div class="sub-cell">${i.sku||'—'}</div></td>
              <td data-label="Category"><span class="badge badge-brand">${i.category}</span></td>
              <td data-label="Price">${formatCurrency(i.price||0)}</td>
              <td data-label="Stock"><span class="badge ${stockClass}">${i.stock||0} ${i.unit||'pcs'}</span></td>
              <td data-label="Value"><strong>${formatCurrency(val)}</strong></td>
              <td data-label="Tax"><span class="badge ${i.taxCategory==='luxury'?'badge-purple':'badge-info'}">${rate}%</span></td>
              <td data-label="Status"><span class="badge ${(i.stock||0)<20?'badge-danger':'badge-success'}">${(i.stock||0)<20?'Low':'OK'}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ===== pages/audit.js =====
/**
 * Audit Logs Page
 */




let au_searchQ = '';
let au_page = 1;
const au_PER_PAGE = 15;

function renderAudit() {
  const user = getCurrentUser();
  renderShell('Audit Logs', 'System activity and security trail', `
    <div class="animate-slideUp">
      <div class="au_page-header">
        <div class="au_page-header-left">
          <h1 class="au_page-title">🔍 Audit Logs</h1>
          <p class="au_page-subtitle">Complete activity trail for compliance and monitoring</p>
        </div>
        <div class="au_page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>
      <div class="table-toolbar">
        <div class="table-search"><span>🔍</span><input type="text" id="audit-search" placeholder="Search logs..." /></div>
        <div class="table-filter">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="audit-action-filter">
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="user_create">User Create</option>
            <option value="warehouse_create">Warehouse Create</option>
            <option value="bill_create">Bill Create</option>
            <option value="table_create">Table Create</option>
            <option value="item_create">Item Create</option>
          </select>
        </div>
      </div>
      <div id="audit-table-container"></div>
    </div>
  `);

  renderAuditTable();
  document.getElementById('audit-search')?.addEventListener('input', e=>{au_searchQ=e.target.value;au_page=1;renderAuditTable();});
  document.getElementById('audit-action-filter')?.addEventListener('change',()=>{au_page=1;renderAuditTable();});
}

const ACTION_ICONS = { login:'🔐', logout:'🚪', user_create:'👤➕', user_update:'👤✏️', user_delete:'👤🗑️', warehouse_create:'🏭➕', warehouse_update:'🏭✏️', warehouse_delete:'🏭🗑️', bill_create:'🧾', table_create:'📋➕', item_create:'📦➕' };
const ACTION_CLASSES = { login:'badge-info', user_create:'badge-success', user_delete:'badge-danger', warehouse_create:'badge-success', warehouse_delete:'badge-danger', bill_create:'badge-brand', table_create:'badge-success', item_create:'badge-success' };

function renderAuditTable() {
  let logs = getAuditLogs();
  const actionFilter = document.getElementById('audit-action-filter')?.value||'';
  if (au_searchQ) logs = filterData(logs, au_searchQ, ['description','userName','action']);
  if (actionFilter) logs = logs.filter(l=>l.action===actionFilter);

  const total = logs.length;
  const au_pages = Math.ceil(total/au_PER_PAGE);
  const start = (au_page-1)*au_PER_PAGE;
  const au_pageLogs = logs.slice(start, start+au_PER_PAGE);

  const container = document.getElementById('audit-table-container');
  if (!container) return;

  if (logs.length === 0) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:40px;margin-bottom:16px;opacity:0.4">🔍</div><h3 style="color:var(--text-secondary)">No logs found</h3></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Action</th><th>Description</th><th>User</th><th>Timestamp</th></tr></thead>
        <tbody>
          ${au_pageLogs.map((log,i)=>`<tr>
            <td data-label="#" style="color:var(--text-muted);font-size:12px">${start+i+1}</td>
            <td data-label="Action">
              <span class="badge ${ACTION_CLASSES[log.action]||'badge-muted'}">
                ${ACTION_ICONS[log.action]||'📝'} ${log.action.replace(/_/g,' ')}
              </span>
            </td>
            <td data-label="Description" style="font-size:13px">${log.description}</td>
            <td data-label="User">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:26px;height:26px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;flex-shrink:0">${log.userName.slice(0,2).toUpperCase()}</div>
                <span style="font-size:13px">${log.userName}</span>
              </div>
            </td>
            <td data-label="Timestamp" style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono)">${formatDateTime(log.timestamp)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+au_PER_PAGE,total)} of ${total} logs</div>
        <div class="pagination-controls">
          <button class="au_page-btn" id="ap-prev" ${au_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:Math.min(au_pages,7)},(_,i)=>`<button class="au_page-btn ${au_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="au_page-btn" id="ap-next" ${au_page>=au_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('.au_page-btn[data-pg]').forEach(btn=>btn.addEventListener('click',()=>{au_page=parseInt(btn.dataset.pg);renderAuditTable();}));
  container.querySelector('#ap-prev')?.addEventListener('click',()=>{if(au_page>1){au_page--;renderAuditTable();}});
  container.querySelector('#ap-next')?.addEventListener('click',()=>{if(au_page<au_pages){au_page++;renderAuditTable();}});
}

// ===== pages/settings.js =====
function renderSettings() {
  const user = getCurrentUser();
  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = ['super_admin','admin'].includes(user.role);
  const taxCfg = getTaxConfig();

  renderShell('Settings', 'Platform configuration and preferences', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">⚙️ System Settings</h1>
          <p class="page-subtitle">Platform configuration, preferences, and account management</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <div class="dashboard-grid">
        <!-- Profile Card -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">👤 Profile Settings</div>
              <div class="card-subtitle">Your account information</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px">
            <div style="width:72px;height:72px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:white;flex-shrink:0;box-shadow:var(--shadow-brand)">${user.avatar}</div>
            <div>
              <div style="font-size:20px;font-weight:800;margin-bottom:2px">${user.name}</div>
              <div style="font-size:13px;color:var(--text-muted)">${user.email}</div>
              <span class="badge role-${user.role.replace('_','-')}" style="margin-top:6px">${user.role.replace('_',' ')}</span>
            </div>
          </div>
          <form id="profile-form">
            <div class="form-group">
              <label class="form-label">Display Name</label>
              <input type="text" id="s-name" class="form-control" value="${user.name}" />
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="s-email" class="form-control" value="${user.email}" readonly style="opacity:0.7" />
              <div class="form-hint">Email cannot be changed</div>
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Save Profile</button>
          </form>
        </div>

        <!-- Security -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">🔒 Security</div>
              <div class="card-subtitle">Password and access settings</div>
            </div>
          </div>
          <form id="pw-form">
            <div class="form-group">
              <label class="form-label">Current Password</label>
              <input type="password" id="s-current-pw" class="form-control" placeholder="Enter current password" />
            </div>
            <div class="form-group">
              <label class="form-label">New Password</label>
              <input type="password" id="s-new-pw" class="form-control" placeholder="Min 8 characters" minlength="8" />
            </div>
            <div class="form-group">
              <label class="form-label">Confirm New Password</label>
              <input type="password" id="s-confirm-pw" class="form-control" placeholder="Repeat new password" />
            </div>
            <button type="submit" class="btn btn-secondary btn-sm">Update Password</button>
          </form>
        </div>

        ${isAdmin ? `
        <!-- Tax Configuration -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">🏛️ Tax Configuration</div>
              <div class="card-subtitle">Configure global tax rates for billing engine</div>
            </div>
          </div>
          <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:var(--text-muted)">
            ⚠️ Changes affect all <strong>future</strong> bills. Past invoices remain unchanged.
            ${!isSuperAdmin ? '<br><span style="color:var(--accent-amber)">Note: Full edit requires Super Admin.</span>' : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Normal Category Tax Rate</label>
            <div style="display:flex;align-items:center;gap:12px">
              <input type="number" id="tax-normal" class="form-control" value="${taxCfg.normal}" min="0" max="100" step="0.5" style="width:110px" ${!isSuperAdmin ? 'readonly style="opacity:0.6;pointer-events:none"' : ''} />
              <span style="color:var(--text-muted)">%</span>
              <span class="badge badge-info">Standard items</span>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Luxury Category Tax Rate</label>
            <div style="display:flex;align-items:center;gap:12px">
              <input type="number" id="tax-luxury" class="form-control" value="${taxCfg.luxury}" min="0" max="100" step="0.5" style="width:110px" ${!isSuperAdmin ? 'readonly style="opacity:0.6;pointer-events:none"' : ''} />
              <span style="color:var(--text-muted)">%</span>
              <span class="badge badge-purple">Premium items</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
            <button class="btn btn-primary btn-sm" id="save-tax-btn" ${!isSuperAdmin ? 'disabled title="Super Admin only"' : ''}>💾 Save Tax Rules</button>
            <span id="tax-saved-msg" style="font-size:12px;color:var(--accent-emerald);display:none">✓ Saved!</span>
          </div>
          <div style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:8px;font-size:12px">
            <div style="font-weight:600;margin-bottom:6px;color:var(--text-secondary)">Currently Active Rates:</div>
            <div style="display:flex;gap:16px">
              <div>Normal: <strong style="color:var(--accent-emerald)">${taxCfg.normal}%</strong></div>
              <div>Luxury: <strong style="color:var(--accent-amber)">${taxCfg.luxury}%</strong></div>
            </div>
          </div>
        </div>` : ''}

        <!-- Notifications -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">🔔 Notifications</div>
              <div class="card-subtitle">Manage alert preferences</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${[
              { id:'notif-billing', key: 'billing', label:'Billing alerts', desc:'Get notified for new invoices' },
              { id:'notif-stock', key: 'stock', label:'Low stock alerts', desc:'Alert when stock drops below 20 units' },
              { id:'notif-user', key: 'user', label:'User activity', desc:'Notifications for login/logout events' },
              { id:'notif-system', key: 'system', label:'System updates', desc:'Platform maintenance and updates' },
            ].map(n => {
              const isOn = user.settings?.notifications?.[n.key] !== false;
              return `
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                  <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${n.label}</div>
                  <div style="font-size:12px;color:var(--text-muted)">${n.desc}</div>
                </div>
                <label style="display:flex;align-items:center;cursor:pointer">
                  <input type="checkbox" id="${n.id}" data-key="${n.key}" class="notif-toggle-input" ${isOn?'checked':''} style="display:none" />
                  <div class="toggle-switch ${isOn?'on':''}" style="width:40px;height:22px;border-radius:11px;background:${isOn?'var(--brand-500)':'var(--bg-input)'};border:1px solid var(--border-default);position:relative;transition:all 0.2s;cursor:pointer">
                    <div style="position:absolute;top:2px;left:${isOn?'18px':'2px'};width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>
                  </div>
                </label>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Export Panel -->
        <div class="card col-12">
          <div class="card-header">
            <div>
              <div class="card-title">📤 Export Data</div>
              <div class="card-subtitle">Download platform data in your preferred format</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:20px">
            ${[
              { key:'bills',      icon:'🧾', label:'Billing & Invoices',   desc:'All invoices with tax breakdown',   role:'manager' },
              { key:'inventory',  icon:'📦', label:'Inventory',            desc:'Items, SKUs, stock, prices',        role:'manager' },
              { key:'workforce',  icon:'👥', label:'Workforce',            desc:'Team members, roles, assignments',  role:'admin'   },
              { key:'warehouses', icon:'🏭', label:'Warehouses',           desc:'All warehouse locations & stats',   role:'super_admin' },
              { key:'audit',      icon:'🔍', label:'Audit Logs',           desc:'System activity and changes',       role:'super_admin' },
              { key:'all',        icon:'📊', label:'Full Export',          desc:'All accessible data combined',      role:'admin'   },
            ].filter(e => {
              if (e.role === 'super_admin') return isSuperAdmin;
              if (e.role === 'admin') return isAdmin;
              return true;
            }).map(e => `
              <div style="background:var(--bg-input);border:1px solid var(--border-default);border-radius:12px;padding:16px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                  <span style="font-size:22px">${e.icon}</span>
                  <div>
                    <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${e.label}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${e.desc}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn btn-secondary btn-sm export-btn" data-entity="${e.key}" data-fmt="csv" style="font-size:11px;padding:4px 10px">CSV</button>
                  <button class="btn btn-secondary btn-sm export-btn" data-entity="${e.key}" data-fmt="xlsx" style="font-size:11px;padding:4px 10px">Excel</button>
                  <button class="btn btn-secondary btn-sm export-btn" data-entity="${e.key}" data-fmt="pdf" style="font-size:11px;padding:4px 10px">PDF</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="card col-12" style="border-color:rgba(244,63,94,0.2);background:rgba(244,63,94,0.03)">
          <div class="card-header">
            <div><div class="card-title" style="color:var(--accent-rose)">⚠️ Danger Zone</div></div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-size:14px;font-weight:600">Reset Demo Data</div>
              <div style="font-size:12px;color:var(--text-muted)">Clear all data and restore to fresh state (keeps your account)</div>
            </div>
            <button class="btn btn-danger btn-sm" id="reset-btn">🗑️ Reset Data</button>
          </div>
        </div>
      </div>
    </div>
  `);

  // Profile save
  document.getElementById('profile-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('s-name').value.trim();
    if (!name) return;
    
    const res = await updateUser(user.id, { name });
    if (res && res.error) {
      showToast('Error Updating Profile', res.error, 'error');
      return;
    }
    showToast('Profile updated','Your name has been updated','success');
    renderSettings();
  });

  // Password change
  document.getElementById('pw-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const current = document.getElementById('s-current-pw').value;
    const newPw = document.getElementById('s-new-pw').value;
    const conf = document.getElementById('s-confirm-pw').value;
    if (newPw !== conf) { showToast('Mismatch','Passwords do not match','error'); return; }
    if (newPw.length < 8) { showToast('Validation','Password must be 8+ characters','warning'); return; }
    const s = getStore();
    const u = s.users.find(u=>u.id===s.currentUserId);
    if (!u || u.password !== current) { showToast('Wrong password','Current password is incorrect','error'); return; }
    u.password = newPw;
    saveStore();
    showToast('Password changed','Your password has been updated','success');
    e.target.reset();
  });

  // TAX SAVE — actually persist to store
  document.getElementById('save-tax-btn')?.addEventListener('click', async () => {
    if (!isSuperAdmin) { showToast('Permission denied','Only Super Admin can change tax rates','error'); return; }
    const normal = parseFloat(document.getElementById('tax-normal')?.value);
    const luxury = parseFloat(document.getElementById('tax-luxury')?.value);
    if (isNaN(normal) || isNaN(luxury) || normal < 0 || luxury < 0 || normal > 100 || luxury > 100) {
      showToast('Invalid values','Tax rates must be between 0 and 100','error');
      return;
    }
    await saveTaxConfig({ normal, luxury });
    showToast('Tax rules saved', `Normal: ${normal}% | Luxury: ${luxury}% — applied to future bills`, 'success');
    // Show inline confirmation
    const msg = document.getElementById('tax-saved-msg');
    if (msg) { msg.style.display = 'inline'; setTimeout(() => msg.style.display = 'none', 3000); }
    // Update the displayed active rates
    document.querySelectorAll('#tax-saved-msg').forEach(el => el.style.display='inline');
  });

  // Notification toggles
  document.querySelectorAll('.notif-toggle-input').forEach(input => {
    input.addEventListener('change', async () => {
      const s = getStore();
      const u = s.users.find(usr => usr.id === s.currentUserId);
      if (!u.settings) u.settings = {};
      if (!u.settings.notifications) u.settings.notifications = {};
      u.settings.notifications[input.dataset.key] = input.checked;
      
      const res = await updateUser(u.id, { settings: u.settings });
      if (res && res.error) {
        showToast('Error Saving Preference', res.error, 'error');
        return;
      }
      
      await apiFetch('/audit-logs/', {
        method: 'POST',
        body: JSON.stringify({
          action: 'settings_update',
          description: `Notification preference changed: ${input.dataset.key} set to ${input.checked ? 'enabled' : 'disabled'}`,
          warehouseId: s.currentWarehouseId || null
        })
      });
      
      showToast('Preference saved', `${input.dataset.key} alerts ${input.checked ? 'enabled' : 'disabled'}`, 'info');
      renderSettings(); // Re-render to update toggle colors
    });
  });

  // EXPORT — delegated to exporter module
  document.querySelectorAll('.export-btn[data-entity]').forEach(btn => {
    btn.addEventListener('click', () => {
      const entity = btn.dataset.entity;
      const fmt = btn.dataset.fmt;
      btn.textContent = '⏳';
      btn.disabled = true;
      setTimeout(() => {
        let result;
        try {
          if (fmt === 'csv')  result = exportCSV(entity);
          else if (fmt === 'xlsx') result = exportXLSX(entity);
          else if (fmt === 'pdf')  result = exportPDF(entity);
          if (result?.error) {
            showToast('Export failed', result.error, 'error');
          } else {
            showToast('Export complete', `${result?.entity}: ${result?.count} records exported`, 'success');
          }
        } catch(e) {
          showToast('Export error', e.message, 'error');
        }
        btn.textContent = fmt.toUpperCase();
        btn.disabled = false;
      }, 50);
    });
  });

  // RESET
  document.getElementById('reset-btn')?.addEventListener('click', async () => {
    const ok = await confirm('This will delete all warehouses, users, bills and tables. Your admin account will remain.', '⚠️ Reset All Data');
    if (ok) {
      const s = getStore();
      const currentUser = s.users.find(u=>u.id===s.currentUserId);
      s.warehouses=[];s.bills=[];s.items=[];s.tables=[];s.tableData={};s.auditLogs=[];s.notifications=[];
      s.users = [currentUser];
      saveStore();
      showToast('Data reset','Platform reset to fresh state','success');
      location.hash='#/dashboard';
    }
  });
}

// ===== pages/subscription.js =====
/**
 * Subscription Management Page
 */





function renderSubscription() {
  const user = getCurrentUser();
  if (!user || user.role !== 'super_admin') { navigate('/dashboard'); return; }

  const sub = getSubscription();
  const whs = getWarehouses();
  const isEnterprise = sub.plan === 'enterprise';
  const isStarter = sub.plan === 'starter';
  const warehouseLimit = isStarter ? 1 : '∞';
  const warehousesUsed = whs.length;

  const expiry = sub.expiryDate ? formatDate(sub.expiryDate) : 'No expiry (Demo)';
  const startDate = formatDate(sub.startDate);

  renderShell('Subscription', 'Manage your SaaS plan and billing', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">💳 Subscription Management</h1>
          <p class="page-subtitle">Your current plan, limits, and upgrade options</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <!-- Current Plan Card -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
        <div style="background:${isEnterprise ? 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(168,85,247,0.15))' : 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.15))'};border:1px solid ${isEnterprise ? 'rgba(99,102,241,0.4)' : 'rgba(16,185,129,0.4)'};border-radius:16px;padding:28px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div style="font-size:36px">${isEnterprise ? '🟣' : '🟢'}</div>
            <div>
              <div style="font-size:22px;font-weight:900;color:var(--text-primary)">${isEnterprise ? 'Enterprise' : 'Starter'} Plan</div>
              <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Current Active Plan</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
            <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:12px">
              <div style="color:var(--text-muted);margin-bottom:4px;font-size:11px;text-transform:uppercase">Status</div>
              <div style="font-weight:700;color:var(--accent-emerald)">● Active</div>
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:12px">
              <div style="color:var(--text-muted);margin-bottom:4px;font-size:11px;text-transform:uppercase">Plan Start</div>
              <div style="font-weight:700">${startDate}</div>
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:12px">
              <div style="color:var(--text-muted);margin-bottom:4px;font-size:11px;text-transform:uppercase">Warehouses</div>
              <div style="font-weight:700">${warehousesUsed} / ${warehouseLimit}</div>
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:12px">
              <div style="color:var(--text-muted);margin-bottom:4px;font-size:11px;text-transform:uppercase">Expiry</div>
              <div style="font-weight:700">${expiry}</div>
            </div>
          </div>
        </div>

        <!-- Quick Stats -->
        <div style="display:flex;flex-direction:column;gap:12px">
          ${[
            { icon:'🏭', label:'Warehouses Active', val: warehousesUsed, color:'var(--accent-violet)' },
            { icon:'📦', label:'Warehouse Limit', val: warehouseLimit, color:'var(--accent-emerald)' },
            { icon:'👑', label:'Account Type', val: 'Super Admin', color:'var(--accent-amber)' },
          ].map(s=>`
            <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:12px;padding:16px;display:flex;align-items:center;gap:12px;flex:1">
              <div style="font-size:24px">${s.icon}</div>
              <div>
                <div style="font-size:18px;font-weight:800;color:${s.color}">${s.val}</div>
                <div style="font-size:12px;color:var(--text-muted)">${s.label}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Plan Features -->
      <div style="margin-bottom:32px">
        <h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:16px">Plan Features</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          ${[
            { icon:'🏭', feat:'Multi-Warehouse Support', starter: isStarter ? '1 Warehouse' : '✓', enterprise: '✓ Unlimited' },
            { icon:'👥', feat:'Workforce Management', starter:'✓', enterprise:'✓ + Cross-Warehouse' },
            { icon:'💰', feat:'Billing & Invoicing', starter:'✓', enterprise:'✓' },
            { icon:'📊', feat:'Analytics & Reports', starter:'Basic', enterprise:'✓ Global' },
            { icon:'📋', feat:'Dynamic Table Builder', starter:'Limited', enterprise:'✓ Unlimited' },
            { icon:'🔍', feat:'Audit Logs', starter:'30 days', enterprise:'✓ Full History' },
          ].map(f=>`
            <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px">
              <span style="font-size:20px">${f.icon}</span>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${f.feat}</div>
                <div style="font-size:12px;color:var(--text-muted)">Starter: ${f.starter}</div>
              </div>
              <div style="font-size:13px;font-weight:700;color:var(--accent-emerald)">${f.enterprise}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Upgrade Banner (if starter) -->
      ${isStarter ? `
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:16px;padding:28px;text-align:center;color:white">
        <div style="font-size:28px;margin-bottom:8px">🚀</div>
        <h3 style="font-size:20px;font-weight:800;margin-bottom:8px">Upgrade to Enterprise</h3>
        <p style="font-size:14px;opacity:0.85;margin-bottom:20px">Unlock unlimited warehouses, global analytics, and full ERP capabilities</p>
        <button class="btn" style="background:white;color:#6366f1;font-weight:700;padding:10px 28px;border-radius:8px" id="upgrade-btn">Contact Sales to Upgrade</button>
      </div>` : `
      <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:24px;margin-bottom:8px">✅</div>
        <div style="font-size:15px;font-weight:700;color:var(--accent-emerald)">You're on the Enterprise Plan</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:4px">All features are unlocked. No restrictions apply.</div>
      </div>`}

      <div style="margin-top:16px;padding:16px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px;font-size:12px;color:var(--text-muted);text-align:center">
        ⚠️ <strong>Demo Mode:</strong> No real payment gateway active. All subscription features are for demonstration purposes only.
      </div>
    </div>
  `);

  document.getElementById('upgrade-btn')?.addEventListener('click', () => {
    showToast('Enterprise Plan', 'Contact sales@wareops.io to upgrade your plan.', 'info');
  });
}

// ===== app.js =====
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


// Pages













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
    const publicRoutes = ['/login', '/signup'];

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
      // Redirect away from public routes if already logged in
      if (publicRoutes.includes(path)) {
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
