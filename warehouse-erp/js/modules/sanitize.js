/**
 * WareOps ERP — HTML Sanitizer
 * Prevents XSS by escaping HTML special characters before innerHTML insertion.
 * Use sanitizeHTML() for any user-supplied value interpolated in template literals.
 */

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escapes HTML special characters in a string to prevent XSS.
 * Use this on every user-supplied value before embedding in innerHTML.
 * @param {*} str - The value to sanitize (any type, will be coerced to string)
 * @returns {string} Safe HTML-escaped string
 */
export function sanitizeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"'`=/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Sanitizes a string for use in HTML attribute values (quotes escaped).
 * @param {*} str
 * @returns {string}
 */
export function sanitizeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Strips all HTML tags from a string and returns plain text.
 * Use when you want to display raw text with no markup at all.
 * @param {*} str
 * @returns {string}
 */
export function stripHTML(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.innerHTML = String(str);
  return div.textContent || div.innerText || '';
}
