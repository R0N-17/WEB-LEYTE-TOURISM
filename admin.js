/* SCRUM-16: shared helpers for every admin page (not loaded by the public site).
   Every admin API call goes to api/admin/*. The server decides who is allowed in; this file only reacts to its answer. */
const Admin = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* POSTs JSON to api/admin/<endpoint>. Always resolves to { ok, message, status, ...data }.
     A 401/403 on any page except sign-in means the session ended or this account isn't an admin: back to the sign-in page. */
  async function api(endpoint, body, opts = {}) {
    let res;
    try {
      res = await fetch('../api/admin/' + endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body || {})
      });
    } catch (e) {
      return { ok: false, offline: true, status: 0, message: "Can't reach the server. Start it with `php -S localhost:8000 router.php` and open http://localhost:8000/admin/login.html." };
    }
    let data;
    try { data = await res.json(); }
    catch (e) { return { ok: false, offline: true, status: res.status, message: "The server answered, but PHP didn't run (HTTP " + res.status + "). Open the site through PHP, not Live Server." }; }
    data.status = res.status;
    if (!opts.noRedirect && (res.status === 401 || res.status === 403)) {
      location.replace('login.html?' + (res.status === 403 ? 'denied=1' : 'expired=1'));
    }
    return data;
  }

  // Navigation (only pages that exist). Groups: [label, [[href, icon, text, key], ...]]
  const NAV = [
    ['Overview',           [['index.html',        'bi-grid-1x2',   'Dashboard',    'dashboard']]],
    ['Tourism management', [['destinations.html', 'bi-geo-alt',    'Destinations', 'destinations'],
                            ['categories.html',   'bi-tags',       'Categories',   'categories']]],
    ['System',             [['settings.html',     'bi-gear',       'Settings',     'settings']]],
  ];
  const TITLES = { dashboard: 'Dashboard', destinations: 'Destinations', categories: 'Categories', settings: 'Settings' };

  function buildShell(active, admin) {
    const side = document.getElementById('adSide');
    const initials = ((admin.first_name || '')[0] || '') + ((admin.last_name || '')[0] || '');
    side.innerHTML = `
      <a class="ad-brand" href="index.html"><img src="../images/logo-compass.svg" alt=""><span class="ad-brand-name">KYR Web Tourism<small>Admin</small></span></a>
      <nav class="ad-nav" aria-label="Admin">
        ${NAV.map(([label, items]) => `<div class="ad-nav-label">${label}</div>` + items.map(n =>
          `<a href="${n[0]}" class="${n[3] === active ? 'active' : ''}" ${n[3] === active ? 'aria-current="page"' : ''}><i class="bi ${n[1]}" aria-hidden="true"></i>${n[2]}</a>`).join('')).join('')}
        <div class="ad-nav-label">Site</div>
        <a href="../dashboard.html" target="_blank" rel="noopener"><i class="bi bi-compass" aria-hidden="true"></i>View public site<i class="bi bi-box-arrow-up-right ext" aria-hidden="true"></i></a>
      </nav>
      <div class="ad-side-foot">
        <div class="ad-user"><span class="ad-avatar" aria-hidden="true">${esc(initials.toUpperCase())}</span>
          <div class="min-w-0"><div class="who">${esc(admin.first_name)} ${esc(admin.last_name)}</div><div class="mail">${esc(admin.email)}</div></div></div>
        <button type="button" class="ad-logout" id="adLogout"><i class="bi bi-box-arrow-right" aria-hidden="true"></i>Log out</button>
      </div>`;
    // slim top bar: menu button (phones), breadcrumb, light/dark button
    const top = document.getElementById('adTop');
    if (top) top.innerHTML = `<button type="button" class="ad-menu-btn" id="adMenuBtn" aria-label="Open menu" aria-controls="adSide" aria-expanded="false"><i class="bi bi-list" aria-hidden="true"></i></button>
      <nav class="ad-crumb" aria-label="Breadcrumb"><span>Admin</span><i class="bi bi-chevron-right" aria-hidden="true" style="font-size:.65rem"></i><b>${esc(TITLES[active] || '')}</b></nav>
      <button type="button" class="ad-theme-btn" data-theme-toggle aria-label="Switch theme"><i class="bi" aria-hidden="true"></i></button>`;
    // Light / dark: js/theme.js (shared with the public site) does the switching and remembers the choice. Here we only repaint the new
    // button and also save the choice on the account, so the public site opens in the same theme on another device.
    if (typeof Theme !== 'undefined') {
      Theme.refresh();
      if (!window.__adThemeSaved) { window.__adThemeSaved = true; Theme.onChange(async mode => {
        const r = await api('../theme.php', { theme: mode }, { noRedirect: true });
        // Lets a page (the Settings page) report whether the account copy really saved. Nothing else listens, so other pages are unaffected.
        document.dispatchEvent(new CustomEvent('admin:theme-saved', { detail: { mode, ok: !!r.ok, message: r.message || '' } }));
      }); }
    }
    const scrim = document.getElementById('adScrim'), menuBtn = document.getElementById('adMenuBtn');
    const mobile = () => window.matchMedia('(max-width: 991.98px)').matches;
    const toggle = open => {
      side.classList.toggle('open', open); scrim.classList.toggle('open', open);
      if (menuBtn) { menuBtn.setAttribute('aria-expanded', String(open)); menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); }
      if (open && mobile()) side.querySelector('a.active, a')?.focus();
    };
    if (menuBtn) menuBtn.addEventListener('click', () => toggle(!side.classList.contains('open')));
    scrim.addEventListener('click', () => toggle(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && side.classList.contains('open')) { toggle(false); menuBtn?.focus(); } });
    window.addEventListener('resize', () => { if (!mobile()) toggle(false); });
    document.getElementById('adLogout').addEventListener('click', async () => {
      await api('../logout.php', {}, { noRedirect: true });   // reuses the normal logout endpoint (ends the session)
      location.replace('login.html');
    });
  }

  // Runs first on every admin page. Shows the page only once the server confirms this session is an administrator.
  async function guard(active) {
    const res = await api('me.php');
    if (!res.ok) return null;          // api() already redirected on 401/403; a network error stays on screen
    buildShell(active, res.admin);
    document.body.classList.remove('auth-pending');
    return res.admin;
  }

  function toast(type, message) {
    let box = document.getElementById('adToasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'adToasts'; box.className = 'toast-container position-fixed top-0 end-0 p-3'; box.style.zIndex = 2000;
      document.body.appendChild(box);
    }
    const icon = { success: 'bi-check-circle-fill', danger: 'bi-exclamation-octagon-fill', warning: 'bi-exclamation-triangle-fill' }[type] || 'bi-info-circle-fill';
    const el = document.createElement('div');
    el.className = 'toast ad-toast ad-toast-' + (['success', 'danger', 'warning'].includes(type) ? type : 'info');
    el.setAttribute('role', type === 'danger' ? 'alert' : 'status');
    el.innerHTML = `<div class="toast-body"><i class="bi ${icon}" aria-hidden="true"></i><span class="flex-grow-1 ad-toast-text"></span><button type="button" class="btn-close ms-2" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
    el.querySelector('.ad-toast-text').textContent = message;      // textContent: never HTML
    box.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: type === 'danger' ? 7000 : 4000 });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
  }

  function loading(btn, on, text) {
    if (on) { btn.dataset.label = btn.dataset.label || btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${text}`; }
    else { btn.disabled = false; btn.innerHTML = btn.dataset.label || btn.innerHTML; }
  }

  const fmtDateTime = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };

  // Categories are managed data now (data/categories.json). Fills ADMIN_CATS ({ key: label }) and ADMIN_CAT_LIST (full records) in place.
  async function loadCats() {
    const res = await api('categories.php');
    if (res.ok) {
      ADMIN_CAT_LIST.splice(0, ADMIN_CAT_LIST.length, ...res.categories);
      Object.keys(ADMIN_CATS).forEach(k => delete ADMIN_CATS[k]);
      res.categories.forEach(c => { ADMIN_CATS[c.key] = c.label; });
    }
    return res;
  }

  // A grid of icon radio buttons (Bootstrap Icons). The server accepts any bi-* name; these are the ones offered.
  const ICONS = ['bi-water', 'bi-tree', 'bi-bank', 'bi-geo-alt', 'bi-basket', 'bi-cup-hot', 'bi-shop', 'bi-cart', 'bi-building', 'bi-buildings', 'bi-camera', 'bi-compass',
    'bi-flag', 'bi-house', 'bi-heart', 'bi-star', 'bi-sun', 'bi-moon-stars', 'bi-tsunami', 'bi-bicycle', 'bi-car-front', 'bi-airplane', 'bi-signpost-2', 'bi-bookmark',
    'bi-gem', 'bi-music-note-beamed', 'bi-palette', 'bi-trophy', 'bi-flower1', 'bi-sunrise', 'bi-umbrella', 'bi-binoculars', 'bi-map', 'bi-pin-map', 'bi-cup-straw', 'bi-bag'];
  function iconGrid(box, name, selected) {
    const list = ICONS.includes(selected) || !selected ? ICONS : [selected, ...ICONS];
    const sel = selected || ICONS[0];
    box.innerHTML = list.map(ic => `<input class="btn-check" type="radio" name="${name}" id="${name}-${ic}" value="${ic}" ${ic === sel ? 'checked' : ''}>` +
      `<label class="btn btn-outline-secondary" for="${name}-${ic}" title="${ic.slice(3)}"><i class="bi ${ic}"></i></label>`).join('');
  }

  /* Data-quality checks, shared by the dashboard ("Needs attention") and the destination list (data-check filter), so both always agree.
     Returns the list of problems a destination has: 'no-photo' | 'no-coords' | 'no-category' | 'incomplete'.
     catKeys = the keys of the categories that exist now. A destination whose categories were all removed has "no valid category". */
  const validCoords = (lat, lng) => {
    const ok = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
    return ok(lat) && ok(lng) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180 && !(Number(lat) === 0 && Number(lng) === 0);
  };
  const REQUIRED_TEXT = ['name', 'town', 'hours', 'blurb', 'about'];
  function issues(d, catKeys) {
    const out = [];
    if (!d.image) out.push('no-photo');
    if (!validCoords(d.lat, d.lng)) out.push('no-coords');
    if (!(d.cats || []).some(c => catKeys.includes(c))) out.push('no-category');
    if (REQUIRED_TEXT.some(k => !String(d[k] ?? '').trim()) || d.feeAmt === '' || d.feeAmt === null || d.feeAmt === undefined || !Number.isFinite(Number(d.feeAmt))) out.push('incomplete');
    return out;
  }
  // Towns counted once each: "Palo", " palo " and "PALO" are the same town. Blank values are not towns.
  const townKey = t => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const distinctTowns = list => new Set(list.map(d => townKey(d.town)).filter(Boolean)).size;

  return { api, guard, toast, loading, esc, fmtDate, fmtDateTime, validCoords, issues, distinctTowns, loadCats, iconGrid };
})();

/* Labels shared by the admin pages. Time keys match includes/config.php (PREF_TIMES).
   Categories are NOT fixed any more: Admin.loadCats() fills these two from the server (api/admin/categories.php). */
const ADMIN_CATS  = {};        // { key: label }
const ADMIN_CAT_LIST = [];     // [{ key, label, icon, outdoor, count }]
const ADMIN_TIMES = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
