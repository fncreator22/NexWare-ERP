/**
 * Router — Hash-based SPA routing (simplified, not used directly by app.js)
 */
import { getCurrentUser } from './store.js';

export function navigate(path) {
  window.location.hash = '#' + path;
}

export function getCurrentPath() {
  const hash = window.location.hash.slice(1);
  return hash.split('?')[0] || '/';
}

export function getCurrentParams() {
  const hash = window.location.hash.slice(1);
  const [, qs] = hash.split('?');
  if (!qs) return {};
  return Object.fromEntries(new URLSearchParams(qs));
}

export function isActive(path) {
  return getCurrentPath() === path;
}
