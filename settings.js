/* Admin Settings (admin/settings.html).
   Appearance: the Light/Dark buttons carry data-theme-mode, so the shared js/theme.js does the switching, remembers the choice
   (localStorage) and paints aria-pressed. admin.js already saves the choice on the account; this page only reports the outcome.
   Account information: the real signed-in administrator, read from api/admin/me.php (server-checked session). Nothing is invented. */
(async function () {
  const admin = await Admin.guard('settings');
  if (!admin) return;
  const $ = id => document.getElementById(id), esc = Admin.esc;

  // ---------- Appearance ----------
  const label = m => (m === 'dark' ? 'Dark' : 'Light');
  const status = $('themeStatus');
  const setStatus = (cls, html) => { status.className = 'ad-set-note mb-0' + (cls ? ' ' + cls : ''); status.innerHTML = html; };
  const showCurrent = () => setStatus('', `Current theme: <b>${label(Theme.get())}</b>.`);
  showCurrent();
  document.addEventListener('click', e => {      // js/theme.js (loaded first) has already applied the theme when this runs
    if (e.target.closest('[data-theme-mode], [data-theme-toggle]')) setStatus('', `Theme changed to <b>${label(Theme.get())}</b>. Saving…`);
  });
  document.addEventListener('admin:theme-saved', e => {
    const d = e.detail || {};
    if (d.ok) setStatus('ok', `<i class="bi bi-check-circle-fill" aria-hidden="true"></i> <b>${label(d.mode)}</b> theme applied and saved to your account and this browser.`);
    else setStatus('warn', `<i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> <b>${label(d.mode)}</b> theme applied and remembered on this browser, but it could not be saved to your account${d.message ? ': ' + esc(d.message) : '.'}`);
  });
  window.addEventListener('storage', e => { if (e.key === 'leyteTheme') showCurrent(); });   // another tab changed it

  // ---------- Account information ----------
  const body = $('accountBody');
  const row = (name, valueHtml) => `<div><dt>${name}</dt><dd>${valueHtml}</dd></div>`;
  const unset = '<span class="ad-unspec">Not provided</span>';

  function showAccount(a) {
    const fullName = [a.first_name, a.last_name].filter(v => typeof v === 'string' && v.trim()).join(' ');
    const created = a.created ? Admin.fmtDate(a.created) : '';
    body.innerHTML = `<dl class="ad-info-grid one mb-0">
        ${row('Name', fullName ? esc(fullName) : unset)}
        ${row('Email', a.email ? esc(a.email) : unset)}
        ${row('Role', a.role === 'admin' ? 'Administrator' : esc(a.role || '') || unset)}
        ${created ? row('Account created', esc(created)) : ''}
      </dl>
      <p class="ad-set-note mt-3 mb-0"><i class="bi bi-lock" aria-hidden="true"></i> Read-only. Administrator accounts are created and changed on the server with <code>tools/make-admin.php</code>.</p>`;
    body.setAttribute('aria-busy', 'false');
  }

  function showError(message) {
    body.innerHTML = `<div class="alert alert-danger mb-3" role="alert"></div><button type="button" class="btn btn-outline-secondary btn-sm" id="acctRetry"><i class="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>Try again</button>`;
    body.querySelector('.alert').textContent = message;   // textContent: never HTML
    body.setAttribute('aria-busy', 'false');
    $('acctRetry').addEventListener('click', loadAccount);
  }

  async function loadAccount() {
    body.setAttribute('aria-busy', 'true');
    body.innerHTML = '<span class="ad-skel mb-3" style="width:55%"></span><span class="ad-skel mb-3" style="width:70%"></span><span class="ad-skel" style="width:40%"></span>';
    const res = await Admin.api('me.php');    // 401 / 403 here sends the browser to the sign-in page, like every other admin call
    if (res.ok && res.admin) showAccount(res.admin);
    else showError(res.message || 'Could not load your account details.');
  }
  loadAccount();
})();
