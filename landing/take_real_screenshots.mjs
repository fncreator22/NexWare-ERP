import { chromium } from 'playwright';
import path from 'path';

const outDir = 'C:\\Users\\sr2ma\\.gemini\\antigravity\\brain\\5b39e523-1947-4950-ba3b-565f9be06dee';

async function run() {
  console.log('Launching Chromium for real screenshot capture...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // 1. Landing Hero
  console.log('Capturing Landing Hero...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'real_landing_hero.png'), fullPage: false });

  // 2. Landing Bento Features
  console.log('Capturing Landing Bento Features...');
  const featuresSection = page.locator('#features');
  if (await featuresSection.count() > 0) {
    await featuresSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, 'real_landing_bento.png'), fullPage: false });
  }

  // 3. Landing Sandbox Tour
  console.log('Capturing Landing Sandbox Tour...');
  const tourSection = page.locator('#interactive-tour');
  if (await tourSection.count() > 0) {
    await tourSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, 'real_landing_tour.png'), fullPage: false });
  }

  // 4. Landing Pricing Matrix
  console.log('Capturing Landing Pricing Matrix...');
  const pricingSection = page.locator('#pricing');
  if (await pricingSection.count() > 0) {
    await pricingSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, 'real_landing_pricing.png'), fullPage: false });
  }

  // 5. Landing Security FAQ
  console.log('Capturing Landing Security FAQ...');
  const faqSection = page.locator('#security-faq');
  if (await faqSection.count() > 0) {
    await faqSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, 'real_landing_faq.png'), fullPage: false });
  }

  // 6. ERP Dashboard
  console.log('Capturing ERP Dashboard...');
  await page.goto('http://127.0.0.1:8080/index.html#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'real_erp_dashboard.png'), fullPage: false });

  // 7. ERP Inventory Items
  console.log('Capturing ERP Inventory...');
  await page.goto('http://127.0.0.1:8080/index.html#/items', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'real_erp_inventory.png'), fullPage: false });

  // 8. ERP Billing & Invoices
  console.log('Capturing ERP Billing...');
  await page.goto('http://127.0.0.1:8080/index.html#/billing', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'real_erp_billing.png'), fullPage: false });

  // 9. ERP Workforce RBAC
  console.log('Capturing ERP Workforce...');
  await page.goto('http://127.0.0.1:8080/index.html#/workforce', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'real_erp_workforce.png'), fullPage: false });

  // 10. ERP Dynamic Spreadsheet Tables
  console.log('Capturing ERP Custom Tables...');
  await page.goto('http://127.0.0.1:8080/index.html#/tables', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'real_erp_tables.png'), fullPage: false });

  // 11. ERP Automation Rules
  console.log('Capturing ERP Automation...');
  await page.goto('http://127.0.0.1:8080/index.html#/automation', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'real_erp_automation.png'), fullPage: false });

  // 12. ERP Audit Logs
  console.log('Capturing ERP Audit Stream...');
  await page.goto('http://127.0.0.1:8080/index.html#/audit', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'real_erp_audit.png'), fullPage: false });

  // 13. ERP Settings & Webhooks
  console.log('Capturing ERP Settings & Webhooks...');
  await page.goto('http://127.0.0.1:8080/index.html#/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'real_erp_settings.png'), fullPage: false });

  console.log('All real screenshots captured successfully!');
  await browser.close();
}

run().catch(err => {
  console.error('Error taking screenshots:', err);
  process.exit(1);
});
