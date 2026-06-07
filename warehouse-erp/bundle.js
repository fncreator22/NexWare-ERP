// WareOps ERP — Bundled v2.0  Generated: 2026-06-07T08:40:43.006Z


// ===== modules/store.js =====
/**
 * WareOps ERP — Central Store (In-Memory State)
 * Simulates a database using localStorage + in-memory state
 */

function getStorageKey() {
  if (typeof window === 'undefined') return 'wareops_data_guest';
  const token = sessionStorage.getItem('access_token');
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload && payload.user_id) {
          return `wareops_data_${payload.user_id}`;
        }
      }
    } catch (e) {}
  }
  return 'wareops_data_guest';
}

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
    const activeKey = getStorageKey();
    if (e.key === activeKey && e.newValue) {
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
    const key = getStorageKey();
    const raw = localStorage.getItem(key);
    _store = raw ? JSON.parse(raw) : getDefaultData();

    // Trigger silent background synchronization if access token exists
    if (typeof window !== 'undefined' && sessionStorage.getItem('access_token')) {
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
  const key = getStorageKey();
  localStorage.setItem(key, JSON.stringify(_store));
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
  const token = sessionStorage.getItem('access_token');
  
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
      if (path !== '/auth/refresh' && path !== '/auth/login' && path !== '/auth/signup') {
        console.log('[Store] Access token expired. Attempting silent token rotation...');
        try {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData && refreshData.success && refreshData.data && refreshData.data.access_token) {
              const newAccessToken = refreshData.data.access_token;
              sessionStorage.setItem('access_token', newAccessToken);
              console.log('[Store] Token rotation succeeded. Retrying original request.');
              
              config.headers['Authorization'] = `Bearer ${newAccessToken}`;
              const retryRes = await fetch(url, config);
              if (retryRes.status !== 401) {
                const retryData = await retryRes.json();
                return retryData;
              }
            }
          }
        } catch (refreshErr) {
          console.error('[Store] Silent refresh failed:', refreshErr);
        }
      }
      
      sessionStorage.removeItem('access_token');
      _store = null;
      const s = getStore();
      s.currentUserId = null;
      saveStore();
      if (typeof window !== 'undefined') {
        window.location.hash = '#/login';
      }
      return { error: 'Session expired. Please sign in again.' };
    }
    
    const data = await res.json();
    if (!res.ok) {
      let errMsg = 'An error occurred.';
      if (data && data.error && data.error.message) {
        errMsg = data.error.message;
      } else if (data && data.detail && Array.isArray(data.detail) && data.detail[0] && data.detail[0].msg) {
        errMsg = data.detail[0].msg;
      } else if (data && data.message) {
        errMsg = data.message;
      } else if (data && typeof data.detail === 'string') {
        errMsg = data.detail;
      }
      return { error: errMsg };
    }
    return data;
  } catch (err) {
    console.error(`API Fetch Error [${path}]:`, err);
    return { error: 'Network error. Please check if the server is running.' };
  }
}

