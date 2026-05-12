import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const base = dirname(fileURLToPath(import.meta.url));

const run = (cmd, args) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: true, cwd: base });
  p.on('error', (err) => console.error(`Failed to start ${cmd}:`, err));
  return p;
};

console.log('🚀 Starting WareOps Dev Environment...');

const watchProc = run('node', ['watch.mjs']);
const serveProc = run('npx', ['serve', './']);

process.on('SIGINT', () => {
  watchProc.kill();
  serveProc.kill();
  process.exit();
});
