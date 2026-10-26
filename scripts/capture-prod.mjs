import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const outDir = 'C:\\Users\\sr2ma\\.gemini\\antigravity\\brain\\5b39e523-1947-4950-ba3b-565f9be06dee';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0].split('#')[0];

  if (urlPath === '/warehouse-erp' || urlPath === '/warehouse-erp/') {
    urlPath = '/warehouse-erp/index.html';
  }

  let filePath;
  if (urlPath.startsWith('/warehouse-erp/')) {
    const sub = urlPath.replace('/warehouse-erp/', '');
    filePath = path.join(distDir, 'warehouse-erp', sub);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'warehouse-erp', 'index.html');
    }
  } else {
    filePath = path.join(distDir, urlPath.startsWith('/') ? urlPath.slice(1) : urlPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

const server = http.createServer(serveStatic);

server.listen(3000, '127.0.0.1', async () => {
  console.log('Static production server listening on http://127.0.0.1:3000');

  try {
    const playwrightPath = pathToFileURL(path.join(rootDir, 'landing', 'node_modules', 'playwright', 'index.mjs')).href;
    const { chromium } = await import(playwrightPath);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    // 1. prod_landing_hero.png
    console.log('Capturing prod_landing_hero.png...');
    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'prod_landing_hero.png'), fullPage: false });

    // 2. prod_landing_bento.png
    console.log('Capturing prod_landing_bento.png...');
    const bentoSection = page.locator('#features');
    if (await bentoSection.count() > 0) {
      await bentoSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outDir, 'prod_landing_bento.png'), fullPage: false });
    }

    // 3. prod_landing_tour.png
    console.log('Capturing prod_landing_tour.png...');
    const tourSection = page.locator('#interactive-tour');
    if (await tourSection.count() > 0) {
      await tourSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outDir, 'prod_landing_tour.png'), fullPage: false });
    }

    // 4. prod_landing_pricing.png
    console.log('Capturing prod_landing_pricing.png...');
    const pricingSection = page.locator('#pricing');
    if (await pricingSection.count() > 0) {
      await pricingSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outDir, 'prod_landing_pricing.png'), fullPage: false });
    }

    // 5. prod_erp_login.png
    console.log('Capturing prod_erp_login.png...');
    await page.goto('http://127.0.0.1:3000/warehouse-erp/index.html#/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, 'prod_erp_login.png'), fullPage: false });

    // 6. prod_erp_dashboard.png
    console.log('Capturing prod_erp_dashboard.png...');
    const demoUser = {
      id: 'usr_demo',
      name: 'Demo Admin',
      email: 'admin@nexware.erp',
      role: 'super_admin',
      status: 'active'
    };
    const demoStore = {
      users: [
        demoUser,
        { id: 'usr_2', name: 'Sarah Jenkins', email: 'sarah@nexware.erp', role: 'admin', warehouseId: 'wh_2', status: 'active' },
        { id: 'usr_3', name: 'Marcus Vance', email: 'marcus@nexware.erp', role: 'manager', warehouseId: 'wh_1', status: 'active' }
      ],
      currentUserId: 'usr_demo',
      currentWarehouseId: 'wh_1',
      warehouses: [
        { id: 'wh_1', ownerId: 'usr_demo', name: 'Central Depot Alpha', code: 'CD-01', location: 'Frankfurt', capacity: 50000, currentStock: 34200, manager: 'Demo Admin', staffCount: 12, revenue: 12450 },
        { id: 'wh_2', ownerId: 'usr_demo', name: 'North Port Logistics', code: 'NP-02', location: 'Rotterdam', capacity: 80000, currentStock: 61500, manager: 'Sarah Jenkins', staffCount: 8, revenue: 8900 }
      ],
      workforce: [
        { id: 'wf_1', name: 'Demo Admin', email: 'admin@nexware.erp', role: 'super_admin', warehouseId: 'wh_1', status: 'active' },
        { id: 'wf_2', name: 'Sarah Jenkins', email: 'sarah@nexware.erp', role: 'admin', warehouseId: 'wh_2', status: 'active' },
        { id: 'wf_3', name: 'Marcus Vance', email: 'marcus@nexware.erp', role: 'manager', warehouseId: 'wh_1', status: 'active' }
      ],
      items: [
        { id: 'item_1', name: 'Industrial Servo Motor', sku: 'SRV-902', warehouseId: 'wh_1', stock: 142, quantity: 142, lowStockThreshold: 25, price: 850, category: 'Machinery' },
        { id: 'item_2', name: 'High-Density Hydraulic Fluid (20L)', sku: 'HYD-440', warehouseId: 'wh_1', stock: 88, quantity: 88, lowStockThreshold: 20, price: 120, category: 'Fluids' },
        { id: 'item_3', name: 'Fiber Optic Transceiver 100G', sku: 'FOT-100', warehouseId: 'wh_2', stock: 310, quantity: 310, lowStockThreshold: 50, price: 340, category: 'Electronics' }
      ],
      bills: [
        { id: 'inv_101', billNumber: 'INV-2026-001', warehouseId: 'wh_1', customerName: 'Apex Logistics GmbH', date: new Date().toISOString(), total: 12450, tax: 622.5, status: 'paid', items: [{ id: 'item_1', name: 'Industrial Servo Motor', qty: 10, price: 850 }] },
        { id: 'inv_102', billNumber: 'INV-2026-002', warehouseId: 'wh_1', customerName: 'Vanguard Freight Ltd', date: new Date().toISOString(), total: 8900, tax: 445, status: 'pending', items: [{ id: 'item_2', name: 'High-Density Hydraulic Fluid (20L)', qty: 20, price: 120 }] }
      ],
      tables: [],
      tableData: {},
      auditLogs: [
        { id: 'aud_1', timestamp: new Date().toISOString(), userName: 'Demo Admin', user: 'Demo Admin', action: 'create_item', description: 'Stock Level Audit: Servo Motor Restocked', module: 'Inventory', status: 'success' },
        { id: 'aud_2', timestamp: new Date(Date.now() - 3600000).toISOString(), userName: 'Sarah Jenkins', user: 'Sarah Jenkins', action: 'auth_login', description: 'System Login verified via 2FA', module: 'Auth', status: 'success' }
      ],
      notifications: [
        { id: 'notif_1', title: 'System Healthy', message: 'All warehouse clusters reporting normal telemetry.', time: 'Just now', unread: false }
      ],
      roles: [],
      taxConfig: { normal: 5, luxury: 15 },
      subscription: { plan: 'enterprise', startDate: new Date().toISOString(), status: 'active', warehouseLimit: -1 },
      theme: 'enterprise'
    };

    const authContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    await authContext.addInitScript((mockStore) => {
      localStorage.setItem('wareops_data_guest', JSON.stringify(mockStore));
    }, demoStore);

    const dashPage = await authContext.newPage();
    await dashPage.goto('http://127.0.0.1:3000/warehouse-erp/index.html#/dashboard', { waitUntil: 'networkidle' });
    await dashPage.waitForTimeout(1000);
    await dashPage.screenshot({ path: path.join(outDir, 'prod_erp_dashboard.png'), fullPage: false });
    await dashPage.close();
    await authContext.close();

    console.log('✅ All production screenshots captured successfully!');
    await browser.close();
  } catch (err) {
    console.error('Error capturing screenshots:', err);
  } finally {
    server.close(() => {
      console.log('Static production server closed.');
      process.exit(0);
    });
  }
});
