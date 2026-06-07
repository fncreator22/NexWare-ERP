/**
 * Auth Pages — Login, Signup, Warehouse Registration
 */
import { login, signup, createWarehouse, getCurrentUser, getStore, seedDemoData, getTaxConfig } from '../modules/store.js';
import { navigate } from '../modules/router.js';
import { showToast } from '../modules/ui.js';

function authBgHTML() {
  return `<div class="auth-bg"></div><div class="auth-bg-grid"></div>`;
}

export function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      ${authBgHTML()}
      <div class="auth-card animate-slideUp">
        <div class="auth-logo" style="cursor:pointer" onclick="window.location.hash='#/'">
          <div class="auth-logo-icon">⚡</div>
          <span class="auth-logo-name">WareOps</span>
        </div>
        <h1 class="auth-title">Welcome back</h1>
        <p class="auth-subtitle">Sign in to your enterprise workspace</p>
        <form id="login-form">
          <div class="auth-input-group">
            <span class="auth-input-icon">📧</span>
            <input type="email" id="login-email" class="form-control" placeholder="Email address" required autocomplete="email" />
          </div>
          <div class="auth-input-group">
            <span class="auth-input-icon">🔒</span>
            <input type="password" id="login-password" class="form-control" placeholder="Password" required autocomplete="current-password" />
            <button type="button" class="auth-password-toggle" id="toggle-pw">👁️</button>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-bottom:16px;margin-top:-8px">
            <a href="#/forgot-password" style="font-size:12.5px;color:var(--brand-500);text-decoration:none;font-weight:600">Forgot Password?</a>
          </div>
          <button type="submit" class="btn btn-primary" id="login-btn">
            Sign In
          </button>
        </form>
        <div class="auth-footer">
          Don't have an account? <a href="#/signup">Create account</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';
    await new Promise(r => setTimeout(r, 600));
    const result = await login(email, password);
    if (result.error) {
      showToast('Login failed', result.error, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Sign In';
      return;
    }
    showToast('Welcome back!', `Signed in as ${result.name}`, 'success');
    const whs = getStore().warehouses.filter(w => w.ownerId === result.id || w.id === result.warehouseId);
    if (result.role === 'super_admin' && whs.length === 0) navigate('/register-warehouse');
    else navigate('/dashboard');
  });

  document.getElementById('toggle-pw')?.addEventListener('click', () => {
    const pw = document.getElementById('login-password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });


}

export function renderSignup() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      ${authBgHTML()}
      <div class="auth-card animate-slideUp">
        <div class="auth-logo" style="cursor:pointer" onclick="window.location.hash='#/'">
          <div class="auth-logo-icon">⚡</div>
          <span class="auth-logo-name">WareOps</span>
        </div>
        <h1 class="auth-title">Create your account</h1>
        <p class="auth-subtitle">Start your free enterprise workspace</p>
        <form id="signup-form">
          <div class="auth-input-group">
            <span class="auth-input-icon">👤</span>
            <input type="text" id="signup-name" class="form-control" placeholder="Full name" required />
          </div>
          <div class="auth-input-group">
            <span class="auth-input-icon">📧</span>
            <input type="email" id="signup-email" class="form-control" placeholder="Work email" required autocomplete="email" />
          </div>
          <div class="auth-input-group">
            <span class="auth-input-icon">🔒</span>
            <input type="password" id="signup-password" class="form-control" placeholder="Create password (min 8 chars)" required minlength="8" />
            <button type="button" class="auth-password-toggle" id="toggle-pw2">👁️</button>
          </div>
          <div style="margin-bottom:16px">
            <label class="checkbox-group">
              <input type="checkbox" required />
              <label style="color:var(--text-muted);font-size:13px">I agree to the <a href="#/terms">Terms of Service</a> and <a href="#/privacy">Privacy Policy</a></label>
            </label>
          </div>
          <button type="submit" class="btn btn-primary" id="signup-btn">Create Account — It's Free</button>
        </form>
        <div class="auth-footer">
          Already have an account? <a href="#/login">Sign in</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const btn = document.getElementById('signup-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating account...';
    await new Promise(r => setTimeout(r, 700));
    const result = await signup(name, email, password);
    if (result.error) {
      showToast('Signup failed', result.error, 'error');
      btn.disabled = false;
      btn.innerHTML = "Create Account — It's Free";
      return;
    }
    showToast('Account created!', 'Now set up your first warehouse', 'success');
    navigate('/register-warehouse');
  });

  document.getElementById('toggle-pw2')?.addEventListener('click', () => {
    const pw = document.getElementById('signup-password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });
}

export function renderWarehouseRegistration() {
  const user = getCurrentUser();
  if (!user) { navigate('/login'); return; }

  document.getElementById('app').innerHTML = `
    <div class="warehouse-reg-page">
      ${authBgHTML()}
      <header class="warehouse-reg-header">
        <div style="display:flex;align-items:center;gap:12px;cursor:pointer" onclick="window.location.hash='#/'">
          <div class="auth-logo-icon" style="width:36px;height:36px;background:var(--gradient-brand);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⚡</div>
          <span style="font-size:18px;font-weight:800;background:var(--gradient-brand);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">WareOps</span>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:12px">
          <div style="font-size:13px;color:var(--text-muted)">Signed in as <strong style="color:var(--text-primary)">${user.name}</strong></div>
          <button class="btn btn-ghost btn-sm" id="wh-signout-btn">Sign out</button>
        </div>
      </header>
      <div class="warehouse-reg-body">
        <div class="warehouse-reg-card animate-slideUp">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <span style="font-size:32px">🏭</span>
            <div>
              <h1 class="warehouse-reg-title">Register Your First Warehouse</h1>
              <p class="warehouse-reg-subtitle">This warehouse will be your primary operational hub</p>
            </div>
          </div>
          <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px 16px;margin-bottom:28px;display:flex;align-items:center;gap:10px">
            <span>👑</span>
            <span style="font-size:13px;color:var(--text-secondary)">You're registering as <strong style="color:var(--text-primary)">Super Admin</strong>. You can add more warehouses later from your dashboard.</span>
          </div>
          <form id="warehouse-form">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Warehouse Name <span class="req">*</span></label>
                <input type="text" id="wh-name" class="form-control" placeholder="e.g. North Hub" required />
              </div>
              <div class="form-group">
                <label class="form-label">Business Name <span class="req">*</span></label>
                <input type="text" id="wh-biz" class="form-control" placeholder="e.g. Acme Logistics Inc." required />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Address <span class="req">*</span></label>
              <input type="text" id="wh-address" class="form-control" placeholder="Full address including city, state, ZIP" required />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Contact Number <span class="req">*</span></label>
                <input type="tel" id="wh-contact" class="form-control" placeholder="+1-555-000-0000" required />
              </div>
              <div class="form-group">
                <label class="form-label">Email <span class="req">*</span></label>
                <input type="email" id="wh-email" class="form-control" placeholder="ops@company.com" required />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tax Preference <span style="color:var(--text-muted);font-size:11px">(Optional)</span></label>
                <select id="wh-tax" class="form-control">
                  <option value="standard">Standard (Normal: ${getTaxConfig().normal}%, Luxury: ${getTaxConfig().luxury}%)</option>
                  <option value="custom">Custom</option>
                  <option value="none">No Tax</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Warehouse Logo <span style="color:var(--text-muted);font-size:11px">(Optional)</span></label>
                <select id="wh-logo" class="form-control">
                  <option value="🏭">🏭 Factory</option>
                  <option value="🏗️">🏗️ Construction</option>
                  <option value="🚛">🚛 Logistics</option>
                  <option value="📦">📦 Storage</option>
                  <option value="🏢">🏢 Office</option>
                  <option value="⚙️">⚙️ Manufacturing</option>
                </select>
              </div>
            </div>
            <div style="display:flex;gap:12px;margin-top:8px">
              <button type="submit" class="btn btn-primary" style="flex:1;height:48px;font-size:15px" id="wh-submit-btn">
                🚀 Create Warehouse & Enter Dashboard
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById('wh-signout-btn')?.addEventListener('click', async () => {
    await logout();
    navigate('/login');
  });

  document.getElementById('warehouse-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('wh-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Setting up...';
    await new Promise(r => setTimeout(r, 800));
    const name = document.getElementById('wh-name').value.trim();
    const businessName = document.getElementById('wh-biz').value.trim();
    const address = document.getElementById('wh-address').value.trim();
    const contact = document.getElementById('wh-contact').value.trim();
    const email = document.getElementById('wh-email').value.trim();
    if (!name || !businessName || !address || !contact || !email) {
      showToast('Validation', 'Please fill all required fields', 'warning');
      btn.disabled = false;
      btn.innerHTML = '🚀 Create Warehouse & Enter Dashboard';
      return;
    }
    const wh = await createWarehouse({ name, businessName, address, contact, email, taxPreference: document.getElementById('wh-tax').value, logo: document.getElementById('wh-logo').value });
    if (wh.error) {
      showToast('Error', wh.error, 'error');
      btn.disabled = false;
      btn.innerHTML = '🚀 Create Warehouse & Enter Dashboard';
      return;
    }
    showToast('Warehouse created!', `${wh.name} is ready`, 'success');
    navigate('/dashboard');
  });
}

export function renderForgotPassword() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      ${authBgHTML()}
      <div class="auth-card animate-slideUp">
        <div class="auth-logo" style="cursor:pointer" onclick="window.location.hash='#/'">
          <div class="auth-logo-icon">⚡</div>
          <span class="auth-logo-name">WareOps</span>
        </div>
        <h1 class="auth-title">Reset password</h1>
        <p class="auth-subtitle">Enter your email to request a reset token</p>
        <form id="forgot-form">
          <div class="auth-input-group">
            <span class="auth-input-icon">📧</span>
            <input type="email" id="forgot-email" class="form-control" placeholder="Email address" required autocomplete="email" />
          </div>
          <button type="submit" class="btn btn-primary" id="forgot-btn">
            Send Reset Token
          </button>
        </form>
        <div id="dev-reset-link-container" style="margin-top:16px;display:none;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px;font-size:13px;color:var(--text-secondary);text-align:left">
          <strong>Development Mode reset link:</strong><br/>
          <a id="dev-reset-link" href="#" style="color:var(--brand-500);word-break:break-all"></a>
        </div>
        <div class="auth-footer">
          Remember password? <a href="#/login">Sign in</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const btn = document.getElementById('forgot-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Requesting...';
    
    const { apiFetch } = await import('../modules/store.js');
    const res = await apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });

    if (res.error) {
      showToast('Error', res.error, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Send Reset Token';
      return;
    }

    showToast('Success', 'Password reset token generated.', 'success');
    btn.disabled = false;
    btn.innerHTML = 'Send Reset Token';
    
    const token = res.data && res.data.token;
    if (token) {
      const resetLink = `${window.location.origin}${window.location.pathname}#/reset-password?token=${token}`;
      const devContainer = document.getElementById('dev-reset-link-container');
      const devLink = document.getElementById('dev-reset-link');
      if (devContainer && devLink) {
        devLink.href = `#/reset-password?token=${token}`;
        devLink.textContent = resetLink;
        devContainer.style.display = 'block';
      }
    }
  });
}

