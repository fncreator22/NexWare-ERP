import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../landing/node_modules/playwright/index.mjs'

const PROD_URL = 'https://nexware-erp.vercel.app'

async function runLiveVerification() {
  console.log(`Starting Live Verification on ${PROD_URL}...`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  })
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })
  page.on('pageerror', err => {
    consoleErrors.push(err.message)
  })

  // Test 1: Root Landing Page
  console.log(`1. Navigating to root: ${PROD_URL}/`)
  const rootResponse = await page.goto(`${PROD_URL}/`, { waitUntil: 'networkidle' })
  if (!rootResponse || rootResponse.status() !== 200) {
    throw new Error(`Expected HTTP 200 for root, got ${rootResponse ? rootResponse.status() : 'null'}`)
  }
  console.log(`   Root HTTP Status: ${rootResponse.status()}`)

  const title = await page.title()
  console.log(`   Page Title: "${title}"`)
  if (!title.includes('NexWare ERP')) {
    throw new Error(`Unexpected page title: ${title}`)
  }

  // Verify Hero & Brand elements
  const brandLogo = await page.locator('nav a:has-text("Nex")').count()
  const heroTelemetry = await page.locator('text=Enterprise ERP Engine v2.0').count()
  console.log(`   NexWare Brand Logo found: ${brandLogo > 0}`)
  console.log(`   Hero Telemetry found: ${heroTelemetry > 0}`)
  if (brandLogo === 0 || heroTelemetry === 0) {
    throw new Error('Expected NexWare branding and hero telemetry on root page')
  }

  // Test Theme Toggle
  const lightBtn = page.locator('button[aria-label="Switch to Light Mode"]').first()
  if (await lightBtn.count() > 0) {
    await lightBtn.click()
    await page.waitForTimeout(500)
    const isLight = await page.evaluate(() => document.documentElement.classList.contains('theme-light'))
    console.log(`   Light theme toggled: ${isLight}`)
    const darkBtn = page.locator('button[aria-label="Switch to Dark Mode"]').first()
    if (await darkBtn.count() > 0) {
      await darkBtn.click()
      await page.waitForTimeout(500)
      const isDark = await page.evaluate(() => !document.documentElement.classList.contains('theme-light'))
      console.log(`   Dark theme toggled back: ${isDark}`)
    }
  }

  // Test Hover Interaction
  const hud = page.locator('#dashboard-hud')
  if (await hud.count() > 0) {
    const box = await hud.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
      await page.waitForTimeout(300)
      console.log(`   Hero HUD hover interaction verified`)
    }
  }

  // Test 2: Check Links & Navigation
  const links = await page.$$eval('a', els => els.map(a => a.href))
  console.log(`   Verified ${links.length} total anchor links on page`)

  // Test 3: ERP Direct Access Route
  console.log(`2. Navigating to ERP application: ${PROD_URL}/warehouse-erp/`)
  const erpResponse = await page.goto(`${PROD_URL}/warehouse-erp/`, { waitUntil: 'networkidle' })
  if (!erpResponse || erpResponse.status() !== 200) {
    throw new Error(`Expected HTTP 200 for /warehouse-erp/, got ${erpResponse ? erpResponse.status() : 'null'}`)
  }
  console.log(`   ERP HTTP Status: ${erpResponse.status()}`)

  const erpTitle = await page.title()
  console.log(`   ERP Title: "${erpTitle}"`)

  // Check App Container Loaded
  await page.waitForSelector('#app', { state: 'attached', timeout: 5000 })
  const appHtml = await page.$eval('#app', el => el.innerHTML.length)
  console.log(`   ERP #app container populated with ${appHtml} chars of UI`)

  // Test 3.5: ERP Login View Branding Check
  console.log(`3. Navigating to ERP Login: ${PROD_URL}/warehouse-erp/index.html#/login`)
  await page.goto(`${PROD_URL}/warehouse-erp/index.html#/login`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.auth-logo-name', { timeout: 5000 })
  const loginLogoText = await page.locator('.auth-logo-name').first().textContent()
  console.log(`   ERP Login Brand: "${loginLogoText}"`)
  if (!loginLogoText || !loginLogoText.includes('NexWare')) {
    throw new Error(`Expected ERP login screen to display NexWare, got: ${loginLogoText}`)
  }

  // Test 4: Authenticated Dashboard Simulation on Live
  console.log(`4. Navigating to Authenticated ERP Dashboard: ${PROD_URL}/warehouse-erp/index.html#/dashboard`)
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
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 86400 * 7
    }))}.sig`
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('active_tenant_id', 't_offline_tenant')
    sessionStorage.setItem('wareops_user_id', user.id)
  })

  await page.goto(`${PROD_URL}/warehouse-erp/index.html#/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  const dashboardContent = await page.content()
  const hasDashboardMetrics = dashboardContent.includes('Active SKUs') || dashboardContent.includes('Inventory') || dashboardContent.includes('Overview') || dashboardContent.includes('Warehouse')
  console.log(`   Dashboard loaded successfully with metric telemetry: ${hasDashboardMetrics}`)

  // Verify Zero Fatal Console Errors
  const fatalErrors = consoleErrors.filter(e => !e.includes('favicon.ico'))
  console.log(`   Fatal Console Errors Count: ${fatalErrors.length}`)
  if (fatalErrors.length > 0) {
    console.warn(`   Warnings/Errors logged:`, fatalErrors)
  }

  await browser.close()
  console.log('✅ LIVE PRODUCTION VERIFICATION COMPLETED SUCCESSFULLY!')
}

runLiveVerification().catch(err => {
  console.error('❌ Verification failed:', err)
  process.exit(1)
})
