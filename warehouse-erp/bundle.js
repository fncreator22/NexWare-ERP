// WareOps ERP — Bundled v2.0  Generated: 2026-06-04T22:07:40.412Z


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
    roles: [],            // Custom role definitions
    taxConfig,
    subscription,
    theme: 'enterprise',
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
    // Migration: Ensure roles array exists
    if (!_store.roles) _store.roles = [];
  } catch {
    _store = getDefaultData();
  }
  return _store;
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_store));
  if (typeof window !== 'undefined') {
    window.wareops_currency = getActiveCurrency();
  }
}

function resetStore() {
  _store = getDefaultData();
  saveStore();
}

// ---- API AND SYNCHRONIZATION ----
const API_BASE_URL = 'http://localhost:8000/api/v1';

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
    headers
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
      return { error: data.message || 'An error occurred.' };
    }
    return data;
  } catch (err) {
    console.error(`API Fetch Error [${path}]:`, err);
    return { error: 'Network error. Please check if the server is running.' };
  }
}

async function syncWithBackend() {
  const token = localStorage.getItem('access_token');
  if (!token) return;
  
  try {
    // Helper to normalize _id to id recursively / mapped
    const normalize = (items) => {
      if (!Array.isArray(items)) return [];
      return items.map(item => {
        if (item) {
          if (item._id && !item.id) item.id = item._id;
          if (item.page_order && !item.pageOrder) item.pageOrder = item.page_order;
          if (item.module_visibility && !item.moduleVisibility) item.moduleVisibility = item.module_visibility;
          if (item.feature_access && !item.featureAccess) item.featureAccess = item.feature_access;
        }
        return item;
      });
    };

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

    // 5. Fetch Audit Logs (dashboard preview only)
    const auditRes = await apiFetch('/audit-logs/?limit=10');
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

    // 7. Fetch Roles
    const rolesRes = await apiFetch('/roles/');
    if (rolesRes && rolesRes.success && Array.isArray(rolesRes.data)) {
      _store.roles = normalize(rolesRes.data);
    } else {
      _store.roles = [];
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
  
  const { access_token, user } = res.data;
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
  if (token) {
    await apiFetch('/auth/logout', { method: 'POST' });
  }
  localStorage.removeItem('access_token');
  const s = getStore();
  s.currentUserId = null;
  saveStore();
  if (ws) {
    try {
      ws.close();
    } catch (e) {
      console.error('[WebSocket] Error closing socket:', e);
    }
    ws = null;
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
    const allowedIds = new Set();
    if (u.warehouseId) allowedIds.add(u.warehouseId);
    if (Array.isArray(u.warehouseOverrides)) {
      u.warehouseOverrides.forEach(id => allowedIds.add(id));
    }
    whs = s.warehouses.filter(w => allowedIds.has(w.id));
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

async function updateWarehouse(id, data) {
  const s = getStore();
  const u = getCurrentUser();
  if (u.role !== 'super_admin' && (u.role !== 'admin' || u.warehouseId !== id)) return null;

  const res = await apiFetch(`/warehouses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });

  if (res.error) {
    console.error('Failed to update warehouse in database:', res.error);
  }

  const idx = s.warehouses.findIndex(w => w.id === id);
  if (idx === -1) return null;
  s.warehouses[idx] = { ...s.warehouses[idx], ...data, ...(res.data || {}), updatedAt: new Date().toISOString() };
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
  const allowedWhIds = getWarehouses().map(w => w.id);
  return s.items.filter(i => allowedWhIds.includes(i.warehouseId));
}

async function createItem(data) {
  const u = getCurrentUser();
  if (!u || u.role === 'employee') return { error: 'Unauthorized' };
  if (u.role !== 'super_admin' && data.warehouseId !== u.warehouseId) return { error: 'Unauthorized' };

  // SKU Uniqueness check to prevent tracking errors
  const s = getStore();
  if (data.sku && s.items.find(i => i.sku === data.sku)) {
    return { error: 'SKU already exists in the system' };
  }

  const res = await apiFetch('/items/', {
    method: 'POST',
    body: JSON.stringify(data)
  });

  if (res.error) {
    return { error: res.error };
  }

  await syncWithBackend();
  return res.data;
}

async function updateItem(id, data) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || u.role === 'employee') return { error: 'Unauthorized' };

  const idx = s.items.findIndex(i => i.id === id);
  if (idx === -1) return { error: 'Item not found' };
  const target = s.items[idx];

  if (u.role !== 'super_admin' && target.warehouseId !== u.warehouseId) return { error: 'Unauthorized' };
  if (data.warehouseId && u.role !== 'super_admin' && data.warehouseId !== u.warehouseId) return { error: 'Unauthorized' };

  // SKU Uniqueness check for updates
  if (data.sku && s.items.find(i => i.sku === data.sku && i.id !== id)) {
    return { error: 'SKU already exists' };
  }

  const res = await apiFetch(`/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });

  if (res.error) {
    return { error: res.error };
  }

  await syncWithBackend();
  return res.data;
}

async function deleteItem(id) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || u.role === 'employee') return { error: 'Unauthorized' };

  const target = s.items.find(i => i.id === id);
  if (!target) return { error: 'Item not found' };
  if (u.role !== 'super_admin' && target.warehouseId !== u.warehouseId) return { error: 'Unauthorized' };

  const res = await apiFetch(`/items/${id}`, {
    method: 'DELETE'
  });

  if (res.error) {
    return { error: res.error };
  }

  await syncWithBackend();
  return { success: true };
}

// ---- TABLES ----
function getTables(warehouseId) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u) return [];
  let tables = s.tables;
  const allowedWhIds = getWarehouses().map(w => w.id);
  if (u.role === 'super_admin') {
    tables = tables.filter(t => !t.warehouseId || allowedWhIds.includes(t.warehouseId));
  } else {
    const allowedTableIds = new Set(u.tableOverrides || []);
    tables = tables.filter(t => allowedWhIds.includes(t.warehouseId) || allowedTableIds.has(t.id));
  }
  if (warehouseId) tables = tables.filter(t => t.warehouseId === warehouseId);
  return tables;
}

function createTable(data) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || !['super_admin','admin'].includes(u.role)) return null;
  if (u.role === 'admin' && data.warehouseId !== u.warehouseId) return null;

  const id = 'tbl' + Date.now();
  const table = { id, ...data, createdAt: new Date().toISOString(), createdBy: s.currentUserId, status: 'active' };
  s.tables.push(table);
  s.tableData[id] = [];
  saveStore();
  addAuditLog('table_create', `Table created: ${data.name}`, s.currentUserId);
  addNotification('table_create', 'New Operational Table', `${data.name} has been created`, '/tables', data.warehouseId);
  return table;
}

function updateTable(id, data) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || !['super_admin','admin'].includes(u.role)) return null;

  const idx = s.tables.findIndex(t => t.id === id);
  if (idx === -1) return null;
  const target = s.tables[idx];

  if (u.role === 'admin' && target.warehouseId !== u.warehouseId) return null;
  if (data.warehouseId && u.role === 'admin' && data.warehouseId !== u.warehouseId) return null;

  s.tables[idx] = { ...s.tables[idx], ...data, updatedAt: new Date().toISOString() };
  saveStore();
  return s.tables[idx];
}

function deleteTable(id) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || !['super_admin','admin'].includes(u.role)) return;

  const target = s.tables.find(t => t.id === id);
  if (!target || (u.role === 'admin' && target.warehouseId !== u.warehouseId)) return;

  s.tables = s.tables.filter(t => t.id !== id);
  delete s.tableData[id];
  saveStore();
}

function getTableData(tableId) {
  const s = getStore();
  return s.tableData[tableId] || [];
}

function addTableRow(tableId, row) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || u.role === 'employee') return null;

  const table = s.tables.find(t => t.id === tableId);
  if (!table) return null;
  if (u.role !== 'super_admin' && table.warehouseId && table.warehouseId !== u.warehouseId) return null;

  if (!s.tableData[tableId]) s.tableData[tableId] = [];
  const rowId = 'row' + Date.now();
  s.tableData[tableId].push({ id: rowId, ...row, createdAt: new Date().toISOString() });
  saveStore();
  addNotification('table_update', 'Table Data Update', `New entry added to ${table.name}`, '/tables', table.warehouseId);
  return rowId;
}

function updateTableRow(tableId, rowId, data) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || u.role === 'employee') return;

  const table = s.tables.find(t => t.id === tableId);
  if (!table || (u.role !== 'super_admin' && table.warehouseId && table.warehouseId !== u.warehouseId)) return;

  if (!s.tableData[tableId]) return;
  const idx = s.tableData[tableId].findIndex(r => r.id === rowId);
  if (idx > -1) { s.tableData[tableId][idx] = { ...s.tableData[tableId][idx], ...data }; }
  saveStore();
}

function deleteTableRow(tableId, rowId) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || u.role === 'employee') return;

  const table = s.tables.find(t => t.id === tableId);
  if (!table || (u.role !== 'super_admin' && table.warehouseId && table.warehouseId !== u.warehouseId)) return;

  if (!s.tableData[tableId]) return;
  s.tableData[tableId] = s.tableData[tableId].filter(r => r.id !== rowId);
  saveStore();
}

// ---- BILLS ----
function getBills(warehouseId) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u) return [];
  const allowedWhIds = getWarehouses().map(w => w.id);
  if (u.role === 'super_admin') {
    const bills = s.bills.filter(b => allowedWhIds.includes(b.warehouseId));
    if (warehouseId) return bills.filter(b => b.warehouseId === warehouseId);
    return bills;
  }
  
  const levels = { employee: 1, staff: 2, manager: 3, admin: 4, super_admin: 5 };
  const myLevel = levels[u.role] || 1;
  const visibleUsers = s.users.filter(usr => 
    allowedWhIds.includes(usr.warehouseId) && 
    (levels[usr.role] || 1) <= myLevel
  ).map(usr => usr.id);
  
  if (!visibleUsers.includes(u.id)) visibleUsers.push(u.id);

  let bills = s.bills.filter(b => 
    allowedWhIds.includes(b.warehouseId) && 
    visibleUsers.includes(b.createdBy)
  );
  if (warehouseId) bills = bills.filter(b => b.warehouseId === warehouseId);
  return bills;
}

async function createBill(data) {
  const u = getCurrentUser();
  if (!u || u.role === 'employee') return { error: 'Unauthorized' };
  if (u.role !== 'super_admin' && data.warehouseId !== u.warehouseId) return { error: 'Unauthorized' };

  const res = await apiFetch('/billing/', {
    method: 'POST',
    body: JSON.stringify(data)
  });

  if (res.error) {
    return { error: res.error };
  }

  await syncWithBackend();
  return res.data;
}

// ---- AUDIT LOGS ----
function addAuditLog(action, description, userId) {
  const s = getStore();
  const u = s.users.find(u => u.id === userId);
  const timestamp = new Date().toISOString();
  
  const localLog = {
    id: 'log' + Date.now(), action, description,
    userId, userName: u ? u.name : 'System',
    warehouseId: u ? u.warehouseId : null,
    timestamp
  };
  s.auditLogs.unshift(localLog);
  if (s.auditLogs.length > 5000) s.auditLogs = s.auditLogs.slice(0, 5000);
  saveStore();

  // Async push to backend in background (don't block caller)
  if (localStorage.getItem('access_token')) {
    apiFetch('/audit-logs/', {
      method: 'POST',
      body: JSON.stringify({
        action,
        description,
        warehouseId: u ? u.warehouseId : null
      })
    }).then(res => {
      if (res && res.success && res.data) {
        localLog.id = res.data.id;
        localLog.timestamp = res.data.timestamp;
        saveStore();
      }
    }).catch(err => console.warn('[AuditLog] Failed background sync:', err));
  }
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
    if (wh && wh.taxConfig && Object.keys(wh.taxConfig).length > 0) return wh.taxConfig;
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
  
  // Also update warehouses with custom tax preference to copy the saved configuration in MongoDB
  const customWhs = s.warehouses.filter(w => w.taxPreference === 'custom');
  for (const wh of customWhs) {
    await updateWarehouse(wh.id, { taxConfig: config });
  }
  
  addAuditLog('settings_update', `Tax config updated: Normal ${config.normal}%, Luxury ${config.luxury}%`, s.currentUserId);
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

  const wsUrl = `ws://localhost:8000/api/v1/realtime/ws?token=${token}`;
  console.log('[WebSocket] Connecting to:', wsUrl);
  ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      console.log('[WebSocket] Event received:', payload);

      // Dispatch a cross-module event so any page (e.g. spreadsheet) can react
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wareops_ws_event', { detail: payload }));
      }

      // Auto-synchronize the client dataset when real-time updates are received
      // Use payload.type (new) or payload.event_type (legacy)
      const evType = payload.type || payload.event_type;
      if (evType && !evType.startsWith('table_row_')) {
        // Don't full-sync on every row save — too expensive.
        // Only full-sync on schema-level or non-table events.
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

function sendWebSocketMessage(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

// ---- CURRENCY HELPERS ----
function getCurrency() {
  const s = getStore();
  if (!s.currency) s.currency = 'USD';
  return s.currency;
}

function getActiveCurrency() {
  const s = getStore();
  const activeWhId = s.currentWarehouseId || (getCurrentUser()?.warehouseId);
  if (activeWhId) {
    const wh = s.warehouses.find(w => w.id === activeWhId);
    if (wh && wh.currency) return wh.currency;
  }
  if (!s.currency) s.currency = 'USD';
  return s.currency;
}

function saveCurrency(currency) {
  const s = getStore();
  s.currency = currency;
  saveStore();
  
  // Sync to global window variable for synchronous ui formatters
  if (typeof window !== 'undefined') {
    window.wareops_currency = getActiveCurrency();
  }
  
  addAuditLog('settings_update', `Platform currency updated to: ${currency}`, s.currentUserId);
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

function formatCurrency(val, currencyCode) {
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
    const emptyTd = el('td', 'table-empty', `<div class="table-empty-icon">${getSvgIcon('info', 28)}</div><div class="table-empty-title">${emptyMsg}</div>`, { colspan: columns.length + 1 });
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
      if (onView) { const btn = el('button', 'action-btn view', getSvgIcon('view', 14), { title: 'View' }); btn.onclick = () => onView(row); actionsDiv.appendChild(btn); }
      if (onEdit) { const btn = el('button', 'action-btn edit', getSvgIcon('edit', 14), { title: 'Edit' }); btn.onclick = () => onEdit(row); actionsDiv.appendChild(btn); }
      if (onDelete) { const btn = el('button', 'action-btn delete', getSvgIcon('trash', 14), { title: 'Delete' }); btn.onclick = () => onDelete(row); actionsDiv.appendChild(btn); }
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

// ---- JS GLOBAL TOOLTIP ENGINE ----
function initTooltipEngine() {
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
function getSvgIcon(name, size = 20) {
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
    view:       `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    save:       `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    export:     `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`,
    database:   `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>`,
    customer:   `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    location:   `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    mail:       `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    phone:      `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    // Sidebar panel collapse/expand icons
    panel_left:        `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
    panel_left_open:   `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="14 9 17 12 14 15"/></svg>`,
    panel_left_close:  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="17 9 14 12 17 15"/></svg>`,
    collapse:          `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="6 9 3 12 6 15"/></svg>`,
  };
  return icons[name] || `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
}

function applyTheme(themeName) {
  const root = document.documentElement;
  // Remove all theme classes first
  root.classList.remove('theme-classic', 'theme-light', 'theme-dark');
  if (themeName === 'classic') {
    root.classList.add('theme-classic');
  } else if (themeName === 'light') {
    root.classList.add('theme-light');
  } else if (themeName === 'dark') {
    root.classList.add('theme-dark');
  }
  // Default 'enterprise' = no class (root vars apply)
  // Persist for instant load
  try { localStorage.setItem('wareops_theme', themeName || 'enterprise'); } catch {}
}

/**
 * renderAvatar — renders a user avatar as either an <img> (photo) or styled initials span.
 * When avatar is a data URL or http URL  → renders <img> tag
 * When avatar is a string of 1-3 chars (initials) → renders styled initials span
 * When avatar is empty → returns empty string
 */
function renderAvatar(avatar, sizeStyle = "width:100%;height:100%;object-fit:cover;border-radius:50%") {
  if (!avatar) return '';
  // Check for image URLs (data URI or http/https)
  if (avatar.startsWith('data:image/') || avatar.startsWith('http://') || avatar.startsWith('https://')) {
    return `<img src="${avatar}" style="${sizeStyle}" alt="Avatar" onerror="this.style.display='none'" />`;
  }
  // Treat as initials string — render with background transparent (the container provides gradient)
  return `<span style="font-size:inherit;font-weight:700;color:inherit;line-height:1;">${avatar}</span>`;
}

/**
 * Centralized entity image resolver.
 * Renders an image if it exists, otherwise renders initials or dynamic icons.
 * @param {string} src - The image URI or base64 data string
 * @param {string} type - Entity type ('workforce' | 'profile' | 'warehouse' | 'inventory' | 'reports' | 'tables' | 'roles')
 * @param {string} fallbackText - Initials or name to generate initials, or icon key
 * @param {number} size - Square/diameter size in pixels (default 40)
 * @param {string} extraStyle - Inline styles to merge
 * @returns {string} HTML string
 */
function renderEntityImage(src, type, fallbackText = '', size = 40, extraStyle = '') {
  const isUrl = src && (src.startsWith('data:image/') || src.startsWith('http://') || src.startsWith('https://'));
  const s = size;

  if (type === 'workforce' || type === 'profile') {
    // Circular user avatar
    const initials = fallbackText.length <= 3 && !fallbackText.startsWith('data:') && !fallbackText.startsWith('http')
      ? fallbackText
      : (fallbackText ? fallbackText.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?');
    const bgStyle = isUrl ? 'background:transparent;border:1px solid var(--border-default);' : 'background:var(--gradient-brand);';
    
    return `<div class="entity-avatar-container" style="width:${s}px;height:${s}px;border-radius:50%;${bgStyle}display:inline-flex;align-items:center;justify-content:center;font-size:${Math.round(s * 0.35)}px;font-weight:700;color:white;flex-shrink:0;overflow:hidden;vertical-align:middle;${extraStyle}">
      ${isUrl ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Avatar" onerror="this.parentElement.style.background='var(--gradient-brand)';this.remove();this.parentElement.textContent='${initials}'" />` : initials}
    </div>`;
  } else if (type === 'warehouse') {
    // Square card / logo layout
    const bgStyle = isUrl ? 'background:transparent;' : 'background:var(--bg-elevated);border:1px solid var(--border-default);';
    
    // Dynamic icon matching from renderWarehouseLogo
    const defaultIcon = `<svg width="${Math.round(s*0.7)}" height="${Math.round(s*0.7)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary)"><path d="M2 20h20M5 17V5l4 2v10m4 0V9l4 2v6m4 0v-4l3 1v3"/></svg>`;
    const icons = {
      'icon:industrial': `<svg width="${Math.round(s*0.7)}" height="${Math.round(s*0.7)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary)"><path d="M2 20h20M5 17V5l4 2v10m4 0V9l4 2v6m4 0v-4l3 1v3"/></svg>`,
      'icon:distribution': `<svg width="${Math.round(s*0.7)}" height="${Math.round(s*0.7)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary)"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
      'icon:retail': `<svg width="${Math.round(s*0.7)}" height="${Math.round(s*0.7)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary)"><path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
      'icon:office': `<svg width="${Math.round(s*0.7)}" height="${Math.round(s*0.7)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary)"><rect x="3" y="2" width="18" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="16"/><line x1="15" y1="22" x2="15" y2="16"/><line x1="9" y1="16" x2="15" y2="16"/><path d="M8 6h2v2H8V6zm0 4h2v2H8v-2zm8-4h2v2h-2V6zm0 4h2v2h-2v-2z"/></svg>`,
      'icon:tech': `<svg width="${Math.round(s*0.7)}" height="${Math.round(s*0.7)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary)"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`
    };
    
    let fallbackIcon = defaultIcon;
    if (fallbackText && fallbackText.startsWith('icon:')) {
      fallbackIcon = icons[fallbackText.toLowerCase()] || defaultIcon;
    }

    return `<div class="entity-logo-container" style="width:${s}px;height:${s}px;border-radius:8px;${bgStyle}display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;vertical-align:middle;${extraStyle}">
      ${isUrl ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" alt="Logo" onerror="this.remove();this.parentElement.innerHTML='${fallbackIcon}'" />` : fallbackIcon}
    </div>`;
  } else if (type === 'inventory') {
    // Square item cards / boxes
    const bgStyle = isUrl ? 'background:transparent;' : 'background:var(--bg-elevated);border:1px solid var(--border-default);';
    const boxIcon = `<svg width="${Math.round(s*0.6)}" height="${Math.round(s*0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;

    return `<div class="entity-item-container" style="width:${s}px;height:${s}px;border-radius:6px;${bgStyle}display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;vertical-align:middle;${extraStyle}">
      ${isUrl ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" alt="Item" onerror="this.parentElement.style.background='var(--bg-elevated)';this.remove();this.parentElement.innerHTML='${boxIcon}'" />` : boxIcon}
    </div>`;
  } else {
    // Reports, Tables, Role management - general fallback rendering
    const initials = fallbackText.length <= 3 
      ? fallbackText 
      : fallbackText.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const bgStyle = isUrl ? 'background:transparent;' : 'background:var(--gradient-brand);';

    return `<div class="entity-general-container" style="width:${s}px;height:${s}px;border-radius:6px;${bgStyle}display:inline-flex;align-items:center;justify-content:center;font-size:${Math.round(s * 0.35)}px;font-weight:700;color:white;flex-shrink:0;overflow:hidden;vertical-align:middle;${extraStyle}">
      ${isUrl ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" alt="Entity" onerror="this.parentElement.style.background='var(--gradient-brand)';this.remove();this.parentElement.textContent='${initials}'" />` : initials}
    </div>`;
  }
}

/**
 * renderAvatarContainer — renders a full avatar with container.
 * Handles both image and initials, removing gradient when image is present.
 */
function renderAvatarContainer(avatar, name = '', size = 36, extraStyle = '') {
  return renderEntityImage(avatar, 'workforce', name, size, extraStyle);
}

function renderWarehouseLogo(logo, size = 24) {
  const s = size;
  // Handle image uploads (data URIs or external URLs)
  if (logo && (logo.startsWith('data:image/') || logo.startsWith('http://') || logo.startsWith('https://'))) {
    return `<img src="${logo}" style="width:${s}px;height:${s}px;object-fit:cover;border-radius:6px;display:block;" alt="Warehouse logo" onerror="this.style.display='none'" />`;
  }
  const icons = {
    'icon:industrial': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20M5 17V5l4 2v10m4 0V9l4 2v6m4 0v-4l3 1v3"/></svg>`,
    'icon:distribution': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    'icon:retail': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
    'icon:office': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="18" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="16"/><line x1="15" y1="22" x2="15" y2="16"/><line x1="9" y1="16" x2="15" y2="16"/><path d="M8 6h2v2H8V6zm0 4h2v2H8v-2zm8-4h2v2h-2V6zm0 4h2v2h-2v-2z"/></svg>`,
    'icon:tech': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`
  };
  
  if (logo && icons[logo]) return icons[logo];
  if (logo && logo.startsWith('icon:')) {
    const key = logo.toLowerCase();
    if (icons[key]) return icons[key];
  }
  
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20M5 17V5l4 2v10m4 0V9l4 2v6m4 0v-4l3 1v3"/></svg>`;
}

// ---- INLINE BARCODE GENERATOR (Code128 subset B) ----
// Generates a standalone SVG barcode — no HTTP, no external library, works in print.
function generateBarcodeSVG(text, opts = {}) {
  text = String(text || 'EMPTY');
  const barW   = opts.barWidth  || 1.4;
  const height = opts.height    || 38;
  const quiet  = opts.quiet     || 8;
  const color  = opts.color     || '#000';
  const showLabel = opts.showLabel !== false;
  const labelH = showLabel ? 11 : 0;

  // Code128B patterns (space=32 to ~=126, plus start 104, checksum, stop 106)
  const P = [
    '11011001100','11001101100','11001100110','10010011000','10010001100',
    '10001001100','10011001000','10011000100','10001100100','11001001000',
    '11001000100','11000100100','10110011100','10011011100','10011001110',
    '10111001100','10011101100','10011100110','11001110010','11001011100',
    '11001001110','11011100100','11001110100','11101101110','11101001100',
    '11100101100','11100100110','11101100100','11100110100','11100110010',
    '11011011000','11011000110','11000110110','10100011000','10001011000',
    '10001000110','10110001000','10001101000','10001100010','11010001000',
    '11000101000','11000100010','10110111000','10110001110','10001101110',
    '10111011000','10111000110','10001110110','11101110110','11010001110',
    '11000101110','11011101000','11011100010','11011101110','11101011000',
    '11101000110','11100010110','11101101000','11101100010','11100011010',
    '11101111010','11001000010','11110001010','10100110000','10100001100',
    '10010110000','10010000110','10000101100','10000100110','10110010000',
    '10110000100','10011010000','10011000010','10000110100','10000110010',
    '11000010010','11001010000','11110111010','11000010100','10001111010',
    '10100111100','10010111100','10010011110','10111100100','10011110100',
    '10011110010','11110100100','11110010100','11110010010','11011011110',
    '11011110110','11110110110','10101111000','10100011110','10001011110',
    '10111101000','10111100010','11110101000','11110100010','10111011110',
    '10111101110','11101011110','11110101110','11010000100','11010010000',
    '11010011100','1100011101011'
  ];

  const START_B = 104;
  const STOP    = 106;

  function encode(str) {
    let cs = START_B;
    const bars = [P[START_B]];
    Array.from(str).forEach((ch, i) => {
      const code = ch.charCodeAt(0) - 32;
      if (code < 0 || code > 95) return;
      cs += code * (i + 1);
      bars.push(P[code]);
    });
    bars.push(P[cs % 103]);
    bars.push(P[STOP]);
    return bars.join('');
  }

  const pattern = encode(text);
  const svgW = quiet * 2 + pattern.length * barW;
  const svgH = height + labelH + 4;

  let rects = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') {
      rects += `<rect x="${(quiet + i * barW).toFixed(1)}" y="0" width="${barW}" height="${height}" fill="${color}"/>`;
    }
  }

  const labelSVG = showLabel
    ? `<text x="${(svgW / 2).toFixed(1)}" y="${height + labelH - 1}" text-anchor="middle" font-family="monospace" font-size="8.5" fill="${color}">${text}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(svgW)}" height="${svgH}" viewBox="0 0 ${Math.ceil(svgW)} ${svgH}" role="img" aria-label="Barcode: ${text}">${rects}${labelSVG}</svg>`;
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
  if (!win) {
    return { error: 'Popup blocked. Please allow popups in your browser settings to export as PDF.' };
  }
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

// ===== modules/permissions.js =====
// ── MODULE & ACTION DEFINITIONS ──────────────────────────────────────────────

const ALL_MODULES = [
  { key: 'dashboard',   label: 'Dashboard',    icon: 'dashboard'  },
  { key: 'inventory',   label: 'Inventory',    icon: 'items'      },
  { key: 'warehouses',  label: 'Warehouses',   icon: 'warehouses' },
  { key: 'workforce',   label: 'Workforce',    icon: 'workforce'  },
  { key: 'billing',     label: 'Billing',      icon: 'billing'    },
  { key: 'crm',         label: 'CRM',          icon: 'customer'   },
  { key: 'tables',      label: 'Tables',       icon: 'tables'     },
  { key: 'reports',     label: 'Reports',      icon: 'analytics'  },
  { key: 'audit',       label: 'Audit Logs',   icon: 'audit'      },
  { key: 'settings',    label: 'Settings',     icon: 'settings'   },
  { key: 'registration', label: 'Registration modules', icon: 'audit' },
];

const ALL_ACTIONS = ['view','create','edit','delete','export','import','manage'];

// ── BUILT-IN DEFAULT PERMISSIONS PER ROLE ────────────────────────────────────

const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: {
    dashboard:  { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    inventory:  { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    warehouses: { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    workforce:  { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    billing:    { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    crm:        { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    tables:     { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    reports:    { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    audit:      { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    settings:   { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    registration:{ view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
  },
  admin: {
    dashboard:  { view:true,  create:false, edit:false, delete:false, export:true,  import:false, manage:false },
    inventory:  { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    warehouses: { view:true,  create:false, edit:true,  delete:false, export:true,  import:false, manage:false },
    workforce:  { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:false, manage:true  },
    billing:    { view:true,  create:true,  edit:true,  delete:false, export:true,  import:false, manage:false },
    crm:        { view:true,  create:true,  edit:true,  delete:false, export:true,  import:false, manage:false },
    tables:     { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    reports:    { view:true,  create:false, edit:false, delete:false, export:true,  import:false, manage:false },
    audit:      { view:true,  create:false, edit:false, delete:false, export:true,  import:false, manage:false },
    settings:   { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    registration:{ view:true,  create:true,  edit:true,  delete:false, export:true,  import:false, manage:true  },
  },
  manager: {
    dashboard:  { view:true,  create:false, edit:false, delete:false, export:true,  import:false, manage:false },
    inventory:  { view:true,  create:true,  edit:true,  delete:false, export:true,  import:true,  manage:false },
    warehouses: { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    workforce:  { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    billing:    { view:true,  create:true,  edit:true,  delete:false, export:true,  import:false, manage:false },
    crm:        { view:true,  create:false, edit:true,  delete:false, export:true,  import:false, manage:false },
    tables:     { view:true,  create:true,  edit:true,  delete:false, export:true,  import:true,  manage:false },
    reports:    { view:true,  create:false, edit:false, delete:false, export:true,  import:false, manage:false },
    audit:      { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    settings:   { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    registration:{ view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
  },
  staff: {
    dashboard:  { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    inventory:  { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    warehouses: { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    workforce:  { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    billing:    { view:true,  create:true,  edit:false, delete:false, export:false, import:false, manage:false },
    crm:        { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    tables:     { view:true,  create:false, edit:true,  delete:false, export:false, import:false, manage:false },
    reports:    { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    audit:      { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    settings:   { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    registration:{ view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
  },
  employee: {
    dashboard:  { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    inventory:  { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    warehouses: { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    workforce:  { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    billing:    { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    crm:        { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    tables:     { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    reports:    { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    audit:      { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    settings:   { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    registration:{ view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
  },
};

// ── PERMISSION RESOLUTION ─────────────────────────────────────────────────────

/**
 * Get the fully resolved permissions for a user.
 * Resolution: userOverrides > customRole.permissions > builtinDefaults
 */
function resolvePermissions(user) {
  if (!user) return {};
  const s = getStore();

  // Find base permissions from role
  let base = {};
  const roleKey = user.role || 'employee';
  const builtinBase = DEFAULT_ROLE_PERMISSIONS[roleKey];
  if (builtinBase) {
    // Deep copy
    for (const mod of ALL_MODULES) {
      base[mod.key] = { ...builtinBase[mod.key] };
    }
  } else {
    // Custom role — look up in store.roles
    const customRole = (s.roles || []).find(r => r.id === roleKey || r.key === roleKey);
    if (customRole?.permissions) {
      for (const mod of ALL_MODULES) {
        base[mod.key] = { ...(customRole.permissions[mod.key] || {}) };
      }
    }
  }

  // Apply user-level overrides
  if (user.permissionOverrides) {
    for (const mod of ALL_MODULES) {
      if (user.permissionOverrides[mod.key]) {
        base[mod.key] = {
          ...base[mod.key],
          ...user.permissionOverrides[mod.key]
        };
      }
    }
  }

  return base;
}

/**
 * Check if the current user can perform an action on a module.
 * @param {string} module - e.g. 'inventory'
 * @param {string} action - e.g. 'create'
 * @param {object} [user] - optional user, defaults to getCurrentUser()
 */
function canDo(module, action, user) {
  const u = user || getCurrentUser();
  if (!u) return false;
  // Super admin always has all permissions
  if (u.role === 'super_admin') return true;
  const perms = resolvePermissions(u);
  return !!(perms[module]?.[action]);
}

// ── DYNAMIC NAVIGATION ────────────────────────────────────────────────────────

const MODULE_TO_NAV = {
  dashboard:  { path: '/dashboard',  icon: 'dashboard',  label: 'Dashboard',      section: 'Overview'    },
  inventory:  { path: '/items',      icon: 'items',      label: 'Inventory',      section: 'Operations'  },
  warehouses: { path: '/warehouses', icon: 'warehouses', label: 'Warehouses',     section: 'Operations'  },
  workforce:  { path: '/workforce',  icon: 'workforce',  label: 'Workforce',      section: 'Operations'  },
  billing:    { path: '/billing',    icon: 'billing',    label: 'Billing',        section: 'Finance'     },
  crm:        { path: '/customers',  icon: 'customer',   label: 'CRM Customers',  section: 'Operations'  },
  tables:     { path: '/tables',     icon: 'tables',     label: 'Tables',         section: 'Operations'  },
  reports:    { path: '/analytics',  icon: 'analytics',  label: 'Reports',        section: 'Finance'     },
  audit:      { path: '/audit',      icon: 'audit',      label: 'Audit Logs',     section: 'System'      },
  settings:   { path: '/settings',   icon: 'settings',   label: 'Settings',       section: 'System'      },
};

// Always show for super_admin — extra items not tied to permissions
const SUPER_ADMIN_EXTRAS = [
  { path: '/registry', icon: 'audit', label: 'Registry Ledger', section: 'Operations' },
  { path: '/roles',    icon: 'workforce', label: 'Role Manager', section: 'System' },
];

const SECTION_ORDER = ['Overview', 'Operations', 'Finance', 'Reports', 'System'];

/**
 * Generate a dynamic sidebar nav structure based on user's resolved permissions.
 * @param {object} user
 * @returns {Array<{section, items}>}
 */
function getDynamicNav(user) {
  if (!user) return [];
  const perms = resolvePermissions(user);
  const isSA = user.role === 'super_admin';

  // Find user custom role details for page ordering and visibility overrides
  const s = getStore();
  const role = (s.roles || []).find(r => r.id === user.role || r.key === user.role);
  const pageOrder = role?.pageOrder || role?.page_order;
  const visibility = role?.moduleVisibility || role?.module_visibility;

  // Collect visible nav items
  let navItems = [];
  for (const [moduleKey, navDef] of Object.entries(MODULE_TO_NAV)) {
    const isVisible = visibility ? visibility[moduleKey] !== false : true;
    if (isVisible && (isSA || perms[moduleKey]?.view)) {
      navItems.push({ ...navDef, module: moduleKey });
    }
  }
  if (isSA) {
    SUPER_ADMIN_EXTRAS.forEach(e => {
      const extraKey = e.path.replace('/', '');
      const isVisible = visibility ? visibility[extraKey] !== false : true;
      if (isVisible) navItems.push(e);
    });
  }

  // If a custom pageOrder is set, sort items relative to each other
  if (pageOrder && Array.isArray(pageOrder)) {
    navItems.sort((a, b) => {
      const keyA = a.module || a.path.replace('/', '');
      const keyB = b.module || b.path.replace('/', '');
      const idxA = pageOrder.indexOf(keyA);
      const idxB = pageOrder.indexOf(keyB);
      const valA = idxA === -1 ? 999 : idxA;
      const valB = idxB === -1 ? 999 : idxB;
      return valA - valB;
    });
  }

  // Group by section maintaining order
  const grouped = {};
  navItems.forEach(item => {
    if (!grouped[item.section]) grouped[item.section] = [];
    grouped[item.section].push(item);
  });

  return SECTION_ORDER
    .filter(s => grouped[s]?.length > 0)
    .map(s => ({ section: s, items: grouped[s] }));
}

// ── ROLE CRUD (store helpers) ─────────────────────────────────────────────────

function getRoles() {
  const s = getStore();
  if (!s.roles) s.roles = [];
  return s.roles;
}

async function createRole(data) {
  const payload = {
    name: data.name,
    description: data.description || '',
    color: data.color || '#71717a',
    disabled: !!data.disabled,
    permissions: data.permissions || {},
    pageOrder: data.pageOrder || data.page_order || null,
    moduleVisibility: data.moduleVisibility || data.module_visibility || null,
    featureAccess: data.featureAccess || data.feature_access || null,
  };
  const res = await apiFetch('/roles/', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (res.error) {
    throw new Error(res.error);
  }
  await syncWithBackend();
  return res.data;
}

async function updateRole(id, data) {
  const payload = {
    name: data.name,
    description: data.description,
    color: data.color,
    disabled: data.disabled,
    permissions: data.permissions,
    pageOrder: data.pageOrder || data.page_order,
    moduleVisibility: data.moduleVisibility || data.module_visibility,
    featureAccess: data.featureAccess || data.feature_access,
  };
  // Remove undefined parameters
  Object.keys(payload).forEach(k => {
    if (payload[k] === undefined) delete payload[k];
  });
  const res = await apiFetch(`/roles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  if (res.error) {
    throw new Error(res.error);
  }
  await syncWithBackend();
  return res.data;
}

async function deleteRole(id) {
  const res = await apiFetch(`/roles/${id}`, {
    method: 'DELETE'
  });
  if (res.error) {
    throw new Error(res.error);
  }
  await syncWithBackend();
}

async function cloneRole(id) {
  const s = getStore();
  let src = BUILTIN_ROLES.find(r => r.id === id);
  if (!src) {
    src = (s.roles || []).find(r => r.id === id);
  }
  if (!src) return null;
  
  let basePerms = {};
  if (src.isSystem) {
    basePerms = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS[src.key] || {}));
  } else {
    basePerms = JSON.parse(JSON.stringify(src.permissions || {}));
  }

  return await createRole({
    name: src.name + ' (Copy)',
    description: src.description || '',
    color: src.color || '#71717a',
    permissions: basePerms,
    pageOrder: src.pageOrder || src.page_order || null,
    moduleVisibility: src.moduleVisibility || src.module_visibility || null,
    featureAccess: src.featureAccess || src.feature_access || null
  });
}

// Built-in system role definitions for display
const BUILTIN_ROLES = [
  { id: 'super_admin', key: 'super_admin', name: 'Super Admin', color: '#a78bfa', isSystem: true, description: 'Full platform access. Cannot be edited.' },
  { id: 'admin',       key: 'admin',       name: 'Admin',       color: '#06b6d4', isSystem: true, description: 'Warehouse admin. Manages users and operations.' },
  { id: 'manager',     key: 'manager',     name: 'Manager',     color: '#10b981', isSystem: true, description: 'Operations manager. Billing, inventory, CRM.' },
  { id: 'staff',       key: 'staff',       name: 'Staff',       color: '#f59e0b', isSystem: true, description: 'Front-line staff. Billing and limited inventory.' },
  { id: 'employee',    key: 'employee',    name: 'Employee',    color: '#71717a', isSystem: true, description: 'Read-only dashboard and tables access.' },
];

function getAllRoles() {
  const custom = getRoles();
  return [...BUILTIN_ROLES, ...custom];
}

// ── PERMISSION PRESETS ────────────────────────────────────────────────────────

const PERMISSION_PRESETS = {
  'Full Access': () => {
    const p = {};
    ALL_MODULES.forEach(m => { p[m.key] = {}; ALL_ACTIONS.forEach(a => { p[m.key][a] = true; }); });
    return p;
  },
  'Read Only': () => {
    const p = {};
    ALL_MODULES.forEach(m => { p[m.key] = { view: true }; ALL_ACTIONS.filter(a => a !== 'view').forEach(a => { p[m.key][a] = false; }); });
    return p;
  },
  'Operator': () => {
    // Can view + create + edit but not delete/manage/const p = {};
    ALL_MODULES.forEach(m => { p[m.key] = { view: true, create: true, edit: true, delete: false, export: false, import: false, manage: false }; });
    return p;
  },
  'No Access': () => {
    const p = {};
    ALL_MODULES.forEach(m => { p[m.key] = {}; ALL_ACTIONS.forEach(a => { p[m.key][a] = false; }); });
    return p;
  },
};

// ===== components/shell.js =====
/**
 * App Shell — Sidebar + Topbar + Main layout (v3 — Dynamic Nav)
 */







// Navigation is now dynamically generated from permissions — see js/modules/permissions.js


function renderShell(pageTitle, pageSubtitle, content) {
  const user = getCurrentUser();
  if (!user) { navigate('/login'); return; }

  const whs = getWarehouses();
  const whCount = user.role === 'super_admin' ? whs.length : (user.warehouseId ? 1 : 0);
  const whName = user.role === 'super_admin'
    ? `${whCount} Warehouse${whCount !== 1 ? 's' : ''}`
    : (whs.find(w => w.id === user.warehouseId)?.name || 'No Warehouse');
  const whAccessText = `${whCount} Warehouse${whCount !== 1 ? 's' : ''}`;

  const nav = getDynamicNav(user);
  const currentPath = getCurrentPath();
  const notifications = getNotifications();
  const unreadCount = notifications.filter(n => !n.read).length;

  const isCollapsed = localStorage.getItem('wareops_sidebar_collapsed') === 'true';

  const navHTML = nav.map(section => `
    <div class="sidebar-section">
      <div class="sidebar-section-label">${section.section}</div>
      ${section.items.map(item => `
        <div class="sidebar-item ${currentPath === item.path ? 'active' : ''}" data-path="${item.path}" data-tooltip="${item.label}">
          <span class="sidebar-item-icon">${getSvgIcon(item.icon)}</span>
          <span class="sidebar-item-label">${item.label}</span>
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
    <div class="app-shell ${isCollapsed ? 'collapsed' : ''}">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo" style="cursor:pointer" onclick="location.hash='#/dashboard'">
          <div class="sidebar-logo-icon" style="color:var(--brand-500);display:flex;align-items:center;justify-content:center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
          <div class="sidebar-logo-text-wrapper">
            <div class="sidebar-logo-name">WareOps</div>
            <div class="sidebar-logo-tagline">Enterprise ERP</div>
          </div>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav">${navHTML}</nav>
        ${sidebarWidget}
        <div class="sidebar-footer">
          <div class="sidebar-user" id="user-menu-btn" data-tooltip="${user.name} (${capitalize(user.role)})">
            <div class="sidebar-user-avatar">${renderAvatarContainer(user.avatar, user.name, 36)}</div>
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
          <button class="topbar-collapse-btn" id="topbar-collapse-btn" data-tooltip="${isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}">
            ${getSvgIcon(isCollapsed ? 'panel_left_open' : 'panel_left_close', 20)}
          </button>
          <div class="topbar-breadcrumb">${breadcrumb}</div>
          <div class="topbar-actions">
            <div class="topbar-search-wrapper" id="topbar-search-wrapper" style="position:relative">
              <span class="topbar-search-icon">${getSvgIcon('search', 14)}</span>
              <input type="text" id="global-search" class="topbar-search-input"
                placeholder="Search inventory, invoices..." style="cursor:text" />
              <span class="topbar-search-kb-hint">⌘K</span>
              <div id="global-search-results" style="display:none;position:absolute;top:100%;left:0;right:0;margin-top:8px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:var(--radius-md);box-shadow:var(--shadow-xl);z-index:var(--z-dropdown);max-height:320px;overflow-y:auto;padding:6px;"></div>
            </div>
            <div class="icon-btn notif-btn" id="notif-btn" data-tooltip="Notifications" style="position:relative">
              ${getSvgIcon('bell', 18)}
              ${unreadCount > 0 ? `<span class="badge" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;background:var(--accent-rose);border-radius:50%;font-size:10px;font-weight:700;color:white;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg-base)">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
            </div>
            <div class="icon-btn" data-tooltip="Profile" id="profile-btn" style="overflow:hidden;padding:0;">${renderAvatarContainer(user.avatar, user.name, 34)}</div>
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

  // Collapsible sidebar toggle
  document.getElementById('topbar-collapse-btn')?.addEventListener('click', (e) => {
    const shell = document.querySelector('.app-shell');
    if (shell) {
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        toggleSidebar();
      } else {
        shell.classList.toggle('collapsed');
        const collapsed = shell.classList.contains('collapsed');
        localStorage.setItem('wareops_sidebar_collapsed', collapsed);
        const btn = e.currentTarget;
        btn.innerHTML = getSvgIcon(collapsed ? 'panel_left_open' : 'panel_left_close', 20);
        btn.dataset.tooltip = collapsed ? 'Expand Sidebar' : 'Collapse Sidebar';
      }
    }
  });

  // Mobile sidebar overlay close
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

  // Topbar Direct Search Logic
  const searchInput = document.getElementById('global-search');
  const searchResults = document.getElementById('global-search-results');

  if (searchInput && searchResults) {
    searchInput.addEventListener('focus', () => {
      showSearchResults(searchInput.value);
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
      }
    });

    searchInput.addEventListener('input', (e) => {
      showSearchResults(e.target.value);
    });
    
    // Keyboard listener to focus on search
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  function showSearchResults(val) {
    const query = val.toLowerCase().trim();
    if (!query) {
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
      return;
    }

    const s = getStore();
    const matches = [];

    // Search Warehouses
    if (s.warehouses) {
      s.warehouses.forEach(w => {
        if (w.name.toLowerCase().includes(query) || (w.location && w.location.toLowerCase().includes(query))) {
          matches.push({
            type: 'warehouse',
            title: w.name,
            subtitle: w.location || 'Warehouse Hub',
            path: `#/warehouses`
          });
        }
      });
    }

    // Search Items (Inventory)
    if (s.items) {
      s.items.forEach(i => {
        if (i.name.toLowerCase().includes(query) || (i.sku && i.sku.toLowerCase().includes(query))) {
          matches.push({
            type: 'item',
            title: i.name,
            subtitle: `SKU: ${i.sku || 'N/A'} · Stock: ${i.stock || 0}`,
            path: `#/items`
          });
        }
      });
    }

    // Search Bills (Invoices)
    if (s.bills) {
      s.bills.forEach(b => {
        const num = b.billNumber || '';
        const client = b.customerName || '';
        if (num.toLowerCase().includes(query) || client.toLowerCase().includes(query)) {
          matches.push({
            type: 'bill',
            title: num || 'Invoice',
            subtitle: `Client: ${client} · Total: $${(b.total || 0).toFixed(2)}`,
            path: `#/billing`
          });
        }
      });
    }

    // Search Workforce
    if (s.users) {
      s.users.forEach(u => {
        if (u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)) {
          matches.push({
            type: 'user',
            title: u.name,
            subtitle: `Email: ${u.email} · Role: ${u.role}`,
            path: `#/workforce`
          });
        }
      });
    }

    if (matches.length === 0) {
      searchResults.innerHTML = `<div style="padding:12px;text-align:center;font-size:12px;color:var(--text-muted)">No matches found for "${val}"</div>`;
      searchResults.style.display = 'block';
      return;
    }

    const typeLabels = { item: 'Inventory', bill: 'Invoice', warehouse: 'Warehouse', user: 'Workforce' };
    const typeIcons = { item: 'items', bill: 'billing', warehouse: 'warehouses', user: 'user' };

    searchResults.innerHTML = matches.slice(0, 8).map((m, idx) => `
      <div class="search-result-item" data-path="${m.path}" data-index="${idx}"
        style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--radius-sm);cursor:pointer;transition:all 0.15s;margin-bottom:2px">
        <span style="color:var(--text-muted);display:flex;align-items:center">${getSvgIcon(typeIcons[m.type], 14)}</span>
        <div style="flex:1;min-width:0;text-align:left">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.title}</div>
          <div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.subtitle}</div>
        </div>
        <span class="badge badge-muted" style="font-size:9px;padding:2px 6px;text-transform:uppercase">${typeLabels[m.type]}</span>
      </div>
    `).join('');

    // Attach click/hover events
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--bg-card-hover)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
      item.addEventListener('click', () => {
        const path = item.dataset.path;
        navigate(path);
        searchInput.value = '';
        searchResults.style.display = 'none';
      });
    });

    searchResults.style.display = 'block';
  }

  // Command Palette
  initPalette();

  // Intelligent JS tooltips system initialization
  initGlobalTooltips();
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

  const typeIconNames = { warehouse_create:'warehouses', bill_create:'billing', user_create:'user', login:'lock', settings_update:'settings', default:'bell' };

  dropdown.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between">
      <div style="font-weight:700;font-size:14px;color:var(--text-primary);display:flex;align-items:center;gap:6px">${getSvgIcon('bell', 16)} Notifications</div>
      <div style="display:flex;gap:12px;align-items:center">
        ${unread.length > 0 ? `<button id="mark-all-read" style="font-size:12px;color:var(--text-brand);background:none;border:none;cursor:pointer;font-family:var(--font-sans)">Mark all read</button>` : '<span style="font-size:12px;color:var(--text-muted)">All caught up</span>'}
        ${notifications.length > 0 ? `<button id="clear-all-notif" style="font-size:12px;color:var(--accent-rose);background:none;border:none;cursor:pointer;font-family:var(--font-sans)">Clear all</button>` : ''}
      </div>
    </div>
    <div style="max-height:360px;overflow-y:auto">
      ${notifications.length === 0 ? `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">No notifications yet</div>` :
        notifications.slice(0,10).map(n => `
          <div class="notif-item" data-nid="${n.id}" data-link="${n.link||'/dashboard'}" style="padding:12px 16px;border-bottom:1px solid var(--border-subtle);cursor:pointer;background:${n.read ? 'transparent' : 'rgba(99,102,241,0.06)'};transition:background 0.15s;display:flex;gap:12px;align-items:flex-start">
            <div style="display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0;margin-top:2px">${getSvgIcon(typeIconNames[n.type]||typeIconNames.default, 16)}</div>
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

function showProfileDropdown(anchor) {
  const existing = document.getElementById('profile-dropdown');
  if (existing) { existing.remove(); return; }
  const user = getCurrentUser();
  const sub = getSubscription();
  const planBadge = sub.plan === 'starter' 
    ? '<span class="badge badge-info" style="font-size:10px;padding:2px 6px">Starter</span>' 
    : '<span class="badge badge-brand" style="font-size:10px;padding:2px 6px">Enterprise</span>';

  const dropdown = document.createElement('div');
  dropdown.id = 'profile-dropdown';
  dropdown.className = 'dropdown-menu animate-scaleUp';
  dropdown.style.cssText = 'min-width:220px;';
  
  const isSidebar = anchor.id === 'user-menu-btn';
  
  if (isSidebar) {
    // Append to body FIRST so we can measure its rendered height
    document.body.appendChild(dropdown);
    // Force layout calculation
    dropdown.getBoundingClientRect();
    
    const rect = anchor.getBoundingClientRect();
    const elRect = dropdown.getBoundingClientRect();
    const winH = window.innerHeight;
    const winW = window.innerWidth;
    
    // Position outside sidebar (to the right of the sidebar)
    let left = rect.right + 8;
    // Default: open upward so bottom of popup aligns to bottom of anchor
    let top = rect.bottom - elRect.height;
    
    // Clamp vertically within viewport
    if (top < 8) top = 8;
    if (top + elRect.height > winH - 8) top = winH - elRect.height - 8;
    // Clamp horizontally (if collapsed sidebar is very narrow)
    if (left + elRect.width > winW - 8) left = winW - elRect.width - 8;
    
    dropdown.style.position = 'fixed';
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
    dropdown.style.right = 'auto';
    dropdown.style.zIndex = '9999';
  } else {
    positionFixedElement(anchor, dropdown, {
      offset: 8,
      preferredAlign: 'right',
      preferredVertical: 'bottom'
    });
  }

  dropdown.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border-subtle)">
      <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${user.name}</div>
      <div style="font-size:12px;color:var(--text-muted)">${user.email}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:var(--text-muted)">Plan: ${planBadge}</div>
    </div>
    <div id="dd-settings" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">${getSvgIcon('settings', 14)} Settings</div>
    ${user.role === 'super_admin' ? `<div id="dd-subscription" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">${getSvgIcon('subscription', 14)} Subscription</div>` : ''}
    <div style="height:1px;background:var(--border-subtle);margin:4px 0"></div>
    <div id="dd-logout" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--accent-rose);display:flex;align-items:center;gap:8px">${getSvgIcon('logout', 14)} Sign Out</div>
  `;

  document.body.appendChild(dropdown);

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

// ---- DYNAMIC JS TOOLTIPS ENGINE ----
let tooltipsInitialized = false;

function initGlobalTooltips() {
  if (tooltipsInitialized) return;
  tooltipsInitialized = true;

  document.addEventListener('mouseenter', (e) => {
    const trigger = e.target.closest?.('[data-tooltip]');
    if (!trigger) return;

    // Avoid redundant or duplicate tooltips for sidebar elements when expanded
    if (trigger.classList.contains('sidebar-item') || trigger.classList.contains('sidebar-user')) {
      const isCollapsed = document.querySelector('.app-shell')?.classList.contains('collapsed');
      if (!isCollapsed) return;
    }

    // Do not show tooltip if the dropdown is already active
    if (trigger.id === 'notif-btn' && document.getElementById('notif-dropdown')) return;
    if ((trigger.id === 'profile-btn' || trigger.id === 'user-menu-btn') && document.getElementById('profile-dropdown')) return;

    const text = trigger.getAttribute('data-tooltip');
    if (!text) return;

    // Cache original text and temporarily strip attribute to prevent CSS tooltip double-renders
    trigger.dataset.tooltipVal = text;
    trigger.removeAttribute('data-tooltip');

    const tooltip = document.createElement('div');
    tooltip.className = 'js-tooltip animate-scaleUp';
    tooltip.textContent = text;
    tooltip.style.cssText = `
      position: fixed;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      padding: 6px 12px;
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--text-primary);
      box-shadow: var(--shadow-md);
      pointer-events: none;
      z-index: 10000;
      white-space: nowrap;
      transition: opacity var(--transition-fast);
      opacity: 0;
    `;

    document.body.appendChild(tooltip);

    const rect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const tW = tooltipRect.width;
    const tH = tooltipRect.height;
    const offset = 8;

    // Calculate vertical position (default to above)
    let top = rect.top - tH - offset;

    // Edge check: If top space is restricted, display below trigger
    if (top < 10) {
      top = rect.bottom + offset;
    }

    // Centered horizontal positioning
    let left = rect.left + (rect.width - tW) / 2;

    // Horizontal margins boundary clamping to prevent off-screen clipping
    if (left < 10) {
      left = 10;
    } else if (left + tW > winW - 10) {
      left = winW - tW - 10;
    }

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
    tooltip.style.opacity = '1';

    const cleanTooltip = () => {
      tooltip.style.opacity = '0';
      setTimeout(() => tooltip.remove(), 100);
      trigger.setAttribute('data-tooltip', text);
      trigger.removeEventListener('mouseleave', cleanTooltip);
      trigger.removeEventListener('click', cleanTooltip);
    };

    trigger.addEventListener('mouseleave', cleanTooltip);
    trigger.addEventListener('click', cleanTooltip);
  }, { capture: true });
}

// ===== components/palette.js =====
/**
 * Command Palette — Enterprise Search (Ctrl+K)
 * Features: instant results, text highlight, search history, keyboard navigation
 */




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

function togglePalette() {
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
        <div class="auth-logo" style="cursor:pointer" onclick="window.location.hash='#/'">
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
        <div class="auth-logo" style="cursor:pointer" onclick="window.location.hash='#/'">
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
              <label style="color:var(--text-muted);font-size:13px">I agree to the <a href="#/terms">Terms of Service</a> and <a href="#/privacy">Privacy Policy</a></label>
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
        <div style="display:flex;align-items:center;gap:12px;cursor:pointer" onclick="window.location.hash='#/'">
          <div class="auth-logo-icon" style="width:36px;height:36px;background:var(--gradient-brand);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⚡</div>
          <span style="font-size:18px;font-weight:800;background:var(--gradient-brand);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">WareOps</span>
        </div>
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

// ===== pages/landing.js =====
/**
 * Premium Landing Page — Unified SPA Component
 */


function renderLanding() {
  const appEl = document.getElementById('app');
  if (!appEl) return;

  appEl.innerHTML = `
    <!-- ═══════════ NAV ═══════════════════════════════════════ -->
    <nav id="lp-nav">
      <div class="lp-container lp-nav-inner">
        <a href="#/" class="lp-logo">
          <div class="lp-logo-icon">⚡</div>
          <span>Nex<em>Ware</em></span>
        </a>
        <div class="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#interactive-demo">Live Demo</a>
          <a href="#workflow">How It Works</a>
          <a href="#pricing">Pricing</a>
          <a href="#/login" class="lp-btn lp-btn-ghost" style="padding:7px 16px;font-size:13px;border-radius:8px">Log In</a>
          <a href="#/signup" class="lp-btn lp-btn-primary" style="padding:7px 16px;font-size:13px;border-radius:8px">Get Started →</a>
        </div>
        <button class="lp-mob-btn" id="mobBtn">☰</button>
      </div>
    </nav>
    <div class="lp-mob-menu" id="mobMenu">
      <a href="#features">Features</a>
      <a href="#interactive-demo">Live Demo</a>
      <a href="#workflow">How It Works</a>
      <a href="#pricing">Pricing</a>
      <div class="sep"></div>
      <a href="#/login" style="color:var(--text-primary);font-weight:600">Log In</a>
      <a href="#/signup" class="lp-btn lp-btn-primary" style="margin-top:4px;justify-content:center">Get Started Free →</a>
    </div>

    <!-- ═══════════ HERO ══════════════════════════════════════ -->
    <section class="hero">
      <div class="hero-orb orb1"></div>
      <div class="hero-orb orb2"></div>
      <div class="hero-orb orb3"></div>
      <div class="lp-container">
        <div class="hero-pill">
          <span class="dot"></span>
          Enterprise ERP Platform &nbsp;·&nbsp; v2.0 · Fully Interactive Demo Below
        </div>
        <h1>The Modern ERP for<br>Enterprise Logistics</h1>
        <p class="hero-sub">
          Unify your entire warehouse operation — multi-location inventory, automated billing,
          workforce access control, and compliance audit logs — in one beautiful real-time platform.
        </p>
        <div class="hero-actions">
          <a href="#/signup" class="lp-btn lp-btn-primary lp-btn-lg">🚀 Start Free Trial</a>
          <a href="#interactive-demo" class="lp-btn lp-btn-ghost lp-btn-lg">🖥 Try Live Demo ↓</a>
        </div>
        <div class="hero-stats">
          <div class="hs"><div class="hs-val"><span>∞</span></div><div class="hs-lbl">Warehouses</div></div>
          <div class="hs"><div class="hs-val"><span>100%</span></div><div class="hs-lbl">Real-time sync</div></div>
          <div class="hs"><div class="hs-val"><span>5</span>-tier</div><div class="hs-lbl">RBAC system</div></div>
          <div class="hs"><div class="hs-val">10/10</div><div class="hs-lbl">E2E test pass</div></div>
        </div>
        <!-- Hero browser preview -->
        <div class="browser-wrap">
          <div class="browser-glow"></div>
          <div class="browser-frame">
            <div class="browser-bar">
              <div class="browser-dots"><span></span><span></span><span></span></div>
              <div class="browser-url">app.nexware.io/dashboard</div>
            </div>
            <div class="browser-fade">
              <img src="assets/dashboard-preview.png" class="browser-img" alt="NexWare ERP Dashboard" loading="eager">
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ TRUST BAR ═════════════════════════════════ -->
    <div class="trust-bar reveal">
      <div class="lp-container trust-inner">
        <span class="trust-lbl">Trusted by teams at</span>
        <div class="trust-divider"></div>
        <div class="trust-logos">
          <span class="trust-logo">DallasFlex</span>
          <span class="trust-logo">NorthTex Logistics</span>
          <span class="trust-logo">Apex Manufacturing</span>
          <span class="trust-logo">GlobalParts Co.</span>
          <span class="trust-logo">IronWorks Ltd.</span>
          <span class="trust-logo">SwiftDepot</span>
        </div>
      </div>
    </div>

    <!-- ═══════════ METRICS ═══════════════════════════════════ -->
    <section class="lp-section" style="padding-bottom:40px">
      <div class="lp-container">
        <div class="metrics-grid reveal">
          <div class="m-cell"><div class="m-val brand">10/10</div><div class="m-lbl">E2E Test Coverage</div><div class="m-sub">All workflows verified</div></div>
          <div class="m-cell"><div class="m-val em">&lt;15ms</div><div class="m-lbl">API Response Latency</div><div class="m-sub">p50 read latency</div></div>
          <div class="m-cell"><div class="m-val cy">&lt;500ms</div><div class="m-lbl">Full Onboarding Flow</div><div class="m-sub">Signup → first invoice</div></div>
          <div class="m-cell"><div class="m-val vi">5-tier</div><div class="m-lbl">Role-Based Access</div><div class="m-sub">Super Admin → Employee</div></div>
        </div>
      </div>
    </section>

    <!-- ═══════════ FEATURES ══════════════════════════════════ -->
    <section id="features" class="lp-section">
      <div class="lp-container">
        <div class="text-center reveal">
          <div class="lp-label">⚡ Platform Capabilities</div>
          <h2 class="lp-h2">Everything your operations<br><span>need to scale</span></h2>
          <p class="lp-sub">A complete, modular suite engineered for modern warehouse operations at any scale.</p>
        </div>
        <div class="feat-grid">
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(99,102,241,.15)">🏭</div>
            <h3 class="feat-title">Multi-Warehouse Management</h3>
            <p class="feat-desc">Register unlimited locations. Each warehouse has its own inventory, staff, billing history, and analytics — all linked to a single super admin tenant.</p>
            <span class="feat-tag" style="background:rgba(99,102,241,.15);color:var(--brand-light)">Enterprise</span>
          </div>
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(16,185,129,.15)">👥</div>
            <h3 class="feat-title">5-Tier Workforce RBAC</h3>
            <p class="feat-desc">Super Admin, Admin, Manager, Staff, and Employee tiers. Permissions cascade hierarchically — users only see data at or below their access level.</p>
            <span class="feat-tag" style="background:rgba(16,185,129,.15);color:var(--emerald)">Security</span>
          </div>
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(245,158,11,.15)">🧾</div>
            <h3 class="feat-title">Automated Invoice Billing</h3>
            <p class="feat-desc">Generate professional invoices instantly. Supports configurable luxury and standard tax rates with automatic atomic stock decrement on every sale.</p>
            <span class="feat-tag" style="background:rgba(245,158,11,.15);color:var(--amber)">Finance</span>
          </div>
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(6,182,212,.15)">📦</div>
            <h3 class="feat-title">Real-Time Inventory Tracking</h3>
            <p class="feat-desc">Monitor stock levels across all locations. Get low-stock alerts, manage SKU uniqueness per warehouse, and bulk import via CSV.</p>
            <span class="feat-tag" style="background:rgba(6,182,212,.15);color:var(--cyan)">Operations</span>
          </div>
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(168,85,247,.15)">📋</div>
            <h3 class="feat-title">Dynamic Custom Tables</h3>
            <p class="feat-desc">Build custom data schemas — text, number, dropdown, date. Create maintenance logs, shipment trackers, or any operational table your team needs.</p>
            <span class="feat-tag" style="background:rgba(168,85,247,.15);color:var(--violet)">Customizable</span>
          </div>
          <div class="feat-card reveal">
            <div class="feat-icon" style="background:rgba(244,63,94,.15)">🔒</div>
            <h3 class="feat-title">Compliance Audit Logs</h3>
            <p class="feat-desc">Every critical action is automatically logged with user identity, timestamp, and tenant scoping. Built-in role-aware visibility controls.</p>
            <span class="feat-tag" style="background:rgba(244,63,94,.15);color:var(--rose)">Compliance</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ INTERACTIVE DEMO ═════════════════════════ -->
    <section id="interactive-demo" class="showcase-section" style="background:rgba(0,0,0,.15)">
      <div class="lp-container">
        <div class="showcase-section-header reveal">
          <div class="demo-pill"><span class="dot"></span>Interactive Demo — No sign-in required</div>
          <h2 class="lp-h2">Experience NexWare ERP<br><span>right here, right now</span></h2>
          <p class="lp-sub" style="margin:0 auto">Click any sidebar item or tab below to explore the full ERP interface with realistic demo data. Everything is interactive — nothing is saved.</p>
        </div>

        <!-- Tab switcher above demo -->
        <div class="showcase-tabs reveal">
          <button class="showcase-tab active" data-page="dashboard"><span class="tab-icon">📊</span> Dashboard</button>
          <button class="showcase-tab" data-page="inventory"><span class="tab-icon">📦</span> Inventory</button>
          <button class="showcase-tab" data-page="billing"><span class="tab-icon">🧾</span> Billing</button>
          <button class="showcase-tab" data-page="workforce"><span class="tab-icon">👥</span> Workforce</button>
          <button class="showcase-tab" data-page="tables"><span class="tab-icon">📋</span> Tables</button>
          <button class="showcase-tab" data-page="audit"><span class="tab-icon">🔍</span> Audit Logs</button>
          <button class="showcase-tab" data-page="analytics"><span class="tab-icon">📈</span> Analytics</button>
          <button class="showcase-tab" data-page="settings"><span class="tab-icon">⚙️</span> Settings</button>
        </div>

        <!-- ERP Device Frame -->
        <div class="erp-device reveal">
          <div class="erp-device-glow"></div>
          <div class="erp-frame">

            <!-- Demo Top Bar -->
            <div class="demo-topbar">
              <div class="demo-topbar-dots"><span></span><span></span><span></span></div>
              <div class="demo-topbar-url" id="demo-url">app.nexware.io/dashboard</div>
              <div class="demo-topbar-user">
                <div class="demo-avatar">AM</div>
                <span>Alex Mercer&nbsp;&nbsp;<span style="color:var(--text-muted);font-size:10px">Super Admin</span></span>
                <div style="position:relative;margin-left:6px;cursor:pointer">🔔<span class="notif-badge">3</span></div>
              </div>
            </div>

            <!-- App Shell -->
            <div class="demo-shell">

              <!-- ─── DEMO SIDEBAR ──────────────────────── -->
              <nav class="demo-sidebar">
                <div class="demo-logo">
                  <div class="demo-logo-icon">⚡</div>
                  <div class="demo-logo-name">NexWare</div>
                </div>
                <div class="demo-nav">
                  <div class="demo-section-label">Overview</div>
                  <div class="demo-item active" data-target="dashboard">
                    <span class="demo-item-icon">📊</span><span>Dashboard</span>
                  </div>
                  <div class="demo-section-label">Operations</div>
                  <div class="demo-item" data-target="inventory">
                    <span class="demo-item-icon">📦</span><span>Inventory</span>
                  </div>
                  <div class="demo-item" data-target="workforce">
                    <span class="demo-item-icon">👥</span><span>Workforce</span>
                  </div>
                  <div class="demo-item" data-target="tables">
                    <span class="demo-item-icon">📋</span><span>Tables</span>
                  </div>
                  <div class="demo-section-label">Finance</div>
                  <div class="demo-item" data-target="billing">
                    <span class="demo-item-icon">🧾</span><span>Billing</span>
                  </div>
                  <div class="demo-item" data-target="analytics">
                    <span class="demo-item-icon">📈</span><span>Analytics</span>
                  </div>
                  <div class="demo-section-label">System</div>
                  <div class="demo-item" data-target="audit">
                    <span class="demo-item-icon">🔍</span><span>Audit Logs</span>
                  </div>
                  <div class="demo-item" data-target="settings">
                    <span class="demo-item-icon">⚙️</span><span>Settings</span>
                  </div>
                </div>
                <div class="demo-sidebar-footer">
                  <div class="demo-user-row">
                    <div class="demo-user-av">AM</div>
                    <div>
                      <div class="demo-user-name">Alex Mercer</div>
                      <div class="demo-user-role">Super Admin</div>
                    </div>
                  </div>
                </div>
              </nav>

              <!-- ─── DEMO CONTENT ──────────────────────── -->
              <div class="demo-content">

                <!-- ── PAGE: DASHBOARD ──────────────────── -->
                <div class="demo-page active" id="page-dashboard">
                  <div class="d-page-header">
                    <div>
                      <div class="d-page-title">📊 Dashboard</div>
                      <div class="d-page-sub">Global Overview · 4 Warehouses Active</div>
                    </div>
                    <div style="display:flex;gap:8px">
                      <button class="d-btn d-btn-secondary">Export</button>
                      <button class="d-btn d-btn-primary">Warehouses</button>
                    </div>
                  </div>
                  <!-- KPI row -->
                  <div class="d-stat-grid">
                    <div class="d-stat-card">
                      <div class="d-stat-icon" style="background:rgba(99,102,241,.15)">🏭</div>
                      <div class="d-stat-val" style="color:var(--brand-light)">4</div>
                      <div class="d-stat-lbl">Warehouses</div>
                      <div class="d-stat-trend trend-up">Enterprise plan</div>
                    </div>
                    <div class="d-stat-card">
                      <div class="d-stat-icon" style="background:rgba(16,185,129,.15)">💰</div>
                      <div class="d-stat-val" style="color:var(--emerald)">$124.7k</div>
                      <div class="d-stat-lbl">Total Revenue</div>
                      <div class="d-stat-trend trend-up">↑ Tax: $8,920</div>
                    </div>
                    <div class="d-stat-card">
                      <div class="d-stat-icon" style="background:rgba(139,92,246,.15)">🧾</div>
                      <div class="d-stat-val" style="color:var(--violet)">38</div>
                      <div class="d-stat-lbl">Invoices</div>
                      <div class="d-stat-trend trend-up">↑ This period</div>
                    </div>
                    <div class="d-stat-card">
                      <div class="d-stat-icon" style="background:rgba(245,158,11,.15)">📦</div>
                      <div class="d-stat-val" style="color:var(--amber)">4,280</div>
                      <div class="d-stat-lbl">Stock Units</div>
                      <div class="d-stat-trend trend-dn">3 low stock</div>
                    </div>
                  </div>
                  <!-- Charts row -->
                  <div class="d-grid2">
                    <div class="d-card">
                      <div class="d-card-hd">
                        <div><div class="d-card-title">📈 Revenue Trend</div><div class="d-card-sub">Last 6 months</div></div>
                        <div style="display:flex;gap:5px">
                          <button class="d-btn d-btn-secondary d-btn-sm">6M</button>
                          <button class="d-btn d-btn-secondary d-btn-sm">1Y</button>
                        </div>
                      </div>
                      <div class="d-chart-wrap"><canvas id="demo-rev-chart"></canvas></div>
                    </div>
                    <div class="d-card">
                      <div class="d-card-hd">
                        <div class="d-card-title">⚡ Live Activity</div>
                        <button class="d-btn d-btn-secondary d-btn-sm">All →</button>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:0">
                        <div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span class="act-dot act-green" style="margin-top:4px"></span>
                          <div><div style="font-size:11px;color:var(--text-secondary)">Inventory item created — Steel Pipes</div><div style="font-size:10px;color:var(--text-muted)">Alex Mercer · 2 min ago</div></div>
                        </div>
                        <div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span class="act-dot act-blue" style="margin-top:4px"></span>
                          <div><div style="font-size:11px;color:var(--text-secondary)">Invoice INV-0038 generated — $955.50</div><div style="font-size:10px;color:var(--text-muted)">Sarah Connor · 8 min ago</div></div>
                        </div>
                        <div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span class="act-dot act-amber" style="margin-top:4px"></span>
                          <div><div style="font-size:11px;color:var(--text-secondary)">Warehouse Dallas Depot updated</div><div style="font-size:10px;color:var(--text-muted)">Alex Mercer · 22 min ago</div></div>
                        </div>
                        <div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span class="act-dot act-green" style="margin-top:4px"></span>
                          <div><div style="font-size:11px;color:var(--text-secondary)">Staff member Kim Park added</div><div style="font-size:10px;color:var(--text-muted)">Sarah Connor · 45 min ago</div></div>
                        </div>
                        <div style="display:flex;gap:8px;padding:7px 0">
                          <span class="act-dot act-cyan" style="margin-top:4px"></span>
                          <div><div style="font-size:11px;color:var(--text-secondary)">User logged in — Marcus Kim</div><div style="font-size:10px;color:var(--text-muted)">System · 1 hr ago</div></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- Warehouse + Stock row -->
                  <div class="d-grid2">
                    <div class="d-card">
                      <div class="d-card-hd">
                        <div class="d-card-title">🏭 Warehouses</div>
                        <button class="d-btn d-btn-primary d-btn-sm">Manage</button>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:8px">
                        <div style="display:flex;align-items:center;gap:10px;padding:7px;background:var(--bg-input);border-radius:8px;cursor:pointer">
                          <span style="font-size:18px">🏭</span>
                          <div style="flex:1"><div style="font-size:12px;font-weight:600">Dallas Logistics Depot</div><div style="font-size:10px;color:var(--text-muted)">5 staff · $42,300 revenue</div></div>
                          <span class="d-badge success">●</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;padding:7px;background:var(--bg-input);border-radius:8px;cursor:pointer">
                          <span style="font-size:18px">🏬</span>
                          <div style="flex:1"><div style="font-size:12px;font-weight:600">Houston HQ Distribution</div><div style="font-size:10px;color:var(--text-muted)">8 staff · $58,900 revenue</div></div>
                          <span class="d-badge success">●</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;padding:7px;background:var(--bg-input);border-radius:8px;cursor:pointer">
                          <span style="font-size:18px">🏗️</span>
                          <div style="flex:1"><div style="font-size:12px;font-weight:600">Austin Depot North</div><div style="font-size:10px;color:var(--text-muted)">3 staff · $23,550 revenue</div></div>
                          <span class="d-badge success">●</span>
                        </div>
                      </div>
                    </div>
                    <div class="d-card">
                      <div class="d-card-hd">
                        <div class="d-card-title">⚠️ Low Stock Alerts</div>
                        <button class="d-btn d-btn-secondary d-btn-sm">View →</button>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:0">
                        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span style="font-size:12px;color:var(--text-secondary)">Industrial Tape Roll</span>
                          <span style="font-size:11px;font-weight:700;color:var(--rose)">4 left</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span style="font-size:12px;color:var(--text-secondary)">Safety Helmets M</span>
                          <span style="font-size:11px;font-weight:700;color:var(--rose)">7 left</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border-subtle)">
                          <span style="font-size:12px;color:var(--text-secondary)">Forklift Chains</span>
                          <span style="font-size:11px;font-weight:700;color:var(--amber)">14 left</span>
                        </div>
                      </div>
                      <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
                        <button class="d-btn d-btn-secondary d-btn-sm" style="justify-content:flex-start;gap:5px">📦 Add Item</button>
                        <button class="d-btn d-btn-secondary d-btn-sm" style="justify-content:flex-start;gap:5px">🧾 New Bill</button>
                        <button class="d-btn d-btn-secondary d-btn-sm" style="justify-content:flex-start;gap:5px">👥 Workforce</button>
                        <button class="d-btn d-btn-secondary d-btn-sm" style="justify-content:flex-start;gap:5px">📈 Reports</button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ── PAGE: INVENTORY ──────────────────── -->
                <div class="demo-page" id="page-inventory">
                  <div class="d-page-header">
                    <div><div class="d-page-title">📦 Inventory Management</div><div class="d-page-sub">Track items, stock levels, and pricing across all warehouses</div></div>
                    <div style="display:flex;gap:8px">
                      <button class="d-btn d-btn-secondary">Import CSV</button>
                      <button class="d-btn d-btn-primary">+ Add Item</button>
                    </div>
                  </div>
                  <div class="d-stat-grid">
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(99,102,241,.15)">📦</div><div class="d-stat-val" style="color:var(--brand-light)">247</div><div class="d-stat-lbl">Total Items</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(16,185,129,.15)">📊</div><div class="d-stat-val" style="color:var(--emerald)">18,420</div><div class="d-stat-lbl">Total Stock</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(6,182,212,.15)">💎</div><div class="d-stat-val" style="color:var(--cyan)">$94.3k</div><div class="d-stat-lbl">Inventory Value</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(244,63,94,.15)">⚠️</div><div class="d-stat-val" style="color:var(--rose)">8</div><div class="d-stat-lbl">Low Stock</div></div>
                  </div>
                  <div class="d-card">
                    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
                      <div class="d-search" style="max-width:200px"><span>🔍</span><input placeholder="Search items..." value="Steel"></div>
                      <select class="d-input" style="width:auto;padding:6px 10px;font-size:12px"><option>All Categories</option><option>Tools</option><option>Electronics</option><option>Furniture</option></select>
                      <select class="d-input" style="width:auto;padding:6px 10px;font-size:12px"><option>All Warehouses</option><option>Dallas Depot</option><option>Houston HQ</option></select>
                    </div>
                    <div style="overflow-x:auto">
                      <table class="d-table">
                        <thead><tr><th>Item</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th>Tax</th><th>Warehouse</th><th>Actions</th></tr></thead>
                        <tbody>
                          <tr><td><div style="font-weight:600;font-size:12px">Industrial Steel Pipes</div><div style="font-size:10px;color:var(--text-muted)">Added May 28, 2026</div></td><td><code style="font-size:10px;color:var(--text-muted)">SKU-PIPE-001</code></td><td><span class="d-badge brand">Tools</span></td><td><strong>$45.50</strong></td><td><span class="d-badge success">80 pcs</span></td><td><span class="d-badge muted">Normal 5%</span></td><td><span class="d-badge cyan">Dallas</span></td><td style="white-space:nowrap"><button class="d-btn d-btn-secondary d-btn-sm">✏️</button>&nbsp;<button class="d-btn d-btn-secondary d-btn-sm">🗑️</button></td></tr>
                          <tr><td><div style="font-weight:600;font-size:12px">Premium Electronics Kit</div><div style="font-size:10px;color:var(--text-muted)">Added May 26, 2026</div></td><td><code style="font-size:10px;color:var(--text-muted)">SKU-ELEC-002</code></td><td><span class="d-badge violet">Electronics</span></td><td><strong>$299.00</strong></td><td><span class="d-badge success">120 pcs</span></td><td><span class="d-badge violet">Luxury 15%</span></td><td><span class="d-badge cyan">Houston</span></td><td style="white-space:nowrap"><button class="d-btn d-btn-secondary d-btn-sm">✏️</button>&nbsp;<button class="d-btn d-btn-secondary d-btn-sm">🗑️</button></td></tr>
                          <tr><td><div style="font-weight:600;font-size:12px">Safety Helmets M</div><div style="font-size:10px;color:var(--text-muted)">Added May 24, 2026</div></td><td><code style="font-size:10px;color:var(--text-muted)">SKU-SAFE-003</code></td><td><span class="d-badge brand">Tools</span></td><td><strong>$32.00</strong></td><td><span class="d-badge danger">7 pcs</span></td><td><span class="d-badge muted">Normal 5%</span></td><td><span class="d-badge brand">Austin</span></td><td style="white-space:nowrap"><button class="d-btn d-btn-secondary d-btn-sm">✏️</button>&nbsp;<button class="d-btn d-btn-secondary d-btn-sm">🗑️</button></td></tr>
                          <tr><td><div style="font-weight:600;font-size:12px">Office Furniture Set</div><div style="font-size:10px;color:var(--text-muted)">Added May 20, 2026</div></td><td><code style="font-size:10px;color:var(--text-muted)">SKU-FURN-004</code></td><td><span class="d-badge success">Furniture</span></td><td><strong>$189.00</strong></td><td><span class="d-badge warning">35 pcs</span></td><td><span class="d-badge muted">Normal 5%</span></td><td><span class="d-badge cyan">Dallas</span></td><td style="white-space:nowrap"><button class="d-btn d-btn-secondary d-btn-sm">✏️</button>&nbsp;<button class="d-btn d-btn-secondary d-btn-sm">🗑️</button></td></tr>
                          <tr><td><div style="font-weight:600;font-size:12px">Forklift Chains Heavy</div><div style="font-size:10px;color:var(--text-muted)">Added May 18, 2026</div></td><td><code style="font-size:10px;color:var(--text-muted)">SKU-FORK-005</code></td><td><span class="d-badge brand">Tools</span></td><td><strong>$78.00</strong></td><td><span class="d-badge warning">14 pcs</span></td><td><span class="d-badge muted">Normal 5%</span></td><td><span class="d-badge cyan">Houston</span></td><td style="white-space:nowrap"><button class="d-btn d-btn-secondary d-btn-sm">✏️</button>&nbsp;<button class="d-btn d-btn-secondary d-btn-sm">🗑️</button></td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:11px;color:var(--text-muted)">
                      <span>Showing 1–5 of 247 items</span>
                      <div style="display:flex;gap:5px">
                        <button class="d-btn d-btn-secondary d-btn-sm">‹</button>
                        <button class="d-btn d-btn-primary d-btn-sm">1</button>
                        <button class="d-btn d-btn-secondary d-btn-sm">2</button>
                        <button class="d-btn d-btn-secondary d-btn-sm">3</button>
                        <button class="d-btn d-btn-secondary d-btn-sm">›</button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ── PAGE: BILLING ───────────────────── -->
                <div class="demo-page" id="page-billing">
                  <div class="d-page-header">
                    <div><div class="d-page-title">🧾 Billing & Invoices</div><div class="d-page-sub">Generate and manage invoices with automated tax calculation</div></div>
                    <button class="d-btn d-btn-primary">+ New Invoice</button>
                  </div>
                  <div class="d-stat-grid">
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(16,185,129,.15)">💰</div><div class="d-stat-val" style="color:var(--emerald)">$124.7k</div><div class="d-stat-lbl">Total Revenue</div><div class="d-stat-trend trend-up">Gross earnings</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(245,158,11,.15)">🏛️</div><div class="d-stat-val" style="color:var(--amber)">$8,920</div><div class="d-stat-lbl">Total Tax</div><div class="d-stat-trend">Normal + Luxury</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(99,102,241,.15)">💵</div><div class="d-stat-val" style="color:var(--brand-light)">$115.8k</div><div class="d-stat-lbl">Net Revenue</div><div class="d-stat-trend trend-up">After tax</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(6,182,212,.15)">📋</div><div class="d-stat-val" style="color:var(--cyan)">$3,283</div><div class="d-stat-lbl">Avg Invoice</div><div class="d-stat-trend">38 total invoices</div></div>
                  </div>
                  <div class="d-card">
                    <div class="d-card-hd">
                      <div class="d-card-title">Recent Invoices</div>
                      <div class="d-search" style="max-width:180px"><span>🔍</span><input placeholder="Search invoices..."></div>
                    </div>
                    <table class="d-table">
                      <thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Items</th><th>Tax</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        <tr><td><code style="font-size:10px;color:var(--brand-light)">INV-0038</code></td><td style="font-weight:600;font-size:12px">Texas Ironworks Ltd.</td><td style="color:var(--text-muted);font-size:11px">May 28, 2026</td><td>3 items</td><td style="color:var(--amber)">$45.50</td><td><strong style="color:var(--emerald)">$955.50</strong></td><td><span class="d-badge success">Paid</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">👁️</button></td></tr>
                        <tr><td><code style="font-size:10px;color:var(--brand-light)">INV-0037</code></td><td style="font-weight:600;font-size:12px">Global Parts Co.</td><td style="color:var(--text-muted);font-size:11px">May 27, 2026</td><td>7 items</td><td style="color:var(--amber)">$145.00</td><td><strong style="color:var(--emerald)">$2,340.00</strong></td><td><span class="d-badge success">Paid</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">👁️</button></td></tr>
                        <tr><td><code style="font-size:10px;color:var(--brand-light)">INV-0036</code></td><td style="font-weight:600;font-size:12px">Apex Manufacturing</td><td style="color:var(--text-muted);font-size:11px">May 25, 2026</td><td>12 items</td><td style="color:var(--amber)">$420.00</td><td><strong style="color:var(--emerald)">$7,820.00</strong></td><td><span class="d-badge success">Paid</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">👁️</button></td></tr>
                        <tr><td><code style="font-size:10px;color:var(--brand-light)">INV-0035</code></td><td style="font-weight:600;font-size:12px">NorthTex Logistics</td><td style="color:var(--text-muted);font-size:11px">May 24, 2026</td><td>5 items</td><td style="color:var(--amber)">$275.00</td><td><strong style="color:var(--emerald)">$5,200.00</strong></td><td><span class="d-badge warning">Pending</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">👁️</button></td></tr>
                        <tr><td><code style="font-size:10px;color:var(--brand-light)">INV-0034</code></td><td style="font-weight:600;font-size:12px">SwiftDepot Inc.</td><td style="color:var(--text-muted);font-size:11px">May 22, 2026</td><td>2 items</td><td style="color:var(--amber)">$62.00</td><td><strong style="color:var(--emerald)">$1,490.00</strong></td><td><span class="d-badge success">Paid</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">👁️</button></td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- ── PAGE: WORKFORCE ─────────────────── -->
                <div class="demo-page" id="page-workforce">
                  <div class="d-page-header">
                    <div><div class="d-page-title">👥 Workforce Management</div><div class="d-page-sub">Manage team members, roles, and warehouse assignments</div></div>
                    <button class="d-btn d-btn-primary">+ Invite Member</button>
                  </div>
                  <div class="d-stat-grid">
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(99,102,241,.15)">👤</div><div class="d-stat-val" style="color:var(--brand-light)">2</div><div class="d-stat-lbl">Admins</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(16,185,129,.15)">🎯</div><div class="d-stat-val" style="color:var(--emerald)">4</div><div class="d-stat-lbl">Managers</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(245,158,11,.15)">⭐</div><div class="d-stat-val" style="color:var(--amber)">8</div><div class="d-stat-lbl">Staff</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(100,116,139,.15)">👷</div><div class="d-stat-val">14</div><div class="d-stat-lbl">Employees</div></div>
                  </div>
                  <div class="d-card">
                    <div style="display:flex;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
                      <div class="d-tabs">
                        <div class="d-tab active" data-demotab="all">All Members</div>
                        <div class="d-tab" data-demotab="managers">Managers</div>
                        <div class="d-tab" data-demotab="staff">Staff</div>
                      </div>
                      <div class="d-search" style="max-width:180px"><span>🔍</span><input placeholder="Search members..."></div>
                    </div>
                    <table class="d-table">
                      <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Warehouse</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="demo-user-av" style="width:28px;height:28px;font-size:10px">SC</div><div style="font-size:12px;font-weight:600">Sarah Connor</div></div></td><td style="font-size:11px;color:var(--text-muted)">sarah@nexware.com</td><td><span class="role-mg">Manager</span></td><td><span class="d-badge cyan">Dallas Depot</span></td><td><span class="d-badge success">Active</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="demo-user-av" style="width:28px;height:28px;font-size:10px">KP</div><div style="font-size:12px;font-weight:600">Kim Park</div></div></td><td style="font-size:11px;color:var(--text-muted)">kim@nexware.com</td><td><span class="role-st">Staff</span></td><td><span class="d-badge cyan">Houston HQ</span></td><td><span class="d-badge success">Active</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="demo-user-av" style="width:28px;height:28px;font-size:10px">AT</div><div style="font-size:12px;font-weight:600">Alex Torres</div></div></td><td style="font-size:11px;color:var(--text-muted)">atorres@nexware.com</td><td><span class="role-ad">Admin</span></td><td><span class="d-badge brand">Austin Depot</span></td><td><span class="d-badge success">Active</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="demo-user-av" style="width:28px;height:28px;font-size:10px">MK</div><div style="font-size:12px;font-weight:600">Marcus Kim</div></div></td><td style="font-size:11px;color:var(--text-muted)">mkim@nexware.com</td><td><span class="role-mg">Manager</span></td><td><span class="d-badge cyan">Houston HQ</span></td><td><span class="d-badge success">Active</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="demo-user-av" style="width:28px;height:28px;font-size:10px">JR</div><div style="font-size:12px;font-weight:600">James Rodriguez</div></div></td><td style="font-size:11px;color:var(--text-muted)">jrod@nexware.com</td><td><span class="role-em">Employee</span></td><td><span class="d-badge cyan">Dallas Depot</span></td><td><span class="d-badge warning">Inactive</span></td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- ── PAGE: TABLES ─────────────────────── -->
                <div class="demo-page" id="page-tables">
                  <div class="d-page-header">
                    <div><div class="d-page-title">📋 Dynamic Tables</div><div class="d-page-sub">Custom operational data schemas with typed columns</div></div>
                    <button class="d-btn d-btn-primary">+ New Table</button>
                  </div>
                  <div class="d-grid3" style="margin-bottom:14px">
                    <div class="d-card" style="cursor:pointer;border-color:var(--border-brand)">
                      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                        <div style="width:36px;height:36px;border-radius:10px;background:rgba(99,102,241,.2);display:flex;align-items:center;justify-content:center;font-size:18px">🔧</div>
                        <div>
                          <div style="font-size:13px;font-weight:700">Maintenance Logs</div>
                          <div style="font-size:10px;color:var(--text-muted)">3 columns · 42 rows</div>
                        </div>
                      </div>
                      <div style="display:flex;gap:5px;flex-wrap:wrap">
                        <span class="d-badge brand">text</span><span class="d-badge brand">text</span><span class="d-badge violet">dropdown</span>
                      </div>
                    </div>
                    <div class="d-card" style="cursor:pointer">
                      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                        <div style="width:36px;height:36px;border-radius:10px;background:rgba(16,185,129,.2);display:flex;align-items:center;justify-content:center;font-size:18px">🚚</div>
                        <div>
                          <div style="font-size:13px;font-weight:700">Shipment Tracker</div>
                          <div style="font-size:10px;color:var(--text-muted)">5 columns · 128 rows</div>
                        </div>
                      </div>
                      <div style="display:flex;gap:5px;flex-wrap:wrap">
                        <span class="d-badge success">text</span><span class="d-badge cyan">date</span><span class="d-badge violet">dropdown</span>
                      </div>
                    </div>
                    <div class="d-card" style="cursor:pointer">
                      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                        <div style="width:36px;height:36px;border-radius:10px;background:rgba(245,158,11,.2);display:flex;align-items:center;justify-content:center;font-size:18px">📦</div>
                        <div>
                          <div style="font-size:13px;font-weight:700">Returns Register</div>
                          <div style="font-size:10px;color:var(--text-muted)">4 columns · 19 rows</div>
                        </div>
                      </div>
                      <div style="display:flex;gap:5px;flex-wrap:wrap">
                        <span class="d-badge brand">text</span><span class="d-badge warning">number</span><span class="d-badge violet">dropdown</span>
                      </div>
                    </div>
                  </div>
                  <div class="d-card">
                    <div class="d-card-hd" style="margin-bottom:12px">
                      <div><div class="d-card-title">🔧 Maintenance Logs</div><div class="d-card-sub">Dallas Logistics Depot · Daily forklift checkups</div></div>
                      <div style="display:flex;gap:6px">
                        <button class="d-btn d-btn-secondary d-btn-sm">Export</button>
                        <button class="d-btn d-btn-primary d-btn-sm">+ Add Row</button>
                      </div>
                    </div>
                    <table class="d-table">
                      <thead><tr><th>Forklift ID</th><th>Inspector</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                      <tbody>
                        <tr><td style="font-family:var(--font-mono);font-size:11px">FL-004</td><td>Sarah Connor</td><td><span class="d-badge success">OK</span></td><td style="font-size:11px;color:var(--text-muted)">May 28, 2026</td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td style="font-family:var(--font-mono);font-size:11px">FL-007</td><td>Kim Park</td><td><span class="d-badge danger">Maintenance Required</span></td><td style="font-size:11px;color:var(--text-muted)">May 27, 2026</td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td style="font-family:var(--font-mono);font-size:11px">FL-002</td><td>James Rodriguez</td><td><span class="d-badge success">OK</span></td><td style="font-size:11px;color:var(--text-muted)">May 27, 2026</td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                        <tr><td style="font-family:var(--font-mono);font-size:11px">FL-009</td><td>Sarah Connor</td><td><span class="d-badge warning">Under Review</span></td><td style="font-size:11px;color:var(--text-muted)">May 26, 2026</td><td><button class="d-btn d-btn-secondary d-btn-sm">✏️</button></td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- ── PAGE: AUDIT LOGS ─────────────────── -->
                <div class="demo-page" id="page-audit">
                  <div class="d-page-header">
                    <div><div class="d-page-title">🔍 Audit Logs</div><div class="d-page-sub">Tamper-evident record of all system events — tenant-scoped</div></div>
                    <button class="d-btn d-btn-secondary">Export CSV</button>
                  </div>
                  <div class="d-card" style="margin-bottom:14px">
                    <div style="display:flex;gap:10px;flex-wrap:wrap">
                      <div class="d-search" style="max-width:200px"><span>🔍</span><input placeholder="Search logs..."></div>
                      <select class="d-input" style="width:auto;padding:6px 10px;font-size:12px"><option>All Actions</option><option>Login</option><option>Create</option><option>Update</option><option>Delete</option></select>
                      <select class="d-input" style="width:auto;padding:6px 10px;font-size:12px"><option>All Warehouses</option><option>Dallas Depot</option><option>Houston HQ</option></select>
                    </div>
                  </div>
                  <div class="d-card">
                    <table class="d-table">
                      <thead><tr><th>Action</th><th>Description</th><th>User</th><th>Warehouse</th><th>Timestamp</th></tr></thead>
                      <tbody>
                        <tr><td><span class="d-badge success">item_create</span></td><td style="font-size:11px;color:var(--text-secondary)">Created inventory item: Industrial Steel Pipes (SKU-PIPE-001)</td><td style="font-size:11px">Alex Mercer</td><td style="font-size:11px;color:var(--text-muted)">Dallas Depot</td><td style="font-size:10px;color:var(--text-muted)">May 28 · 14:32</td></tr>
                        <tr><td><span class="d-badge brand">login</span></td><td style="font-size:11px;color:var(--text-secondary)">User logged in successfully: sarah@nexware.com</td><td style="font-size:11px">Sarah Connor</td><td style="font-size:11px;color:var(--text-muted)">Dallas Depot</td><td style="font-size:10px;color:var(--text-muted)">May 28 · 14:18</td></tr>
                        <tr><td><span class="d-badge cyan">bill_create</span></td><td style="font-size:11px;color:var(--text-secondary)">Invoice INV-0038 created — Total: $955.50 (Tax: $45.50)</td><td style="font-size:11px">Sarah Connor</td><td style="font-size:11px;color:var(--text-muted)">Dallas Depot</td><td style="font-size:10px;color:var(--text-muted)">May 28 · 13:55</td></tr>
                        <tr><td><span class="d-badge warning">warehouse_update</span></td><td style="font-size:11px;color:var(--text-secondary)">Warehouse settings updated: Dallas Logistics Depot</td><td style="font-size:11px">Alex Mercer</td><td style="font-size:11px;color:var(--text-muted)">Dallas Depot</td><td style="font-size:10px;color:var(--text-muted)">May 28 · 11:20</td></tr>
                        <tr><td><span class="d-badge success">workforce_create</span></td><td style="font-size:11px;color:var(--text-secondary)">New workforce member added: Kim Park (Staff)</td><td style="font-size:11px">Alex Mercer</td><td style="font-size:11px;color:var(--text-muted)">Houston HQ</td><td style="font-size:10px;color:var(--text-muted)">May 27 · 16:45</td></tr>
                        <tr><td><span class="d-badge brand">signup</span></td><td style="font-size:11px;color:var(--text-secondary)">New Super Admin registered: alex@nexware.com (Tenant provisioned)</td><td style="font-size:11px">Alex Mercer</td><td style="font-size:11px;color:var(--text-muted)">—</td><td style="font-size:10px;color:var(--text-muted)">May 26 · 09:00</td></tr>
                        <tr><td><span class="d-badge danger">logout</span></td><td style="font-size:11px;color:var(--text-secondary)">User logged out: marcus@nexware.com</td><td style="font-size:11px">Marcus Kim</td><td style="font-size:11px;color:var(--text-muted)">Houston HQ</td><td style="font-size:10px;color:var(--text-muted)">May 25 · 18:10</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- ── PAGE: ANALYTICS ─────────────────── -->
                <div class="demo-page" id="page-analytics">
                  <div class="d-page-header">
                    <div><div class="d-page-title">📈 Analytics & Reports</div><div class="d-page-sub">Global revenue, inventory, and workforce insights</div></div>
                    <button class="d-btn d-btn-secondary">Export PDF</button>
                  </div>
                  <div class="d-stat-grid">
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(16,185,129,.15)">📈</div><div class="d-stat-val" style="color:var(--emerald)">+18%</div><div class="d-stat-lbl">Revenue Growth</div><div class="d-stat-trend trend-up">vs last month</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(99,102,241,.15)">🔄</div><div class="d-stat-val" style="color:var(--brand-light)">94%</div><div class="d-stat-lbl">Stock Health</div><div class="d-stat-trend trend-up">All locations</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(6,182,212,.15)">⚡</div><div class="d-stat-val" style="color:var(--cyan)">38</div><div class="d-stat-lbl">Invoices This Month</div><div class="d-stat-trend trend-up">↑ 12 from last</div></div>
                    <div class="d-stat-card"><div class="d-stat-icon" style="background:rgba(245,158,11,.15)">👥</div><div class="d-stat-val" style="color:var(--amber)">28</div><div class="d-stat-lbl">Active Team Members</div><div class="d-stat-trend">Across 4 warehouses</div></div>
                  </div>
                  <div class="d-grid2">
                    <div class="d-card">
                      <div class="d-card-hd"><div class="d-card-title">📊 Monthly Revenue Breakdown</div></div>
                      <div class="d-chart-wrap" style="height:160px"><canvas id="demo-analytics-chart"></canvas></div>
                    </div>
                    <div class="d-card">
                      <div class="d-card-hd"><div class="d-card-title">🏭 Revenue by Warehouse</div></div>
                      <div class="d-chart-wrap" style="height:160px"><canvas id="demo-wh-pie-chart"></canvas></div>
                    </div>
                  </div>
                  <div class="d-card">
                    <div class="d-card-hd"><div class="d-card-title">📦 Revenue Summary by Warehouse</div></div>
                    <table class="d-table">
                      <thead><tr><th>Warehouse</th><th>Items</th><th>Invoices</th><th>Revenue</th><th>% Share</th><th>Growth</th></tr></thead>
                      <tbody>
                        <tr><td style="font-weight:600">Houston HQ Distribution</td><td>98</td><td>16</td><td style="color:var(--emerald);font-weight:700">$58,900</td><td><span class="d-badge success">47%</span></td><td class="trend-up">+22%</td></tr>
                        <tr><td style="font-weight:600">Dallas Logistics Depot</td><td>74</td><td>12</td><td style="color:var(--emerald);font-weight:700">$42,300</td><td><span class="d-badge brand">34%</span></td><td class="trend-up">+14%</td></tr>
                        <tr><td style="font-weight:600">Austin Depot North</td><td>52</td><td>7</td><td style="color:var(--emerald);font-weight:700">$23,550</td><td><span class="d-badge muted">19%</span></td><td class="trend-up">+8%</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- ── PAGE: SETTINGS ──────────────────── -->
                <div class="demo-page" id="page-settings">
                  <div class="d-page-header">
                    <div><div class="d-page-title">⚙️ System Settings</div><div class="d-page-sub">Manage account, security, tax config, and notification preferences</div></div>
                  </div>
                  <div class="d-tabs" style="margin-bottom:16px">
                    <div class="d-tab active">Profile</div>
                    <div class="d-tab">Tax Config</div>
                    <div class="d-tab">Notifications</div>
                    <div class="d-tab">Security</div>
                  </div>
                  <div class="d-grid2">
                    <div class="d-card">
                      <div class="d-card-title" style="margin-bottom:16px">Account Profile</div>
                      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
                        <div class="demo-user-av" style="width:52px;height:52px;font-size:18px">AM</div>
                        <div>
                          <div style="font-size:15px;font-weight:700">Alex Mercer</div>
                          <div style="font-size:12px;color:var(--text-muted)">alex@nexware.com</div>
                          <span class="role-sa" style="margin-top:5px;display:inline-flex">Super Admin</span>
                        </div>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:10px">
                        <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Full Name</label><input class="d-input" value="Alex Mercer"></div>
                        <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Email Address</label><input class="d-input" value="alex@nexware.com"></div>
                        <button class="d-btn d-btn-primary" style="margin-top:4px">Save Changes</button>
                      </div>
                    </div>
                    <div class="d-card">
                      <div class="d-card-title" style="margin-bottom:16px">Tax Configuration</div>
                      <div style="display:flex;flex-direction:column;gap:12px">
                        <div>
                          <div style="display:flex;justify-content:space-between;margin-bottom:6px"><label style="font-size:12px;color:var(--text-secondary)">Normal Tax Rate</label><strong style="color:var(--emerald)">5%</strong></div>
                          <div class="d-progress"><div class="d-progress-fill" style="width:5%;background:var(--emerald)"></div></div>
                          <input type="range" min="0" max="30" value="5" style="width:100%;margin-top:6px;accent-color:var(--emerald)">
                        </div>
                        <div>
                          <div style="display:flex;justify-content:space-between;margin-bottom:6px"><label style="font-size:12px;color:var(--text-secondary)">Luxury Tax Rate</label><strong style="color:var(--violet)">15%</strong></div>
                          <div class="d-progress"><div class="d-progress-fill" style="width:15%;background:var(--violet)"></div></div>
                          <input type="range" min="0" max="30" value="15" style="width:100%;margin-top:6px;accent-color:var(--violet)">
                        </div>
                        <div style="padding:10px;background:rgba(99,102,241,.07);border-radius:8px;font-size:12px;color:var(--text-secondary)">
                          💡 Tax rates apply to all new invoices. Historical invoices retain their original snapshot.
                        </div>
                        <button class="d-btn d-btn-primary">Update Tax Config</button>
                      </div>
                    </div>
                  </div>
                </div>

              </div><!-- /demo-content -->
            </div><!-- /demo-shell -->
          </div><!-- /erp-frame -->
        </div><!-- /erp-device -->

        <div class="demo-hint">
          <span class="kbd">Click</span> any sidebar item or tab above to switch views
          &nbsp;·&nbsp; <span class="kbd">Scroll</span> inside the demo to see more data
          &nbsp;·&nbsp; All interactions are <strong style="color:var(--emerald)">read-only</strong> — nothing is saved
        </div>
      </div>
    </section>

    <!-- ═══════════ WORKFLOW ══════════════════════════════════ -->
    <section id="workflow" class="lp-section">
      <div class="lp-container">
        <div class="text-center reveal">
          <div class="lp-label">🔄 How It Works</div>
          <h2 class="lp-h2">Up and running in<br><span>under 5 minutes</span></h2>
          <p class="lp-sub">From zero to a fully operational multi-warehouse ERP with one streamlined onboarding flow.</p>
        </div>
        <div class="workflow-grid">
          <div class="wf-step reveal"><div class="wf-num">👤</div><h3 class="wf-title">Create Account</h3><p class="wf-desc">Sign up as a Super Admin. Your private isolated tenant is provisioned instantly with Argon2id-secured credentials.</p></div>
          <div class="wf-step reveal"><div class="wf-num">🏭</div><h3 class="wf-title">Register Warehouses</h3><p class="wf-desc">Add unlimited warehouse locations with contact details, tax preferences, and branding.</p></div>
          <div class="wf-step reveal"><div class="wf-num">👥</div><h3 class="wf-title">Invite Your Team</h3><p class="wf-desc">Send email invitations to managers, staff, and employees. Assign roles and warehouse access instantly.</p></div>
          <div class="wf-step reveal"><div class="wf-num">🚀</div><h3 class="wf-title">Start Operating</h3><p class="wf-desc">Add inventory, create invoices, build custom tables — real-time sync keeps every user updated instantly.</p></div>
        </div>
      </div>
    </section>

    <!-- ═══════════ ALL FEATURES ══════════════════════════════ -->
    <section class="lp-section" style="background:rgba(0,0,0,.15)">
      <div class="lp-container">
        <div class="text-center reveal">
          <div class="lp-label">🛠 Full Feature Set</div>
          <h2 class="lp-h2">Built for serious<br><span>enterprise operations</span></h2>
        </div>
        <div class="af-grid">
          <div class="af-cell reveal"><div class="af-icon">🔐</div><div class="af-title">JWT Auth + Refresh Tokens</div><div class="af-desc">15-min access tokens with 7-day rotating refresh tokens and database-backed session revocation.</div></div>
          <div class="af-cell reveal"><div class="af-icon">📡</div><div class="af-title">Real-Time WebSocket Sync</div><div class="af-desc">Live updates pushed via WebSocket connections backed by MongoDB Change Streams. Every tab stays synchronized.</div></div>
          <div class="af-cell reveal"><div class="af-icon">📥</div><div class="af-title">CSV Bulk Import & Export</div><div class="af-desc">Import thousands of inventory items at once. Export any table, bill list, or audit log to CSV or PDF.</div></div>
          <div class="af-cell reveal"><div class="af-icon">📋</div><div class="af-title">Dynamic Table Builder</div><div class="af-desc">Design custom data schemas with typed columns: text, number, dropdown, date. Build any operational table.</div></div>
          <div class="af-cell reveal"><div class="af-icon">🌐</div><div class="af-title">Multi-Tenant Isolation</div><div class="af-desc">Every tenant's data is triple-isolated at the token, service, and repository layer — architecturally impossible to cross.</div></div>
          <div class="af-cell reveal"><div class="af-icon">📈</div><div class="af-title">Analytics & Revenue Charts</div><div class="af-desc">Interactive Chart.js visualizations: 6-month revenue trend, warehouse distribution, and projected growth.</div></div>
          <div class="af-cell reveal"><div class="af-icon">🔔</div><div class="af-title">Smart Notifications</div><div class="af-desc">Role-aware in-app notifications with granular per-user preference controls for billing, stock, and system events.</div></div>
          <div class="af-cell reveal"><div class="af-icon">⚡</div><div class="af-title">Rate Limiting & Security</div><div class="af-desc">Production-grade sliding-window rate limiter (Redis + in-memory fallback), full CORS policy, Argon2id hashing.</div></div>
          <div class="af-cell reveal"><div class="af-icon">🏥</div><div class="af-title">Health & Monitoring</div><div class="af-desc">Live system health checks for database, cache, and realtime services at /health endpoints for ops teams.</div></div>
        </div>
      </div>
    </section>

    <!-- ═══════════ TESTIMONIALS ══════════════════════════════ -->
    <section class="lp-section">
      <div class="lp-container">
        <div class="text-center reveal">
          <div class="lp-label">💬 What Teams Say</div>
          <h2 class="lp-h2">Built for real<br><span>logistics teams</span></h2>
        </div>
        <div class="t-grid">
          <div class="t-card reveal">
            <div class="t-stars">★★★★★</div>
            <p class="t-quote">"NexWare replaced three separate tools we were using. The audit log alone saves us hours of compliance reporting every month. Real-time sync between warehouses is a game changer."</p>
            <div class="t-author"><div class="t-av">JR</div><div><div class="t-name">James Rodriguez</div><div class="t-role">VP Operations, DallasFlex</div></div></div>
          </div>
          <div class="t-card reveal">
            <div class="t-stars">★★★★★</div>
            <p class="t-quote">"The dynamic table builder is genius. We built a custom forklift maintenance log in 5 minutes. The role-based visibility means managers see exactly what they need — nothing more."</p>
            <div class="t-author"><div class="t-av">SC</div><div><div class="t-name">Sarah Chen</div><div class="t-role">Warehouse Manager, Apex Mfg.</div></div></div>
          </div>
          <div class="t-card reveal">
            <div class="t-stars">★★★★★</div>
            <p class="t-quote">"Tax snapshots on every invoice means our historical reports never change. Our accounting team signed off immediately. The billing system is exactly what we needed."</p>
            <div class="t-author"><div class="t-av">MK</div><div><div class="t-name">Marcus Kim</div><div class="t-role">CFO, GlobalParts Co.</div></div></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ PRICING ════════════════════════════════════ -->
    <section id="pricing" class="lp-section" style="background:rgba(0,0,0,.15)">
      <div class="lp-container">
        <div class="text-center reveal">
          <div class="lp-label">💳 Pricing</div>
          <h2 class="lp-h2">Simple, honest pricing.<br><span>No surprises.</span></h2>
          <p class="lp-sub">Choose the plan that matches your operation scale. Upgrade anytime.</p>
        </div>
        <div class="pricing-grid">
          <div class="p-card reveal">
            <div class="p-plan-lbl">Starter</div>
            <div class="p-price"><span class="amount">$49</span><span class="per">/month</span></div>
            <p class="p-tagline">Perfect for small businesses starting with digital inventory management.</p>
            <ul class="p-feats">
              <li><span class="tick">✓</span> 1 Warehouse Location</li>
              <li><span class="tick">✓</span> Up to 10 Team Members</li>
              <li><span class="tick">✓</span> Full Inventory Management</li>
              <li><span class="tick">✓</span> Invoice Billing with Tax</li>
              <li><span class="tick">✓</span> Basic Audit Logging</li>
              <li><span class="tick">✓</span> CSV Import / Export</li>
              <li><span class="tick">✓</span> Email Support</li>
            </ul>
            <a href="#/signup" class="p-cta p-cta-ghost">Get Started</a>
          </div>
          <div class="p-card popular reveal">
            <div class="p-pop-tag">MOST POPULAR</div>
            <div class="p-plan-lbl">Enterprise</div>
            <div class="p-price"><span class="amount">$199</span><span class="per">/month</span></div>
            <p class="p-tagline">For scaling operations needing multi-location sync, advanced controls, and compliance.</p>
            <ul class="p-feats">
              <li><span class="tick">✓</span> Unlimited Warehouses</li>
              <li><span class="tick">✓</span> Unlimited Team Members</li>
              <li><span class="tick">✓</span> 5-Tier RBAC System</li>
              <li><span class="tick">✓</span> Dynamic Custom Table Builder</li>
              <li><span class="tick">✓</span> Full Compliance Audit Logs</li>
              <li><span class="tick">✓</span> Advanced Analytics & Charts</li>
              <li><span class="tick">✓</span> Real-Time WebSocket Sync</li>
              <li><span class="tick">✓</span> Priority 24/7 Support</li>
            </ul>
            <a href="#/signup" class="p-cta p-cta-brand">Start Enterprise Trial →</a>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ CTA ════════════════════════════════════════ -->
    <section class="lp-section">
      <div class="lp-container">
        <div class="cta-box reveal">
          <h2>Ready to transform your<br><span>warehouse operations?</span></h2>
          <p>Join modern logistics teams already running on NexWare ERP.<br>Setup takes minutes, not months.</p>
          <div class="cta-actions">
            <a href="#/signup" class="lp-btn lp-btn-primary lp-btn-lg">🚀 Create Free Account</a>
            <a href="#interactive-demo" class="lp-btn lp-btn-ghost lp-btn-lg">🖥 Try Demo First</a>
          </div>
          <p class="cta-note">No credit card required · Free trial · Cancel anytime</p>
        </div>
      </div>
    </section>

    <!-- ═══════════ FOOTER ════════════════════════════════════ -->
    <footer>
      <div class="lp-container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a href="#/" class="lp-logo"><div class="lp-logo-icon">🏭</div><span>Nex<em>Ware</em></span></a>
            <p>Enterprise warehouse management platform built for modern logistics. Unify inventory, billing, workforce, and compliance in one powerful system.</p>
            <div style="margin-top:14px"><span class="footer-badge">● System Operational</span></div>
          </div>
          <div class="footer-col">
            <h4>Platform</h4>
            <a href="#features">Features</a>
            <a href="#interactive-demo">Live Demo</a>
            <a href="#workflow">How It Works</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div class="footer-col">
            <h4>Product</h4>
            <a href="#/signup">Get Started</a>
            <a href="#/login">Log In</a>
            <a href="#/dashboard">Dashboard</a>
            <a href="#/items">Inventory</a>
          </div>
          <div class="footer-col">
            <h4>Technology</h4>
            <a href="#">FastAPI Backend</a>
            <a href="#">MongoDB Atlas</a>
            <a href="#">WebSocket Realtime</a>
            <a href="#">Argon2id Security</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© 2026 NexWare ERP. Built for enterprise efficiency. · <a href="#/privacy" style="text-decoration:underline;color:var(--text-secondary)">Privacy Policy</a> · <a href="#/terms" style="text-decoration:underline;color:var(--text-secondary)">Terms & Conditions</a></span>
          <span>FastAPI · MongoDB · Vanilla JS · JWT Auth</span>
        </div>
      </div>
    </footer>
  `;

  // ── NAV TOGGLE ──────────────────────────────────────────
  const mobBtn = document.getElementById('mobBtn');
  const mobMenu = document.getElementById('mobMenu');
  if (mobBtn && mobMenu) {
    mobBtn.addEventListener('click', () => {
      mobMenu.classList.toggle('open');
      mobBtn.textContent = mobMenu.classList.contains('open') ? '✕' : '☰';
    });
    mobMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      mobMenu.classList.remove('open');
      mobBtn.textContent = '☰';
    }));
  }

  // ── SCROLL NAVBAR EFFECT ────────────────────────────────
  const onScroll = () => {
    const navEl = document.getElementById('lp-nav');
    if (navEl) {
      navEl.style.background = window.scrollY > 40 ? 'rgba(10,11,26,.97)' : 'rgba(10,11,26,.85)';
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // ── SMOOTH SCROLL LOCAL ANCHORS ────────────────────────
  appEl.querySelectorAll('a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href');
    if (href.startsWith('#/')) return; // Ignore SPA routes
    
    a.addEventListener('click', e => {
      const targetEl = document.querySelector(href);
      if (targetEl) {
        e.preventDefault();
        window.scrollTo({ top: targetEl.offsetTop - 76, behavior: 'smooth' });
      }
    });
  });

  // ── SCROLL REVEAL ──────────────────────────────────────
  const revObs = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 55);
        revObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
  appEl.querySelectorAll('.reveal').forEach(el => revObs.observe(el));

  // ── INTERACTIVE DEMO PAGE CONTROLLER ────────────────────
  const urlMap = {
    dashboard: 'app.nexware.io/dashboard',
    inventory: 'app.nexware.io/inventory',
    billing: 'app.nexware.io/billing',
    workforce: 'app.nexware.io/workforce',
    tables: 'app.nexware.io/tables',
    audit: 'app.nexware.io/audit',
    analytics: 'app.nexware.io/analytics',
    settings: 'app.nexware.io/settings'
  };

  const demoCharts = {};
  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1d3a', titleColor: '#f1f5f9',
        bodyColor: '#94a3b8', borderColor: '#2a2d4a', borderWidth: 1
      }
    }
  };

  function destroyChart(id) {
    if (demoCharts[id]) { demoCharts[id].destroy(); delete demoCharts[id]; }
  }

  function initDemoCharts(page) {
    if (page === 'dashboard') {
      const rc = document.getElementById('demo-rev-chart');
      if (rc && window.Chart) {
        destroyChart('rev');
        demoCharts['rev'] = new window.Chart(rc, {
          type: 'bar',
          data: {
            labels: ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
            datasets: [{
              label: 'Revenue',
              data: [18200, 24500, 19800, 31200, 28600, 35400],
              backgroundColor: ['rgba(99,102,241,.35)','rgba(99,102,241,.35)','rgba(99,102,241,.35)','rgba(99,102,241,.35)','rgba(99,102,241,.35)','rgba(99,102,241,.85)'],
              borderColor: '#6366f1', borderWidth: 1, borderRadius: 5
            }]
          },
          options: {
            ...CHART_DEFAULTS,
            scales: {
              x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
              y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => '$' + (v/1000).toFixed(0) + 'k' }, border: { display: false } }
            }
          }
        });
      }
    }

    if (page === 'analytics') {
      const ac = document.getElementById('demo-analytics-chart');
      if (ac && window.Chart) {
        destroyChart('analytics');
        demoCharts['analytics'] = new window.Chart(ac, {
          type: 'line',
          data: {
            labels: ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
            datasets: [{
              label: 'Revenue',
              data: [18200, 24500, 19800, 31200, 28600, 35400],
              borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.12)',
              fill: true, tension: 0.4, pointRadius: 4,
              pointBackgroundColor: '#6366f1'
            }]
          },
          options: {
            ...CHART_DEFAULTS,
            scales: {
              x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
              y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => '$' + (v/1000).toFixed(0) + 'k' }, border: { display: false } }
            }
          }
        });
      }
      const pc = document.getElementById('demo-wh-pie-chart');
      if (pc && window.Chart) {
        destroyChart('whpie');
        demoCharts['whpie'] = new window.Chart(pc, {
          type: 'doughnut',
          data: {
            labels: ['Houston HQ', 'Dallas Depot', 'Austin Depot'],
            datasets: [{
              data: [58900, 42300, 23550],
              backgroundColor: ['rgba(99,102,241,.85)', 'rgba(16,185,129,.85)', 'rgba(6,182,212,.85)'],
              borderColor: '#0f1029', borderWidth: 2
            }]
          },
          options: {
            ...CHART_DEFAULTS,
            plugins: {
              ...CHART_DEFAULTS.plugins,
              legend: { display: true, position: 'right', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 12 } }
            },
            cutout: '65%'
          }
        });
      }
    }
  }

  function switchDemoPage(page) {
    appEl.querySelectorAll('.demo-page').forEach(p => p.classList.remove('active'));
    appEl.querySelectorAll('.demo-item').forEach(i => i.classList.remove('active'));
    appEl.querySelectorAll('.showcase-tab').forEach(t => t.classList.remove('active'));

    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');

    const sideItem = appEl.querySelector(`.demo-item[data-target="${page}"]`);
    if (sideItem) sideItem.classList.add('active');

    const sTab = appEl.querySelector(`.showcase-tab[data-page="${page}"]`);
    if (sTab) sTab.classList.add('active');

    const urlEl = document.getElementById('demo-url');
    if (urlEl) urlEl.textContent = urlMap[page] || 'app.nexware.io/' + page;

    requestAnimationFrame(() => initDemoCharts(page));
  }

  appEl.querySelectorAll('.demo-item[data-target]').forEach(item => {
    item.addEventListener('click', () => switchDemoPage(item.dataset.target));
  });

  appEl.querySelectorAll('.showcase-tab[data-page]').forEach(tab => {
    tab.addEventListener('click', () => switchDemoPage(tab.dataset.page));
  });

  appEl.querySelectorAll('.d-tab[data-demotab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const parent = tab.closest('.d-tabs');
      if (parent) {
        parent.querySelectorAll('.d-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      }
    });
  });

  appEl.querySelectorAll('.d-tab:not([data-demotab])').forEach(tab => {
    tab.addEventListener('click', () => {
      const parent = tab.closest('.d-tabs');
      if (parent) {
        parent.querySelectorAll('.d-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      }
    });
  });

  // ── TAX RANGE SLIDERS ──────────────────────────────────
  appEl.querySelectorAll('input[type="range"]').forEach(slider => {
    slider.addEventListener('input', function() {
      const label = this.parentElement.querySelector('strong');
      if (label) label.textContent = this.value + '%';
      const fill = this.parentElement.querySelector('.d-progress-fill');
      if (fill) fill.style.width = this.value + '%';
    });
  });

  // Clean scroll listener on hash change
  const onHashChange = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('hashchange', onHashChange);
  };
  window.addEventListener('hashchange', onHashChange);

  // Trigger default demo dashboard charts
  initDemoCharts('dashboard');
}

// ===== pages/legal.js =====
/**
 * Legal/Compliance Pages — Privacy Policy & Terms of Service
 */

function renderPrivacy() {
  const appEl = document.getElementById('app');
  if (!appEl) return;
  
  appEl.innerHTML = `
    <div class="auth-page animate-fadeIn">
      <div class="auth-bg"></div>
      <div class="auth-bg-grid"></div>
      <div class="auth-card" style="max-width:720px;padding:var(--space-8) var(--space-10)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:16px;flex-wrap:wrap;gap:12px">
          <div class="auth-logo" style="cursor:pointer;margin-bottom:0" onclick="window.location.hash='#/'">
            <div class="auth-logo-icon" style="width:36px;height:36px;font-size:16px">⚡</div>
            <span class="auth-logo-name" style="font-size:20px">WareOps</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/signup'" style="font-size:12px;padding:6px 12px;cursor:pointer">← Back to Signup</button>
        </div>
        
        <h1 class="auth-title" style="font-size:24px;margin-bottom:8px">Privacy Policy</h1>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:24px">Last Updated: May 29, 2026</p>
        
        <div style="color:var(--text-secondary);font-size:14px;line-height:1.6;max-height:480px;overflow-y:auto;padding-right:12px;scrollbar-width:thin">
          <p style="margin-bottom:16px">At <strong>WareOps ERP</strong>, we take your privacy and the security of your operational data extremely seriously. This Privacy Policy describes how we collect, use, and safeguard information when you use our multi-warehouse enterprise resource planning SaaS platform.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">1. Information Collection</h3>
          <p style="margin-bottom:12px">We collect operational and personal information necessary to deliver enterprise services, including:</p>
          <ul style="margin-bottom:16px;padding-left:20px">
            <li style="margin-bottom:6px"><strong>Account Data:</strong> Usernames, business emails, securely hashed credentials, and billing contacts.</li>
            <li style="margin-bottom:6px"><strong>Warehouse Operations Data:</strong> Workforce registries, inventory metrics, table schemas, and regional tax specifications.</li>
            <li style="margin-bottom:6px"><strong>System Activity Logs:</strong> Automated audit records capturing system operations (e.g. logouts, item creations) for security audits.</li>
          </ul>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">2. Processing of Data</h3>
          <p style="margin-bottom:16px">Your data is processed strictly to maintain multi-tenant enterprise isolation, support live synchronization between warehouses, generate audit trails, and calculate historical tax snaps. We do not sell, trade, or monetize your business operations data.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">3. Multi-Tenant Enterprise Security</h3>
          <p style="margin-bottom:16px">We implement strict multi-tenant boundary configurations using isolated database schemas, authorization guards, and JWT-based session security to prevent unauthorized access and data leaks between business entities.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">4. Retention Policy</h3>
          <p style="margin-bottom:16px">We retain operational files, billing records, and audit logs as long as your corporate subscription remains active. Upon subscription closure or workspace deletion, all records are permanently purged from active dynamic databases within 30 days.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">5. Updates and Compliance</h3>
          <p style="margin-bottom:16px">We may update this policy periodically to reflect changes in global compliance and enterprise security parameters. The updated date at the top will indicate when revisions took effect.</p>
        </div>
      </div>
    </div>
  `;
}

function renderTerms() {
  const appEl = document.getElementById('app');
  if (!appEl) return;
  
  appEl.innerHTML = `
    <div class="auth-page animate-fadeIn">
      <div class="auth-bg"></div>
      <div class="auth-bg-grid"></div>
      <div class="auth-card" style="max-width:720px;padding:var(--space-8) var(--space-10)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:16px;flex-wrap:wrap;gap:12px">
          <div class="auth-logo" style="cursor:pointer;margin-bottom:0" onclick="window.location.hash='#/'">
            <div class="auth-logo-icon" style="width:36px;height:36px;font-size:16px">⚡</div>
            <span class="auth-logo-name" style="font-size:20px">WareOps</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/signup'" style="font-size:12px;padding:6px 12px;cursor:pointer">← Back to Signup</button>
        </div>
        
        <h1 class="auth-title" style="font-size:24px;margin-bottom:8px">Terms & Conditions</h1>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:24px">Effective Date: May 29, 2026</p>
        
        <div style="color:var(--text-secondary);font-size:14px;line-height:1.6;max-height:480px;overflow-y:auto;padding-right:12px;scrollbar-width:thin">
          <p style="margin-bottom:16px">Welcome to <strong>WareOps ERP</strong>. By registering an account, establishing a corporate workspace, or utilising our multi-warehouse enterprise resource planning system, you agree to comply with and be bound by the following Terms and Conditions.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">1. SaaS Subscription and License</h3>
          <p style="margin-bottom:16px">We grant you a non-exclusive, non-transferable, revocable license to access and use the WareOps ERP platform in accordance with your subscribed plan (Starter or Enterprise). Standard multi-warehouse configurations, role assignments (RBAC), and table operations are governed by this plan limit.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">2. Account Responsibility & Security</h3>
          <p style="margin-bottom:16px">You are fully responsible for maintaining the confidentiality of your credentials, authorization tokens, and all activities conducted under your workspace registry. You agree to notify us immediately of any unauthorized usage or breaches of tenant boundary security.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">3. Permitted Operational Use</h3>
          <p style="margin-bottom:16px">The platform must be used solely for lawful inventory coordination, billing management, workforce organization, and audit analysis. You must not attempt to bypass security layers, perform denial-of-service activities, or inject malicious payloads into shared enterprise schemas.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">4. Service Availability & SLA</h3>
          <p style="margin-bottom:16px">We aim to maintain 99.9% uptime for active production databases and dynamic synchronization layers. Scheduled system maintenance and security patches will be conducted during off-peak hours with advance notification to warehouse administrators.</p>
          
          <h3 style="color:var(--text-primary);font-size:16px;margin:20px 0 10px 0;font-weight:700">5. Limitation of Liability</h3>
          <p style="margin-bottom:16px">WareOps ERP is provided on an "as is" and "as available" basis. To the maximum extent permitted by applicable law, we shall not be liable for any indirect, incidental, or consequential damages resulting from operational downtime or database synchronization interruptions.</p>
        </div>
      </div>
    </div>
  `;
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
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
  const whs = getWarehouses();
  const users = getAllUsers();
  const items = getItems();
  const bills = getBills();
  const logs = getAuditLogs().slice(0, 6);  const sub = getSubscription();
  const isSA = user.role === 'super_admin';

  // Dynamic capability checks
  const canViewWarehouses = canDo('warehouses', 'view', user);
  const canViewBilling = canDo('billing', 'view', user);
  const canViewWorkforce = canDo('workforce', 'view', user);
  const canViewInventory = canDo('inventory', 'view', user);
  const canViewAudit = canDo('audit', 'view', user);
  const canViewReports = canDo('reports', 'view', user);

  const totalRevenue = bills.reduce((s,b)=>s+(b.total||0),0);
  const totalTax    = bills.reduce((s,b)=>s+(b.tax||0),0);
  const totalStock  = items.reduce((s,i)=>s+(i.stock||0),0);
  const activeUsers = users.filter(u=>u.status==='active').length;

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

  // Count visible panels in second row to compute responsive widths
  const row2Count = 1 + (canViewBilling ? 1 : 0) + (canViewInventory ? 1 : 0);
  const row2Col = row2Count === 3 ? 'col-4' : row2Count === 2 ? 'col-6' : 'col-12';

  renderShell('Dashboard', roleLabel, `
    <div class="animate-slideUp">

      <!-- Welcome Banner -->
      <div style="background:var(--gradient-card);border:1px solid var(--border-brand);border-radius:var(--radius-xl);padding:20px 24px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="width:48px;height:48px;background:var(--gradient-brand);border-radius:14px;display:flex;align-items:center;justify-content:center;color:white;box-shadow:var(--shadow-brand);flex-shrink:0">${getSvgIcon('dashboard', 22)}</div>
        <div style="flex:1;min-width:0">
          <h2 style="font-size:20px;font-weight:800;margin-bottom:2px">Welcome back, ${user.name.split(' ')[0]}!</h2>
          <p style="color:var(--text-muted);font-size:13px">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})} · ${roleLabel}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isSA ? `<button class="btn btn-primary btn-sm" style="display:inline-flex;align-items:center;gap:6px" onclick="location.hash='#/warehouses'">${getSvgIcon('warehouses', 14)} Warehouses</button>` : ''}
          ${canDo('billing', 'create', user) ? `<button class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:6px" onclick="location.hash='#/billing'">${getSvgIcon('billing', 14)} New Bill</button>` : ''}
        </div>
      </div>

      <!-- KPI Cards — compact row -->
      <div class="stat-grid" style="margin-bottom:20px">
        ${canViewWarehouses ? `<div class="stat-card">
          <div class="stat-card-glow" style="background:#6366f1"></div>
          <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">${getSvgIcon('warehouses', 20)}</div>
          <div class="stat-card-value">${whs.length}</div>
          <div class="stat-card-label">Warehouses</div>
          <div class="stat-card-trend trend-up">${sub.plan} plan</div>
        </div>` : ''}
        ${canViewBilling ? `
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#10b981"></div>
          <div class="stat-card-icon" style="background:rgba(16,185,129,0.15)">${getSvgIcon('revenue', 20)}</div>
          <div class="stat-card-value">${formatCurrency(totalRevenue)}</div>
          <div class="stat-card-label">Revenue</div>
          <div class="stat-card-trend trend-up">Tax: ${formatCurrency(totalTax)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-glow" style="background:#8b5cf6"></div>
          <div class="stat-card-icon" style="background:rgba(139,92,246,0.15)">${getSvgIcon('billing', 20)}</div>
          <div class="stat-card-value">${bills.length}</div>
          <div class="stat-card-label">Invoices</div>
          <div class="stat-card-trend trend-up">↑ This period</div>
        </div>
        ` : ''}
        ${canViewWorkforce ? `<div class="stat-card">
          <div class="stat-card-glow" style="background:#06b6d4"></div>
          <div class="stat-card-icon" style="background:rgba(6,182,212,0.15)">${getSvgIcon('workforce', 20)}</div>
          <div class="stat-card-value">${activeUsers}</div>
          <div class="stat-card-label">Active Users</div>
          <div class="stat-card-trend">${users.length} total</div>
        </div>` : ''}
        ${canViewInventory ? `<div class="stat-card">
          <div class="stat-card-glow" style="background:#f59e0b"></div>
          <div class="stat-card-icon" style="background:rgba(245,158,11,0.15)">${getSvgIcon('items', 20)}</div>
          <div class="stat-card-value">${totalStock.toLocaleString()}</div>
          <div class="stat-card-label">Stock Units</div>
          <div class="stat-card-trend ${lowStock.length>0?'trend-down':'trend-up'}">${lowStock.length} low stock</div>
        </div>` : ''}
        ${isSA ? `<div class="stat-card" style="cursor:pointer" onclick="location.hash='#/subscription'">
          <div class="stat-card-glow" style="background:#f43f5e"></div>
          <div class="stat-card-icon" style="background:rgba(244,63,94,0.15)">${getSvgIcon('subscription', 20)}</div>
          <div class="stat-card-value" style="font-size:16px;text-transform:capitalize">${sub.plan}</div>
          <div class="stat-card-label">Plan</div>
          <div class="stat-card-trend trend-up">● Active</div>
        </div>` : ''}
      </div>

      <!-- Main content grid -->
      ${(canViewBilling || canViewReports || canViewAudit) ? `
      <div class="dashboard-grid">

        <!-- Revenue Chart -->
        ${(canViewBilling || canViewReports) ? `
        <div class="chart-card ${canViewAudit ? 'col-8' : 'col-12'}">
          <div class="chart-card-header">
            <div>
              <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('analytics', 18)} Revenue Trend</div>
              <div class="chart-card-subtitle">Last 6 months across all warehouses</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" id="chart-6m" style="font-size:11px;padding:4px 8px">6M</button>
              <button class="btn btn-ghost btn-sm" id="chart-1y" style="font-size:11px;padding:4px 8px">1Y</button>
            </div>
          </div>
          <div class="chart-container" style="height:180px"><canvas id="revenue-chart"></canvas></div>
        </div>
        ` : ''}

        <!-- Activity Feed -->
        ${canViewAudit ? `
        <div class="chart-card ${(canViewBilling || canViewReports) ? 'col-4' : 'col-12'}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('clock', 18)} Activity</div>
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
        ` : ''}
      </div>
      ` : ''}

      <!-- Second row -->
      <div class="dashboard-grid">

        <!-- Warehouse Summary -->
        ${canViewWarehouses ? `
        <div class="chart-card ${row2Col}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('warehouses', 18)} Warehouses</div>
            <button class="btn btn-primary btn-sm" onclick="location.hash='#/warehouses'" style="font-size:11px;padding:4px 10px">Manage</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${whs.slice(0,4).map(wh=>`
              <div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg-input);border-radius:8px;cursor:pointer" onclick="location.hash='#/warehouses/${wh.id}'">
                <div style="display:flex;align-items:center">${wh.logo ? `<span style="font-size:20px">${wh.logo}</span>` : getSvgIcon('warehouses', 20)}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${wh.name}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${wh.staffCount||0} staff · ${formatCurrency(wh.revenue||0)}</div>
                </div>
                <span class="badge badge-success" style="font-size:10px">●</span>
              </div>
            `).join('')}
            ${whs.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No warehouses yet</div>` : ''}
          </div>
        </div>` : `
        <div class="chart-card ${row2Col}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('warehouses', 18)} My Warehouse</div>
          </div>
          ${myWh ? `
          <div style="text-align:center;padding:8px 0">
            <div style="display:flex;justify-content:center;margin-bottom:8px">${myWh.logo ? `<span style="font-size:40px">${myWh.logo}</span>` : getSvgIcon('warehouses', 40)}</div>
            <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${myWh.name}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${myWh.businessName}</div>
            <div style="display:flex;justify-content:center;gap:20px">
              <div><div style="font-weight:700;font-size:18px">${myWh.staffCount||0}</div><div style="font-size:11px;color:var(--text-muted)">Staff</div></div>
              <div><div style="font-weight:700;font-size:18px">${myWh.items||0}</div><div style="font-size:11px;color:var(--text-muted)">Items</div></div>
            </div>
          </div>` : '<div style="color:var(--text-muted);text-align:center;padding:20px">Not assigned</div>'}
        </div>`}

        <!-- Billing Quick Stats -->
        ${canViewBilling ? `
        <div class="chart-card ${row2Col}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('billing', 18)} Billing Stats</div>
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
        ` : ''}

        <!-- Low Stock Alerts -->
        ${canViewInventory ? `
        <div class="chart-card ${row2Col}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px;color:var(--accent-rose)">${getSvgIcon('warning', 18)} Low Stock</div>
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
                { icon:'items', label:'Add Item',   href:'/items', mod: 'inventory' },
                { icon:'billing', label:'New Bill',   href:'/billing', mod: 'billing' },
                { icon:'workforce', label:'Workforce',  href:'/workforce', mod: 'workforce' },
                { icon:'analytics', label:'Reports',    href:'/analytics', mod: 'reports' },
              ].filter(a => canDo(a.mod, 'view', user) || (a.mod === 'billing' && canDo('billing', 'create', user))).map(a=>`
                <button class="btn btn-secondary btn-sm" onclick="location.hash='#${a.href}'" style="font-size:11px;padding:6px 8px;justify-content:flex-start;gap:6px">${getSvgIcon(a.icon, 14)} ${a.label}</button>
              `).join('')}
            </div>
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Third Row -->
      ${(canViewInventory || canViewBilling) ? `
      <div class="dashboard-grid">
        
        <!-- Smart Restock Recommender -->
        ${canViewInventory ? `
        <div class="chart-card ${canViewBilling ? 'col-5' : 'col-12'}">
          <div class="chart-card-header">
            <div>
              <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('bulb', 18)} Restock Recommender</div>
              <div class="chart-card-subtitle">Priority inventory reorder requirements</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${restockSuggestions.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--text-muted)">Stock levels optimal</div>' :
              restockSuggestions.map(s => `
                <div style="background:rgba(255,255,255,0.02);padding:12px;border-radius:10px;border:1px solid var(--border-default);display:flex;align-items:center;gap:12px">
                  <div style="width:36px;height:36px;background:var(--bg-card);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0">${getSvgIcon('items', 18)}</div>
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${s.name}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${s.salesCount} units sold · Priority: ${s.priority > 30 ? 'High' : 'Normal'}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:14px;font-weight:800;color:${s.stock < 10 ? 'var(--accent-rose)' : 'var(--accent-amber)'}">${s.stock}</div>
                    <div style="font-size:10px;color:var(--text-muted)">In Stock</div>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Revenue Summary -->
        ${canViewBilling ? `
        <div class="chart-card ${canViewInventory ? 'col-7' : 'col-12'}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('analytics', 18)} Revenue Summary</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;height:calc(100% - 48px);align-content:center">
            <div style="padding:18px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:12px;text-align:center;display:flex;flex-direction:column;justify-content:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Gross Revenue</div>
              <div style="font-size:20px;font-weight:800;color:var(--accent-emerald)">${formatCurrency(totalRevenue).split('.')[0]}</div>
            </div>
            <div style="padding:18px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:12px;text-align:center;display:flex;flex-direction:column;justify-content:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Total Tax</div>
              <div style="font-size:20px;font-weight:800;color:var(--accent-amber)">${formatCurrency(totalTax).split('.')[0]}</div>
            </div>
            <div style="padding:18px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:12px;text-align:center;display:flex;flex-direction:column;justify-content:center">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Net Earnings</div>
              <div style="font-size:20px;font-weight:800;color:var(--text-brand)">${formatCurrency(totalRevenue-totalTax).split('.')[0]}</div>
            </div>
          </div>
        </div>
        ` : ''}
      </div>
      ` : ''}

      <!-- Fourth Row: Workforce & Distribution -->
      ${canViewWorkforce || (canViewReports && canViewWarehouses) ? `
      <div class="dashboard-grid">
        ${canViewWorkforce ? `
        <div class="chart-card ${(canViewReports && canViewWarehouses) ? 'col-6' : 'col-12'}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('workforce', 18)} Workforce Summary</div>
            <button class="btn btn-primary btn-sm" onclick="location.hash='#/workforce'" style="font-size:11px;padding:4px 10px">Manage</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
            ${['admin','manager','staff','employee'].map(r=>{
              const count = users.filter(u=>u.role===r).length;
              const badges={
                admin: `<span class="badge role-admin" style="font-size:9px;padding:2px 4px;margin-top:4px;display:inline-block">Admin</span>`,
                manager: `<span class="badge role-manager" style="font-size:9px;padding:2px 4px;margin-top:4px;display:inline-block">Manager</span>`,
                staff: `<span class="badge role-staff" style="font-size:9px;padding:2px 4px;margin-top:4px;display:inline-block">Staff</span>`,
                employee: `<span class="badge role-employee" style="font-size:9px;padding:2px 4px;margin-top:4px;display:inline-block">Employee</span>`
              };
              return `<div style="text-align:center;padding:10px 4px;background:var(--bg-input);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center">
                <div style="font-size:18px;font-weight:800;color:var(--text-primary);line-height:1">${count}</div>
                ${badges[r]}
              </div>`;
            }).join('')}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${users.slice(0,4).map(u=>`
              <div style="display:flex;align-items:center;gap:8px">
                <div style="flex-shrink:0">${renderAvatarContainer(u.avatar, u.name, 28)}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
                </div>
                <span style="font-size:10px;color:var(--text-muted)">${u.role.charAt(0).toUpperCase() + u.role.slice(1).replace('_', ' ')}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Warehouse Distribution -->
        ${canViewReports && canViewWarehouses ? `
        <div class="chart-card ${canViewWorkforce ? 'col-6' : 'col-12'}">
          <div class="chart-card-header">
            <div class="chart-card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('analytics', 18)} Revenue by Warehouse</div>
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
        </div>
        ` : ''}
      </div>
      ` : ''}

    </div>

    <!-- Floating Action Button for Quick Invoicing -->
    ${canDo('billing', 'create', user) ? `
    <button class="fab" onclick="location.hash='#/billing'" title="Quick Invoice">
      <span style="display:flex;align-items:center;justify-content:center;color:white">${getSvgIcon('billing', 24)}</span>
    </button>
    ` : ''}
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
          <h1 class="page-title">Warehouse Management</h1>
          <p class="page-subtitle">Centralized control for all warehouse locations · <span style="color:var(--text-brand);font-weight:600">${planLabel}</span></p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" id="view-toggle" style="display:inline-flex;align-items:center;gap:6px">${getSvgIcon('tables', 14)} Table View</button>
          <button class="btn btn-primary" id="create-wh-btn" ${atLimit ? 'disabled title="Warehouse limit reached for your plan"' : ''}>
            + New Warehouse ${atLimit ? '(Limit Reached)' : ''}
          </button>
        </div>
      </div>
      ${atLimit ? `
      <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px">
        <span style="color:var(--accent-amber);display:flex;align-items:center">${getSvgIcon('warning', 20)}</span>
        <div>
          <div style="font-weight:700;font-size:13px;color:var(--text-primary)">Warehouse Limit Reached</div>
          <div style="font-size:12px;color:var(--text-muted)">Your <strong>Starter plan</strong> allows only 1 warehouse. <a href="#/subscription" style="color:var(--text-brand)">Upgrade to Enterprise</a> for unlimited warehouses.</div>
        </div>
      </div>` : ''}

      <!-- Summary Stat Cards -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(99,102,241,0.15);color:var(--text-brand);display:flex;align-items:center;justify-content:center">${getSvgIcon('warehouses', 20)}</div>
          <div class="stat-card-value" id="wh-count">${whs.length}</div>
          <div class="stat-card-label">Total Warehouses</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(16,185,129,0.15);color:var(--accent-emerald);display:flex;align-items:center;justify-content:center">${getSvgIcon('check', 20)}</div>
          <div class="stat-card-value">${whs.filter(w=>w.status==='active').length}</div>
          <div class="stat-card-label">Active</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(6,182,212,0.15);color:var(--text-primary);display:flex;align-items:center;justify-content:center">${getSvgIcon('workforce', 20)}</div>
          <div class="stat-card-value">${allUsers.length}</div>
          <div class="stat-card-label">Total Staff</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(245,158,11,0.15);color:var(--accent-amber);display:flex;align-items:center;justify-content:center">${getSvgIcon('revenue', 20)}</div>
          <div class="stat-card-value">${formatCurrency(whs.reduce((s,w)=>s+(w.revenue||0),0))}</div>
          <div class="stat-card-label">Combined Revenue</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background:rgba(168,85,247,0.15);color:var(--text-primary);display:flex;align-items:center;justify-content:center">${getSvgIcon('analytics', 20)}</div>
          <div class="stat-card-value">${limit < 0 ? '∞' : limit}</div>
          <div class="stat-card-label">Plan Limit</div>
        </div>
      </div>

      <!-- Search + Filter -->
      <div class="table-toolbar" style="margin-bottom:20px">
        <div class="table-search" style="max-width:400px;flex:none">
          <span>${getSvgIcon('search', 14)}</span>
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
    const btn = e.currentTarget;
    btn.innerHTML = wh_currentView === 'grid' 
      ? `${getSvgIcon('tables', 14)} Table View` 
      : `${getSvgIcon('dashboard', 14)} Grid View`;
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
      <div style="margin-bottom:16px;opacity:0.4;display:flex;justify-content:center">${getSvgIcon('warehouses', 48)}</div>
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
          <div class="warehouse-avatar" style="display:flex;align-items:center;justify-content:center;${(wh.logo && (wh.logo.startsWith('data:') || wh.logo.startsWith('http'))) ? 'background:var(--bg-elevated);border:1px solid var(--border-default);' : 'background:var(--gradient-brand);'}border-radius:var(--radius-md);width:40px;height:40px;flex-shrink:0;overflow:hidden">${renderWarehouseLogo(wh.logo, 40)}</div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <span class="badge ${wh.status === 'active' ? 'badge-success' : 'badge-danger'} badge-dot"> ${wh.status}</span>
            <div style="display:flex;gap:4px">
              <button class="action-btn edit" data-id="${wh.id}" title="Edit" onclick="event.stopPropagation()">${getSvgIcon('edit', 14)}</button>
              <button class="action-btn delete" data-id="${wh.id}" title="Delete" onclick="event.stopPropagation()">${getSvgIcon('trash', 14)}</button>
            </div>
          </div>
        </div>
        <div class="warehouse-name">${wh.name}</div>
        <div class="warehouse-biz">${wh.businessName}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px;display:flex;align-items:center;gap:6px">${getSvgIcon('location', 12)} ${wh.address}</div>
        <div style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px">
          <span style="display:inline-flex;align-items:center;gap:4px">${getSvgIcon('mail', 12)} ${wh.email}</span>
          <span>·</span>
          <span style="display:inline-flex;align-items:center;gap:4px">${getSvgIcon('phone', 12)} ${wh.contact}</span>
        </div>
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
      <div style="margin-bottom:16px;opacity:0.4;display:flex;justify-content:center">${getSvgIcon('warehouses', 48)}</div>
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
                  <td data-label="Logo"><div style="display:flex;align-items:center;justify-content:center;${(wh.logo && (wh.logo.startsWith('data:') || wh.logo.startsWith('http'))) ? 'background:var(--bg-elevated);border:1px solid var(--border-default);' : 'background:var(--gradient-brand);'}border-radius:6px;width:32px;height:32px;overflow:hidden;flex-shrink:0">${renderWarehouseLogo(wh.logo, 32)}</div></td>
                  <td data-label="Name">
                    <div style="font-weight:600;color:var(--text-brand)">${wh.name}</div>
                    <div style="font-size:11px;color:var(--text-muted);display:inline-flex;align-items:center;gap:4px">${getSvgIcon('location', 11)} ${wh.address}</div>
                  </td>
                  <td data-label="Business Name">${wh.businessName}</td>
                  <td data-label="Contact Info">
                    <div style="font-size:12px;display:inline-flex;align-items:center;gap:4px">${getSvgIcon('mail', 11)} ${wh.email}</div>
                    <div style="font-size:11px;color:var(--text-muted);display:inline-flex;align-items:center;gap:4px;margin-top:2px">${getSvgIcon('phone', 11)} ${wh.contact}</div>
                  </td>
                  <td data-label="Staff"><span class="badge badge-brand">${staff}</span></td>
                  <td data-label="Items"><span class="badge badge-info">${wh.items || 0}</span></td>
                  <td data-label="Revenue"><strong style="color:var(--accent-emerald)">${formatCurrency(wh.revenue || 0)}</strong></td>
                  <td data-label="Status"><span class="badge ${wh.status === 'active' ? 'badge-success' : 'badge-danger'}">${wh.status}</span></td>
                  <td data-label="Actions" style="text-align:right" onclick="event.stopPropagation()">
                    <div style="display:inline-flex;gap:4px">
                      <button class="action-btn edit" data-id="${wh.id}" title="Edit">${getSvgIcon('edit', 14)}</button>
                      <button class="action-btn delete" data-id="${wh.id}" title="Delete">${getSvgIcon('trash', 14)}</button>
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

  let selectedLogo = wh?.logo || 'icon:industrial';

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
          <label class="form-label">Warehouse Logo / Branding Icon</label>
          <div class="wh-branding-selector" style="display:flex;flex-direction:column;gap:12px;margin-bottom:12px;">
            <!-- Professional Icon Grid -->
            <div class="wh-icon-grid" style="display:grid;grid-template-columns:repeat(5, 1fr);gap:8px;">
              <div class="wh-icon-option ${wh?.logo === 'icon:industrial' || (!wh?.logo || (!wh.logo.startsWith('data:') && !['icon:distribution','icon:retail','icon:office','icon:tech'].includes(wh?.logo))) ? 'selected' : ''}" data-icon="icon:industrial" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;border:1px solid var(--border-default);border-radius:var(--radius-md);cursor:pointer;background:var(--bg-card);color:var(--text-primary);transition:all 0.2s;" title="Industrial">
                ${renderWarehouseLogo('icon:industrial', 24)}
                <span style="font-size:10px;margin-top:4px;">Industrial</span>
              </div>
              <div class="wh-icon-option ${wh?.logo === 'icon:distribution' ? 'selected' : ''}" data-icon="icon:distribution" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;border:1px solid var(--border-default);border-radius:var(--radius-md);cursor:pointer;background:var(--bg-card);color:var(--text-primary);transition:all 0.2s;" title="Distribution">
                ${renderWarehouseLogo('icon:distribution', 24)}
                <span style="font-size:10px;margin-top:4px;">Distribution</span>
              </div>
              <div class="wh-icon-option ${wh?.logo === 'icon:retail' ? 'selected' : ''}" data-icon="icon:retail" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;border:1px solid var(--border-default);border-radius:var(--radius-md);cursor:pointer;background:var(--bg-card);color:var(--text-primary);transition:all 0.2s;" title="Retail">
                ${renderWarehouseLogo('icon:retail', 24)}
                <span style="font-size:10px;margin-top:4px;">Retail</span>
              </div>
              <div class="wh-icon-option ${wh?.logo === 'icon:office' ? 'selected' : ''}" data-icon="icon:office" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;border:1px solid var(--border-default);border-radius:var(--radius-md);cursor:pointer;background:var(--bg-card);color:var(--text-primary);transition:all 0.2s;" title="Office Hub">
                ${renderWarehouseLogo('icon:office', 24)}
                <span style="font-size:10px;margin-top:4px;">Office Hub</span>
              </div>
              <div class="wh-icon-option ${wh?.logo === 'icon:tech' ? 'selected' : ''}" data-icon="icon:tech" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;border:1px solid var(--border-default);border-radius:var(--radius-md);cursor:pointer;background:var(--bg-card);color:var(--text-primary);transition:all 0.2s;" title="Tech Hub">
                ${renderWarehouseLogo('icon:tech', 24)}
                <span style="font-size:10px;margin-top:4px;">Tech Hub</span>
              </div>
            </div>
            
            <!-- Custom Logo Uploader -->
            <div class="wh-logo-uploader" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px dashed var(--border-default);border-radius:var(--radius-md);background:var(--bg-card);">
              <div class="wh-logo-preview" id="m-wh-logo-preview" style="width:48px;height:48px;border-radius:var(--radius-sm);border:1px solid var(--border-default);background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
                ${renderWarehouseLogo(selectedLogo, 32)}
              </div>
              <div style="flex-grow:1;">
                <div style="font-size:var(--text-sm);font-weight:500;color:var(--text-primary);">Custom Brand Logo</div>
                <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:6px;">Upload image (Max 2MB, png/jpg/svg)</div>
                <button type="button" class="btn btn-secondary btn-sm" id="wh-logo-upload-btn">Choose File</button>
                <input type="file" id="wh-logo-file-input" accept="image/*" style="display:none;" />
                <button type="button" class="btn btn-ghost btn-sm" id="wh-logo-remove-btn" style="color:var(--accent-red);padding:0 8px;margin-left:8px;${selectedLogo.startsWith('data:') ? 'display:inline-block;' : 'display:none;'}">Reset</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Warehouse Currency</label>
          <select id="m-wh-currency" class="form-control">
            <option value="" ${!wh?.currency?'selected':''}>Default (Global settings)</option>
            <option value="USD" ${wh?.currency==='USD'?'selected':''}>USD ($)</option>
            <option value="INR" ${wh?.currency==='INR'?'selected':''}>INR (₹)</option>
            <option value="EUR" ${wh?.currency==='EUR'?'selected':''}>EUR (€)</option>
            <option value="GBP" ${wh?.currency==='GBP'?'selected':''}>GBP (£)</option>
            <option value="AED" ${wh?.currency==='AED'?'selected':''}>AED (د.إ)</option>
            <option value="SGD" ${wh?.currency==='SGD'?'selected':''}>SGD (S$)</option>
          </select>
          <div class="form-hint">Enables local currency preference override for this location hub.</div>
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
    <button class="btn btn-primary" id="m-save">${isEdit ? 'Update' : 'Create'} Warehouse</button>
  `;

  const modal = createModal({ title: isEdit ? 'Edit Warehouse' : 'New Warehouse', body, footer });

  // Attach branding grid events
  const iconOptions = modal.el.querySelectorAll('.wh-icon-option');
  const previewEl = modal.el.querySelector('#m-wh-logo-preview');
  const fileInput = modal.el.querySelector('#wh-logo-file-input');
  const uploadBtn = modal.el.querySelector('#wh-logo-upload-btn');
  const removeBtn = modal.el.querySelector('#wh-logo-remove-btn');

  iconOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      iconOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedLogo = opt.dataset.icon;
      if (previewEl) {
        previewEl.innerHTML = renderWarehouseLogo(selectedLogo, 32);
      }
      if (removeBtn) removeBtn.style.display = 'none';
      if (fileInput) fileInput.value = '';
    });
  });

  uploadBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('File too large', 'Image size must be less than 2MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      selectedLogo = base64;
      iconOptions.forEach(o => o.classList.remove('selected'));
      if (previewEl) {
        previewEl.innerHTML = `<img src="${base64}" style="width:32px;height:32px;object-fit:contain;border-radius:6px;" />`;
      }
      if (removeBtn) removeBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
  });

  removeBtn?.addEventListener('click', () => {
    selectedLogo = 'icon:industrial';
    iconOptions.forEach(o => o.classList.remove('selected'));
    modal.el.querySelector('.wh-icon-option[data-icon="icon:industrial"]')?.classList.add('selected');
    if (previewEl) {
      previewEl.innerHTML = renderWarehouseLogo(selectedLogo, 32);
    }
    if (removeBtn) removeBtn.style.display = 'none';
    if (fileInput) fileInput.value = '';
  });

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
      logo: selectedLogo,
      currency: document.getElementById('m-wh-currency')?.value || '',
      ...(isEdit ? { status: document.getElementById('m-wh-status')?.value } : {})
    };

    if (isEdit) {
      updateWarehouse(wh.id, data).then(() => {
        showToast('Warehouse updated', `${name} has been updated`, 'success');
        refreshList();
      });
    } else {
      createWarehouse(data).then(() => {
        addNotification('warehouse_create', 'Warehouse Created', `${name} is now active and ready`, '/warehouses');
        showToast('Warehouse created', `${name} is ready`, 'success');
        refreshList();
      });
    }

    modal.close();
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
            <div style="display:flex;align-items:center;justify-content:center;${(wh.logo && (wh.logo.startsWith('data:') || wh.logo.startsWith('http'))) ? 'background:var(--bg-elevated);border:1px solid var(--border-default);' : 'background:var(--gradient-brand);'}border-radius:var(--radius-lg);width:60px;height:60px;overflow:hidden;flex-shrink:0">${renderWarehouseLogo(wh.logo, 60)}</div>
            <div>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                <h1 class="page-title" style="margin:0">${wh.name}</h1>
                <span class="badge ${wh.status==='active'?'badge-success':'badge-danger'} badge-dot"> ${wh.status}</span>
              </div>
              <p class="page-subtitle">${wh.businessName} · ${wh.address}</p>
            </div>
          </div>
        </div>
        <div class="page-header-actions" style="align-items:center">
          ${wh.barcode ? `
          <div style="display:flex;align-items:center;gap:8px;background:white;padding:4px 8px;border:1px solid var(--border-default);border-radius:6px;margin-right:12px;box-shadow:var(--shadow-sm)">
            ${generateBarcodeSVG(wh.barcode, { height: 28, color: '#111', showLabel: true })}
          </div>
          ` : ''}
          ${isSA?`<button class="btn btn-secondary btn-sm" onclick="location.hash='#/warehouses'">← Warehouses</button>`:''}
          ${isSA?`<button class="btn btn-secondary btn-sm" id="wd-edit-btn" style="display:inline-flex;align-items:center;gap:4px">${getSvgIcon('edit', 14)} Edit</button>`:''}
          <button class="btn btn-primary btn-sm" onclick="location.hash='#/billing'">${getSvgIcon('plus', 14)} New Invoice</button>
        </div>
      </div>

      <div class="dashboard-grid">
        ${[
          {icon:getSvgIcon('revenue'),val:formatCurrency(revenue), label:'Revenue',       color:'var(--accent-emerald)',glow:'#10b981'},
          {icon:getSvgIcon('revenue'),val:formatCurrency(netRev),  label:'Net Revenue',   color:'var(--accent-cyan)',   glow:'#06b6d4'},
          {icon:getSvgIcon('settings'),val:formatCurrency(tax),     label:'Tax Collected', color:'var(--accent-amber)',  glow:'#f59e0b'},
          {icon:getSvgIcon('billing'),val:bills.length,            label:'Invoices',      color:'var(--text-brand)',    glow:'#6366f1'},
          {icon:getSvgIcon('workforce'),val:staff.length,            label:'Team Members',  color:'var(--accent-violet)', glow:'#8b5cf6'},
          {icon:getSvgIcon('items'),val:totalStock.toLocaleString(),label:'Stock Units',color:'var(--text-primary)',  glow:'#64748b'},
          {icon:getSvgIcon('palette'),val:formatCurrency(invValue),label:'Inv. Value',    color:'var(--accent-rose)',   glow:'#f43f5e'},
          {icon:getSvgIcon('warning'),val:lowStock.length,         label:'Low Stock',     color:lowStock.length>0?'var(--accent-rose)':'var(--accent-emerald)',glow:'#f59e0b'},
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
            <div class="card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('analytics', 16)} Revenue Trend (Last 6 Months)</div>
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
          <div class="card-header"><div class="card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('revenue', 16)} Billing Summary</div></div>
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
            <div class="card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('workforce', 16)} Team (${staff.length})</div>
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
            <div class="card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('billing', 16)} Recent Invoices</div>
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
            <div class="card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('items', 16)} Inventory (${items.length} items · ${totalStock.toLocaleString()} units)</div>
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
        <div class="card-header"><div class="card-title" style="display:flex;align-items:center;gap:8px">${getSvgIcon('warehouses', 16)} Warehouse Information</div></div>
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
 * Workforce Management Page — User CRUD with role assignment, view modes, and user profile panel
 */






let wf_searchQ = '';
let roleFilter = '';
let wf_whFilter = '';
let wf_page = 1;
const wf_PER_PAGE = 10;
let wf_viewMode = localStorage.getItem('wareops_wf_view') || 'table'; // table | card | grid

function renderWorkforce() {
  const user = getCurrentUser();
  if (!user || user.role === 'employee' || user.role === 'staff') { navigate('/dashboard'); return; }

  const whs = getWarehouses();

  renderShell('Workforce', 'Manage users, roles, and warehouse assignments', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Workforce Management</h1>
          <p class="page-subtitle">Centralized user and role management across all warehouses</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${user.role === 'super_admin' ? `<button class="btn btn-ghost btn-sm" onclick="location.hash='#/roles'">${getSvgIcon('workforce', 13)} Roles</button>` : ''}
          ${['super_admin', 'admin'].includes(user.role) ? `<button class="btn btn-primary" id="create-user-btn">+ Add User</button>` : ''}
        </div>
      </div>

      <!-- Stats Row -->
      <div id="workforce-stats"></div>

      <!-- Table Toolbar -->
      <div class="table-toolbar">
        <div class="table-search">
          <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span>
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
        <!-- View Mode Toggle -->
        <div class="view-mode-toggle" id="wf-view-toggle">
          <button class="view-mode-btn ${wf_viewMode==='table'?'active':''}" data-view="table" title="Table View">${getSvgIcon('tables', 14)}</button>
          <button class="view-mode-btn ${wf_viewMode==='card'?'active':''}" data-view="card" title="Card View">${getSvgIcon('warehouse', 14)}</button>
          <button class="view-mode-btn ${wf_viewMode==='grid'?'active':''}" data-view="grid" title="Grid View">${getSvgIcon('dashboard', 14)}</button>
        </div>
      </div>

      <!-- User List Container -->
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

  // View mode buttons
  document.getElementById('wf-view-toggle')?.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wf_viewMode = btn.dataset.view;
      localStorage.setItem('wareops_wf_view', wf_viewMode);
      document.querySelectorAll('#wf-view-toggle .view-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.view === wf_viewMode));
      renderWorkforceTable();
    });
  });
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
        <div class="stat-card-icon" style="background:rgba(99,102,241,0.15)">${getSvgIcon('user', 20)}</div>
        <div class="stat-card-value">${users.length}</div>
        <div class="stat-card-label">Total Users</div>
      </div>
      ${roles.map(r => {
        const count = users.filter(u=>u.role===r).length;
        const colors = {admin:'rgba(6,182,212,0.15)',manager:'rgba(16,185,129,0.15)',staff:'rgba(245,158,11,0.15)',employee:'rgba(100,116,139,0.15)'};
        const icons = {
          admin: getSvgIcon('warehouses', 20),
          manager: getSvgIcon('workforce', 20),
          staff: getSvgIcon('billing', 20),
          employee: getSvgIcon('user', 20)
        };
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
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="margin-bottom:16px;opacity:0.4;display:flex;justify-content:center">${getSvgIcon('user', 40)}</div><h3 style="color:var(--text-secondary)">No users found</h3></div>`;
    document.getElementById('workforce-pagination').innerHTML = '';
    return;
  }

  if (wf_viewMode === 'card') {
    renderCardView(wf_pageUsers, whs, currentUser, container);
  } else if (wf_viewMode === 'grid') {
    renderGridView(wf_pageUsers, whs, currentUser, container);
  } else {
    renderTableView(wf_pageUsers, whs, currentUser, container, start, total);
  }

  // Pagination
  const paginationEl = document.getElementById('workforce-pagination');
  if (paginationEl && wf_viewMode !== 'table') {
    paginationEl.innerHTML = `
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+wf_PER_PAGE,total)} of ${total} users</div>
        <div class="pagination-controls">
          <button class="wf_page-btn" id="pg-prev" ${wf_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:wf_pages},(_,i)=>`<button class="wf_page-btn ${wf_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="wf_page-btn" id="pg-next" ${wf_page>=wf_pages?'disabled':''}>›</button>
        </div>
      </div>`;
  }

  bindProfileButtons(container);
  bindPaginationButtons(container, paginationEl, wf_pages);

  // Edit/Delete
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
}

function renderTableView(pageUsers, whs, currentUser, container, start, total) {
  const wf_pages = Math.ceil(total / wf_PER_PAGE);
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
          ${pageUsers.map(u => {
            const wh = whs.find(w => w.id === u.warehouseId);
            return `<tr>
                <td data-label="Name">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="wf-avatar-cell" data-uid="${u.id}" style="cursor:pointer" title="View Profile">
                    ${renderAvatarContainer(u.avatar, u.name, 32)}
                  </div>
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
                <div class="table-actions">
                  <button class="action-btn view profile-btn" data-uid="${u.id}" title="View Profile">${getSvgIcon('view', 14)}</button>
                  ${['super_admin', 'admin'].includes(currentUser.role) ? `
                   <button class="action-btn edit" data-uid="${u.id}" title="Edit">${getSvgIcon('edit', 14)}</button>
                   <button class="action-btn delete" data-uid="${u.id}" title="Delete">${getSvgIcon('trash', 14)}</button>
                  ` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+wf_PER_PAGE,total)} of ${total} users</div>
        <div class="pagination-controls">
          <button class="wf_page-btn" id="pg-prev" ${wf_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:wf_pages},(_,i)=>`<button class="wf_page-btn ${wf_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="wf_page-btn" id="pg-next" ${wf_page>=wf_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;
}

function renderCardView(pageUsers, whs, currentUser, container) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin-bottom:16px">
      ${pageUsers.map(u => {
        const wh = whs.find(w => w.id === u.warehouseId);
        return `
          <div class="card" style="padding:0;overflow:hidden;transition:transform 0.15s,box-shadow 0.15s" onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow-lg)'" onmouseleave="this.style.transform='';this.style.boxShadow=''">
            <div style="height:4px;background:var(--gradient-brand)"></div>
            <div style="padding:20px">
              <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
                <div class="wf-avatar-cell" data-uid="${u.id}" style="cursor:pointer;flex-shrink:0" title="View Profile">
                  ${renderAvatarContainer(u.avatar, u.name, 48)}
                </div>
                <div style="min-width:0">
                  <div style="font-size:15px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${u.email}</div>
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
                ${roleBadge(u.role)}
                ${statusBadge(u.status)}
                <span class="badge badge-info">${wh ? wh.name : '—'}</span>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Since ${formatDate(u.assignedAt || u.createdAt)}</div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-secondary btn-xs profile-btn" data-uid="${u.id}">${getSvgIcon('view', 12)} Profile</button>
                ${['super_admin','admin'].includes(currentUser.role) ? `
                  <button class="action-btn edit btn-xs" data-uid="${u.id}">${getSvgIcon('edit', 12)}</button>
                  <button class="action-btn delete btn-xs" data-uid="${u.id}">${getSvgIcon('trash', 12)}</button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderGridView(pageUsers, whs, currentUser, container) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:16px">
      ${pageUsers.map(u => {
        const wh = whs.find(w => w.id === u.warehouseId);
        return `
          <div class="card" style="padding:20px 16px;text-align:center;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s" 
            onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='var(--shadow-lg)'" 
            onmouseleave="this.style.transform='';this.style.boxShadow=''">
            <div class="wf-avatar-cell" data-uid="${u.id}" style="display:inline-block;cursor:pointer;margin-bottom:12px" title="View Profile">
              ${renderAvatarContainer(u.avatar, u.name, 56)}
            </div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
            <div style="margin:6px 0">${roleBadge(u.role)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${wh ? wh.name : '—'}</div>
            <div style="margin-top:10px;display:flex;gap:6px;justify-content:center">
              <button class="action-btn view btn-xs profile-btn" data-uid="${u.id}" title="Profile">${getSvgIcon('view', 12)}</button>
              ${['super_admin','admin'].includes(currentUser.role) ? `
                <button class="action-btn edit btn-xs" data-uid="${u.id}" title="Edit">${getSvgIcon('edit', 12)}</button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function bindProfileButtons(container) {
  const allUsers = getAllUsers();
  container.querySelectorAll('.profile-btn, .wf-avatar-cell').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const uid = el.dataset.uid;
      const u = allUsers.find(u => u.id === uid);
      if (u) showUserProfilePanel(u);
    });
  });
}

function bindPaginationButtons(container, paginationEl, wf_pages) {
  const allContainers = [container, paginationEl];
  allContainers.forEach(el => {
    if (!el) return;
    el.querySelectorAll('.wf_page-btn[data-pg]').forEach(btn => {
      btn.addEventListener('click', () => { wf_page = parseInt(btn.dataset.pg); renderWorkforceTable(); });
    });
    el.querySelector('#pg-prev')?.addEventListener('click', () => { if (wf_page > 1) { wf_page--; renderWorkforceTable(); } });
    el.querySelector('#pg-next')?.addEventListener('click', () => { if (wf_page < wf_pages) { wf_page++; renderWorkforceTable(); } });
  });
}

function showUserProfilePanel(u) {
  const whs = getWarehouses();
  const allRoles = getAllRoles();
  const wh = whs.find(w => w.id === u.warehouseId);
  const perms = resolvePermissions(u);
  const roleObj = allRoles.find(r => r.id === u.role || r.key === u.role);
  const logs = getAuditLogs().filter(l => l.userId === u.id).slice(0, 6);

  // Permission summary rows
  const permRows = Object.entries(perms).filter(([,v]) => v.view).map(([mod]) => `
    <div style="display:flex;align-items:center;gap:6px;padding:3px 0">
      <div style="width:6px;height:6px;border-radius:50%;background:var(--accent-emerald);flex-shrink:0"></div>
      <span style="font-size:12px;color:var(--text-secondary);text-transform:capitalize">${mod}</span>
    </div>
  `).join('');

  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <!-- Left: User Info -->
      <div>
        <div style="text-align:center;padding:20px 0 16px;border-bottom:1px solid var(--border-subtle);margin-bottom:16px">
          <div style="display:inline-block;margin-bottom:12px">${renderAvatarContainer(u.avatar, u.name, 72)}</div>
          <div style="font-size:18px;font-weight:800;color:var(--text-primary)">${u.name}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${u.email}</div>
          <div style="margin-top:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
            ${roleBadge(u.role)}
            ${statusBadge(u.status)}
          </div>
        </div>
        <div style="font-size:12px;line-height:1.8;color:var(--text-secondary)">
          <div><strong>Role:</strong> ${roleObj ? roleObj.name : u.role}</div>
          <div><strong>Warehouse:</strong> ${wh ? wh.name : '—'}</div>
          <div><strong>User ID:</strong> <span style="font-family:var(--font-mono)">${u.id.slice(0,12)}...</span></div>
          <div><strong>Joined:</strong> ${formatDate(u.assignedAt || u.createdAt)}</div>
          ${u.barcode ? `<div><strong>Barcode:</strong> <span style="font-family:var(--font-mono);font-size:11px">${u.barcode}</span></div>` : ''}
        </div>

        <div style="margin-top:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:8px">Module Access</div>
          <div style="columns:2;column-gap:16px">${permRows || '<span style="font-size:12px;color:var(--text-muted)">No module access</span>'}</div>
        </div>
      </div>

      <!-- Right: Activity -->
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:12px">Recent Activity</div>
        ${logs.length === 0 ? `<div style="font-size:13px;color:var(--text-muted);text-align:center;padding:24px">No recent activity</div>` : 
          logs.map(l => `
            <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
              <div style="width:6px;height:6px;border-radius:50%;background:var(--accent-indigo);flex-shrink:0;margin-top:5px"></div>
              <div>
                <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${l.action.replace(/_/g,' ')}</div>
                <div style="font-size:11px;color:var(--text-muted)">${l.description}</div>
                <div style="font-size:10px;color:var(--text-disabled);margin-top:2px">${formatDateTime(l.timestamp)}</div>
              </div>
            </div>
          `).join('')
        }

        ${wh ? `
          <div style="margin-top:20px;padding:14px;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle)">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:8px">Assigned Warehouse</div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${wh.name}</div>
            ${wh.address ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${wh.address}</div>` : ''}
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${wh.staffCount || 0} staff · ${wh.items || 0} items</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  const footer = `
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" id="pp-close">Close</button>
      ${['super_admin','admin'].includes(getCurrentUser()?.role) ? `<button class="btn btn-primary" id="pp-edit" data-uid="${u.id}">Edit User</button>` : ''}
    </div>
  `;

  const modal = createModal({ title: `User Profile — ${u.name}`, body, footer, width: '820px' });
  modal.el.querySelector('#pp-close')?.addEventListener('click', modal.close);
  modal.el.querySelector('#pp-edit')?.addEventListener('click', () => {
    modal.close();
    showUserModal(u);
  });
}


function showUserModal(u) {
  const isEdit = !!u;
  const whs = getWarehouses();
  const currentUser = getCurrentUser();
  const availableRoles = currentUser.role === 'super_admin'
    ? ['admin','manager','staff','employee']
    : ['manager','staff','employee'];

  let m_avatar = u?.avatar || '';
  const barcodeUrl = u?.barcode ? `http://localhost:8000/api/v1/registry/barcode?code=${u.barcode}` : '';

  const body = `
    <form id="user-modal-form">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-subtle)">
        <div id="m-u-avatar-preview" style="width:60px;height:60px;border-radius:50%;${m_avatar && (m_avatar.startsWith('data:image/') || m_avatar.startsWith('http')) ? 'background:transparent;border:1px solid var(--border-default);' : 'background:var(--gradient-brand);'}display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:white;overflow:hidden;flex-shrink:0">
          ${renderAvatar(m_avatar, "width:100%;height:100%;object-fit:cover;border-radius:50%") || (u?.name ? u.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?')}
        </div>
        <div style="flex:1">
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-xs" id="m-u-upload-photo-btn" type="button" style="padding:4px 8px;font-size:11px">Upload Photo</button>
            <button class="btn btn-ghost btn-xs" id="m-u-remove-photo-btn" type="button" style="padding:4px 8px;font-size:11px;color:var(--text-danger)">Remove</button>
          </div>
          <input type="file" id="m-u-photo-input" accept="image/*" style="display:none" />
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Upload profile photo (max 2MB)</div>
        </div>
        ${u?.barcode ? `
        <div style="text-align:right">
          <div style="background:white;padding:4px;border-radius:4px;display:inline-block;border:1px solid var(--border-default);">
            ${generateBarcodeSVG(u.barcode, { height: 32, color: '#111', showLabel: true })}
          </div>
        </div>
        ` : ''}
      </div>
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

      ${isEdit && currentUser.role === 'super_admin' ? `
      <!-- User-Level Permission Overrides -->
      <div style="border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;margin-top:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">User-Level Permission Overrides</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Overrides take priority over role defaults. Only set what differs.</div>
          </div>
          <button type="button" class="btn btn-ghost btn-xs" id="m-u-clear-overrides">Clear All</button>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle)">
                <th style="text-align:left;padding:4px 6px;color:var(--text-muted);font-weight:600">Module</th>
                ${ALL_ACTIONS.map(a => `<th style="text-align:center;padding:4px 3px;color:var(--text-muted);font-weight:600;font-size:10px;text-transform:uppercase">${a.slice(0,3)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${ALL_MODULES.map(mod => {
                const rolePerms = resolvePermissions(u);
                const overrides = u?.permissionOverrides?.[mod.key] || {};
                return `<tr style="border-bottom:1px solid var(--border-subtle)">
                  <td style="padding:4px 6px;font-weight:600;color:var(--text-secondary)">${mod.label}</td>
                  ${ALL_ACTIONS.map(action => {
                    // tri-state: override-true (checked+data-ov), override-false (unchecked+data-ov), inherit (no data-ov)
                    const hasOverride = mod.key in (u?.permissionOverrides || {}) && action in overrides;
                    const isChecked = hasOverride ? overrides[action] : rolePerms[mod.key]?.[action];
                    return `<td style="text-align:center;padding:4px 2px">
                      <input type="checkbox" class="user-perm-ov" data-mod="${mod.key}" data-action="${action}"
                        ${isChecked ? 'checked' : ''}
                        ${hasOverride ? 'data-override="1"' : ''}
                        style="width:13px;height:13px;cursor:pointer;accent-color:${hasOverride ? 'var(--accent-amber)' : 'var(--accent-emerald)'}" />
                    </td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:8px">
          <span style="color:var(--accent-amber)">●</span> Amber = user override active &nbsp;
          <span style="color:var(--accent-emerald)">●</span> Green = inherited from role
        </div>
      </div>` : ''}

      <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:12px;font-size:12px;color:var(--text-muted)">
        ℹ️ Auto-generated: Created date, assignment timestamp, and audit trail will be recorded automatically.
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="m-u-cancel">Cancel</button>
    <button class="btn btn-primary" id="m-u-save">${isEdit ? 'Update' : 'Add'} User</button>
  `;

  const modal = createModal({ title: isEdit ? 'Edit User' : 'Add New User', body, footer });
  modal.el.querySelector('#m-u-cancel')?.addEventListener('click', modal.close);

  modal.el.querySelector('#m-u-upload-photo-btn')?.addEventListener('click', () => {
    modal.el.querySelector('#m-u-photo-input')?.click();
  });

  // Clear all overrides button
  modal.el.querySelector('#m-u-clear-overrides')?.addEventListener('click', () => {
    modal.el.querySelectorAll('.user-perm-ov').forEach(cb => {
      cb.removeAttribute('data-override');
      cb.style.accentColor = 'var(--accent-emerald)';
    });
    showToast('Overrides cleared', 'All permissions will inherit from role', 'info');
  });

  // Live accent color toggle as user edits
  modal.el.addEventListener('change', (e) => {
    if (e.target.classList.contains('user-perm-ov')) {
      e.target.setAttribute('data-override', '1');
      e.target.style.accentColor = 'var(--accent-amber)';
    }
  });

  modal.el.querySelector('#m-u-photo-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('File too large', 'Please upload an image smaller than 2MB', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      m_avatar = base64;
      const preview = modal.el.querySelector('#m-u-avatar-preview');
      if (preview) {
        preview.style.background = 'transparent';
        preview.style.border = '1px solid var(--border-default)';
        preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`;
      }
    };
    reader.readAsDataURL(file);
  });

  modal.el.querySelector('#m-u-remove-photo-btn')?.addEventListener('click', () => {
    const name = document.getElementById('m-u-name').value.trim() || 'US';
    const fallbackInitials = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    m_avatar = fallbackInitials;
    const preview = modal.el.querySelector('#m-u-avatar-preview');
    if (preview) {
      preview.style.background = 'var(--gradient-brand)';
      preview.style.border = 'none';
      preview.innerHTML = fallbackInitials;
    }
  });

  modal.el.querySelector('#m-u-save')?.addEventListener('click', async () => {
    const name = document.getElementById('m-u-name').value.trim();
    const email = document.getElementById('m-u-email').value.trim();
    const role = document.getElementById('m-u-role').value;
    const warehouseId = document.getElementById('m-u-wh').value;
    if (!name || !email || !role || !warehouseId) { showToast('Validation', 'Fill all required fields', 'warning'); return; }
    
    // Set avatar fallback if empty
    if (!m_avatar) {
      m_avatar = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    }

    if (isEdit) {
      // Collect user-level permission overrides (super_admin only)
      let permissionOverrides = u?.permissionOverrides || {};
      if (currentUser.role === 'super_admin') {
        permissionOverrides = {};
        const rolePerms = resolvePermissions(u);
        modal.el.querySelectorAll('.user-perm-ov').forEach(cb => {
          const mod = cb.dataset.mod;
          const action = cb.dataset.action;
          const roleDefault = !!(rolePerms[mod]?.[action]);
          if (cb.checked !== roleDefault) {
            if (!permissionOverrides[mod]) permissionOverrides[mod] = {};
            permissionOverrides[mod][action] = cb.checked;
          }
        });
      }
      const data = { name, role, warehouseId, status: document.getElementById('m-u-status').value, avatar: m_avatar, permissionOverrides };
      const result = await updateUser(u.id, data);
      if (result && result.error) { showToast('Error', result.error, 'error'); return; }
      showToast('User updated', `${name}'s details updated`, 'success');
    } else {
      const password = document.getElementById('m-u-password').value;
      if (!password || password.length < 8) { showToast('Validation', 'Password must be at least 8 characters', 'warning'); return; }
      const result = await createUser({ name, email, password, role, warehouseId, avatar: m_avatar });
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
let it_layout = localStorage.getItem('wareops_items_layout') || 'table';

const CATEGORIES = ['Electronics','Furniture','Apparel','Food & Beverage','Tools','Medical','Automotive','Books','Sports','Other'];

function renderItems() {
  const user = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
  const whs = getWarehouses();
  const canEdit = ['super_admin','admin','manager'].includes(user.role);

  renderShell('Inventory', 'Manage items, stock, and categories', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Inventory Management</h1>
          <p class="page-subtitle">Track items, stock levels, and pricing</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canEdit ? `
            <button class="btn btn-secondary btn-sm" id="import-csv-btn">Import CSV</button>
            <button class="btn btn-primary" id="create-item-btn">+ Add Item</button>
          ` : ''}
        </div>
      </div>

      <!-- Stats -->
      <div id="item-stats"></div>

      <!-- Toolbar -->
      <div class="table-toolbar">
        <div class="table-search">
          <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span>
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
          <!-- View Mode Toggle -->
          <div class="view-mode-toggle" id="it-view-toggle" style="margin-left: 8px;">
            <button class="view-mode-btn ${it_layout==='table'?'active':''}" data-view="table" title="Table View">${getSvgIcon('tables', 14)}</button>
            <button class="view-mode-btn ${it_layout==='card'?'active':''}" data-view="card" title="Card View">${getSvgIcon('warehouse', 14)}</button>
            <button class="view-mode-btn ${it_layout==='grid'?'active':''}" data-view="grid" title="Grid View">${getSvgIcon('dashboard', 14)}</button>
          </div>
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

  // View mode buttons
  document.getElementById('it-view-toggle')?.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      it_layout = btn.dataset.view;
      localStorage.setItem('wareops_items_layout', it_layout);
      document.querySelectorAll('#it-view-toggle .view-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.view === it_layout));
      renderItemsTable();
    });
  });

  window._showItemModal = (item) => showItemModal(item);
  window._showItemCardModalById = (id) => {
    const item = getItems().find(i => i.id === id);
    if (item) showItemCardModal(item);
  };
  
  // Realtime WebSocket auto-refresh for inventory
  window.removeEventListener('wareops_ws_event', _handleInventoryWsEvent);
  window.addEventListener('wareops_ws_event', _handleInventoryWsEvent);
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
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(99,102,241,0.15);display:flex;align-items:center;justify-content:center;color:#6366f1">${getSvgIcon('items', 18)}</div><div class="stat-card-value">${items.length}</div><div class="stat-card-label">Total Items</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(16,185,129,0.15);display:flex;align-items:center;justify-content:center;color:#10b981">${getSvgIcon('analytics', 18)}</div><div class="stat-card-value">${totalStock.toLocaleString()}</div><div class="stat-card-label">Total Stock</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(6,182,212,0.15);display:flex;align-items:center;justify-content:center;color:#06b6d4">${getSvgIcon('revenue', 18)}</div><div class="stat-card-value">${formatCurrency(totalValue)}</div><div class="stat-card-label">Inventory Value</div></div>
      <div class="stat-card"><div class="stat-card-icon" style="background:rgba(244,63,94,0.15);display:flex;align-items:center;justify-content:center;color:#f43f5e">${getSvgIcon('warning', 18)}</div><div class="stat-card-value">${lowStock}</div><div class="stat-card-label">Low Stock Items</div></div>
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
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="color:var(--text-muted);margin-bottom:16px">${getSvgIcon('items', 40)}</div><h3 style="color:var(--text-secondary)">No items found</h3></div>`;
    return;
  }

  if (it_layout === 'card') {
    renderItemsCardView(it_pageItems, whs, canEdit, container, start, total, it_pages);
  } else if (it_layout === 'grid') {
    renderItemsGridView(it_pageItems, whs, canEdit, container, start, total, it_pages);
  } else {
    renderItemsTableView(it_pageItems, whs, canEdit, container, start, total, it_pages);
  }

  bindItemsEvents(container, it_pages);
}

function renderItemsTableView(pageItems, whs, canEdit, container, start, total, it_pages) {
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Item</th><th>SKU</th><th>Category</th><th>Price</th>
          <th>Stock</th><th>Warehouse</th>
          ${canEdit ? '<th>Actions</th>' : ''}
        </tr></thead>
        <tbody>
          ${pageItems.map(item => {
            const wh = whs.find(w=>w.id===item.warehouseId);
            const stockClass = (item.stock||0) < 20 ? 'badge-danger' : (item.stock||0) < 50 ? 'badge-warning' : 'badge-success';
            const itemImg = (item.images && item.images.length > 0) ? item.images[0] : '';
            return `<tr>
              <td data-label="Item">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="clickable-item-name" data-iid="${item.id}" style="cursor:pointer;flex-shrink:0" title="View Product Card">
                    ${renderEntityImage(itemImg, 'inventory', item.name, 36)}
                  </div>
                  <div>
                    <div class="primary-cell clickable-item-name" data-iid="${item.id}" style="cursor:pointer;color:var(--text-brand);text-decoration:underline;text-underline-offset:4px;" title="View Product Card">${item.name}</div>
                    <div class="sub-cell">Added ${formatDate(item.createdAt)}</div>
                  </div>
                </div>
              </td>
              <td data-label="SKU"><span style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${item.sku||'—'}</span></td>
              <td data-label="Category"><span class="badge badge-brand">${item.category}</span></td>
              <td data-label="Price"><strong style="color:var(--text-primary)">${formatCurrency(item.price||0)}</strong></td>
              <td data-label="Stock"><span class="badge ${stockClass}">${item.stock||0} ${item.unit||'pcs'}</span></td>
              <td data-label="Warehouse"><span class="badge badge-muted">${wh?.name||'—'}</span></td>
              ${canEdit ? `<td data-label="Actions">
                <div class="table-actions">
                  <button class="action-btn edit" data-iid="${item.id}" title="Edit">${getSvgIcon('edit', 14)}</button>
                  <button class="action-btn delete" data-iid="${item.id}" title="Delete">${getSvgIcon('trash', 14)}</button>
                </div>
              </td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start+1}–${Math.min(start+it_PER_PAGE,total)} of ${total} items</div>
        <div class="pagination-controls">
          <button class="it_page-btn" id="ip-prev" ${it_page<=1?'disabled':''}>‹</button>
          ${Array.from({length:it_pages},(_,i)=>`<button class="it_page-btn ${it_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
          <button class="it_page-btn" id="ip-next" ${it_page>=it_pages?'disabled':''}>›</button>
        </div>
      </div>
    </div>
  `;
}

function renderItemsGridView(pageItems, whs, canEdit, container, start, total, it_pages) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:16px">
      ${pageItems.map(item => {
        const wh = whs.find(w=>w.id===item.warehouseId);
        const stockClass = (item.stock||0) < 20 ? 'badge-danger' : (item.stock||0) < 50 ? 'badge-warning' : 'badge-success';
        const itemImg = (item.images && item.images.length > 0) ? item.images[0] : '';
        return `
          <div class="card clickable-card" data-iid="${item.id}" style="padding:16px;display:flex;flex-direction:column;justify-content:space-between;transition:transform 0.15s,box-shadow 0.15s;cursor:pointer" 
               onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='var(--shadow-lg)'" 
               onmouseleave="this.style.transform='';this.style.boxShadow=''">
            <div>
              <div style="display:flex;justify-content:center;margin-bottom:12px;background:var(--bg-elevated);border-radius:6px;padding:8px">
                ${renderEntityImage(itemImg, 'inventory', item.name, 72)}
              </div>
              <div style="font-size:14px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
              <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin:4px 0">${item.sku||'—'}</div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
                <strong style="color:var(--text-primary);font-size:14px">${formatCurrency(item.price||0)}</strong>
                <span class="badge ${stockClass}">${item.stock||0} ${item.unit||'pcs'}</span>
              </div>
            </div>
            <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center">
              <span class="badge badge-brand" style="font-size:10px">${item.category}</span>
              <div style="display:flex;gap:6px">
                <button class="action-btn view profile-btn" data-iid="${item.id}" title="View Details" style="padding: 4px;">${getSvgIcon('view', 12)}</button>
                ${canEdit ? `
                  <button class="action-btn edit" data-iid="${item.id}" title="Edit" style="padding: 4px;">${getSvgIcon('edit', 12)}</button>
                  <button class="action-btn delete" data-iid="${item.id}" title="Delete" style="padding: 4px;">${getSvgIcon('trash', 12)}</button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="table-pagination" style="margin-top: 16px;">
      <div class="pagination-info">Showing ${start+1}–${Math.min(start+it_PER_PAGE,total)} of ${total} items</div>
      <div class="pagination-controls">
        <button class="it_page-btn" id="ip-prev" ${it_page<=1?'disabled':''}>‹</button>
        ${Array.from({length:it_pages},(_,i)=>`<button class="it_page-btn ${it_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
        <button class="it_page-btn" id="ip-next" ${it_page>=it_pages?'disabled':''}>›</button>
      </div>
    </div>
  `;
}

function renderItemsCardView(pageItems, whs, canEdit, container, start, total, it_pages) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;margin-bottom:16px">
      ${pageItems.map(item => {
        const wh = whs.find(w=>w.id===item.warehouseId);
        const stockClass = (item.stock||0) < 20 ? 'badge-danger' : (item.stock||0) < 50 ? 'badge-warning' : 'badge-success';
        const itemImg = (item.images && item.images.length > 0) ? item.images[0] : '';
        const barcodeStr = item.barcode || item.sku || `ITEM-${item.id.slice(-6)}`;
        const barcodeSVG = generateBarcodeSVG(barcodeStr, { height: 30, showLabel: false });
        return `
          <div class="card clickable-card" data-iid="${item.id}" style="padding:0;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;transition:transform 0.15s,box-shadow 0.15s" 
               onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='var(--shadow-lg)'" 
               onmouseleave="this.style.transform='';this.style.boxShadow=''">
            <div>
              <div style="height: 180px; width: 100%; overflow: hidden; position: relative; background: var(--bg-elevated); display: flex; align-items: center; justify-content: center;">
                ${itemImg ? `<img src="${itemImg}" style="width: 100%; height: 100%; object-fit: cover;" alt="${item.name}" />` : `<div style="color: var(--text-muted);">${getSvgIcon('items', 48)}</div>`}
              </div>
              <div style="padding: 16px 16px 0 16px;">
                <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
                <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:12px">${item.sku||'—'}</div>
                
                <div style="display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--border-subtle);padding-top:10px;">
                  <div style="display:flex;justify-content:space-between;font-size:12px;">
                    <span style="color:var(--text-secondary)">Warehouse</span>
                    <strong style="color:var(--text-primary)">${wh?.name || '—'}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:12px;">
                    <span style="color:var(--text-secondary)">Category</span>
                    <strong style="color:var(--text-primary)">${item.category}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:12px;">
                    <span style="color:var(--text-secondary)">Price</span>
                    <strong style="color:var(--text-primary)">${formatCurrency(item.price||0)}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">
                    <span style="color:var(--text-secondary)">Stock Status</span>
                    <span class="badge ${stockClass}">${item.stock||0} ${item.unit||'pcs'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div style="padding: 12px 16px 16px 16px;">
              <!-- Barcode Display -->
              <div style="background:white;border-radius:4px;border:1px solid var(--border-subtle);padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;margin-bottom:12px;">
                <div style="width:100%;display:flex;justify-content:center;mix-blend-mode:multiply;">
                  ${barcodeSVG}
                </div>
                <span style="font-family:var(--font-mono);font-size:9px;color:#555;margin-top:2px;letter-spacing:1px">${barcodeStr}</span>
              </div>
              
              <!-- Actions -->
              <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border-subtle);padding-top:10px;">
                <button class="btn btn-secondary btn-xs clickable-card" data-iid="${item.id}" style="font-size:11px;">${getSvgIcon('view', 12)} View Details</button>
                <div style="display:flex;gap:6px">
                  ${canEdit ? `
                    <button class="action-btn edit" data-iid="${item.id}" title="Edit" style="padding: 4px;">${getSvgIcon('edit', 12)}</button>
                    <button class="action-btn delete" data-iid="${item.id}" title="Delete" style="padding: 4px;">${getSvgIcon('trash', 12)}</button>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="table-pagination" style="margin-top: 16px;">
      <div class="pagination-info">Showing ${start+1}–${Math.min(start+it_PER_PAGE,total)} of ${total} items</div>
      <div class="pagination-controls">
        <button class="it_page-btn" id="ip-prev" ${it_page<=1?'disabled':''}>‹</button>
        ${Array.from({length:it_pages},(_,i)=>`<button class="it_page-btn ${it_page===i+1?'active':''}" data-pg="${i+1}">${i+1}</button>`).join('')}
        <button class="it_page-btn" id="ip-next" ${it_page>=it_pages?'disabled':''}>›</button>
      </div>
    </div>
  `;
}

function bindItemsEvents(container, it_pages) {
  const user = getCurrentUser();
  const canEdit = ['super_admin','admin','manager'].includes(user.role);

  if (canEdit) {
    container.querySelectorAll('.edit[data-iid]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = getItems().find(i=>i.id===btn.dataset.iid);
        if (item) showItemModal(item);
      });
    });
    container.querySelectorAll('.delete[data-iid]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await confirm('Delete this item from inventory?', 'Delete Item');
        if (ok) {
          const res = await deleteItem(btn.dataset.iid);
          if (res && res.error) {
            showToast('Delete failed', res.error, 'error');
            return;
          }
          showToast('Item deleted','','success');
          renderItemStats();
          renderItemsTable();
        }
      });
    });
  }

  container.querySelectorAll('.clickable-item-name[data-iid], .clickable-card[data-iid]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('.edit') || e.target.closest('.delete') || e.target.closest('.btn')) {
        return;
      }
      const item = getItems().find(i => i.id === el.dataset.iid);
      if (item) showItemCardModal(item);
    });
  });

  container.querySelectorAll('.it_page-btn[data-pg]').forEach(btn => { 
    btn.addEventListener('click', () => { 
      it_page = parseInt(btn.dataset.pg); 
      renderItemsTable(); 
    }); 
  });
  
  container.querySelector('#ip-prev')?.addEventListener('click', () => { 
    if (it_page > 1) { 
      it_page--; 
      renderItemsTable(); 
    } 
  });
  
  container.querySelector('#ip-next')?.addEventListener('click', () => { 
    if (it_page < it_pages) { 
      it_page++; 
      renderItemsTable(); 
    } 
  });
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
      
      <!-- Product Media Gallery -->
      <div class="form-group" style="margin-top: 16px;">
        <label class="form-label">Product Media Gallery</label>
        <div class="item-media-gallery-container" style="border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 12px; background: var(--bg-card);">
          <!-- Thumbnail Grid -->
          <div class="item-media-grid" id="m-item-media-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; margin-bottom: 12px;">
            <!-- Rendered thumbnails will go here -->
          </div>
          
          <!-- Dropzone/Upload Button -->
          <div class="item-media-dropzone" style="border: 1.5px dashed var(--border-default); border-radius: var(--radius-sm); padding: 16px; text-align: center; cursor: pointer; background: var(--bg-elevated); transition: all 0.2s;" id="item-media-upload-trigger">
            <span style="color: var(--brand-500); display: block; margin-bottom: 4px;">${getSvgIcon('upload', 20)}</span>
            <span style="font-size: 12px; font-weight: 600; color: var(--text-primary);">Upload Product Images</span>
            <span style="font-size: 10px; color: var(--text-secondary); display: block; margin-top: 2px;">PNG, JPG, WebP up to 2MB (multiple allowed)</span>
            <input type="file" id="m-item-file-input" accept="image/*" multiple style="display:none;" />
          </div>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="m-i-cancel">Cancel</button>
    <button class="btn btn-primary" id="m-i-save">${isEdit?'Update':'Create'} Item</button>
  `;

  let selectedImages = item?.images ? [...item.images] : [];

  const modal = createModal({ title: isEdit ? 'Edit Item' : 'Add New Item', body, footer });

  function renderThumbnails() {
    const grid = modal.el.querySelector('#m-item-media-grid');
    if (!grid) return;
    if (selectedImages.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 16px; color: var(--text-muted); font-size: 11px;">No product images uploaded yet</div>`;
      return;
    }
    
    grid.innerHTML = selectedImages.map((img, index) => {
      return `
        <div class="item-media-thumb" style="position: relative; width: 80px; height: 80px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); overflow: hidden; background: var(--bg-elevated); display: flex; align-items: center; justify-content: center;" data-index="${index}">
          <img src="${img}" style="width: 100%; height: 100%; object-fit: cover;" />
          
          <div class="item-media-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; gap: 4px; opacity: 0; transition: opacity 0.15s; z-index: 2;">
            <button type="button" class="action-btn-sm move-left-btn" style="background: rgba(255,255,255,0.2); border: none; border-radius: 4px; color: white; width: 20px; height: 20px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;" title="Move Left" ${index === 0 ? 'disabled style="opacity:0.3;pointer-events:none;"' : ''}>←</button>
            <button type="button" class="action-btn-sm delete-thumb-btn" style="background: rgba(239,68,68,0.8); border: none; border-radius: 4px; color: white; width: 20px; height: 20px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;" title="Remove">×</button>
            <button type="button" class="action-btn-sm move-right-btn" style="background: rgba(255,255,255,0.2); border: none; border-radius: 4px; color: white; width: 20px; height: 20px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;" title="Move Right" ${index === selectedImages.length - 1 ? 'disabled style="opacity:0.3;pointer-events:none;"' : ''}>→</button>
          </div>
        </div>
      `;
    }).join('');

    const thumbs = grid.querySelectorAll('.item-media-thumb');
    thumbs.forEach(thumb => {
      thumb.addEventListener('mouseenter', () => {
        const overlay = thumb.querySelector('.item-media-overlay');
        if (overlay) overlay.style.opacity = '1';
      });
      thumb.addEventListener('mouseleave', () => {
        const overlay = thumb.querySelector('.item-media-overlay');
        if (overlay) overlay.style.opacity = '0';
      });

      const index = parseInt(thumb.dataset.index);
      thumb.querySelector('.delete-thumb-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedImages.splice(index, 1);
        renderThumbnails();
      });
      thumb.querySelector('.move-left-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index > 0) {
          const temp = selectedImages[index];
          selectedImages[index] = selectedImages[index - 1];
          selectedImages[index - 1] = temp;
          renderThumbnails();
        }
      });
      thumb.querySelector('.move-right-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index < selectedImages.length - 1) {
          const temp = selectedImages[index];
          selectedImages[index] = selectedImages[index + 1];
          selectedImages[index + 1] = temp;
          renderThumbnails();
        }
      });
    });
  }

  // Initial render
  renderThumbnails();

  const trigger = modal.el.querySelector('#item-media-upload-trigger');
  const fileInput = modal.el.querySelector('#m-item-file-input');
  
  trigger?.addEventListener('click', () => fileInput?.click());
  
  fileInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    let processedCount = 0;
    if (files.length === 0) return;

    files.forEach(file => {
      if (file.size > 2 * 1024 * 1024) {
        showToast('File too large', `Image "${file.name}" exceeds 2MB limit`, 'warning');
        processedCount++;
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        selectedImages.push(event.target.result);
        processedCount++;
        if (processedCount === files.length) {
          renderThumbnails();
        }
      };
      reader.readAsDataURL(file);
    });
  });

  modal.el.querySelector('#m-i-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#m-i-save')?.addEventListener('click', async () => {
    const name = document.getElementById('m-i-name').value.trim();
    const category = document.getElementById('m-i-cat').value;
    const price = parseFloat(document.getElementById('m-i-price').value);
    const stock = parseInt(document.getElementById('m-i-stock').value);
    const warehouseId = document.getElementById('m-i-wh').value;
    if (!name||!category||isNaN(price)||isNaN(stock)||!warehouseId) { showToast('Validation','Fill all required fields','warning'); return; }
    
    const data = {
      name, category, price, stock, warehouseId,
      sku: document.getElementById('m-i-sku').value || `SKU-${Date.now()}`,
      unit: document.getElementById('m-i-unit').value,
      taxCategory: 'normal',
      images: selectedImages
    };
    
    let res;
    if (isEdit) {
      res = await updateItem(item.id, data);
      if (res && res.error) { showToast('Error', res.error, 'error'); return; }
      showToast('Item updated',`${name} updated`,'success');
    } else {
      res = await createItem(data);
      if (res && res.error) { showToast('Error', res.error, 'error'); return; }
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
      <div id="drag-drop-zone" style="border:2px dashed var(--border-default);border-radius:12px;padding:32px;text-align:center;cursor:pointer;background:rgba(99,102,241,0.02);transition:all 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="color:var(--brand-500);margin-bottom:12px">${getSvgIcon('upload', 36)}</div>
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
        <div style="font-size:12px;font-weight:700;color:var(--accent-rose);margin-bottom:8px;display:flex;align-items:center;gap:6px">${getSvgIcon('warning', 14)} Import Warnings/Errors:</div>
        <ul id="import-errors-list" style="font-size:11px;color:var(--text-muted);margin:0;padding-left:16px;line-height:1.6"></ul>
      </div>
      <div style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:8px;font-size:11px;color:var(--text-muted);display:flex;align-items:flex-start;gap:6px">
        <span style="color:var(--brand-500);flex-shrink:0;margin-top:1px">${getSvgIcon('info', 14)}</span>
        <span><strong>Expected columns:</strong> <code>name</code>, <code>sku</code>, <code>category</code>, <code>price</code>, <code>stock</code> (and optional <code>warehouseId</code>).</span>
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="import-cancel">Cancel</button>
    <button class="btn btn-primary" id="import-start-btn" disabled style="display:flex;align-items:center;gap:6px">${getSvgIcon('check', 14)} Upload & Import</button>
  `;

  const modal = createModal({ title: 'Bulk Import Inventory', body, footer });
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
    zone.querySelector('div:nth-child(2)').textContent = `Selected: ${file.name}`;
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
    const url = 'http://localhost:8000/api/v1/items/import';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      clearInterval(interval);
      progressBar.style.width = '100%';
      percentage.textContent = '100%';

      const data = await res.json();
      
      if (!res.ok) {
        showToast('Import Failed', data.message || 'An error occurred during CSV parsing.', 'error');
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
            syncWithBackend().then(() => {
              renderItemStats();
              renderItemsTable();
            });
          });
        } else {
          modal.close();
          // trigger parallel frontend sync
          syncWithBackend().then(() => {
            renderItemStats();
            renderItemsTable();
          });
        }
      } else {
        showToast('Import Failed', data.message || 'Malformed CSV format.', 'error');
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

function _handleInventoryWsEvent(e) {
  const user = getCurrentUser();
  if (!user) {
    window.removeEventListener('wareops_ws_event', _handleInventoryWsEvent);
    return;
  }
  const payload = e.detail;
  const evType = payload?.type || payload?.event_type;
  if (evType === 'inventory_change') {
    renderItemStats();
    renderItemsTable();
  }
}

function showItemCardModal(item) {
  const whs = getWarehouses();
  const wh = whs.find(w => w.id === item.warehouseId);
  const stockClass = (item.stock||0) < 20 ? 'badge-danger' : (item.stock||0) < 50 ? 'badge-warning' : 'badge-success';
  const statusLabel = (item.stock||0) === 0 ? 'Out of Stock' : (item.stock||0) < 20 ? 'Low Stock' : 'In Stock';
  
  const images = item.images && item.images.length > 0 ? item.images : [];
  
  // Custom Sliding Carousel HTML
  let carouselHTML = '';
  if (images.length === 0) {
    carouselHTML = `
      <div style="width:100%;height:220px;border-radius:var(--radius-lg);background:var(--bg-elevated);border:1px solid var(--border-default);display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);">
        ${getSvgIcon('items', 48)}
        <span style="font-size:12px;margin-top:8px;">No product media available</span>
      </div>
    `;
  } else {
    carouselHTML = `
      <div class="item-carousel" style="position:relative;width:100%;height:220px;border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--border-default);background:black;">
        <!-- Slides -->
        <div class="carousel-slides" style="display:flex;width:100%;height:100%;transition:transform 0.3s ease-in-out;">
          ${images.map((img, i) => `
            <div class="carousel-slide" style="min-width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
              <img src="${img}" style="width:100%;height:100%;object-fit:contain;" />
            </div>
          `).join('')}
        </div>
        
        <!-- Chevron Controls (if >1 image) -->
        ${images.length > 1 ? `
          <button type="button" class="carousel-prev" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:none;border-radius:50%;color:white;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:bold;z-index:3;">‹</button>
          <button type="button" class="carousel-next" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:none;border-radius:50%;color:white;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:bold;z-index:3;">›</button>
          
          <!-- Indicator Dots -->
          <div class="carousel-dots" style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:3;">
            ${images.map((_, i) => `
              <div class="carousel-dot ${i===0?'active':''}" data-slide="${i}" style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.4);cursor:pointer;transition:all 0.2s;"></div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  const barcodeStr = item.barcode || item.sku || `ITEM-${item.id.slice(-6)}`;

  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:8px;" class="item-card-grid">
      <!-- Media/Gallery Slide Column -->
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${carouselHTML}
        <!-- Specs Highlights -->
        <div style="padding:12px;background:var(--bg-input);border-radius:var(--radius-md);border:1px solid var(--border-default);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;font-weight:700;">Status</span>
            <span class="badge ${stockClass}" style="display:block;margin-top:4px;">${statusLabel}</span>
          </div>
          <div style="text-align:right;">
            <span style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;font-weight:700;">Stock Valuation</span>
            <strong style="display:block;font-size:14px;color:var(--text-primary);margin-top:4px;">${formatCurrency((item.price||0)*(item.stock||0))}</strong>
          </div>
        </div>
      </div>
      
      <!-- Specifications & Details Column -->
      <div style="display:flex;flex-direction:column;gap:16px;justify-content:space-between;">
        <div>
          <h2 style="font-size:20px;font-weight:800;color:var(--text-primary);margin:0 0 4px 0;">${item.name}</h2>
          <span style="font-size:12px;color:var(--text-brand);font-weight:600;display:inline-block;margin-bottom:12px;">Category: ${item.category}</span>
          
          <div style="display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--border-default);padding-top:12px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-secondary)">SKU Code</span>
              <strong style="color:var(--text-primary);font-family:var(--font-mono);">${item.sku || '—'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-secondary)">Unit Value</span>
              <strong style="color:var(--text-primary);">${formatCurrency(item.price||0)} / ${item.unit||'pcs'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-secondary)">Total Qty</span>
              <strong style="color:var(--text-primary);">${item.stock||0} ${item.unit||'pcs'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-secondary)">Assigned Hub</span>
              <strong style="color:var(--text-primary);">${wh?.name || '—'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-secondary)">Created Date</span>
              <strong style="color:var(--text-primary);">${formatDate(item.createdAt)}</strong>
            </div>
          </div>
        </div>
        
        <!-- Live Scannable Barcode SVG Block -->
        <div style="padding:12px;background:white;border-radius:var(--radius-md);border:1px solid var(--border-default);display:flex;flex-direction:column;align-items:center;justify-content:center;margin-top:12px;">
          <img src="http://localhost:8000/api/v1/registry/barcode?code=${barcodeStr}" style="height:45px;max-width:100%;mix-blend-mode:multiply;" title="Item Barcode" />
          <span style="font-family:var(--font-mono);font-size:10px;color:#555;margin-top:4px;letter-spacing:1.5px;">${barcodeStr}</span>
        </div>
      </div>
    </div>
  `;

  const footer = `<button class="btn btn-secondary" id="item-card-close" style="width:100%">Close Card</button>`;

  const modal = createModal({ title: 'Inventory Item Card', body, footer, size: 'medium' });
  modal.el.querySelector('#item-card-close')?.addEventListener('click', modal.close);

  // Wire up sliding carousel events
  if (images.length > 1) {
    const slides = modal.el.querySelector('.carousel-slides');
    const dots = modal.el.querySelectorAll('.carousel-dot');
    let currentIdx = 0;

    const updateCarousel = (idx) => {
      currentIdx = idx;
      slides.style.transform = `translateX(-${currentIdx * 100}%)`;
      dots.forEach((dot, dIdx) => {
        if (dIdx === currentIdx) {
          dot.style.background = 'white';
          dot.style.transform = 'scale(1.2)';
        } else {
          dot.style.background = 'rgba(255,255,255,0.4)';
          dot.style.transform = 'scale(1)';
        }
      });
    };

    modal.el.querySelector('.carousel-prev')?.addEventListener('click', () => {
      let idx = currentIdx - 1;
      if (idx < 0) idx = images.length - 1;
      updateCarousel(idx);
    });

    modal.el.querySelector('.carousel-next')?.addEventListener('click', () => {
      let idx = currentIdx + 1;
      if (idx >= images.length) idx = 0;
      updateCarousel(idx);
    });

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        updateCarousel(idx);
      });
      // Initial style positioning
      if (idx === 0) {
        dot.style.background = 'white';
        dot.style.transform = 'scale(1.2)';
      }
    });
  }
}

// ===== pages/tables.js =====
/**
 * WareOps ERP — Dynamic Tables Spreadsheet Workspace
 * Airtable / Notion style inline-editable grid with realtime collaboration
 */





// ─── Constants ────────────────────────────────────────────────────────────────
const COLUMN_TYPES   = ['text','number','date','dropdown','checkbox','price','tags','status'];
const CATEGORY_OPTS  = ['Operations','HR','Finance','Inventory','Sales','Logistics','Custom'];
const HEADER_COLORS  = ['#6366f1','#06b6d4','#10b981','#f59e0b','#f43f5e','#8b5cf6','#ec4899','#64748b'];
const VIRTUAL_ROWS   = 80;   // empty ghost rows below real data
const SAVE_DEBOUNCE  = 800;  // ms before auto-save fires

// ─── Module-level state ────────────────────────────────────────────────────────
let _activeTableId   = null;   // which table is open
let _schema          = null;   // loaded schema object
let _rows            = [];     // loaded row array
let _wsRef           = null;   // WebSocket reference (shared with store.js ws)
let _savingRows      = new Set();       // rowIds currently being saved
let _lockedRows      = new Map();       // rowId → { userId, userName } — locked by another user
let _pendingCells    = new Map();       // `${rowIndex}:${colId}` → cellEl — dirty cells
let _debounceSavers  = new Map();       // rowIndex → debounced save fn
let _activePage      = 1;      // active page tracking

// ─── Entry point ──────────────────────────────────────────────────────────────
async function renderTables() {
  const user     = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
  const whs      = getWarehouses();
  const canManage = ['super_admin','admin'].includes(user.role);

  if (_activeTableId) {
    // ── Spreadsheet workspace ──
    await _openSpreadsheet(user, canManage);
  } else {
    // ── Table list view ──
    await _renderTableList(user, whs, canManage);
  }
}

// ─── TABLE LIST ───────────────────────────────────────────────────────────────
async function _renderTableList(user, whs, canManage) {
  // Fetch schemas from backend
  const res = await apiFetch('/dynamic-tables/');
  let schemas = (res?.success && Array.isArray(res.data)) ? res.data : [];

  // Role-based schema filtering: non-admins only see tables assigned to their role
  if (!canManage) {
    schemas = schemas.filter(t => {
      if (!t.roles || t.roles.length === 0) return true; // no restriction = visible to all
      return t.roles.includes(user.role);
    });
  }


  renderShell('Tables', 'Dynamic table builder and spreadsheet workspace', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Table Builder</h1>
          <p class="page-subtitle">Airtable-style inline spreadsheet workspaces</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canManage ? `<button class="btn btn-primary" id="create-tbl-btn">+ New Table</button>` : ''}
        </div>
      </div>

      ${schemas.length === 0 ? `
        <div class="card" style="text-align:center;padding:80px 40px">
          <div style="font-size:48px;margin-bottom:20px;opacity:0.4;display:flex;justify-content:center;color:var(--text-muted)">${getSvgIcon('tables', 48)}</div>
          <h2 style="color:var(--text-secondary);margin-bottom:8px">No tables yet</h2>
          <p style="color:var(--text-muted);font-size:14px;margin-bottom:28px">Create your first table and start tracking data like a spreadsheet</p>
          ${canManage ? `<button class="btn btn-primary" id="create-tbl-btn-empty">+ Create First Table</button>` : ''}
        </div>
      ` : `
        <div class="table-toolbar" style="margin-bottom:16px">
          <div class="table-search"><span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span><input type="text" id="tbl-search" placeholder="Search tables..." /></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Table Name</th><th>Category</th><th>Warehouse</th>
              <th>Columns</th><th>Access Roles</th><th>Created</th><th>Actions</th>
            </tr></thead>
            <tbody id="tbl-list-body">
              ${schemas.map(t => {
                const wh = whs.find(w => w.id === t.warehouseId);
                return `<tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <div style="width:32px;height:32px;border-radius:8px;background:${t.headerColor||'#6366f1'};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">📋</div>
                      <div>
                        <div class="primary-cell">${t.name}</div>
                        <div class="sub-cell">${t.description||'No description'}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="badge badge-brand">${t.category||'—'}</span></td>
                  <td><span class="badge badge-info">${wh?.name||'All Warehouses'}</span></td>
                  <td>${(t.columns||[]).length} cols</td>
                  <td>${(t.roles||[]).length > 0 ? t.roles.map(r => `<span class="badge badge-muted" style="margin-right:2px">${capitalize(r)}</span>`).join('') : '<span class="badge badge-muted">All</span>'}</td>
                  <td>${formatDate(t.createdAt)}</td>
                  <td>
                    <div class="table-actions">
                      <button class="action-btn view" data-tid="${t.id}" title="Open Spreadsheet">${getSvgIcon('analytics', 14)}</button>
                      ${canManage ? `<button class="action-btn edit" data-tid="${t.id}" title="Edit Schema">${getSvgIcon('edit', 14)}</button>` : ''}
                      ${canManage ? `<button class="action-btn delete" data-tid="${t.id}" title="Delete">${getSvgIcon('trash', 14)}</button>` : ''}
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `);

  // Events
  document.getElementById('create-tbl-btn')?.addEventListener('click', () => _showSchemaModal(null, whs));
  document.getElementById('create-tbl-btn-empty')?.addEventListener('click', () => _showSchemaModal(null, whs));
  document.getElementById('tbl-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#tbl-list-body tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  document.querySelectorAll('.action-btn.view[data-tid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      _activeTableId = btn.dataset.tid;
      _activePage = 1;
      await renderTables();
    });
  });
  document.querySelectorAll('.action-btn.edit[data-tid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = await apiFetch(`/dynamic-tables/`);
      const s = r?.data?.find(t => t.id === btn.dataset.tid);
      if (s) _showSchemaModal(s, whs);
    });
  });
  document.querySelectorAll('.action-btn.delete[data-tid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirm('Delete this table and all its data permanently?', 'Delete Table');
      if (!ok) return;
      const r = await apiFetch(`/dynamic-tables/${btn.dataset.tid}`, { method: 'DELETE' });
      if (r?.success) { showToast('Table deleted', '', 'success'); await renderTables(); }
      else showToast('Error', r?.error || 'Delete failed', 'error');
    });
  });
}

// ─── SPREADSHEET WORKSPACE ────────────────────────────────────────────────────
async function _openSpreadsheet(user, canManage) {
  // Fetch schema + rows
  const schemaRes = await apiFetch(`/dynamic-tables/`);
  _schema = schemaRes?.data?.find(t => t.id === _activeTableId) || null;

  if (!_schema) {
    showToast('Error', 'Table not found', 'error');
    _activeTableId = null;
    await renderTables();
    return;
  }

  // Enforce role-based access on schema open
  if (!canManage && _schema.roles && _schema.roles.length > 0) {
    if (!_schema.roles.includes(user.role)) {
      showToast('Access Denied', `You don't have permission to access this table`, 'error');
      _activeTableId = null;
      await renderTables();
      return;
    }
  }


  const rowsRes = await apiFetch(`/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`);
  _rows = (rowsRes?.success && Array.isArray(rowsRes.data)) ? rowsRes.data : [];

  const canEdit   = ['super_admin','admin','manager','staff'].includes(user.role);
  const canImport = ['super_admin','admin','manager'].includes(user.role);
  const cols      = _schema.columns || [];
  const headerColor = _schema.headerColor || '#6366f1';

  renderShell(_schema.name, `Spreadsheet Workspace · ${_rows.length} rows · ${cols.length} columns`, `
    <div class="animate-slideUp" id="spreadsheet-workspace">
      <!-- Toolbar -->
      <div class="ss-toolbar">
        <div class="ss-toolbar-left">
          <button class="btn btn-secondary btn-sm" id="ss-back">← All Tables</button>
          <div class="ss-table-badge" style="background:${headerColor}22;border-color:${headerColor}44;display:inline-flex;align-items:center;gap:6px">
            <span style="color:${headerColor};display:flex;align-items:center">${getSvgIcon('tables', 14)}</span>
            <span style="font-weight:700;color:var(--text-primary)">${_schema.name}</span>
            <span class="badge badge-muted" style="font-size:11px">${_schema.category}</span>
          </div>
          <div id="ss-pages-tabs-container" style="display:flex;align-items:center"></div>
          <div id="ss-collab-badges" class="ss-collab-area"></div>
        </div>
        <div class="ss-toolbar-right">
          <div id="ss-save-indicator" class="ss-save-indicator" style="display:none">
            <span class="ss-save-spinner">⟳</span> Saving…
          </div>
          ${canImport ? `
            <button class="btn btn-secondary btn-sm" id="ss-import-btn" style="display:flex;align-items:center;gap:4px">${getSvgIcon('upload', 14)} Import CSV</button>
            <button class="btn btn-secondary btn-sm" id="ss-export-btn" style="display:flex;align-items:center;gap:4px">${getSvgIcon('export', 14)} Export CSV</button>
          ` : ''}
          ${canManage ? `<button class="btn btn-secondary btn-sm" id="ss-schema-btn" style="display:flex;align-items:center;gap:4px">${getSvgIcon('settings', 14)} Edit Schema</button>` : ''}
        </div>
      </div>

      <!-- Spreadsheet Grid -->
      <div class="ss-container" id="ss-container">
        <div class="ss-grid-wrap" id="ss-grid-wrap">
          <table class="ss-grid" id="ss-grid" style="--header-color:${headerColor}">
            <thead>
              <tr>
                <th class="ss-th ss-th-row-num">#</th>
                ${cols.map(c => `
                  <th class="ss-th" data-col="${c.id}" title="${c.type}${c.required ? ' · Required' : ''}">
                    <div class="ss-th-inner">
                      <span class="ss-col-type-icon">${_colTypeIcon(c.type)}</span>
                      <span class="ss-col-name">${c.name}</span>
                      ${c.required ? '<span class="ss-req-dot" title="Required">*</span>' : ''}
                    </div>
                  </th>
                `).join('')}
                ${canEdit ? '<th class="ss-th ss-th-actions">Actions</th>' : ''}
              </tr>
            </thead>
            <tbody id="ss-tbody">
              ${_buildAllRows(cols, canEdit, user)}
            </tbody>
          </table>
        </div>
        <div class="ss-status-bar" style="display:flex;align-items:center;justify-content:space-between">
          <span id="ss-row-count">${_rows.length} active rows (100 rows capacity)</span>
          <span id="ss-selected-info" style="color:var(--text-muted)"></span>
          <span id="ss-page-meta" style="color:var(--text-muted);font-size:12px;display:flex;align-items:center;gap:12px"></span>
        </div>
      </div>
    </div>

    <!-- Hidden CSV input -->
    <input type="file" id="ss-csv-file" accept=".csv" style="display:none" />
  `);

  // Wire toolbar events
  document.getElementById('ss-back')?.addEventListener('click', () => {
    _activeTableId = null; _schema = null; _rows = [];
    _lockedRows.clear(); _pendingCells.clear(); _debounceSavers.clear();
    renderTables();
  });
  document.getElementById('ss-schema-btn')?.addEventListener('click', () => _showSchemaModal(_schema, getWarehouses()));
  document.getElementById('ss-import-btn')?.addEventListener('click', () => document.getElementById('ss-csv-file').click());
  document.getElementById('ss-export-btn')?.addEventListener('click', () => _exportCSV());
  document.getElementById('ss-csv-file')?.addEventListener('change', e => _handleCSVImport(e, cols));

  // Attach cell + row events
  _attachGridEvents(cols, canEdit, user);
  _renderPageTabs(canEdit);
  _updatePageMeta();

  // Connect WebSocket for realtime collaboration
  _subscribeToTableEvents();
}

// ─── ROW RENDERING ────────────────────────────────────────────────────────────
function _buildAllRows(cols, canEdit, user) {
  let html = '';
  // Real rows
  for (let i = 0; i < _rows.length; i++) {
    html += _buildRow(_rows[i], i, cols, canEdit, user, false);
  }
  // Virtual empty rows to fill up to exactly 100 capacity
  const virtualCount = Math.max(0, 100 - _rows.length);
  for (let v = 0; v < virtualCount; v++) {
    html += _buildVirtualRow(_rows.length + v, cols, canEdit);
  }
  return html;
}

// ─── PAGE SYSTEM UTILITIES ──────────────────────────────────────────────────
function _renderPageTabs(canEdit) {
  const container = document.getElementById('ss-pages-tabs-container');
  if (!container) return;

  const pages = _schema.pages && _schema.pages.length > 0 ? _schema.pages : [{
    page_number: 1,
    created_at: _schema.createdAt,
    created_by: _schema.createdBy,
    permissions: _schema.roles || [],
    storage_usage: 0
  }];

  container.innerHTML = `
    <div class="ss-pages-tabs" style="display:flex;align-items:center;gap:4px;margin-left:16px;background:var(--bg-input);padding:3px;border-radius:8px;border:1px solid var(--border-default)">
      ${pages.map(p => `
        <button class="ss-page-tab ${p.page_number === _activePage ? 'active' : ''}" data-page="${p.page_number}" 
                style="border:none;padding:6px 12px;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;
                       background:${p.page_number === _activePage ? 'var(--brand-500)' : 'transparent'};
                       color:${p.page_number === _activePage ? 'white' : 'var(--text-secondary)'};
                       transition:all 0.15s">
          Page ${p.page_number}
        </button>
      `).join('')}
      ${canEdit ? `
        <button class="ss-page-tab-add" id="ss-add-page-btn" title="Add Page" 
                style="border:none;padding:6px;border-radius:6px;cursor:pointer;background:transparent;
                       color:var(--brand-500);display:flex;align-items:center;justify-content:center">
          ${getSvgIcon('plus', 14)}
        </button>
      ` : ''}
    </div>
  `;

  _bindPageEvents(canEdit);
}

async function _switchPage(pageNumber) {
  _activePage = pageNumber;
  
  // Show smooth loading state in tbody for fast feedback
  const tbody = document.getElementById('ss-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="100" style="text-align:center;padding:48px;color:var(--text-muted)">
          <span class="ss-save-spinner" style="display:inline-block;margin-right:8px">⟳</span> Loading Page ${pageNumber}…
        </td>
      </tr>
    `;
  }
  
  const rowsRes = await apiFetch(`/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`);
  _rows = (rowsRes?.success && Array.isArray(rowsRes.data)) ? rowsRes.data : [];
  _updateRowCount();
  _updatePageMeta();
  
  const cols = _schema.columns || [];
  const user = getCurrentUser();
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role);
  if (tbody) {
    tbody.innerHTML = _buildAllRows(cols, canEdit, user);
    _attachGridEvents(cols, canEdit, user);
  }
  
  _renderPageTabs(canEdit);
}

function _bindPageEvents(canEdit) {
  document.querySelectorAll('.ss-page-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const pageNum = parseInt(btn.dataset.page);
      if (pageNum !== _activePage) {
        _switchPage(pageNum);
      }
    });
  });

  document.getElementById('ss-add-page-btn')?.addEventListener('click', async () => {
    const pages = _schema.pages && _schema.pages.length > 0 ? _schema.pages : [{}];
    const storeSub = localStorage.getItem('wareops_store');
    let plan = 'enterprise';
    try {
      if (storeSub) {
        const parsed = JSON.parse(storeSub);
        if (parsed.subscription?.plan) plan = parsed.subscription.plan;
      }
    } catch (e) {}

    const maxPages = plan === 'starter' ? 2 : 50;
    if (pages.length >= maxPages) {
      showToast('Plan Limit Exceeded', `Starter plan tables are limited to ${maxPages} pages. Please upgrade your subscription.`, 'warning');
      return;
    }

    _showSavingIndicator(true);
    const res = await apiFetch(`/dynamic-tables/${_activeTableId}/pages`, { method: 'POST' });
    _showSavingIndicator(false);

    if (res?.success && res.data) {
      _schema = res.data;
      showToast('Page Created', `Page ${_schema.pages.length} added to table`, 'success');
      _activePage = _schema.pages.length;
      _renderPageTabs(canEdit);
      await _switchPage(_schema.pages.length);
    } else {
      showToast('Error', res?.error || 'Could not create new page', 'error');
    }
  });
}

function _updatePageMeta() {
  const metaEl = document.getElementById('ss-page-meta');
  if (!metaEl) return;
  const pages = _schema.pages && _schema.pages.length > 0 ? _schema.pages : [{
    page_number: 1,
    created_at: _schema.createdAt,
    created_by: _schema.createdBy,
    permissions: _schema.roles || [],
    storage_usage: 0
  }];
  const currentPageMeta = pages.find(p => p.page_number === _activePage) || pages[0];
  const dateStr = currentPageMeta.created_at ? new Date(currentPageMeta.created_at).toLocaleDateString() : '—';
  const storageStr = currentPageMeta.storage_usage !== undefined ? `${currentPageMeta.storage_usage} B` : '0 B';
  const rolesStr = (currentPageMeta.permissions || []).length > 0 ? currentPageMeta.permissions.join(', ') : 'All';
  const ownerStr = currentPageMeta.created_by ? `Owner: ID ${currentPageMeta.created_by.slice(0, 8)}` : 'System';

  metaEl.innerHTML = `
    <span>📄 Page ${_activePage}</span>
    <span>📅 Created: ${dateStr}</span>
    <span>👤 ${ownerStr}</span>
    <span>🔒 Roles: ${rolesStr}</span>
    <span>💾 Storage: ${storageStr}</span>
  `;
}

function _buildRow(row, idx, cols, canEdit, user, isNew = false) {
  const locked = _lockedRows.has(row.id);
  const lockInfo = locked ? _lockedRows.get(row.id) : null;
  const isLockedByOther = locked && lockInfo?.userId !== String(user.id || user._id);

  return `<tr class="ss-row ${isNew ? 'ss-row-new' : ''} ${locked ? 'ss-row-locked' : ''}"
      data-row-id="${row.id}" data-row-idx="${idx}">
    <td class="ss-td ss-td-row-num">
      ${isLockedByOther
        ? `<span class="ss-lock-indicator" style="display:inline-flex;align-items:center;color:var(--brand-500)" title="${lockInfo.userName} is editing">${getSvgIcon('edit', 12)}</span>`
        : `<span class="ss-row-num">${idx + 1}</span>`
      }
    </td>
    ${cols.map(col => `
      <td class="ss-td ss-cell" data-col="${col.id}" data-row="${row.id}" data-row-idx="${idx}"
          data-type="${col.type}" ${!canEdit || isLockedByOther ? 'data-readonly="true"' : ''}>
        ${canEdit && !isLockedByOther
          ? _buildEditableCell(row[col.id], col, row.id, idx)
          : _buildReadonlyCell(row[col.id], col)
        }
      </td>
    `).join('')}
    ${canEdit ? `
      <td class="ss-td ss-td-actions">
        <button class="ss-action-btn ss-del-row" data-row-id="${row.id}" data-row-idx="${idx}" title="Delete row">${getSvgIcon('trash', 12)}</button>
      </td>
    ` : ''}
  </tr>`;
}

function _buildVirtualRow(idx, cols, canEdit) {
  return `<tr class="ss-row ss-row-virtual" data-row-idx="${idx}" data-virtual="true">
    <td class="ss-td ss-td-row-num"><span class="ss-row-num" style="opacity:0.3">${idx + 1}</span></td>
    ${cols.map(col => `
      <td class="ss-td ss-cell ss-cell-virtual" data-col="${col.id}" data-row-idx="${idx}"
          data-type="${col.type}" data-virtual="true">
        <span class="ss-cell-placeholder"></span>
      </td>
    `).join('')}
    ${canEdit ? `<td class="ss-td ss-td-actions"></td>` : ''}
  </tr>`;
}

function _buildEditableCell(value, col, rowId, rowIdx) {
  const v = value ?? '';
  const id = `cell-${rowId}-${col.id}`;

  switch (col.type) {
    case 'checkbox':
      return `<label class="ss-checkbox">
        <input type="checkbox" id="${id}" class="ss-input" ${v ? 'checked' : ''}
          data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}" />
      </label>`;

    case 'dropdown': {
      const opts = _parseOptions(col.options);
      const normalized = String(v).trim();
      return `<select id="${id}" class="ss-input ss-select" data-row-id="${rowId}"
          data-col-id="${col.id}" data-row-idx="${rowIdx}">
        <option value="">—</option>
        ${opts.map(o => `<option value="${o}" ${normalized === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>`;
    }

    case 'status':
      return `<select id="${id}" class="ss-input ss-select ss-status-select" data-row-id="${rowId}"
          data-col-id="${col.id}" data-row-idx="${rowIdx}">
        <option value="">—</option>
        ${['Todo','In Progress','Done'].map(s => `<option value="${s}" ${v === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>`;

    case 'number':
    case 'price':
      return `<input type="number" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}"
        step="${col.type === 'price' ? '0.01' : '1'}" min="0" />`;

    case 'date':
      return `<input type="date" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}" />`;

    default:
      return `<input type="text" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}"
        placeholder="…" />`;
  }
}

function _buildReadonlyCell(value, col) {
  const v = value ?? '';
  if (v === '' || v === null || v === undefined) return '<span style="color:var(--text-disabled)">—</span>';
  switch (col.type) {
    case 'checkbox': return v 
      ? `<span style="color:var(--accent-emerald);font-weight:700;display:inline-flex;align-items:center">${getSvgIcon('check', 12)}</span>` 
      : `<span style="color:var(--text-disabled);font-size:14px;font-family:sans-serif;user-select:none">☐</span>`;
    case 'price':    return `<strong>$${Number(v).toFixed(2)}</strong>`;
    case 'date':     return `<span style="font-size:12px;font-family:var(--font-mono)">${v}</span>`;
    case 'tags':     return String(v).split(',').map(t => `<span class="badge badge-purple" style="margin-right:2px">${t.trim()}</span>`).join('');
    case 'status': {
      const cls = v === 'Done' ? 'badge-success' : v === 'In Progress' ? 'badge-warning' : 'badge-muted';
      return `<span class="badge ${cls}">${v}</span>`;
    }
    case 'dropdown': return `<span class="badge badge-info">${v}</span>`;
    default:         return `<span>${v}</span>`;
  }
}

// ─── GRID EVENT ATTACHMENT ─────────────────────────────────────────────────────
function _attachGridEvents(cols, canEdit, user) {
  const tbody = document.getElementById('ss-tbody');
  if (!tbody) return;

  // Event delegation for all ss-input changes
  tbody.addEventListener('change', e => {
    const inp = e.target.closest('.ss-input');
    if (!inp) return;
    const rowId   = inp.dataset.rowId;
    const colId   = inp.dataset.colId;
    const rowIdx  = parseInt(inp.dataset.rowIdx);

    if (inp.dataset.virtual === 'true' || !rowId) {
      // Click on virtual row → promote to real row
      _handleVirtualCellChange(inp, cols, canEdit, user);
      return;
    }
    _scheduleSave(rowId, rowIdx, cols, inp);
  });

  tbody.addEventListener('input', e => {
    const inp = e.target.closest('.ss-input[type="text"], .ss-input[type="number"], .ss-input[type="date"]');
    if (!inp || !inp.dataset.rowId) return;
    const rowIdx = parseInt(inp.dataset.rowIdx);
    _scheduleSave(inp.dataset.rowId, rowIdx, cols, inp);
  });

  // Virtual row — click activates it
  tbody.addEventListener('click', e => {
    const cell = e.target.closest('.ss-cell-virtual');
    if (!cell) return;
    const tr = cell.closest('tr');
    if (tr && tr.dataset.virtual) {
      _activateVirtualRow(tr, cols, canEdit, user);
    }
  });

  // Delete row
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('.ss-del-row');
    if (!btn) return;
    const rowId  = btn.dataset.rowId;
    const rowIdx = parseInt(btn.dataset.rowIdx);
    _deleteRow(rowId, rowIdx, cols, canEdit, user);
  });

  // Emit row_lock over WebSocket on focusin
  tbody.addEventListener('focusin', e => {
    const inp = e.target.closest('.ss-input');
    if (!inp) return;
    const rowId = inp.dataset.rowId;
    if (!rowId || inp.dataset.virtual === 'true') return;

    sendWebSocketMessage({
      event: 'row_lock',
      tableId: _activeTableId,
      rowId: rowId,
      userName: user.name
    });
  });

  // Emit row_unlock over WebSocket on focusout
  tbody.addEventListener('focusout', e => {
    const inp = e.target.closest('.ss-input');
    if (!inp) return;
    const rowId = inp.dataset.rowId;
    if (!rowId || inp.dataset.virtual === 'true') return;

    sendWebSocketMessage({
      event: 'row_unlock',
      tableId: _activeTableId,
      rowId: rowId,
      userName: user.name
    });
  });
}

// ─── VIRTUAL ROW ACTIVATION ───────────────────────────────────────────────────
function _activateVirtualRow(tr, cols, canEdit, user) {
  tr.dataset.virtual = '';
  tr.classList.remove('ss-row-virtual');

  // Replace placeholders with actual inputs (but no row id yet)
  const idx = parseInt(tr.dataset.rowIdx);
  cols.forEach(col => {
    const td = tr.querySelector(`td[data-col="${col.id}"]`);
    if (!td) return;
    td.innerHTML = _buildEditableCell('', col, '__new__', idx).replace(
      /data-row-id="__new__"/g, `data-row-id="" data-virtual="true"`
    );
    td.dataset.virtual = 'true';
  });

  // Replace actions cell
  const actionsTd = tr.querySelector('.ss-td-actions');
  if (actionsTd && canEdit) {
    actionsTd.innerHTML = '';
  }

  // Auto-focus first input
  const firstInput = tr.querySelector('.ss-input');
  firstInput?.focus();
}

async function _saveNewVirtualRow(tr, cols, canEdit, user) {
  const rowData = _collectRowData(tr, cols);
  const isBlank = Object.values(rowData).every(v => v === '' || v === null || v === undefined);
  if (isBlank) return;

  _showSavingIndicator(true);
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`, {
    method: 'POST',
    body: JSON.stringify(rowData)
  });
  _showSavingIndicator(false);

  if (res?.success && res.data) {
    _rows.push(res.data);
    const idx = _rows.length - 1;
    // Replace virtual row with real row
    tr.outerHTML = _buildRow(res.data, idx, cols, canEdit, user, true);
    _updateRowCount();
    // Refresh grid event bindings
    _attachGridEvents(cols, canEdit, user);
    showToast('Row saved', '', 'success');
  } else {
    showToast('Save failed', res?.error || 'Check field values', 'error');
  }
}

// ─── AUTO-SAVE ─────────────────────────────────────────────────────────────────
function _scheduleSave(rowId, rowIdx, cols, triggerInput) {
  const key = `${rowId}`;
  if (!_debounceSavers.has(key)) {
    _debounceSavers.set(key, debounce(async () => {
      await _saveRow(rowId, rowIdx, cols);
    }, SAVE_DEBOUNCE));
  }
  _debounceSavers.get(key)();
  _showSavingIndicator(true);
}

async function _saveRow(rowId, rowIdx, cols) {
  if (_savingRows.has(rowId)) return;
  _savingRows.add(rowId);

  // Find the row's <tr> in DOM
  const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
  if (!tr) { _savingRows.delete(rowId); return; }

  const rowData = _collectRowData(tr, cols);

  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows/${rowId}`, {
    method: 'PUT',
    body: JSON.stringify(rowData)
  });

  _savingRows.delete(rowId);
  _showSavingIndicator(false);

  if (res?.success && res.data) {
    // Optimistic update — update local array
    const localIdx = _rows.findIndex(r => r.id === rowId);
    if (localIdx !== -1) _rows[localIdx] = res.data;
  } else {
    showToast('Save error', res?.error || 'Row could not be saved', 'error');
  }
}

function _collectRowData(tr, cols) {
  const data = {};
  cols.forEach(col => {
    const inp = tr.querySelector(`[data-col-id="${col.id}"]`);
    if (!inp) { data[col.id] = null; return; }

    if (col.type === 'checkbox') {
      data[col.id] = inp.checked;
    } else if (col.type === 'number' || col.type === 'price') {
      const num = parseFloat(inp.value);
      data[col.id] = isNaN(num) ? null : num;
    } else {
      data[col.id] = inp.value === '' ? null : inp.value;
    }
  });
  return data;
}

function _appendVirtualRow(cols, canEdit, user) {
  const tbody = document.getElementById('ss-tbody');
  if (!tbody) return;
  const firstVirtual = tbody.querySelector('tr.ss-row-virtual');
  if (firstVirtual) {
    _activateVirtualRow(firstVirtual, cols, canEdit, user);
  }
}

// ─── DELETE ROW ───────────────────────────────────────────────────────────────
async function _deleteRow(rowId, rowIdx, cols, canEdit, user) {
  const ok = await confirm('Delete this row permanently?', 'Delete Row');
  if (!ok) return;

  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows/${rowId}`, { method: 'DELETE' });
  if (res?.success) {
    _rows = _rows.filter(r => r.id !== rowId);
    const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
    tr?.remove();
    _updateRowCount();
    showToast('Row deleted', '', 'success');
  } else {
    showToast('Delete failed', res?.error || 'Could not delete row', 'error');
  }
}

function _updateRowCount() {
  const el = document.getElementById('ss-row-count');
  if (el) el.textContent = `${_rows.length} rows`;
}

// ─── SAVE INDICATOR ───────────────────────────────────────────────────────────
let _saveIndicatorTimer = null;
function _showSavingIndicator(on) {
  const el = document.getElementById('ss-save-indicator');
  if (!el) return;
  clearTimeout(_saveIndicatorTimer);
  el.style.display = on ? 'flex' : 'none';
  if (!on) return;
  // Auto-hide after 3s if nothing else triggers
  _saveIndicatorTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ─── REALTIME COLLABORATION ────────────────────────────────────────────────────
function _subscribeToTableEvents() {
  // Listen on the global ws created in store.js via a CustomEvent bridge
  // We add a handler on the window for the custom event dispatched from store.js WS onmessage
  window.removeEventListener('wareops_ws_event', _handleWsEvent);
  window.addEventListener('wareops_ws_event', _handleWsEvent);
}

function _handleWsEvent(e) {
  const user = getCurrentUser();
  if (!user) {
    window.removeEventListener('wareops_ws_event', _handleWsEvent);
    return;
  }
  const payload = e.detail;
  if (!payload || !payload.type || !_activeTableId) return;

  const { type, data } = payload;
  if (!data?.tableId || data.tableId !== _activeTableId) return;

  const userId = String(user.id || user._id || '');
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role);

  switch (type) {
    case 'table_page_created': {
      if (data.tableId === _activeTableId) {
        _schema.pages = data.pages;
        _renderPageTabs(canEdit);
        _showCollabToast(`Page ${data.pageNumber} was added to this table`);
      }
      break;
    }
    case 'table_row_created': {
      // Another user added a row — refresh rows from server
      if (data.actorId !== userId) {
        _refreshRowsFromServer();
        _showCollabToast(`${data.actorName} added a new row`);
      }
      break;
    }
    case 'table_row_updated': {
      if (data.actorId !== userId && data.row) {
        _applyRemoteRowUpdate(data.row);
        _showCollabToast(`${data.actorName} updated row`);
      }
      break;
    }
    case 'table_row_deleted': {
      if (data.actorId !== userId && data.rowId) {
        _applyRemoteRowDelete(data.rowId);
        _showCollabToast(`${data.actorName} deleted a row`);
      }
      break;
    }
    case 'row_lock': {
      if (data.userId !== userId) {
        _lockedRows.set(data.rowId, { userId: data.userId, userName: data.userName });
        _applyRowLockStatus(data.rowId, true, data.userName);
      }
      break;
    }
    case 'row_unlock': {
      if (data.userId !== userId) {
        _lockedRows.delete(data.rowId);
        _applyRowLockStatus(data.rowId, false);
      }
      break;
    }
    case 'table_rows_imported': {
      if (data.actorId !== userId) {
        if (data.page === _activePage) {
          _refreshRowsFromServer();
        }
        _showCollabToast(`${data.actorName} imported ${data.inserted} rows to Page ${data.page || 1}`);
      }
      break;
    }
    case 'table_schema_updated':
    case 'table_schema_deleted': {
      if (data.tableId === _activeTableId) {
        showToast('Schema changed', 'The table structure was updated. Refreshing…', 'warning');
        setTimeout(() => renderTables(), 1500);
      }
      break;
    }
  }
}

function _showCollabToast(msg) {
  showToast('👥 Collaboration', msg, 'info', 3000);
}

async function _refreshRowsFromServer() {
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`);
  if (!res?.success) return;
  _rows = res.data || [];
  _updateRowCount();

  const cols   = _schema?.columns || [];
  const user   = getCurrentUser();
  const canEdit = ['super_admin','admin','manager','staff'].includes(user.role);
  const tbody  = document.getElementById('ss-tbody');
  if (tbody) {
    tbody.innerHTML = _buildAllRows(cols, canEdit, user);
    _attachGridEvents(cols, canEdit, user);
  }
}

function _applyRemoteRowUpdate(updatedRow) {
  const idx = _rows.findIndex(r => r.id === updatedRow.id);
  if (idx === -1) return;
  _rows[idx] = updatedRow;

  const tr = document.querySelector(`tr[data-row-id="${updatedRow.id}"]`);
  if (!tr) return;

  const cols = _schema?.columns || [];
  cols.forEach(col => {
    const td   = tr.querySelector(`td[data-col="${col.id}"]`);
    const inp  = td?.querySelector('.ss-input');
    if (!inp) return;
    const val  = updatedRow[col.id] ?? '';
    if (col.type === 'checkbox') {
      inp.checked = Boolean(val);
    } else {
      inp.value = val;
    }
    // Flash highlight
    td?.classList.add('ss-cell-updated');
    setTimeout(() => td?.classList.remove('ss-cell-updated'), 1000);
  });
}

function _applyRemoteRowDelete(rowId) {
  _rows = _rows.filter(r => r.id !== rowId);
  const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
  tr?.remove();
  _updateRowCount();
}

function _applyRowLockStatus(rowId, isLocked, userName = '') {
  const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
  if (!tr) return;

  if (isLocked) {
    tr.classList.add('ss-row-locked');
    const rowNumTd = tr.querySelector('.ss-td-row-num');
    if (rowNumTd) {
      rowNumTd.innerHTML = `<span class="ss-lock-indicator" style="cursor:help;display:inline-flex;align-items:center;color:var(--brand-500)" title="${userName} is editing">${getSvgIcon('edit', 12)}</span>`;
    }
    // Set all cells to readonly for other users
    tr.querySelectorAll('.ss-cell').forEach(cell => {
      cell.dataset.readonly = 'true';
      const inp = cell.querySelector('.ss-input');
      if (inp) {
        inp.disabled = true;
      }
    });
  } else {
    tr.classList.remove('ss-row-locked');
    const rowIdx = parseInt(tr.dataset.rowIdx);
    const rowNumTd = tr.querySelector('.ss-td-row-num');
    if (rowNumTd) {
      rowNumTd.innerHTML = `<span class="ss-row-num">${rowIdx + 1}</span>`;
    }
    // Set cells back to editable if canEdit
    const user = getCurrentUser();
    const canEdit = ['super_admin','admin','manager','staff'].includes(user.role);
    tr.querySelectorAll('.ss-cell').forEach(cell => {
      if (canEdit) {
        delete cell.dataset.readonly;
        const inp = cell.querySelector('.ss-input');
        if (inp) {
          inp.disabled = false;
        }
      }
    });
  }
}

async function _promoteAndSaveVirtualRow(tr, cols, canEdit, user, changedInput) {
  const rowData = _collectRowData(tr, cols);
  const isBlank = Object.values(rowData).every(v => v === '' || v === null || v === undefined);
  if (isBlank) return;

  _showSavingIndicator(true);
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`, {
    method: 'POST',
    body: JSON.stringify(rowData)
  });
  _showSavingIndicator(false);

  if (res?.success && res.data) {
    _rows.push(res.data);
    const idx = _rows.length - 1;
    
    // Replace virtual row with real row in DOM
    const newTrHtml = _buildRow(res.data, idx, cols, canEdit, user, true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = `<table><tbody>${newTrHtml}</tbody></table>`;
    const newTr = tempDiv.querySelector('tr');
    tr.replaceWith(newTr);
    
    _updateRowCount();
    
    // Broadcast creation event to other collaborators
    sendWebSocketMessage({
      event: 'table_row_created',
      tableId: _activeTableId,
      rowId: res.data.id
    });
    
    // Re-attach grid events
    _attachGridEvents(cols, canEdit, user);
    
    // Restore focus to the edited cell in the new real row
    if (changedInput) {
      const colId = changedInput.dataset.colId;
      const targetInput = newTr.querySelector(`[data-col-id="${colId}"]`);
      if (targetInput) {
        targetInput.focus();
        if (targetInput.type === 'text') {
          const val = targetInput.value;
          targetInput.value = '';
          targetInput.value = val;
        }
      }
    }
    showToast('Row created', '', 'success');
  } else {
    showToast('Save failed', res?.error || 'Check field values', 'error');
  }
}

function _handleVirtualCellChange(inp, cols, canEdit, user) {
  const tr = inp.closest('tr');
  if (!tr) return;
  _promoteAndSaveVirtualRow(tr, cols, canEdit, user, inp);
}

// ─── CSV EXPORT ────────────────────────────────────────────────────────────────
function _exportCSV() {
  const cols = _schema?.columns || [];
  if (!cols.length || !_rows.length) {
    showToast('Nothing to export', 'No data rows in this table', 'warning');
    return;
  }

  const header = cols.map(c => `"${c.name}"`).join(',');
  const body   = _rows.map(row =>
    cols.map(col => {
      const v = row[col.id] ?? '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',')
  ).join('\n');

  const csv  = header + '\n' + body;
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${_schema.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);

  showToast('Export complete', `${_rows.length} rows exported as CSV`, 'success');
  const user = getCurrentUser();
  if (user) {
    addAuditLog('export', `Exported spreadsheet table '${_schema.name}' as CSV (${_rows.length} rows)`, user.id);
  }
}

// ─── CSV IMPORT ────────────────────────────────────────────────────────────────
async function _handleCSVImport(e, cols) {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = '';

  const text   = await file.text();
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    showToast('Import error', 'CSV must have a header row and at least one data row', 'error');
    return;
  }

  // Parse header → match to columns by name (case-insensitive)
  const headerNames = _parseCSVLine(lines[0]);
  const colMap = {};    // csvColIdx → colId
  headerNames.forEach((name, idx) => {
    const col = cols.find(c => c.name.toLowerCase() === name.toLowerCase().trim());
    if (col) colMap[idx] = col;
  });

  const rowsData = [];
  for (let i = 1; i < lines.length; i++) {
    const values = _parseCSVLine(lines[i]);
    const rowObj = {};
    Object.entries(colMap).forEach(([idx, col]) => {
      let val = (values[idx] || '').trim();
      if (col.type === 'number' || col.type === 'price') {
        val = parseFloat(val);
        if (isNaN(val)) val = null;
      } else if (col.type === 'checkbox') {
        val = val.toLowerCase() === 'true' || val === '1';
      } else if (col.type === 'dropdown') {
        // Normalize dropdown value
        const opts = _parseOptions(col.options);
        const matched = opts.find(o => o.toLowerCase() === val.toLowerCase());
        val = matched || null;
      }
      rowObj[col.id] = val;
    });
    rowsData.push(rowObj);
  }

  if (!rowsData.length) {
    showToast('No valid rows', 'CSV contained no parseable data rows', 'warning');
    return;
  }

  _showSavingIndicator(true);
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows/import?page=${_activePage}`, {
    method: 'POST',
    body: JSON.stringify(rowsData)
  });
  _showSavingIndicator(false);

  if (res?.success) {
    showToast('Import complete', `${res.data?.inserted} rows imported. ${res.data?.errors?.length || 0} errors.`, 'success');
    await _refreshRowsFromServer();
  } else {
    showToast('Import failed', res?.error || 'Server error during import', 'error');
  }
}

function _parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuote  = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      result.push(current); current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

// ─── SCHEMA MODAL (Create / Edit Table) ──────────────────────────────────────
function _showSchemaModal(schema, whs) {
  const isEdit = !!schema;
  let columns  = isEdit ? [...(schema.columns || [])] : [];
  let selectedColor = schema?.headerColor || '#6366f1';

  const body = document.createElement('div');
  body.innerHTML = `
    <form id="tbl-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Table Name <span class="req">*</span></label>
          <input type="text" id="t-name" class="form-control" value="${schema?.name||''}" required placeholder="e.g. Operations Tracker" />
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="t-cat" class="form-control">
            ${CATEGORY_OPTS.map(c=>`<option value="${c}" ${schema?.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input type="text" id="t-desc" class="form-control" value="${schema?.description||''}" placeholder="Brief description" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Assign to Warehouse</label>
          <select id="t-wh" class="form-control">
            <option value="">All warehouses</option>
            ${whs.map(w=>`<option value="${w.id}" ${schema?.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Access Roles</label>
          <div style="display:flex;gap:16px;flex-wrap:wrap;background:var(--bg-input);border:1px solid var(--border-default);border-radius:8px;padding:10px 14px;align-items:center;height:44px">
            ${['admin','manager','staff','employee'].map(r=>`
              <label class="checkbox-group" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0">
                <input type="checkbox" class="role-checkbox" value="${r}" ${(schema?.roles||[]).includes(r)?'checked':''} />
                <span style="font-size:13px">${capitalize(r)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Header Color</label>
        <div class="color-picker-row" id="color-picker">
          ${HEADER_COLORS.map(c=>`<div class="color-swatch ${c===selectedColor?'selected':''}" style="background:${c}" data-color="${c}"></div>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Columns <span class="req">*</span></label>
        <div id="columns-list" style="display:flex;flex-direction:column;gap:8px">
          ${columns.map((c,i)=>_renderColumnRow(c,i)).join('')}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="add-col-btn" style="margin-top:10px">+ Add Column</button>
      </div>
    </form>
  `;

  body.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      body.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  });

  body.querySelector('#add-col-btn')?.addEventListener('click', () => {
    const id = 'c' + Date.now();
    columns.push({ id, name: '', type: 'text', required: false, options: '' });
    const colList = body.querySelector('#columns-list');
    const div = document.createElement('div');
    div.innerHTML = _renderColumnRow(columns[columns.length-1], columns.length-1);
    while (div.firstChild) colList.appendChild(div.firstChild);
    // Attach dropdown toggle for new col
    _attachColumnTypeToggle(colList.lastElementChild);
  });

  // Attach type toggles to existing cols
  body.querySelectorAll('.col-row').forEach(row => _attachColumnTypeToggle(row));

  const footer = `
    <button class="btn btn-secondary" id="t-cancel">Cancel</button>
    <button class="btn btn-primary" id="t-save">${isEdit?'Update':'Create'} Table</button>
  `;

  const modal = createModal({ title: isEdit?'Edit Table':'Build New Table', body, footer, size: 'lg' });
  modal.el.querySelector('#t-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#t-save')?.addEventListener('click', async () => {
    const name = document.getElementById('t-name').value.trim();
    if (!name) { showToast('Validation', 'Table name is required', 'warning'); return; }

    const colEls = body.querySelectorAll('.col-row');
    const cols   = Array.from(colEls).map((row) => {
      const colId     = row.dataset.colId;
      const typeEl    = row.querySelector('.col-type');
      const optEl     = row.querySelector('.col-options');
      const rawOpts   = optEl?.value || '';
      const normOpts  = rawOpts.split(',').map(o => o.trim()).filter(Boolean).join(',');
      return {
        id:       colId || 'c' + Date.now(),
        name:     row.querySelector('.col-name').value.trim() || 'Column',
        type:     typeEl?.value || 'text',
        required: row.querySelector('.col-req').checked,
        options:  normOpts
      };
    }).filter(c => c.name);

    const roles = Array.from(body.querySelectorAll('.role-checkbox:checked')).map(cb => cb.value);
    const data  = {
      name,
      category:    document.getElementById('t-cat').value,
      description: document.getElementById('t-desc').value,
      warehouseId: document.getElementById('t-wh').value || null,
      columns:     cols,
      roles,
      headerColor: selectedColor
    };

    let res;
    if (isEdit) {
      res = await apiFetch(`/dynamic-tables/${schema.id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      res = await apiFetch('/dynamic-tables/', { method: 'POST', body: JSON.stringify(data) });
    }

    if (res?.success) {
      showToast(isEdit ? 'Table updated' : 'Table created', name, 'success');
      modal.close();
      if (_activeTableId) {
        // Re-open the updated schema
        await renderTables();
      } else {
        await renderTables();
      }
    } else {
      showToast('Error', res?.error || 'Could not save table', 'error');
    }
  });
}

function _renderColumnRow(col, i) {
  const isDropdown = col.type === 'dropdown';
  return `
    <div class="col-row" data-col-id="${col.id}" style="display:grid;grid-template-columns:1fr 140px auto auto auto;gap:8px;align-items:start;background:var(--bg-input);border:1px solid var(--border-default);border-radius:8px;padding:10px">
      <input type="text" class="col-name form-control" value="${col.name||''}" placeholder="Column name" style="margin:0" />
      <select class="col-type form-control" style="margin:0">
        ${COLUMN_TYPES.map(t=>`<option value="${t}" ${col.type===t?'selected':''}>${capitalize(t)}</option>`).join('')}
      </select>
      <label class="checkbox-group" style="white-space:nowrap;margin-top:8px">
        <input type="checkbox" class="col-req" ${col.required?'checked':''} />
        <label style="font-size:12px">Req.</label>
      </label>
      <button type="button" class="action-btn delete" title="Remove" onclick="this.closest('.col-row').remove()">${getSvgIcon('trash', 12)}</button>
      <div class="col-options-wrap" style="grid-column:1/-1;display:${isDropdown?'block':'none'}">
        <input type="text" class="col-options form-control" value="${col.options||''}"
          placeholder="Dropdown options (comma separated: Yes, No, Pending)" style="margin-top:6px" />
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Enter values separated by commas. Spaces around commas are automatically trimmed.</div>
      </div>
    </div>
  `;
}

function _attachColumnTypeToggle(colRow) {
  const typeEl = colRow?.querySelector('.col-type');
  const optWrap = colRow?.querySelector('.col-options-wrap');
  if (!typeEl || !optWrap) return;
  typeEl.addEventListener('change', () => {
    optWrap.style.display = typeEl.value === 'dropdown' ? 'block' : 'none';
  });
}

// ─── UTILITIES ─────────────────────────────────────────────────────────────────
function _parseOptions(rawOpts) {
  if (!rawOpts) return [];
  return rawOpts.split(',').map(o => o.trim()).filter(Boolean);
}

function _colTypeIcon(type) {
  const icons = {
    text: `<span style="font-family:serif;font-weight:bold;font-size:12px">T</span>`, 
    number: '<span style="font-weight:bold;font-size:11px">#</span>', 
    price: '<span style="font-weight:bold;font-size:12px">$</span>', 
    date: getSvgIcon('clock', 12),
    checkbox: getSvgIcon('check', 12), 
    dropdown: getSvgIcon('chevron_down', 12), 
    status: getSvgIcon('info', 12), 
    tags: getSvgIcon('palette', 12)
  };
  return icons[type] || `<span style="font-family:serif;font-weight:bold;font-size:12px">T</span>`;
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
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
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
          <h1 class="page-title">Billing & Taxation</h1>
          <p class="page-subtitle">Automated bill generation with tax computation</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          <button class="btn btn-primary" id="new-bill-btn">+ New Bill</button>
        </div>
      </div>

      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:14px 20px;margin-bottom:24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <span style="color:var(--accent-amber);display:flex;align-items:center">${getSvgIcon('settings', 20)}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary)">Enterprise Tax Engine</div>
          <div style="font-size:12px;color:var(--text-muted)">
            ${(() => {
              const cfg = getTaxConfig();
              if (cfg.taxes && cfg.taxes.length > 0) {
                return cfg.taxes.map(t => `${t.name}: ${t.taxType === 'percentage' ? t.rate + '%' : '$' + t.rate} (${t.taxType})`).join(' &nbsp;|&nbsp; ');
              }
              return `Normal: ${cfg.normal || 5}% &nbsp;|&nbsp; Luxury: ${cfg.luxury || 15}%`;
            })()}
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:20px;flex-wrap:wrap">
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--accent-emerald)">${formatCurrency(totalRev)}</div><div style="font-size:11px;color:var(--text-muted)">Total Revenue</div></div>
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--accent-amber)">${formatCurrency(totalTax)}</div><div style="font-size:11px;color:var(--text-muted)">Total Tax</div></div>
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--text-primary)">${bills.length}</div><div style="font-size:11px;color:var(--text-muted)">Invoices</div></div>
        </div>
      </div>

      <div class="table-toolbar">
        <div class="table-search"><span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span><input type="text" id="bill-search" placeholder="Search bills, customers..." /></div>
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
  
  // Realtime WebSocket auto-refresh for invoices
  window.removeEventListener('wareops_ws_event', _handleBillingWsEvent);
  window.addEventListener('wareops_ws_event', _handleBillingWsEvent);
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
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px"><div style="font-size:40px;margin-bottom:16px;opacity:0.4;display:flex;justify-content:center;color:var(--text-muted)">${getSvgIcon('billing', 42)}</div><h3 style="color:var(--text-secondary)">No bills found</h3><p style="color:var(--text-muted);margin-bottom:20px">Generate your first invoice</p><button class="btn btn-primary" onclick="document.getElementById('new-bill-btn').click()">+ New Bill</button></div>`;
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
                  <button class="action-btn view" data-bid="${b.id}" title="View Bill" style="display:inline-flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                  <button class="action-btn" data-print="${b.id}" title="Print Invoice" style="display:inline-flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
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
  const body = document.createElement('div');
  body.style.width = '100%';

  let selectedCategory = '';
  let highlightedIndex = -1;
  let filteredItems = [];
  let searchTimeout = null;

  function renderBillBody() {
    const savedCustomer = body.querySelector('#bill-customer')?.value || '';
    const savedWh = body.querySelector('#bill-wh')?.value || '';
    const warehouseId = savedWh || whs[0]?.id;
    const wh = whs.find(w => w.id === warehouseId);
    
    const whEmail = wh?.email || '';
    const whContact = wh?.contact || '';
    const gstinFallback = whEmail ? `27${whEmail.toUpperCase().slice(0,3)}C${whContact.slice(-4) || '1234'}F1Z5` : '27AAPCW1234F1Z5';

    // Retrieve input values to preserve them across redrawing
    const savedSellerAddress = body.querySelector('#bill-seller-address')?.value || wh?.address || 'Primary Logistics Hub';
    const savedSellerContact = body.querySelector('#bill-seller-contact')?.value || wh?.contact || 'Contact Office';
    const savedSellerTax = body.querySelector('#bill-seller-tax')?.value || wh?.taxNumber || wh?.gstin || gstinFallback;
    const savedBuyerBilling = body.querySelector('#bill-buyer-billing')?.value || '';
    const savedBuyerShipping = body.querySelector('#bill-buyer-shipping')?.value || '';
    const savedPhone = body.querySelector('#bill-customer-phone')?.value || '';
    const savedEmail = body.querySelector('#bill-customer-email')?.value || '';

    // Check if custom tax preference is unconfigured
    const isCustomUnconfigured = wh && wh.taxPreference === 'custom' && (!wh.taxConfig || Object.keys(wh.taxConfig).length === 0);
    const items = getItems(warehouseId);
    
    // Calculate totals using dynamic tax engine
    const calculation = calculateTaxesFrontend(billItems, warehouseId);

    // Track stock validation
    let hasStockError = false;

    body.innerHTML = `
      <div style="display:flex; gap:24px; min-height:550px; flex-wrap:wrap; width:100%;">
        <!-- Left Column: Interactive Checkout Desk -->
        <div style="flex:1.2; min-width:320px; display:flex; flex-direction:column; gap:16px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600;">Customer Name <span class="req">*</span></label>
              <input type="text" id="bill-customer" class="form-control" placeholder="Customer name" value="${savedCustomer}" />
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600;">Warehouse Hub</label>
              <select id="bill-wh" class="form-control">
                ${whs.map(w=>`<option value="${w.id}" ${warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Seller and Buyer Information Grid -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:var(--bg-input); border-radius:12px; padding:16px; border:1px solid var(--border-default);">
            <div style="grid-column: span 2; font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border-subtle); padding-bottom:4px; display:flex; align-items:center; gap:6px;">${getSvgIcon('warehouses', 14)} Seller (Issuer) Details</div>
            <div class="form-group" style="margin:0; grid-column: span 2;">
              <label class="form-label" style="font-weight:600; font-size:11px;">Seller Address</label>
              <input type="text" id="bill-seller-address" class="form-control" style="font-size:12px; padding:6px 10px;" placeholder="Seller address" value="${savedSellerAddress}" />
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Seller Contact</label>
              <input type="text" id="bill-seller-contact" class="form-control" style="font-size:12px; padding:6px 10px;" placeholder="Seller contact" value="${savedSellerContact}" />
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Seller GST/VAT Number</label>
              <input type="text" id="bill-seller-tax" class="form-control" style="font-size:12px; padding:6px 10px;" placeholder="GSTIN / VAT ID" value="${savedSellerTax}" />
            </div>

            <div style="grid-column: span 2; font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border-subtle); padding-bottom:4px; margin-top:8px; display:flex; align-items:center; gap:6px;">${getSvgIcon('user', 14)} Buyer Billing & Contact</div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Customer Phone</label>
              <input type="text" id="bill-customer-phone" class="form-control" style="font-size:12px; padding:6px 10px;" placeholder="Phone" value="${savedPhone}" />
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Customer Email</label>
              <input type="email" id="bill-customer-email" class="form-control" style="font-size:12px; padding:6px 10px;" placeholder="Email" value="${savedEmail}" />
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Buyer Billing Address</label>
              <textarea id="bill-buyer-billing" class="form-control" style="font-size:12px; padding:6px 10px; height:50px; resize:none;" placeholder="Billing Address">${savedBuyerBilling}</textarea>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600; font-size:11px;">Buyer Shipping Address</label>
              <textarea id="bill-buyer-shipping" class="form-control" style="font-size:12px; padding:6px 10px; height:50px; resize:none;" placeholder="Shipping Address">${savedBuyerShipping}</textarea>
            </div>
          </div>

          <div style="background:var(--bg-input); border-radius:12px; padding:16px; border:1px solid var(--border-default);">
            <div style="font-size:13px; font-weight:700; margin-bottom:12px; color:var(--text-secondary); display:flex; justify-content:space-between; align-items:center;">
              <span style="display:flex;align-items:center;gap:6px">${getSvgIcon('items', 14)} Add Items Catalog</span>
              <span style="font-size:11px; color:var(--text-muted);">Barcode Ready</span>
            </div>
            
            ${isCustomUnconfigured ? `
              <div style="color:var(--accent-rose); font-size:12px; font-weight:600; padding:10px; background:rgba(244,63,94,0.08); border:1px solid rgba(244,63,94,0.2); border-radius:8px; display:flex; align-items:flex-start; gap:8px">
                <span style="color:var(--accent-rose); flex-shrink:0; margin-top:2px">${getSvgIcon('warning', 16)}</span>
                <span>Custom Tax Config Required: Please configure tax rates in settings for this warehouse before creating invoices.</span>
              </div>
            ` : `
              <div style="position:relative;">
                <div style="display:flex; gap:8px; align-items:center;">
                  <div style="position:relative; flex-grow:1;">
                    <input type="text" id="sku-search-input" class="form-control" placeholder="Search name, SKU or scan barcode..." autocomplete="off" style="width:100%; padding-left:36px;" />
                    <span style="position:absolute; left:12px; top:12px; color:var(--text-muted); display:flex; align-items:center;">${getSvgIcon('search', 14)}</span>
                    
                    <!-- Floating Dropdown list -->
                    <div id="sku-dropdown-list" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg-card); border:1px solid var(--border-default); border-radius:8px; max-height:220px; overflow-y:auto; z-index:1000; box-shadow:var(--shadow-lg); margin-top:4px;"></div>
                  </div>
                  <div style="width:80px;">
                    <input type="number" id="item-qty" class="form-control" value="1" min="1" placeholder="Qty" />
                  </div>
                  <button class="btn btn-secondary btn-sm" id="add-item-btn" style="height:40px; padding:0 16px;">+ Add</button>
                </div>
                
                <!-- Category filtering pills -->
                <div id="category-filter-pills" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;"></div>
              </div>
            `}
          </div>

          <!-- Added Items Table -->
          <div id="bill-items-list" style="flex-grow:1; min-height:180px;">
            ${calculation.items.length === 0 ? `
              <div style="text-align:center; padding:40px 20px; color:var(--text-muted); font-size:13px; background:var(--bg-input); border-radius:12px; border:1px dashed var(--border-default); display:flex; flex-direction:column; align-items:center; justify-content:center;">
                <div style="margin-bottom:8px; color:var(--text-muted)">${getSvgIcon('billing', 28)}</div>
                <div>No items added to the workspace yet</div>
              </div>
            ` : `
              <div style="overflow-x:auto; border:1px solid var(--border-default); border-radius:10px;">
                <table style="width:100%; border-collapse:collapse; background:var(--bg-card);">
                  <thead>
                    <tr style="background:var(--bg-input); border-bottom:1px solid var(--border-default);">
                      <th style="padding:10px 8px; text-align:left; font-size:11px; color:var(--text-muted); font-weight:700;">ITEM</th>
                      <th style="padding:10px 8px; text-align:center; font-size:11px; color:var(--text-muted); font-weight:700; width:90px;">QTY</th>
                      <th style="padding:10px 8px; text-align:right; font-size:11px; color:var(--text-muted); font-weight:700;">UNIT</th>
                      <th style="padding:10px 8px; text-align:right; font-size:11px; color:var(--text-muted); font-weight:700;">TAX RATE</th>
                      <th style="padding:10px 8px; text-align:right; font-size:11px; color:var(--text-muted); font-weight:700;">TOTAL</th>
                      <th style="width:36px; padding:8px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${calculation.items.map((bi, i) => {
                      const catalogItem = items.find(item => item.id === bi.id);
                      const availableStock = catalogItem ? catalogItem.stock : 0;
                      const isOverStock = bi.qty > availableStock;
                      
                      if (isOverStock) hasStockError = true;
                      
                      const taxRateText = bi.taxes ? bi.taxes.map(t => `${t.name}: ${t.taxType === 'percentage' ? (t.rate * 100).toFixed(0) + '%' : '$' + t.rate}`).join(', ') : (bi.taxRate * 100).toFixed(0) + '%';
                      
                      return `
                        <tr style="border-bottom:1px solid var(--border-subtle); background:${isOverStock ? 'rgba(244,63,94,0.03)' : 'transparent'};">
                          <td style="padding:10px 8px; font-size:13px;">
                            <div style="font-weight:700;">${bi.name}</div>
                            <div style="font-size:10px; color:${isOverStock ? 'var(--accent-rose)' : 'var(--text-muted)'}; margin-top:2px;">
                              ${isOverStock ? `<span style="display:inline-flex;align-items:center;gap:4px;color:var(--accent-rose)">${getSvgIcon('warning', 12)} Out of Stock (Available: ${availableStock})</span>` : `Available Stock: ${availableStock}`}
                            </div>
                          </td>
                          <td style="padding:8px; text-align:center;">
                            <input type="number" class="form-control item-qty-edit-input" data-index="${i}" value="${bi.qty}" min="1" style="width:100%; text-align:center; padding:4px; font-size:13px; font-weight:600; border-color:${isOverStock ? 'var(--accent-rose)' : 'var(--border-default)'};" />
                          </td>
                          <td style="padding:10px 8px; text-align:right; font-size:13px;">${formatCurrency(bi.price)}</td>
                          <td style="padding:10px 8px; text-align:right; font-size:11px; color:var(--accent-amber); font-weight:500;">${taxRateText}</td>
                          <td style="padding:10px 8px; text-align:right; font-size:13px; font-weight:700;">${formatCurrency(bi.total)}</td>
                          <td style="padding:4px; text-align:center;">
                            <button class="action-btn delete" onclick="window._removeBillItem(${i})" style="padding:4px 8px;">${getSvgIcon('trash', 14)}</button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <!-- Workspace Totals Summary -->
          <div style="background:var(--bg-input); border-radius:12px; padding:16px; border:1px solid var(--border-default);">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
              <span style="color:var(--text-muted)">Subtotal</span>
              <span style="font-weight:600;">${formatCurrency(calculation.subtotal)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
              <span style="color:var(--accent-amber)">Total Tax</span>
              <span style="color:var(--accent-amber); font-weight:600; text-align:right;">
                ${formatCurrency(calculation.tax)}
                ${calculation.taxDetails && calculation.taxDetails.length > 0 ? `
                  <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">
                    (${calculation.taxDetails.map(t => `${t.name}: ${formatCurrency(t.amount)}`).join(', ')})
                  </div>
                ` : ''}
              </span>
            </div>
            <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border-default); padding-top:10px; margin-top:4px;">
              <span style="font-weight:700; font-size:15px;">Grand Total</span>
              <span style="font-weight:800; font-size:17px; color:var(--text-brand)">${formatCurrency(calculation.total)}</span>
            </div>
          </div>
        </div>

        <!-- Right Column: Live print preview canvas -->
        <div style="flex:1; min-width:320px; border-left:1px solid var(--border-default); padding-left:24px; display:flex; flex-direction:column;">
          <div style="font-size:13px; font-weight:700; color:var(--text-secondary); margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
            <span style="display:flex;align-items:center;gap:6px">${getSvgIcon('view', 14)} Live Invoice Canvas</span>
            <span class="badge badge-brand" style="font-size:10px;">A4 Format</span>
          </div>
          
          <div id="live-invoice-preview-container" style="background:var(--bg-card); border:1px solid var(--border-default); border-radius:12px; padding:16px; flex-grow:1; overflow-y:auto; max-height:580px; box-shadow:var(--shadow-sm);">
            <!-- Invoice preview rendered dynamically -->
          </div>
        </div>
      </div>
    `;

    // Render category filters
    renderCategoryPills(items, body.querySelector('#sku-search-input'));

    // Bind event selectors immediately
    bindEvents(warehouseId, items, hasStockError, calculation);

    // Render live preview on the right side
    renderLiveInvoicePreview(calculation, warehouseId, wh);
  }

  function renderSKUDropdown(searchTerm, items) {
    const listContainer = body.querySelector('#sku-dropdown-list');
    if (!listContainer) return;

    if (!searchTerm.trim() && !selectedCategory) {
      listContainer.style.display = 'none';
      return;
    }

    filteredItems = items.filter(i => {
      const matchSearch = !searchTerm.trim() || 
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchCat = !selectedCategory || i.category === selectedCategory;
      return matchSearch && matchCat;
    });

    if (filteredItems.length === 0) {
      listContainer.innerHTML = `
        <div style="padding:12px; text-align:center; color:var(--text-muted); font-size:12px;">
          No matching catalog items found
        </div>
      `;
      listContainer.style.display = 'block';
      highlightedIndex = -1;
      return;
    }

    listContainer.innerHTML = filteredItems.map((i, idx) => {
      const isLowStock = i.stock < 20;
      const isHighlighted = idx === highlightedIndex;
      return `
        <div class="sku-dropdown-item" data-id="${i.id}" data-index="${idx}" style="padding:10px 12px; cursor:pointer; border-bottom:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:space-between; transition:background 0.15s; background:${isHighlighted ? 'rgba(99,102,241,0.08)' : 'transparent'};">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="color:var(--text-secondary);display:flex;align-items:center">${getSvgIcon('items', 18)}</span>
            <div>
              <div style="font-size:13px; font-weight:700; color:var(--text-primary);">${i.name}</div>
              <div style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">SKU: ${i.sku} · Cat: ${i.category}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px; font-weight:700; color:var(--text-brand);">${formatCurrency(i.price)}</div>
            <div style="font-size:11px; color:${isLowStock ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; font-weight:600;">
              ${isLowStock ? `<span style="display:inline-flex;align-items:center;gap:3px;color:var(--accent-rose)">${getSvgIcon('warning', 10)} Low Stock: </span>` : 'Stock: '}${i.stock} units
            </div>
          </div>
        </div>
      `;
    }).join('');

    listContainer.style.display = 'block';

    // Add click listeners to items
    listContainer.querySelectorAll('.sku-dropdown-item').forEach(itemEl => {
      itemEl.addEventListener('click', (e) => {
        const itemIdx = parseInt(itemEl.dataset.index);
        selectSKUItem(filteredItems[itemIdx]);
      });
      // Mouseover to update highlight
      itemEl.addEventListener('mouseenter', () => {
        highlightedIndex = parseInt(itemEl.dataset.index);
        updateDropdownHighlight();
      });
    });
  }

  function selectSKUItem(item) {
    const qty = parseInt(body.querySelector('#item-qty')?.value) || 1;
    addItemToBill(item, qty);
    
    // Reset search box
    const searchInput = body.querySelector('#sku-search-input');
    if (searchInput) searchInput.value = '';
    
    hideSKUDropdown();
  }

  function addItemToBill(item, qty) {
    // Check if item is already added to billItems. If so, increment the quantity!
    const existing = billItems.find(i => i.id === item.id);
    if (existing) {
      existing.qty += qty;
    } else {
      billItems.push({
        id: item.id,
        name: item.name,
        price: item.price,
        taxCategory: item.taxCategory || 'normal',
        qty
      });
    }
    renderBillBody();
  }

  function updateDropdownHighlight() {
    const listContainer = body.querySelector('#sku-dropdown-list');
    if (!listContainer) return;
    
    listContainer.querySelectorAll('.sku-dropdown-item').forEach((el, idx) => {
      if (idx === highlightedIndex) {
        el.style.background = 'rgba(99, 102, 241, 0.08)';
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        el.style.background = 'transparent';
      }
    });
  }

  function renderCategoryPills(items, searchInput) {
    const pillsContainer = body.querySelector('#category-filter-pills');
    if (!pillsContainer) return;

    const uniqueCategories = [...new Set(items.map(i => i.category))];
    pillsContainer.innerHTML = `
      <span class="badge ${selectedCategory === '' ? 'badge-brand' : 'badge-secondary'}" data-cat="" style="cursor:pointer; padding:6px 12px; font-size:11px; font-weight:600; border-radius:12px; transition:all 0.15s;">All</span>
      ${uniqueCategories.map(c => `
        <span class="badge ${selectedCategory === c ? 'badge-brand' : 'badge-secondary'}" data-cat="${c}" style="cursor:pointer; padding:6px 12px; font-size:11px; font-weight:600; border-radius:12px; transition:all 0.15s;">${c}</span>
      `).join('')}
    `;

    pillsContainer.querySelectorAll('.badge').forEach(pill => {
      pill.addEventListener('click', (e) => {
        selectedCategory = e.target.dataset.cat;
        renderCategoryPills(items, searchInput);
        renderSKUDropdown(searchInput?.value || '', items);
      });
    });
  }

  function renderLiveInvoicePreview(calculation, warehouseId, wh) {
    const previewContainer = body.querySelector('#live-invoice-preview-container');
    if (!previewContainer) return;

    const customerName = body.querySelector('#bill-customer')?.value.trim() || 'Valued Client';
    
    // Retrieve latest values from workspace form fields
    const sellerAddress = body.querySelector('#bill-seller-address')?.value || wh?.address || 'Primary Logistics Hub';
    const sellerContact = body.querySelector('#bill-seller-contact')?.value || wh?.contact || 'Contact Office';
    const sellerTax = body.querySelector('#bill-seller-tax')?.value || wh?.taxNumber || wh?.gstin || '';
    const buyerBilling = body.querySelector('#bill-buyer-billing')?.value || '';
    const buyerShipping = body.querySelector('#bill-buyer-shipping')?.value || '';
    const customerPhone = body.querySelector('#bill-customer-phone')?.value || '';
    const customerEmail = body.querySelector('#bill-customer-email')?.value || '';

    const mockBill = {
      billNo: "INV-DRAFT",
      customer: customerName,
      warehouseId: warehouseId,
      items: calculation.items.map(i => ({
        id: i.id,
        name: i.name,
        qty: i.qty,
        price: i.price,
        taxCategory: i.taxCategory || 'normal',
        taxRate: i.taxRate,
        taxes: i.taxes
      })),
      subtotal: calculation.subtotal,
      tax: calculation.tax,
      total: calculation.total,
      taxConfigSnapshot: getTaxConfig(warehouseId),
      taxDetails: calculation.taxDetails,
      createdAt: new Date().toISOString(),
      
      // Extended fields
      sellerAddress,
      sellerContact,
      sellerTaxNumber: sellerTax,
      buyerBillingAddress: buyerBilling,
      buyerShippingAddress: buyerShipping,
      customerPhone,
      customerEmail,
      employeeName: getCurrentUser()?.name || "System Creator",
      employeeRole: getCurrentUser()?.role || "Staff"
    };

    previewContainer.innerHTML = buildInvoiceHTML(mockBill, wh, 'modal');
  }

  function bindEvents(warehouseId, items, hasStockError, calculation) {
    // Warehouse Selector Switch
    body.querySelector('#bill-wh')?.addEventListener('change', () => {
      billItems = []; // Clear current items on warehouse switch to prevent mismatch
      renderBillBody();
    });

    // Form Inputs - Live preview refresh on any change
    ['#bill-customer', '#bill-seller-address', '#bill-seller-contact', '#bill-seller-tax', '#bill-customer-phone', '#bill-customer-email', '#bill-buyer-billing', '#bill-buyer-shipping'].forEach(sel => {
      body.querySelector(sel)?.addEventListener('input', () => {
        const wh = whs.find(w => w.id === warehouseId);
        const calculationLive = calculateTaxesFrontend(billItems, warehouseId);
        renderLiveInvoicePreview(calculationLive, warehouseId, wh);
      });
    });

    // Search Input listeners
    const searchInput = body.querySelector('#sku-search-input');
    
    searchInput?.addEventListener('focus', () => {
      renderSKUDropdown(searchInput.value, items);
    });

    searchInput?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      
      // Barcode support: exact SKU match
      const exactMatch = items.find(i => i.sku.toLowerCase() === val.toLowerCase());
      if (exactMatch) {
        const qty = parseInt(body.querySelector('#item-qty')?.value) || 1;
        addItemToBill(exactMatch, qty);
        e.target.value = '';
        hideSKUDropdown();
        showToast('SKU Scanned', `${exactMatch.name} added to bill`, 'success');
        return;
      }

      // Debounced dynamic search dropdown
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        highlightedIndex = -1;
        renderSKUDropdown(val, items);
      }, 150);
    });

    // Key navigation
    searchInput?.addEventListener('keydown', (e) => {
      const listContainer = body.querySelector('#sku-dropdown-list');
      if (!listContainer || listContainer.style.display === 'none' || filteredItems.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightedIndex = (highlightedIndex + 1) % filteredItems.length;
        updateDropdownHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightedIndex = (highlightedIndex - 1 + filteredItems.length) % filteredItems.length;
        updateDropdownHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
          selectSKUItem(filteredItems[highlightedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideSKUDropdown();
      }
    });

    // Added items inline quantity edit listener
    body.querySelectorAll('.item-qty-edit-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(input.dataset.index);
        const newQty = parseInt(e.target.value) || 1;
        billItems[idx].qty = newQty;
        renderBillBody();
      });
      
      input.addEventListener('input', (e) => {
        const idx = parseInt(input.dataset.index);
        const newQty = parseInt(e.target.value) || 1;
        billItems[idx].qty = newQty;
        // Fast live refresh on keypress
        const calculationLive = calculateTaxesFrontend(billItems, warehouseId);
        const wh = whs.find(w => w.id === warehouseId);
        renderLiveInvoicePreview(calculationLive, warehouseId, wh);
      });
    });

    // Add Item Manual Button click
    body.querySelector('#add-item-btn')?.addEventListener('click', () => {
      if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
        selectSKUItem(filteredItems[highlightedIndex]);
      } else if (filteredItems.length > 0) {
        selectSKUItem(filteredItems[0]);
      } else {
        showToast('Selection Empty', 'Please type a keyword or select an item from the list', 'warning');
      }
    });

    // Close dropdown on click outside
    document.addEventListener('click', closeDropdownHandler);
  }

  function closeDropdownHandler(e) {
    const dropdown = body.querySelector('#sku-dropdown-list');
    const searchInput = body.querySelector('#sku-search-input');
    if (dropdown && !dropdown.contains(e.target) && e.target !== searchInput) {
      hideSKUDropdown();
    }
  }

  function hideSKUDropdown() {
    const dropdown = body.querySelector('#sku-dropdown-list');
    if (dropdown) dropdown.style.display = 'none';
    highlightedIndex = -1;
  }

  renderBillBody();

  const footer = `
    <button class="btn btn-secondary" id="bill-cancel">Cancel</button>
    <button class="btn btn-primary" id="bill-save" style="display:flex;align-items:center;gap:6px">${getSvgIcon('billing', 14)} Generate Bill</button>
  `;

  // Wide Split-screen modal layout configuration
  const modal = createModal({ title: 'Enterprise Checkout Desk', body, footer, size: 'xl' });
  
  // Safe listener cleanups
  const origClose = modal.close;
  modal.close = () => {
    document.removeEventListener('click', closeDropdownHandler);
    origClose();
  };

  modal.el.querySelector('#bill-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#bill-save')?.addEventListener('click', async () => {
    const customer = document.getElementById('bill-customer')?.value.trim();
    if (!customer) { showToast('Validation','Customer name required','warning'); return; }
    if (billItems.length === 0) { showToast('Validation','Add at least one item','warning'); return; }
    const warehouseId = document.getElementById('bill-wh')?.value || whs[0]?.id;
    
    // Custom tax configuration safeguard
    const wh = whs.find(w => w.id === warehouseId);
    if (wh && wh.taxPreference === 'custom' && (!wh.taxConfig || Object.keys(wh.taxConfig).length === 0)) {
      showToast('Tax Configuration Required', 'This warehouse is flagged with "Custom Tax Setup". Please configure regional tax rules in settings before generating invoices.', 'error');
      return;
    }

    const calculation = calculateTaxesFrontend(billItems, warehouseId);
    
    // Validation to prevent overselling on the client side
    let validationPassed = true;
    const items = getItems(warehouseId);
    calculation.items.forEach(bi => {
      const catalogItem = items.find(item => item.id === bi.id);
      const availableStock = catalogItem ? catalogItem.stock : 0;
      if (bi.qty > availableStock) {
        validationPassed = false;
        showToast('Stock Threshold Alert', `Insufficient stock for ${bi.name}. Maximum: ${availableStock}`, 'error');
      }
    });

    if (!validationPassed) return;

    const sellerAddress = document.getElementById('bill-seller-address')?.value.trim() || '';
    const sellerContact = document.getElementById('bill-seller-contact')?.value.trim() || '';
    const sellerTaxNumber = document.getElementById('bill-seller-tax')?.value.trim() || '';
    const buyerBillingAddress = document.getElementById('bill-buyer-billing')?.value.trim() || '';
    const buyerShippingAddress = document.getElementById('bill-buyer-shipping')?.value.trim() || '';
    const customerPhone = document.getElementById('bill-customer-phone')?.value.trim() || '';
    const customerEmail = document.getElementById('bill-customer-email')?.value.trim() || '';

    // Field validations
    if (customerEmail && (!customerEmail.includes('@') || !customerEmail.includes('.'))) {
      showToast('Validation', 'Invalid customer email address format', 'warning');
      return;
    }
    if (customerPhone && customerPhone.length < 5) {
      showToast('Validation', 'Invalid customer phone number', 'warning');
      return;
    }

    const payload = {
      customer,
      warehouseId,
      items: calculation.items.map(i => ({
        id: i.id,
        name: i.name,
        price: i.price,
        taxCategory: i.taxCategory || 'normal',
        taxRate: i.taxRate,
        qty: i.qty,
        taxes: i.taxes ? i.taxes.map(t => ({
          name: t.name,
          taxType: t.taxType,
          rate: t.rate,
          amount: t.amount
        })) : null
      })),
      subtotal: calculation.subtotal,
      tax: calculation.tax,
      total: calculation.total,
      taxDetails: calculation.taxDetails ? calculation.taxDetails.map(t => ({
        name: t.name,
        taxType: t.taxType,
        rate: t.rate,
        amount: t.amount
      })) : null,
      
      // Extended fields
      sellerAddress,
      sellerContact,
      sellerTaxNumber,
      buyerBillingAddress,
      buyerShippingAddress,
      customerPhone,
      customerEmail
    };
    
    const res = await createBill(payload);
    if (res && res.error) {
      showToast('Generation failed', res.error, 'error');
      return;
    }
    
    showToast('Bill generated!', `${res.billNo || 'Invoice'} — ${formatCurrency(calculation.total)}`, 'success');
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
    <button class="btn btn-primary" id="prev-print" style="display:flex;align-items:center;gap:6px">${getSvgIcon('download', 14)} Print / Export PDF</button>
  `;
  const modal = createModal({ title: `Invoice — ${bill.billNo}`, body, footer, size: 'lg' });
  modal.el.querySelector('#prev-close')?.addEventListener('click', modal.close);
  modal.el.querySelector('#prev-print')?.addEventListener('click', () => { modal.close(); printBill(bill.id); });
}

function buildInvoiceHTML(bill, wh, mode) {
  const cfg = bill.taxConfigSnapshot || getTaxConfig();
  
  // Warehouse-aware currency: use warehouse currency if set, else global
  const currency = wh?.currency || getActiveCurrency();
  const fmt = (v) => formatCurrency(v, currency);

  const sellerAddress = bill.sellerAddress || wh?.address || 'Primary Logistics Hub';
  const sellerContact = bill.sellerContact || wh?.contact || 'Contact Office';
  const sellerTax = bill.sellerTaxNumber || wh?.taxNumber || wh?.gstin || (wh?.email ? `GSTIN: 27${wh.email.toUpperCase().slice(0,3)}C${wh.contact?.slice(-4) || '1234'}F1Z5` : 'GSTIN: 27AAPCW1234F1Z5');
  
  const buyerBilling = bill.buyerBillingAddress || 'N/A';
  const buyerShipping = bill.buyerShippingAddress || 'N/A';
  const buyerPhone = bill.customerPhone || 'N/A';
  const buyerEmail = bill.customerEmail || 'N/A';
  
  const employeeName = bill.employeeName || 'System Creator';
  const employeeRole = bill.employeeRole || 'Staff';

  const rows = (bill.items||[]).map(i => {
    const lineBase = i.qty * i.price;
    let lineTax = 0;
    let taxRateText = '';
    
    if (i.taxes && i.taxes.length > 0) {
      lineTax = i.taxes.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
      taxRateText = i.taxes.map(t => `${t.name}: ${t.taxType === 'percentage' ? (parseFloat(t.rate || 0) * 100).toFixed(0) + '%' : '$' + parseFloat(t.rate || 0)}`).join(', ');
    } else {
      const taxRate = i.taxRate !== undefined ? i.taxRate : (cfg[i.taxCategory] / 100 || cfg.normal / 100);
      lineTax = lineBase * taxRate;
      taxRateText = `${(taxRate * 100).toFixed(0)}%`;
    }
    const lineTotal = lineBase + lineTax;
    
    return `<tr>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle)"><strong>${i.name}</strong></td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:center"><span class="badge badge-brand" style="font-size:10px">${i.taxCategory || 'normal'}</span></td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:center;font-weight:600">${i.qty}</td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:right">${fmt(i.price)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:center;font-weight:600;color:var(--accent-amber);font-size:11px;">${taxRateText}</td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:right;color:var(--accent-amber)">${fmt(lineTax)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid var(--border-subtle);text-align:right;font-weight:700;color:var(--text-primary)">${fmt(lineTotal)}</td>
    </tr>`;
  }).join('');

  const containerStyle = mode === 'modal'
    ? 'font-family:system-ui,-apple-system,sans-serif;color:var(--text-primary);background:var(--bg-card);padding:16px'
    : 'font-family:system-ui,-apple-system,sans-serif;color:#111;background:#fff;padding:0';

  // Calculate due date (15 days from creation)
  const createdDate = new Date(bill.createdAt);
  const dueDate = new Date(createdDate.getTime() + 15 * 24 * 60 * 60 * 1000);

  return `<div style="${containerStyle};border-radius:12px">
    <!-- Header: Seller & Corporate Identity -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid var(--border-default)">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="width:40px;height:40px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--border-default);display:flex;align-items:center;justify-content:center;color:var(--text-primary);overflow:hidden;flex-shrink:0;">
            ${renderWarehouseLogo(wh?.logo, 32)}
          </div>
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--text-primary);line-height:1">${wh?.businessName || wh?.name || 'NexWare ERP'}</div>
            <div style="font-size:11px;font-weight:700;color:var(--text-brand);letter-spacing:1px;margin-top:4px">TAX ID/GSTIN: ${sellerTax}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
          <strong>Address:</strong> ${sellerAddress}<br/>
          <strong>Contact:</strong> ${sellerContact}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:28px;font-weight:900;color:var(--text-brand);letter-spacing:1px;line-height:1;margin-bottom:6px">INVOICE</div>
        <div style="font-size:14px;font-weight:700;font-family:var(--font-mono);color:var(--text-primary)">${bill.billNo}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Source Hub: ${wh?.name || '—'}</div>
      </div>
    </div>

    <!-- Buyer & Metadata Block -->
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;margin-bottom:24px">
      <div style="background:var(--bg-input);border-left:4px solid var(--text-brand);padding:12px 16px;border-radius:0 8px 8px 0">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-brand);margin-bottom:6px">Bill To (Buyer)</div>
        <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${bill.customer}</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.4">
          <strong>Billing Address:</strong> ${buyerBilling}<br/>
          <strong>Shipping Address:</strong> ${buyerShipping}<br/>
          <strong>Phone:</strong> ${buyerPhone} · <strong>Email:</strong> ${buyerEmail}
        </div>
      </div>
      <div style="background:var(--bg-input);border-left:4px solid var(--accent-emerald);padding:12px 16px;border-radius:0 8px 8px 0">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent-emerald);margin-bottom:6px">Invoice Metadata</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.5">
          <strong>Issue Date:</strong> ${formatDate(bill.createdAt)}<br/>
          <strong>Due Date:</strong> ${formatDate(dueDate)}<br/>
          <strong>Billed By:</strong> ${employeeName} (${employeeRole})<br/>
          <strong>Payment Method:</strong> Bank Transfer (Net 15)
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px">
      <thead>
        <tr style="background:var(--bg-input);color:var(--text-primary)">
          <th style="padding:10px 8px;text-align:left;border-radius:6px 0 0 6px">Item Details</th>
          <th style="padding:10px 8px;text-align:center">Category</th>
          <th style="padding:10px 8px;text-align:center">Qty</th>
          <th style="padding:10px 8px;text-align:right">Rate</th>
          <th style="padding:10px 8px;text-align:center">Tax %</th>
          <th style="padding:10px 8px;text-align:right">Tax Amt</th>
          <th style="padding:10px 8px;text-align:right;border-radius:0 6px 6px 0">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Bottom Section: Totals & Signature -->
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:24px;margin-bottom:24px;align-items:end">
      <!-- Terms & Notes -->
      <div style="font-size:11px;color:var(--text-muted);line-height:1.5">
        <div style="font-weight:700;color:var(--text-secondary);margin-bottom:4px">Terms & Declarations</div>
        <div>1. Payment is strictly due within 15 days of invoice generation date.</div>
        <div>2. Interest at 18% p.a. will be charged for delayed payments.</div>
        <div>3. Subject to local judicial jurisdiction. Goods once sold will not be returned.</div>
      </div>
      <!-- Grand Totals -->
      <div style="min-width:220px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:13px">
          <span style="color:var(--text-muted)">Subtotal</span><span style="font-weight:600">${fmt(bill.subtotal)}</span>
        </div>
        ${bill.taxDetails && bill.taxDetails.length > 0 ? 
          bill.taxDetails.map(t => {
            const taxAmt = parseFloat(t.amount || 0);
            const rateText = t.taxType === 'percentage' ? `${(parseFloat(t.rate || 0) * 100).toFixed(1)}%` : `${fmt(parseFloat(t.rate || 0))}`;
            return `
              <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed var(--border-subtle);font-size:12px;color:var(--accent-amber)">
                <span>${t.name} (${rateText})</span>
                <span style="font-weight:600;">${fmt(taxAmt)}</span>
              </div>
            `;
          }).join('')
          : `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:13px">
              <span style="color:var(--accent-amber)">Total Tax</span><span style="color:var(--accent-amber);font-weight:600">${fmt(bill.tax)}</span>
            </div>
          `
        }
        <div style="display:flex;justify-content:space-between;padding:10px 0;background:var(--bg-input);border-radius:8px;padding:10px 12px;margin-top:4px">
          <span style="font-size:14px;font-weight:800;color:var(--text-primary)">Grand Total</span>
          <span style="font-size:18px;font-weight:900;color:var(--text-brand)">${fmt(bill.total)}</span>
        </div>
      </div>
    </div>

    <!-- Footer: Signature & Systems Metadata -->
    <div style="border-top:1.5px solid var(--border-default);padding-top:16px;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:10px;color:var(--text-muted)">
        <div>Generated by NexWare ERP</div>
        <div>Date &amp; Time: ${formatDateTime(bill.createdAt)}</div>
        <div style="margin-top:8px;background:#fff;display:inline-block;padding:2px;border-radius:3px">
          ${generateBarcodeSVG(bill.billNo, { height: 36, color: '#111', showLabel: true })}
        </div>
      </div>
      <div style="text-align:right;min-width:180px">
        <div style="border-bottom:1px solid var(--border-default);height:30px;width:100%;margin-bottom:4px"></div>
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase">Authorized Signatory</div>
      </div>
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
  if (!win) {
    showToast('Popup Blocked', 'Please allow popups in your browser settings to print/export invoices.', 'error');
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Invoice ${bill.billNo}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Georgia,serif; background:#fff; color:#111; padding:20mm; }
    @page { size:A4; margin:15mm; }
    @media print {
      body { padding:0; }
      .no-print { display:none !important; }
    }
    table { border-collapse:collapse; width:100%; }
    /* CSS variable fallbacks for standalone print window */
    :root {
      --text-primary:#111827; --text-secondary:#374151; --text-muted:#6b7280;
      --text-brand:#111827; --text-disabled:#9ca3af;
      --bg-card:#ffffff; --bg-input:#f9fafb; --bg-elevated:#f3f4f6;
      --border-default:#e5e7eb; --border-subtle:#f3f4f6;
      --accent-amber:#d97706; --accent-emerald:#059669; --accent-rose:#e11d48;
      --brand-500:#111827; --gradient-brand:linear-gradient(135deg,#111 0%,#333 100%);
      --shadow-sm:0 1px 2px rgba(0,0,0,.05); --shadow-lg:0 10px 15px rgba(0,0,0,.1);
      --font-mono:'Courier New',monospace;
    }
    .badge { display:inline-block; padding:2px 7px; border-radius:4px; font-size:11px; font-weight:600; }
    .badge-brand { background:#111827; color:#fff; }
    .badge-info  { background:#e0f2fe; color:#0369a1; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;padding:12px;background:#111827;color:#fff;font-family:sans-serif;font-size:14px;cursor:pointer" onclick="window.print();window.close()">
    🖨 Click here to Print / Save as PDF — then close this window
  </div>
  <div style="padding:20px">${invoiceHTML}</div>
  <script>setTimeout(()=>window.print(),700);<\/script>
</body>
</html>`);
  win.document.close();
}


function _handleBillingWsEvent(e) {
  const user = getCurrentUser();
  if (!user) {
    window.removeEventListener('wareops_ws_event', _handleBillingWsEvent);
    return;
  }
  const payload = e.detail;
  const evType = payload?.type || payload?.event_type;
  if (evType === 'billing_completion') {
    syncWithBackend().then(() => {
      renderBillsTable();
    });
  }
}

function calculateTaxesFrontend(items, warehouseId) {
  const taxCfg = getTaxConfig(warehouseId);
  const TAX_RATES = getTaxRates(warehouseId); // { normal: 0.05, luxury: 0.15 }
  
  let subtotal = 0;
  let totalTax = 0;
  
  const processedItems = items.map(item => {
    const lineSubtotal = item.price * item.qty;
    subtotal += lineSubtotal;
    
    let lineTaxes = [];
    if (taxCfg.taxes && taxCfg.taxes.length > 0) {
      lineTaxes = taxCfg.taxes.map(t => {
        const r = parseFloat(t.rate) || 0;
        const rateFraction = t.taxType === 'percentage' ? r / 100 : r;
        const amount = t.taxType === 'percentage' 
          ? lineSubtotal * rateFraction 
          : item.qty * rateFraction;
        return {
          name: t.name,
          taxType: t.taxType,
          rate: rateFraction,
          amount: amount
        };
      });
    } else {
      // Fallback to normal/luxury rates
      const rateFraction = TAX_RATES[item.taxCategory] || TAX_RATES.normal || 0.05;
      lineTaxes = [{
        name: `GST (${(item.taxCategory || 'normal').toUpperCase()})`,
        taxType: 'percentage',
        rate: rateFraction,
        amount: lineSubtotal * rateFraction
      }];
    }
    
    const lineTax = lineTaxes.reduce((s, t) => s + t.amount, 0);
    totalTax += lineTax;
    
    return {
      ...item,
      taxRate: lineTaxes[0]?.rate || 0.05,
      taxes: lineTaxes,
      subtotal: lineSubtotal,
      tax: lineTax,
      total: lineSubtotal + lineTax
    };
  });
  
  return {
    subtotal,
    tax: totalTax,
    total: subtotal + totalTax,
    items: processedItems,
    taxDetails: groupTaxesFrontend(processedItems)
  };
}

function groupTaxesFrontend(items) {
  const grouped = {};
  items.forEach(item => {
    if (item.taxes) {
      item.taxes.forEach(t => {
        if (!grouped[t.name]) {
          grouped[t.name] = {
            name: t.name,
            taxType: t.taxType,
            rate: t.rate,
            amount: 0
          };
        }
        grouped[t.name].amount += t.amount;
      });
    }
  });
  return Object.values(grouped);
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
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
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
          <h1 class="page-title">Analytics & Reports</h1>
          <p class="page-subtitle">${isSA ? 'Global cross-warehouse analytics' : 'Warehouse performance analytics'}</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--bg-card);border:1px solid var(--border-default);border-radius:10px;padding:14px 18px;margin-bottom:24px">
        <span style="font-size:13px;font-weight:600;color:var(--text-secondary)">Filters:</span>

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
        <div class="stat-card-icon" style="background:rgba(99,102,241,0.15);display:flex;align-items:center;justify-content:center;color:#6366f1">${getSvgIcon('revenue', 20)}</div>
        <div class="stat-card-value">${formatCurrency(totalRev)}</div>
        <div class="stat-card-label">Total Revenue</div>
        <div class="stat-card-trend trend-up">${count} invoices</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-glow" style="background:#10b981"></div>
        <div class="stat-card-icon" style="background:rgba(16,185,129,0.15);display:flex;align-items:center;justify-content:center;color:#10b981">${getSvgIcon('billing', 20)}</div>
        <div class="stat-card-value">${formatCurrency(netRev)}</div>
        <div class="stat-card-label">Net Revenue</div>
        <div class="stat-card-trend trend-up">After tax</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-glow" style="background:#f59e0b"></div>
        <div class="stat-card-icon" style="background:rgba(245,158,11,0.15);display:flex;align-items:center;justify-content:center;color:#f59e0b">${getSvgIcon('audit', 20)}</div>
        <div class="stat-card-value">${formatCurrency(totalTax)}</div>
        <div class="stat-card-label">Tax Collected</div>
        <div class="stat-card-trend">Automated</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-glow" style="background:#8b5cf6"></div>
        <div class="stat-card-icon" style="background:rgba(139,92,246,0.15);display:flex;align-items:center;justify-content:center;color:#8b5cf6">${getSvgIcon('analytics', 20)}</div>
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
        <div class="revenue-bar-label">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;overflow:hidden;${(wh.logo && (wh.logo.startsWith('data:') || wh.logo.startsWith('http'))) ? 'background:var(--bg-elevated);border:1px solid var(--border-default);' : 'background:var(--gradient-brand);'}vertical-align:middle;margin-right:6px;">${renderWarehouseLogo(wh.logo, 20)}</span>${wh.name}
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
            const val  = (i.price||0)*(i.stock||0);
            const stockClass = (i.stock||0)<10?'badge-danger':(i.stock||0)<20?'badge-warning':'badge-success';
            
            let taxHtml = '';
            if (taxCfg.taxes && taxCfg.taxes.length > 0) {
              taxHtml = taxCfg.taxes.map(t => {
                const rateText = t.taxType === 'percentage' ? `${t.rate}%` : `$${t.rate}`;
                return `<span class="badge badge-info" style="margin-right:2px;font-size:10px">${t.name}: ${rateText}</span>`;
              }).join('');
            } else {
              const rate = i.taxCategory==='luxury' ? taxCfg.luxury : taxCfg.normal;
              const badgeClass = i.taxCategory==='luxury' ? 'badge-purple' : 'badge-info';
              taxHtml = `<span class="badge ${badgeClass}">GST: ${rate}%</span>`;
            }

            return `<tr>
              <td data-label="Item"><div class="primary-cell">${i.name}</div><div class="sub-cell">${i.sku||'—'}</div></td>
              <td data-label="Category"><span class="badge badge-brand">${i.category}</span></td>
              <td data-label="Price">${formatCurrency(i.price||0)}</td>
              <td data-label="Stock"><span class="badge ${stockClass}">${i.stock||0} ${i.unit||'pcs'}</span></td>
              <td data-label="Value"><strong>${formatCurrency(val)}</strong></td>
              <td data-label="Tax"><div style="display:flex;flex-wrap:wrap;gap:2px">${taxHtml}</div></td>
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
const au_PER_PAGE = 100;
let au_actionFilter = '';

function renderAudit() {
  const user = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
  
  renderShell('Audit Logs', 'System activity and security trail', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Audit Logs</h1>
          <p class="page-subtitle">Complete activity trail for compliance and monitoring</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>
      
      <div class="table-toolbar">
        <div class="table-search">
          <span>🔍</span>
          <input type="text" id="audit-search" placeholder="Search by description, user, or action..." value="${au_searchQ}" />
        </div>
        <div class="table-filter">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="audit-action-filter">
            <option value="" ${au_actionFilter === '' ? 'selected' : ''}>All Actions</option>
            <option value="login" ${au_actionFilter === 'login' ? 'selected' : ''}>Login</option>
            <option value="logout" ${au_actionFilter === 'logout' ? 'selected' : ''}>Logout</option>
            <option value="signup" ${au_actionFilter === 'signup' ? 'selected' : ''}>Signup</option>
            <option value="item_create" ${au_actionFilter === 'item_create' ? 'selected' : ''}>Item Create</option>
            <option value="item_edit" ${au_actionFilter === 'item_edit' ? 'selected' : ''}>Item Edit</option>
            <option value="item_delete" ${au_actionFilter === 'item_delete' ? 'selected' : ''}>Item Delete</option>
            <option value="item_import" ${au_actionFilter === 'item_import' ? 'selected' : ''}>Item Import</option>
            <option value="invoice_create" ${au_actionFilter === 'invoice_create' ? 'selected' : ''}>Invoice Create</option>
            <option value="invoice_update" ${au_actionFilter === 'invoice_update' ? 'selected' : ''}>Invoice Update</option>
            <option value="table_row_create" ${au_actionFilter === 'table_row_create' ? 'selected' : ''}>Row Add</option>
            <option value="table_row_update" ${au_actionFilter === 'table_row_update' ? 'selected' : ''}>Row Edit</option>
            <option value="table_row_delete" ${au_actionFilter === 'table_row_delete' ? 'selected' : ''}>Row Delete</option>
            <option value="table_rows_import" ${au_actionFilter === 'table_rows_import' ? 'selected' : ''}>Row Import</option>
            <option value="export" ${au_actionFilter === 'export' ? 'selected' : ''}>Export</option>
            <option value="settings_change" ${au_actionFilter === 'settings_change' ? 'selected' : ''}>Settings Change</option>
          </select>
        </div>
      </div>
      
      <div id="audit-table-container"></div>
    </div>
  `);

  renderAuditTable();
  
  // Set up event listeners with debounce for search
  let debounceTimeout;
  const searchInput = document.getElementById('audit-search');
  searchInput?.addEventListener('input', e => {
    au_searchQ = e.target.value;
    au_page = 1;
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      renderAuditTable();
    }, 300);
  });
  
  const filterSelect = document.getElementById('audit-action-filter');
  filterSelect?.addEventListener('change', e => {
    au_actionFilter = e.target.value;
    au_page = 1;
    renderAuditTable();
  });
}

const ACTION_CLASSES = {
  'login': 'badge-success',
  'logout': 'badge-muted',
  'signup': 'badge-info',
  
  'item_create': 'badge-success',
  'item_edit': 'badge-info',
  'item_delete': 'badge-danger',
  'item_import': 'badge-brand',
  
  'invoice_create': 'badge-success',
  'invoice_update': 'badge-info',
  
  'table_schema_create': 'badge-success',
  'table_schema_update': 'badge-info',
  'table_schema_delete': 'badge-danger',
  
  'table_row_create': 'badge-success',
  'table_row_update': 'badge-info',
  'table_row_delete': 'badge-danger',
  'table_rows_import': 'badge-brand',
  
  'export': 'badge-brand',
  'import': 'badge-brand',
  'settings_change': 'badge-warning',
  'role_change': 'badge-warning',
  'permission_update': 'badge-warning',
  'restore': 'badge-success',
  'error': 'badge-danger'
};

async function renderAuditTable() {
  const container = document.getElementById('audit-table-container');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:64px;color:var(--text-muted);font-size:14px">
      <span style="display:inline-block;animation:spin 1s linear infinite;margin-right:12px">⏳</span> Loading activity logs...
    </div>
  `;

  try {
    let url = `/audit-logs/?page=${au_page}&limit=${au_PER_PAGE}`;
    if (au_searchQ.trim()) {
      url += `&search=${encodeURIComponent(au_searchQ.trim())}`;
    }
    if (au_actionFilter) {
      url += `&action=${encodeURIComponent(au_actionFilter)}`;
    }

    const res = await apiFetch(url);
    if (!res || !res.success || !Array.isArray(res.data)) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:48px">
          <div style="font-size:40px;margin-bottom:16px;opacity:0.4">⚠️</div>
          <h3 style="color:var(--text-secondary)">Failed to load audit logs</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-top:8px">${res?.error || 'Unable to fetch audit logs from backend.'}</p>
        </div>
      `;
      return;
    }

    const logs = res.data;
    const total = res.total || 0;
    const au_pages = res.pages || 1;
    const start = (au_page - 1) * au_PER_PAGE;

    if (logs.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:64px">
          <div style="font-size:48px;margin-bottom:16px;opacity:0.3">📋</div>
          <h3 style="color:var(--text-secondary);font-weight:600">No activity logs recorded</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-top:8px">No system actions matched the selected filters.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);overflow:hidden">
        <table style="width:100%;border-collapse:collapse;text-align:left">
          <thead>
            <tr style="border-bottom:1px solid var(--border-color);background:var(--bg-sidebar)">
              <th style="padding:14px 16px;font-size:12px;font-weight:600;color:var(--text-secondary);width:60px">#</th>
              <th style="padding:14px 16px;font-size:12px;font-weight:600;color:var(--text-secondary);width:160px">Action</th>
              <th style="padding:14px 16px;font-size:12px;font-weight:600;color:var(--text-secondary)">Description</th>
              <th style="padding:14px 16px;font-size:12px;font-weight:600;color:var(--text-secondary);width:180px">User</th>
              <th style="padding:14px 16px;font-size:12px;font-weight:600;color:var(--text-secondary);width:180px">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map((log, i) => {
              const rowNum = start + i + 1;
              const actionClass = ACTION_CLASSES[log.action] || 'badge-muted';
              const actionText = (log.action || 'unknown').toUpperCase().replace(/_/g, ' ');
              const userName = log.userName || 'System';
              const userInitials = userName.slice(0, 2).toUpperCase();
              
              return `
                <tr style="border-bottom:1px solid var(--border-color);transition:background 0.2s" class="hover-row">
                  <td data-label="#" style="padding:12px 16px;color:var(--text-muted);font-size:12px;font-family:var(--font-mono)">${rowNum}</td>
                  <td data-label="Action" style="padding:12px 16px">
                    <span class="badge ${actionClass}" style="font-weight:600;font-size:11px;letter-spacing:0.5px">
                      ${actionText}
                    </span>
                  </td>
                  <td data-label="Description" style="padding:12px 16px;font-size:13px;color:var(--text-primary);line-height:1.5">${log.description || ''}</td>
                  <td data-label="User" style="padding:12px 16px">
                    <div style="display:flex;align-items:center;gap:10px">
                      <div style="width:28px;height:28px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,0.1)">${userInitials}</div>
                      <span style="font-size:13px;font-weight:500;color:var(--text-primary)">${userName}</span>
                    </div>
                  </td>
                  <td data-label="Timestamp" style="padding:12px 16px;font-size:12px;color:var(--text-muted);font-family:var(--font-mono)">${formatDateTime(log.timestamp)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div class="table-pagination" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-top:1px solid var(--border-color);background:var(--bg-sidebar);flex-wrap:wrap;gap:16px">
          <div class="pagination-info" style="font-size:13px;color:var(--text-muted)">
            Showing <strong style="color:var(--text-primary)">${start + 1}</strong>–<strong style="color:var(--text-primary)">${Math.min(start + logs.length, total)}</strong> of <strong style="color:var(--text-primary)">${total}</strong> logs
          </div>
          <div class="pagination-controls" style="display:flex;align-items:center;gap:6px">
            <button class="au_page-btn" id="ap-prev" ${au_page <= 1 ? 'disabled' : ''} style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-primary);border-radius:var(--radius-md);cursor:pointer;font-size:16px;transition:all 0.2s">‹</button>
            ${(() => {
              let startPage = Math.max(1, au_page - 3);
              let endPage = Math.min(au_pages, startPage + 6);
              if (endPage - startPage < 6) {
                startPage = Math.max(1, endPage - 6);
              }
              let html = '';
              for (let i = startPage; i <= endPage; i++) {
                if (i >= 1 && i <= au_pages) {
                  html += `<button class="au_page-btn ${au_page === i ? 'active' : ''}" data-pg="${i}" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid ${au_page === i ? 'var(--color-brand)' : 'var(--border-color)'};background:${au_page === i ? 'var(--color-brand)' : 'var(--bg-card)'};color:${au_page === i ? 'white' : 'var(--text-primary)'};font-weight:${au_page === i ? '600' : '500'};border-radius:var(--radius-md);cursor:pointer;font-size:13px;transition:all 0.2s">${i}</button>`;
                }
              }
              return html;
            })()}
            <button class="au_page-btn" id="ap-next" ${au_page >= au_pages ? 'disabled' : ''} style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-primary);border-radius:var(--radius-md);cursor:pointer;font-size:16px;transition:all 0.2s">›</button>
          </div>
        </div>
      </div>
    `;

    // Hook up pagination listeners
    container.querySelectorAll('.au_page-btn[data-pg]').forEach(btn => {
      btn.addEventListener('click', () => {
        au_page = parseInt(btn.dataset.pg);
        renderAuditTable();
      });
    });
    container.querySelector('#ap-prev')?.addEventListener('click', () => {
      if (au_page > 1) {
        au_page--;
        renderAuditTable();
      }
    });
    container.querySelector('#ap-next')?.addEventListener('click', () => {
      if (au_page < au_pages) {
        au_page++;
        renderAuditTable();
      }
    });
  } catch (err) {
    console.error('[AuditLog] Error rendering table:', err);
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <div style="font-size:40px;margin-bottom:16px;opacity:0.4">⚠️</div>
        <h3 style="color:var(--text-secondary)">An unexpected error occurred</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-top:8px">Unable to connect to the ERP server.</p>
      </div>
    `;
  }
}

// ===== pages/settings.js =====
function renderSettings() {
  const user = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = ['super_admin','admin'].includes(user.role);
  const taxCfg = getTaxConfig();
  const currency = getCurrency();

  renderShell('Settings', 'Platform configuration and preferences', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">System Settings</h1>
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
              <div class="card-title">Profile Settings</div>
              <div class="card-subtitle">Your account information</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px">
            <div style="width:72px;height:72px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:white;flex-shrink:0;box-shadow:var(--shadow-brand);overflow:hidden">${renderAvatar(user.avatar, "width:100%;height:100%;object-fit:cover;border-radius:50%")}</div>
            <div>
              <div style="font-size:20px;font-weight:800;margin-bottom:2px">${user.name}</div>
              <div style="font-size:13px;color:var(--text-muted)">${user.email}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
                <button class="btn btn-secondary btn-xs" id="s-upload-photo-btn" type="button" style="padding:4px 8px;font-size:11px">Upload Photo</button>
                ${user.avatar?.startsWith('data:image/') ? `<button class="btn btn-danger btn-xs" id="s-remove-photo-btn" type="button" style="padding:4px 8px;font-size:11px;background:var(--accent-rose)">Remove Photo</button>` : ''}
              </div>
              <input type="file" id="s-photo-input" accept="image/*" style="display:none" />
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
              <div class="card-title">Security</div>
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
        <div class="card col-12">
          <div class="card-header">
            <div>
              <div class="card-title">Enterprise Tax Engine</div>
              <div class="card-subtitle">Configure multi-tax stacks, percentage rates, and flat handling fees</div>
            </div>
          </div>
          <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:var(--text-muted);display:flex;align-items:flex-start;gap:8px">
            <span style="color:var(--brand-500);margin-top:2px;flex-shrink:0">${getSvgIcon('info', 16)}</span>
            <div>
              The enterprise tax engine supports stacked percentage taxes (e.g. CGST + SGST) and flat fixed transaction fees. 
              Past invoices remain structurally unchanged.
              ${!isSuperAdmin ? '<br><span style="color:var(--accent-amber)">Note: Editing requires Super Admin role.</span>' : ''}
            </div>
          </div>
          
          <div style="overflow-x:auto;">
            <table class="table" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
              <thead>
                <tr style="border-bottom: 2px solid var(--border-default); text-align: left;">
                  <th style="padding: 10px; color: var(--text-secondary); font-size: 13px; font-weight: 700;">Tax Name</th>
                  <th style="padding: 10px; color: var(--text-secondary); font-size: 13px; font-weight: 700;">Type</th>
                  <th style="padding: 10px; color: var(--text-secondary); font-size: 13px; font-weight: 700;">Rate / Value</th>
                  <th style="padding: 10px; width: 100px; text-align: center; color: var(--text-secondary); font-size: 13px; font-weight: 700;">Actions</th>
                </tr>
              </thead>
              <tbody id="tax-grid-body">
                <!-- Rendered dynamically via Javascript -->
              </tbody>
            </table>
          </div>

          <div style="display:flex; justify-content: space-between; align-items:center; margin-top: 12px; gap: 16px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" id="add-tax-row-btn" ${!isSuperAdmin ? 'disabled' : ''} style="display:flex;align-items:center;gap:6px">${getSvgIcon('plus', 14)} Add Tax Component</button>
            <div style="display:flex;align-items:center;gap:12px">
              <button class="btn btn-primary btn-sm" id="save-tax-btn" ${!isSuperAdmin ? 'disabled title="Super Admin only"' : ''} style="display:flex;align-items:center;gap:6px">${getSvgIcon('save', 14)} Save Tax Rules</button>
              <span id="tax-saved-msg" style="font-size:12px;color:var(--accent-emerald);display:none;align-items:center;gap:4px">${getSvgIcon('check', 14)} Saved!</span>
            </div>
          </div>
        </div>` : ''}

        <!-- Currency Configuration -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">Currency Settings</div>
              <div class="card-subtitle">Select global and warehouse currency preferences</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Global Base Currency</label>
            <select id="s-global-currency" class="form-control" ${!isSuperAdmin ? 'disabled style="opacity:0.7"' : ''}>
              <option value="USD" ${currency==='USD'?'selected':''}>USD ($) - US Dollar</option>
              <option value="INR" ${currency==='INR'?'selected':''}>INR (₹) - Indian Rupee</option>
              <option value="EUR" ${currency==='EUR'?'selected':''}>EUR (€) - Euro</option>
              <option value="GBP" ${currency==='GBP'?'selected':''}>GBP (£) - British Pound</option>
              <option value="AED" ${currency==='AED'?'selected':''}>AED (د.إ) - UAE Dirham</option>
              <option value="SGD" ${currency==='SGD'?'selected':''}>SGD (S$) - Singapore Dollar</option>
            </select>
            <div class="form-hint">Sets the base currency for global financial metrics, invoices, and analytics.</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
            <button class="btn btn-primary btn-sm" id="save-currency-btn" ${!isSuperAdmin ? 'disabled title="Super Admin only"' : ''} style="display:flex;align-items:center;gap:6px">${getSvgIcon('save', 14)} Save Currency</button>
            <span id="currency-saved-msg" style="font-size:12px;color:var(--accent-emerald);display:none;align-items:center;gap:4px">${getSvgIcon('check', 14)} Saved!</span>
          </div>
        </div>

        <!-- Theme Configuration -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">Theme Preferences</div>
              <div class="card-subtitle">Select your enterprise visual identity</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Active Theme</label>
            <select id="s-theme" class="form-control">
              <option value="enterprise" ${getStore().theme==='enterprise'||!getStore().theme?'selected':''}>Grayscale B&W (Default)</option>
              <option value="dark"       ${getStore().theme==='dark'?'selected':''}>Slate-Blue Premium Dark</option>
              <option value="light"      ${getStore().theme==='light'?'selected':''}>Enterprise Light</option>
              <option value="classic"    ${getStore().theme==='classic'?'selected':''}>Classic Space Neon</option>
            </select>
            <div class="form-hint">Theme is applied immediately across all pages. Changes persist after saving.</div>
          </div>
          <!-- Live theme preview swatches -->
          <div style="display:flex;gap:8px;margin-bottom:16px;" id="theme-swatches">
            <div data-theme="enterprise" class="theme-swatch ${!getStore().theme||getStore().theme==='enterprise'?'swatch-active':''}" title="Grayscale B&W"
              style="flex:1;height:40px;border-radius:8px;background:linear-gradient(135deg,#09090b,#18181b);border:2px solid ${!getStore().theme||getStore().theme==='enterprise'?'var(--accent-emerald)':'var(--border-default)'};cursor:pointer;position:relative;overflow:hidden;">
              <div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:9px;color:#a1a1aa;font-weight:700">B&W</div>
            </div>
            <div data-theme="dark" class="theme-swatch ${getStore().theme==='dark'?'swatch-active':''}" title="Slate-Blue Dark"
              style="flex:1;height:40px;border-radius:8px;background:linear-gradient(135deg,#0b0f19,#1e293b);border:2px solid ${getStore().theme==='dark'?'var(--accent-emerald)':'var(--border-default)'};cursor:pointer;position:relative;overflow:hidden;">
              <div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:9px;color:#60a5fa;font-weight:700">DARK</div>
            </div>
            <div data-theme="light" class="theme-swatch ${getStore().theme==='light'?'swatch-active':''}" title="Enterprise Light"
              style="flex:1;height:40px;border-radius:8px;background:linear-gradient(135deg,#f8fafc,#e2e8f0);border:2px solid ${getStore().theme==='light'?'var(--accent-emerald)':'var(--border-default)'};cursor:pointer;position:relative;overflow:hidden;">
              <div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:9px;color:#475569;font-weight:700">LIGHT</div>
            </div>
            <div data-theme="classic" class="theme-swatch ${getStore().theme==='classic'?'swatch-active':''}" title="Classic Neon"
              style="flex:1;height:40px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6,#06b6d4);border:2px solid ${getStore().theme==='classic'?'var(--accent-emerald)':'var(--border-default)'};cursor:pointer;position:relative;overflow:hidden;">
              <div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:9px;color:white;font-weight:700">NEON</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
            <button class="btn btn-primary btn-sm" id="save-theme-btn" style="display:flex;align-items:center;gap:6px">${getSvgIcon('save', 14)} Save Theme</button>
            <span id="theme-saved-msg" style="font-size:12px;color:var(--accent-emerald);display:none;align-items:center;gap:4px">${getSvgIcon('check', 14)} Saved!</span>
          </div>
        </div>

        <!-- Notifications -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">Notifications</div>
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
                  <!-- Export Panel -->
        <div class="card col-6">
          <div class="card-header">
            <div>
              <div class="card-title">Export Center</div>
              <div class="card-subtitle">Download secure reports and tables in CSV, Excel, or PDF</div>
            </div>
          </div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;line-height:1.5">
            Access secure, tenant-scoped data exports. Select custom modular ranges, formats, and export categories in our secure center.
          </p>
          <button class="btn btn-secondary btn-sm" id="open-export-center-btn" style="display:flex;align-items:center;gap:6px">
            ${getSvgIcon('export', 16)} Open Export Center
          </button>
        </div>

        <!-- Danger Zone -->
        <div class="card col-6" style="border-color:rgba(244,63,94,0.2);background:rgba(244,63,94,0.03)">
          <div class="card-header">
            <div>
              <div class="card-title" style="color:var(--accent-rose)">Danger Zone</div>
              <div class="card-subtitle">Irreversible administrative actions</div>
            </div>
          </div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;line-height:1.5">
            Resetting the platform will permanently wipe all logs, workforce registries, tables, and bills. Your super_admin account will be kept.
          </p>
          <button class="btn btn-danger btn-sm" id="reset-btn" style="display:flex;align-items:center;gap:6px">
            ${getSvgIcon('trash', 16)} Reset System Data
          </button>
        </div>

        ${isSuperAdmin ? `
        <!-- Role Manager Card -->
        <div class="card col-6" style="border-color:rgba(99,102,241,0.25);background:rgba(99,102,241,0.04)">
          <div class="card-header">
            <div>
              <div class="card-title" style="display:flex;align-items:center;gap:8px">
                ${getSvgIcon('workforce', 16)}
                Role Manager
                <span class="badge badge-success" style="font-size:10px">Super Admin</span>
              </div>
              <div class="card-subtitle">Create custom roles with granular permission matrices</div>
            </div>
          </div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;line-height:1.6">
            Define custom roles, configure module-level permissions (View, Create, Edit, Delete, Export, Import, Manage), and assign them to users. Built-in roles remain protected.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="location.hash='#/roles'" style="display:flex;align-items:center;gap:6px">
              ${getSvgIcon('plus', 14)} Create / Edit Roles
            </button>
            <button class="btn btn-secondary btn-sm" onclick="location.hash='#/workforce'" style="display:flex;align-items:center;gap:6px">
              ${getSvgIcon('workforce', 14)} Manage Users
            </button>
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  `);

  // Local cache for dynamic multi-tax list
  let localTaxes = taxCfg.taxes || [
    { name: "CGST", taxType: "percentage", rate: 2.5 },
    { name: "SGST", taxType: "percentage", rate: 2.5 }
  ];

  function renderTaxRows() {
    const tbody = document.getElementById('tax-grid-body');
    if (!tbody) return;
    tbody.innerHTML = localTaxes.map((tax, idx) => `
      <tr data-index="${idx}" style="border-bottom: 1px solid var(--border-default);">
        <td style="padding: 8px;">
          <input type="text" class="form-control tax-row-name" value="${tax.name}" placeholder="e.g. CGST" ${!isSuperAdmin ? 'readonly' : ''} style="width: 100%;" />
        </td>
        <td style="padding: 8px;">
          <select class="form-control tax-row-type" ${!isSuperAdmin ? 'disabled' : ''} style="width: 100%; border: 1px solid var(--border-default); border-radius: 6px; padding: 4px 8px; background: var(--bg-card); color: var(--text-primary);">
            <option value="percentage" ${tax.taxType === 'percentage' ? 'selected' : ''}>Percentage (%)</option>
            <option value="fixed" ${tax.taxType === 'fixed' ? 'selected' : ''}>Fixed Fee ($)</option>
          </select>
        </td>
        <td style="padding: 8px;">
          <input type="number" class="form-control tax-row-rate" value="${tax.rate}" step="0.01" min="0" ${!isSuperAdmin ? 'readonly' : ''} style="width: 100%;" />
        </td>
        <td style="padding: 8px; text-align: center;">
          <button class="btn btn-danger btn-sm remove-tax-row-btn" data-index="${idx}" ${!isSuperAdmin ? 'disabled' : ''} style="padding: 4px 8px;">${getSvgIcon('trash', 14)}</button>
        </td>
      </tr>
    `).join('');

    // Attach listeners to input changes
    tbody.querySelectorAll('.tax-row-name').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('tr').dataset.index);
        localTaxes[idx].name = e.target.value;
      });
    });

    tbody.querySelectorAll('.tax-row-type').forEach(select => {
      select.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('tr').dataset.index);
        localTaxes[idx].taxType = e.target.value;
      });
    });

    tbody.querySelectorAll('.tax-row-rate').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('tr').dataset.index);
        localTaxes[idx].rate = parseFloat(e.target.value) || 0;
      });
    });

    tbody.querySelectorAll('.remove-tax-row-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        localTaxes.splice(idx, 1);
        renderTaxRows();
      });
    });
  }

  if (isAdmin) {
    setTimeout(renderTaxRows, 50);
    document.getElementById('add-tax-row-btn')?.addEventListener('click', () => {
      localTaxes.push({ name: '', taxType: 'percentage', rate: 0 });
      renderTaxRows();
    });
  }

  // Profile save
  document.getElementById('profile-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('s-name').value.trim();
    if (!name) return;
    const s = getStore();
    const u = s.users.find(u=>u.id===s.currentUserId);
    if (u) {
      u.name = name;
      // If photo is initials, recreate them from the new name
      if (!u.avatar || !u.avatar.startsWith('data:image/')) {
        u.avatar = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
      }
      saveStore();
      await updateUser(u.id, { name, avatar: u.avatar });
      showToast('Profile updated','Your profile has been updated','success');
      renderSettings();
    }
  });

  // Photo upload triggers
  const photoInput = document.getElementById('s-photo-input');
  document.getElementById('s-upload-photo-btn')?.addEventListener('click', () => {
    photoInput?.click();
  });

  photoInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Size check: limit to 2MB to keep base64 storage compact
    if (file.size > 2 * 1024 * 1024) {
      showToast('File too large', 'Please upload an image smaller than 2MB', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target.result;
      const s = getStore();
      const u = s.users.find(usr => usr.id === s.currentUserId);
      if (u) {
        u.avatar = base64;
        saveStore();
        await updateUser(u.id, { avatar: base64 });
        showToast('Photo uploaded', 'Profile photo updated successfully', 'success');
        renderSettings();
      }
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('s-remove-photo-btn')?.addEventListener('click', async () => {
    const s = getStore();
    const u = s.users.find(usr => usr.id === s.currentUserId);
    if (u) {
      const fallbackInitials = u.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
      u.avatar = fallbackInitials;
      saveStore();
      await updateUser(u.id, { avatar: fallbackInitials });
      showToast('Photo removed', 'Profile photo reverted to initials', 'success');
      renderSettings();
    }
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
  document.getElementById('save-tax-btn')?.addEventListener('click', () => {
    if (!isSuperAdmin) { showToast('Permission denied','Only Super Admin can change tax rates','error'); return; }
    
    // Validate inputs
    for (const tax of localTaxes) {
      if (!tax.name.trim()) {
        showToast('Validation Error', 'Tax component name cannot be empty', 'error');
        return;
      }
      if (isNaN(tax.rate) || tax.rate < 0) {
        showToast('Validation Error', 'Tax rate must be a positive number', 'error');
        return;
      }
    }

    // Preserve legacy normal and luxury rates internally for backward compatibility
    const normalRate = localTaxes.find(t => t.taxType === 'percentage' && t.name.toLowerCase().includes('normal'))?.rate 
                       || localTaxes.filter(t => t.taxType === 'percentage')[0]?.rate 
                       || taxCfg.normal || 5.0;
    const luxuryRate = localTaxes.find(t => t.taxType === 'percentage' && t.name.toLowerCase().includes('luxury'))?.rate 
                       || localTaxes.filter(t => t.taxType === 'percentage')[1]?.rate 
                       || taxCfg.luxury || 15.0;

    const newConfig = {
      normal: normalRate,
      luxury: luxuryRate,
      taxes: localTaxes
    };

    saveTaxConfig(newConfig).then(() => {
      showToast('Tax rules saved', 'Enterprise tax engine configuration successfully updated', 'success');
      // Show inline confirmation
      const msg = document.getElementById('tax-saved-msg');
      if (msg) { msg.style.display = 'inline-flex'; setTimeout(() => msg.style.display = 'none', 3000); }
    });
  });

  // CURRENCY SAVE — actually persist to store
  document.getElementById('save-currency-btn')?.addEventListener('click', () => {
    if (!isSuperAdmin) { showToast('Permission denied','Only Super Admin can change base currency','error'); return; }
    const currency = document.getElementById('s-global-currency').value;
    saveCurrency(currency);
    showToast('Currency updated', `Platform currency set to: ${currency}`, 'success');
    const msg = document.getElementById('currency-saved-msg');
    if (msg) { msg.style.display = 'inline-flex'; setTimeout(() => msg.style.display = 'none', 3000); }
  });

  // THEME SAVE — persist to store, apply globally
  document.getElementById('save-theme-btn')?.addEventListener('click', () => {
    const selectedTheme = document.getElementById('s-theme').value;
    const s = getStore();
    s.theme = selectedTheme;
    saveStore();
    applyTheme(selectedTheme);
    const themeNames = { enterprise: 'Grayscale B&W', dark: 'Slate-Blue Premium Dark', light: 'Enterprise Light', classic: 'Classic Space Neon' };
    showToast('Theme updated', `Visual theme set to: ${themeNames[selectedTheme] || selectedTheme}`, 'success');
    // Show inline confirmation
    const msg = document.getElementById('theme-saved-msg');
    if (msg) { msg.style.display = 'inline-flex'; setTimeout(() => msg.style.display = 'none', 3000); }
  });

  // THEME SWATCHES — live preview on click
  document.querySelectorAll('.theme-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const t = sw.dataset.theme;
      document.getElementById('s-theme').value = t;
      applyTheme(t);
      document.querySelectorAll('.theme-swatch').forEach(s => s.style.borderColor = 'var(--border-default)');
      sw.style.borderColor = 'var(--accent-emerald)';
    });
  });

  // Theme select dropdown change — live preview
  document.getElementById('s-theme')?.addEventListener('change', (e) => {
    applyTheme(e.target.value);
    document.querySelectorAll('.theme-swatch').forEach(s => {
      s.style.borderColor = s.dataset.theme === e.target.value ? 'var(--accent-emerald)' : 'var(--border-default)';
    });
  });

  // Notification toggles
  document.querySelectorAll('.notif-toggle-input').forEach(input => {
    input.addEventListener('change', () => {
      const s = getStore();
      const u = s.users.find(usr => usr.id === s.currentUserId);
      if (!u.settings) u.settings = {};
      if (!u.settings.notifications) u.settings.notifications = {};
      u.settings.notifications[input.dataset.key] = input.checked;
      saveStore();
      showToast('Preference saved', `${input.dataset.key} alerts ${input.checked ? 'enabled' : 'disabled'}`, 'info');
      renderSettings(); // Re-render to update toggle colors
    });
  });

  // EXPORT POPUP CENTER
  document.getElementById('open-export-center-btn')?.addEventListener('click', () => {
    const isSuperAdmin = user.role === 'super_admin';
    const isAdmin = ['super_admin','admin'].includes(user.role);
    const isManager = ['super_admin','admin','manager'].includes(user.role);

    const categories = [
      { key:'bills',      label:'Billing & Invoices (Manager+)',   role:'manager' },
      { key:'inventory',  label:'Inventory Records (Manager+)',    role:'manager' },
      { key:'workforce',  label:'Workforce Members (Admin+)',      role:'admin'   },
      { key:'warehouses', label:'Warehouse Hubs (Super Admin)',    role:'super_admin' },
      { key:'audit',      label:'Security Audit Logs (Super Admin)', role:'super_admin' },
      { key:'all',        label:'Full Platform Ledger (Admin+)',   role:'admin'   },
    ].filter(e => {
      if (e.role === 'super_admin') return isSuperAdmin;
      if (e.role === 'admin') return isAdmin;
      if (e.role === 'manager') return isManager;
      return true;
    });

    // Create Modal Body Element
    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div class="form-group" style="margin-bottom: 16px;">
        <label class="form-label">Export Category</label>
        <select id="export-category" class="form-control" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;width:100%">
          ${categories.map(c => `<option value="${c.key}">${c.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom: 16px;">
        <label class="form-label" style="margin-bottom:8px;display:block">Export Format</label>
        <div style="display:flex;gap:20px;align-items:center">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
            <input type="radio" name="export-fmt" value="csv" checked style="accent-color:var(--brand-500)" /> CSV Sheets
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
            <input type="radio" name="export-fmt" value="xlsx" style="accent-color:var(--brand-500)" /> Excel Spreadsheet (XLSX)
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
            <input type="radio" name="export-fmt" value="pdf" style="accent-color:var(--brand-500)" /> PDF Document Report
          </label>
        </div>
      </div>
      <div class="form-hint" style="font-size:12px;color:var(--text-muted);background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:6px;padding:8px 12px;line-height:1.5;display:flex;align-items:flex-start;gap:6px">
        <span style="color:var(--brand-500);flex-shrink:0">${getSvgIcon('info', 16)}</span>
        <span>All data exports are fully tenant-partitioned and role-gated.</span>
      </div>
    `;

    // Create Modal Footer Element
    const modalFooter = document.createElement('div');
    modalFooter.style.cssText = 'display:flex;justify-content:flex-end;gap:12px;width:100%';
    modalFooter.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="export-modal-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="export-modal-run" style="display:flex;align-items:center;gap:6px">
        ${getSvgIcon('save', 14)} Run Export
      </button>
    `;

    // Create custom modal wrapper
    import('../modules/ui.js').then(({ createModal }) => {
      const modal = createModal({
        title: 'Secure Export Center',
        body: modalBody,
        footer: modalFooter
      });

      modal.el.querySelector('#export-modal-cancel').addEventListener('click', () => modal.close());
      modal.el.querySelector('#export-modal-run').addEventListener('click', () => {
        const category = modal.el.querySelector('#export-category').value;
        const fmt = modal.el.querySelector('input[name="export-fmt"]:checked').value;
        const runBtn = modal.el.querySelector('#export-modal-run');

        runBtn.textContent = '⏳ Exporting...';
        runBtn.disabled = true;

        setTimeout(() => {
          try {
            let result;
            if (fmt === 'csv')  result = exportCSV(category);
            else if (fmt === 'xlsx') result = exportXLSX(category);
            else if (fmt === 'pdf')  result = exportPDF(category);
            
            if (result?.error) {
              showToast('Export failed', result.error, 'error');
            } else {
              showToast('Export complete', `${result?.entity}: ${result?.count} records exported`, 'success');
              addAuditLog('export', `Exported ${category} data as ${fmt.toUpperCase()} (${result?.count || 0} records)`, user.id);
              modal.close();
            }
          } catch(e) {
            showToast('Export error', e.message, 'error');
          }
          runBtn.textContent = 'Run Export';
          runBtn.disabled = false;
        }, 400);
      });
    });
  });

  // SECURE PASSWORD-CONFIRMED RESET
  document.getElementById('reset-btn')?.addEventListener('click', () => {
    if (!isSuperAdmin) {
      showToast('Unauthorized Action', 'Only the Super Administrator role is permitted to perform platform resets.', 'error');
      return;
    }

    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div style="background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.2);border-radius:8px;padding:12px;margin-bottom:12px;font-size:13px;color:var(--accent-rose);display:flex;align-items:flex-start;gap:8px">
        <span style="color:var(--accent-rose);margin-top:2px;flex-shrink:0">${getSvgIcon('warning', 16)}</span>
        <div style="font-weight:700;line-height:1.4">
          WARNING: THIS WILL PERMANENTLY ERASE ALL PLATFORM WAREHOUSES, STAFF USERS, LEDGERS, AND CUSTOM SCHEMAS!
        </div>
      </div>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;line-height:1.5">
        Your current Super Admin account will remain intact. To confirm this highly sensitive action, please re-authenticate by entering your password below.
      </p>
      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label">Verify Super Admin Password</label>
        <input type="password" id="reset-confirm-password" class="form-control" placeholder="Enter password to confirm" style="width:100%" />
      </div>
    `;

    const modalFooter = document.createElement('div');
    modalFooter.style.cssText = 'display:flex;justify-content:flex-end;gap:12px;width:100%';
    modalFooter.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="reset-modal-cancel">Cancel Erase</button>
      <button class="btn btn-danger btn-sm" id="reset-modal-confirm">Confirm System Reset</button>
    `;

    import('../modules/ui.js').then(({ createModal }) => {
      const modal = createModal({
        title: 'Secure System Reset Confirmation',
        body: modalBody,
        footer: modalFooter
      });

      modal.el.querySelector('#reset-modal-cancel').addEventListener('click', () => modal.close());
      modal.el.querySelector('#reset-modal-confirm').addEventListener('click', () => {
        const passwordVal = modal.el.querySelector('#reset-confirm-password').value;
        if (!passwordVal) {
          showToast('Verification Required', 'Password is required to authenticate system reset.', 'warning');
          return;
        }
        
        const s = getStore();
        const currentUser = s.users.find(u=>u.id===s.currentUserId);
        if (currentUser.password !== passwordVal) {
          showToast('Access Denied', 'Authentication failed: Incorrect password.', 'error');
          return;
        }

        // Proceed with system reset!
        s.warehouses=[];s.bills=[];s.items=[];s.tables=[];s.tableData={};s.auditLogs=[];s.notifications=[];
        s.users = [currentUser];
        saveStore();
        showToast('System Reset Complete', 'Platform ledgers and databases have been wiped to fresh state.', 'success');
        modal.close();
        location.hash='#/dashboard';
      });
    });
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
          <h1 class="page-title">Subscription Management</h1>
          <p class="page-subtitle">Your current plan, limits, and upgrade options</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <!-- Current Plan Card -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
        <div style="background:${isEnterprise ? 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(168,85,247,0.15))' : 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.15))'};border:1px solid ${isEnterprise ? 'rgba(99,102,241,0.4)' : 'rgba(16,185,129,0.4)'};border-radius:16px;padding:28px">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
            <div style="color:${isEnterprise ? 'var(--color-brand)' : 'var(--accent-emerald)'};display:flex;align-items:center">${getSvgIcon('subscription', 36)}</div>
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
            { icon:getSvgIcon('warehouses', 24), label:'Warehouses Active', val: warehousesUsed, color:'var(--accent-violet)' },
            { icon:getSvgIcon('items', 24), label:'Warehouse Limit', val: warehouseLimit, color:'var(--accent-emerald)' },
            { icon:getSvgIcon('subscription', 24), label:'Account Type', val: 'Super Admin', color:'var(--accent-amber)' },
          ].map(s=>`
            <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:12px;padding:16px;display:flex;align-items:center;gap:12px;flex:1">
              <div style="display:flex;align-items:center;color:var(--text-secondary)">${s.icon}</div>
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
            { icon:getSvgIcon('warehouses', 20), feat:'Multi-Warehouse Support', starter: isStarter ? '1 Warehouse' : '✓', enterprise: '✓ Unlimited' },
            { icon:getSvgIcon('workforce', 20), feat:'Workforce Management', starter:'✓', enterprise:'✓ + Cross-Warehouse' },
            { icon:getSvgIcon('revenue', 20), feat:'Billing & Invoicing', starter:'✓', enterprise:'✓' },
            { icon:getSvgIcon('analytics', 20), feat:'Analytics & Reports', starter:'Basic', enterprise:'✓ Global' },
            { icon:getSvgIcon('tables', 20), feat:'Dynamic Table Builder', starter:'Limited', enterprise:'✓ Unlimited' },
            { icon:getSvgIcon('search', 20), feat:'Audit Logs', starter:'30 days', enterprise:'✓ Full History' },
          ].map(f=>`
            <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px">
              <span style="display:flex;align-items:center;color:var(--text-secondary)">${f.icon}</span>
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
        <div style="margin-bottom:8px;color:white;display:flex;justify-content:center">${getSvgIcon('subscription', 32)}</div>
        <h3 style="font-size:20px;font-weight:800;margin-bottom:8px">Upgrade to Enterprise</h3>
        <p style="font-size:14px;opacity:0.85;margin-bottom:20px">Unlock unlimited warehouses, global analytics, and full ERP capabilities</p>
        <button class="btn" style="background:white;color:#6366f1;font-weight:700;padding:10px 28px;border-radius:8px" id="upgrade-btn">Contact Sales to Upgrade</button>
      </div>` : `
      <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:20px;text-align:center">
        <div style="margin-bottom:8px;color:var(--accent-emerald);display:flex;justify-content:center">${getSvgIcon('check', 28)}</div>
        <div style="font-size:15px;font-weight:700;color:var(--accent-emerald)">You're on the Enterprise Plan</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:4px">All features are unlocked. No restrictions apply.</div>
      </div>`}

      <div style="margin-top:16px;padding:16px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px;font-size:12px;color:var(--text-muted);text-align:center;display:flex;align-items:center;justify-content:center;gap:6px">
        <span style="display:inline-flex;align-items:center;color:var(--accent-amber)">${getSvgIcon('warning', 14)}</span> <strong>Demo Mode:</strong> No real payment gateway active. All subscription features are for demonstration purposes only.
      </div>
    </div>
  `);

  document.getElementById('upgrade-btn')?.addEventListener('click', () => {
    showToast('Enterprise Plan', 'Contact sales@wareops.io to upgrade your plan.', 'info');
  });
}

// ===== pages/registry.js =====
/**
 * Enterprise Tracking Registry Page — Multi-tenant Unified Tracking Ledger
 */





let regSearchQ = '';
let regTypeFilter = '';
let regWhFilter = '';
let regPage = 1;
const regLimit = 15;

function renderRegistry() {
  const user = getCurrentUser();
  if (!user) { navigate('/login'); return; }

  const whs = getWarehouses();

  renderShell('Registry Ledger', 'Centralized enterprise unique ID and barcode logs ledger', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Enterprise Tracking Registry</h1>
          <p class="page-subtitle">Multi-tenant unified identity ledger with scan-ready barcodes</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          <button class="btn btn-primary" id="btn-print-barcodes" style="display:inline-flex;align-items:center;gap:6px">${getSvgIcon('export', 14)} Print Barcodes</button>
        </div>
      </div>

      <!-- Stats Summary Row -->
      <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(99, 102, 241, 0.15)">${getSvgIcon('palette', 20)}</div>
          <div class="stat-card-value" id="stat-total-entries">—</div>
          <div class="stat-card-label">Total ID Registries</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(16, 185, 129, 0.15)">${getSvgIcon('billing', 20)}</div>
          <div class="stat-card-value" id="stat-invoice-entries">—</div>
          <div class="stat-card-label">Invoices Tracker</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(245, 158, 11, 0.15)">${getSvgIcon('items', 20)}</div>
          <div class="stat-card-value" id="stat-item-entries">—</div>
          <div class="stat-card-label">Inventory Barcodes</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(6, 182, 212, 0.15)">${getSvgIcon('user', 20)}</div>
          <div class="stat-card-value" id="stat-crm-entries">—</div>
          <div class="stat-card-label">CRM Customers</div>
        </div>
      </div>

      <!-- Toolbar Search & Filter -->
      <div class="table-toolbar">
        <div class="table-search">
          <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span>
          <input type="text" id="reg-search" placeholder="Search unique ID, barcode, creator..." value="${regSearchQ}" />
        </div>
        <div class="table-filter">
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="reg-type-filter">
            <option value="">All Entity Types</option>
            <option value="invoice" ${regTypeFilter === 'invoice' ? 'selected' : ''}>Invoices (INV)</option>
            <option value="warehouse" ${regTypeFilter === 'warehouse' ? 'selected' : ''}>Warehouses (WH)</option>
            <option value="employee" ${regTypeFilter === 'employee' ? 'selected' : ''}>Workforce (EMP)</option>
            <option value="inventory" ${regTypeFilter === 'inventory' ? 'selected' : ''}>Inventory (ITEM)</option>
            <option value="table_registry" ${regTypeFilter === 'table_registry' ? 'selected' : ''}>Operational Tables (TBL)</option>
            <option value="customer" ${regTypeFilter === 'customer' ? 'selected' : ''}>CRM Customers (CUST)</option>
          </select>
          ${user.role === 'super_admin' ? `
          <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="reg-wh-filter">
            <option value="">All Warehouses</option>
            <option value="Global" ${regWhFilter === 'Global' ? 'selected' : ''}>Global Scoped</option>
            ${whs.map(w => `<option value="${w.id}" ${regWhFilter === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
          </select>
          ` : ''}
        </div>
      </div>

      <!-- Main Ledger Ledger Table -->
      <div id="registry-table-container">
        <div class="card" style="text-align:center;padding:48px">
          <div class="spinner" style="margin: 0 auto 16px"></div>
          <h3 style="color:var(--text-secondary)">Loading Tracking Ledger...</h3>
        </div>
      </div>
      <div id="registry-pagination"></div>
    </div>
  `);

  fetchAndRenderRegistry();

  // Search & Filter Events
  const searchInput = document.getElementById('reg-search');
  searchInput?.addEventListener('input', debounce((e) => {
    regSearchQ = e.target.value;
    regPage = 1;
    fetchAndRenderRegistry();
  }, 300));

  document.getElementById('reg-type-filter')?.addEventListener('change', (e) => {
    regTypeFilter = e.target.value;
    regPage = 1;
    fetchAndRenderRegistry();
  });

  document.getElementById('reg-wh-filter')?.addEventListener('change', (e) => {
    regWhFilter = e.target.value;
    regPage = 1;
    fetchAndRenderRegistry();
  });

  document.getElementById('btn-print-barcodes')?.addEventListener('click', showBarcodePrintSheet);

  // Sync listener setup
  window.removeEventListener('wareops_storage_sync', fetchAndRenderRegistry);
  window.addEventListener('wareops_storage_sync', fetchAndRenderRegistry);
}

// Simple debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function fetchAndRenderRegistry() {
  const user = getCurrentUser();
  if (!user) return;

  const whs = getWarehouses();
  const whMap = whs.reduce((acc, curr) => { acc[curr.id] = curr.name; return acc; }, {});

  // Build query string
  let query = `/registry/?page=${regPage}&limit=${regLimit}`;
  if (regSearchQ) query += `&search=${encodeURIComponent(regSearchQ)}`;
  if (regTypeFilter) query += `&entityType=${regTypeFilter}`;
  if (regWhFilter) query += `&warehouseId=${regWhFilter}`;

  const res = await apiFetch(query);
  if (res.error) {
    const container = document.getElementById('registry-table-container');
    if (container) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:48px;border-color:rgba(239,68,68,0.2)">
          <div style="font-size:40px;margin-bottom:16px;color:rgba(239,68,68,0.7)">⚠️</div>
          <h3 style="color:var(--text-secondary)">Sync Failed</h3>
          <p style="color:var(--text-muted);margin-top:8px">${res.error}</p>
        </div>
      `;
    }
    return;
  }

  const { entries, total } = res.data;
  const pages = Math.ceil(total / regLimit);
  const start = (regPage - 1) * regLimit;

  // Render Stats Numbers
  updateStatsNumbers(entries, total);

  const container = document.getElementById('registry-table-container');
  if (!container) return;

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <div style="font-size:40px;margin-bottom:16px;opacity:0.4">🏷️</div>
        <h3 style="color:var(--text-secondary)">No unique ID registries found</h3>
        <p style="color:var(--text-muted);margin-top:8px">No generated tracking entries match the filter parameters.</p>
      </div>
    `;
    document.getElementById('registry-pagination').innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Unique ID</th>
            <th>Entity Type</th>
            <th>Offline Barcode</th>
            <th>Warehouse Scope</th>
            <th>Creator Log</th>
            <th>Registered At</th>
            <th style="text-align:center">Data</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(e => {
            const whName = e.warehouse_id === 'Global' ? 'Global' : (whMap[e.warehouse_id] || `Warehouse (${e.warehouse_id})`);
            const badgeClass = getEntityBadgeClass(e.entity_type);
            const encodedBarcodeUrl = `http://localhost:8000/api/v1/registry/barcode?code=${e.entity_id}`;

            return `
              <tr>
                <td data-label="Unique ID">
                  <span style="font-family:var(--font-mono);font-weight:700;color:var(--text-primary);letter-spacing:0.5px">${e.entity_id}</span>
                </td>
                <td data-label="Entity Type">
                  <span class="badge ${badgeClass}">${capitalizeFirst(e.entity_type)}</span>
                </td>
                <td data-label="Offline Barcode" style="padding-top: 4px; padding-bottom: 4px;">
                  <div style="display:flex;flex-direction:column;gap:2px;max-width:180px">
                    <img src="${encodedBarcodeUrl}" alt="${e.entity_id} Barcode" style="height:36px;object-fit:contain;border:1px solid #f3f4f6;border-radius:4px;background:#ffffff;padding:2px" />
                  </div>
                </td>
                <td data-label="Warehouse Scope">
                  <span class="badge badge-secondary">${whName}</span>
                </td>
                <td data-label="Creator Log">
                  <div class="primary-cell">${e.creator_name}</div>
                  <div class="sub-cell">ID: ${e.created_by.slice(0, 8)}</div>
                </td>
                <td data-label="Registered At">
                  <div class="primary-cell">${formatDateTime(e.created_at)}</div>
                </td>
                <td data-label="Data" style="text-align:center">
                  <button class="action-btn edit view-snapshot-btn" data-id="${e.entity_id}" title="View Metadata Snapshot" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px">${getSvgIcon('view', 12)} Details</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      
      <!-- Pagination controls -->
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start + 1}–${Math.min(start + regLimit, total)} of ${total} entries</div>
        <div class="pagination-controls">
          <button class="wf_page-btn" id="reg-prev" ${regPage <= 1 ? 'disabled' : ''}>‹</button>
          ${Array.from({ length: Math.min(5, pages) }, (_, i) => {
            const pageNum = i + 1;
            return `<button class="wf_page-btn ${regPage === pageNum ? 'active' : ''}" data-pg="${pageNum}">${pageNum}</button>`;
          }).join('')}
          <button class="wf_page-btn" id="reg-next" ${regPage >= pages ? 'disabled' : ''}>›</button>
        </div>
      </div>
    </div>
  `;

  // Attach button triggers
  container.querySelectorAll('.view-snapshot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = entries.find(x => x.entity_id === btn.dataset.id);
      if (entry) showSnapshotModal(entry);
    });
  });

  container.querySelectorAll('.wf_page-btn[data-pg]').forEach(btn => {
    btn.addEventListener('click', () => {
      regPage = parseInt(btn.dataset.pg);
      fetchAndRenderRegistry();
    });
  });

  document.getElementById('reg-prev')?.addEventListener('click', () => {
    if (regPage > 1) {
      regPage--;
      fetchAndRenderRegistry();
    }
  });

  document.getElementById('reg-next')?.addEventListener('click', () => {
    if (regPage < pages) {
      regPage++;
      fetchAndRenderRegistry();
    }
  });
}

function updateStatsNumbers(entries, total) {
  document.getElementById('stat-total-entries').textContent = total;
  
  // Quick count filters
  const invCount = entries.filter(e => e.entity_type === 'invoice').length;
  const itemCount = entries.filter(e => e.entity_type === 'inventory').length;
  const crmCount = entries.filter(e => e.entity_type === 'customer').length;
  
  // Set counts dynamically
  const invEl = document.getElementById('stat-invoice-entries');
  const itemEl = document.getElementById('stat-item-entries');
  const crmEl = document.getElementById('stat-crm-entries');

  if (invEl) invEl.textContent = entries.filter(e => e.entity_type === 'invoice').length > 0 ? entries.filter(e => e.entity_type === 'invoice').length : 'Active';
  if (itemEl) itemEl.textContent = entries.filter(e => e.entity_type === 'inventory').length > 0 ? entries.filter(e => e.entity_type === 'inventory').length : 'Active';
  if (crmEl) crmEl.textContent = entries.filter(e => e.entity_type === 'customer').length > 0 ? entries.filter(e => e.entity_type === 'customer').length : 'Active';
}

function getEntityBadgeClass(type) {
  switch (type) {
    case 'invoice': return 'badge-info';
    case 'warehouse': return 'badge-secondary';
    case 'employee': return 'badge-warning';
    case 'inventory': return 'badge-success';
    case 'table_registry': return 'badge-primary';
    case 'customer': return 'badge-info';
    default: return 'badge-secondary';
  }
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).replace('_', ' ');
}

function showSnapshotModal(entry) {
  const jsonString = JSON.stringify(entry.metadata_snapshot, null, 2);
  
  const body = `
    <div style="font-family:var(--font-mono);font-size:12px;background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;max-height:400px;overflow-y:auto;white-space:pre-wrap;box-shadow:inset 0 2px 4px rgba(0,0,0,0.6)">${jsonString}</div>
    <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:12px;font-size:12px;color:var(--text-muted)">
      <span>Entity: <strong>${entry.entity_id}</strong> (${capitalizeFirst(entry.entity_type)})</span>
      <span>Creator: <strong>${entry.creator_name}</strong></span>
    </div>
  `;

  const footer = `
    <button class="btn btn-primary" id="m-snap-close">Close</button>
  `;

  const modal = createModal({ title: `Registry Metadata Snapshot`, body, footer });
  modal.el.querySelector('#m-snap-close')?.addEventListener('click', modal.close);
}

async function showBarcodePrintSheet() {
  let query = `/registry/?page=1&limit=60`;
  if (regTypeFilter) query += `&entityType=${regTypeFilter}`;
  if (regWhFilter) query += `&warehouseId=${regWhFilter}`;

  const res = await apiFetch(query);
  if (res.error) {
    showToast('Failed to load barcodes', res.error, 'error');
    return;
  }

  const { entries } = res.data;
  if (!entries || entries.length === 0) {
    showToast('No Barcodes', 'No matching items found to print barcodes.', 'warning');
    return;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('Blocker active', 'Please allow popups to render the barcode print sheet.', 'warning');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>NexWare ERP — Printable Barcode Sheet</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            color: #111827;
            background: #ffffff;
            margin: 0;
            padding: 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
          }
          .card {
            border: 1px dashed #9ca3af;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            page-break-inside: avoid;
          }
          .title {
            font-size: 13px;
            font-weight: bold;
            margin-bottom: 6px;
            text-transform: uppercase;
            color: #374151;
          }
          .barcode {
            max-width: 100%;
            height: auto;
            margin: 8px 0;
          }
          .footer-info {
            font-size: 11px;
            color: #6b7280;
            margin-top: 6px;
          }
          @media print {
            body { padding: 0; }
            .header { display: none; }
            .grid { gap: 15px; }
            .card { border-style: solid; border-color: #d1d5db; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>NexWare ERP Scan Sheet</h1>
          <p>Scan-ready laser barcode tags sheet. Print onto label paper or sheets.</p>
          <button onclick="window.print()" style="padding: 10px 20px; font-size:14px; font-weight:bold; color:white; background:#6366f1; border:none; border-radius:6px; cursor:pointer">🖨️ Print Label Sheet</button>
        </div>
        <div class="grid">
          ${entries.map(e => {
            const barcodeUrl = `http://localhost:8000/api/v1/registry/barcode?code=${e.entity_id}`;
            const name = e.metadata_snapshot.name || e.metadata_snapshot.customer || e.entity_type.toUpperCase();
            return `
              <div class="card">
                <div class="title">${name}</div>
                <img class="barcode" src="${barcodeUrl}" />
                <div class="footer-info">Type: ${e.entity_type} | Scope: ${e.warehouse_id}</div>
              </div>
            `;
          }).join('')}
        </div>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

// ===== pages/customers.js =====
/**
 * Customer CRM Portfolio Page — Central CRM repeat tracking and transaction analytics
 */





let custSearchQ = '';
let custPage = 1;
const custLimit = 10;
let crm_viewMode = localStorage.getItem('wareops_crm_view') || 'table'; // table | card | grid

function renderCustomers() {
  const user = getCurrentUser();
  if (!user) { navigate('/login'); return; }

  renderShell('CRM Customers', 'Track customer checkout histories and CRM repeat profiles', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Customer CRM Workspace</h1>
          <p class="page-subtitle">Repeat customer transaction logs, loyalty tracking, and billing analytics</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <!-- CRM Stats Row -->
      <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-bottom: 24px;">
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(99, 102, 241, 0.15)">${getSvgIcon('workforce', 20)}</div>
          <div class="stat-card-value" id="crm-stat-total">—</div>
          <div class="stat-card-label">Total CRM Customers</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(16, 185, 129, 0.15)">${getSvgIcon('refresh', 20)}</div>
          <div class="stat-card-value" id="crm-stat-repeats">—</div>
          <div class="stat-card-label">Repeat Shoppers Index</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon" style="background: rgba(245, 158, 11, 0.15)">${getSvgIcon('revenue', 20)}</div>
          <div class="stat-card-value" id="crm-stat-revenue">—</div>
          <div class="stat-card-label">CRM Attributed Revenue</div>
        </div>
      </div>

      <!-- Toolbar Search -->
      <div class="table-toolbar">
        <div class="table-search">
          <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span>
          <input type="text" id="crm-search" placeholder="Search customer name, email, phone, ID..." value="${custSearchQ}" />
        </div>
        <!-- View Mode Toggle -->
        <div class="view-mode-toggle" id="crm-view-toggle">
          <button class="view-mode-btn ${crm_viewMode==='table'?'active':''}" data-view="table" title="Table View">${getSvgIcon('tables', 14)}</button>
          <button class="view-mode-btn ${crm_viewMode==='card'?'active':''}" data-view="card" title="Card View">${getSvgIcon('warehouse', 14)}</button>
          <button class="view-mode-btn ${crm_viewMode==='grid'?'active':''}" data-view="grid" title="Grid View">${getSvgIcon('dashboard', 14)}</button>
        </div>
      </div>

      <!-- Customer Directory List -->
      <div id="customers-list-container">
        <div class="card" style="text-align:center;padding:48px">
          <div class="spinner" style="margin: 0 auto 16px"></div>
          <h3 style="color:var(--text-secondary)">Loading Customer Directory...</h3>
        </div>
      </div>
    </div>
  `);

  fetchAndRenderCustomers();

  // Search Input Event
  const searchInput = document.getElementById('crm-search');
  searchInput?.addEventListener('input', debounce((e) => {
    custSearchQ = e.target.value;
    custPage = 1;
    fetchAndRenderCustomers();
  }, 300));

  // View mode toggle
  document.getElementById('crm-view-toggle')?.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      crm_viewMode = btn.dataset.view;
      localStorage.setItem('wareops_crm_view', crm_viewMode);
      document.querySelectorAll('#crm-view-toggle .view-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.view === crm_viewMode));
      fetchAndRenderCustomers();
    });
  });
}

// Simple debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function fetchAndRenderCustomers() {
  const user = getCurrentUser();
  if (!user) return;

  let query = `/registry/customers/?page=${custPage}&limit=${custLimit}`;
  if (custSearchQ) query += `&search=${encodeURIComponent(custSearchQ)}`;

  const res = await apiFetch(query);
  if (res.error) {
    const container = document.getElementById('customers-list-container');
    if (container) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:48px;border-color:rgba(239,68,68,0.2)">
          <div style="font-size:40px;margin-bottom:16px;color:rgba(239,68,68,0.7)">⚠️</div>
          <h3 style="color:var(--text-secondary)">CRM Offline</h3>
          <p style="color:var(--text-muted);margin-top:8px">${res.error}</p>
        </div>
      `;
    }
    return;
  }

  const { customers, total } = res.data;
  const pages = Math.ceil(total / custLimit);
  const start = (custPage - 1) * custLimit;

  // Render Stats Row metrics
  updateCRMStats(customers, total);

  const container = document.getElementById('customers-list-container');
  if (!container) return;

  if (customers.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <div style="font-size:40px;margin-bottom:16px;opacity:0.4">👥</div>
        <h3 style="color:var(--text-secondary)">No CRM records found</h3>
        <p style="color:var(--text-muted);margin-top:8px">No active customer repeat profiles found matching queries.</p>
      </div>
    `;
    return;
  }

  if (crm_viewMode === 'card') {
    renderCRMCardView(customers, container);
  } else if (crm_viewMode === 'grid') {
    renderCRMGridView(customers, container);
  } else {
    renderCRMTableView(customers, container, start, total, pages);
  }
}

function renderCRMTableView(customers, container, start, total, pages) {
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Customer ID</th>
            <th>Name</th>
            <th>Contact Details</th>
            <th>Transactions</th>
            <th>Attributed Sales</th>
            <th>Last Checkout</th>
            <th style="text-align:center">Portfolio</th>
          </tr>
        </thead>
        <tbody>
          ${customers.map(c => {
            const count = c.invoices ? c.invoices.length : 0;
            const sales = c.invoices ? c.invoices.reduce((sum, inv) => sum + (inv.total || 0), 0) : 0;
            const lastCheckout = c.last_active_at || c.updated_at;

            return `
              <tr>
                <td data-label="Customer ID">
                  <span style="font-family:var(--font-mono);font-weight:700">${c.customer_id}</span>
                </td>
                <td data-label="Name">
                  <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0">
                      ${c.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
                    </div>
                    <div>
                      <div class="primary-cell">${c.name}</div>
                      <div class="sub-cell">Tax ID: ${c.tax_number || '—'}</div>
                    </div>
                  </div>
                </td>
                <td data-label="Contact Details">
                  <div class="primary-cell">${c.phone || '—'}</div>
                  <div class="sub-cell">${c.email || '—'}</div>
                </td>
                <td data-label="Transactions">
                  <span class="badge ${count > 1 ? 'badge-success' : 'badge-secondary'}">${count} Checkout${count !== 1 ? 's' : ''}</span>
                </td>
                <td data-label="Attributed Sales">
                  <strong style="color:var(--text-primary)">$${sales.toFixed(2)}</strong>
                </td>
                <td data-label="Last Checkout">
                  <div class="primary-cell">${formatDateTime(lastCheckout)}</div>
                </td>
                <td data-label="Portfolio" style="text-align:center">
                  <button class="action-btn edit view-portfolio-btn" data-id="${c.customer_id}" title="View CRM Portfolio" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px">${getSvgIcon('view', 12)} Portfolio</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <!-- Pagination controls -->
      <div class="table-pagination">
        <div class="pagination-info">Showing ${start + 1}–${Math.min(start + custLimit, total)} of ${total} customers</div>
        <div class="pagination-controls">
          <button class="wf_page-btn" id="cust-prev" ${custPage <= 1 ? 'disabled' : ''}>‹</button>
          ${Array.from({ length: Math.min(5, pages) }, (_, i) => {
            const pageNum = i + 1;
            return `<button class="wf_page-btn ${custPage === pageNum ? 'active' : ''}" data-pg="${pageNum}">${pageNum}</button>`;
          }).join('')}
          <button class="wf_page-btn" id="cust-next" ${custPage >= pages ? 'disabled' : ''}>›</button>
        </div>
      </div>
    </div>
  `;

  // Attach button triggers
  container.querySelectorAll('.view-portfolio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cust = customers.find(x => x.customer_id === btn.dataset.id);
      if (cust) showPortfolioModal(cust);
    });
  });

  container.querySelectorAll('.wf_page-btn[data-pg]').forEach(btn => {
    btn.addEventListener('click', () => {
      custPage = parseInt(btn.dataset.pg);
      fetchAndRenderCustomers();
    });
  });

  document.getElementById('cust-prev')?.addEventListener('click', () => {
    if (custPage > 1) {
      custPage--;
      fetchAndRenderCustomers();
    }
  });

  document.getElementById('cust-next')?.addEventListener('click', () => {
    if (custPage < pages) {
      custPage++;
      fetchAndRenderCustomers();
    }
  });
}

function updateCRMStats(customers, total) {
  document.getElementById('crm-stat-total').textContent = total;
  
  let repeatCount = 0;
  let revenueTotal = 0;

  customers.forEach(c => {
    const txs = c.invoices ? c.invoices.length : 0;
    if (txs > 1) repeatCount++;
    revenueTotal += c.invoices ? c.invoices.reduce((sum, inv) => sum + (inv.total || 0), 0) : 0;
  });

  const repeatPercent = total > 0 ? Math.round((repeatCount / total) * 100) : 0;

  document.getElementById('crm-stat-repeats').textContent = `${repeatPercent}% (${repeatCount})`;
  document.getElementById('crm-stat-revenue').textContent = `$${revenueTotal.toFixed(2)}`;
}

function showPortfolioModal(c) {
  const barcodeUrl = `http://localhost:8000/api/v1/registry/barcode?code=${c.customer_id}`;
  const invoicesList = c.invoices || [];

  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      <!-- Customer Info Card -->
      <div class="card" style="padding:16px;background:var(--bg-secondary);border:1px solid var(--border-color)">
        <h4 style="margin-top:0;margin-bottom:12px;color:var(--text-primary)">CRM Client Profile</h4>
        <div style="font-size:13px;line-height:1.6;color:var(--text-secondary)">
          <div>Name: <strong>${c.name}</strong></div>
          <div>Phone: <strong>${c.phone || '—'}</strong></div>
          <div>Email: <strong>${c.email || '—'}</strong></div>
          <div>Billing Address: <strong>${c.address || '—'}</strong></div>
          <div>Tax Code: <strong>${c.tax_number || '—'}</strong></div>
        </div>
      </div>
      
      <!-- Barcode Card -->
      <div class="card" style="padding:16px;text-align:center;background:var(--bg-secondary);border:1px solid var(--border-color);display:flex;flex-direction:column;align-items:center;justify-content:center">
        <h4 style="margin-top:0;margin-bottom:8px;color:var(--text-primary)">Barcode ID</h4>
        <img src="${barcodeUrl}" style="height:48px;object-fit:contain;background:#ffffff;padding:4px;border:1px solid #e5e7eb;border-radius:4px" />
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:4px">${c.customer_id}</div>
      </div>
    </div>

    <!-- Invoices List -->
    <h4 style="margin-bottom:12px;color:var(--text-primary)">Transaction Checkout History</h4>
    <div class="table-wrap" style="max-height:220px;overflow-y:auto;box-shadow:none;border:1px solid var(--border-color)">
      <table>
        <thead>
          <tr>
            <th>Bill No</th>
            <th>Checkout Date</th>
            <th>Subtotal</th>
            <th>Tax</th>
            <th>Total Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoicesList.length === 0 ? `
            <tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No transaction history recorded yet.</td></tr>
          ` : invoicesList.map(inv => `
            <tr>
              <td><span style="font-family:var(--font-mono);font-weight:700">${inv.bill_no}</span></td>
              <td>${formatDateTime(inv.checkout_at)}</td>
              <td>$${inv.subtotal.toFixed(2)}</td>
              <td>$${inv.tax.toFixed(2)}</td>
              <td><strong>$${inv.total.toFixed(2)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const footer = `
    <button class="btn btn-primary" id="m-port-close">Close</button>
  `;

  const modal = createModal({ title: `Customer CRM Portfolio Details`, body, footer });
  modal.el.querySelector('#m-port-close')?.addEventListener('click', modal.close);
}

function renderCRMCardView(customers, container) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px">
      ${customers.map(c => {
        const count = c.invoices ? c.invoices.length : 0;
        const sales = c.invoices ? c.invoices.reduce((sum, inv) => sum + (inv.total || 0), 0) : 0;
        const initials = c.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
        return `
          <div class="card" style="padding:0;overflow:hidden;transition:transform 0.15s,box-shadow 0.15s"
            onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow-lg)'"
            onmouseleave="this.style.transform='';this.style.boxShadow=''">
            <div style="height:4px;background:linear-gradient(90deg,var(--accent-indigo),var(--accent-sky))"></div>
            <div style="padding:18px">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
                <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:white;flex-shrink:0">${initials}</div>
                <div>
                  <div style="font-size:14px;font-weight:700;color:var(--text-primary)">${c.name}</div>
                  <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted)">${c.customer_id}</div>
                </div>
              </div>
              <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">
                <div>${c.phone || '—'}</div>
                <div>${c.email || '—'}</div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid var(--border-subtle)">
                <div>
                  <span class="badge ${count > 1 ? 'badge-success' : 'badge-secondary'}">${count} Checkout${count !== 1 ? 's' : ''}</span>
                </div>
                <div style="font-size:13px;font-weight:700;color:var(--text-primary)">$${sales.toFixed(2)}</div>
              </div>
              <button class="btn btn-secondary btn-xs view-portfolio-btn" data-id="${c.customer_id}" style="width:100%;margin-top:10px">${getSvgIcon('view', 12)} View Portfolio</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  container.querySelectorAll('.view-portfolio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cust = customers.find(x => x.customer_id === btn.dataset.id);
      if (cust) showPortfolioModal(cust);
    });
  });
}

function renderCRMGridView(customers, container) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px">
      ${customers.map(c => {
        const count = c.invoices ? c.invoices.length : 0;
        const sales = c.invoices ? c.invoices.reduce((sum, inv) => sum + (inv.total || 0), 0) : 0;
        const initials = c.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
        return `
          <div class="card" style="padding:16px;text-align:center;transition:transform 0.15s,box-shadow 0.15s;cursor:pointer"
            onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='var(--shadow-lg)'"
            onmouseleave="this.style.transform='';this.style.boxShadow=''">
            <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:white;margin:0 auto 10px">${initials}</div>
            <div style="font-size:12px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
            <div style="margin:6px 0"><span class="badge ${count > 1 ? 'badge-success' : 'badge-secondary'}" style="font-size:10px">${count} tx</span></div>
            <div style="font-size:12px;font-weight:700;color:var(--text-primary)">$${sales.toFixed(0)}</div>
            <button class="action-btn view view-portfolio-btn" data-id="${c.customer_id}" style="margin-top:8px" title="Portfolio">${getSvgIcon('view', 12)}</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
  container.querySelectorAll('.view-portfolio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cust = customers.find(x => x.customer_id === btn.dataset.id);
      if (cust) showPortfolioModal(cust);
    });
  });
}

// ===== pages/roles.js =====
/**
 * Role Manager Page — Custom role builder with permission matrix
 * Route: /roles  (Super Admin only)
 */






let activeRoleId = null;

function renderRoles() {
  const user = getCurrentUser();
  if (!user || user.role !== 'super_admin') { navigate('/dashboard'); return; }

  renderShell('Role Manager', 'Define roles and permission matrices', buildPageHTML(user));
  bindEvents();
  selectRole(activeRoleId || null);
}

function buildPageHTML(user) {
  const allRoles = getAllRoles();
  return `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Role Manager</h1>
          <p class="page-subtitle">Create and configure enterprise roles with granular permission matrices</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/settings'">← Settings</button>
          <button class="btn btn-primary" id="new-role-btn">${getSvgIcon('plus', 14)} New Role</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:280px 1fr;gap:24px;align-items:start">

        <!-- Left: Role List -->
        <div>
          <div class="card" style="padding:0;overflow:hidden">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle)">
              <div style="font-size:13px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">All Roles</div>
            </div>
            <div id="role-list" style="max-height:600px;overflow-y:auto">
              ${renderRoleList(allRoles)}
            </div>
          </div>
        </div>

        <!-- Right: Permission Editor -->
        <div id="permission-editor">
          <div class="card" style="padding:48px;text-align:center;color:var(--text-muted)">
            ${getSvgIcon('workforce', 40)}
            <div style="margin-top:16px;font-size:15px;font-weight:600">Select a role to view or edit its permissions</div>
            <div style="font-size:13px;margin-top:6px;opacity:0.7">Built-in roles are read-only. Create a custom role to configure permissions.</div>
          </div>
        </div>

      </div>
    </div>
  `;
}

function renderRoleList(allRoles) {
  return allRoles.map(role => `
    <div class="role-list-item ${activeRoleId === role.id ? 'active' : ''}" data-id="${role.id}"
      style="display:flex;align-items:center;gap:12px;padding:14px 20px;cursor:pointer;
             border-left:3px solid ${activeRoleId === role.id ? role.color : 'transparent'};
             transition:all 0.15s;background:${activeRoleId === role.id ? 'var(--glass-bg)' : 'transparent'}">
      <div style="width:10px;height:10px;border-radius:50%;background:${role.color};flex-shrink:0;${role.disabled ? 'opacity:0.4' : ''}"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);${role.disabled ? 'text-decoration:line-through;opacity:0.5' : ''}">${role.name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${role.isSystem ? 'Built-in' : 'Custom'}</div>
      </div>
      ${role.disabled ? `<span class="badge badge-muted" style="font-size:9px">Off</span>` : ''}
    </div>
  `).join('');
}

function renderPermissionMatrix(role) {
  const isSystem = role.isSystem;
  const perms = isSystem ? DEFAULT_ROLE_PERMISSIONS[role.key] || {} : (role.permissions || {});

  const presetHTML = !isSystem ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <span style="font-size:12px;color:var(--text-muted);align-self:center;font-weight:600">Presets:</span>
      ${Object.keys(PERMISSION_PRESETS).map(name => `
        <button class="btn btn-secondary btn-sm preset-btn" data-preset="${name}">${name}</button>
      `).join('')}
    </div>
  ` : '';

  const rowsHTML = ALL_MODULES.map(mod => {
    const modPerms = perms[mod.key] || {};
    return `
      <tr>
        <td style="padding:10px 12px;white-space:nowrap">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="color:var(--text-muted)">${getSvgIcon(mod.icon, 14)}</span>
            <span style="font-size:13px;font-weight:600">${mod.label}</span>
          </div>
        </td>
        ${ALL_ACTIONS.map(action => {
          const checked = modPerms[action] === true;
          const id = `perm_${mod.key}_${action}`;
          return `
            <td style="text-align:center;padding:10px 6px">
              <input type="checkbox" id="${id}" name="${id}"
                data-mod="${mod.key}" data-action="${action}"
                class="perm-checkbox"
                ${checked ? 'checked' : ''}
                ${isSystem ? 'disabled' : ''}
                style="width:16px;height:16px;cursor:${isSystem ? 'not-allowed' : 'pointer'};accent-color:var(--accent-emerald)" />
            </td>
          `;
        }).join('')}
        ${!isSystem ? `
          <td style="text-align:center;padding:10px 6px">
            <input type="checkbox" class="module-select-all" data-mod="${mod.key}"
              ${ALL_ACTIONS.every(a => modPerms[a]) ? 'checked' : ''}
              style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent-sky)"
              title="Toggle all for ${mod.label}" />
          </td>
        ` : '<td></td>'}
      </tr>
    `;
  }).join('');

  const actionColHeaders = ALL_ACTIONS.map(a => `
    <th style="text-align:center;padding:8px 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted)">
      ${a}
      ${!isSystem ? `<br><input type="checkbox" class="action-select-all" data-action="${a}"
        style="margin-top:4px;width:14px;height:14px;cursor:pointer;accent-color:var(--accent-amber)" title="Select all ${a}" />` : ''}
    </th>
  `).join('');

  // Editable fields for custom roles
  let editFieldsHTML = '';
  if (!isSystem) {
    editFieldsHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;margin-bottom:20px;padding:16px;background:var(--glass-bg);border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:11px;font-weight:700;color:var(--text-secondary)">Role Name</label>
          <input type="text" id="role-name-input" class="form-control" value="${role.name}" placeholder="e.g. Lead Operator" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:11px;font-weight:700;color:var(--text-secondary)">Description</label>
          <input type="text" id="role-desc-input" class="form-control" value="${role.description || ''}" placeholder="Scope details" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="font-size:11px;font-weight:700;color:var(--text-secondary)">Color Tag</label>
          <input type="color" id="role-color-input" class="form-control" value="${role.color || '#71717a'}" style="height:38px;padding:2px;cursor:pointer" />
        </div>
      </div>
    `;
  }

  // Assigned active users list
  const allUsers = getStore().users || [];
  const assignedUsers = allUsers.filter(u => u.role === role.id || u.role === role.key);
  
  let assignedUsersHTML = '';
  if (assignedUsers.length > 0) {
    assignedUsersHTML = `
      <div style="margin-bottom:20px;padding:16px;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle)">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:10px;letter-spacing:0.05em">Assigned Users (${assignedUsers.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${assignedUsers.map(u => {
            const initials = u.name ? u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '?';
            const avatarHTML = u.avatar ? 
              `<img src="${u.avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover" />` :
              `<div style="width:28px;height:28px;border-radius:50%;background:var(--accent-indigo);color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600">${initials}</div>`;
            const empId = u.employeeId || u.enterprise_id || 'N/A';
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:4px 10px;background:var(--card-bg);border:1px solid var(--border-subtle);border-radius:20px" title="${u.email}">
                ${avatarHTML}
                <div style="text-align:left;line-height:1.2">
                  <div style="font-size:11px;font-weight:600;color:var(--text-primary)">${u.name || u.email}</div>
                  <div style="font-size:9px;color:var(--text-muted)">ID: ${empId}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } else {
    assignedUsersHTML = `
      <div style="margin-bottom:20px;padding:12px;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle);font-size:11px;color:var(--text-muted)">
        No users currently assigned to this role.
      </div>
    `;
  }

  // Sidebar Layout, ordering and visibility
  let extraSettingsHTML = '';
  if (!isSystem) {
    const pageOrder = role.pageOrder || role.page_order || ALL_MODULES.map(m => m.key);
    const visibility = role.moduleVisibility || role.module_visibility || {};
    
    const sortedModules = [...ALL_MODULES].sort((a, b) => {
      const idxA = pageOrder.indexOf(a.key);
      const idxB = pageOrder.indexOf(b.key);
      const valA = idxA === -1 ? 999 : idxA;
      const valB = idxB === -1 ? 999 : idxB;
      return valA - valB;
    });

    extraSettingsHTML = `
      <div style="margin-top:24px;border-top:1px solid var(--border-subtle);padding-top:20px">
        <h3 style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Sidebar Navigation Layout</h3>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Customize sidebar order and visibility for this role.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(230px, 1fr));gap:12px">
          ${sortedModules.map((mod, index) => {
            const isVisible = visibility[mod.key] !== false;
            return `
              <div class="nav-order-item" data-key="${mod.key}" style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--glass-bg);border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
                <div style="display:flex;flex-direction:column;gap:2px">
                  <button type="button" class="btn-move-up" data-key="${mod.key}" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:2px;font-size:10px;line-height:1" title="Move Up">▲</button>
                  <button type="button" class="btn-move-down" data-key="${mod.key}" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:2px;font-size:10px;line-height:1" title="Move Down">▼</button>
                </div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${mod.label}</div>
                  <div style="font-size:10px;color:var(--text-muted)">Seq: ${index + 1}</div>
                </div>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;font-weight:600;color:var(--text-secondary);flex-shrink:0">
                  <input type="checkbox" class="nav-visibility-checkbox" data-key="${mod.key}" ${isVisible ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--accent-sky)" />
                  Show
                </label>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header" style="gap:12px;flex-wrap:wrap">
        <div>
          <div class="card-title" style="display:flex;align-items:center;gap:8px">
            <div style="width:12px;height:12px;border-radius:3px;background:${role.color}"></div>
            ${role.name}
            ${role.isSystem ? `<span class="badge badge-muted" style="font-size:10px">System</span>` : `<span class="badge badge-success" style="font-size:10px">Custom</span>`}
          </div>
          <div class="card-subtitle">${role.description || 'Permission matrix for this role'}</div>
        </div>
        ${!isSystem ? `
          <div style="display:flex;gap:8px;margin-left:auto;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="clone-role-btn" data-id="${role.id}">Clone</button>
            <button class="btn btn-danger btn-sm" id="delete-role-btn" data-id="${role.id}">Delete</button>
            <button class="btn btn-secondary btn-sm" id="toggle-role-btn" data-id="${role.id}">${role.disabled ? 'Enable' : 'Disable'}</button>
            <button class="btn btn-primary btn-sm" id="save-role-btn" data-id="${role.id}">${getSvgIcon('save', 14)} Save</button>
          </div>
        ` : `
          <div style="margin-left:auto">
            <button class="btn btn-secondary btn-sm" id="clone-role-btn" data-id="${role.id}">Clone as Custom</button>
          </div>
        `}
      </div>

      ${editFieldsHTML}
      ${assignedUsersHTML}
      ${presetHTML}

      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border-subtle)">
              <th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted)">Module</th>
              ${actionColHeaders}
              ${!isSystem ? `<th style="text-align:center;padding:8px 6px;font-size:10px;font-weight:700;color:var(--accent-sky)">All</th>` : '<th></th>'}
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>
      </div>

      ${extraSettingsHTML}

      ${isSystem ? `
        <div style="margin-top:20px;padding:14px;background:var(--glass-bg);border-radius:var(--radius-md);border:1px solid var(--border-subtle)">
          <div style="font-size:12px;color:var(--text-muted)">
            ${getSvgIcon('warning', 14)} Built-in roles cannot be modified. Clone this role to create a custom variant with adjusted permissions.
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function selectRole(roleId) {
  activeRoleId = roleId;
  const allRoles = getAllRoles();
  const role = allRoles.find(r => r.id === roleId);
  const editor = document.getElementById('permission-editor');
  const list = document.getElementById('role-list');
  if (!editor) return;

  // Update active state in list
  if (list) list.innerHTML = renderRoleList(allRoles);
  bindRoleListClicks();

  if (!role) {
    editor.innerHTML = `
      <div class="card" style="padding:48px;text-align:center;color:var(--text-muted)">
        ${getSvgIcon('workforce', 40)}
        <div style="margin-top:16px;font-size:15px;font-weight:600">Select a role to view its permissions</div>
      </div>`;
    return;
  }

  editor.innerHTML = renderPermissionMatrix(role);
  bindEditorEvents(role);
}

function bindEvents() {
  document.getElementById('new-role-btn')?.addEventListener('click', showNewRoleModal);
  bindRoleListClicks();
}

function bindRoleListClicks() {
  document.querySelectorAll('.role-list-item').forEach(el => {
    el.addEventListener('click', () => selectRole(el.dataset.id));
  });
}

function moveRoleNav(role, key, direction) {
  const currentOrder = role.pageOrder || role.page_order || ALL_MODULES.map(m => m.key);
  const allKeys = ALL_MODULES.map(m => m.key);
  const cleanOrder = currentOrder.filter(k => allKeys.includes(k));
  allKeys.forEach(k => {
    if (!cleanOrder.includes(k)) cleanOrder.push(k);
  });
  
  const idx = cleanOrder.indexOf(key);
  if (idx === -1) return;
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= cleanOrder.length) return;
  
  const temp = cleanOrder[idx];
  cleanOrder[idx] = cleanOrder[newIdx];
  cleanOrder[newIdx] = temp;
  
  role.pageOrder = cleanOrder;
  role.page_order = cleanOrder;
  
  const editor = document.getElementById('permission-editor');
  if (editor) {
    editor.innerHTML = renderPermissionMatrix(role);
    bindEditorEvents(role);
  }
}

function bindEditorEvents(role) {
  // Save
  document.getElementById('save-role-btn')?.addEventListener('click', () => saveRolePermissions(role));

  // Clone
  document.getElementById('clone-role-btn')?.addEventListener('click', async () => {
    try {
      const newRole = await cloneRole(role.id);
      if (newRole) {
        showToast('Role cloned', `"${newRole.name}" created`, 'success');
        activeRoleId = newRole.id;
        renderRoles();
      }
    } catch (err) {
      showToast('Error cloning role', err.message, 'error');
    }
  });

  // Delete
  document.getElementById('delete-role-btn')?.addEventListener('click', async () => {
    const ok = await confirm(`Delete role "${role.name}"? Users with this role will fall back to Employee access.`, 'danger');
    if (!ok) return;
    try {
      await deleteRole(role.id);
      activeRoleId = null;
      showToast('Role deleted', role.name, 'warning');
      renderRoles();
    } catch (err) {
      showToast('Error deleting role', err.message, 'error');
    }
  });

  // Toggle disable
  document.getElementById('toggle-role-btn')?.addEventListener('click', async () => {
    try {
      await updateRole(role.id, { disabled: !role.disabled });
      showToast('Role updated', role.disabled ? 'Role enabled' : 'Role disabled', 'info');
      renderRoles();
    } catch (err) {
      showToast('Error updating role', err.message, 'error');
    }
  });

  // Navigation ordering movement buttons
  document.querySelectorAll('.btn-move-up').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      moveRoleNav(role, btn.dataset.key, 'up');
    });
  });

  document.querySelectorAll('.btn-move-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      moveRoleNav(role, btn.dataset.key, 'down');
    });
  });

  // Module "Select All" checkboxes
  document.querySelectorAll('.module-select-all').forEach(cb => {
    cb.addEventListener('change', () => {
      const mod = cb.dataset.mod;
      document.querySelectorAll(`.perm-checkbox[data-mod="${mod}"]`).forEach(c => { c.checked = cb.checked; });
    });
  });

  // Action "Select All" column checkboxes
  document.querySelectorAll('.action-select-all').forEach(cb => {
    cb.addEventListener('change', () => {
      const action = cb.dataset.action;
      document.querySelectorAll(`.perm-checkbox[data-action="${action}"]`).forEach(c => { c.checked = cb.checked; });
    });
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = PERMISSION_PRESETS[btn.dataset.preset];
      if (!preset) return;
      const perms = preset();
      document.querySelectorAll('.perm-checkbox').forEach(cb => {
        const mod = cb.dataset.mod;
        const action = cb.dataset.action;
        cb.checked = !!(perms[mod]?.[action]);
      });
      showToast('Preset applied', btn.dataset.preset, 'info');
    });
  });
}

async function saveRolePermissions(role) {
  const perms = {};
  ALL_MODULES.forEach(mod => {
    perms[mod.key] = {};
    ALL_ACTIONS.forEach(action => {
      const cb = document.getElementById(`perm_${mod.key}_${action}`);
      perms[mod.key][action] = cb ? cb.checked : false;
    });
  });

  const nameEl = document.getElementById('role-name-input');
  const descEl = document.getElementById('role-desc-input');
  const colorEl = document.getElementById('role-color-input');
  
  const updates = { permissions: perms };
  if (nameEl) updates.name = nameEl.value.trim() || role.name;
  if (descEl) updates.description = descEl.value.trim();
  if (colorEl) updates.color = colorEl.value;

  const visibility = {};
  document.querySelectorAll('.nav-visibility-checkbox').forEach(cb => {
    visibility[cb.dataset.key] = cb.checked;
  });
  updates.moduleVisibility = visibility;

  const pageOrder = Array.from(document.querySelectorAll('.nav-order-item')).map(el => el.dataset.key);
  if (pageOrder.length > 0) {
    updates.pageOrder = pageOrder;
  }

  try {
    await updateRole(role.id, updates);
    showToast('Role saved', `${updates.name || role.name} permissions updated`, 'success');
    renderRoles();
  } catch (err) {
    showToast('Error saving role', err.message, 'error');
  }
}

function showNewRoleModal() {
  const allBuiltin = BUILTIN_ROLES.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  const body = `
    <div class="form-group">
      <label class="form-label">Role Name <span class="req">*</span></label>
      <input type="text" id="nr-name" class="form-control" placeholder="e.g., Logistics Coordinator" />
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <input type="text" id="nr-desc" class="form-control" placeholder="Brief description of this role's scope" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Role Color</label>
        <input type="color" id="nr-color" class="form-control" value="#06b6d4" style="height:42px;cursor:pointer" />
      </div>
      <div class="form-group">
        <label class="form-label">Clone Permissions From</label>
        <select id="nr-clone" class="form-control">
          <option value="">Empty (No Access)</option>
          ${allBuiltin}
        </select>
      </div>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" id="nr-cancel">Cancel</button>
    <button class="btn btn-primary" id="nr-create">${getSvgIcon('plus', 14)} Create Role</button>
  `;
  const modal = createModal({ title: 'Create New Role', body, footer });
  modal.el.querySelector('#nr-cancel')?.addEventListener('click', modal.close);
  modal.el.querySelector('#nr-create')?.addEventListener('click', async () => {
    const name = modal.el.querySelector('#nr-name').value.trim();
    if (!name) { showToast('Name required', '', 'error'); return; }
    const desc = modal.el.querySelector('#nr-desc').value.trim();
    const color = modal.el.querySelector('#nr-color').value;
    const cloneFrom = modal.el.querySelector('#nr-clone').value;

    let basePerms = {};
    if (cloneFrom && DEFAULT_ROLE_PERMISSIONS[cloneFrom]) {
      basePerms = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS[cloneFrom]));
    }
    
    try {
      const newRole = await createRole({ name, description: desc, color, permissions: basePerms });
      modal.close();
      activeRoleId = newRole.id;
      showToast('Role created', name, 'success');
      renderRoles();
    } catch (err) {
      showToast('Error creating role', err.message, 'error');
    }
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
