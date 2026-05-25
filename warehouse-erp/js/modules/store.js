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

// ---- AUTH ----
export function getCurrentUser() {
  const s = getStore();
  return s.users.find(u => u.id === s.currentUserId) || null;
}

export function login(email, password) {
  const s = getStore();
  const user = s.users.find(u => u.email === email && u.password === password);
  if (!user) return null;
  s.currentUserId = user.id;
  saveStore();
  addAuditLog('login', `User logged in`, user.id);
  return user;
}

export function logout() {
  const s = getStore();
  addAuditLog('logout', `User logged out`, s.currentUserId);
  s.currentUserId = null;
  saveStore();
}

export function signup(name, email, password) {
  const s = getStore();
  if (s.users.find(u => u.email === email)) return { error: 'Email already registered' };
  const id = 'u' + Date.now();
  const user = {
    id, name, email, password, role: 'super_admin',
    warehouseId: null, status: 'active',
    createdAt: new Date().toISOString(), avatar: name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)
  };
  s.users.push(user);
  s.currentUserId = id;
  saveStore();
  addAuditLog('user_create', `New Super Admin registered: ${name}`, id);
  return { user };
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
  if (items.length === 0) return 100;
  const lowStock = items.filter(i => (i.stock || 0) < 20).length;
  return Math.round(((items.length - lowStock) / items.length) * 100);
}

export function createWarehouse(data) {
  const s = getStore();
  const u = getCurrentUser();
  if (u.role !== 'super_admin') return null; // Only Super Admin can create
  const id = 'wh' + Date.now();
  const wh = { id, ...data, ownerId: u.id, createdAt: new Date().toISOString(), status: 'active' };
  s.warehouses.push(wh);
  saveStore();
  addAuditLog('warehouse_create', `Warehouse created: ${data.name}`, u.id);
  return wh;
}

export function updateWarehouse(id, data) {
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

export function createUser(data) {
  const s = getStore();
  const u = getCurrentUser();
  
  if (u.role !== 'super_admin') {
    const levels = { employee: 1, staff: 2, manager: 3, admin: 4, super_admin: 5 };
    const myLevel = levels[u.role] || 1;
    const targetLevel = levels[data.role] || 1;
    
    // Cannot create user with higher or equal role
    if (targetLevel >= myLevel) return { error: 'Unauthorized role assignment' };
    
    // Must assign to same warehouse
    if (data.warehouseId !== u.warehouseId) return { error: 'Unauthorized warehouse assignment' };
  }
  
  if (s.users.find(usr => usr.email === data.email)) return { error: 'Email already exists' };
  const id = 'u' + Date.now();
  const user = {
    id, ...data, status: 'active',
    createdAt: new Date().toISOString(),
    avatar: data.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2),
    assignedBy: s.currentUserId, assignedAt: new Date().toISOString()
  };
  s.users.push(user);

  saveStore();
  addAuditLog('user_create', `User created: ${data.name} (${data.role})`, s.currentUserId);
  return { user };
}

export function updateUser(id, data) {
  const s = getStore();
  const u = getCurrentUser();
  const idx = s.users.findIndex(usr => usr.id === id);
  if (idx === -1) return null;
  const target = s.users[idx];

  if (u.role !== 'super_admin') {
    const levels = { employee: 1, staff: 2, manager: 3, admin: 4, super_admin: 5 };
    const myLevel = levels[u.role] || 1;
    const targetLevel = levels[target.role] || 1;
    
    // Can update self, but cannot escalate own privileges
    if (u.id === target.id) {
      if (data.role && levels[data.role] > myLevel) return null;
      if (data.warehouseId && data.warehouseId !== u.warehouseId) return null;
    } else {
      // Cannot update superiors or peers
      if (targetLevel >= myLevel) return null;
      // Cannot assign a role higher than or equal to their own role
      if (data.role && levels[data.role] >= myLevel) return null;
      // Must be in same warehouse
      if (target.warehouseId !== u.warehouseId) return null;
      // Cannot move users out of warehouse
      if (data.warehouseId && data.warehouseId !== u.warehouseId) return null;
    }
  }

  s.users[idx] = { ...s.users[idx], ...data, updatedAt: new Date().toISOString(), updatedBy: s.currentUserId };
  saveStore();
  addAuditLog('user_update', `User updated: ${s.users[idx].name}`, s.currentUserId);
  addNotification('user_update', 'Team Member Updated', `${s.users[idx].name} profiles was updated by ${u.name}`, '/workforce', s.users[idx].warehouseId);
  return s.users[idx];
}

export function deleteUser(id) {
  const s = getStore();
  const u = getCurrentUser();
  const target = s.users.find(usr => usr.id === id);
  if (!target) return;
  
  if (u.role !== 'super_admin') {
    const levels = { employee: 1, staff: 2, manager: 3, admin: 4, super_admin: 5 };
    const myLevel = levels[u.role] || 1;
    const targetLevel = levels[target.role] || 1;
    
    // Cannot delete superiors or peers
    if (targetLevel >= myLevel) return;
    // Cannot delete users outside of own warehouse
    if (target.warehouseId !== u.warehouseId) return;
  }

  s.users = s.users.filter(usr => usr.id !== id);
  saveStore();
  addAuditLog('user_delete', `User deleted: ${target.name}`, s.currentUserId);
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

export function createItem(data) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || u.role === 'employee') return null; // Employees cannot create items
  if (u.role !== 'super_admin' && data.warehouseId !== u.warehouseId) return null;

  // SKU Uniqueness check to prevent tracking errors
  if (data.sku && s.items.find(i => i.sku === data.sku)) {
    return { error: 'SKU already exists in the system' };
  }

  const id = 'item' + Date.now();
  const item = { id, ...data, createdAt: new Date().toISOString(), createdBy: s.currentUserId };
  s.items.push(item);

  saveStore();
  addAuditLog('item_create', `Item created: ${data.name} (SKU: ${data.sku})`, s.currentUserId);
  addNotification('item_create', 'New Item Added', `${data.name} was added to inventory`, '/items', data.warehouseId);
  return item;
}

