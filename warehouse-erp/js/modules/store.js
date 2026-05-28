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

export function getStore() {
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

export function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_store));
}

export function resetStore() {
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

export async function apiFetch(path, options = {}) {
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

export function normalize(data) {
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

export async function syncWithBackend() {
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
export function getCurrentUser() {
  const s = getStore();
  return s.users.find(u => u.id === s.currentUserId) || null;
}

export async function login(email, password) {
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

export async function logout() {
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

export async function signup(name, email, password) {
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
export function getWarehouses() {
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

export function getStockHealth(warehouseId) {
  const s = getStore();
  const items = warehouseId ? s.items.filter(i => i.warehouseId === warehouseId) : s.items;
  if (items.length === 0) return 0;
  const lowStock = items.filter(i => (i.stock || 0) < 20).length;
  return Math.round(((items.length - lowStock) / items.length) * 100);
}

export async function createWarehouse(data) {
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

export async function updateWarehouse(id, data) {
  const s = getStore();
  const u = getCurrentUser();
  if (u.role !== 'super_admin' && (u.role !== 'admin' || u.warehouseId !== id)) return null;

  const res = await apiFetch(`/warehouses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });

  if (res.error) {
    return { error: res.error };
  }

  const warehouse = res.data;
  const idx = s.warehouses.findIndex(w => w.id === id);
  if (idx !== -1) {
    s.warehouses[idx] = { ...s.warehouses[idx], ...warehouse };
  }
  saveStore();
  
  await apiFetch('/audit-logs/', {
    method: 'POST',
    body: JSON.stringify({
      action: 'warehouse_update',
      description: `Warehouse updated: ${warehouse.name}`,
      warehouseId: id
    })
  });

  await syncWithBackend();
  return warehouse;
}

export async function deleteWarehouse(id) {
  const s = getStore();
  const u = getCurrentUser();
  if (u.role !== 'super_admin') return { error: 'Unauthorized' };

  const res = await apiFetch(`/warehouses/${id}`, {
    method: 'DELETE'
  });

  if (res.error) {
    return { error: res.error };
  }

  s.warehouses = s.warehouses.filter(w => w.id !== id);
  s.users = s.users.filter(usr => usr.warehouseId !== id);
  s.items = s.items.filter(item => item.warehouseId !== id);
  s.bills = s.bills.filter(bill => bill.warehouseId !== id);
  
  const affectedTables = s.tables.filter(t => t.warehouseId === id).map(t => t.id);
  affectedTables.forEach(tId => { delete s.tableData[tId]; });
  s.tables = s.tables.filter(t => t.warehouseId !== id);

  saveStore();
  await syncWithBackend();
  return { success: true };
}

// ---- USERS / WORKFORCE ----
export function getAllUsers() {
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

export async function createUser(data) {
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

export async function updateUser(id, data) {
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

export async function deleteUser(id) {
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
export function getItems(warehouseId) {
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

export async function createItem(data) {
  const res = await apiFetch('/items/', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

export async function updateItem(id, data) {
  const res = await apiFetch(`/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

export async function deleteItem(id) {
  const res = await apiFetch(`/items/${id}`, {
    method: 'DELETE'
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return true;
}

// ---- TABLES ----
export function getTables(warehouseId) {
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

export async function createTable(data) {
  const res = await apiFetch('/dynamic-tables/', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

export async function updateTable(id, data) {
  const res = await apiFetch(`/dynamic-tables/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

export async function deleteTable(id) {
  const res = await apiFetch(`/dynamic-tables/${id}`, {
    method: 'DELETE'
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return true;
}

export function getTableData(tableId) {
  const s = getStore();
  return s.tableData[tableId] || [];
}

export async function addTableRow(tableId, row) {
  const res = await apiFetch(`/dynamic-tables/${tableId}/rows`, {
    method: 'POST',
    body: JSON.stringify(row)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

export async function updateTableRow(tableId, rowId, data) {
  const res = await apiFetch(`/dynamic-tables/${tableId}/rows/${rowId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

export async function deleteTableRow(tableId, rowId) {
  const res = await apiFetch(`/dynamic-tables/${tableId}/rows/${rowId}`, {
    method: 'DELETE'
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return true;
}

// ---- BILLS ----
export function getBills(warehouseId) {
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

export async function createBill(data) {
  const res = await apiFetch('/billing/', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (res && res.error) return { error: res.error };
  await syncWithBackend();
  return normalize(res.data);
}

// ---- AUDIT LOGS ----
export function addAuditLog(action, description, userId) {
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

export function getAuditLogs() {
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
export function getNotifications() {
  const s = getStore();
  const u = getCurrentUser();
  if (!u) return [];
  if (!s.notifications) s.notifications = [];
  return s.notifications.filter(n => n.userId === u.id).sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp));
}

export async function addNotification(type, title, message, link, targetWarehouseId = null) {
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

export async function clearNotifications() {
  await apiFetch('/realtime/notifications/clear', { method: 'DELETE' });
  await syncWithBackend();
}

export async function markNotificationRead(id) {
  await apiFetch(`/realtime/notifications/${id}/read`, { method: 'PUT' });
  await syncWithBackend();
}

export async function markAllNotificationsRead() {
  await apiFetch('/realtime/notifications/read-all', { method: 'PUT' });
  await syncWithBackend();
}

// ---- TAX CONFIG ----
export function getTaxConfig(warehouseId) {
  const s = getStore();
  if (!s.taxConfig) s.taxConfig = { luxury: 15, normal: 5 };
  
  // Support for regional compliance: Check for warehouse-specific overrides
  if (warehouseId) {
    const wh = s.warehouses.find(w => w.id === warehouseId);
    if (wh && wh.taxConfig && Object.keys(wh.taxConfig).length > 0) return wh.taxConfig;
  }
  
  return s.taxConfig;
}

export function getTaxRates(warehouseId) {
  const cfg = getTaxConfig(warehouseId);
  return { luxury: (cfg.luxury || 0) / 100, normal: (cfg.normal || 0) / 100 };
}

export async function saveTaxConfig(config) {
  const s = getStore();
  s.taxConfig = { ...s.taxConfig, ...config };
  saveStore();
  
  // Persist updated rules to all warehouses with custom tax preferences
  const customWhs = s.warehouses.filter(w => w.taxPreference === 'custom');
  for (const wh of customWhs) {
    wh.taxConfig = { ...config };
    await apiFetch(`/warehouses/${wh.id}`, {
      method: 'PUT',
      body: JSON.stringify({ taxConfig: config })
    });
  }
  
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
export function getSubscription() {
  const s = getStore();
  if (!s.subscription) s.subscription = { plan: 'enterprise', startDate: new Date().toISOString(), status: 'active', warehouseLimit: -1 };
  return s.subscription;
}

export function getPlanWarehouseLimit() {
  const sub = getSubscription();
  if (sub.plan === 'starter') return 1;
  return -1; // unlimited
}

// ---- SEED DATA ----
export function seedDemoData() {
  // Safe zero-data startup starter: No demo seeding
}

// ---- WEB-SOCKET CONNECTION CLIENT ----
let ws = null;
export function connectWebSocket() {
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