async function syncWithBackend() {
  const token = sessionStorage.getItem('access_token');
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

    // 2. Fetch Workforce (Users) and Current User Profile
    let currentUser = getCurrentUser();
    const meRes = await apiFetch('/auth/me');
    if (meRes && meRes.success && meRes.data) {
      const fresh = meRes.data;
      if (fresh._id && !fresh.id) fresh.id = fresh._id;
      if (fresh.page_order && !fresh.pageOrder) fresh.pageOrder = fresh.page_order;
      if (fresh.module_visibility && !fresh.moduleVisibility) fresh.moduleVisibility = fresh.module_visibility;
      if (fresh.feature_access && !fresh.featureAccess) fresh.featureAccess = fresh.feature_access;
      currentUser = currentUser ? { ...currentUser, ...fresh } : fresh;
    }

    const wfRes = await apiFetch('/workforce/');
    if (wfRes && wfRes.success && Array.isArray(wfRes.data)) {
      const normalizedWf = normalize(wfRes.data);
      const otherUsers = normalizedWf.filter(u => u.id !== _store.currentUserId);
      _store.users = currentUser ? [currentUser, ...otherUsers] : normalizedWf;
    } else {
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
  sessionStorage.setItem('access_token', access_token);
  
  // Scoping Reset: Reset store pointer to reload the store scoped by this user ID
  _store = null;
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
  const token = sessionStorage.getItem('access_token');
  if (token) {
    await apiFetch('/auth/logout', { method: 'POST' });
  }
  sessionStorage.removeItem('access_token');
  _store = null;
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
  const lowStock = items.filter(i => {
    const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
    return (i.stock || 0) <= threshold;
  }).length;
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

async function reviewDocument(userId, docId, status, remarks) {
  const res = await apiFetch(`/workforce/documents/${docId}/review`, {
    method: 'POST',
    body: JSON.stringify({ status, remarks })
  });
  
  if (res.error) {
    return { error: res.error };
  }
  
  await syncWithBackend();
  return res.data;
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
  if (sessionStorage.getItem('access_token')) {
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
  const token = sessionStorage.getItem('access_token');
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
    if (sessionStorage.getItem('access_token')) {
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
 * Falls back to user SVG if no valid image or initials.
 */
function renderAvatar(avatar, sizeStyle = "width:100%;height:100%;object-fit:cover;border-radius:50%") {
  if (avatar && (avatar.startsWith('data:') || avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('http'))) {
    return `<img src="${avatar}" style="${sizeStyle}" alt="Avatar" onerror="this.style.display='none'" />`;
  }
  // Replace fallback initials with a premium user avatar SVG icon
  if (avatar && avatar.length > 0 && avatar.length <= 3 && !avatar.startsWith('icon:')) {
    return `<span style="font-size:inherit;font-weight:700;color:white;text-transform:uppercase;">${avatar}</span>`;
  }
  return `<svg style="width:60%;height:60%;display:block;color:rgba(255,255,255,0.95);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
}

/**
 * Centralized entity image resolver.
 * Renders an image if it exists, otherwise renders initials or dynamic icons.
 *
 * OVERLAY PATTERN: fallback (initials/icon) is always rendered in the DOM.
 * The photo <img> is absolutely positioned on top (z-index:1).
 * On load  → photo covers the fallback layer.
 * On error → photo hides itself (display:none), fallback shows beneath.
 *
 * This eliminates the previous onerror=innerHTML approach which embedded raw HTML
 * inside an HTML attribute causing attribute shattering: the browser's parser
 * stopped reading the onerror attribute at the first " inside fallbackHTML,
 * leaving "PD" initials and "/>" text as stray visible DOM nodes.
 *
 * @param {string} src - The image URI or base64 data string
 * @param {string} type - Entity type ('workforce'|'profile'|'warehouse'|'warehouse_photo'|'inventory'|'company_logo')
 * @param {string} fallbackText - Name to derive initials from, icon key, or short label
 * @param {number} size - Square/diameter in px (default 40)
 * @param {string} extraStyle - Additional inline CSS to merge onto the container
 * @returns {string} HTML string
 */
function renderEntityImage(src, type, fallbackText = '', size = 40, extraStyle = '') {
  const isUrl = src && typeof src === 'string' && (
    src.startsWith('data:') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('http')
  );
  const s = size;

  // --- Per-type visual config ---
  let borderRadius = '8px';
  let objectFit   = 'cover';
  let bgFallback  = 'var(--bg-elevated)';
  let border      = '1px solid var(--border-default)';

  if (type === 'profile' || type === 'workforce' || type === 'avatar') {
    borderRadius = '50%';
    bgFallback   = 'var(--gradient-brand)';
    border       = isUrl ? '2px solid var(--border-default)' : 'none';
  } else if (type === 'warehouse' || type === 'warehouse_logo' || type === 'logo') {
    borderRadius = '8px';
    bgFallback   = 'var(--bg-elevated)';
    border       = '1px solid var(--border-default)';
  } else if (type === 'warehouse_photo' || type === 'photo') {
    borderRadius = '8px';
    bgFallback   = 'var(--bg-elevated)';
    border       = '1px solid var(--border-default)';
  } else if (type === 'inventory' || type === 'inventory_item' || type === 'item') {
    borderRadius = '6px';
    bgFallback   = 'var(--bg-elevated)';
    border       = '1px solid var(--border-default)';
  } else if (type === 'company_logo') {
    borderRadius = '4px';
    bgFallback   = 'var(--bg-elevated)';
    border       = '1px solid var(--border-default)';
    objectFit    = 'contain';
  }

  // --- Build fallback content (initials / icon SVG) ---
  let fallbackHTML = '';

  if (type === 'profile' || type === 'workforce' || type === 'avatar') {
    const raw = fallbackText && typeof fallbackText === 'string' && !fallbackText.startsWith('icon:') ? fallbackText : '';
    const initials = raw ? raw.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() : '';
    if (initials && /^[A-Z]{1,2}$/.test(initials)) {
      fallbackHTML = `<span style="font-size:${Math.round(s * 0.38)}px;font-weight:800;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.15);line-height:1;pointer-events:none;user-select:none;">${initials}</span>`;
    } else {
      fallbackHTML = `<svg width="${Math.round(s*0.6)}" height="${Math.round(s*0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:rgba(255,255,255,.9);display:block;pointer-events:none;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
  } else if (type === 'warehouse' || type === 'warehouse_logo' || type === 'logo') {
    const warehouseIcons = {
      'icon:industrial':   `<svg width="${Math.round(s*0.6)}" height="${Math.round(s*0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary)"><path d="M2 20h20M5 17V5l4 2v10m4 0V9l4 2v6m4 0v-4l3 1v3"/></svg>`,
      'icon:distribution': `<svg width="${Math.round(s*0.6)}" height="${Math.round(s*0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary)"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
      'icon:retail':       `<svg width="${Math.round(s*0.6)}" height="${Math.round(s*0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary)"><path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
      'icon:office':       `<svg width="${Math.round(s*0.6)}" height="${Math.round(s*0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary)"><rect x="3" y="2" width="18" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="16"/><line x1="15" y1="22" x2="15" y2="16"/><line x1="9" y1="16" x2="15" y2="16"/><path d="M8 6h2v2H8V6zm0 4h2v2H8v-2zm8-4h2v2h-2V6zm0 4h2v2h-2v-2z"/></svg>`,
      'icon:tech':         `<svg width="${Math.round(s*0.6)}" height="${Math.round(s*0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary)"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`
    };
    const defaultWHIcon = warehouseIcons['icon:industrial'];
    if (fallbackText && typeof fallbackText === 'string') {
      const ftLower = fallbackText.toLowerCase();
      if (ftLower.startsWith('icon:')) {
        fallbackHTML = warehouseIcons[ftLower] || defaultWHIcon;
      } else if (fallbackText.length <= 4) {
        fallbackHTML = `<span style="font-size:${Math.round(s*0.55)}px;font-weight:800;color:var(--text-primary);">${fallbackText}</span>`;
      } else {
        fallbackHTML = defaultWHIcon;
      }
    } else {
      fallbackHTML = defaultWHIcon;
    }
  } else if (type === 'warehouse_photo' || type === 'photo') {
    fallbackHTML = `<svg width="${Math.round(s*0.6)}" height="${Math.round(s*0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)"><path d="M3 21h18M3 7v14M21 7v14M12 3v18M12 7h2M12 11h2M12 15h2M8 7h2M8 11h2M8 15h2M16 7h2M16 11h2M16 15h2"/></svg>`;
  } else if (type === 'inventory' || type === 'inventory_item' || type === 'item') {
    fallbackHTML = `<svg width="${Math.round(s*0.6)}" height="${Math.round(s*0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
  } else if (type === 'company_logo') {
    fallbackHTML = `<svg width="${Math.round(s*0.6)}" height="${Math.round(s*0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>`;
  }

  // --- Render ---
  const containerStyle = `position:relative;width:${s}px;height:${s}px;border-radius:${borderRadius};border:${border};background:${bgFallback};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;vertical-align:middle;${extraStyle}`;

  if (isUrl) {
    // Fallback is always in DOM (z-index:0). Photo overlaid (z-index:1).
    // onerror only sets display:none on the <img> — no innerHTML manipulation.
    return `<div class="entity-image-container type-${type}" style="${containerStyle}">` +
      `<span class="entity-img-fallback" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${fallbackHTML}</span>` +
      `<img src="${src}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${objectFit};border-radius:${borderRadius};display:block;" onerror="this.style.display='none'" />` +
      `</div>`;
  }

  return `<div class="entity-image-container type-${type}" style="${containerStyle}">${fallbackHTML}</div>`;
}

/**
 * renderAvatarContainer — renders a full avatar with container.
 * Handles both image and initials, removing gradient when image is present.
 */
function renderAvatarContainer(avatar, name = '', size = 36, extraStyle = '') {
  return renderEntityImage(avatar, 'workforce', name, size, extraStyle);
}

/**
 * renderWarehouseLogo - renders a warehouse branding logo or icon.
 */
function renderWarehouseLogo(logo, size = 24) {
  return renderEntityImage(logo, 'warehouse', logo, size);
}

/**
 * updateDOMAvatars - directly updates all avatar elements currently in active viewport.
 * Sidebar and topbar profile-btn already have correctly-sized circular containers with
 * overflow:hidden, so they use renderAvatar (returns just <img> or fallback) rather
 * than renderAvatarContainer (which would add a second container div).
 */
function updateDOMAvatars(avatarUrl, name) {
  const isUrl = avatarUrl && (avatarUrl.startsWith('data:') || avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('http'));

  // 1. Sidebar footer avatar (.sidebar-user-avatar already has 36×36 circular CSS container)
  const sidebarAvatar = document.querySelector('.sidebar-user-avatar');
  if (sidebarAvatar) {
    sidebarAvatar.style.background = isUrl ? 'transparent' : 'var(--gradient-brand)';
    sidebarAvatar.style.border     = isUrl ? '2px solid var(--border-default)' : 'none';
    sidebarAvatar.innerHTML = renderAvatar(avatarUrl, 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;');
  }

  // 2. Topbar profile button (#profile-btn already has overflow:hidden circular styling)
  const topbarProfileBtn = document.getElementById('profile-btn');
  if (topbarProfileBtn) {
    topbarProfileBtn.style.background    = isUrl ? 'transparent' : 'var(--gradient-brand)';
    topbarProfileBtn.style.border        = isUrl ? '2px solid var(--border-default)' : 'none';
    topbarProfileBtn.style.borderRadius  = '50%';
    topbarProfileBtn.innerHTML = renderAvatar(avatarUrl, 'width:34px;height:34px;object-fit:cover;border-radius:50%;display:block;');
  }

  // 3. Settings page avatar preview
  const settingsPreview = document.querySelector('#settings-avatar-preview');
  if (settingsPreview) {
    settingsPreview.style.background = isUrl ? 'transparent' : 'var(--gradient-brand)';
    settingsPreview.style.border     = isUrl ? '1px solid var(--border-default)' : 'none';
    settingsPreview.innerHTML = renderAvatar(avatarUrl, 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;');
  }

  // 4. Workforce user modal avatar preview
  const workforcePreview = document.getElementById('m-u-avatar-preview');
  if (workforcePreview) {
    workforcePreview.style.background = isUrl ? 'transparent' : 'var(--gradient-brand)';
    workforcePreview.style.border     = isUrl ? '1px solid var(--border-default)' : 'none';
    workforcePreview.innerHTML = renderAvatar(avatarUrl, 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;');
  }
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

// Global Image Preview Modal Trigger
window.showImagePreviewModal = function(src) {
  const modal = createModal({
    title: 'Image Preview',
    body: `<div style="text-align:center;padding:12px;background:var(--bg-card);"><img src="${src}" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);" alt="Preview" /></div>`,
    footer: `<button class="btn btn-secondary" id="preview-modal-close" style="width:100%">Close Preview</button>`
  });
  modal.el.querySelector('#preview-modal-close')?.addEventListener('click', modal.close);
};

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

  const warehouses = canDo('warehouses', 'view', user) ? getWarehouses() : [];
  const users = canDo('workforce', 'view', user) ? getAllUsers() : [];
  const items = getItems();         // already role-filtered in store
  const bills = getBills();         // already role-filtered in store
  const tables = getTables();       // already role-filtered in store
  const audit = canDo('audit', 'view', user) ? getAuditLogs().slice(0, 500) : [];
  const taxCfg = canDo('settings', 'view', user) ? getTaxConfig() : null;

  return { user, warehouses, users, items, bills, tables, audit, taxCfg };
}

// ─── CSV exports ─────────────────────────────────────────────────────────────

function exportCSV(entity) {
  const d = getExportableData();
  if (!d) return { error: 'Not logged in' };

  const ts = stamp();

  switch (entity) {
    case 'bills': {
      if (!canDo('billing', 'view', d.user)) return { error: 'Permission denied' };
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
      if (!canDo('workforce', 'view', d.user)) return { error: 'Permission denied: workforce:view required' };
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
      if (!canDo('inventory', 'view', d.user)) return { error: 'Permission denied' };
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
      if (!canDo('warehouses', 'view', d.user)) return { error: 'Permission denied: warehouses:view required' };
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
      if (!canDo('audit', 'view', d.user)) return { error: 'Permission denied: audit:view required' };
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
      if (!canDo('settings', 'manage', d.user)) return { error: 'Permission denied: settings:manage required' };
      // Multi-sheet CSV separated by section markers
      const sections = [];

      if (canDo('warehouses', 'view', d.user) && d.warehouses.length) {
        sections.push('## WAREHOUSES');
        const cols = ['name','businessName','address','contact','email','taxPreference','status','revenue'];
        const headers = ['Name','Business','Address','Contact','Email','Tax Pref','Status','Revenue'];
        sections.push(toCSV(d.warehouses, cols, headers));
      }

      if (canDo('workforce', 'view', d.user) && d.users.length) {
        sections.push('\n## WORKFORCE');
        const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
        const rows = d.users.map(u => ({ ...u, warehouseName: whs[u.warehouseId]||'' }));
        sections.push(toCSV(rows, ['name','email','role','warehouseName','status','createdAt'],
          ['Name','Email','Role','Warehouse','Status','Joined']));
      }

      if (canDo('inventory', 'view', d.user) && d.items.length) {
        sections.push('\n## INVENTORY');
        const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
        const rows = d.items.map(i => ({ ...i, warehouseName: whs[i.warehouseId]||'' }));
        sections.push(toCSV(rows, ['name','sku','category','taxCategory','price','stock','warehouseName'],
          ['Name','SKU','Category','Tax Cat','Price','Stock','Warehouse']));
      }

      if (canDo('billing', 'view', d.user) && d.bills.length) {
        sections.push('\n## BILLING');
        const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});
        const rows = d.bills.map(b => ({ ...b, warehouseName: whs[b.warehouseId]||'' }));
        sections.push(toCSV(rows, ['billNo','customer','warehouseName','subtotal','tax','total','createdAt'],
          ['Invoice #','Customer','Warehouse','Subtotal','Tax','Total','Date']));
      }

      const full = `WareOps ERP — Full Export\nGenerated: ${new Date().toLocaleString()}\nUser: ${d.user.name} (${d.user.role})\n\n` + sections.join('\n');
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
    if (!canDo('billing', 'view', d.user)) return { error: 'Permission denied' };
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
    if (!canDo('workforce', 'view', d.user)) return { error: 'Permission denied' };
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
    if (!canDo('inventory', 'view', d.user)) return { error: 'Permission denied' };
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
    if (!canDo('warehouses', 'view', d.user)) return entity === 'warehouses' ? { error: 'Permission denied' } : null;
    const headers = ['Name','Business','Address','Contact','Email','Tax Pref','Status','Revenue'];
    const rows = d.warehouses.map(w => ({
      a: w.name, b: w.businessName, c: w.address, d: w.contact,
      e: w.email, f: w.taxPreference, g: w.status, h: (w.revenue||0).toFixed(2)
    }));
    sheetHTML += `<h2 style="color:#1e1b4b">Warehouses (${rows.length} records)</h2>${htmlTable(headers, rows)}<br>`;
    if (entity === 'warehouses') filename = `wareops-warehouses-${ts}.xls`;
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
    <p>Generated: ${new Date().toLocaleString()} | User: ${d.user.name} (${d.user.role})</p>
    ${sheetHTML}
    </body></html>`;

  download(html, filename || `wareops-export-${ts}.xls`, 'application/vnd.ms-excel');
  return { count: d.bills.length + d.users.length + d.items.length, entity: 'Excel Export' };
}

// ─── Print-to-PDF ─────────────────────────────────────────────────────────────

function exportPDF(entity) {
  const d = getExportableData();
  if (!d) return { error: 'Not logged in' };

  const user = d.user;
  const ts = new Date().toLocaleString();
  const whs = d.warehouses.reduce((m,w)=>(m[w.id]=w.name,m), {});

  let sections = '';

  if (entity === 'bills' || entity === 'all') {
    if (!canDo('billing', 'view', user)) {
      if (entity === 'bills') return { error: 'Permission denied' };
    } else {
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
  }

  if (entity === 'workforce' || entity === 'all') {
    if (!canDo('workforce', 'view', user)) {
      if (entity === 'workforce') return { error: 'Permission denied' };
    } else {
      const rows = d.users.map(u => `
        <tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>
        <td>${whs[u.warehouseId]||'Global'}</td><td>${u.status}</td></tr>`).join('');
      sections += `<h2>👥 Workforce (${d.users.length} members)</h2>
        <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Warehouse</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    }
  }

  if (entity === 'inventory' || entity === 'all') {
    if (!canDo('inventory', 'view', user)) {
      if (entity === 'inventory') return { error: 'Permission denied' };
    } else {
      const rows = d.items.map(i => `
        <tr><td>${i.name}</td><td>${i.sku}</td><td>${i.category}</td>
        <td>${i.taxCategory}</td><td>$${i.price?.toFixed(2)}</td><td>${i.stock}</td>
        <td>${whs[i.warehouseId]||''}</td></tr>`).join('');
      sections += `<h2>📦 Inventory (${d.items.length} items)</h2>
        <table><thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Tax Cat</th><th>Price</th><th>Stock</th><th>Warehouse</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    }
  }

  if (!sections) return { error: 'Permission denied: No sections visible' };

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
  <p>User: ${user.name} · Role: ${user.role}</p>
  ${sections}
  <script>setTimeout(()=>window.print(),500);<\/script>
  </body></html>`);
  win.document.close();

  return { count: d.bills.length + d.users.length + d.items.length, entity: 'PDF Export' };
}

// ===== modules/permissions.js =====
// ── MODULE & ACTION DEFINITIONS ──────────────────────────────────────────────

const ALL_MODULES = [
  { key: 'dashboard',      label: 'Dashboard',            icon: 'dashboard'  },
  { key: 'inventory',      label: 'Inventory',            icon: 'items'      },
  { key: 'warehouses',     label: 'Warehouses',           icon: 'warehouses' },
  { key: 'workforce',      label: 'Workforce',            icon: 'workforce'  },
  { key: 'billing',        label: 'Billing',              icon: 'billing'    },
  { key: 'crm',            label: 'CRM',                  icon: 'customer'   },
  { key: 'tables',         label: 'Tables',               icon: 'tables'     },
  { key: 'reports',        label: 'Reports',              icon: 'analytics'  },
  { key: 'notifications',  label: 'Notifications',        icon: 'bell'       },
  { key: 'audit',          label: 'Audit Logs',           icon: 'audit'      },
  { key: 'settings',       label: 'Settings',             icon: 'settings'   },
  { key: 'registration',   label: 'Registration modules', icon: 'audit'      },
];

const ALL_ACTIONS = ['view','create','edit','delete','export','import','manage'];

// ── BUILT-IN DEFAULT PERMISSIONS PER ROLE ────────────────────────────────────

const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: {
    dashboard:      { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    inventory:      { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    warehouses:     { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    workforce:      { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    billing:        { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    crm:            { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    tables:         { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    reports:        { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    notifications:  { view:true,  create:false, edit:false, delete:true,  export:false, import:false, manage:true  },
    audit:          { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    settings:       { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    registration:   { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
  },
  admin: {
    dashboard:      { view:true,  create:false, edit:false, delete:false, export:true,  import:false, manage:false },
    inventory:      { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    warehouses:     { view:true,  create:false, edit:true,  delete:false, export:true,  import:false, manage:false },
    workforce:      { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:false, manage:true  },
    billing:        { view:true,  create:true,  edit:true,  delete:false, export:true,  import:false, manage:false },
    crm:            { view:true,  create:true,  edit:true,  delete:false, export:true,  import:false, manage:false },
    tables:         { view:true,  create:true,  edit:true,  delete:true,  export:true,  import:true,  manage:true  },
    reports:        { view:true,  create:false, edit:false, delete:false, export:true,  import:false, manage:false },
    notifications:  { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    audit:          { view:true,  create:false, edit:false, delete:false, export:true,  import:false, manage:false },
    settings:       { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    registration:   { view:true,  create:true,  edit:true,  delete:false, export:true,  import:false, manage:true  },
  },
  manager: {
    dashboard:      { view:true,  create:false, edit:false, delete:false, export:true,  import:false, manage:false },
    inventory:      { view:true,  create:true,  edit:true,  delete:false, export:true,  import:true,  manage:false },
    warehouses:     { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    workforce:      { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    billing:        { view:true,  create:true,  edit:true,  delete:false, export:true,  import:false, manage:false },
    crm:            { view:true,  create:false, edit:true,  delete:false, export:true,  import:false, manage:false },
    tables:         { view:true,  create:true,  edit:true,  delete:false, export:true,  import:true,  manage:false },
    reports:        { view:true,  create:false, edit:false, delete:false, export:true,  import:false, manage:false },
    notifications:  { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    audit:          { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    settings:       { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    registration:   { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
  },
  staff: {
    dashboard:      { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    inventory:      { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    warehouses:     { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    workforce:      { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    billing:        { view:true,  create:true,  edit:false, delete:false, export:false, import:false, manage:false },
    crm:            { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    tables:         { view:true,  create:false, edit:true,  delete:false, export:false, import:false, manage:false },
    reports:        { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    notifications:  { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    audit:          { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    settings:       { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    registration:   { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
  },
  employee: {
    dashboard:      { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    inventory:      { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    warehouses:     { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    workforce:      { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    billing:        { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    crm:            { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    tables:         { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    reports:        { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    notifications:  { view:true,  create:false, edit:false, delete:false, export:false, import:false, manage:false },
    audit:          { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    settings:       { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
    registration:   { view:false, create:false, edit:false, delete:false, export:false, import:false, manage:false },
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
  dashboard:      { path: '/dashboard',      icon: 'dashboard',  label: 'Dashboard',      section: 'Overview'    },
  inventory:      { path: '/items',          icon: 'items',      label: 'Inventory',      section: 'Operations'  },
  warehouses:     { path: '/warehouses',     icon: 'warehouses', label: 'Warehouses',     section: 'Operations'  },
  workforce:      { path: '/workforce',      icon: 'workforce',  label: 'Workforce',      section: 'Operations'  },
  billing:        { path: '/billing',        icon: 'billing',    label: 'Billing',        section: 'Finance'     },
  crm:            { path: '/customers',      icon: 'customer',   label: 'CRM Customers',  section: 'Operations'  },
  tables:         { path: '/tables',         icon: 'tables',     label: 'Tables',         section: 'Operations'  },
  reports:        { path: '/analytics',      icon: 'analytics',  label: 'Reports',        section: 'Finance'     },
  notifications:  { path: '/notifications',  icon: 'bell',       label: 'Notifications',  section: 'System'      },
  audit:          { path: '/audit',          icon: 'audit',      label: 'Audit Logs',     section: 'System'      },
  settings:       { path: '/settings',       icon: 'settings',   label: 'Settings',       section: 'System'      },
};

// Always show for super_admin — extra items not tied to permissions
const SUPER_ADMIN_EXTRAS = [
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
        <div class="sidebar-item ${currentPath === item.path ? 'active' : ''}" data-path="${item.path}" data-tooltip="${item.label}" style="position:relative">
          <span class="sidebar-item-icon">${getSvgIcon(item.icon)}</span>
          <span class="sidebar-item-label">${item.label}</span>
          ${item.path === '/notifications' && unreadCount > 0 ? `<span style="position:absolute;top:6px;right:8px;min-width:18px;height:18px;padding:0 4px;background:var(--accent-rose);border-radius:9px;font-size:10px;font-weight:700;color:white;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg-sidebar, var(--bg-base))">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
        </div>
      `).join('')}
    </div>
  `).join('');

  const breadcrumb = pageTitle
    ? `<span class="breadcrumb-item">WareOps</span><span class="breadcrumb-sep">›</span><span class="breadcrumb-item current">${pageTitle}</span>`
    : `<span class="breadcrumb-item current">WareOps ERP</span>`;

  const stockHealth = getStockHealth(user.role === 'super_admin' ? null : user.warehouseId);
  const healthColor = stockHealth > 80 ? 'var(--accent-emerald)' : stockHealth > 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';

  // Find first low stock item for navigation
  const shellItems = getItems(user.role === 'super_admin' ? null : user.warehouseId);
  const firstLowStockItem = shellItems.find(i => {
    const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
    return (i.stock || 0) <= threshold;
  });
  const firstLowStockId = firstLowStockItem ? firstLowStockItem.id : '';

  const sidebarWidget = `
    <div class="sidebar-widget" id="sidebar-health-widget" style="cursor:pointer">
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
            <div class="sidebar-user-avatar" style="background:${(user.avatar && (user.avatar.startsWith('data:') || user.avatar.startsWith('http'))) ? 'transparent' : 'var(--gradient-brand)'};border:${(user.avatar && (user.avatar.startsWith('data:') || user.avatar.startsWith('http'))) ? '2px solid var(--border-default)' : 'none'}">${renderAvatar(user.avatar, 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;')}</div>
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
            <div class="icon-btn" data-tooltip="Profile" id="profile-btn" style="overflow:hidden;padding:0;border-radius:50%;width:34px;height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${(user.avatar && (user.avatar.startsWith('data:') || user.avatar.startsWith('http'))) ? 'transparent' : 'var(--gradient-brand)'}">${renderAvatar(user.avatar, 'width:34px;height:34px;object-fit:cover;border-radius:50%;display:block;')}</div>
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

  // Sidebar health widget click
  document.getElementById('sidebar-health-widget')?.addEventListener('click', () => {
    navigate(firstLowStockId ? `/items?id=${firstLowStockId}` : '/items');
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
    <div style="padding:10px;text-align:center;border-top:1px solid var(--border-subtle)">
      <button id="go-to-notifications-btn" style="width:100%;padding:8px 0;background:var(--bg-input);border:1px solid var(--border-default);border-radius:6px;font-size:12px;color:var(--text-primary);font-weight:600;cursor:pointer;font-family:var(--font-sans)">Go To Notifications</button>
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

  dropdown.querySelector('#go-to-notifications-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.remove();
    navigate('/notifications');
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
  
  dropdown.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border-subtle)">
      <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${user.name}</div>
      <div style="font-size:12px;color:var(--text-muted)">${user.email}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:var(--text-muted)">Plan: ${planBadge}</div>
    </div>
    <div id="dd-profile" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">${getSvgIcon('user', 14)} Profile</div>
    <div id="dd-settings" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">${getSvgIcon('settings', 14)} Settings</div>
    ${canDo('settings', 'manage', user) ? `<div id="dd-subscription" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">${getSvgIcon('subscription', 14)} Subscription</div>` : ''}
    <div style="height:1px;background:var(--border-subtle);margin:4px 0"></div>
    <div id="dd-logout" class="dropdown-item" style="padding:10px 16px;cursor:pointer;font-size:13px;color:var(--accent-rose);display:flex;align-items:center;gap:8px">${getSvgIcon('logout', 14)} Sign Out</div>
  `;

  const isSidebar = anchor.id === 'user-menu-btn';
  
  if (isSidebar) {
    document.body.appendChild(dropdown);
    
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
    document.body.appendChild(dropdown);
  }


  dropdown.querySelectorAll('.dropdown-item').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = 'rgba(99,102,241,0.08)');
    el.addEventListener('mouseleave', () => el.style.background = 'transparent');
  });

  setTimeout(() => document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) dropdown.remove();
  }, { once: true }), 50);
  
  dropdown.querySelector('#dd-logout')?.addEventListener('click', async () => { dropdown.remove(); await logout(); navigate('/login'); });
  dropdown.querySelector('#dd-profile')?.addEventListener('click', () => { navigate('/profile'); dropdown.remove(); });
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
  const isAdmin  = canDo('settings', 'edit', user);
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
    case 'table':     navigate('/tables?id=' + encodeURIComponent(cmd.id)); break;
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
          <div style="display:flex;justify-content:flex-end;margin-bottom:16px;margin-top:-8px">
            <a href="#/forgot-password" style="font-size:12.5px;color:var(--brand-500);text-decoration:none;font-weight:600">Forgot Password?</a>
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

function renderForgotPassword() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      ${authBgHTML()}
      <div class="auth-card animate-slideUp">
        <div class="auth-logo" style="cursor:pointer" onclick="window.location.hash='#/'">
          <div class="auth-logo-icon">⚡</div>
          <span class="auth-logo-name">WareOps</span>
        </div>
        <h1 class="auth-title">Reset password</h1>
        <p class="auth-subtitle">Enter your email to request a reset token</p>
        <form id="forgot-form">
          <div class="auth-input-group">
            <span class="auth-input-icon">📧</span>
            <input type="email" id="forgot-email" class="form-control" placeholder="Email address" required autocomplete="email" />
          </div>
          <button type="submit" class="btn btn-primary" id="forgot-btn">
            Send Reset Token
          </button>
        </form>
        <div id="dev-reset-link-container" style="margin-top:16px;display:none;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px;font-size:13px;color:var(--text-secondary);text-align:left">
          <strong>Development Mode reset link:</strong><br/>
          <a id="dev-reset-link" href="#" style="color:var(--brand-500);word-break:break-all"></a>
        </div>
        <div class="auth-footer">
          Remember password? <a href="#/login">Sign in</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const btn = document.getElementById('forgot-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Requesting...';
    
    const { apiFetch } = await import('../modules/store.js');
    const res = await apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });

    if (res.error) {
      showToast('Error', res.error, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Send Reset Token';
      return;
    }

    showToast('Success', 'Password reset token generated.', 'success');
    btn.disabled = false;
    btn.innerHTML = 'Send Reset Token';
    
    const token = res.data && res.data.token;
    if (token) {
      const resetLink = `${window.location.origin}${window.location.pathname}#/reset-password?token=${token}`;
      const devContainer = document.getElementById('dev-reset-link-container');
      const devLink = document.getElementById('dev-reset-link');
      if (devContainer && devLink) {
        devLink.href = `#/reset-password?token=${token}`;
        devLink.textContent = resetLink;
        devContainer.style.display = 'block';
      }
    }
  });
}

function renderResetPassword() {
  const hash = window.location.hash || '';
  const queryPart = hash.split('?')[1];
  const params = new URLSearchParams(queryPart);
  const token = params.get('token');

  if (!token) {
    document.getElementById('app').innerHTML = `
      <div class="auth-page">
        ${authBgHTML()}
        <div class="auth-card animate-slideUp">
          <h1 class="auth-title" style="color:var(--text-danger)">Invalid Request</h1>
          <p class="auth-subtitle">Password reset token is missing or malformed.</p>
          <div class="auth-footer">
            <a href="#/login">Back to Login</a>
          </div>
        </div>
      </div>
    `;
    return;
  }

  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      ${authBgHTML()}
      <div class="auth-card animate-slideUp">
        <div class="auth-logo" style="cursor:pointer" onclick="window.location.hash='#/'">
          <div class="auth-logo-icon">⚡</div>
          <span class="auth-logo-name">WareOps</span>
        </div>
        <h1 class="auth-title">Create new password</h1>
        <p class="auth-subtitle">Enter your new secure password (min 8 characters)</p>
        <form id="reset-form">
          <div class="auth-input-group">
            <span class="auth-input-icon">🔒</span>
            <input type="password" id="reset-password" class="form-control" placeholder="New Password" required minlength="8" />
          </div>
          <div class="auth-input-group">
            <span class="auth-input-icon">🔒</span>
            <input type="password" id="reset-confirm" class="form-control" placeholder="Confirm New Password" required minlength="8" />
          </div>
          <button type="submit" class="btn btn-primary" id="reset-btn">
            Reset Password
          </button>
        </form>
        <div class="auth-footer">
          Remember password? <a href="#/login">Sign in</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('reset-password').value;
    const confirmPassword = document.getElementById('reset-confirm').value;
    const btn = document.getElementById('reset-btn');

    if (newPassword !== confirmPassword) {
      showToast('Validation Error', 'Passwords do not match.', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Resetting...';

    const { apiFetch } = await import('../modules/store.js');
    const res = await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword })
    });

    if (res.error) {
      showToast('Reset failed', res.error, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Reset Password';
      return;
    }

    showToast('Success', 'Password has been reset successfully.', 'success');
    setTimeout(() => {
      navigate('/login');
    }, 1500);
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

  // Low stock items calculated dynamically based on threshold
  const allLowStockItems = items.filter(i => {
    const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
    return (i.stock || 0) <= threshold;
  });
  const lowStock = allLowStockItems.slice(0, 5);

  // Top warehouse by revenue
  const topWh = whs.length ? [...whs].sort((a,b)=>(b.revenue||0)-(a.revenue||0))[0] : null;

  // Recent bills
  const recentBills = bills.slice(0,5);

  // Role-specific warehouse
  const myWh = !isSA ? whs.find(w=>w.id===user.warehouseId) : null;
  const roleLabel = isSA ? 'Global Overview' : `${myWh?.name || 'Warehouse'} Overview`;

  // Smart Restock Logic: Identify items with low stock relative to sales velocity using dynamic threshold
  const restockSuggestions = items
    .filter(i => {
      const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
      return (i.stock || 0) <= threshold;
    })
    .map(i => {
      const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
      const salesCount = bills.reduce((acc, b) => acc + (b.items?.filter(bi => bi.id === i.id).reduce((s, bi) => s + bi.qty, 0) || 0), 0);
      const priority = (salesCount * 2) + (threshold - (i.stock || 0));
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
        ${canViewInventory ? `<div class="stat-card" id="dash-stock-units-card" style="cursor:pointer">
          <div class="stat-card-glow" style="background:#f59e0b"></div>
          <div class="stat-card-icon" style="background:rgba(245,158,11,0.15)">${getSvgIcon('items', 20)}</div>
          <div class="stat-card-value">${totalStock.toLocaleString()}</div>
          <div class="stat-card-label">Stock Units</div>
          <div class="stat-card-trend ${allLowStockItems.length>0?'trend-down':'trend-up'}">${allLowStockItems.length} low stock</div>
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
                <div style="display:flex;align-items:center">${renderWarehouseLogo(wh.logo, 20)}</div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${wh.name}</span>
                    <span style="font-family:var(--font-mono);font-size:9px;background:var(--bg-card);padding:1px 5px;border-radius:4px;color:var(--text-muted);border:1px solid var(--border-subtle);flex-shrink:0;">#${wh.id.slice(-6)}</span>
                  </div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${wh.staffCount||0} staff · ${formatCurrency(wh.revenue||0)}</div>
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
            <div style="display:flex;justify-content:center;margin-bottom:8px">${renderWarehouseLogo(myWh.logo, 40)}</div>
            <div style="font-size:16px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;justify-content:center;gap:6px">
              ${myWh.name}
              <span style="font-family:var(--font-mono);font-size:11px;background:var(--bg-input);padding:2px 6px;border-radius:4px;color:var(--text-muted);border:1px solid var(--border-subtle)">#${myWh.id.slice(-6)}</span>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;margin-top:4px">${myWh.businessName}</div>
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
              <div class="clickable-list-item" onclick="location.hash='#/items?id=${i.id}'" style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border-subtle);cursor:pointer;border-radius:4px;transition:background 0.15s;" onmouseenter="this.style.background='var(--bg-input)'" onmouseleave="this.style.background='transparent'">
                <div style="font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${i.name}</div>
                <span style="font-size:11px;font-weight:700;color:${i.stock<=(i.lowStockThreshold !== undefined ? i.lowStockThreshold/2 : 10)?'var(--accent-rose)':'var(--accent-amber)'};flex-shrink:0;margin-left:8px">${i.stock} left</span>
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
                <div class="clickable-list-item" onclick="location.hash='#/items?id=${s.id}'" style="background:rgba(255,255,255,0.02);padding:12px;border-radius:10px;border:1px solid var(--border-default);display:flex;align-items:center;gap:12px;cursor:pointer;transition:transform 0.15s, background 0.15s;" onmouseenter="this.style.background='var(--bg-input)';this.style.transform='translateY(-2px)'" onmouseleave="this.style.background='rgba(255,255,255,0.02)';this.style.transform=''">
                  <div style="width:36px;height:36px;background:var(--bg-card);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0">${getSvgIcon('items', 18)}</div>
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${s.name}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${s.salesCount} units sold · Priority: ${s.priority > (s.lowStockThreshold !== undefined ? s.lowStockThreshold*1.5 : 30) ? 'High' : 'Normal'}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:14px;font-weight:800;color:${s.stock <= (s.lowStockThreshold !== undefined ? s.lowStockThreshold/2 : 10) ? 'var(--accent-rose)' : 'var(--accent-amber)'}">${s.stock}</div>
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

  setTimeout(() => initDashboardCharts(whs), 100);
}

/**
 * Initializes and draws the dashboard analytics charts.
 * Creates a monthly revenue bar chart and a warehouse revenue distribution doughnut chart.
 * Recreates instances as needed to avoid resource leaks or overlay duplication.
 * @param {Array<Object>} bills - Loaded invoices/billing items.
 * @param {Array<Object>} whs - Active warehouses.
 * @private
 */
async function initDashboardCharts(whs) {
  // Fetch dynamic trends data from the API
  let fullTrends = [];
  const trendsRes = await apiFetch('/analytics/trends');
  if (trendsRes && trendsRes.success && Array.isArray(trendsRes.data)) {
    fullTrends = trendsRes.data;
  }

  const renderTrendChart = (monthsCount) => {
    const subset = fullTrends.slice(-monthsCount);
    let labels = [];
    let data = [];
    if (subset.length > 0) {
      labels = subset.map(t => t.monthName.split(' ')[0]); // e.g. "Jun"
      data = subset.map(t => t.totalRevenue);
    } else {
      // Fallback
      const now = new Date();
      for (let i = monthsCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(d.toLocaleString('default', { month: 'short' }));
        data.push(0);
      }
    }

    const rc = document.getElementById('revenue-chart');
    if (rc) {
      if (_dashboardCharts.revenue) {
        try { _dashboardCharts.revenue.destroy(); } catch(e) {}
      }
      const parent = rc.parentElement;
      const newCanvas = document.createElement('canvas');
      newCanvas.id = 'revenue-chart';
      parent.replaceChild(newCanvas, rc);
      
      _dashboardCharts.revenue = new Chart(newCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Revenue',
            data,
            backgroundColor: data.map((_, i) => i === data.length - 1 ? 'rgba(99,102,241,0.9)' : 'rgba(99,102,241,0.35)'),
            borderColor: '#6366f1',
            borderWidth: 1,
            borderRadius: 6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1a1d3a',
              titleColor: '#f1f5f9',
              bodyColor: '#94a3b8',
              borderColor: '#2a2d4a',
              borderWidth: 1,
              callbacks: { label: ctx => ' $' + ctx.raw.toLocaleString() }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
            y: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: { color: '#64748b', font: { size: 11 }, callback: v => '$' + (v / 1000).toFixed(0) + 'k' },
              border: { display: false }
            }
          }
        }
      });
    }
  };

  // Initial draw: last 6 months
  renderTrendChart(6);

  // Set up listeners for time-range togglers
  const btn6m = document.getElementById('chart-6m');
  const btn1y = document.getElementById('chart-1y');
  if (btn6m && btn1y) {
    btn6m.classList.add('active'); // Style active button
    btn6m.addEventListener('click', () => {
      btn6m.classList.add('active');
      btn1y.classList.remove('active');
      renderTrendChart(6);
    });
    btn1y.addEventListener('click', () => {
      btn1y.classList.add('active');
      btn6m.classList.remove('active');
      renderTrendChart(12);
    });
  }

  const stockCard = document.getElementById('dash-stock-units-card');
  if (stockCard) {
    stockCard.addEventListener('click', () => {
      const firstLowStockId = allLowStockItems[0]?.id || '';
      window.location.hash = '#/items' + (firstLowStockId ? '?id=' + firstLowStockId : '');
    });
  }

  // Doughnut chart
  const wc = document.getElementById('wh-chart');
  if (wc && whs.length > 0) {
    if (_dashboardCharts.wh) {
      try { _dashboardCharts.wh.destroy(); } catch(e) {}
    }
    const parent = wc.parentElement;
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'wh-chart';
    parent.replaceChild(newCanvas, wc);
    
    // Generate colors cyclically based on number of warehouses
    const palette = ['rgba(99,102,241,0.85)', 'rgba(16,185,129,0.85)', 'rgba(6,182,212,0.85)', 'rgba(245,158,11,0.85)', 'rgba(168,85,247,0.85)'];
    const bgColors = whs.map((_, i) => palette[i % palette.length]);
    
    _dashboardCharts.wh = new Chart(newCanvas, {
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

  const _handleWarehousesStorageSync = () => {
    const u = getCurrentUser();
    if (!u || u.role !== 'super_admin') {
      window.removeEventListener('wareops_storage_sync', _handleWarehousesStorageSync);
      return;
    }
    refreshShell();
  };

  window.removeEventListener('wareops_storage_sync', _handleWarehousesStorageSync);
  window.addEventListener('wareops_storage_sync', _handleWarehousesStorageSync);
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
          ${renderWarehouseLogo(wh.logo, 40)}
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
                  <td data-label="Logo">${renderWarehouseLogo(wh.logo, 32)}</td>
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
  const canManageWorkforce = canDo('workforce', 'view', user);

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
            ${renderWarehouseLogo(wh.logo, 60)}
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
          <div id="wh-detail-trend-bars" style="display:flex;align-items:flex-end;gap:6px;height:100px;padding:0 4px">
            <div style="width:100%;text-align:center;color:var(--text-muted);font-size:12px">Loading trend data...</div>
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
            ${canManageWorkforce?`<button class="btn btn-secondary btn-sm" onclick="location.hash='#/workforce'" style="font-size:11px">Manage →</button>`:''}
          </div>
          ${staff.length===0
            ?`<div style="text-align:center;padding:24px;color:var(--text-muted)">No staff assigned</div>`
            :`<div class="table-wrap"><table>
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Since</th></tr></thead>
              <tbody>${staff.map(u=>`
                <tr>
                  <td data-label="Name">
                    <div style="display:flex;align-items:center;gap:8px">
                      ${renderAvatarContainer(u.avatar, u.name, 28)}
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

  // Load dynamic trend analytics
  apiFetch(`/analytics/trends?warehouseId=${whId}`).then(res => {
    const barsContainer = document.getElementById('wh-detail-trend-bars');
    if (!barsContainer) return;
    
    if (res && res.success && Array.isArray(res.data)) {
      const trends = res.data.slice(-6); // last 6 months
      const maxRevenue = Math.max(...trends.map(t => t.totalRevenue), 1);
      
      barsContainer.innerHTML = trends.map((t, i) => {
        const val = t.totalRevenue;
        const h = maxRevenue > 0 ? Math.max(Math.round(val / maxRevenue * 100), 2) : 2;
        const isLast = i === trends.length - 1;
        return `
          <div style="flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px">
            <div style="font-size:10px;color:var(--text-muted);white-space:nowrap">${val > 0 ? '$' + (val / 1000).toFixed(1) + 'k' : '&nbsp;'}</div>
            <div style="width:100%;height:60px;display:flex;align-items:flex-end;justify-content:center">
              <div style="width:100%;height:${h}%;background:${isLast ? 'var(--brand-500)' : 'rgba(99,102,241,0.4)'};border-radius:4px 4px 0 0;transition:height 0.3s;min-height:4px" title="$${val.toLocaleString()}"></div>
            </div>
            <div style="font-size:10px;color:var(--text-muted)">${t.monthName.split(' ')[0]}</div>
          </div>
        `;
      }).join('');
    } else {
      barsContainer.innerHTML = '<div style="width:100%;text-align:center;color:var(--text-muted);font-size:12px">No trend data available</div>';
    }
  }).catch(err => {
    console.error('Failed to load warehouse trend data:', err);
    const barsContainer = document.getElementById('wh-detail-trend-bars');
    if (barsContainer) {
      barsContainer.innerHTML = '<div style="width:100%;text-align:center;color:var(--accent-rose);font-size:12px">Error loading trend data</div>';
    }
  });

  const _handleWarehouseDetailStorageSync = () => {
    const u = getCurrentUser();
    if (!u) {
      window.removeEventListener('wareops_storage_sync', _handleWarehouseDetailStorageSync);
      return;
    }
    renderWarehouseDetail(whId);
  };

  window.removeEventListener('wareops_storage_sync', _handleWarehouseDetailStorageSync);
  window.addEventListener('wareops_storage_sync', _handleWarehouseDetailStorageSync);
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
  if (!user || !canDo('workforce', 'view')) { navigate('/dashboard'); return; }

  const whs = getWarehouses();
  let activeWfTab = 'members';

  const updateWfTabUI = () => {
    const tabHeaders = document.querySelectorAll('.wf-tab-header');
    tabHeaders.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === activeWfTab);
    });

    const contentArea = document.getElementById('workforce-tab-content');
    if (!contentArea) return;

    if (activeWfTab === 'members') {
      contentArea.innerHTML = `
        <!-- Table Toolbar -->
        <div class="table-toolbar">
          <div class="table-search">
            <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span>
            <input type="text" id="wf-search" placeholder="Search by name, email..." value="${wf_searchQ}" />
          </div>
          <div class="table-filter">
            <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="role-filter">
              <option value="">All Roles</option>
              ${getAllRoles().map(r => `<option value="${r.id}" ${roleFilter === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
            </select>
            <select class="form-control" style="width:auto;padding:8px 12px;font-size:13px" id="wh-filter-wf">
              <option value="">All Warehouses</option>
              ${whs.map(w=>`<option value="${w.id}" ${wf_whFilter === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
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
      `;

      renderWorkforceTable();
      bindMembersTabEvents();
    } else {
      renderPendingDocumentsQueue(contentArea);
    }
  };

  const bindMembersTabEvents = () => {
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
  };

  renderShell('Workforce', 'Manage users, roles, and warehouse assignments', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Workforce Management</h1>
          <p class="page-subtitle">Centralized user and role management across all warehouses</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canDo('settings', 'manage') ? `<button class="btn btn-ghost btn-sm" onclick="location.hash='#/roles'">${getSvgIcon('workforce', 13)} Roles</button>` : ''}
          ${canDo('workforce', 'create') ? `<button class="btn btn-primary" id="create-user-btn">+ Add User</button>` : ''}
        </div>
      </div>

      <!-- Stats Row -->
      <div id="workforce-stats"></div>

      <!-- Tab Navigation -->
      <div class="table-toolbar" style="margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:0;gap:4px">
        <button class="wf-tab-header btn btn-ghost btn-sm active" data-tab="members" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Workforce Members</button>
        ${(user.role === 'super_admin' || user.role === 'admin' || user.role === 'manager') ? `
          <button class="wf-tab-header btn btn-ghost btn-sm" data-tab="documents" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Document Review Queue</button>
        ` : ''}
      </div>

      <!-- Tab Content Area -->
      <div id="workforce-tab-content"></div>
    </div>
  `);

  renderWorkforceStats();
  updateWfTabUI();

  // Bind tab header click events
  document.querySelectorAll('.wf-tab-header').forEach(btn => {
    btn.addEventListener('click', () => {
      activeWfTab = btn.dataset.tab;
      updateWfTabUI();
    });
  });

  const _handleWorkforceStorageSync = () => {
    const u = getCurrentUser();
    if (!u) {
      window.removeEventListener('wareops_storage_sync', _handleWorkforceStorageSync);
      return;
    }
    renderWorkforceStats();
    if (activeWfTab === 'members') {
      renderWorkforceTable();
    } else {
      const contentArea = document.getElementById('workforce-tab-content');
      if (contentArea) renderPendingDocumentsQueue(contentArea);
    }
  };

  window.removeEventListener('wareops_storage_sync', _handleWorkforceStorageSync);
  window.addEventListener('wareops_storage_sync', _handleWorkforceStorageSync);
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
                  <button class="action-btn view idcard-btn" data-uid="${u.id}" title="Generate ID Card">🪪</button>
                  ${canDo('workforce', 'edit') ? `<button class="action-btn edit" data-uid="${u.id}" title="Edit">${getSvgIcon('edit', 14)}</button>` : ''}
                  ${canDo('workforce', 'delete') ? `<button class="action-btn delete" data-uid="${u.id}" title="Delete">${getSvgIcon('trash', 14)}</button>` : ''}
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
                <button class="btn btn-secondary btn-xs idcard-btn" data-uid="${u.id}">🪪 ID Card</button>
                ${canDo('workforce', 'edit') ? `<button class="action-btn edit btn-xs" data-uid="${u.id}">${getSvgIcon('edit', 12)}</button>` : ''}
                ${canDo('workforce', 'delete') ? `<button class="action-btn delete btn-xs" data-uid="${u.id}">${getSvgIcon('trash', 12)}</button>` : ''}
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
              <button class="action-btn view btn-xs idcard-btn" data-uid="${u.id}" title="ID Card">🪪</button>
              ${canDo('workforce', 'edit') ? `
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
  container.querySelectorAll('.idcard-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const uid = el.dataset.uid;
      const u = allUsers.find(usr => usr.id === uid);
      if (u) {
        const { showIDCardModal } = await import('./profile.js');
        showIDCardModal(u);
      }
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
      <button class="btn btn-secondary" id="pp-idcard" data-uid="${u.id}">🪪 ID Card</button>
      ${canDo('workforce', 'edit') ? `<button class="btn btn-primary" id="pp-edit" data-uid="${u.id}">Edit User</button>` : ''}
    </div>
  `;

  const modal = createModal({ title: `User Profile — ${u.name}`, body, footer, width: '820px' });
  modal.el.querySelector('#pp-close')?.addEventListener('click', modal.close);
  modal.el.querySelector('#pp-idcard')?.addEventListener('click', async () => {
    modal.close();
    const { showIDCardModal } = await import('./profile.js');
    showIDCardModal(u);
  });
  modal.el.querySelector('#pp-edit')?.addEventListener('click', () => {
    modal.close();
    showUserModal(u);
  });
}


function showUserModal(u) {
  const isEdit = !!u;
  const whs = getWarehouses();
  const currentUser = getCurrentUser();
  const allRoles = getAllRoles();
  const availableRoles = currentUser.role === 'super_admin'
    ? allRoles.filter(r => r.id !== 'super_admin')
    : allRoles.filter(r => r.id !== 'super_admin' && r.id !== 'admin');

  let m_avatar = u?.avatar || '';
  const barcodeUrl = u?.barcode ? `http://localhost:8000/api/v1/registry/barcode?code=${u.barcode}` : '';

  const body = `
    <form id="user-modal-form">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-subtle)">
        <div id="m-u-avatar-preview" style="width:60px;height:60px;border-radius:50%;${m_avatar && (m_avatar.startsWith('data:') || m_avatar.startsWith('http')) ? 'background:transparent;border:1px solid var(--border-default);' : 'background:var(--gradient-brand);'}display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:white;overflow:hidden;flex-shrink:0">
          ${renderAvatar(m_avatar, "width:100%;height:100%;object-fit:cover;border-radius:50%")}
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
            ${availableRoles.map(r=>`<option value="${r.id}" ${u?.role===r.id?'selected':''}>${r.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Assign Warehouse</label>
          <select id="m-u-wh" class="form-control">
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
    m_avatar = '';
    const preview = modal.el.querySelector('#m-u-avatar-preview');
    if (preview) {
      preview.style.background = 'var(--gradient-brand)';
      preview.style.border = 'none';
      preview.innerHTML = `<svg style="width:60%;height:60%;display:block;color:rgba(255,255,255,0.95);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
  });

  modal.el.querySelector('#m-u-save')?.addEventListener('click', async () => {
    const name = document.getElementById('m-u-name').value.trim();
    const email = document.getElementById('m-u-email').value.trim();
    const role = document.getElementById('m-u-role').value;
    const warehouseId = document.getElementById('m-u-wh').value;
    if (!name || !email || !role || (role !== 'super_admin' && !warehouseId)) { showToast('Validation', 'Fill all required fields', 'warning'); return; }
    
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
      const curUser = getCurrentUser();
      if (u.id === curUser.id) {
        updateDOMAvatars(m_avatar, name);
      }
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

async function renderPendingDocumentsQueue(container) {
  container.innerHTML = `
    <div style="display:flex;justify-content:center;padding:48px" id="doc-queue-spinner">
      <div class="spinner"></div>
    </div>
  `;
  
  const res = await apiFetch('/workforce/documents/pending');
  if (res.error) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <div style="color:var(--text-danger);margin-bottom:12px;display:flex;justify-content:center">${getSvgIcon('warning', 32)}</div>
        <h3 style="color:var(--text-secondary)">Failed to load documents queue</h3>
        <p style="color:var(--text-muted);font-size:13px">${res.error}</p>
      </div>
    `;
    return;
  }
  
  const pendingDocs = res.data || [];
  if (pendingDocs.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <div style="margin-bottom:16px;opacity:0.4;display:flex;justify-content:center">${getSvgIcon('audit', 40)}</div>
        <h3 style="color:var(--text-secondary)">No documents pending review</h3>
        <p style="color:var(--text-muted);font-size:13px">All workforce compliance documents are currently up to date.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="card animate-slideUp">
      <div class="card-header">
        <div>
          <div class="card-title">Compliance Document Queue</div>
          <div class="card-subtitle">Pending reviews for workforce credentials and identity verifications</div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Document Name</th>
              <th>Type</th>
              <th>Uploaded Date</th>
              <th>Expiry Date</th>
              <th style="text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pendingDocs.map(d => `
              <tr data-docid="${d.id}" data-userid="${d.userId}">
                <td>
                  <div>
                    <div class="primary-cell">${d.userName}</div>
                    <div class="sub-cell">${d.userEmail}</div>
                  </div>
                </td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="color:var(--text-muted)">${getSvgIcon('audit', 16)}</span>
                    <span style="font-weight:600">${d.name}</span>
                  </div>
                </td>
                <td><span class="badge badge-secondary" style="font-size:11px;padding:2px 8px">${d.type}</span></td>
                <td>${d.uploadedAt || '—'}</td>
                <td>${d.expiryDate || '—'}</td>
                <td style="text-align:right">
                  <div style="display:flex;gap:6px;justify-content:flex-end">
                    <button class="btn btn-secondary btn-xs download-btn">Download</button>
                    <button class="btn btn-success btn-xs approve-btn" style="background:var(--accent-emerald);border-color:var(--accent-emerald)">Approve</button>
                    <button class="btn btn-danger btn-xs reject-btn" style="background:var(--text-danger);border-color:var(--text-danger)">Reject</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  // Bind events
  container.querySelectorAll('tbody tr').forEach(row => {
    const docId = row.dataset.docid;
    const userId = row.dataset.userid;
    const doc = pendingDocs.find(item => item.id === docId);
    
    row.querySelector('.download-btn')?.addEventListener('click', () => {
      showToast('Secure Download', 'Retrieving encrypted document file...', 'info');
    });
    
    row.querySelector('.approve-btn')?.addEventListener('click', () => {
      handleDocumentReview(userId, docId, 'Approved', doc.name);
    });
    
    row.querySelector('.reject-btn')?.addEventListener('click', () => {
      handleDocumentReview(userId, docId, 'Rejected', doc.name);
    });
  });
}

function handleDocumentReview(userId, docId, status, docName) {
  const isApprove = status === 'Approved';
  const actionTitle = isApprove ? 'Approve Document' : 'Reject Document';
  const actionBtnClass = isApprove ? 'btn-success' : 'btn-danger';
  const actionBtnStyle = isApprove ? 'background:var(--accent-emerald);border-color:var(--accent-emerald)' : 'background:var(--text-danger);border-color:var(--text-danger)';
  
  const body = document.createElement('div');
  body.innerHTML = `
    <div style="margin-bottom:16px;font-size:13px;color:var(--text-secondary)">
      Are you sure you want to <strong>${status.toLowerCase()}</strong> the document <strong>${docName}</strong>?
    </div>
    <div class="form-group">
      <label class="form-label">${isApprove ? 'Approval Remarks (Optional)' : 'Rejection Reason (Required)'}</label>
      <textarea id="review-remarks" class="form-control" rows="3" placeholder="${isApprove ? 'Add any optional notes...' : 'Please explain why this document is rejected...'}" required></textarea>
    </div>
  `;
  
  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.gap = '12px';
  footer.style.justifyContent = 'flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary" id="review-cancel">Cancel</button>
    <button class="btn ${actionBtnClass}" id="review-submit" style="${actionBtnStyle}">${status}</button>
  `;
  
  const modal = createModal({
    title: actionTitle,
    body,
    footer
  });
  
  modal.el.querySelector('#review-cancel').addEventListener('click', () => modal.close());
  
  modal.el.querySelector('#review-submit').addEventListener('click', async () => {
    const remarks = modal.el.querySelector('#review-remarks').value.trim();
    if (!isApprove && !remarks) {
      showToast('Validation Error', 'A rejection reason is required.', 'warning');
      return;
    }
    
    modal.close();
    
    const { reviewDocument } = await import('../modules/store.js');
    const res = await reviewDocument(userId, docId, status, remarks);
    if (res && res.error) {
      showToast('Review Failed', res.error, 'error');
    } else {
      showToast('Review Recorded', `Document has been ${status.toLowerCase()}.`, 'success');
      const contentArea = document.getElementById('workforce-tab-content');
      if (contentArea) {
        renderPendingDocumentsQueue(contentArea);
      }
    }
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

  renderShell('Inventory', 'Manage items, stock, and categories', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Inventory Management</h1>
          <p class="page-subtitle">Track items, stock levels, and pricing</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canDo('inventory', 'manage') ? `<button class="btn btn-secondary btn-sm" id="generate-barcodes-btn">Generate Barcodes</button>` : ''}
          ${canDo('inventory', 'create') ? `
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
  document.getElementById('generate-barcodes-btn')?.addEventListener('click', () => showBarcodeGenerationModal());
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
  
  // Realtime storage sync auto-refresh for inventory
  window.removeEventListener('wareops_storage_sync', _handleInventoryStorageSync);
  window.addEventListener('wareops_storage_sync', _handleInventoryStorageSync);

  // Deep-link target item if id query parameter is present in URL hash
  const hash = window.location.hash || '';
  const queryPart = hash.split('?')[1];
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    const itemId = params.get('id');
    if (itemId) {
      setTimeout(() => {
        const item = getItems().find(i => i.id === itemId);
        if (item) {
          showItemCardModal(item);
        }
      }, 300);
    }
  }
}

function renderItemStats() {
  const items = getItems();
  const el = document.getElementById('item-stats');
  if (!el) return;
  const totalStock = items.reduce((s,i)=>s+(i.stock||0),0);
  const totalValue = items.reduce((s,i)=>s+((i.price||0)*(i.stock||0)),0);
  const lowStock = items.filter(i => {
    const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
    return (i.stock || 0) < threshold;
  }).length;
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
  const canEdit = canDo('inventory', 'edit') || canDo('inventory', 'delete');
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
  const hasEdit = canDo('inventory', 'edit');
  const hasDelete = canDo('inventory', 'delete');
  const showActions = hasEdit || hasDelete;
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Item</th><th>SKU</th><th>Category</th><th>Price</th>
          <th>Stock</th><th>Warehouse</th>
          ${showActions ? '<th>Actions</th>' : ''}
        </tr></thead>
        <tbody>
          ${pageItems.map(item => {
            const wh = whs.find(w=>w.id===item.warehouseId);
            const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 20;
            const healthStatus = item.healthStatus || ((item.stock || 0) === 0 ? 'Critical' : (item.stock || 0) < threshold ? 'Low Stock' : 'Healthy');
            const stockClass = healthStatus === 'Critical' ? 'badge-danger' : healthStatus === 'Low Stock' ? 'badge-warning' : 'badge-success';
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
              ${showActions ? `<td data-label="Actions">
                <div class="table-actions">
                  ${hasEdit ? `
                    <button class="action-btn add-stock" data-iid="${item.id}" title="Add Stock" style="color:var(--accent-emerald)">${getSvgIcon('plus', 14)}</button>
                    <button class="action-btn edit" data-iid="${item.id}" title="Edit">${getSvgIcon('edit', 14)}</button>
                  ` : ''}
                  ${hasDelete ? `<button class="action-btn delete" data-iid="${item.id}" title="Delete">${getSvgIcon('trash', 14)}</button>` : ''}
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
        const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 20;
        const healthStatus = item.healthStatus || ((item.stock || 0) === 0 ? 'Critical' : (item.stock || 0) < threshold ? 'Low Stock' : 'Healthy');
        const stockClass = healthStatus === 'Critical' ? 'badge-danger' : healthStatus === 'Low Stock' ? 'badge-warning' : 'badge-success';
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
                ${canDo('inventory', 'edit') ? `
                  <button class="action-btn edit" data-iid="${item.id}" title="Edit" style="padding: 4px;">${getSvgIcon('edit', 12)}</button>
                ` : ''}
                ${canDo('inventory', 'delete') ? `
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
        const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 20;
        const healthStatus = item.healthStatus || ((item.stock || 0) === 0 ? 'Critical' : (item.stock || 0) < threshold ? 'Low Stock' : 'Healthy');
        const stockClass = healthStatus === 'Critical' ? 'badge-danger' : healthStatus === 'Low Stock' ? 'badge-warning' : 'badge-success';
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
                  ${canDo('inventory', 'edit') ? `
                    <button class="action-btn add-stock" data-iid="${item.id}" title="Add Stock" style="padding: 4px;color:var(--accent-emerald)">${getSvgIcon('plus', 12)}</button>
                    <button class="action-btn edit" data-iid="${item.id}" title="Edit" style="padding: 4px;">${getSvgIcon('edit', 12)}</button>
                  ` : ''}
                  ${canDo('inventory', 'delete') ? `
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

  if (canDo('inventory', 'edit')) {
    container.querySelectorAll('.add-stock[data-iid]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = getItems().find(i => i.id === btn.dataset.iid);
        if (item) showAddStockModal(item);
      });
    });
    container.querySelectorAll('.edit[data-iid]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = getItems().find(i=>i.id===btn.dataset.iid);
        if (item) showItemModal(item);
      });
    });
  }
  if (canDo('inventory', 'delete')) {
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
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Warehouse <span class="req">*</span></label>
          <select id="m-i-wh" class="form-control" required>
            <option value="">Select warehouse</option>
            ${whs.map(w=>`<option value="${w.id}" ${item?.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Low Stock Alert Limit <span class="req">*</span></label>
          <input type="number" id="m-i-threshold" class="form-control" value="${item?.lowStockThreshold !== undefined ? item.lowStockThreshold : 20}" required min="1" />
        </div>
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
    const lowStockThreshold = parseInt(document.getElementById('m-i-threshold').value);
    if (!name||!category||isNaN(price)||isNaN(stock)||!warehouseId||isNaN(lowStockThreshold)) { showToast('Validation','Fill all required fields','warning'); return; }
    
    const data = {
      name, category, price, stock, warehouseId,
      sku: document.getElementById('m-i-sku').value || `SKU-${Date.now()}`,
      unit: document.getElementById('m-i-unit').value,
      taxCategory: 'normal',
      images: selectedImages,
      lowStockThreshold
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

function _handleInventoryStorageSync() {
  const user = getCurrentUser();
  if (!user) {
    window.removeEventListener('wareops_storage_sync', _handleInventoryStorageSync);
    return;
  }
  renderItemStats();
  renderItemsTable();
}

function showItemCardModal(item) {
  const whs = getWarehouses();
  const wh = whs.find(w => w.id === item.warehouseId);
  const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 20;
  const healthStatus = item.healthStatus || ((item.stock || 0) === 0 ? 'Critical' : (item.stock || 0) < threshold ? 'Low Stock' : 'Healthy');
  const stockClass = healthStatus === 'Critical' ? 'badge-danger' : healthStatus === 'Low Stock' ? 'badge-warning' : 'badge-success';
  const statusLabel = healthStatus;
  
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
              <span style="color:var(--text-secondary)">Low Stock Alert Limit</span>
              <strong style="color:var(--text-primary);">${threshold} ${item.unit||'pcs'}</strong>
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

function showBarcodeGenerationModal() {
  const whs = getWarehouses();
  const user = getCurrentUser();
  const items = getStore().items || [];

  const body = `
    <form id="barcode-gen-form" style="display:flex;flex-direction:column;gap:16px">
      <div class="form-group">
        <label class="form-label" style="font-weight:600;margin-bottom:8px">Generation Mode</label>
        <div style="display:flex;gap:16px;margin-bottom:8px">
          <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <input type="radio" name="gen-mode" value="existing" checked style="accent-color:var(--brand-500)" />
            Existing Inventory Item
          </label>
          <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <input type="radio" name="gen-mode" value="new" style="accent-color:var(--brand-500)" />
            Register New Item
          </label>
        </div>
      </div>

      <!-- Existing Item Section -->
      <div id="gen-existing-section" class="form-group">
        <label class="form-label">Select Inventory Item <span class="req">*</span></label>
        <select id="gen-item-select" class="form-control" style="width:100%" required>
          <option value="">-- Choose Item --</option>
          ${items.map(i => `<option value="${i.id}">${i.name} (${i.sku || 'No SKU'}) - Stock: ${i.stock}</option>`).join('')}
        </select>
        <div id="gen-item-info" style="margin-top:10px;padding:10px;border-radius:6px;background:var(--bg-elevated);border:1px solid var(--border-subtle);display:none;font-size:12px;"></div>
      </div>

      <!-- New Item Section (Hidden by default) -->
      <div id="gen-new-section" style="display:none;flex-direction:column;gap:12px;border:1px solid var(--border-subtle);padding:14px;border-radius:8px;background:var(--bg-elevated)">
        <div style="font-weight:600;font-size:13px;color:var(--brand-500);margin-bottom:4px">New Catalog Item Details</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Item Name <span class="req">*</span></label>
            <input type="text" id="gen-new-name" class="form-control" />
          </div>
          <div class="form-group">
            <label class="form-label">SKU</label>
            <input type="text" id="gen-new-sku" class="form-control" placeholder="Auto-generated if empty" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category <span class="req">*</span></label>
            <select id="gen-new-cat" class="form-control">
              ${CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Price ($) <span class="req">*</span></label>
            <input type="number" id="gen-new-price" class="form-control" min="0" step="0.01" value="0.00" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Unit</label>
            <select id="gen-new-unit" class="form-control">
              ${['pcs','kg','lbs','box','pallet','set','m','ft'].map(u=>`<option value="${u}">${u}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tax Category</label>
            <select id="gen-new-tax" class="form-control">
              <option value="normal">Normal</option>
              <option value="reduced">Reduced</option>
              <option value="exempt">Exempt</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Warehouse Partition <span class="req">*</span></label>
          <select id="gen-new-wh" class="form-control">
            <option value="">Select warehouse</option>
            ${whs.map(w=>`<option value="${w.id}" ${user.warehouseId===w.id?'selected':''}>${w.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Quantity Field -->
      <div class="form-group">
        <label class="form-label">Quantity to Generate (Max 50) <span class="req">*</span></label>
        <input type="number" id="gen-qty" class="form-control" value="10" min="1" max="50" required />
        <span id="gen-qty-hint" style="font-size:11px;color:var(--text-muted);margin-top:4px;display:block">This will generate 10 unique serial codes, register them in the registry tracker ledger, and increase the item stock count by 10.</span>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="gen-cancel-btn">Cancel</button>
    <button class="btn btn-primary" id="gen-submit-btn" style="display:inline-flex;align-items:center;gap:6px">
      ${getSvgIcon('export', 14)} Generate Barcodes
    </button>
  `;

  const modal = createModal({ title: 'Batch Generate Barcodes & Sync Stock', body, footer });

  // Bind change listeners to update item details and quantity hint dynamically
  const itemSelectEl = modal.el.querySelector('#gen-item-select');
  const itemInfoEl = modal.el.querySelector('#gen-item-info');
  const qtyInputEl = modal.el.querySelector('#gen-qty');
  const qtyHintEl = modal.el.querySelector('#gen-qty-hint');

  itemSelectEl?.addEventListener('change', () => {
    const selectedItem = items.find(i => i.id === itemSelectEl.value);
    if (selectedItem) {
      itemInfoEl.style.display = 'block';
      itemInfoEl.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div><span style="color:var(--text-secondary)">SKU:</span> <strong style="font-family:var(--font-mono)">${selectedItem.sku || '—'}</strong></div>
          <div><span style="color:var(--text-secondary)">Current Stock:</span> <strong>${selectedItem.stock} ${selectedItem.unit || 'pcs'}</strong></div>
          <div><span style="color:var(--text-secondary)">Unit Price:</span> <strong>${formatCurrency(selectedItem.price || 0)}</strong></div>
          <div><span style="color:var(--text-secondary)">Category:</span> <strong>${selectedItem.category}</strong></div>
        </div>
      `;
    } else {
      itemInfoEl.style.display = 'none';
      itemInfoEl.innerHTML = '';
    }
  });

  qtyInputEl?.addEventListener('input', () => {
    const val = parseInt(qtyInputEl.value) || 0;
    qtyHintEl.textContent = `This will generate ${val} unique serial codes, register them in the registry tracker ledger, and increase the item stock count by ${val}.`;
  });

  // Toggle Mode Listeners
  modal.el.querySelectorAll('input[name="gen-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = e.target.value;
      const existingSec = modal.el.querySelector('#gen-existing-section');
      const newSec = modal.el.querySelector('#gen-new-section');
      const itemSelect = modal.el.querySelector('#gen-item-select');
      
      const newName = modal.el.querySelector('#gen-new-name');
      const newWh = modal.el.querySelector('#gen-new-wh');

      if (mode === 'existing') {
        existingSec.style.display = 'block';
        newSec.style.display = 'none';
        itemSelect.setAttribute('required', 'true');
        newName.removeAttribute('required');
        newWh.removeAttribute('required');
      } else {
        existingSec.style.display = 'none';
        newSec.style.display = 'flex';
        itemSelect.removeAttribute('required');
        newName.setAttribute('required', 'true');
        newWh.setAttribute('required', 'true');
      }
    });
  });

  // Cancel Button
  modal.el.querySelector('#gen-cancel-btn').addEventListener('click', () => modal.close());

  // Form Submission
  modal.el.querySelector('#gen-submit-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    const form = modal.el.querySelector('#barcode-gen-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const genMode = modal.el.querySelector('input[name="gen-mode"]:checked').value;
    const qty = parseInt(modal.el.querySelector('#gen-qty').value);
    
    if (isNaN(qty) || qty < 1 || qty > 50) {
      showToast('Validation Error', 'Quantity must be between 1 and 50.', 'warning');
      return;
    }

    const submitBtn = modal.el.querySelector('#gen-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating...';

    const payload = {
      quantity: qty,
      itemId: null,
      newItem: null
    };

    if (genMode === 'existing') {
      payload.itemId = modal.el.querySelector('#gen-item-select').value;
    } else {
      payload.newItem = {
        name: modal.el.querySelector('#gen-new-name').value.trim(),
        sku: modal.el.querySelector('#gen-new-sku').value.trim() || null,
        category: modal.el.querySelector('#gen-new-cat').value,
        price: parseFloat(modal.el.querySelector('#gen-new-price').value) || 0,
        stock: 0,
        unit: modal.el.querySelector('#gen-new-unit').value,
        taxCategory: modal.el.querySelector('#gen-new-tax').value,
        warehouseId: modal.el.querySelector('#gen-new-wh').value
      };
    }

    const res = await apiFetch('/items/generate-barcodes', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res?.success) {
      showToast('Barcodes Generated', `Successfully generated ${qty} barcodes and synced stock level.`, 'success');
      modal.close();
      await syncWithBackend();
      await renderItems();
    } else {
      showToast('Error', res?.error || 'Failed to generate barcodes.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${getSvgIcon('export', 14)} Generate Barcodes`;
    }
  });
}
window.showBarcodeGenerationModal = showBarcodeGenerationModal;

function showAddStockModal(item) {
  const body = `
    <form id="add-stock-modal-form" style="display:flex;flex-direction:column;gap:16px">
      <div style="background:var(--bg-elevated);border-left:4px solid var(--brand-500);padding:12px;border-radius:0 6px 6px 0">
        <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;font-weight:700">Target Item</div>
        <div style="font-weight:800;font-size:15px;color:var(--text-primary);margin-top:2px">${item.name}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px;font-size:12px">
          <div><span style="color:var(--text-muted)">SKU:</span> <strong style="font-family:var(--font-mono)">${item.sku || '—'}</strong></div>
          <div><span style="color:var(--text-muted)">Current Stock:</span> <strong>${item.stock} ${item.unit || 'pcs'}</strong></div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" style="font-weight:600">Quantity to Add <span class="req">*</span></label>
        <input type="number" id="stock-qty-add" class="form-control" min="1" required placeholder="Enter positive number..." />
      </div>
      <div class="form-group">
        <label class="form-label" style="font-weight:600">Adjustment Notes / Reason</label>
        <textarea id="stock-notes" class="form-control" style="resize:vertical;min-height:80px" placeholder="Optional audit trail note (e.g. Restock delivery, supplier check)..."></textarea>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="add-stock-cancel">Cancel</button>
    <button class="btn btn-primary" id="add-stock-submit" style="display:inline-flex;align-items:center;gap:6px">
      ${getSvgIcon('check', 14)} Adjust Stock
    </button>
  `;

  const modal = createModal({ title: 'Add Inventory Stock', body, footer });

  modal.el.querySelector('#add-stock-cancel').addEventListener('click', () => modal.close());

  modal.el.querySelector('#add-stock-submit').addEventListener('click', async (e) => {
    e.preventDefault();
    const qtyInput = modal.el.querySelector('#stock-qty-add');
    const notesInput = modal.el.querySelector('#stock-notes');
    
    if (!qtyInput.checkValidity()) {
      qtyInput.reportValidity();
      return;
    }
    
    const qty = parseInt(qtyInput.value) || 0;
    if (qty <= 0) {
      showToast('Validation Error', 'Quantity must be a positive number greater than 0.', 'warning');
      return;
    }
    
    const newStock = item.stock + qty;
    const notes = notesInput.value.trim() || 'Manual stock intake';
    
    const submitBtn = modal.el.querySelector('#add-stock-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';
    
    const res = await updateItem(item.id, {
      ...item,
      stock: newStock
    });
    
    if (res && res.error) {
      showToast('Error', res.error, 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${getSvgIcon('check', 14)} Adjust Stock`;
      return;
    }
    
    const user = getCurrentUser();
    addAuditLog('stock_adjust', `Added ${qty} units to ${item.name} (New Stock: ${newStock}). Reason: ${notes}`, user.id);
    
    showToast('Stock Updated', `Successfully added ${qty} units to ${item.name}.`, 'success');
    modal.close();
    renderItemStats();
    renderItemsTable();
  });
}
window.showAddStockModal = showAddStockModal;

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

// NexWare Upgrade Module States
let _columnWidths      = {};
let _sidebarCollapsed  = false;
let _selectedCell      = null;
let _undoStack         = [];
let _redoStack         = [];
let _cellFormats       = new Map(); // `${rowId}:${colId}` -> format styles
let _cellPreValue      = null;
let _lastSavedTime     = Date.now();
let _isOffline         = false;
let _saveStatusInterval= null;
let _pendingSaveRows   = new Set();

// Central Registry dynamic filters
let _registrySearchQ   = '';
let _registryTypeFilter = '';
let _registryWhFilter   = '';


// ─── Entry point ──────────────────────────────────────────────────────────────
async function renderTables() {
  const user     = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }

  if (!canDo('tables', 'view')) {
    showToast('Access Denied', "You do not have permission to access tables.", 'error');
    window.location.hash = '#/dashboard';
    return;
  }

  // Parse deep-linked table ID from hash query parameters if present
  const hash = window.location.hash;
  const match = hash.match(/[?&]id=([^&]+)/);
  if (match && match[1]) {
    _activeTableId = decodeURIComponent(match[1]);
  } else {
    _activeTableId = null;
  }

  const whs      = getWarehouses();
  const canManage = canDo('tables', 'create');

  // Auto-seed system tables on list view entry
  if (!_activeTableId && canManage) {
    await _ensureSystemTables();
  }

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

  const canCreate = canDo('tables', 'create');
  const canEditSchema = canDo('tables', 'edit');
  const canDeleteSchema = canDo('tables', 'delete');
  const canGenerateBarcodes = canDo('inventory', 'manage');

  renderShell('Tables', 'Dynamic table builder and spreadsheet workspace', `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Table Builder</h1>
          <p class="page-subtitle">Airtable-style inline spreadsheet workspaces</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
          ${canGenerateBarcodes ? `<button class="btn btn-secondary btn-sm" id="generate-barcodes-btn-tbl">Generate Barcodes</button>` : ''}
          ${canCreate ? `<button class="btn btn-primary" id="create-tbl-btn">+ New Table</button>` : ''}
        </div>
      </div>

      ${schemas.length === 0 ? `
        <div class="card" style="text-align:center;padding:80px 40px">
          <div style="font-size:48px;margin-bottom:20px;opacity:0.4;display:flex;justify-content:center;color:var(--text-muted)">${getSvgIcon('tables', 48)}</div>
          <h2 style="color:var(--text-secondary);margin-bottom:8px">No tables yet</h2>
          <p style="color:var(--text-muted);font-size:14px;margin-bottom:28px">Create your first table and start tracking data like a spreadsheet</p>
          ${canCreate ? `<button class="btn btn-primary" id="create-tbl-btn-empty">+ Create First Table</button>` : ''}
        </div>
      ` : `
        <div class="table-toolbar" style="margin-bottom:16px">
          <div class="table-search"><span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 16)}</span><input type="text" id="tbl-search" placeholder="Search tables..." /></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Table Name</th><th>Category</th><th>Warehouse</th>
              <th>Columns</th><th>Access Users</th><th>Created</th><th>Actions</th>
            </tr></thead>
            <tbody id="tbl-list-body">
              ${schemas.map(t => {
                const wh = whs.find(w => w.id === t.warehouseId);
                return `<tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <div style="width:32px;height:32px;border-radius:8px;background:${t.headerColor||'#6366f1'};display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0">
                        ${getSvgIcon('tables', 16)}
                      </div>
                      <div>
                        <div class="primary-cell">${t.name}</div>
                        <div class="sub-cell">${t.description||'No description'}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="badge badge-brand">${t.category||'—'}</span></td>
                  <td><span class="badge badge-info">${wh?.name||'All Warehouses'}</span></td>
                  <td>${(t.columns||[]).length} cols</td>
                  <td>${_renderAccessUsersStack(t)}</td>
                  <td>${formatDate(t.createdAt)}</td>
                  <td>
                    <div class="table-actions">
                      <button class="action-btn view" data-tid="${t.id}" title="Open Spreadsheet">${getSvgIcon('analytics', 14)}</button>
                      ${canEditSchema ? `<button class="action-btn edit" data-tid="${t.id}" title="Edit Schema">${getSvgIcon('edit', 14)}</button>` : ''}
                      ${canDeleteSchema ? `<button class="action-btn delete" data-tid="${t.id}" title="Delete">${getSvgIcon('trash', 14)}</button>` : ''}
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
  document.getElementById('generate-barcodes-btn-tbl')?.addEventListener('click', () => {
    if (typeof window.showBarcodeGenerationModal === 'function') {
      window.showBarcodeGenerationModal();
    } else {
      showToast('Error', 'Barcode module not loaded.', 'error');
    }
  });
  document.getElementById('tbl-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#tbl-list-body tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  document.querySelectorAll('.action-btn.view[data-tid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      _activePage = 1;
      window.location.hash = '#/tables?id=' + encodeURIComponent(btn.dataset.tid);
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
// ─── SPREADSHEET WORKSPACE ────────────────────────────────────────────────────
async function _openSpreadsheet(user, canManage) {
  const whs = getWarehouses();
  // Fetch schema + rows
  let schema = null;
  const res = await apiFetch(`/dynamic-tables/${_activeTableId}`);
  if (res?.success) {
    schema = res.data;
  } else {
    const schemaRes = await apiFetch(`/dynamic-tables/`);
    if (schemaRes?.success && Array.isArray(schemaRes.data)) {
      schema = schemaRes.data.find(t => t.id === _activeTableId) || null;
      if (!schema) {
        schema = schemaRes.data.find(t => t.name === _activeTableId || t.name?.toLowerCase() === _activeTableId.toLowerCase()) || null;
      }
    }
  }
  _schema = schema;

  if (!_schema) {
    showToast('Error', 'Table not found', 'error');
    _activeTableId = null;
    await renderTables();
    return;
  }

  // Canonicalize the active table ID and URL hash to use the actual resolved ID
  if (_activeTableId !== _schema.id) {
    _activeTableId = _schema.id;
    window.location.hash = `#/tables?id=${encodeURIComponent(_activeTableId)}`;
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

  let url = `/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`;
  if (_activeTableId === 'central_registry') {
    if (_registrySearchQ) url += `&search=${encodeURIComponent(_registrySearchQ)}`;
    if (_registryTypeFilter) url += `&entityType=${encodeURIComponent(_registryTypeFilter)}`;
    if (_registryWhFilter) url += `&warehouseId=${encodeURIComponent(_registryWhFilter)}`;
  }
  const rowsRes = await apiFetch(url);
  _rows = (rowsRes?.success && Array.isArray(rowsRes.data)) ? rowsRes.data : [];

  const isRegistry = _activeTableId === 'central_registry';
  const canEdit   = canDo('tables', 'edit') && !isRegistry;
  const canDelete = canDo('tables', 'delete') && !isRegistry;
  const canImport = canDo('tables', 'import') && !isRegistry;
  const canExport = canDo('tables', 'export');
  const canCreate = canDo('tables', 'create') && !isRegistry;
  const cols      = _schema.columns || [];
  const headerColor = _schema.headerColor || '#6366f1';

  // Resolve metadata values
  const accessUsers = _getAccessUsers(_schema);
  const ownerUser = getStore().users.find(u => u.id === _schema.createdBy) || { name: 'System' };
  const ownerName = ownerUser.name;
  
  // Total storage usage estimation
  const totalStorage = _schema.pages ? _schema.pages.reduce((acc, p) => acc + (p.storage_usage || 0), 0) : 0;

  renderShell(_schema.name, `Spreadsheet Workspace · ${_rows.length} rows · ${cols.length} columns`, `
    <div class="animate-slideUp" id="spreadsheet-workspace">
      <!-- Layout Header -->
      <div class="page-header" style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div class="page-header-left" style="display:flex;align-items:center;gap:10px">
          <button class="btn btn-secondary btn-sm" id="ss-back">← All Tables</button>
          <h1 class="page-title" style="margin:0;font-size:18px;display:flex;align-items:center;gap:8px">
            <span style="color:${headerColor};display:flex;align-items:center">${getSvgIcon('tables', 18)}</span>
            <span>${_schema.name}</span>
          </h1>
          <span class="badge badge-brand">${_schema.category}</span>
        </div>

        ${isRegistry ? `
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div class="table-search" style="max-width:200px;margin:0">
              <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 14)}</span>
              <input type="text" id="ss-grid-search" placeholder="Search ID, barcode..." value="${_registrySearchQ || ''}" />
            </div>
            <select class="form-control" style="width:auto;padding:4px 8px;font-size:12px;height:30px;border-radius:6px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle)" id="ss-registry-type-filter">
              <option value="">All Types</option>
              <option value="invoice" ${_registryTypeFilter === 'invoice' ? 'selected' : ''}>Invoices (INV)</option>
              <option value="warehouse" ${_registryTypeFilter === 'warehouse' ? 'selected' : ''}>Warehouses (WH)</option>
              <option value="employee" ${_registryTypeFilter === 'employee' ? 'selected' : ''}>Workforce (EMP)</option>
              <option value="inventory" ${_registryTypeFilter === 'inventory' ? 'selected' : ''}>Inventory (ITEM)</option>
              <option value="table_registry" ${_registryTypeFilter === 'table_registry' ? 'selected' : ''}>Operational Tables (TBL)</option>
              <option value="customer" ${_registryTypeFilter === 'customer' ? 'selected' : ''}>CRM Customers (CUST)</option>
            </select>
            ${user.role === 'super_admin' ? `
              <select class="form-control" style="width:auto;padding:4px 8px;font-size:12px;height:30px;border-radius:6px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle)" id="ss-registry-wh-filter">
                <option value="">All Warehouses</option>
                <option value="Global" ${_registryWhFilter === 'Global' ? 'selected' : ''}>Global Scoped</option>
                ${whs.map(w => `<option value="${w.id}" ${_registryWhFilter === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
              </select>
            ` : ''}
          </div>
        ` : `
          <div class="table-search" style="max-width:240px;margin:0">
            <span style="display:flex;align-items:center;color:var(--text-muted)">${getSvgIcon('search', 14)}</span>
            <input type="text" id="ss-grid-search" placeholder="Search rows..." />
          </div>
        `}

        <div class="page-header-actions" style="display:flex;align-items:center;gap:8px">
          ${isRegistry ? `
            <button class="btn btn-primary btn-sm" id="ss-print-barcodes-btn" style="display:flex;align-items:center;gap:4px">
              ${getSvgIcon('export', 14)} Print Barcodes
            </button>
          ` : `
            <div id="ss-save-status-container" style="display:inline-flex;align-items:center;gap:6px;font-size:12px">
              <span id="ss-save-status-indicator" class="badge badge-success">Saved just now</span>
              <button class="btn btn-primary btn-sm" id="ss-save-now-btn" style="padding:4px 8px;font-size:11px;font-weight:600">Save</button>
            </div>
            <button class="btn btn-secondary btn-sm" id="ss-toggle-sidebar" style="display:flex;align-items:center;gap:4px">
              ${getSvgIcon('info', 14)} Details
            </button>
            ${canEdit ? `<button class="btn btn-secondary btn-sm" id="ss-scan-btn" style="display:flex;align-items:center;gap:4px">${getSvgIcon('search', 14)} Scan Entity</button>` : ''}
          `}
        </div>
      </div>

      <!-- Google Sheets-style drop-down menus -->
      <div class="ss-toolbar-menus">
        <div class="ss-menu-item">
          <button class="ss-menu-btn">File</button>
          <div class="ss-menu-dropdown">
            ${canCreate ? `<button class="ss-menu-dropdown-item" id="menu-file-new">New Spreadsheet</button>` : ''}
            ${canImport ? `<button class="ss-menu-dropdown-item" id="menu-file-import">Import</button>` : ''}
            ${canExport ? `<button class="ss-menu-dropdown-item" id="menu-file-export">Download</button>` : ''}
            ${canCreate ? `<button class="ss-menu-dropdown-item" id="menu-file-copy">Make a copy</button>` : ''}
            ${canEdit ? `<button class="ss-menu-dropdown-item" id="menu-file-share">Share</button>` : ''}
            ${canEdit ? `<button class="ss-menu-dropdown-item" id="menu-file-rename">Rename</button>` : ''}
            ${canDelete ? `<button class="ss-menu-dropdown-item" id="menu-file-bin">Move to bin</button>` : ''}
            <button class="ss-menu-dropdown-item" id="menu-file-history">Version history</button>
          </div>
        </div>

        <div class="ss-menu-item">
          <button class="ss-menu-btn">Edit</button>
          <div class="ss-menu-dropdown">
            <button class="ss-menu-dropdown-item" id="menu-edit-undo">Undo <span style="font-size:10px;color:var(--text-muted)">Ctrl+Z</span></button>
            <button class="ss-menu-dropdown-item" id="menu-edit-redo">Redo <span style="font-size:10px;color:var(--text-muted)">Ctrl+Y</span></button>
            <button class="ss-menu-dropdown-item" id="menu-edit-find">Find and replace</button>
          </div>
        </div>

        <div class="ss-menu-item">
          <button class="ss-menu-btn">View</button>
          <div class="ss-menu-dropdown">
            <button class="ss-menu-dropdown-item" id="menu-view-formula">Formula bar toggle</button>
            <button class="ss-menu-dropdown-item" id="menu-view-gridlines">Gridline toggle</button>
            <button class="ss-menu-dropdown-item ss-zoom-opt" data-zoom="0.5">Zoom 50%</button>
            <button class="ss-menu-dropdown-item ss-zoom-opt" data-zoom="0.75">Zoom 75%</button>
            <button class="ss-menu-dropdown-item ss-zoom-opt" data-zoom="1">Zoom 100%</button>
            <button class="ss-menu-dropdown-item ss-zoom-opt" data-zoom="1.25">Zoom 125%</button>
            <button class="ss-menu-dropdown-item ss-zoom-opt" data-zoom="1.5">Zoom 150%</button>
            <div class="ss-menu-dropdown-divider"></div>
            <button class="ss-menu-dropdown-item" id="menu-view-fullscreen">Toggle Fullscreen</button>
          </div>
        </div>

        <div class="ss-menu-item">
          <button class="ss-menu-btn">Insert</button>
          <div class="ss-menu-dropdown">
            ${canEdit ? `<button class="ss-menu-dropdown-item" id="menu-insert-row">Row</button>` : ''}
            ${canEdit ? `<button class="ss-menu-dropdown-item" id="menu-insert-col">Column</button>` : ''}
            <button class="ss-menu-dropdown-item" id="menu-insert-image">Image</button>
            <button class="ss-menu-dropdown-item" id="menu-insert-link">Link</button>
            <button class="ss-menu-dropdown-item" id="menu-insert-comment">Comment</button>
            <div class="ss-menu-dropdown-divider"></div>
            <button class="ss-menu-dropdown-item ss-func-opt" data-func="SUM">Function: SUM</button>
            <button class="ss-menu-dropdown-item ss-func-opt" data-func="AVERAGE">Function: AVERAGE</button>
            <button class="ss-menu-dropdown-item ss-func-opt" data-func="MIN">Function: MIN</button>
            <button class="ss-menu-dropdown-item ss-func-opt" data-func="MAX">Function: MAX</button>
          </div>
        </div>

        ${canEdit ? `
        <div class="ss-menu-item">
          <button class="ss-menu-btn">Format</button>
          <div class="ss-menu-dropdown">
            <button class="ss-menu-dropdown-item" id="menu-fmt-bold">Bold</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-italic">Italic</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-underline">Underline</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-strike">Strikethrough</button>
            <div class="ss-menu-dropdown-divider"></div>
            <button class="ss-menu-dropdown-item" id="menu-fmt-currency">Currency ($)</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-percent">Percentage (%)</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-dec-inc">Increase Decimals</button>
            <button class="ss-menu-dropdown-item" id="menu-fmt-dec-dec">Decrease Decimals</button>
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Quick formatting bar -->
      <div class="ss-format-bar">
        ${canEdit ? `
        <button class="ss-format-btn" id="fmt-bold" title="Bold" style="font-weight:bold">B</button>
        <button class="ss-format-btn" id="fmt-italic" title="Italic" style="font-style:italic">I</button>
        <button class="ss-format-btn" id="fmt-underline" title="Underline" style="text-decoration:underline">U</button>
        <button class="ss-format-btn" id="fmt-strike" title="Strikethrough" style="text-decoration:line-through">S</button>
        
        <div class="ss-format-divider"></div>
        
        <select class="ss-format-select" id="fmt-align" title="Text Alignment">
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>

        <select class="ss-format-select" id="fmt-size" title="Font Size">
          <option value="11px">11px</option>
          <option value="12px">12px</option>
          <option value="13px" selected>13px</option>
          <option value="14px">14px</option>
          <option value="16px">16px</option>
        </select>

        <div class="ss-format-divider"></div>

        <button class="ss-format-btn" id="fmt-currency" title="Format Currency">$</button>
        <button class="ss-format-btn" id="fmt-percent" title="Format Percentage">%</button>
        <button class="ss-format-btn" id="fmt-dec-inc" title="Increase Decimals">.00→</button>
        <button class="ss-format-btn" id="fmt-dec-dec" title="Decrease Decimals">←.0</button>

        <div class="ss-format-divider"></div>
        
        <!-- Visible Color Pickers -->
        <div style="display:inline-flex;align-items:center;gap:6px">
          <label title="Text Color" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary);margin:0">
            Font:
            <input type="color" id="fmt-color" style="width:22px;height:22px;border:1px solid #d1d5db;padding:0;cursor:pointer;border-radius:4px" value="#111827" />
          </label>
          <label title="Fill Background Color" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary);margin:0">
            Fill:
            <input type="color" id="fmt-bg" style="width:22px;height:22px;border:1px solid #d1d5db;padding:0;cursor:pointer;border-radius:4px" value="#ffffff" />
          </label>
        </div>

        <div class="ss-format-divider"></div>
        ` : ''}
        
        <!-- Tab pages selector container -->
        <div id="ss-pages-tabs-container" style="display:flex;align-items:center"></div>
        <div id="ss-collab-badges" class="ss-collab-area" style="margin-left:auto"></div>
      </div>

      <!-- Formula Bar -->
      <div class="ss-formula-bar" id="ss-formula-bar-container">
        <div class="ss-formula-label">fx</div>
        <div class="ss-formula-divider"></div>
        <input type="text" id="ss-formula-input" class="ss-formula-input" placeholder="Enter cell value or formula..." />
      </div>

      <!-- Main workspace container with side panel layout -->
      <div class="ss-layout-container">
        <!-- Main dynamic grid -->
        <div class="ss-grid-main">
          <div class="ss-container" id="ss-container" style="height: calc(100vh - 310px)">
            <div class="ss-grid-wrap" id="ss-grid-wrap">
              <table class="ss-grid" id="ss-grid" style="--header-color:${headerColor}">
                <thead>
                  <tr>
                    <th class="ss-th ss-th-row-num">#</th>
                    ${cols.map((c, colIdx) => `
                      <th class="ss-th" data-col="${c.id}" style="width:${_columnWidths[c.id] || 150}px">
                        <div class="ss-th-inner-excel">
                          <div class="ss-th-letter">${_getColLetter(colIdx)}</div>
                          <div class="ss-th-inner">
                            <span class="ss-col-type-icon">${_colTypeIcon(c.type)}</span>
                            <span class="ss-col-name">${c.name}</span>
                            ${c.required ? '<span class="ss-req-dot">*</span>' : ''}
                          </div>
                          <div class="col-resize-handle" data-col="${c.id}"></div>
                        </div>
                      </th>
                    `).join('')}
                    ${canDelete ? '<th class="ss-th ss-th-actions">Actions</th>' : ''}
                  </tr>
                </thead>
                <tbody id="ss-tbody">
                  ${_buildAllRows(cols, canEdit, canDelete, user)}
                </tbody>
              </table>
            </div>
            <div class="ss-status-bar" style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;font-size:12px;border-top:1px solid #e5e7eb;background:#f9fafb;color:#4b5563">
              <div style="display:flex;align-items:center;gap:8px">
                <button class="btn btn-secondary btn-sm" id="ss-prev-page-btn" title="Previous Page" style="padding:2px 6px">◀</button>
                <span style="font-weight:600" id="ss-active-sheet-name">Sheet: ${_schema.name} (Page ${_activePage})</span>
                <button class="btn btn-secondary btn-sm" id="ss-next-page-btn" title="Next Page" style="padding:2px 6px">▶</button>
              </div>
              
              <div style="display:flex;align-items:center;gap:16px">
                <span id="ss-row-count">${_rows.length} / 100 capacity</span>
                <span id="ss-footer-save-status">Sync State: Saved just now</span>
                <span id="ss-footer-buttons">
                  ${canEdit ? `
                    <button class="btn btn-secondary btn-sm" id="ss-duplicate-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600">Duplicate Sheet</button>
                    <button class="btn btn-secondary btn-sm" id="ss-add-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600">+ New Page</button>
                    ${_schema.pages?.length > 1 ? `
                      <button class="btn btn-danger btn-sm" id="ss-delete-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600;background:var(--accent-rose);border-color:var(--accent-rose);color:white">Delete Page</button>
                    ` : ''}
                  ` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar metadata panel -->
        <div class="ss-sidebar-panel ${_sidebarCollapsed ? 'collapsed' : ''}" id="ss-sidebar-panel">
          <div class="ss-sidebar-header">
            <span class="ss-sidebar-title">Table Details</span>
            <button class="action-btn" id="ss-close-sidebar" title="Collapse sidebar">${getSvgIcon('close', 14)}</button>
          </div>
          
          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Table Owner</span>
            <span class="ss-sidebar-value" style="font-weight:600">${ownerName}</span>
          </div>

          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Created Date</span>
            <span class="ss-sidebar-value">${formatDate(_schema.createdAt)}</span>
          </div>

          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Page Count</span>
            <span class="ss-sidebar-value">${_schema.pages?.length || 1} pages</span>
          </div>

          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Storage Usage</span>
            <span class="ss-sidebar-value">${totalStorage} B</span>
          </div>

          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Access Permissions</span>
            <span class="ss-sidebar-value" style="margin-top:2px">
              ${_schema.roles?.length > 0 ? _schema.roles.map(r => `<span class="badge badge-muted" style="margin-right:2px">${capitalize(r)}</span>`).join('') : '<span class="badge badge-muted">Public (All)</span>'}
            </span>
          </div>

          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Access Users</span>
            <div style="margin-top:4px">
              ${_renderAccessUsersStack(_schema)}
            </div>
          </div>
          
          <div class="ss-sidebar-item">
            <span class="ss-sidebar-label">Barcode Value</span>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);margin-top:2px">
              ${_schema.barcode || 'N/A'}
            </div>
            ${_schema.barcode ? `
              <div class="barcode-container">
                ${generateBarcodeSVG(_schema.barcode, { height: 32, showLabel: false })}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Hidden CSV input -->
    <input type="file" id="ss-csv-file" accept=".csv" style="display:none" />
  `);

  // Initialize save status states
  _lastSavedTime = Date.now();
  _updateSaveStatusText();
  if (_saveStatusInterval) clearInterval(_saveStatusInterval);
  _saveStatusInterval = setInterval(() => _updateSaveStatusText(), 10000);

  // Wire toolbar events
  document.getElementById('ss-back')?.addEventListener('click', () => {
    _activeTableId = null; _schema = null; _rows = [];
    _lockedRows.clear(); _pendingCells.clear(); _debounceSavers.clear();
    _undoStack = []; _redoStack = []; _selectedCell = null;
    if (_saveStatusInterval) {
      clearInterval(_saveStatusInterval);
      _saveStatusInterval = null;
    }
    window.location.hash = '#/tables';
    renderTables();
  });
  document.getElementById('ss-toggle-sidebar')?.addEventListener('click', () => {
    _sidebarCollapsed = !_sidebarCollapsed;
    const panel = document.getElementById('ss-sidebar-panel');
    if (panel) panel.classList.toggle('collapsed', _sidebarCollapsed);
  });
  document.getElementById('ss-close-sidebar')?.addEventListener('click', () => {
    _sidebarCollapsed = true;
    const panel = document.getElementById('ss-sidebar-panel');
    if (panel) panel.classList.add('collapsed');
  });
  document.getElementById('ss-scan-btn')?.addEventListener('click', () => {
    _showBarcodeScanModal();
  });

  // Save button
  document.getElementById('ss-save-now-btn')?.addEventListener('click', () => {
    _forceSaveAllPending();
  });
  
  // Hidden CSV Import triggers
  document.getElementById('ss-csv-file')?.addEventListener('change', e => _handleCSVImport(e, cols));

  // Toolbar menus events
  document.getElementById('menu-file-new')?.addEventListener('click', () => _showSchemaModal(null, getWarehouses()));
  document.getElementById('menu-file-import')?.addEventListener('click', () => document.getElementById('ss-csv-file').click());
  document.getElementById('menu-file-export')?.addEventListener('click', () => _exportCSV());
  document.getElementById('menu-file-copy')?.addEventListener('click', () => _cloneTable());
  document.getElementById('menu-file-share')?.addEventListener('click', () => _shareTableLink());
  document.getElementById('menu-file-rename')?.addEventListener('click', async () => {
    const newName = prompt('Enter new table name:', _schema.name);
    if (!newName || newName.trim() === _schema.name) return;
    
    const data = {
      name: newName.trim(),
      category: _schema.category,
      description: _schema.description,
      warehouseId: _schema.warehouseId,
      columns: _schema.columns,
      roles: _schema.roles,
      headerColor: _schema.headerColor
    };
    
    const res = await apiFetch(`/dynamic-tables/${_activeTableId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    
    if (res?.success) {
      showToast('Table Renamed', newName, 'success');
      _schema = res.data;
      await renderTables();
    } else {
      showToast('Error', res?.error || 'Could not rename table', 'error');
    }
  });

  document.getElementById('menu-file-bin')?.addEventListener('click', async () => {
    const ok = await confirm('Move this table to the bin and delete all its data permanently?', 'Delete Table');
    if (!ok) return;
    const res = await apiFetch(`/dynamic-tables/${_activeTableId}`, { method: 'DELETE' });
    if (res?.success) {
      showToast('Table deleted', '', 'success');
      _activeTableId = null; _schema = null; _rows = [];
      if (_saveStatusInterval) {
        clearInterval(_saveStatusInterval);
        _saveStatusInterval = null;
      }
      window.location.hash = '#/tables';
      renderTables();
    } else {
      showToast('Error', res?.error || 'Delete failed', 'error');
    }
  });

  document.getElementById('menu-file-history')?.addEventListener('click', () => {
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <p style="color:var(--text-secondary);font-size:13px">Showing revision history logs for table: <strong>${_schema.name}</strong></p>
        <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-elevated);padding:10px">
          <div style="border-left:2px solid var(--brand-500);padding-left:12px;margin-bottom:12px">
            <div style="font-weight:600;font-size:12px;color:var(--text-primary)">Current Version (Page ${_activePage})</div>
            <div style="font-size:11px;color:var(--text-muted)">Modified by you · Just now</div>
          </div>
          <div style="border-left:2px solid var(--border-default);padding-left:12px;margin-bottom:12px">
            <div style="font-weight:600;font-size:12px;color:var(--text-secondary)">Schema Registered</div>
            <div style="font-size:11px;color:var(--text-muted)">System Auto-Generation · ${formatDate(_schema.createdAt)}</div>
          </div>
        </div>
      </div>
    `;
    createModal({ title: 'Version History', body, footer: '<button class="btn btn-secondary modal-close-btn">Close</button>' });
  });

  document.getElementById('menu-edit-undo')?.addEventListener('click', () => _undo());
  document.getElementById('menu-edit-redo')?.addEventListener('click', () => _redo());
  document.getElementById('menu-edit-find')?.addEventListener('click', () => _showFindReplaceModal());

  document.querySelectorAll('.ss-zoom-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const zoom = btn.dataset.zoom;
      const grid = document.getElementById('ss-grid');
      if (grid) grid.style.fontSize = `${zoom * 13}px`;
      showToast('Zoom', `Zoom scale set to ${zoom * 100}%`, 'info');
    });
  });

  const toggleFullscreen = () => {
    const ws = document.getElementById('spreadsheet-workspace');
    if (ws) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        ws.requestFullscreen().catch(() => {
          ws.classList.toggle('fullscreen-active');
        });
      }
    }
  };
  document.getElementById('menu-view-fullscreen')?.addEventListener('click', toggleFullscreen);
  document.getElementById('menu-view-formula')?.addEventListener('click', () => {
    const fbar = document.getElementById('ss-formula-bar-container');
    if (fbar) {
      const isHidden = fbar.style.display === 'none';
      fbar.style.display = isHidden ? 'flex' : 'none';
      showToast('Formula Bar', isHidden ? 'Formula bar shown' : 'Formula bar hidden', 'info');
    }
  });
  document.getElementById('menu-view-gridlines')?.addEventListener('click', () => {
    const grid = document.getElementById('ss-grid');
    if (grid) {
      const active = grid.classList.toggle('ss-grid-no-gridlines');
      showToast('Gridlines', active ? 'Gridlines hidden' : 'Gridlines visible', 'info');
    }
  });

  document.getElementById('menu-insert-row')?.addEventListener('click', () => _appendVirtualRow(cols, canEdit, user));
  document.getElementById('menu-insert-col')?.addEventListener('click', () => _showSchemaModal(_schema, getWarehouses()));
  document.getElementById('menu-insert-image')?.addEventListener('click', () => {
    if (!_selectedCell) { showToast('Insert Image', 'Please select a cell first', 'warning'); return; }
    const url = prompt('Enter image URL:');
    if (url) _applyCellChange(_selectedCell.rowId, _selectedCell.colId, url);
  });
  document.getElementById('menu-insert-link')?.addEventListener('click', () => {
    if (!_selectedCell) { showToast('Insert Link', 'Please select a cell first', 'warning'); return; }
    const url = prompt('Enter link URL:');
    if (url) _applyCellChange(_selectedCell.rowId, _selectedCell.colId, url);
  });
  document.getElementById('menu-insert-comment')?.addEventListener('click', () => {
    if (!_selectedCell) { showToast('Insert Comment', 'Please select a cell first', 'warning'); return; }
    const comment = prompt('Enter cell comment:');
    if (comment) {
      const cellInp = _selectedCell.el.querySelector('.ss-input');
      if (cellInp) cellInp.title = comment;
      showToast('Comment added', '', 'success');
    }
  });

  // Functions buttons in insert
  document.querySelectorAll('.ss-func-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!_selectedCell) {
        showToast('Function Error', 'Please select a cell first', 'warning');
        return;
      }
      
      const func = btn.dataset.func;
      const colId = _selectedCell.colId;
      
      const numValues = _rows
        .map(r => parseFloat(r[colId]))
        .filter(v => !isNaN(v));
        
      if (numValues.length === 0) {
        showToast('Function Error', 'No numeric data in the selected column to calculate', 'warning');
        return;
      }
      
      let result = 0;
      if (func === 'SUM') {
        result = numValues.reduce((acc, v) => acc + v, 0);
      } else if (func === 'AVERAGE') {
        result = numValues.reduce((acc, v) => acc + v, 0) / numValues.length;
      } else if (func === 'MIN') {
        result = Math.min(...numValues);
      } else if (func === 'MAX') {
        result = Math.max(...numValues);
      }
      
      const finalVal = Number.isInteger(result) ? result : result.toFixed(2);
      
      _applyCellChange(_selectedCell.rowId, _selectedCell.colId, finalVal);
      showToast('Calculated ' + func, `Result: ${finalVal}`, 'success');
    });
  });

  document.getElementById('menu-data-filter')?.addEventListener('click', () => {
    const q = prompt('Filter rows containing:');
    if (q !== null) {
      document.querySelectorAll('#ss-tbody tr').forEach(tr => {
        if (tr.dataset.virtual === 'true') return;
        tr.style.display = tr.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
      });
      showToast('Filtered View', `Showing rows containing: "${q}"`, 'info');
    }
  });
  document.getElementById('menu-data-sort-asc')?.addEventListener('click', () => _sortRows('asc'));
  document.getElementById('menu-data-sort-desc')?.addEventListener('click', () => _sortRows('desc'));

  // Format menus
  const wireFmt = (btnId, type, val = null) => {
    document.getElementById(btnId)?.addEventListener('click', () => _applyFormatting(type, val));
  };
  wireFmt('menu-fmt-bold', 'bold');
  wireFmt('fmt-bold', 'bold');
  wireFmt('menu-fmt-italic', 'italic');
  wireFmt('fmt-italic', 'italic');
  wireFmt('menu-fmt-underline', 'underline');
  wireFmt('fmt-underline', 'underline');
  wireFmt('menu-fmt-strike', 'strike');
  wireFmt('fmt-strike', 'strike');
  wireFmt('menu-fmt-currency', 'currency');
  wireFmt('fmt-currency', 'currency');
  wireFmt('menu-fmt-percent', 'percent');
  wireFmt('fmt-percent', 'percent');
  wireFmt('menu-fmt-dec-inc', 'dec-inc');
  wireFmt('fmt-dec-inc', 'dec-inc');
  wireFmt('menu-fmt-dec-dec', 'dec-dec');
  wireFmt('fmt-dec-dec', 'dec-dec');

  document.getElementById('fmt-align')?.addEventListener('change', e => _applyFormatting('align', e.target.value));
  document.getElementById('fmt-size')?.addEventListener('change', e => _applyFormatting('size', e.target.value));
  document.getElementById('fmt-color')?.addEventListener('change', e => _applyFormatting('color', e.target.value));
  document.getElementById('fmt-bg')?.addEventListener('change', e => _applyFormatting('bg', e.target.value));

  // Formula input bar listener
  const formulaInput = document.getElementById('ss-formula-input');
  formulaInput?.addEventListener('input', e => {
    if (!_selectedCell) return;
    const { rowId, colId, el } = _selectedCell;
    const inp = el.querySelector('.ss-input');
    if (!inp) return;
    
    const val = formulaInput.value;
    if (inp.type === 'checkbox') {
      inp.checked = val.toLowerCase() === 'true' || val === '1' || val.toUpperCase() === 'TRUE';
    } else {
      inp.value = val;
    }
    
    const rowIdx = parseInt(el.dataset.rowIdx || el.dataset.rowidx || '0');
    _scheduleSave(rowId, rowIdx, cols, inp);
  });

  // Search input filter
  document.getElementById('ss-grid-search')?.addEventListener('input', debounce(async (e) => {
    if (_activeTableId === 'central_registry') {
      _registrySearchQ = e.target.value;
      _activePage = 1;
      await _reloadRegistryRows();
    } else {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#ss-tbody tr').forEach(tr => {
        if (tr.dataset.virtual === 'true') return;
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }
  }, 300));

  // Central Registry filters
  document.getElementById('ss-registry-type-filter')?.addEventListener('change', async (e) => {
    _registryTypeFilter = e.target.value;
    _activePage = 1;
    await _reloadRegistryRows();
  });

  document.getElementById('ss-registry-wh-filter')?.addEventListener('change', async (e) => {
    _registryWhFilter = e.target.value;
    _activePage = 1;
    await _reloadRegistryRows();
  });

  // Print barcodes action
  document.getElementById('ss-print-barcodes-btn')?.addEventListener('click', async () => {
    await _showBarcodePrintSheet();
  });

  // Footer page navigation buttons
  document.getElementById('ss-prev-page-btn')?.addEventListener('click', () => {
    if (_activePage > 1) {
      _switchPage(_activePage - 1);
    } else {
      showToast('Pagination', 'Already on the first page', 'info');
    }
  });
  document.getElementById('ss-next-page-btn')?.addEventListener('click', () => {
    const totalPages = _schema.pages?.length || 1;
    if (_activePage < totalPages) {
      _switchPage(_activePage + 1);
    } else {
      showToast('Pagination', 'Already on the last page. Use "+ New Page" to add more pages.', 'info');
    }
  });

  // Footer buttons setup
  _updateFooterButtons();

  // Attach cell + row events
  _attachGridEvents(cols, canEdit, canDelete, user);
  _renderPageTabs(canEdit);
  _updatePageMeta();
  _initColumnResizer();

  // Connect WebSocket for realtime collaboration
  _subscribeToTableEvents();
}

// ─── ROW RENDERING ────────────────────────────────────────────────────────────
function _buildAllRows(cols, canEdit, canDelete, user) {
  let html = '';
  // Real rows
  for (let i = 0; i < _rows.length; i++) {
    html += _buildRow(_rows[i], i, cols, canEdit, canDelete, user, false);
  }
  // Virtual empty rows to fill up to exactly 100 capacity
  const virtualCount = Math.max(0, 100 - _rows.length);
  for (let v = 0; v < virtualCount; v++) {
    html += _buildVirtualRow(_rows.length + v, cols, canEdit, canDelete);
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

  if (pages.length <= 1) {
    container.innerHTML = '';
    return;
  }

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
  
  let url = `/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`;
  if (_activeTableId === 'central_registry') {
    if (_registrySearchQ) url += `&search=${encodeURIComponent(_registrySearchQ)}`;
    if (_registryTypeFilter) url += `&entityType=${encodeURIComponent(_registryTypeFilter)}`;
    if (_registryWhFilter) url += `&warehouseId=${encodeURIComponent(_registryWhFilter)}`;
  }
  const rowsRes = await apiFetch(url);
  _rows = (rowsRes?.success && Array.isArray(rowsRes.data)) ? rowsRes.data : [];
  _updateRowCount();
  _updatePageMeta();
  
  const cols = _schema.columns || [];
  const user = getCurrentUser();
  const isRegistry = _activeTableId === 'central_registry';
  const canEdit = canDo('tables', 'edit') && !isRegistry;
  const canDelete = canDo('tables', 'delete') && !isRegistry;
  if (tbody) {
    tbody.innerHTML = _buildAllRows(cols, canEdit, canDelete, user);
    _attachGridEvents(cols, canEdit, canDelete, user);
  }
  
  const sheetNameEl = document.getElementById('ss-active-sheet-name');
  if (sheetNameEl) {
    sheetNameEl.textContent = `Sheet: ${_schema.name} (Page ${_activePage})`;
  }
  
  _updateFooterButtons();
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

function _buildRow(row, idx, cols, canEdit, canDelete, user, isNew = false) {
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
    ${canDelete ? `
      <td class="ss-td ss-td-actions">
        <button class="ss-action-btn ss-del-row" data-row-id="${row.id}" data-row-idx="${idx}" title="Delete row">${getSvgIcon('trash', 12)}</button>
      </td>
    ` : ''}
  </tr>`;
}

function _buildVirtualRow(idx, cols, canEdit, canDelete) {
  return `<tr class="ss-row ss-row-virtual" data-row-idx="${idx}" data-virtual="true">
    <td class="ss-td ss-td-row-num"><span class="ss-row-num" style="opacity:0.3">${idx + 1}</span></td>
    ${cols.map(col => `
      <td class="ss-td ss-cell ss-cell-virtual" data-col="${col.id}" data-row-idx="${idx}"
          data-type="${col.type}" data-virtual="true">
        <span class="ss-cell-placeholder"></span>
      </td>
    `).join('')}
    ${canDelete ? `<td class="ss-td ss-td-actions"></td>` : ''}
  </tr>`;
}

function _buildEditableCell(value, col, rowId, rowIdx) {
  const v = value ?? '';
  const id = `cell-${rowId}-${col.id}`;
  
  // Resolve cell formats
  const fmtKey = `${rowId}:${col.id}`;
  const fmt = _cellFormats.get(fmtKey) || {};
  let style = '';
  if (fmt.bold) style += 'font-weight:bold;';
  if (fmt.italic) style += 'font-style:italic;';
  if (fmt.underline) style += 'text-decoration:underline;';
  if (fmt.strike) style += 'text-decoration:line-through;';
  if (fmt.align) style += `text-align:${fmt.align};`;
  if (fmt.size) style += `font-size:${fmt.size};`;
  if (fmt.color) style += `color:${fmt.color};`;
  if (fmt.bg) style += `background-color:${fmt.bg};`;

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
          data-col-id="${col.id}" data-row-idx="${rowIdx}" style="${style}">
        <option value="">—</option>
        ${opts.map(o => `<option value="${o}" ${normalized === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>`;
    }

    case 'status':
      return `<select id="${id}" class="ss-input ss-select ss-status-select" data-row-id="${rowId}"
          data-col-id="${col.id}" data-row-idx="${rowIdx}" style="${style}">
        <option value="">—</option>
        ${['Todo','In Progress','Done'].map(s => `<option value="${s}" ${v === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>`;

    case 'number':
    case 'price':
      return `<input type="number" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}"
        step="${col.type === 'price' ? '0.01' : '1'}" min="0" style="${style}" />`;

    case 'date':
      return `<input type="date" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}" style="${style}" />`;

    default:
      return `<input type="text" id="${id}" class="ss-input" value="${v}"
        data-row-id="${rowId}" data-col-id="${col.id}" data-row-idx="${rowIdx}"
        placeholder="…" style="${style}" />`;
  }
}

function _buildReadonlyCell(value, col) {
  const v = value ?? '';
  if (v === '' || v === null || v === undefined) return '<span style="color:var(--text-disabled)">—</span>';
  
  if (col.id === 'barcode') {
    let code = v;
    if (typeof v === 'string' && v.includes('code=')) {
      code = v.split('code=')[1];
    }
    const srcVal = `http://localhost:8000/api/v1/registry/barcode?code=${code}`;
    return `<img src="${srcVal}" style="max-height:28px;max-width:80px;object-fit:contain;border-radius:4px;display:block;cursor:pointer;margin:0 auto;" onclick="window.showImagePreviewModal('${srcVal}')" />`;
  }

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
    default: {
      const isUrlOrPath = typeof v === 'string' && (
        v.startsWith('data:') || 
        v.startsWith('http://') || 
        v.startsWith('https://') || 
        v.startsWith('http') || 
        v.startsWith('/') || 
        v.startsWith('./') || 
        v.startsWith('../') ||
        v.match(/\.(jpeg|jpg|gif|png|svg|webp)($|\?)/i)
      );
      if (isUrlOrPath) {
        const srcVal = v.startsWith('/api/') ? 'http://localhost:8000' + v : v;
        return `<img src="${srcVal}" style="max-height:28px;max-width:80px;object-fit:contain;border-radius:4px;display:block;cursor:pointer;margin:0 auto;" onclick="window.showImagePreviewModal('${srcVal}')" />`;
      }
      return `<span>${v}</span>`;
    }
  }
}

// ─── GRID EVENT ATTACHMENT ─────────────────────────────────────────────────────
function _attachGridEvents(cols, canEdit, canDelete, user) {
  const tbody = document.getElementById('ss-tbody');
  if (!tbody) return;

  // Selection handler
  tbody.addEventListener('mousedown', e => {
    const td = e.target.closest('.ss-cell');
    if (!td) return;

    document.querySelectorAll('.ss-cell-selected').forEach(el => el.classList.remove('ss-cell-selected'));
    td.classList.add('ss-cell-selected');

    const rowId = td.dataset.row;
    const colId = td.dataset.col;
    const colName = cols.find(c => c.id === colId)?.name || '';

    _selectedCell = { rowId, colId, el: td };

    const selInfo = document.getElementById('ss-selected-info');
    if (selInfo) {
      selInfo.textContent = `Selected: ${colName} (Row ${parseInt(td.dataset.rowIdx) + 1})`;
    }

    // Sync selected cell value with the formula input bar
    const inp = td.querySelector('.ss-input');
    const formulaBar = document.getElementById('ss-formula-input');
    if (formulaBar) {
      if (inp) {
        formulaBar.value = inp.type === 'checkbox' ? (inp.checked ? 'TRUE' : 'FALSE') : inp.value;
      } else {
        formulaBar.value = '';
      }
    }

    // Update formatting toolbar states based on cell styling cache
    const fmtKey = `${rowId}:${colId}`;
    const fmt = _cellFormats.get(fmtKey) || {};
    _updateFormatBtnStates(fmt);
  });

  // Event delegation for all ss-input changes
  tbody.addEventListener('change', e => {
    const inp = e.target.closest('.ss-input');
    if (!inp) return;
    const rowId   = inp.dataset.rowId;
    const colId   = inp.dataset.colId;
    const rowIdx  = parseInt(inp.dataset.rowIdx);

    if (rowId && colId) {
      const newValue = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (newValue !== _cellPreValue) {
        _pushToUndoStack({ rowId, colId, oldValue: _cellPreValue, newValue });
      }
    }

    if (inp.dataset.virtual === 'true' || !rowId) {
      // Click on virtual row → promote to real row
      _handleVirtualCellChange(inp, cols, canEdit, canDelete, user);
      return;
    }
    _scheduleSave(rowId, rowIdx, cols, inp);
  });

  tbody.addEventListener('input', e => {
    const inp = e.target.closest('.ss-input[type="text"], .ss-input[type="number"], .ss-input[type="date"]');
    if (!inp || !inp.dataset.rowId) return;
    const rowIdx = parseInt(inp.dataset.rowIdx);
    _scheduleSave(inp.dataset.rowId, rowIdx, cols, inp);

    // Sync typing value to formula input bar dynamically
    const formulaBar = document.getElementById('ss-formula-input');
    if (formulaBar) {
      formulaBar.value = inp.value;
    }
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
    if (!canDelete) {
      showToast('Permission denied', 'You do not have permission to delete rows.', 'error');
      return;
    }
    const rowId  = btn.dataset.rowId;
    const rowIdx = parseInt(btn.dataset.rowIdx);
    _deleteRow(rowId, rowIdx, cols, canEdit, user);
  });

  // Emit row_lock over WebSocket on focusin
  tbody.addEventListener('focusin', e => {
    const inp = e.target.closest('.ss-input');
    if (!inp) return;
    
    // Capture pre-edit value for undo stack
    _cellPreValue = inp.type === 'checkbox' ? inp.checked : inp.value;

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
    _lastSavedTime = Date.now();
    _updateSaveStatusText();
    showToast('Row saved', '', 'success');
  } else {
    showToast('Save failed', res?.error || 'Check field values', 'error');
    _updateSaveStatusText('Save error');
  }
}

// ─── AUTO-SAVE ─────────────────────────────────────────────────────────────────
function _scheduleSave(rowId, rowIdx, cols, triggerInput) {
  _pendingSaveRows.add(rowId);
  _updateSaveStatusText('Syncing...');

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
  if (!tr) { 
    _savingRows.delete(rowId); 
    _pendingSaveRows.delete(rowId);
    return; 
  }

  const rowData = _collectRowData(tr, cols);

  const res = await apiFetch(`/dynamic-tables/${_activeTableId}/rows/${rowId}`, {
    method: 'PUT',
    body: JSON.stringify(rowData)
  });

  _savingRows.delete(rowId);
  _pendingSaveRows.delete(rowId);
  _showSavingIndicator(false);

  if (res?.success && res.data) {
    // Optimistic update — update local array
    const localIdx = _rows.findIndex(r => r.id === rowId);
    if (localIdx !== -1) _rows[localIdx] = res.data;
    _lastSavedTime = Date.now();
    _updateSaveStatusText();
  } else {
    showToast('Save error', res?.error || 'Row could not be saved', 'error');
    _updateSaveStatusText('Save error');
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

function _updateSaveStatusText(statusOverride = null) {
  const indicator = document.getElementById('ss-save-status-indicator');
  const footerStatus = document.getElementById('ss-footer-save-status');
  
  let text = '';
  let badgeClass = 'badge-success';
  
  if (statusOverride) {
    text = statusOverride;
    if (statusOverride === 'Syncing...') {
      badgeClass = 'badge-warning';
    } else if (statusOverride.startsWith('Offline') || statusOverride.includes('error') || statusOverride.includes('failed')) {
      badgeClass = 'badge-danger';
    }
  } else if (!window.navigator.onLine || _isOffline) {
    text = 'Offline / reconnecting';
    badgeClass = 'badge-danger';
  } else {
    const diffMs = Date.now() - _lastSavedTime;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 5) {
      text = 'Saved just now';
    } else if (diffSec < 60) {
      text = 'Saved a few seconds ago';
    } else if (diffSec < 3600) {
      text = 'Saved a few minutes ago';
    } else {
      text = 'Saved a few hours ago';
    }
  }
  
  if (indicator) {
    indicator.textContent = text;
    indicator.className = `badge ${badgeClass}`;
  }
  if (footerStatus) {
    footerStatus.textContent = `Sync State: ${text}`;
  }
}

async function _forceSaveAllPending() {
  if (_pendingSaveRows.size === 0) {
    showToast('Save', 'No pending changes to save', 'info');
    _updateSaveStatusText();
    return;
  }
  
  _updateSaveStatusText('Syncing...');
  _showSavingIndicator(true);
  
  const cols = _schema.columns || [];
  const savePromises = Array.from(_pendingSaveRows).map(async (rowId) => {
    const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
    if (!tr) return;
    const rowIdx = parseInt(tr.dataset.rowIdx);
    await _saveRow(rowId, rowIdx, cols);
  });
  
  await Promise.all(savePromises);
  _pendingSaveRows.clear();
  _showSavingIndicator(false);
  _lastSavedTime = Date.now();
  _updateSaveStatusText();
  showToast('Save Complete', 'All changes saved to database', 'success');
}

// Register network status listeners
window.addEventListener('online', () => { _isOffline = false; _updateSaveStatusText(); });
window.addEventListener('offline', () => { _isOffline = true; _updateSaveStatusText(); });

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
  const canEdit = canDo('tables', 'edit');

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
  const isRegistry = _activeTableId === 'central_registry';
  const canEdit = canDo('tables', 'edit') && !isRegistry;
  const canDelete = canDo('tables', 'delete') && !isRegistry;
  const tbody  = document.getElementById('ss-tbody');
  if (tbody) {
    tbody.innerHTML = _buildAllRows(cols, canEdit, canDelete, user);
    _attachGridEvents(cols, canEdit, canDelete, user);
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
    const canEdit = canDo('tables', 'edit') && _activeTableId !== 'central_registry';
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

async function _promoteAndSaveVirtualRow(tr, cols, canEdit, canDelete, user, changedInput) {
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
    const newTrHtml = _buildRow(res.data, idx, cols, canEdit, canDelete, user, true);
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
    _attachGridEvents(cols, canEdit, canDelete, user);
    
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
    _lastSavedTime = Date.now();
    _updateSaveStatusText();
    showToast('Row created', '', 'success');
  } else {
    showToast('Save failed', res?.error || 'Check field values', 'error');
    _updateSaveStatusText('Save error');
  }
}

function _handleVirtualCellChange(inp, cols, canEdit, canDelete, user) {
  const tr = inp.closest('tr');
  if (!tr) return;
  _promoteAndSaveVirtualRow(tr, cols, canEdit, canDelete, user, inp);
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
    text: getSvgIcon('edit', 12), 
    number: '<span style="font-weight:bold;font-size:11px">#</span>', 
    price: '<span style="font-weight:bold;font-size:12px">$</span>', 
    date: getSvgIcon('clock', 12),
    checkbox: getSvgIcon('check', 12), 
    dropdown: getSvgIcon('chevron_down', 12), 
    status: getSvgIcon('info', 12), 
    tags: getSvgIcon('palette', 12)
  };
  return icons[type] || getSvgIcon('edit', 12);
}

// ─── NEXWARE UPGRADE SPREADSHEET ENGINE HELPERS ───────────────────────────────

function _getColLetter(idx) {
  let letter = '';
  while (idx >= 0) {
    letter = String.fromCharCode((idx % 26) + 65) + letter;
    idx = Math.floor(idx / 26) - 1;
  }
  return letter;
}

function _getAccessUsers(schema) {
  const store = getStore();
  const allUsers = store.users || [];
  const roles = schema.roles || [];
  
  return allUsers.filter(u => {
    if (['super_admin', 'admin'].includes(u.role)) return true;
    if (roles.length === 0) return true;
    return roles.includes(u.role);
  });
}

function _renderAccessUsersStack(schema) {
  const accessUsers = _getAccessUsers(schema);

  if (accessUsers.length === 0) {
    return `<span class="badge badge-muted">No Users</span>`;
  }

  const limit = 3;
  const displayUsers = accessUsers.slice(0, limit);
  const remaining = accessUsers.length - limit;
  const currentUser = getCurrentUser() || {};
  const isAdmin = canDo('workforce', 'view');

  const tooltipHtml = accessUsers.map(u => {
    const permLevel = _getPermissionLevel(u.role);
    const avatarImg = renderAvatar(u.avatar || u.name.slice(0, 2), 'width:100%;height:100%;object-fit:cover;border-radius:50%');
    return `
      <div class="tooltip-user-row">
        <div style="width:20px;height:20px;border-radius:50%;overflow:hidden;background:var(--gradient-brand);flex-shrink:0;display:flex;align-items:center;justify-content:center">${avatarImg}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:11px;color:#111827">${u.name}</div>
          <div style="font-size:9px;color:#6b7280">${capitalize(u.role)} · ${permLevel}</div>
          ${isAdmin ? `<div style="font-family:var(--font-mono);font-size:8px;color:#9ca3af;margin-top:1px">ID: ${u.id}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const avatarItems = displayUsers.map(u => {
    const avatarImg = renderAvatar(u.avatar || u.name.slice(0, 2), 'width:100%;height:100%;object-fit:cover;border-radius:50%');
    return `<div class="avatar-stack-item">${avatarImg}</div>`;
  }).join('');

  return `
    <div class="avatar-stack-container">
      <div class="avatar-stack">
        ${avatarItems}
        ${remaining > 0 ? `<div class="avatar-stack-more">+${remaining}</div>` : ''}
      </div>
      <div class="avatar-stack-tooltip">
        <div style="font-weight:700;font-size:10px;color:#9ca3af;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Access Users (${accessUsers.length})</div>
        ${tooltipHtml}
      </div>
    </div>
  `;
}

function _getPermissionLevel(role) {
  const mapping = {
    super_admin: 'Owner / Full Admin',
    admin: 'Administrator',
    manager: 'Write & Export',
    staff: 'Write Only',
    employee: 'Read Only'
  };
  return mapping[role] || 'Read Only';
}

function _initColumnResizer() {
  let startX, startWidth, activeHandle, activeColId;
  
  document.querySelectorAll('.col-resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      activeHandle = handle;
      activeColId = handle.dataset.col;
      const th = handle.closest('.ss-th');
      startWidth = th.offsetWidth;
      startX = e.clientX;
      handle.classList.add('active');
      
      document.addEventListener('mousemove', _onMouseMove);
      document.addEventListener('mouseup', _onMouseUp);
    });
  });
  
  function _onMouseMove(e) {
    if (!activeHandle) return;
    const diff = e.clientX - startX;
    const newWidth = Math.max(80, startWidth + diff);
    const th = activeHandle.closest('.ss-th');
    th.style.width = newWidth + 'px';
    _columnWidths[activeColId] = newWidth;
    
    document.querySelectorAll(`td[data-col="${activeColId}"]`).forEach(td => {
      td.style.width = newWidth + 'px';
    });
  }
  
  function _onMouseUp() {
    if (activeHandle) {
      activeHandle.classList.remove('active');
    }
    activeHandle = null;
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('mouseup', _onMouseUp);
  }
}

function _pushToUndoStack(change) {
  _undoStack.push(change);
  _redoStack = []; // Clear redo
}

function _undo() {
  if (_undoStack.length === 0) {
    showToast('Undo', 'Nothing to undo', 'info');
    return;
  }
  const change = _undoStack.pop();
  _redoStack.push(change);
  _applyCellChange(change.rowId, change.colId, change.oldValue);
  showToast('Undo', 'Action reverted', 'success');
}

function _redo() {
  if (_redoStack.length === 0) {
    showToast('Redo', 'Nothing to redo', 'info');
    return;
  }
  const change = _redoStack.pop();
  _undoStack.push(change);
  _applyCellChange(change.rowId, change.colId, change.newValue);
  showToast('Redo', 'Action re-applied', 'success');
}

async function _applyCellChange(rowId, colId, value) {
  const cellInp = document.querySelector(`[data-row-id="${rowId}"][data-col-id="${colId}"]`);
  if (cellInp) {
    if (cellInp.type === 'checkbox') {
      cellInp.checked = Boolean(value);
    } else {
      cellInp.value = value ?? '';
    }
    const cols = _schema.columns || [];
    const localIdx = _rows.findIndex(r => r.id === rowId);
    _scheduleSave(rowId, localIdx, cols, cellInp);
  }
}

function _applyFormatting(formatType, formatValue) {
  if (!_selectedCell) {
    showToast('Format', 'Please select a cell first', 'warning');
    return;
  }
  const { rowId, colId, el } = _selectedCell;
  const key = `${rowId}:${colId}`;
  if (!_cellFormats.has(key)) {
    _cellFormats.set(key, {});
  }
  const fmt = _cellFormats.get(key);
  const inp = el.querySelector('.ss-input');
  if (!inp) return;

  if (formatType === 'bold') {
    fmt.bold = !fmt.bold;
    inp.style.fontWeight = fmt.bold ? 'bold' : 'normal';
    document.getElementById('fmt-bold')?.classList.toggle('active', fmt.bold);
  } else if (formatType === 'italic') {
    fmt.italic = !fmt.italic;
    inp.style.fontStyle = fmt.italic ? 'italic' : 'normal';
    document.getElementById('fmt-italic')?.classList.toggle('active', fmt.italic);
  } else if (formatType === 'underline') {
    fmt.underline = !fmt.underline;
    inp.style.textDecoration = fmt.underline ? 'underline' : 'none';
    document.getElementById('fmt-underline')?.classList.toggle('active', fmt.underline);
  } else if (formatType === 'strike') {
    fmt.strike = !fmt.strike;
    inp.style.textDecoration = fmt.strike ? 'line-through' : 'none';
    document.getElementById('fmt-strike')?.classList.toggle('active', fmt.strike);
  } else if (formatType === 'align') {
    fmt.align = formatValue;
    inp.style.textAlign = formatValue;
  } else if (formatType === 'size') {
    fmt.size = formatValue;
    inp.style.fontSize = formatValue;
  } else if (formatType === 'currency') {
    const num = parseFloat(inp.value);
    if (!isNaN(num)) {
      inp.value = num.toFixed(2);
      const localIdx = _rows.findIndex(r => r.id === rowId);
      _scheduleSave(rowId, localIdx, _schema.columns, inp);
    }
  } else if (formatType === 'percent') {
    const num = parseFloat(inp.value);
    if (!isNaN(num)) {
      inp.value = num + '%';
    }
  } else if (formatType === 'dec-inc') {
    const num = parseFloat(inp.value);
    if (!isNaN(num)) {
      inp.value = (num * 10).toFixed(2);
    }
  } else if (formatType === 'dec-dec') {
    const num = parseFloat(inp.value);
    if (!isNaN(num)) {
      inp.value = (num / 10).toFixed(2);
    }
  } else if (formatType === 'color') {
    fmt.color = formatValue;
    inp.style.color = formatValue;
  } else if (formatType === 'bg') {
    fmt.bg = formatValue;
    inp.style.backgroundColor = formatValue;
  }
}

function _updateFormatBtnStates(fmt) {
  document.getElementById('fmt-bold')?.classList.toggle('active', !!fmt.bold);
  document.getElementById('fmt-italic')?.classList.toggle('active', !!fmt.italic);
  document.getElementById('fmt-underline')?.classList.toggle('active', !!fmt.underline);
  document.getElementById('fmt-strike')?.classList.toggle('active', !!fmt.strike);
  
  const alignEl = document.getElementById('fmt-align');
  if (alignEl && fmt.align) alignEl.value = fmt.align;
  
  const sizeEl = document.getElementById('fmt-size');
  if (sizeEl && fmt.size) sizeEl.value = fmt.size;

  const colorEl = document.getElementById('fmt-color');
  if (colorEl) colorEl.value = fmt.color || '#111827';

  const bgEl = document.getElementById('fmt-bg');
  if (bgEl) bgEl.value = fmt.bg || '#ffffff';
}

function _sortRows(direction) {
  if (!_selectedCell) {
    showToast('Sort', 'Please select a cell in the column to sort', 'warning');
    return;
  }
  const colId = _selectedCell.colId;
  _rows.sort((a, b) => {
    let valA = a[colId] ?? '';
    let valB = b[colId] ?? '';
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  
  const tbody = document.getElementById('ss-tbody');
  const cols = _schema.columns || [];
  const user = getCurrentUser();
  const isRegistry = _activeTableId === 'central_registry';
  const canEdit = canDo('tables', 'edit') && !isRegistry;
  const canDelete = canDo('tables', 'delete') && !isRegistry;
  if (tbody) {
    tbody.innerHTML = _buildAllRows(cols, canEdit, canDelete, user);
    _attachGridEvents(cols, canEdit, canDelete, user);
  }
  showToast('Sort Complete', `Rows sorted by column`, 'success');
}

async function _cloneTable() {
  const newName = prompt('Enter a name for the copied table:', `Copy of ${_schema.name}`);
  if (!newName) return;
  
  _showSavingIndicator(true);
  _updateSaveStatusText('Syncing...');
  
  const schemaPayload = {
    name: newName,
    category: _schema.category,
    description: _schema.description || '',
    warehouseId: _schema.warehouseId || null,
    columns: _schema.columns || [],
    roles: _schema.roles || [],
    headerColor: _schema.headerColor || '#6366f1'
  };
  
  const createRes = await apiFetch('/dynamic-tables/', {
    method: 'POST',
    body: JSON.stringify(schemaPayload)
  });
  
  if (!createRes?.success || !createRes.data) {
    _showSavingIndicator(false);
    _updateSaveStatusText();
    showToast('Clone Failed', createRes?.error || 'Could not create new schema', 'error');
    return;
  }
  
  const newTable = createRes.data;
  
  const rowsToCopy = _rows.map(r => {
    const cleanRow = { ...r };
    delete cleanRow.id;
    delete cleanRow._id;
    delete cleanRow.createdAt;
    delete cleanRow.updatedAt;
    return cleanRow;
  });
  
  if (rowsToCopy.length > 0) {
    const importRes = await apiFetch(`/dynamic-tables/${newTable.id}/rows/import?page=1`, {
      method: 'POST',
      body: JSON.stringify(rowsToCopy)
    });
    
    if (!importRes?.success) {
      showToast('Clone Warning', 'Schema cloned but rows could not be imported', 'warning');
    }
  }
  
  _showSavingIndicator(false);
  _lastSavedTime = Date.now();
  _updateSaveStatusText();
  showToast('Table Cloned Successfully', newName, 'success');
  
  _activeTableId = newTable.id;
  _activePage = 1;
  await renderTables();
}

function _shareTableLink() {
  const url = `${window.location.origin}${window.location.pathname}#/tables?id=${_activeTableId}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link Shared', 'Direct link to this table copied to clipboard', 'success');
  }).catch(() => {
    const inp = document.createElement('input');
    inp.value = url;
    document.body.appendChild(inp);
    inp.select();
    document.execCommand('copy');
    inp.remove();
    showToast('Link Shared', 'Direct link to this table copied to clipboard', 'success');
  });
}

function _showFindReplaceModal() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-group">
      <label class="form-label">Find Text</label>
      <input type="text" id="find-text" class="form-control" placeholder="Search cell text..." style="margin:0" />
    </div>
    <div class="form-group" style="margin-top:12px">
      <label class="form-label">Replace With</label>
      <input type="text" id="replace-text" class="form-control" placeholder="Replacement text..." style="margin:0" />
    </div>
    <div class="form-group" style="margin-top:12px">
      <label class="checkbox-group" style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="find-match-case" />
        <span style="font-size:13px">Match case</span>
      </label>
    </div>
  `;
  
  const footer = `
    <button class="btn btn-secondary" id="fr-cancel">Cancel</button>
    <button class="btn btn-primary" id="fr-submit">Replace All</button>
  `;
  
  const modal = createModal({ title: 'Find and Replace', body, footer });
  modal.el.querySelector('#fr-cancel').addEventListener('click', modal.close);
  modal.el.querySelector('#fr-submit').addEventListener('click', async () => {
    const findText = document.getElementById('find-text').value;
    const replaceText = document.getElementById('replace-text').value;
    const matchCase = document.getElementById('find-match-case').checked;
    
    if (findText === '') {
      showToast('Validation', 'Please enter text to find', 'warning');
      return;
    }
    
    modal.close();
    
    let replaceCount = 0;
    const cols = _schema.columns || [];
    
    _showSavingIndicator(true);
    _updateSaveStatusText('Syncing...');
    
    for (let rIdx = 0; rIdx < _rows.length; rIdx++) {
      const row = _rows[rIdx];
      let rowChanged = false;
      
      cols.forEach(col => {
        if (col.id === 'id' || col.id === '_id') return;
        
        const val = row[col.id];
        if (val === null || val === undefined) return;
        
        const strVal = String(val);
        let match = false;
        if (matchCase) {
          match = strVal.includes(findText);
        } else {
          match = strVal.toLowerCase().includes(findText.toLowerCase());
        }
        
        if (match) {
          let newVal;
          if (matchCase) {
            newVal = strVal.replaceAll(findText, replaceText);
          } else {
            const regex = new RegExp(findText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
            newVal = strVal.replace(regex, replaceText);
          }
          
          if (col.type === 'number' || col.type === 'price') {
            const num = parseFloat(newVal);
            newVal = isNaN(num) ? null : num;
          } else if (col.type === 'checkbox') {
            newVal = newVal.toLowerCase() === 'true' || newVal === '1';
          }
          
          row[col.id] = newVal;
          rowChanged = true;
          replaceCount++;
          
          const cellInp = document.querySelector(`[data-row-id="${row.id}"][data-col-id="${col.id}"]`);
          if (cellInp) {
            if (cellInp.type === 'checkbox') {
              cellInp.checked = Boolean(newVal);
            } else {
              cellInp.value = newVal ?? '';
            }
          }
        }
      });
      
      if (rowChanged) {
        await _saveRow(row.id, rIdx, cols);
      }
    }
    
    _showSavingIndicator(false);
    _lastSavedTime = Date.now();
    _updateSaveStatusText();
    
    showToast('Replace Complete', `Replaced ${replaceCount} occurrences across all cells`, 'success');
  });
}

function _showBarcodeScanModal() {
  const store = getStore();
  const allBarcodes = [];
  store.tables?.forEach(t => { if (t.barcode) allBarcodes.push({ type: 'Table', name: t.name, code: t.barcode }); });
  store.warehouses?.forEach(w => { if (w.barcode) allBarcodes.push({ type: 'Warehouse', name: w.name, code: w.barcode }); });
  store.users?.forEach(u => { if (u.barcode) allBarcodes.push({ type: 'Employee', name: u.name, code: u.barcode }); });
  store.items?.forEach(i => { if (i.barcode) allBarcodes.push({ type: 'Inventory Item', name: i.name, code: i.barcode }); });

  const body = document.createElement('div');
  body.className = 'scanner-viewfinder-modal';
  body.innerHTML = `
    <div class="scanner-modal-tabs" style="display:flex;gap:8px;border-bottom:1px solid var(--border-subtle);margin-bottom:12px;padding-bottom:8px;width:100%">
      <button class="btn btn-secondary btn-sm scanner-tab-btn active" data-tab="camera" style="flex:1">Webcam Camera</button>
      <button class="btn btn-secondary btn-sm scanner-tab-btn" data-tab="usb" style="flex:1">USB Intercept</button>
      <button class="btn btn-secondary btn-sm scanner-tab-btn" data-tab="manual" style="flex:1">Manual Fallback</button>
    </div>

    <!-- Webcam Tab -->
    <div class="scanner-tab-content" id="tab-camera" style="width:100%; display:flex; flex-direction:column; align-items:center; gap:10px">
      <div class="form-group" style="width:100%">
        <label class="form-label" style="font-size:12px">Select Camera Device</label>
        <select id="scanner-camera-select" class="form-control" style="margin:0"></select>
      </div>
      <div class="scanner-video-feed">
        <video id="scanner-video" autoplay playsinline></video>
        <div class="scanner-overlay-box">
          <div class="scanner-laser-line"></div>
        </div>
      </div>
      <div class="form-group" style="width:100%; margin-top:8px">
        <label class="form-label" style="font-size:12px">Simulated Snap-Capture Target</label>
        <select id="sim-barcode-select" class="form-control" style="margin:0">
          ${allBarcodes.map(b => `<option value="${b.code}">[${b.type}] ${b.name} (${b.code})</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-snap-simulate" style="width:100%">Simulate Scan / Snap Capture</button>
    </div>

    <!-- USB Tab -->
    <div class="scanner-tab-content" id="tab-usb" style="width:100%; display:none; flex-direction:column; gap:12px">
      <div class="form-group">
        <label class="form-label">USB Hardware Scanner Catcher</label>
        <input type="text" id="usb-scan-catcher" class="form-control" placeholder="Click here to focus scanner..." style="text-align:center;font-size:16px;font-family:var(--font-mono);border:2px solid var(--brand-500);margin:0" />
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.4">Ensure this field is focused. When the scanner sweeps a barcode, hardware keystrokes (latency &lt; 30ms) will be intercepted automatically.</div>
      </div>
    </div>

    <!-- Manual Tab -->
    <div class="scanner-tab-content" id="tab-manual" style="width:100%; display:none; flex-direction:column; gap:12px">
      <div class="form-group">
        <label class="form-label">Manual Barcode Input</label>
        <input type="text" id="manual-scan-input" class="form-control" placeholder="e.g. ITM-2026-0001, WH-2026-0002" style="font-family:var(--font-mono);margin:0" />
      </div>
      <button class="btn btn-primary" id="btn-manual-submit" style="width:100%">Locate Entity</button>
    </div>
  `;

  const footer = `<button class="btn btn-secondary" id="scan-modal-close" style="width:100%">Close</button>`;

  let activeStream = null;

  const modal = createModal({ 
    title: 'Dynamic Barcode Scan Engine', 
    body, 
    footer,
    onClose: () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
      }
    }
  });

  // Handle Close Button
  modal.el.querySelector('#scan-modal-close').addEventListener('click', modal.close);

  // Tab switching logic
  const tabBtns = modal.el.querySelectorAll('.scanner-tab-btn');
  const tabContents = modal.el.querySelectorAll('.scanner-tab-content');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetTab = btn.dataset.tab;
      tabContents.forEach(c => {
        c.style.display = c.id === `tab-${targetTab}` ? 'flex' : 'none';
      });
      if (targetTab === 'usb') {
        setTimeout(() => modal.el.querySelector('#usb-scan-catcher')?.focus(), 100);
      }
    });
  });

  // Webcam stream logic
  const cameraSelect = modal.el.querySelector('#scanner-camera-select');
  const videoEl = modal.el.querySelector('#scanner-video');

  async function startCamera(deviceId = null) {
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
    }
    try {
      const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
      };
      activeStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoEl) videoEl.srcObject = activeStream;
    } catch (err) {
      console.warn('Camera stream error:', err);
    }
  }

  // Enumerate cameras
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (cameraSelect) {
          cameraSelect.innerHTML = videoDevices.map(d => `<option value="${d.deviceId}">${d.label || 'Camera ' + (cameraSelect.options.length + 1)}</option>`).join('');
          cameraSelect.addEventListener('change', () => {
            startCamera(cameraSelect.value);
          });
        }
        return startCamera(videoDevices[0]?.deviceId);
      })
      .catch(err => console.warn('Could not enumerate cameras:', err));
  } else {
    startCamera();
  }

  // Simulated capture logic
  modal.el.querySelector('#btn-snap-simulate').addEventListener('click', () => {
    const code = modal.el.querySelector('#sim-barcode-select').value;
    if (code) {
      _handleScannedBarcode(code, modal);
    }
  });

  // USB Scanner interception logic
  let lastKeyTime = Date.now();
  let scanBuffer = '';
  const usbInput = modal.el.querySelector('#usb-scan-catcher');
  if (usbInput) {
    usbInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const finalCode = scanBuffer.trim();
        scanBuffer = '';
        usbInput.value = '';
        if (finalCode) {
          _handleScannedBarcode(finalCode, modal);
        }
        e.preventDefault();
        return;
      }
      
      const now = Date.now();
      const diff = now - lastKeyTime;
      lastKeyTime = now;
      
      // Keystroke latency < 30ms identifies barcode scanner typing
      if (diff < 30 || scanBuffer.length === 0) {
        if (e.key.length === 1) {
          scanBuffer += e.key;
          usbInput.value = scanBuffer;
        }
      } else {
        scanBuffer = e.key.length === 1 ? e.key : '';
        usbInput.value = scanBuffer;
      }
    });
  }

  // Manual fallback logic
  modal.el.querySelector('#btn-manual-submit').addEventListener('click', () => {
    const code = modal.el.querySelector('#manual-scan-input').value.trim();
    if (code) {
      _handleScannedBarcode(code, modal);
    } else {
      showToast('Validation', 'Please enter a barcode', 'warning');
    }
  });
}

async function _handleScannedBarcode(code, modal) {
  const codeClean = code.trim();
  if (!codeClean) return;
  modal.close();
  
  const store = getStore();
  
  // 1. Check Tables
  const schema = store.tables?.find(t => t.barcode === codeClean || t.enterprise_id === codeClean || t.id === codeClean);
  if (schema) {
    _activeTableId = schema.id;
    _activePage = 1;
    renderTables();
    showToast('Located Table', schema.name, 'success');
    return;
  }
  
  // 2. Check Warehouses
  const wh = store.warehouses?.find(w => w.barcode === codeClean || w.id === codeClean);
  if (wh) {
    location.hash = '#/warehouses';
    showToast('Located Warehouse', wh.name, 'success');
    return;
  }

  // 3. Check Workforce Users
  const u = store.users?.find(usr => usr.barcode === codeClean || usr.id === codeClean);
  if (u) {
    location.hash = '#/workforce';
    showToast('Located employee', u.name, 'success');
    return;
  }

  // 4. Check Inventory Items (fix redirect to #/items)
  const item = store.items?.find(i => i.barcode === codeClean || (i.barcodes && i.barcodes.includes(codeClean)) || i.sku === codeClean || i.id === codeClean);
  if (item) {
    location.hash = '#/items';
    showToast('Located Item', item.name, 'success');
    return;
  }

  // 5. Fallback API lookup
  try {
    const res = await apiFetch(`/registry/lookup?code=${encodeURIComponent(codeClean)}`);
    if (res?.success && res.data) {
      const type = res.data.entity_type;
      const entityId = res.data.entity_id;
      const name = res.data.snapshot?.name || res.data.snapshot?.billNo || entityId;
      if (type === 'inventory' || type === 'item') {
        location.hash = '#/items';
        showToast('Located Item', name, 'success');
        return;
      } else if (type === 'warehouse') {
        location.hash = '#/warehouses';
        showToast('Located Warehouse', name, 'success');
        return;
      } else if (type === 'employee' || type === 'user') {
        location.hash = '#/workforce';
        showToast('Located employee', name, 'success');
        return;
      } else if (type === 'invoice') {
        location.hash = '#/billing';
        showToast('Located Invoice', name, 'success');
        return;
      } else if (type === 'customer') {
        location.hash = '#/customers';
        showToast('Located Customer', name, 'success');
        return;
      } else if (type === 'table_registry') {
        location.hash = '#/tables';
        showToast('Located Table', name, 'success');
        return;
      }
    }
  } catch (err) {
    console.error('Scanned barcode lookup failed:', err);
  }
  
  // If we are currently editing a cell, let's write it to the cell!
  if (_selectedCell) {
    _applyCellChange(_selectedCell.rowId, _selectedCell.colId, codeClean);
    showToast('Barcode Written', `Wrote "${codeClean}" to cell`, 'success');
    return;
  }
  
  showToast('Not Found', `Barcode '${codeClean}' not registered.`, 'warning');
}

async function _reloadRegistryRows() {
  const tbody = document.getElementById('ss-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="100" style="text-align:center;padding:48px;color:var(--text-muted)">
          <span class="ss-save-spinner" style="display:inline-block;margin-right:8px">⟳</span> Refreshing Ledger…
        </td>
      </tr>
    `;
  }
  
  const schemaRes = await apiFetch(`/dynamic-tables/${_activeTableId}`);
  if (schemaRes?.success && schemaRes.data) {
    _schema = schemaRes.data;
  }
  
  let url = `/dynamic-tables/${_activeTableId}/rows?page=${_activePage}`;
  if (_registrySearchQ) url += `&search=${encodeURIComponent(_registrySearchQ)}`;
  if (_registryTypeFilter) url += `&entityType=${encodeURIComponent(_registryTypeFilter)}`;
  if (_registryWhFilter) url += `&warehouseId=${encodeURIComponent(_registryWhFilter)}`;

  const rowsRes = await apiFetch(url);
  _rows = (rowsRes?.success && Array.isArray(rowsRes.data)) ? rowsRes.data : [];
  _updateRowCount();
  _updatePageMeta();

  const cols = _schema.columns || [];
  const user = getCurrentUser();
  const isRegistry = _activeTableId === 'central_registry';
  const canEdit = canDo('tables', 'edit') && !isRegistry;
  const canDelete = canDo('tables', 'delete') && !isRegistry;
  if (tbody) {
    tbody.innerHTML = _buildAllRows(cols, canEdit, canDelete, user);
    _attachGridEvents(cols, canEdit, canDelete, user);
  }
  
  _renderPageTabs(canEdit);
  _updateFooterButtons();
}

function _updateFooterButtons() {
  const user = getCurrentUser();
  const isRegistry = _activeTableId === 'central_registry';
  const canEdit = canDo('tables', 'edit') && !isRegistry;
  const canDelete = canDo('tables', 'delete') && !isRegistry;
  const container = document.getElementById('ss-footer-buttons');
  if (!container) return;

  container.innerHTML = canEdit ? `
    <button class="btn btn-secondary btn-sm" id="ss-duplicate-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600">Duplicate Sheet</button>
    <button class="btn btn-secondary btn-sm" id="ss-add-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600">+ New Page</button>
    ${_schema.pages?.length > 1 && canDelete ? `
      <button class="btn btn-danger btn-sm" id="ss-delete-sheet-btn" style="padding:4px 8px;font-size:11px;font-weight:600;background:var(--accent-rose);border-color:var(--accent-rose);color:white">Delete Page</button>
    ` : ''}
  ` : '';

  _bindFooterButtonsEvents();
}

function _bindFooterButtonsEvents() {
  const user = getCurrentUser();
  const isRegistry = _activeTableId === 'central_registry';
  const canEdit = canDo('tables', 'edit') && !isRegistry;
  const canDelete = canDo('tables', 'delete') && !isRegistry;
  if (!canEdit) return;

  document.getElementById('ss-duplicate-sheet-btn')?.addEventListener('click', async () => {
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
    _updateSaveStatusText('Syncing...');
    
    const res = await apiFetch(`/dynamic-tables/${_activeTableId}/pages`, { method: 'POST' });
    if (!res?.success || !res.data) {
      _showSavingIndicator(false);
      _updateSaveStatusText();
      showToast('Error', res?.error || 'Could not create new page', 'error');
      return;
    }
    
    const newSchema = res.data;
    const newPageNum = newSchema.pages.length;
    
    const rowsToDuplicate = _rows.map(r => {
      const clean = { ...r };
      delete clean.id;
      delete clean._id;
      delete clean.createdAt;
      delete clean.updatedAt;
      return clean;
    });
    
    if (rowsToDuplicate.length > 0) {
      const importRes = await apiFetch(`/dynamic-tables/${_activeTableId}/rows/import?page=${newPageNum}`, {
        method: 'POST',
        body: JSON.stringify(rowsToDuplicate)
      });
      if (!importRes?.success) {
        showToast('Duplicate Sheet', 'Page created but could not clone rows', 'warning');
      }
    }
    
    _schema = newSchema;
    _showSavingIndicator(false);
    _lastSavedTime = Date.now();
    _updateSaveStatusText();
    showToast('Page Duplicated', `Page ${newPageNum} created as a copy of Page ${_activePage}`, 'success');
    
    _activePage = newPageNum;
    await _switchPage(newPageNum);
  });

  document.getElementById('ss-add-sheet-btn')?.addEventListener('click', async () => {
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
    _updateSaveStatusText('Creating Page...');
    const res = await apiFetch(`/dynamic-tables/${_activeTableId}/pages`, { method: 'POST' });
    _showSavingIndicator(false);
    _updateSaveStatusText();

    if (res?.success && res.data) {
      _schema = res.data;
      showToast('Page Created', `Page ${_schema.pages.length} added to table`, 'success');
      _activePage = _schema.pages.length;
      await _switchPage(_schema.pages.length);
    } else {
      showToast('Error', res?.error || 'Could not create new page', 'error');
    }
  });

  document.getElementById('ss-delete-sheet-btn')?.addEventListener('click', async () => {
    if (!canDelete) {
      showToast('Permission denied', 'You do not have permission to delete pages.', 'error');
      return;
    }
    const ok = await confirm(`Are you sure you want to delete Page ${_activePage} and purge all its rows? Subsequent pages will be shifted down contiguously.`, 'Delete Page');
    if (!ok) return;

    _showSavingIndicator(true);
    _updateSaveStatusText('Deleting Page...');
    const res = await apiFetch(`/dynamic-tables/${_activeTableId}/pages/${_activePage}`, { method: 'DELETE' });
    _showSavingIndicator(false);
    _updateSaveStatusText();

    if (res?.success && res.data) {
      _schema = res.data;
      showToast('Page Deleted', `Page ${_activePage} deleted successfully.`, 'success');
      const nextPage = _activePage > 1 ? _activePage - 1 : 1;
      _activePage = nextPage;
      await _switchPage(nextPage);
    } else {
      showToast('Error', res?.error || 'Could not delete page', 'error');
    }
  });
}

async function _showBarcodePrintSheet() {
  let query = `/registry/?page=1&limit=60`;
  if (_registryTypeFilter) query += `&entityType=${_registryTypeFilter}`;
  if (_registryWhFilter) query += `&warehouseId=${_registryWhFilter}`;
  if (_registrySearchQ) query += `&search=${encodeURIComponent(_registrySearchQ)}`;

  const res = await apiFetch(query);
  if (!res?.success || !res.data) {
    showToast('Failed to load barcodes', res?.error || 'Unknown error', 'error');
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
            const snap = e.metadata_snapshot || {};
            const name = snap.name || snap.customer || e.entity_type.toUpperCase();
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

async function _ensureSystemTables() {
  const res = await apiFetch('/dynamic-tables/');
  if (!res?.success || !Array.isArray(res.data)) return;
  const schemas = res.data;
  
  const warehouseExists = schemas.some(s => s.name === 'Warehouse Table' || s.name === 'Warehouse');
  const workforceExists = schemas.some(s => s.name === 'Workforce Table' || s.name === 'Workforce');
  const inventoryExists = schemas.some(s => s.name === 'Inventory Table' || s.name === 'Inventory');
  
  const user = getCurrentUser();
  if (!user || !canDo('tables', 'create')) return;

  if (!warehouseExists) {
    await apiFetch('/dynamic-tables/', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Warehouse Table',
        category: 'Operations',
        description: 'System-generated Warehouses Directory',
        columns: [
          { id: 'c_id', name: 'ID', type: 'text', required: true },
          { id: 'c_barcode', name: 'Barcode', type: 'text', required: true },
          { id: 'c_name', name: 'Name', type: 'text', required: true },
          { id: 'c_logo', name: 'Logo', type: 'text', required: false },
          { id: 'c_location', name: 'Location', type: 'text', required: false },
          { id: 'c_created', name: 'Created Date', type: 'date', required: false },
          { id: 'c_owner', name: 'Owner', type: 'text', required: false },
          { id: 'c_users', name: 'Access Users', type: 'text', required: false }
        ],
        roles: [],
        headerColor: '#06b6d4'
      })
    });
  }

  if (!workforceExists) {
    await apiFetch('/dynamic-tables/', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Workforce Table',
        category: 'HR',
        description: 'System-generated Employee Roster',
        columns: [
          { id: 'c_emp_id', name: 'Employee ID', type: 'text', required: true },
          { id: 'c_barcode', name: 'Barcode', type: 'text', required: true },
          { id: 'c_profile', name: 'Profile', type: 'text', required: false },
          { id: 'c_role', name: 'Role', type: 'text', required: true },
          { id: 'c_warehouse', name: 'Warehouse', type: 'text', required: false },
          { id: 'c_created', name: 'Created Date', type: 'date', required: false }
        ],
        roles: [],
        headerColor: '#10b981'
      })
    });
  }

  if (!inventoryExists) {
    await apiFetch('/dynamic-tables/', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Inventory Table',
        category: 'Inventory',
        description: 'System-generated Stock Catalog',
        columns: [
          { id: 'c_item_id', name: 'Item ID', type: 'text', required: true },
          { id: 'c_barcode', name: 'Barcode', type: 'text', required: true },
          { id: 'c_image', name: 'Image', type: 'text', required: false },
          { id: 'c_sku', name: 'SKU', type: 'text', required: true },
          { id: 'c_stock', name: 'Stock', type: 'number', required: false },
          { id: 'c_category', name: 'Category', type: 'text', required: false },
          { id: 'c_warehouse', name: 'Warehouse', type: 'text', required: false }
        ],
        roles: [],
        headerColor: '#f59e0b'
      })
    });
  }
}

// ===== pages/billing.js =====
/**
 * Billing & Taxation System — v2
 */







const EXCHANGE_RATES = {
  USD: 1.0,
  INR: 83.0,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  SGD: 1.34
};

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
          ${(canDo('warehouses', 'view') || canDo('reports', 'manage')) ? `
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
  
  // Realtime storage sync auto-refresh for invoices
  window.removeEventListener('wareops_storage_sync', _handleBillingStorageSync);
  window.addEventListener('wareops_storage_sync', _handleBillingStorageSync);
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
            const allWhs = getStore().warehouses || [];
            const wh = allWhs.find(w=>w.id===b.warehouseId);
            return `<tr>
              <td data-label="Bill No"><span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text-brand)">${b.billNo}</span></td>
              <td data-label="Customer"><div class="primary-cell">${b.customer}</div></td>
              <td data-label="Items"><span class="badge badge-muted">${(b.items||[]).length} item${(b.items||[]).length!==1?'s':''}</span></td>
              <td data-label="Subtotal">${formatCurrency(b.subtotal)}</td>
              <td data-label="Tax"><span style="color:var(--accent-amber)">${formatCurrency(b.tax)}</span></td>
              <td data-label="Total"><strong style="color:var(--text-primary);font-size:15px">${formatCurrency(b.total)}</strong></td>
              <td data-label="Warehouse"><span class="badge badge-info">${wh?.name || b.warehouseId || '—'}</span></td>
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
    const savedCurrency = body.querySelector('#bill-currency')?.value || wh?.currency || getActiveCurrency();
    
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
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
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
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-weight:600;">Currency</label>
              <select id="bill-currency" class="form-control">
                <option value="USD" ${savedCurrency==='USD'?'selected':''}>USD ($)</option>
                <option value="INR" ${savedCurrency==='INR'?'selected':''}>INR (₹)</option>
                <option value="EUR" ${savedCurrency==='EUR'?'selected':''}>EUR (€)</option>
                <option value="GBP" ${savedCurrency==='GBP'?'selected':''}>GBP (£)</option>
                <option value="AED" ${savedCurrency==='AED'?'selected':''}>AED (د.إ)</option>
                <option value="SGD" ${savedCurrency==='SGD'?'selected':''}>SGD (S$)</option>
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
      const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
      const isLowStock = i.stock <= threshold;
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
    const billCurrency = body.querySelector('#bill-currency')?.value || wh?.currency || getActiveCurrency();
    const baseCurrency = getActiveCurrency();
    const rate = (EXCHANGE_RATES[billCurrency] || 1.0) / (EXCHANGE_RATES[baseCurrency] || 1.0);
    
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
      currency: billCurrency,
      exchangeRate: rate,
      items: calculation.items.map(i => ({
        id: i.id,
        name: i.name,
        qty: i.qty,
        price: i.price * rate,
        taxCategory: i.taxCategory || 'normal',
        taxRate: i.taxRate,
        taxes: i.taxes ? i.taxes.map(t => ({
          name: t.name,
          taxType: t.taxType,
          rate: t.rate,
          amount: t.amount * rate
        })) : null
      })),
      subtotal: calculation.subtotal * rate,
      tax: calculation.tax * rate,
      total: calculation.total * rate,
      taxConfigSnapshot: getTaxConfig(warehouseId),
      taxDetails: calculation.taxDetails ? calculation.taxDetails.map(t => ({
        name: t.name,
        taxType: t.taxType,
        rate: t.rate,
        amount: t.amount * rate
      })) : null,
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
    ['#bill-customer', '#bill-seller-address', '#bill-seller-contact', '#bill-seller-tax', '#bill-customer-phone', '#bill-customer-email', '#bill-buyer-billing', '#bill-buyer-shipping', '#bill-currency'].forEach(sel => {
      const el = body.querySelector(sel);
      if (el) {
        const eventType = sel === '#bill-currency' ? 'change' : 'input';
        el.addEventListener(eventType, () => {
          const wh = whs.find(w => w.id === warehouseId);
          const calculationLive = calculateTaxesFrontend(billItems, warehouseId);
          renderLiveInvoicePreview(calculationLive, warehouseId, wh);
        });
      }
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

    const billCurrency = document.getElementById('bill-currency')?.value || wh?.currency || getActiveCurrency();
    const baseCurrency = getActiveCurrency();
    const rate = (EXCHANGE_RATES[billCurrency] || 1.0) / (EXCHANGE_RATES[baseCurrency] || 1.0);

    const payload = {
      customer,
      warehouseId,
      currency: billCurrency,
      exchangeRate: rate,
      items: calculation.items.map(i => ({
        id: i.id,
        name: i.name,
        price: i.price * rate,
        taxCategory: i.taxCategory || 'normal',
        taxRate: i.taxRate,
        qty: i.qty,
        taxes: i.taxes ? i.taxes.map(t => ({
          name: t.name,
          taxType: t.taxType,
          rate: t.rate,
          amount: t.amount * rate
        })) : null
      })),
      subtotal: calculation.subtotal * rate,
      tax: calculation.tax * rate,
      total: calculation.total * rate,
      taxDetails: calculation.taxDetails ? calculation.taxDetails.map(t => ({
        name: t.name,
        taxType: t.taxType,
        rate: t.rate,
        amount: t.amount * rate
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
    
    showToast('Bill generated!', `${res.billNo || 'Invoice'} — ${formatCurrency(calculation.total * rate, billCurrency)}`, 'success');
    billItems = [];
    modal.close();
    renderBilling();
  });
}



function showBillPreview(bill) {
  const allWhs = getStore().warehouses || [];
  const wh = allWhs.find(w=>w.id===bill.warehouseId);
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
  
  // Prioritize invoice-level currency, then warehouse currency, then global base currency
  const currency = bill.currency || wh?.currency || getActiveCurrency();
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
      taxRateText = i.taxes.map(t => {
        const tType = t.taxType || t.tax_type || 'percentage';
        const tRate = parseFloat(t.rate || 0);
        if (tType === 'percentage') {
          const pct = tRate <= 1 ? (tRate * 100).toFixed(0) : tRate.toFixed(0);
          return `${t.name ? t.name + ' (' + pct + '%)' : pct + '%'}`;
        } else {
          return `${t.name ? t.name + ' (' + formatCurrency(tRate, currency) + ')' : formatCurrency(tRate, currency)}`;
        }
      }).join(', ');
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
          ${renderWarehouseLogo(wh?.logo, 40)}
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
          <strong>Payment Method:</strong> Bank Transfer (Net 15)<br/>
          <strong>Currency:</strong> ${bill.currency || 'USD'} ${bill.exchangeRate && parseFloat(bill.exchangeRate) !== 1.0 ? `(Rate: ${bill.exchangeRate})` : ''}
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
  const allWhs = getStore().warehouses || [];
  const wh = allWhs.find(w=>w.id===bill.warehouseId);
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


function _handleBillingStorageSync() {
  const user = getCurrentUser();
  if (!user) {
    window.removeEventListener('wareops_storage_sync', _handleBillingStorageSync);
    return;
  }
  renderBillsTable();
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

  if (!canDo('reports', 'view')) {
    showToast('Access Denied', 'You do not have permission to access analytics & reports.', 'error');
    window.location.hash = '#/dashboard';
    return;
  }

  const isSA   = user.role === 'super_admin';
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
      ${canDo('reports', 'manage') ? `
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
      ` : `
      <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:10px;padding:30px;text-align:center;margin-bottom:20px">
        <p style="color:var(--text-muted);margin:0">Upgrade to enterprise or contact your administrator to access advanced performance graphs (reports:manage required).</p>
      </div>
      `}

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
         <div class="revenue-bar-label" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
           ${renderWarehouseLogo(wh.logo, 20)}<span>${wh.name}</span>
           <span style="font-size:11px;color:var(--text-muted)">${cnt} invoice${cnt!==1?'s':''} · Tax: ${formatCurrency(tax)}</span>
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
          <th>Threshold</th><th>Value</th><th>Status</th><th>Barcode Count</th>
        </tr></thead>
        <tbody>
          ${sorted.slice(0,10).map(i=>{
            const val = (i.price||0)*(i.stock||0);
            const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
            const healthStatus = i.healthStatus || ((i.stock || 0) === 0 ? 'Critical' : (i.stock || 0) <= threshold ? 'Low Stock' : 'Healthy');
            
            const stockClass = (i.stock||0) === 0 ? 'badge-danger' : (i.stock||0) <= threshold ? 'badge-warning' : 'badge-success';
            const statusClass = healthStatus === 'Critical' ? 'badge-danger' : healthStatus === 'Low Stock' ? 'badge-warning' : 'badge-success';
            const barcodeCount = Array.isArray(i.barcodes) ? i.barcodes.length : (i.barcode ? 1 : 0);

            return `<tr>
              <td data-label="Item"><div class="primary-cell">${i.name}</div><div class="sub-cell">${i.sku||'—'}</div></td>
              <td data-label="Category"><span class="badge badge-brand">${i.category}</span></td>
              <td data-label="Price">${formatCurrency(i.price||0)}</td>
              <td data-label="Stock"><span class="badge ${stockClass}">${i.stock||0} ${i.unit||'pcs'}</span></td>
              <td data-label="Threshold"><span style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${threshold} ${i.unit||'pcs'}</span></td>
              <td data-label="Value"><strong>${formatCurrency(val)}</strong></td>
              <td data-label="Status"><span class="badge ${statusClass}">${healthStatus}</span></td>
              <td data-label="Barcode Count"><span class="badge badge-muted" style="font-family:var(--font-mono)">${barcodeCount}</span></td>
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

let activeAuditTab = 'personal';

function renderAudit() {
  const user = getCurrentUser();
  if (!user) {
    window.location.hash = '#/login';
    return;
  }
  
  const canViewEnterprise = canDo('audit', 'view');
  if (activeAuditTab === 'enterprise' && !canViewEnterprise) {
    activeAuditTab = 'personal';
  }

  const updateAuditTabUI = () => {
    const tabHeaders = document.querySelectorAll('.audit-tab-header');
    tabHeaders.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === activeAuditTab);
    });
    au_page = 1;
    renderAuditTable();
  };
  
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

      <!-- Tab Navigation -->
      <div class="table-toolbar" style="margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:0;gap:4px">
        <button class="audit-tab-header btn btn-ghost btn-sm active" data-tab="personal" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">My Activity</button>
        ${canViewEnterprise ? `
          <button class="audit-tab-header btn btn-ghost btn-sm" data-tab="enterprise" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Company Activity</button>
        ` : ''}
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

  updateAuditTabUI();

  // Bind tab header click events
  document.querySelectorAll('.audit-tab-header').forEach(btn => {
    btn.addEventListener('click', () => {
      activeAuditTab = btn.dataset.tab;
      updateAuditTabUI();
    });
  });
  
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
    let url = `/audit-logs/?page=${au_page}&limit=${au_PER_PAGE}&scope=${activeAuditTab}`;
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
              const allUsers = getStore().users || [];
              const targetUser = allUsers.find(usr => usr.id === log.userId || usr.name === log.userName);
              const avatarVal = targetUser ? targetUser.avatar : '';
              
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
                      ${renderAvatarContainer(avatarVal, userName, 28)}
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
            <div id="settings-avatar-preview" style="width:72px;height:72px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:white;flex-shrink:0;box-shadow:var(--shadow-brand);overflow:hidden">${renderAvatar(user.avatar, "width:100%;height:100%;object-fit:cover;border-radius:50%")}</div>
            <div>
              <div style="font-size:20px;font-weight:800;margin-bottom:2px">${user.name}</div>
              <div style="font-size:13px;color:var(--text-muted)">${user.email}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
                <button class="btn btn-secondary btn-xs" id="s-upload-photo-btn" type="button" style="padding:4px 8px;font-size:11px">Upload Photo</button>
                ${(user.avatar && (user.avatar.startsWith('data:') || user.avatar.startsWith('http'))) ? `<button class="btn btn-danger btn-xs" id="s-remove-photo-btn" type="button" style="padding:4px 8px;font-size:11px;background:var(--accent-rose)">Remove Photo</button>` : ''}
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

        ${canDo('settings', 'view', user) ? `
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
              ${!canDo('settings', 'edit', user) ? '<br><span style="color:var(--accent-amber)">Note: Editing requires edit permissions.</span>' : ''}
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
            <button class="btn btn-secondary btn-sm" id="add-tax-row-btn" ${!canDo('settings', 'edit', user) ? 'disabled' : ''} style="display:flex;align-items:center;gap:6px">${getSvgIcon('plus', 14)} Add Tax Component</button>
            <div style="display:flex;align-items:center;gap:12px">
              <button class="btn btn-primary btn-sm" id="save-tax-btn" ${!canDo('settings', 'manage', user) ? 'disabled title="Requires manage permissions"' : ''} style="display:flex;align-items:center;gap:6px">${getSvgIcon('save', 14)} Save Tax Rules</button>
              <span id="tax-saved-msg" style="font-size:12px;color:var(--accent-emerald);display:none;align-items:center;gap:4px">${getSvgIcon('check', 14)} Saved!</span>
            </div>
          </div>
        </div>` : ''}

        ${canDo('settings', 'view', user) ? `
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
            <select id="s-global-currency" class="form-control" ${!canDo('settings', 'manage', user) ? 'disabled style="opacity:0.7"' : ''}>
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
            <button class="btn btn-primary btn-sm" id="save-currency-btn" ${!canDo('settings', 'manage', user) ? 'disabled title="Requires manage permissions"' : ''} style="display:flex;align-items:center;gap:6px">${getSvgIcon('save', 14)} Save Currency</button>
            <span id="currency-saved-msg" style="font-size:12px;color:var(--accent-emerald);display:none;align-items:center;gap:4px">${getSvgIcon('check', 14)} Saved!</span>
          </div>
        </div>` : ''}

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
            <select id="s-theme" class="form-control" ${!canDo('settings', 'edit', user) ? 'disabled style="opacity:0.7"' : ''}>
              <option value="enterprise" ${getStore().theme==='enterprise'||!getStore().theme?'selected':''}>Grayscale B&W (Default)</option>
              <option value="dark"       ${getStore().theme==='dark'?'selected':''}>Slate-Blue Premium Dark</option>
              <option value="light"      ${getStore().theme==='light'?'selected':''}>Enterprise Light</option>
              <option value="classic"    ${getStore().theme==='classic'?'selected':''}>Classic Space Neon</option>
            </select>
            <div class="form-hint">Theme is applied immediately across all pages. Changes persist after saving.</div>
          </div>
          <!-- Live theme preview swatches -->
          <div style="display:flex;gap:8px;margin-bottom:16px;${!canDo('settings', 'edit', user) ? 'pointer-events:none' : ''}" id="theme-swatches">
            <div data-theme="enterprise" class="theme-swatch ${!getStore().theme||getStore().theme==='enterprise'?'swatch-active':''}" title="Grayscale B&W"
              style="flex:1;height:40px;border-radius:8px;background:linear-gradient(135deg,#09090b,#18181b);border:2px solid ${!getStore().theme||getStore().theme==='enterprise'?'var(--accent-emerald)':'var(--border-default)'};cursor:pointer;position:relative;overflow:hidden;${!canDo('settings', 'edit', user) ? 'opacity:0.5' : ''}">
              <div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:9px;color:#a1a1aa;font-weight:700">B&W</div>
            </div>
            <div data-theme="dark" class="theme-swatch ${getStore().theme==='dark'?'swatch-active':''}" title="Slate-Blue Dark"
              style="flex:1;height:40px;border-radius:8px;background:linear-gradient(135deg,#0b0f19,#1e293b);border:2px solid ${getStore().theme==='dark'?'var(--accent-emerald)':'var(--border-default)'};cursor:pointer;position:relative;overflow:hidden;${!canDo('settings', 'edit', user) ? 'opacity:0.5' : ''}">
              <div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:9px;color:#60a5fa;font-weight:700">DARK</div>
            </div>
            <div data-theme="light" class="theme-swatch ${getStore().theme==='light'?'swatch-active':''}" title="Enterprise Light"
              style="flex:1;height:40px;border-radius:8px;background:linear-gradient(135deg,#f8fafc,#e2e8f0);border:2px solid ${getStore().theme==='light'?'var(--accent-emerald)':'var(--border-default)'};cursor:pointer;position:relative;overflow:hidden;${!canDo('settings', 'edit', user) ? 'opacity:0.5' : ''}">
              <div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:9px;color:#475569;font-weight:700">LIGHT</div>
            </div>
            <div data-theme="classic" class="theme-swatch ${getStore().theme==='classic'?'swatch-active':''}" title="Classic Neon"
              style="flex:1;height:40px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6,#06b6d4);border:2px solid ${getStore().theme==='classic'?'var(--accent-emerald)':'var(--border-default)'};cursor:pointer;position:relative;overflow:hidden;${!canDo('settings', 'edit', user) ? 'opacity:0.5' : ''}">
              <div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:9px;color:white;font-weight:700">NEON</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
            <button class="btn btn-primary btn-sm" id="save-theme-btn" ${!canDo('settings', 'edit', user) ? 'disabled title="Requires settings:edit permission"' : ''} style="display:flex;align-items:center;gap:6px">${getSvgIcon('save', 14)} Save Theme</button>
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
          </div>
        </div>
        ${(canDo('settings', 'export', user) || canDo('settings', 'view', user)) ? `
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
          <button class="btn btn-secondary btn-sm" id="open-export-center-btn" ${!canDo('settings', 'export', user) ? 'disabled title="Requires export permissions"' : ''} style="display:flex;align-items:center;gap:6px">
            ${getSvgIcon('export', 16)} Open Export Center
          </button>
        </div>` : ''}

        ${(user.role === 'super_admin' && canDo('settings', 'delete', user)) ? `
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
        </div>` : ''}

        ${canDo('settings', 'manage', user) ? `
        <!-- Role Manager Card -->
        <div class="card col-6" style="border-color:rgba(99,102,241,0.25);background:rgba(99,102,241,0.04)">
          <div class="card-header">
            <div>
              <div class="card-title" style="display:flex;align-items:center;gap:8px">
                ${getSvgIcon('workforce', 16)}
                Role Manager
                <span class="badge badge-success" style="font-size:10px">Manage Mode</span>
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
          <input type="text" class="form-control tax-row-name" value="${tax.name}" placeholder="e.g. CGST" ${!canDo('settings', 'edit', user) ? 'readonly' : ''} style="width: 100%;" />
        </td>
        <td style="padding: 8px;">
          <select class="form-control tax-row-type" ${!canDo('settings', 'edit', user) ? 'disabled' : ''} style="width: 100%; border: 1px solid var(--border-default); border-radius: 6px; padding: 4px 8px; background: var(--bg-card); color: var(--text-primary);">
            <option value="percentage" ${tax.taxType === 'percentage' ? 'selected' : ''}>Percentage (%)</option>
            <option value="fixed" ${tax.taxType === 'fixed' ? 'selected' : ''}>Fixed Fee ($)</option>
          </select>
        </td>
        <td style="padding: 8px;">
          <input type="number" class="form-control tax-row-rate" value="${tax.rate}" step="0.01" min="0" ${!canDo('settings', 'edit', user) ? 'readonly' : ''} style="width: 100%;" />
        </td>
        <td style="padding: 8px; text-align: center;">
          <button class="btn btn-danger btn-sm remove-tax-row-btn" data-index="${idx}" ${!canDo('settings', 'edit', user) ? 'disabled' : ''} style="padding: 4px 8px;">${getSvgIcon('trash', 14)}</button>
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

  if (canDo('settings', 'view', user)) {
    setTimeout(renderTaxRows, 50);
    document.getElementById('add-tax-row-btn')?.addEventListener('click', () => {
      if (!canDo('settings', 'edit', user)) return;
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
      if (u.avatar && !u.avatar.startsWith('data:') && !u.avatar.startsWith('http')) {
        u.avatar = '';
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
        updateDOMAvatars(base64, u.name);
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
      u.avatar = '';
      saveStore();
      updateDOMAvatars('', u.name);
      await updateUser(u.id, { avatar: '' });
      showToast('Photo removed', 'Profile photo removed successfully', 'success');
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
    if (!canDo('settings', 'manage', user)) { showToast('Permission denied','Only managers or administrators can change tax rates','error'); return; }
    
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
    if (!canDo('settings', 'manage', user)) { showToast('Permission denied','Only managers or administrators can change base currency','error'); return; }
    const currency = document.getElementById('s-global-currency').value;
    saveCurrency(currency);
    showToast('Currency updated', `Platform currency set to: ${currency}`, 'success');
    const msg = document.getElementById('currency-saved-msg');
    if (msg) { msg.style.display = 'inline-flex'; setTimeout(() => msg.style.display = 'none', 3000); }
  });

  // THEME SAVE — persist to store, apply globally
  document.getElementById('save-theme-btn')?.addEventListener('click', () => {
    if (!canDo('settings', 'edit', user)) {
      showToast('Permission Denied', 'You do not have permission to change themes.', 'error');
      return;
    }
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
      if (!canDo('settings', 'edit', user)) return;
      const t = sw.dataset.theme;
      document.getElementById('s-theme').value = t;
      applyTheme(t);
      document.querySelectorAll('.theme-swatch').forEach(s => s.style.borderColor = 'var(--border-default)');
      sw.style.borderColor = 'var(--accent-emerald)';
    });
  });

  // Theme select dropdown change — live preview
  document.getElementById('s-theme')?.addEventListener('change', (e) => {
    if (!canDo('settings', 'edit', user)) return;
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
    const categories = [
      { key:'bills',      label:'Billing & Invoices (Manager+)',   check: () => canDo('billing', 'view', user) },
      { key:'inventory',  label:'Inventory Records (Manager+)',    check: () => canDo('inventory', 'view', user) },
      { key:'workforce',  label:'Workforce Members (Admin+)',      check: () => canDo('workforce', 'view', user) },
      { key:'warehouses', label:'Warehouse Hubs (Super Admin)',    check: () => canDo('warehouses', 'view', user) },
      { key:'audit',      label:'Security Audit Logs (Super Admin)', check: () => canDo('audit', 'view', user) },
      { key:'all',        label:'Full Platform Ledger (Admin+)',   check: () => user.role === 'super_admin' || canDo('settings', 'manage', user) },
    ].filter(e => e.check());

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
    const modal = createModal({
      title: 'Secure Export Center',
      body: modalBody,
      footer: modalFooter
    });

    modal.el.querySelector('#export-modal-cancel').addEventListener('click', () => modal.close());
    modal.el.querySelector('#export-modal-run').addEventListener('click', () => {
      if (!canDo('settings', 'export', user)) {
        showToast('Permission denied', 'You do not have permission to run exports', 'error');
        return;
      }
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

  // SECURE PASSWORD-CONFIRMED RESET
  document.getElementById('reset-btn')?.addEventListener('click', () => {
    if (user.role !== 'super_admin' || !canDo('settings', 'delete', user)) {
      showToast('Unauthorized Action', 'Only the Super Administrator with delete permissions is permitted to perform platform resets.', 'error');
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
            const avatarHTML = renderAvatarContainer(u.avatar, u.name, 28);
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

// ===== pages/notifications.js =====
/**
 * Notifications Management Page
 */





let notif_filter = 'all'; // 'all' or 'unread'

function renderNotifications() {
  const user = getCurrentUser();
  if (!user) {
    navigate('/login');
    return;
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
              <span style="font-size:14px;font-weight:${n.read ? '600' : '700'};color:var(--text-primary)">${n.title}</span>
              <span style="font-size:11px;color:var(--text-disabled);font-family:var(--font-mono)">${timeSince(n.timestamp)}</span>
            </div>
            <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin:0 0 8px 0">${n.message}</p>
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

// ===== pages/profile.js =====
/**
 * User Profile Page — Comprehensive personal identity, compliance, and corporate assignments
 */






function renderProfile() {
  const user = getCurrentUser();
  if (!user) {
    navigate('/login');
    return;
  }

  // Populate default profile structure if missing to satisfy foundation requirements
  if (!user.profile) {
    user.profile = {
      jobTitle: user.role === 'super_admin' ? 'Chief Technology Officer' : 'Operations Logistics Manager',
      department: 'Operations & Engineering',
      joiningDate: '2025-06-15',
      managerId: 'super_admin',
      workType: 'Full-time',
      phone: '+1 (555) 019-2834',
      slackUsername: '@' + user.name.toLowerCase().replace(/\s+/g, '.'),
      documents: [
        { id: 'doc_1', name: 'Employment Offer Contract.pdf', status: 'Approved', uploadedAt: '2025-06-12' },
        { id: 'doc_2', name: 'NDA_Confidentiality_Agreement.pdf', status: 'Approved', uploadedAt: '2025-06-13' },
        { id: 'doc_3', name: 'W4_Tax_Declaration_2026.pdf', status: 'Pending Review', uploadedAt: '2026-01-05' }
      ],
      privacy: {
        twoFactor: false,
        sessionTimeout: 60,
        telemetry: true,
        sessionSharing: true
      },
      communicationIdentity: {
        preferredChannel: 'Slack',
        whatsappNotifications: true
      }
    };
  }

  let activeTab = 'personal';

  const updateProfileUI = () => {
    const container = document.getElementById('profile-page-content');
    if (!container) return;

    // Toggle active state classes on tab headers
    document.querySelectorAll('.profile-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === activeTab);
    });

    container.innerHTML = renderTabContent(activeTab, user);
    bindTabContentEvents(activeTab);
  };

  const html = `
    <div class="animate-slideUp">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">User Profile</h1>
          <p class="page-subtitle">Manage your personal credentials, documents, corporate assignments, and privacy settings</p>
        </div>
        <div class="page-header-actions" style="display:flex;gap:12px">
          <button class="btn btn-primary btn-sm" id="p-generate-id-btn" style="display:flex;align-items:center;gap:6px">
            🪪 Generate ID Card
          </button>
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/dashboard'">← Dashboard</button>
        </div>
      </div>

      <!-- Profile Header Banner -->
      <div style="background:var(--gradient-card);border:1px solid var(--border-brand);border-radius:var(--radius-xl);padding:24px;margin-bottom:24px;display:flex;align-items:center;gap:24px;flex-wrap:wrap">
        <div id="profile-avatar-wrapper" style="width:80px;height:80px;border-radius:50%;background:var(--gradient-brand);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:800;color:white;flex-shrink:0;box-shadow:var(--shadow-brand);overflow:hidden;border:3px solid var(--bg-card)">
          ${renderAvatar(user.avatar, "width:100%;height:100%;object-fit:cover;border-radius:50%")}
        </div>
        <div style="flex-grow:1">
          <h2 style="font-size:22px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:8px">
            ${user.name}
            <span class="badge badge-brand" style="font-size:11px;padding:2px 8px;text-transform:capitalize">${user.role.replace('_', ' ')}</span>
          </h2>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:8px">${user.email}</p>
          <div style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:12px">
            <span>${getSvgIcon('warehouses', 12)} ${getWarehouses().find(w => w.id === user.warehouseId)?.name || 'Global Operations'}</span>
            <span>·</span>
            <span>ID: ${user.employeeId || user.enterprise_id || 'N/A'}</span>
          </div>
        </div>
      </div>

      <!-- Tab navigation -->
      <div class="table-toolbar" style="margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:0;gap:4px">
        <button class="profile-tab btn btn-ghost btn-sm active" data-tab="personal" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Personal Details</button>
        <button class="profile-tab btn btn-ghost btn-sm" data-tab="corporate" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Corporate Identity</button>
        <button class="profile-tab btn btn-ghost btn-sm" data-tab="documents" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Documents</button>
        <button class="profile-tab btn btn-ghost btn-sm" data-tab="activity" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Activity Logs</button>
        <button class="profile-tab btn btn-ghost btn-sm" data-tab="privacy" style="padding:10px 16px;border-radius:var(--radius-md) var(--radius-md) 0 0">Privacy & Security</button>
      </div>

      <!-- Tab content box -->
      <div id="profile-page-content"></div>
    </div>
  `;

  renderShell('User Profile', 'Your platform identity', html);

  // Bind tab navigation clicks
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      updateProfileUI();
    });
  });

  document.getElementById('p-generate-id-btn')?.addEventListener('click', () => {
    showIDCardModal(user);
  });

  // Initial draw
  updateProfileUI();
}

function renderTabContent(tab, user) {
  const profile = user.profile;
  if (tab === 'personal') {
    return `
      <div class="card animate-slideUp" style="max-width:640px">
        <div class="card-header"><div class="card-title">Personal Information</div></div>
        <form id="p-personal-form">
          <div class="form-group">
            <label class="form-label">Full Name <span class="req">*</span></label>
            <input type="text" id="p-name" class="form-control" value="${user.name}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Email Address (Read-only)</label>
            <input type="email" class="form-control" value="${user.email}" readonly style="opacity:0.7" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Phone Number</label>
              <input type="text" id="p-phone" class="form-control" value="${profile.phone || ''}" placeholder="+1 (555) 000-0000" />
            </div>
            <div class="form-group">
              <label class="form-label">Slack Handle</label>
              <input type="text" id="p-slack" class="form-control" value="${profile.slackUsername || ''}" placeholder="@username" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Residential Address</label>
            <textarea id="p-address" class="form-control" rows="2" placeholder="123 Logistics Way, Suite A">${profile.address || ''}</textarea>
          </div>
          <div style="border-top:1px solid var(--border-subtle);margin:20px 0;padding-top:16px">
            <h4 style="margin-bottom:12px;font-size:14px;font-weight:700;color:var(--text-primary)">Emergency Contact Info</h4>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Contact Name</label>
                <input type="text" id="p-emergency-name" class="form-control" value="${profile.emergencyContactName || ''}" placeholder="Contact Name" />
              </div>
              <div class="form-group">
                <label class="form-label">Relationship</label>
                <input type="text" id="p-emergency-relation" class="form-control" value="${profile.emergencyContactRelation || ''}" placeholder="Relation (e.g. Spouse)" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Emergency Phone Number</label>
              <input type="text" id="p-emergency-phone" class="form-control" value="${profile.emergencyContactPhone || ''}" placeholder="+1 (555) 000-0000" />
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Save Changes</button>
        </form>
      </div>
    `;
  } else if (tab === 'corporate') {
    const hasWorkforceEdit = canDo('workforce', 'edit', user);
    return `
      <div class="card animate-slideUp" style="max-width:640px">
        <div class="card-header"><div class="card-title">Corporate Assignment</div></div>
        <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:var(--text-muted);display:flex;align-items:center;gap:8px">
          <span style="color:var(--brand-500);flex-shrink:0">${getSvgIcon('info', 16)}</span>
          <span>Corporate assignments are managed by administration. ${hasWorkforceEdit ? 'You have permissions to edit these fields.' : 'These fields are read-only.'}</span>
        </div>
        <form id="p-corporate-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Job Title</label>
              <input type="text" id="p-title" class="form-control" value="${profile.jobTitle || ''}" ${!hasWorkforceEdit ? 'readonly style="opacity:0.7"' : ''} />
            </div>
            <div class="form-group">
              <label class="form-label">Department</label>
              <input type="text" id="p-dept" class="form-control" value="${profile.department || ''}" ${!hasWorkforceEdit ? 'readonly style="opacity:0.7"' : ''} />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Date of Joining</label>
              <input type="date" id="p-joining" class="form-control" value="${profile.joiningDate || ''}" ${!hasWorkforceEdit ? 'readonly style="opacity:0.7"' : ''} />
            </div>
            <div class="form-group">
              <label class="form-label">Work Type</label>
              <select id="p-worktype" class="form-control" ${!hasWorkforceEdit ? 'disabled style="opacity:0.7"' : ''}>
                <option value="Full-time" ${profile.workType === 'Full-time' ? 'selected' : ''}>Full-time Employee</option>
                <option value="Part-time" ${profile.workType === 'Part-time' ? 'selected' : ''}>Part-time Employee</option>
                <option value="Contract" ${profile.workType === 'Contract' ? 'selected' : ''}>Contractual</option>
                <option value="Remote" ${profile.workType === 'Remote' ? 'selected' : ''}>Remote / Distributed</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Work Shift</label>
              <select id="p-shift" class="form-control" ${!hasWorkforceEdit ? 'disabled style="opacity:0.7"' : ''}>
                <option value="Day Shift" ${profile.shift === 'Day Shift' ? 'selected' : ''}>Day Shift (08:00 - 16:00)</option>
                <option value="Swing Shift" ${profile.shift === 'Swing Shift' ? 'selected' : ''}>Swing Shift (16:00 - 00:00)</option>
                <option value="Night Shift" ${profile.shift === 'Night Shift' ? 'selected' : ''}>Night Shift (00:00 - 08:00)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Duty Location</label>
              <input type="text" id="p-location" class="form-control" value="${profile.location || ''}" placeholder="Zone B Docks" ${!hasWorkforceEdit ? 'readonly style="opacity:0.7"' : ''} />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Assigned Duty Warehouse</label>
            <select id="p-warehouse-assigned" class="form-control" ${!hasWorkforceEdit ? 'disabled style="opacity:0.7"' : ''}>
              <option value="">Global / Unassigned</option>
              ${getWarehouses().map(w => `<option value="${w.id}" ${profile.assignedWarehouseId === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
            </select>
          </div>
          ${hasWorkforceEdit ? `<button type="submit" class="btn btn-primary btn-sm">Update Corporate Assignment</button>` : ''}
        </form>
      </div>
    `;
  } else if (tab === 'documents') {
    return `
      <div class="card animate-slideUp">
        <div class="card-header" style="justify-content:space-between;align-items:center">
          <div>
            <div class="card-title">Employee Document Repository</div>
            <div class="card-subtitle">Secure employment and compliance documents</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="p-upload-doc-btn" style="display:flex;align-items:center;gap:6px">
            ${getSvgIcon('plus', 14)} Secure Upload
          </button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Type</th>
                <th>Uploaded Date</th>
                <th>Expiry Date</th>
                <th>Status</th>
                <th>Remarks / Reviewer</th>
                <th style="text-align:right">Action</th>
              </tr>
            </thead>
            <tbody>
              ${(profile.documents || []).map(d => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <span style="color:var(--text-muted)">${getSvgIcon('audit', 16)}</span>
                      <span style="font-weight:600">${d.name}</span>
                    </div>
                  </td>
                  <td><span class="badge badge-secondary" style="font-size:11px;padding:2px 8px">${d.type || 'ID Proof'}</span></td>
                  <td>${d.uploadedAt}</td>
                  <td>${d.expiryDate || '—'}</td>
                  <td>
                    <span class="badge ${d.status === 'Approved' ? 'badge-success' : d.status === 'Rejected' ? 'badge-danger' : 'badge-warning'}">
                      ${d.status}
                    </span>
                  </td>
                  <td style="font-size:12px;color:var(--text-secondary)">
                    ${d.status === 'Pending Review' ? '<em>Pending Review</em>' : `
                      <div><strong>Reviewed by:</strong> ${d.reviewerName || 'Supervisor'}</div>
                      ${d.remarks ? `<div style="font-style:italic;margin-top:2px;color:var(--text-muted)">"${d.remarks}"</div>` : ''}
                    `}
                  </td>
                  <td style="text-align:right">
                    <button class="btn btn-ghost btn-xs" onclick="showToast('Secure Download', 'Document download requested securely', 'info')">Download</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (tab === 'activity') {
    const allLogs = getStore().auditLogs || [];
    const userLogs = allLogs.filter(l => l.userId === user.id).slice(0, 10);
    return `
      <div class="card animate-slideUp">
        <div class="card-header">
          <div class="card-title">Recent Activity Logs</div>
          <div class="card-subtitle">Recent security and administrative actions logged under your credentials</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:10px">
          ${userLogs.length === 0 ? `
            <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">No recent logs recorded under your profile</div>
          ` : userLogs.map(log => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--glass-bg);border:1px solid var(--border-subtle);border-radius:8px">
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${log.description}</div>
                <div style="font-size:11px;color:var(--text-muted)">IP: 127.0.0.1 · Action: ${log.action}</div>
              </div>
              <span style="font-size:11px;color:var(--text-muted)">${formatDate(log.timestamp)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'privacy') {
    const p = profile.privacy || { twoFactor: false, sessionTimeout: 60, telemetry: true, sessionSharing: true };
    return `
      <div class="card animate-slideUp" style="max-width:640px">
        <div class="card-header">
          <div class="card-title">Privacy & Security Controls</div>
          <div class="card-subtitle">Manage multi-factor authentication, sessions, and telemetry consents</div>
        </div>
        <form id="p-privacy-form" style="display:flex;flex-direction:column;gap:20px;margin-top:10px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary)">Two-Factor Authentication (2FA)</div>
              <div style="font-size:12px;color:var(--text-muted)">Enforce secure one-time passcode confirmation on logins</div>
            </div>
            <label style="display:flex;align-items:center;cursor:pointer">
              <input type="checkbox" id="p-2fa" class="privacy-toggle" ${p.twoFactor ? 'checked' : ''} style="display:none" />
              <div class="toggle-switch ${p.twoFactor ? 'on' : ''}" style="width:40px;height:22px;border-radius:11px;background:${p.twoFactor ? 'var(--brand-500)' : 'var(--bg-input)'};border:1px solid var(--border-default);position:relative;transition:all 0.2s;cursor:pointer">
                <div style="position:absolute;top:2px;left:${p.twoFactor ? '18px' : '2px'};width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>
              </div>
            </label>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary)">Performance Telemetry</div>
              <div style="font-size:12px;color:var(--text-muted)">Allow sharing loading metric details to improve load speed</div>
            </div>
            <label style="display:flex;align-items:center;cursor:pointer">
              <input type="checkbox" id="p-telemetry" class="privacy-toggle" ${p.telemetry ? 'checked' : ''} style="display:none" />
              <div class="toggle-switch ${p.telemetry ? 'on' : ''}" style="width:40px;height:22px;border-radius:11px;background:${p.telemetry ? 'var(--brand-500)' : 'var(--bg-input)'};border:1px solid var(--border-default);position:relative;transition:all 0.2s;cursor:pointer">
                <div style="position:absolute;top:2px;left:${p.telemetry ? '18px' : '2px'};width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>
              </div>
            </label>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary)">Active Session Logs sharing</div>
              <div style="font-size:12px;color:var(--text-muted)">Display active logged-in device details in security dashboard</div>
            </div>
            <label style="display:flex;align-items:center;cursor:pointer">
              <input type="checkbox" id="p-sessionsharing" class="privacy-toggle" ${p.sessionSharing ? 'checked' : ''} style="display:none" />
              <div class="toggle-switch ${p.sessionSharing ? 'on' : ''}" style="width:40px;height:22px;border-radius:11px;background:${p.sessionSharing ? 'var(--brand-500)' : 'var(--bg-input)'};border:1px solid var(--border-default);position:relative;transition:all 0.2s;cursor:pointer">
                <div style="position:absolute;top:2px;left:${p.sessionSharing ? '18px' : '2px'};width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>
              </div>
            </label>
          </div>

          <div class="form-group" style="margin-top:10px">
            <label class="form-label">Automatic Logout Timeout (Minutes)</label>
            <input type="range" id="p-timeout" min="10" max="240" step="10" value="${p.sessionTimeout || 60}" style="width:100%;accent-color:var(--brand-500)" />
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:4px">
              <span>10 mins</span>
              <span id="p-timeout-lbl" style="font-weight:700;color:var(--text-primary)">${p.sessionTimeout || 60} minutes</span>
              <span>240 mins</span>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Save Security Preferences</button>
        </form>
      </div>
    `;
  }
}

function bindTabContentEvents(tab) {
  const s = getStore();
  const currentUserDoc = s.users.find(u => u.id === s.currentUserId);
  if (!currentUserDoc) return;

  // Ensure default profile structure is initialized under doc context
  if (!currentUserDoc.profile) {
    currentUserDoc.profile = {
      jobTitle: currentUserDoc.role === 'super_admin' ? 'Chief Technology Officer' : 'Operations Logistics Manager',
      department: 'Operations & Engineering',
      joiningDate: '2025-06-15',
      managerId: 'super_admin',
      workType: 'Full-time',
      phone: '+1 (555) 019-2834',
      slackUsername: '@' + currentUserDoc.name.toLowerCase().replace(/\s+/g, '.'),
      documents: [
        { id: 'doc_1', name: 'Employment Offer Contract.pdf', status: 'Approved', uploadedAt: '2025-06-12' },
        { id: 'doc_2', name: 'NDA_Confidentiality_Agreement.pdf', status: 'Approved', uploadedAt: '2025-06-13' },
        { id: 'doc_3', name: 'W4_Tax_Declaration_2026.pdf', status: 'Pending Review', uploadedAt: '2026-01-05' }
      ],
      privacy: {
        twoFactor: false,
        sessionTimeout: 60,
        telemetry: true,
        sessionSharing: true
      },
      communicationIdentity: {
        preferredChannel: 'Slack',
        whatsappNotifications: true
      }
    };
  }

  if (tab === 'personal') {
    document.getElementById('p-personal-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameVal = document.getElementById('p-name').value.trim();
      const phoneVal = document.getElementById('p-phone').value.trim();
      const slackVal = document.getElementById('p-slack').value.trim();
      const addressVal = document.getElementById('p-address').value.trim();
      const emName = document.getElementById('p-emergency-name').value.trim();
      const emRelation = document.getElementById('p-emergency-relation').value.trim();
      const emPhone = document.getElementById('p-emergency-phone').value.trim();

      if (!nameVal) return;

      currentUserDoc.name = nameVal;
      currentUserDoc.profile.phone = phoneVal;
      currentUserDoc.profile.slackUsername = slackVal;
      currentUserDoc.profile.address = addressVal;
      currentUserDoc.profile.emergencyContactName = emName;
      currentUserDoc.profile.emergencyContactRelation = emRelation;
      currentUserDoc.profile.emergencyContactPhone = emPhone;

      saveStore();
      updateDOMAvatars(currentUserDoc.avatar, nameVal);
      await updateUser(currentUserDoc.id, {
        name: nameVal,
        profile: currentUserDoc.profile
      });
      showToast('Personal info saved', 'Your profile details have been updated', 'success');
      renderProfile();
    });
  } else if (tab === 'corporate') {
    document.getElementById('p-corporate-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const jobTitleVal = document.getElementById('p-title').value.trim();
      const deptVal = document.getElementById('p-dept').value.trim();
      const joiningVal = document.getElementById('p-joining').value;
      const workTypeVal = document.getElementById('p-worktype').value;
      const shiftVal = document.getElementById('p-shift').value;
      const locVal = document.getElementById('p-location').value.trim();
      const assignedWhVal = document.getElementById('p-warehouse-assigned').value;

      currentUserDoc.profile.jobTitle = jobTitleVal;
      currentUserDoc.profile.department = deptVal;
      currentUserDoc.profile.joiningDate = joiningVal;
      currentUserDoc.profile.workType = workTypeVal;
      currentUserDoc.profile.shift = shiftVal;
      currentUserDoc.profile.location = locVal;
      currentUserDoc.profile.assignedWarehouseId = assignedWhVal;
      if (assignedWhVal) {
        currentUserDoc.warehouseId = assignedWhVal;
      }

      saveStore();
      await updateUser(currentUserDoc.id, {
        warehouseId: assignedWhVal || null,
        profile: currentUserDoc.profile
      });
      showToast('Corporate assignment saved', 'Corporate settings updated', 'success');
      renderProfile();
    });
  } else if (tab === 'documents') {
    document.getElementById('p-upload-doc-btn')?.addEventListener('click', () => {
      const modalBody = document.createElement('div');
      modalBody.innerHTML = `
        <form id="p-upload-form" style="display:flex;flex-direction:column;gap:16px">
          <div class="form-group">
            <label class="form-label">Document Type <span class="req">*</span></label>
            <select id="p-upload-type" class="form-control" style="background:var(--bg-input)" required>
              <option value="ID Proof">ID Proof</option>
              <option value="Passport">Passport</option>
              <option value="Contract">Contract / Agreement</option>
              <option value="Certificate">Professional Certificate</option>
              <option value="License">Driving / Equipment License</option>
              <option value="Tax Document">Tax Document</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Expiry Date</label>
            <input type="date" id="p-upload-expiry" class="form-control" />
          </div>
          <div class="form-group">
            <label class="form-label">Select File <span class="req">*</span></label>
            <input type="file" id="p-upload-file" class="form-control" required accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
          </div>
        </form>
      `;

      const modalFooter = document.createElement('div');
      modalFooter.style.display = 'flex';
      modalFooter.style.gap = '12px';
      modalFooter.style.justifyContent = 'flex-end';
      modalFooter.innerHTML = `
        <button class="btn btn-secondary" id="p-upload-cancel">Cancel</button>
        <button class="btn btn-primary" id="p-upload-submit">Upload Document</button>
      `;

      const modal = createModal({
        title: 'Upload Compliance Document',
        body: modalBody,
        footer: modalFooter
      });

      modal.el.querySelector('#p-upload-cancel').addEventListener('click', () => modal.close());

      modal.el.querySelector('#p-upload-submit').addEventListener('click', async (evt) => {
        evt.preventDefault();
        const typeVal = modal.el.querySelector('#p-upload-type').value;
        const expiryVal = modal.el.querySelector('#p-upload-expiry').value;
        const fileInput = modal.el.querySelector('#p-upload-file');
        const file = fileInput.files[0];

        if (!file) {
          showToast('Validation Error', 'Please select a file to upload.', 'warning');
          return;
        }

        const newDoc = {
          id: 'doc_' + Date.now(),
          name: file.name,
          type: typeVal,
          expiryDate: expiryVal || null,
          status: 'Pending Review',
          uploadedAt: new Date().toISOString().split('T')[0]
        };

        currentUserDoc.profile.documents = currentUserDoc.profile.documents || [];
        currentUserDoc.profile.documents.push(newDoc);
        saveStore();
        
        await updateUser(currentUserDoc.id, {
          profile: currentUserDoc.profile
        });

        showToast('Document Uploaded', `${file.name} is now pending compliance review.`, 'success');
        modal.close();
        renderProfile();
      });
    });
  } else if (tab === 'privacy') {
    const slider = document.getElementById('p-timeout');
    const label = document.getElementById('p-timeout-lbl');
    if (slider && label) {
      slider.addEventListener('input', (e) => {
        label.textContent = e.target.value + ' minutes';
      });
    }

    document.querySelectorAll('.privacy-toggle').forEach(chk => {
      chk.addEventListener('change', () => {
        const switchDiv = chk.nextElementSibling;
        if (switchDiv) {
          switchDiv.classList.toggle('on', chk.checked);
          switchDiv.style.background = chk.checked ? 'var(--brand-500)' : 'var(--bg-input)';
          switchDiv.firstElementChild.style.left = chk.checked ? '18px' : '2px';
        }
      });
    });

    document.getElementById('p-privacy-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const twoFactor = document.getElementById('p-2fa').checked;
      const telemetry = document.getElementById('p-telemetry').checked;
      const sessionSharing = document.getElementById('p-sessionsharing').checked;
      const sessionTimeout = parseInt(document.getElementById('p-timeout').value);

      currentUserDoc.profile.privacy = {
        twoFactor,
        telemetry,
        sessionSharing,
        sessionTimeout
      };

      saveStore();
      await updateUser(currentUserDoc.id, {
        profile: currentUserDoc.profile
      });
      showToast('Security preferences saved', 'Privacy settings successfully updated', 'success');
      renderProfile();
    });
  }
}

function showIDCardModal(u) {
  const barcodeHTML = generateBarcodeSVG(u.employeeId || u.enterprise_id || u.id, { barWidth: 1.2, height: 35 });
  const whName = getWarehouses().find(w => w.id === u.warehouseId)?.name || 'Global Operations';
  
  const body = document.createElement('div');
  body.style.display = 'flex';
  body.style.gap = '32px';
  body.style.justifyContent = 'center';
  body.style.alignItems = 'center';
  body.style.padding = '24px';
  body.style.flexWrap = 'wrap';
  body.style.background = '#0d0e1f';
  
  body.innerHTML = `
    <style>
      .id-card {
        width: 230px;
        height: 360px;
        border-radius: 16px;
        background: linear-gradient(145deg, #1e2040, #131428);
        border: 1px solid rgba(99, 102, 241, 0.25);
        box-shadow: 0 12px 24px rgba(0,0,0,0.5);
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 20px;
        color: white;
        font-family: 'Inter', sans-serif;
      }
      .id-card::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 60%);
        pointer-events: none;
      }
      .id-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        padding-bottom: 10px;
      }
      .id-logo {
        font-weight: 800;
        font-size: 13px;
        color: var(--brand-400, #818cf8);
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .id-badge {
        font-size: 8px;
        letter-spacing: 1px;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #ef4444;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 700;
      }
      .id-profile {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 15px;
      }
      .id-avatar {
        width: 85px;
        height: 85px;
        border-radius: 50%;
        border: 3px solid rgba(99, 102, 241, 0.4);
        background: var(--gradient-brand);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        font-weight: 800;
        overflow: hidden;
        box-shadow: 0 8px 16px rgba(0,0,0,0.3);
      }
      .id-name {
        font-size: 17px;
        font-weight: 800;
        margin-top: 12px;
        text-align: center;
        text-shadow: 0 2px 4px rgba(0,0,0,0.4);
      }
      .id-role {
        font-size: 11px;
        color: #a5b4fc;
        margin-top: 4px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .id-footer {
        border-top: 1px solid rgba(255,255,255,0.08);
        padding-top: 10px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
      }
      .id-meta-title {
        font-size: 8px;
        text-transform: uppercase;
        color: #64748b;
        font-weight: 700;
      }
      .id-meta-value {
        font-size: 11px;
        font-weight: 700;
        color: #f8fafc;
      }
      .id-card-back {
        background: linear-gradient(145deg, #131428, #0b0c16);
      }
      .id-back-title {
        font-size: 10px;
        font-weight: 800;
        color: #64748b;
        text-transform: uppercase;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        padding-bottom: 4px;
        margin-bottom: 8px;
      }
      .id-detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 12px;
      }
      .id-barcode-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: white;
        padding: 8px;
        border-radius: 8px;
        margin-top: auto;
      }
      .id-barcode-wrap svg {
        max-width: 100%;
      }
    </style>

    <!-- FRONT SIDE -->
    <div class="id-card">
      <div class="id-card-header">
        <div class="id-logo">⚡ WAREOPS</div>
        <div class="id-badge">ACCESS ID</div>
      </div>
      <div class="id-profile">
        <div class="id-avatar">
          ${renderAvatar(u.avatar, "width:100%;height:100%;object-fit:cover;border-radius:50%")}
        </div>
        <div class="id-name">${u.name}</div>
        <div class="id-role">${(u.profile?.jobTitle || u.role).replace('_', ' ')}</div>
      </div>
      <div class="id-footer">
        <div>
          <div class="id-meta-title">Duty Warehouse</div>
          <div class="id-meta-value">${whName}</div>
        </div>
        <div style="text-align:right">
          <div class="id-meta-title">Enterprise ID</div>
          <div class="id-meta-value" style="color:#818cf8">${u.employeeId || u.enterprise_id || 'N/A'}</div>
        </div>
      </div>
    </div>

    <!-- BACK SIDE -->
    <div class="id-card id-card-back">
      <div>
        <div class="id-back-title">Corporate Info</div>
        <div class="id-detail-grid">
          <div>
            <div class="id-meta-title">Department</div>
            <div class="id-meta-value" style="font-size:10px">${u.profile?.department || 'Operations'}</div>
          </div>
          <div>
            <div class="id-meta-title">Join Date</div>
            <div class="id-meta-value" style="font-size:10px">${u.profile?.joiningDate || '2025-06-15'}</div>
          </div>
          <div>
            <div class="id-meta-title">Work Shift</div>
            <div class="id-meta-value" style="font-size:10px">${u.profile?.shift || 'Day Shift'}</div>
          </div>
          <div>
            <div class="id-meta-title">Duty Location</div>
            <div class="id-meta-value" style="font-size:10px">${u.profile?.location || 'Zone A Hub'}</div>
          </div>
        </div>

        <div class="id-back-title" style="margin-top:14px">In Case of Emergency</div>
        <div>
          <div class="id-meta-value" style="font-size:12px">${u.profile?.emergencyContactName || 'Contact Admin'}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">
            Relation: ${u.profile?.emergencyContactRelation || 'Supervisor'}<br/>
            Phone: ${u.profile?.emergencyContactPhone || 'N/A'}
          </div>
        </div>
      </div>

      <div class="id-barcode-wrap">
        ${barcodeHTML}
        <div style="font-size:8px;color:#0f172a;font-family:monospace;margin-top:4px;font-weight:700">${u.employeeId || u.enterprise_id || u.id}</div>
      </div>
    </div>
  `;

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary" id="id-card-close">Close Preview</button>
  `;

  const modal = createModal({
    title: `Access Badge — ${u.name}`,
    body,
    footer,
    size: 'lg'
  });

  modal.el.querySelector('#id-card-close').addEventListener('click', modal.close);
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
  '/forgot-password': renderForgotPassword,
  '/reset-password': renderResetPassword,
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
  '/customers': renderCustomers,
  '/roles': renderRoles,
  '/notifications': renderNotifications,
  '/profile': renderProfile,
};

// Expose printBill globally for inline onclick handlers
window.printBill = printBill;

function getActivePath() {
  const hash = window.location.hash.slice(1);
  return hash.split('?')[0] || '/';
}

let _lastResolvedPath = null;
let _lastResolvedHash = null;

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
  const fullHash = window.location.hash;
  // Prevent redundant renders if the path and hash haven't changed
  if (_lastResolvedPath === path && _lastResolvedHash === fullHash && appEl.innerHTML !== '') return;
  _lastResolvedPath = path;
  _lastResolvedHash = fullHash;

  try {
    const path = getActivePath();
    const user = getCurrentUser();
    const publicRoutes = ['/', '/login', '/signup', '/privacy', '/terms', '/forgot-password', '/reset-password'];
    const redirectIfLoggedIn = ['/', '/login', '/signup', '/forgot-password', '/reset-password'];

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
        '/notifications': 'notifications',
      };

      if (path === '/subscription' && !canDo('settings', 'manage', user)) {
        safeNavigate('/dashboard');
        return;
      }

      if (path === '/roles' && !canDo('settings', 'manage', user)) {
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

let _inactivityTimer = null;
let _lastActivityTime = Date.now();

function updateActivity() {
  _lastActivityTime = Date.now();
}

function startInactivityMonitor() {
  if (typeof window === 'undefined') return;
  if (_inactivityTimer) clearInterval(_inactivityTimer);

  const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'];
  events.forEach(evt => window.addEventListener(evt, updateActivity, { passive: true }));

  _inactivityTimer = setInterval(async () => {
    const user = getCurrentUser();
    if (!user || !sessionStorage.getItem('access_token')) return;

    // Get timeout limit in minutes (default 15)
    const timeoutMin = (user.profile && user.profile.privacy && user.profile.privacy.sessionTimeout) || 15;
    const timeoutMs = timeoutMin * 60 * 1000;

    if (Date.now() - _lastActivityTime > timeoutMs) {
      console.log(`[WareOps] Inactivity timeout reached (${timeoutMin}m). Logging out.`);
      events.forEach(evt => window.removeEventListener(evt, updateActivity));
      clearInterval(_inactivityTimer);
      _inactivityTimer = null;
      
      const { logout } = await import('./modules/store.js');
      await logout();
      const { showToast } = await import('./modules/ui.js');
      showToast('Session Expired', 'You have been logged out due to inactivity.', 'warning');
      window.location.hash = '#/login';
    }
  }, 10000); // Check every 10 seconds
}

// Initialize app when DOM is ready
async function init() {
  try {
    // Start tracking user inactivity
    startInactivityMonitor();

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
    if (user && sessionStorage.getItem('access_token')) {
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