export function updateItem(id, data) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || u.role === 'employee') return null;

  const idx = s.items.findIndex(i => i.id === id);
  if (idx === -1) return null;
  const target = s.items[idx];

  if (u.role !== 'super_admin' && target.warehouseId !== u.warehouseId) return null;
  if (data.warehouseId && u.role !== 'super_admin' && data.warehouseId !== u.warehouseId) return null;

  // SKU Uniqueness check for updates
  if (data.sku && s.items.find(i => i.sku === data.sku && i.id !== id)) {
    return { error: 'SKU already exists' };
  }

  s.items[idx] = { ...s.items[idx], ...data, updatedAt: new Date().toISOString() };
  saveStore();
  addNotification('item_update', 'Inventory Updated', `${s.items[idx].name} stock or details updated`, '/items', s.items[idx].warehouseId);
  return s.items[idx];
}

export function deleteItem(id) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || u.role === 'employee') return;

  const target = s.items.find(i => i.id === id);
  if (!target) return;
  if (u.role !== 'super_admin' && target.warehouseId !== u.warehouseId) return;

  s.items = s.items.filter(i => i.id !== id);
  saveStore();
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

export function createBill(data) {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || u.role === 'employee') return null;
  if (u.role !== 'super_admin' && data.warehouseId !== u.warehouseId) return null;

  // Manual Inventory Synchronization: Decrement stock for billed items
  if (data.items && Array.isArray(data.items)) {
    data.items.forEach(billItem => {
      const itemIdx = s.items.findIndex(i => i.id === billItem.id);
      if (itemIdx !== -1) {
        s.items[itemIdx].stock = Math.max(0, (s.items[itemIdx].stock || 0) - billItem.qty);
      }
    });
  }

  const id = 'bill' + Date.now();
  // Regional Tax Snapshot: Use warehouse-specific tax config if available
  const taxConfig = getTaxConfig(data.warehouseId);
  const bill = { 
    id, ...data, 
    taxConfigSnapshot: { ...taxConfig }, // Snapshot for record integrity
    createdAt: new Date().toISOString(), 
    createdBy: s.currentUserId, 
    billNo: 'INV-' + String(s.bills.length + 1).padStart(4, '0') 
  };
  s.bills.push(bill);

  saveStore();
  addAuditLog('bill_create', `Bill generated: ${bill.billNo} — $${data.total}`, s.currentUserId);
  addNotification('bill_create', 'New Invoice Generated', `${bill.billNo} for ${data.customer} — $${data.total}`, '/billing', data.warehouseId);
  return bill;
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

export function addNotification(type, title, message, link, targetWarehouseId = null) {
  const s = getStore();
  if (!s.notifications) s.notifications = [];
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
    
    // Prevent duplicate/conflicting updates
    targets = [...new Set(targets)];
  } else {
    // System generated (no user context) - notify super admins
    targets = s.users.filter(usr => usr.role === 'super_admin').map(usr => usr.id);
  }

  targets.forEach(uid => {
    const usr = s.users.find(u => u.id === uid);
    
    // Respect granular user notification settings
    const prefs = usr?.settings?.notifications;
    if (prefs) {
      if ((type.includes('bill')) && prefs.billing === false) return;
      if ((type.includes('item') || type.includes('stock')) && prefs.stock === false) return;
      if ((type.includes('user')) && prefs.user === false) return;
      if ((type === 'system') && prefs.system === false) return;
    }
    
    s.notifications.unshift({
      id: 'n'+Date.now()+Math.random().toString(36).slice(2),
      type, title, message, userId: uid,
      read: false, timestamp: new Date().toISOString(), link: link||'/dashboard'
    });
  });
  if (s.notifications.length > 500) s.notifications = s.notifications.slice(0, 500);
  saveStore();
}

export function clearNotifications() {
  const s = getStore();
  const u = getCurrentUser();
  if (!u || !s.notifications) return;
  s.notifications = s.notifications.filter(n => n.userId !== u.id);
  saveStore();
}


export function markNotificationRead(id) {
  const s = getStore();
  if (!s.notifications) return;
  const n = s.notifications.find(n=>n.id===id);
  if (n) { n.read = true; saveStore(); }
}

export function markAllNotificationsRead() {
  const s = getStore();
  const u = getCurrentUser();
  if (!s.notifications || !u) return;
  s.notifications.filter(n=>n.userId===u.id).forEach(n=>n.read=true);
  saveStore();
}

// ---- TAX CONFIG ----
export function getTaxConfig(warehouseId) {
  const s = getStore();
  if (!s.taxConfig) s.taxConfig = { luxury: 15, normal: 5 };
  
  // Support for regional compliance: Check for warehouse-specific overrides
  if (warehouseId) {
    const wh = s.warehouses.find(w => w.id === warehouseId);
    if (wh && wh.taxConfig) return wh.taxConfig;
  }
  
  return s.taxConfig;
}

export function saveTaxConfig(config) {
  const s = getStore();
  s.taxConfig = { ...s.taxConfig, ...config };
  saveStore();
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
