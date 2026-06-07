/**
 * WareOps ERP — Central Store (In-Memory State)
 * Simulates a database using localStorage + in-memory state
 */

export function getStorageKey() {
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

export function getStore() {
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

export function saveStore() {
  const key = getStorageKey();
  localStorage.setItem(key, JSON.stringify(_store));
  if (typeof window !== 'undefined') {
    window.wareops_currency = getActiveCurrency();
  }
}

export function resetStore() {
  _store = getDefaultData();
  saveStore();
}

// ---- API AND SYNCHRONIZATION ----
const API_BASE_URL = 'http://localhost:8000/api/v1';

export async function apiFetch(path, options = {}) {
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

export async function syncWithBackend() {
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

export async function logout() {
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

export function getStockHealth(warehouseId) {
  const s = getStore();
  const items = warehouseId ? s.items.filter(i => i.warehouseId === warehouseId) : s.items;
  if (items.length === 0) return 0;
  const lowStock = items.filter(i => {
    const threshold = i.lowStockThreshold !== undefined ? i.lowStockThreshold : 20;
    return (i.stock || 0) <= threshold;
  }).length;
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
    console.error('Failed to update warehouse in database:', res.error);
  }

  const idx = s.warehouses.findIndex(w => w.id === id);
  if (idx === -1) return null;
  s.warehouses[idx] = { ...s.warehouses[idx], ...data, ...(res.data || {}), updatedAt: new Date().toISOString() };
  saveStore();
  addAuditLog('warehouse_update', `Warehouse updated: ${s.warehouses[idx].name}`, s.currentUserId);
  return s.warehouses[idx];
}

export function deleteWarehouse(id) {
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

export async function reviewDocument(userId, docId, status, remarks) {
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
export function getItems(warehouseId) {
  const s = getStore();
  if (warehouseId) return s.items.filter(i => i.warehouseId === warehouseId);
  const u = getCurrentUser();
  if (!u) return [];
  const allowedWhIds = getWarehouses().map(w => w.id);
  return s.items.filter(i => allowedWhIds.includes(i.warehouseId));
}

export async function createItem(data) {
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

export async function updateItem(id, data) {
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

export async function deleteItem(id) {
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
export function getTables(warehouseId) {
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

export function createTable(data) {
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

export function updateTable(id, data) {
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

export function deleteTable(id) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || !['super_admin','admin'].includes(u.role)) return;

  const target = s.tables.find(t => t.id === id);
  if (!target || (u.role === 'admin' && target.warehouseId !== u.warehouseId)) return;

  s.tables = s.tables.filter(t => t.id !== id);
  delete s.tableData[id];
  saveStore();
}

export function getTableData(tableId) {
  const s = getStore();
  return s.tableData[tableId] || [];
}

export function addTableRow(tableId, row) {
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

export function updateTableRow(tableId, rowId, data) {
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

export function deleteTableRow(tableId, rowId) {
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
export function getBills(warehouseId) {
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

export async function createBill(data) {
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
export function addAuditLog(action, description, userId) {
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
  
  // Also update warehouses with custom tax preference to copy the saved configuration in MongoDB
  const customWhs = s.warehouses.filter(w => w.taxPreference === 'custom');
  for (const wh of customWhs) {
    await updateWarehouse(wh.id, { taxConfig: config });
  }
  
  addAuditLog('settings_update', `Tax config updated: Normal ${config.normal}%, Luxury ${config.luxury}%`, s.currentUserId);
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

export function sendWebSocketMessage(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

// ---- CURRENCY HELPERS ----
export function getCurrency() {
  const s = getStore();
  if (!s.currency) s.currency = 'USD';
  return s.currency;
}

export function getActiveCurrency() {
  const s = getStore();
  const activeWhId = s.currentWarehouseId || (getCurrentUser()?.warehouseId);
  if (activeWhId) {
    const wh = s.warehouses.find(w => w.id === activeWhId);
    if (wh && wh.currency) return wh.currency;
  }
  if (!s.currency) s.currency = 'USD';
  return s.currency;
}

export function saveCurrency(currency) {
  const s = getStore();
  s.currency = currency;
  saveStore();
  
  // Sync to global window variable for synchronous ui formatters
  if (typeof window !== 'undefined') {
    window.wareops_currency = getActiveCurrency();
  }
  
  addAuditLog('settings_update', `Platform currency updated to: ${currency}`, s.currentUserId);
}

