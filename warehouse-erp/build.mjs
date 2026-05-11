import { readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const base = dirname(fileURLToPath(import.meta.url));
const jsBase = join(base, 'js');

const files = [
  'modules/store.js', 'modules/router.js', 'modules/ui.js', 'modules/exporter.js',
  'components/shell.js', 'components/palette.js',
  'pages/auth.js', 'pages/dashboard.js', 'pages/warehouses.js',
  'pages/workforce.js', 'pages/items.js', 'pages/tables.js',
  'pages/billing.js', 'pages/analytics.js', 'pages/audit.js',
  'pages/settings.js', 'pages/subscription.js',
];

const strip = (code) => {
  code = code.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  code = code.replace(/^export\s+(default\s+)?(function\s)/gm, '$2');
  code = code.replace(/^export\s+(default\s+)?(class\s)/gm, '$2');
  code = code.replace(/^export\s+(const|let|var)\s/gm, '$1 ');
  code = code.replace(/^export\s*\{[^}]*\};\s*$/gm, '');
  return code;
};

let bundle = `// WareOps ERP — Bundled v2.0  Generated: ${new Date().toISOString()}\n\n`;

for (const f of files) {
  const code = strip(readFileSync(join(jsBase, f), 'utf8'));
  bundle += `\n// ===== ${f} =====\n${code.trim()}\n`;
}

const appCode = strip(readFileSync(join(jsBase, 'app.js'), 'utf8'));
bundle += `\n// ===== app.js =====\n${appCode.trim()}\n`;

const out = join(base, 'bundle.js');
writeFileSync(out, bundle, 'utf8');
console.log('✅ Bundle:', statSync(out).size, 'bytes');
