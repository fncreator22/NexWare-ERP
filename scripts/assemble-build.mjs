import { execSync } from 'child_process';
import { rmSync, mkdirSync, cpSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const rootDir = resolve(process.cwd());
const distDir = join(rootDir, 'dist');
const erpDistDir = join(distDir, 'warehouse-erp');

console.log('[assemble-build] Step 1: Checking landing dependencies...');
if (!existsSync(join(rootDir, 'landing', 'node_modules'))) {
  console.log('[assemble-build] Installing landing node_modules...');
  execSync('npm --prefix landing install', { stdio: 'inherit', cwd: rootDir });
}

console.log('[assemble-build] Step 2: Building landing application...');
execSync('npm --prefix landing run build', { stdio: 'inherit', cwd: rootDir });

console.log('[assemble-build] Step 3: Building warehouse-erp bundle...');
execSync('node warehouse-erp/build.mjs', { stdio: 'inherit', cwd: rootDir });

console.log('[assemble-build] Step 4: Preparing root dist directory...');
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}
mkdirSync(distDir, { recursive: true });
mkdirSync(erpDistDir, { recursive: true });

console.log('[assemble-build] Step 5: Copying landing dist to root dist...');
cpSync(join(rootDir, 'landing', 'dist'), distDir, { recursive: true });

console.log('[assemble-build] Step 6: Copying warehouse-erp into dist/warehouse-erp...');
const erpItemsToCopy = ['assets', 'css', 'js', 'index.html', 'bundle.js', 'sw.js'];
for (const item of erpItemsToCopy) {
  const src = join(rootDir, 'warehouse-erp', item);
  const dest = join(erpDistDir, item);
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
  }
}

console.log('[assemble-build] Assembly complete! Unified dist ready for production deployment.');