export function renderResetPassword() {
  const hash = window.location.hash || '';
  const queryPart = hash.split('?')[1];
  const params = new URLSearchParams(queryPart);
  const token = params.get('token');

  if (!token) {
    document.getElementById('app').innerHTML = `
      <div class="auth-page">
        ${authBgHTML()}
        <div class="auth-card animate-slideUp">
          <h1 class="auth-title" style="color:var(--text-danger)">Invalid Request</h1>
          <p class="auth-subtitle">Password reset token is missing or malformed.</p>
          <div class="auth-footer">
            <a href="#/login">Back to Login</a>
          </div>
        </div>
      </div>
    `;
    return;
  }

  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      ${authBgHTML()}
      <div class="auth-card animate-slideUp">
        <div class="auth-logo" style="cursor:pointer" onclick="window.location.hash='#/'">
          <div class="auth-logo-icon">⚡</div>
          <span class="auth-logo-name">WareOps</span>
        </div>
        <h1 class="auth-title">Create new password</h1>
        <p class="auth-subtitle">Enter your new secure password (min 8 characters)</p>
        <form id="reset-form">
          <div class="auth-input-group">
            <span class="auth-input-icon">🔒</span>
            <input type="password" id="reset-password" class="form-control" placeholder="New Password" required minlength="8" />
          </div>
          <div class="auth-input-group">
            <span class="auth-input-icon">🔒</span>
            <input type="password" id="reset-confirm" class="form-control" placeholder="Confirm New Password" required minlength="8" />
          </div>
          <button type="submit" class="btn btn-primary" id="reset-btn">
            Reset Password
          </button>
        </form>
        <div class="auth-footer">
          Remember password? <a href="#/login">Sign in</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('reset-password').value;
    const confirmPassword = document.getElementById('reset-confirm').value;
    const btn = document.getElementById('reset-btn');

    if (newPassword !== confirmPassword) {
      showToast('Validation Error', 'Passwords do not match.', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Resetting...';

    const { apiFetch } = await import('../modules/store.js');
    const res = await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword })
    });

    if (res.error) {
      showToast('Reset failed', res.error, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Reset Password';
      return;
    }

    showToast('Success', 'Password has been reset successfully.', 'success');
    setTimeout(() => {
      navigate('/login');
    }, 1500);
  });
}
