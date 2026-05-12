import { watch } from 'fs';
import { exec } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const base = dirname(fileURLToPath(import.meta.url));
const jsDir = join(base, 'js');

console.log('👀 Watching for changes in', jsDir);

let debounceTimer;

const rebuild = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log('🔨 Rebuilding bundle...');
    exec('node build.mjs', (err, stdout, stderr) => {
      if (err) {
        console.error('❌ Build failed:', stderr);
      } else {
        console.log('✅ Build successful:', stdout.trim());
      }
    });
  }, 100);
};

watch(jsDir, { recursive: true }, (eventType, filename) => {
  if (filename && filename.endsWith('.js')) {
    rebuild();
  }
});

// Initial build
rebuild();
