import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../landing/node_modules/playwright/index.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.resolve(rootDir, 'dist')
const outDir = path.resolve(rootDir, 'screenshots')

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0].split('#')[0])
  if (reqPath === '/') reqPath = '/index.html'

  let filePath = path.join(distDir, reqPath)
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback for landing routes if needed
    filePath = path.join(distDir, 'index.html')
  }

  const ext = path.extname(filePath)
  const contentType = mimeTypes[ext] || 'application/octet-stream'

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500)
      res.end('Server error')
      return
    }
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(content)
  })
})

const PORT = 3589

server.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`)
  try {
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    })

    console.log('Navigating to landing page...')
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    // 1. Hero Default (Full view with HUD)
    console.log('Capturing Hero Default...')
    await page.screenshot({ path: path.join(outDir, 'prod_hero_default.png'), clip: { x: 0, y: 0, width: 1440, height: 1100 } })

    // 2. Hero Hover (Active 3D perspective tilt & specular amber glare on HUD)
    console.log('Capturing Hero Hover on HUD...')
    const hud = page.locator('#dashboard-hud')
    if (await hud.count() > 0) {
      const box = await hud.boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.35)
        await page.waitForTimeout(600)
      }
    }
    await page.screenshot({ path: path.join(outDir, 'prod_hero_hover.png'), clip: { x: 0, y: 0, width: 1440, height: 1100 } })

    // 3. Theme Mode Switcher Test & Light Mode Capture
    console.log('Capturing Light Mode Blueprint Hero...')
    const themeBtn = page.locator('button[aria-label*="Light Mode"]').first()
    if (await themeBtn.count() > 0) {
      await themeBtn.click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: path.join(outDir, 'prod_hero_light.png'), clip: { x: 0, y: 0, width: 1440, height: 1100 } })
      // Switch back to dark mode for subsequent section captures
      const darkBtn = page.locator('button[aria-label*="Dark Mode"]').first()
      if (await darkBtn.count() > 0) {
        await darkBtn.click()
        await page.waitForTimeout(400)
      }
    }

    // 4. Features
    console.log('Capturing Features...')
    const features = page.locator('#features')
    if (await features.count() > 0) {
      await features.scrollIntoViewIfNeeded()
      await page.waitForTimeout(600)
      await page.screenshot({ path: path.join(outDir, 'prod_features.png') })
    }

    // 4. Tour
    console.log('Capturing Tour...')
    const tour = page.locator('#interactive-tour')
    if (await tour.count() > 0) {
      await tour.scrollIntoViewIfNeeded()
      await page.waitForTimeout(600)
      await page.screenshot({ path: path.join(outDir, 'prod_tour.png') })
    }

    // 5. Pricing
    console.log('Capturing Pricing...')
    const pricing = page.locator('#pricing')
    if (await pricing.count() > 0) {
      await pricing.scrollIntoViewIfNeeded()
      await page.waitForTimeout(600)
      await page.screenshot({ path: path.join(outDir, 'prod_pricing.png') })
    }

    // 6. ERP Dashboard (Authenticated View)
    console.log('Capturing Authenticated ERP Dashboard...')
    await page.addInitScript(() => {
      const user = {
        id: 'usr_demo_admin',
        name: 'Alex Mercer',
        email: 'alex.mercer@nexware.internal',
        role: 'super_admin',
        warehouseId: 'wh_dallas_01',
        warehouseOverrides: []
      }
      const b64 = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      const token = `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(JSON.stringify({
        user_id: user.id,
        sub: user.id,
        tenant_id: 'offline_tenant',
        role: 'super_admin',
        email: user.email,
        name: user.name,
        exp: Math.floor(Date.now() / 1000) + 86400 * 30
      }))}.mock_token`

      sessionStorage.setItem('access_token', token)
      sessionStorage.setItem('wareops_user_id', user.id)

      const storeData = {
        users: [user],
        warehouses: [{
          id: 'wh_dallas_01',
          name: 'Dallas Distribution Depot',
          businessName: 'NexWare Global Freight',
          address: '4400 Logistics Way, Dallas, TX',
          contactNumber: '+1-555-839-2041',
          email: 'dallas@nexware.internal',
          ownerId: user.id,
          createdAt: new Date().toISOString()
        }],
        workforce: [
          { id: 'wf_01', name: 'Sarah Connor', email: 'sarah@nexware.internal', role: 'manager', warehouseId: 'wh_dallas_01', status: 'active' },
          { id: 'wf_02', name: 'Marcus Wright', email: 'marcus@nexware.internal', role: 'staff', warehouseId: 'wh_dallas_01', status: 'active' }
        ],
        tables: [],
        tableData: {},
        bills: [
          { id: 'b_01', invoiceNumber: 'INV-2026-001', customerName: 'Apex Logistics', total: 18500, warehouseId: 'wh_dallas_01', status: 'paid', date: new Date().toISOString() },
          { id: 'b_02', invoiceNumber: 'INV-2026-002', customerName: 'Titan Freight', total: 9240, warehouseId: 'wh_dallas_01', status: 'pending', date: new Date().toISOString() }
        ],
        items: [
          { id: 'it_01', name: 'Industrial Heavy Pallets', sku: 'SKU-PLT-001', stock: 120, warehouseId: 'wh_dallas_01', price: 45 },
          { id: 'it_02', name: 'Hydraulic Forklift Fluid', sku: 'SKU-OIL-002', stock: 14, lowStockThreshold: 20, warehouseId: 'wh_dallas_01', price: 85 }
        ],
        auditLogs: [],
        notifications: [],
        roles: [],
        taxConfig: { luxury: 15, normal: 5 },
        subscription: { plan: 'enterprise', status: 'active', warehouseLimit: -1 },
        theme: 'enterprise',
        currentUserId: user.id,
        currentWarehouseId: 'wh_dallas_01'
      }

      const keys = [
        `wareops_data_t_offline_tenant_u_${user.id}`,
        `wareops_data_${user.id}`,
        'wareops_data_guest'
      ]
      keys.forEach(k => localStorage.setItem(k, JSON.stringify(storeData)))
    })

    await page.goto(`http://localhost:${PORT}/warehouse-erp/index.html#/dashboard`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(outDir, 'prod_erp_dashboard.png') })

    await browser.close()
    console.log('All screenshots captured successfully!')
  } catch (err) {
    console.error('Screenshot capture failed:', err)
  } finally {
    server.close()
  }
})
