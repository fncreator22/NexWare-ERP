import { getStore, saveStore, getCurrentUser, apiFetch, syncWithBackend } from './store.js';

// ── MODULE & ACTION DEFINITIONS ──────────────────────────────────────────────

export const ALL_MODULES = [
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

export const ALL_ACTIONS = ['view','create','edit','delete','export','import','manage'];

// ── BUILT-IN DEFAULT PERMISSIONS PER ROLE ────────────────────────────────────

export const DEFAULT_ROLE_PERMISSIONS = {
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
export function resolvePermissions(user) {
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
export function canDo(module, action, user) {
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
export function getDynamicNav(user) {
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

export function getRoles() {
  const s = getStore();
  if (!s.roles) s.roles = [];
  return s.roles;
}

export async function createRole(data) {
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

export async function updateRole(id, data) {
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

export async function deleteRole(id) {
  const res = await apiFetch(`/roles/${id}`, {
    method: 'DELETE'
  });
  if (res.error) {
    throw new Error(res.error);
  }
  await syncWithBackend();
}

export async function cloneRole(id) {
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
export const BUILTIN_ROLES = [
  { id: 'super_admin', key: 'super_admin', name: 'Super Admin', color: '#a78bfa', isSystem: true, description: 'Full platform access. Cannot be edited.' },
  { id: 'admin',       key: 'admin',       name: 'Admin',       color: '#06b6d4', isSystem: true, description: 'Warehouse admin. Manages users and operations.' },
  { id: 'manager',     key: 'manager',     name: 'Manager',     color: '#10b981', isSystem: true, description: 'Operations manager. Billing, inventory, CRM.' },
  { id: 'staff',       key: 'staff',       name: 'Staff',       color: '#f59e0b', isSystem: true, description: 'Front-line staff. Billing and limited inventory.' },
  { id: 'employee',    key: 'employee',    name: 'Employee',    color: '#71717a', isSystem: true, description: 'Read-only dashboard and tables access.' },
];

export function getAllRoles() {
  const custom = getRoles();
  return [...BUILTIN_ROLES, ...custom];
}

// ── PERMISSION PRESETS ────────────────────────────────────────────────────────

export const PERMISSION_PRESETS = {
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
    // Can view + create + edit but not delete/manage/export
    const p = {};
    ALL_MODULES.forEach(m => { p[m.key] = { view: true, create: true, edit: true, delete: false, export: false, import: false, manage: false }; });
    return p;
  },
  'No Access': () => {
    const p = {};
    ALL_MODULES.forEach(m => { p[m.key] = {}; ALL_ACTIONS.forEach(a => { p[m.key][a] = false; }); });
    return p;
  },
};
