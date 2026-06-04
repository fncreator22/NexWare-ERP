/**
 * WareOps ERP — Export Engine
 * Supports CSV, XLSX-compatible TSV, and print-to-PDF
 * Role-gated: only exports data the current user can see
 */
import { getCurrentUser, getWarehouses, getAllUsers, getItems, getBills, getTables, getTableData, getAuditLogs, getTaxConfig } from './store.js';

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

export function exportCSV(entity) {
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

export function exportXLSX(entity) {
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

export function exportPDF(entity) {
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
