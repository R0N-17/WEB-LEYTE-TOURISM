/* dashboard.html only. Needs js/data.js loaded first (PLACES, CATS, AREAS, TIMES, label). */

/* ---------- Session guard ----------
   Not signed in (or just logged out and pressed Back)? Go to the login page. */
// The server decides who is logged in (see the loader at the bottom of this file).
window.addEventListener('pageshow', e => { if (e.persisted) window.location.reload(); });

/* ---------- SCRUM-7: Log out ---------- */
document.getElementById('confirmLogout').addEventListener('click', e => {
  e.preventDefault();
  api('logout.php').finally(Session.toLogin);
});

/* ---------- Left sidebar: Dashboard / History Log ---------- */
const VIEWS = ['dashboard', 'browse', 'history'];
const dashSidebar = document.getElementById('dashSidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const sidebarToggle = document.getElementById('sidebarToggle');

function closeSidebar() {
  dashSidebar.classList.remove('open');
  sidebarBackdrop.classList.remove('show');
  if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', 'false');
}
function openSidebar() {
  dashSidebar.classList.add('open');
  sidebarBackdrop.classList.add('show');
  if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', 'true');
}
if (sidebarToggle) sidebarToggle.addEventListener('click', () => (dashSidebar.classList.contains('open') ? closeSidebar() : openSidebar()));
sidebarBackdrop.addEventListener('click', closeSidebar);

// Shows one section (#view-dashboard, #view-browse or #view-history) and hides the others.
// skipHash: true when called from a hashchange event, so it doesn't rewrite the URL it was just given.
function showView(name, opts = {}) {
  if (!VIEWS.includes(name)) name = 'dashboard';
  document.querySelectorAll('.dash-view').forEach(el => el.classList.toggle('d-none', el.id !== `view-${name}`));
  document.querySelectorAll('.dash-sidebar-link').forEach(a => a.classList.toggle('active', a.dataset.view === name));
  if (!opts.skipHash) history.pushState(null, '', `#${name}`);
  if (!opts.silent) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name !== 'history') refreshCatalog();   // Sprint 2: pick up anything the admin changed since the page loaded
  }
  closeSidebar();
}

// Any sidebar link carries data-view.
document.addEventListener('click', e => {
  const el = e.target.closest('[data-view]');
  if (!el) return;
  e.preventDefault();
  showView(el.dataset.view);
});
window.addEventListener('hashchange', () => showView(location.hash.slice(1), { skipHash: true }));
showView(location.hash.slice(1) || 'dashboard', { silent: true, skipHash: true });   // land on the right tab on refresh or a shared link

/* ---------- Success notification (toast) ----------
   Pops at the bottom of the screen after a successful save, even after the modal that triggered it is closed. */
const toastStack = document.getElementById('toastStack');
function notify(type, message, sub) {
  const el = document.createElement('div');
  el.className = `dm-toast dm-toast-${type}`;
  el.setAttribute('role', 'status');
  const icon = type === 'danger' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill';
  el.innerHTML = `<i class="bi ${icon} dm-toast-icon"></i>
    <span class="dm-toast-text">${escapeHtml(message)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</span>
    <button type="button" class="dm-toast-close" aria-label="Dismiss"><i class="bi bi-x"></i></button>`;
  toastStack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  let timer = setTimeout(() => dismiss(), 4000);
  function dismiss() {
    clearTimeout(timer);
    el.classList.add('hide');
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }
  el.querySelector('.dm-toast-close').addEventListener('click', dismiss);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1500); });
}
// Green: a save succeeded. Red: something was permanently removed (e.g. the history log was cleared).
function notifySuccess(message, sub) { notify('success', message, sub); }
function notifyDanger(message, sub) { notify('danger', message, sub); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

let openPlace = null;   // place currently shown in the details popup (so live weather can refresh it)

// Filled in from the server (api/me.php) by the loader at the bottom of this file.
const currentUser = { firstName: '', lastName: '', email: '' };

// Empty until the account has saved preferences (api/preferences.php). Nothing is pre-picked on the user's behalf.
let savedPrefs = { cats: [], area: null, budget: null, trip: null };

// Sprint 2: false until the destinations and categories have arrived from the server (so no screen flashes an empty state while loading).
let catalogReady = false;

// Saved preferences can name a category that no longer exists (the admin removed it). Those are ignored everywhere and dropped on the next save.
// Skipped when the category list itself could not be loaded, so a network problem never wipes anyone's picks from the screen.
function cleanPrefs(p) {
  const valid = new Set(CATS.map(c => c[0]));
  const cats = [...new Set(((p && p.cats) || []).filter(c => typeof c === 'string'))].filter(c => !valid.size || valid.has(c));
  return { cats, area: (p && p.area) || null, budget: (p && p.budget) || null, trip: (p && p.trip) || null };
}

/* ---------- Live date & time ---------- */
function paintClock() {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  document.getElementById('liveDateTime').innerHTML = `<i class="bi bi-calendar3 me-1"></i>${date} &nbsp;·&nbsp; <i class="bi bi-clock me-1"></i>${time}`;
}
paintClock();
setInterval(paintClock, 15000);   // minutes only, so no need to tick every second

/* ---------- Header + profile fields ---------- */
/* Title Case for display: "klyde theo" -> "Klyde Theo". Words the person typed with their own mixed
   capitals (McDonald, DeLeon) are left exactly as they wrote them. */
function titleCase(str) {
  return String(str || '').replace(/[^\s\-]+/gu, word => {
    if (word !== word.toLowerCase() && word !== word.toUpperCase()) return word;   // already mixed case
    return word.toLowerCase().replace(/(^|['\u2019.])(\p{L})/gu, (m, pre, ch) => pre + ch.toUpperCase());
  });
}
function initials(first, last) { return ((first[0] || '') + (last[0] || '')).toUpperCase(); }

function applyUser(u) {
  currentUser.firstName = titleCase(u.first_name);
  currentUser.lastName = titleCase(u.last_name);
  currentUser.email = u.email;
  paintUser();
}

function paintUser() {
  document.getElementById('navAvatar').textContent = initials(currentUser.firstName, currentUser.lastName);
  document.getElementById('navName').textContent = `${currentUser.firstName} ${currentUser.lastName}`;
  document.getElementById('navEmail').textContent = currentUser.email;
  document.getElementById('welcomeName').textContent = currentUser.firstName;
  document.getElementById('pfFirstName').value = currentUser.firstName;
  document.getElementById('pfLastName').value = currentUser.lastName;
  document.getElementById('pfEmail').value = currentUser.email;
}
paintUser();

/* ---------- SCRUM-8: Manage User Profile ---------- */
const pfNewPw = document.getElementById('pfNewPw');
const pfConfirmPw = document.getElementById('pfConfirmPw');
function pfCheckMatch() { pfConfirmPw.setCustomValidity(pfNewPw.value === pfConfirmPw.value ? '' : 'mismatch'); }
pfNewPw.addEventListener('input', pfCheckMatch);
pfConfirmPw.addEventListener('input', pfCheckMatch);

const pfCheckFirst = bindNameField(document.getElementById('pfFirstName'), 'first name');
const pfCheckLast  = bindNameField(document.getElementById('pfLastName'), 'last name');

document.getElementById('profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  pfCheckFirst();
  pfCheckLast();
  pfCheckMatch();
  form.classList.add('was-validated');
  if (!form.checkValidity()) return;

  const saveBtn = document.querySelector('button[form=profileForm]');
  setLoading(saveBtn, true, 'Saving…');

  const alertBox = document.getElementById('profileAlert');
  const passwordChanged = pfNewPw.value !== '';
  const res = await api('profile.php', {
    first_name: document.getElementById('pfFirstName').value,
    last_name: document.getElementById('pfLastName').value,
    email: document.getElementById('pfEmail').value,
    current_password: document.getElementById('pfCurrentPw').value,
    new_password: pfNewPw.value
  });
  setLoading(saveBtn, false);
  if (!res.ok) {
    alertBox.className = 'alert alert-danger py-2 small';
    alertBox.textContent = res.message;
    return;
  }
  applyUser(res.user);
  alertBox.className = 'alert alert-success py-2 small';
  alertBox.textContent = 'Profile updated.';
  document.getElementById('pfCurrentPw').value = '';
  pfNewPw.value = ''; pfConfirmPw.value = '';
  form.classList.remove('was-validated');
  hidePfPasswords();
  notifySuccess(passwordChanged ? 'Password updated' : 'Profile updated', passwordChanged ? 'Your new password now works for signing in.' : undefined);
});

// Put every eye back to "hidden" (after saving, and whenever the profile window is closed).
function hidePfPasswords() {
  document.querySelectorAll('#profileModal .toggle-pw').forEach(btn => {
    document.getElementById(btn.dataset.target).type = 'password';
    btn.setAttribute('aria-label', 'Show password');
    btn.innerHTML = '<i class="bi bi-eye"></i>';
  });
}
document.getElementById('profileModal').addEventListener('hidden.bs.modal', hidePfPasswords);
// Opening the profile shows the saved details and clears any old message or unsaved typing.
document.getElementById('profileModal').addEventListener('show.bs.modal', () => {
  paintUser();
  document.getElementById('profileAlert').className = 'alert d-none py-2 small';
  document.getElementById('profileForm').classList.remove('was-validated');
  document.querySelectorAll('#profileForm .is-valid, #profileForm .is-invalid').forEach(i => i.classList.remove('is-valid', 'is-invalid'));
  document.getElementById('pfCurrentPw').value = ''; pfNewPw.value = ''; pfConfirmPw.value = '';
  pfCheckMatch();
});

/* ---------- SCRUM-9: Save User Preferences ---------- */
function optionCards(list, type, name, checkedValues) {
  return list.map(([v, icon, title, sub]) => {
    const checked = checkedValues.includes(v) ? 'checked' : '';
    return `<div class="col-sm-6"><input class="btn-check" type="${type}" name="dash-${name}" id="dash-${name}-${v}" value="${v}" data-on="${checked ? 1 : 0}" ${checked}>
      <label class="pref-opt" for="dash-${name}-${v}"><i class="bi ${icon}"></i>
      <span><strong>${escHtml(title)}</strong>${sub ? `<small class="d-block text-secondary">${sub}</small>` : ''}</span></label></div>`;
  }).join('');
}
function paintPrefsForm() {
  document.getElementById('dashCatOpts').innerHTML  = optionCards(CATS, 'checkbox', 'cat', savedPrefs.cats || []);
  document.getElementById('dashAreaOpts').innerHTML = optionCards(AREAS, 'radio', 'area', [savedPrefs.area]);
  document.getElementById('dashBudgetOpts').innerHTML = optionCards(BUDGETS, 'radio', 'budget', [savedPrefs.budget]);
  document.getElementById('dashTripOpts').innerHTML = optionCards(TRIPS, 'radio', 'trip', [savedPrefs.trip]);
}
paintPrefsForm();

// Radio groups can be un-picked: clicking the selected option again clears it (checkboxes already work this way).
document.getElementById('prefsModal').addEventListener('click', e => {
  const input = e.target.closest('input[type="radio"]');
  if (!input) return;
  if (input.dataset.on === '1') {
    input.checked = false;
    input.dataset.on = '0';
  } else {
    document.querySelectorAll(`input[name="${input.name}"]`).forEach(r => { r.dataset.on = '0'; });
    input.dataset.on = '1';
  }
});

// Opening Preferences always shows what is actually saved (drops any unsaved changes from a cancelled earlier edit).
document.getElementById('prefsModal').addEventListener('show.bs.modal', () => {
  paintPrefsForm();
  document.getElementById('prefsAlert').className = 'alert d-none';
});

document.getElementById('savePrefsBtn').addEventListener('click', async () => {
  const pick = n => (document.querySelector(`input[name="dash-${n}"]:checked`) || {}).value || null;
  const cats = [...document.querySelectorAll('input[name="dash-cat"]:checked')].map(i => i.value);
  const area = pick('area'), budget = pick('budget'), trip = pick('trip');

  const saveBtn = document.getElementById('savePrefsBtn');
  setLoading(saveBtn, true, 'Saving…');
  const res = await api('preferences.php', { cats, area, budget, trip });
  setLoading(saveBtn, false);
  const alertBox = document.getElementById('prefsAlert');
  if (!res.ok) {
    alertBox.className = 'alert alert-danger py-2 small';
    alertBox.textContent = res.message;
    return;
  }
  savedPrefs = cleanPrefs(res.prefs);
  paintPrefsForm();
  renderRecommended();

  alertBox.className = 'alert alert-success py-2 small';
  const none = !hasPrefs();
  alertBox.textContent = none ? 'Preferences cleared. Select at least one preference to see recommendations.' : 'Preferences saved. Your recommendations were updated.';
  notifySuccess('Preferences updated', none ? 'No preferences selected, so no recommendations are shown.' : 'Your recommendations were refreshed to match.');
});

/* ---------- SCRUM-26: Home Dashboard ---------- */
function placeCard(p, rank) {
  const topPick = rank === 0;               // -1 = a general suggestion, not a match for this user
  const greatMatch = rank === 1 || rank === 2;
  return `<div class="col-12 col-xl-6"><div class="place-card place-card-h h-100 ${topPick ? 'is-top-pick' : ''}" role="button" tabindex="0" data-place="${escapeHtml(p.name)}">
    <div class="dm-thumb-wrap">
      ${placeThumb(p)}
      <span class="wx-chip d-none" data-wx="${escapeHtml(p.name)}"></span>
      ${topPick ? `<span class="top-pick-ribbon"><i class="bi bi-star-fill"></i> Top pick</span>` : ''}
    </div>
    <div class="place-body">
    <h3 class="h6 fw-bold mb-0">${escapeHtml(p.name)}</h3><div class="small text-secondary mb-2"><i class="bi bi-geo-alt me-1"></i>${escapeHtml(p.town)}</div>
    <p class="small mb-0">${escapeHtml(p.blurb)}</p>
    <div class="d-flex flex-wrap gap-1 mt-2">
      ${greatMatch ? `<span class="badge rank-badge"><i class="bi bi-check-circle-fill me-1"></i>Great match</span>` : ''}
      ${p.view ? `<span class="badge text-bg-warning"><i class="bi bi-${p.view}"></i> Good ${p.view} spot</span>` : ''}
      ${!p.costOk ? `<span class="badge text-bg-secondary"><i class="bi bi-cash-coin"></i> Over your budget</span>` : ''}
      <span data-wx-alert="${escapeHtml(p.name)}"></span>
    </div>
    </div>
  </div></div>`;
}
// The saved category picks that still exist (no duplicates, nothing the admin has since removed).
function prefCatKeys() { return cleanPrefs(savedPrefs).cats; }
// True when the user has picked at least one thing that still exists.
function hasPrefs() {
  return !!(prefCatKeys().length || savedPrefs.area || savedPrefs.budget || savedPrefs.trip);
}
function recsStateHtml(icon, title, text, button) {
  return `<div class="recs-empty"><div class="empty-state"><i class="bi ${icon}"></i>
    <p class="fw-semibold mb-1">${title}</p><p class="small text-secondary mb-${button ? 3 : 0}">${text}</p>${button || ''}</div></div>`;
}
function renderRecommended() {
  const box = document.getElementById('recommended'), note = document.getElementById('recNote');
  const show = (sig, html) => { if (box.dataset.sig !== sig) { box.dataset.sig = sig; box.innerHTML = html; } };   // rebuild only when something really changed (keeps animations calm)
  if (!catalogReady) {
    note.textContent = '';
    show('loading', recsStateHtml('bi-hourglass-split', 'Loading recommendations…', 'One moment.'));
    return;
  }
  // Every destination once (matched on its id), whatever the server sent.
  const all = [...new Map(PLACES.map(p => [p.id || p.name, p])).values()];
  if (!all.length) {
    note.textContent = '';
    show(PLACES_ERROR ? 'error' : 'empty', PLACES_ERROR
      ? recsStateHtml('bi-wifi-off', "Couldn't load destinations", escapeHtml(PLACES_ERROR), '<button class="btn btn-primary btn-sm" type="button" data-action="catalog-retry"><i class="bi bi-arrow-clockwise me-1"></i>Try again</button>')
      : recsStateHtml('bi-geo-alt', 'No destinations yet', 'Destinations will appear here as soon as they are added.'));
    paintWeather();
    return;
  }

  const pc = prefCatKeys();
  const picks = pc.map(c => escapeHtml(label(CATS, c))).join(', ');
  let list, mode = 'personal', matched = 0;
  if (!hasPrefs()) {
    // Nothing is selected: show NO destination cards (no popular / random / fallback picks) and say what to do.
    // This is a different case from "preferences selected but nothing matches" (mode 'nomatch', below).
    mode = 'none';
    list = [];
    note.textContent = '';
    show('none', recsStateHtml('bi-sliders', 'No preferences selected', 'Select at least one preference to see recommendations.',
      '<button class="btn btn-primary btn-sm" type="button" data-bs-toggle="modal" data-bs-target="#prefsModal"><i class="bi bi-sliders me-1"></i>Set preferences</button>'));
    paintWeather();
    return;
  } else {
    const scored = all.map(p => {
      const hits = p.cats.filter(c => pc.includes(c)).length;
      const areaOk = !savedPrefs.area || savedPrefs.area === 'either' || p.area === savedPrefs.area;   // nothing picked = no filter
      const costOk = !savedPrefs.budget || budgetOk(p, savedPrefs.budget);
      const lenOk = !savedPrefs.trip || tripOk(p, savedPrefs.trip);
      const wx = Weather.info(p.name);
      const weatherHit = wx && wx.wet && p.cats.some(isOutdoorCat) ? -3 : 0;   // rain or rough seas: outdoor spots slip down
      return { ...p, hits, costOk, areaOk, lenOk, score: weatherHit + hits * 3 + (areaOk ? 2 : 0) + (costOk ? 2 : 0) + (lenOk ? 1 : 0) };
    });
    // Budget-fitting matches come first (mirrors the sign-up questionnaire), so "Free only" etc. actually shapes the list
    // instead of being outweighed by a category match. For "Any budget", equally good matches break ties by fee, priciest first.
    const byScore = (a, b) => b.score - a.score || (savedPrefs.budget === 'any' ? b.feeAmt - a.feeAmt : 0);
    const rank = arr => [...arr.filter(p => p.costOk).sort(byScore), ...arr.filter(p => !p.costOk).sort(byScore)];
    // With categories picked, a place in one of them always comes before one that is not. Without any, setting / budget / trip length decide.
    // Without categories, only places that fit every picked setting / budget / trip length count as matches (an empty selection never means "everything").
    const inCats = pc.length ? scored.filter(p => p.hits > 0) : scored.filter(p => p.areaOk && p.costOk && p.lenOk);
    matched = inCats.length;
    if (!matched) {
      // Something IS selected, but nothing fits it: say so. No unrelated places are shown.
      mode = 'nomatch';
      const what = pc.length ? picks : 'your setting, budget and trip length';
      note.textContent = '';
      show('nomatch|' + what, recsStateHtml('bi-search', 'No matching destinations', `No destinations match ${what} yet. Try changing your preferences.`,
        '<button class="btn btn-outline-secondary btn-sm" type="button" data-bs-toggle="modal" data-bs-target="#prefsModal">Change preferences</button>'));
      paintWeather();
      return;
    }
    list = [...rank(inCats), ...rank(pc.length ? scored.filter(p => !p.hits) : [])].slice(0, 6);   // matches first, then fill up with the rest
    note.innerHTML = pc.length
      ? `Matched to your interests: ${picks}.` + (matched < list.length ? ` Only ${matched} destination${matched === 1 ? ' matches' : 's match'}, so we added other places to explore.` : '')
      : 'Matched to your saved setting, budget and trip length.';
  }
  // The signature covers everything a card shows, so a renamed place, a new description or a replaced photo redraws the cards.
  const sig = mode + '|' + list.map(p => [p.id, p.name, p.town, p.blurb, p.image, p.view, p.cats.join()].join('~')).join('|');
  show(sig, list.map((p, i) => placeCard({ ...p, costOk: p.costOk !== false }, mode === 'personal' && i < matched ? i : -1)).join(''));
  paintWeather();
}
renderRecommended();

// Recently viewed / favorites: this function can be called again any time the underlying list changes.
function simpleList(id, names, empty) {
  const el = document.getElementById(id);
  names = names.filter(n => PLACES.some(x => x.name === n));   // a place the admin has since deleted or renamed is skipped, never a crash
  if (!names.length) {
    el.className = 'empty-state';
    el.innerHTML = `<i class="bi ${empty.icon}"></i>
      <p class="fw-semibold mb-1">${empty.title}</p>
      <p class="small text-secondary mb-0">${empty.text}</p>`;
    return;
  }
  el.className = 'list-group';
  el.innerHTML = names.map(n => {
    const p = PLACES.find(x => x.name === n);
    return `<a href="#" class="list-group-item list-group-item-action d-flex align-items-center gap-3" data-place="${escapeHtml(p.name)}">
      ${placeThumb(p, 'sm')}
      <span><span class="fw-semibold d-block">${escapeHtml(p.name)}</span><span class="small text-secondary">${escapeHtml(p.town)}</span></span>
    </a>`;
  }).join('');
}

// Recently viewed: empty for a new account. Fills in only as the user actually opens a destination.
const RECENT_MAX = 6;
let recentlyViewed = [];
function renderRecent() {
  simpleList('recentList', recentlyViewed,
    { icon: 'bi-clock-history', title: 'Nothing viewed yet', text: "Places you look at will show up here." });
  document.getElementById('clearRecentBtn').classList.toggle('d-none', !recentlyViewed.length);   // nothing to clear when empty
}
function markViewed(name) {
  recentlyViewed = [name, ...recentlyViewed.filter(n => n !== name)].slice(0, RECENT_MAX);
  renderRecent();
  api('recent.php', { name });               // saved on the account, so it is still here after logging out and back in
}
renderRecent();

// "Clear history": wipes the saved list on the account, then empties the list on screen.
document.getElementById('confirmClearRecent').addEventListener('click', async function () {
  const btn = this, err = document.getElementById('clearRecentError');
  err.classList.add('d-none');
  setLoading(btn, true, 'Clearing…');
  const res = await api('recent-clear.php');
  setLoading(btn, false);
  if (!res.ok) { err.textContent = res.message || "Couldn't clear your history. Try again."; err.classList.remove('d-none'); return; }
  recentlyViewed = [];
  renderRecent();
  bootstrap.Modal.getInstance(document.getElementById('clearRecentModal')).hide();
  notifyDanger('History log deleted', 'Your recently viewed places were removed.');
});

simpleList('favList', [],
  { icon: 'bi-heart', title: 'No favorites yet', text: "Tap the heart on a destination to save it here." });

/* ---------- Delete account ---------- */
document.getElementById('confirmDeleteAccount').addEventListener('click', function () {
  setLoading(this, true, 'Deleting…');
  api('delete.php').finally(Session.toLogin);
});

/* ---------- Navbar search (replaces the All Tourist Spots page) ---------- */
const spotSearch = document.getElementById('spotSearch');
const searchResults = document.getElementById('searchResults');
function searchMatches(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  return PLACES.filter(p => p.name.toLowerCase().includes(q) || p.town.toLowerCase().includes(q) || p.cats.some(c => label(CATS, c).toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function renderSearch() {
  const q = spotSearch.value;
  if (!q.trim()) { searchResults.classList.add('d-none'); searchResults.innerHTML = ''; return; }
  const found = searchMatches(q);
  searchResults.innerHTML = found.length
    ? found.map(p => `<a href="#" class="nav-search-item" role="option" data-place="${escapeHtml(p.name)}">
        ${placeThumb(p, 'sm')}
        <span><span class="fw-semibold d-block">${escapeHtml(p.name)}</span><span class="small text-secondary">${escapeHtml(p.town)}</span></span>
      </a>`).join('')
    : `<div class="nav-search-empty"><i class="bi bi-search me-1"></i>No places match "${escapeHtml(q.trim())}"</div>`;
  searchResults.classList.remove('d-none');
}
function closeSearch(clear) {
  searchResults.classList.add('d-none');
  if (clear) { spotSearch.value = ''; searchResults.innerHTML = ''; }
}
spotSearch.addEventListener('input', renderSearch);
spotSearch.addEventListener('focus', renderSearch);
spotSearch.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSearch(true); spotSearch.blur(); }
  if (e.key === 'Enter') { const first = searchMatches(spotSearch.value)[0]; if (first) { e.preventDefault(); closeSearch(true); openDetails(first.name); } }
});
searchResults.addEventListener('click', e => { if (e.target.closest('[data-place]')) closeSearch(true); });
document.addEventListener('click', e => { if (!e.target.closest('.nav-search')) closeSearch(false); });

/* ---------- SCRUM-12 / SCRUM-13: Browse destinations + filter by category ---------- */
// Everything comes from api/destinations.php and api/categories.php (the admin-managed data files). Nothing here lists a place or a category by hand.
let browseCat = 'all';          // 'all' or a category key
let lastCatalogLoad = 0;
let catalogBusy = false;

function browseCard(p) {
  const chips = [...new Set(p.cats || [])].map(c => `<span class="chip">${escHtml(label(CATS, c))}</span>`).join('');
  return `<div class="col-12 col-md-6 col-xl-4"><div class="place-card browse-card h-100" role="button" tabindex="0" data-place="${escapeHtml(p.name)}" aria-label="View details for ${escapeHtml(p.name)}">
    <div class="dm-thumb-wrap">
      ${placeThumb(p)}
      <span class="wx-chip d-none" data-wx="${escapeHtml(p.name)}"></span>
    </div>
    <div class="place-body">
      <h3 class="h6 fw-bold mb-0">${escapeHtml(p.name)}</h3>
      <div class="small text-secondary mb-2"><i class="bi bi-geo-alt me-1"></i>${escapeHtml(p.town)}</div>
      <p class="small mb-2">${escapeHtml(p.blurb)}</p>
      <div class="d-flex flex-wrap gap-1">${chips}${p.view ? `<span class="badge text-bg-warning"><i class="bi bi-${p.view}"></i> Good ${p.view} spot</span>` : ''}</div>
    </div>
  </div></div>`;
}

function browseMessage(icon, title, text, buttons) {
  return `<div class="col-12"><div class="empty-state"><i class="bi ${icon}"></i>
    <p class="fw-semibold mb-1">${title}</p><p class="small text-secondary mb-${buttons ? 3 : 0}">${text}</p>${buttons || ''}</div></div>`;
}

function renderBrowse() {
  const grid = document.getElementById('browseGrid'), filters = document.getElementById('browseFilters');
  const count = document.getElementById('browseCount'), reset = document.getElementById('browseReset');
  if (!catalogReady) {                                       // loading
    filters.innerHTML = '';
    reset.classList.add('d-none');
    count.textContent = 'Loading destinations…';
    grid.innerHTML = browseMessage('bi-hourglass-split', 'Loading destinations…', 'One moment.');
    return;
  }
  const places = [...new Map(PLACES.map(p => [p.id || p.name, p])).values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!places.length) {                                      // error (nothing to show) or nothing added yet
    filters.innerHTML = '';
    reset.classList.add('d-none');
    count.textContent = PLACES_ERROR ? 'Destinations could not be loaded.' : 'No destinations yet.';
    grid.innerHTML = PLACES_ERROR
      ? browseMessage('bi-wifi-off', "Couldn't load destinations", escapeHtml(PLACES_ERROR), '<button class="btn btn-primary btn-sm" type="button" data-action="catalog-retry"><i class="bi bi-arrow-clockwise me-1"></i>Try again</button>')
      : browseMessage('bi-geo-alt', 'No destinations yet', 'Check back soon. New places appear here as soon as they are added.');
    return;
  }
  // A category that was removed (or a stale filter) quietly falls back to "all", so the list can never end up blank by mistake.
  if (browseCat !== 'all' && !CATS.some(c => c[0] === browseCat)) browseCat = 'all';

  const perCat = {};
  places.forEach(p => new Set(p.cats || []).forEach(c => { perCat[c] = (perCat[c] || 0) + 1; }));
  const pill = (key, icon, text, n) => `<button type="button" class="cat-pill ${browseCat === key ? 'active' : ''}" data-cat="${escapeHtml(key)}" aria-pressed="${browseCat === key}">
      <i class="bi ${escHtml(icon)}"></i><span>${escHtml(text)}</span><em>${n}</em></button>`;
  filters.innerHTML = pill('all', 'bi-grid', 'All', places.length) + CATS.map(([key, icon, text]) => pill(key, icon, text, perCat[key] || 0)).join('');

  const shown = browseCat === 'all' ? places : places.filter(p => (p.cats || []).includes(browseCat));
  const catLabel = label(CATS, browseCat);
  reset.classList.toggle('d-none', browseCat === 'all');
  count.textContent = browseCat === 'all'
    ? `${places.length} destination${places.length === 1 ? '' : 's'}`
    : `${shown.length} of ${places.length} destination${places.length === 1 ? '' : 's'} in ${catLabel}`;
  grid.innerHTML = shown.length
    ? shown.map(browseCard).join('')
    : browseMessage('bi-funnel', `No destinations in ${escapeHtml(catLabel)} yet`, 'Try another category, or go back to all destinations.',
        '<button class="btn btn-outline-secondary btn-sm" type="button" data-action="browse-reset"><i class="bi bi-x-circle me-1"></i>Show all destinations</button>');
  paintWeather();
}

document.getElementById('browseFilters').addEventListener('click', e => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  browseCat = b.dataset.cat;
  renderBrowse();
});
document.getElementById('browseReset').addEventListener('click', () => { browseCat = 'all'; renderBrowse(); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  if (b.dataset.action === 'browse-reset') { browseCat = 'all'; renderBrowse(); }
  if (b.dataset.action === 'catalog-retry') { catalogReady = false; renderBrowse(); renderRecommended(); refreshCatalog(true); }
});

renderBrowse();   // starts in the loading state; redrawn once the data arrives

// Reloads destinations and categories from the server and redraws every place on the page, so an admin's edits (text, categories, photos, new or deleted places)
// show up without logging out. Runs when the directory or dashboard is opened, when the tab comes back into view, and on "Try again".
async function refreshCatalog(force) {
  if (catalogBusy || (!force && (!catalogReady || Date.now() - lastCatalogLoad < 2000))) return;   // no needless requests when someone flips between tabs
  catalogBusy = true;
  try {
    await Promise.all([loadPlaces(), loadCats()]);
    lastCatalogLoad = Date.now();
    catalogReady = true;
    savedPrefs = cleanPrefs(savedPrefs);
    recentlyViewed = recentlyViewed.filter(n => PLACES.some(p => p.name === n));
    renderBrowse();
    renderRecommended();
    renderRecent();
    if (!document.getElementById('prefsModal').classList.contains('show')) paintPrefsForm();   // never rewrite the form while it is open
  } finally { catalogBusy = false; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && catalogReady && Date.now() - lastCatalogLoad > 60000) refreshCatalog();
});

/* ---------- Destination Details popup ---------- */
const detailsModal = new bootstrap.Modal(document.getElementById('detailsModal'));

const weatherModalEl = document.getElementById('weatherModal');
function openDetails(name) {
  const p = PLACES.find(x => x.name === name);
  if (!p) return;
  // Opened from inside the weather list? Close that popup first, then open this one.
  if (weatherModalEl.classList.contains('show')) {
    weatherModalEl.addEventListener('hidden.bs.modal', () => openDetails(name), { once: true });
    bootstrap.Modal.getInstance(weatherModalEl).hide();
    return;
  }
  openPlace = p;

  document.getElementById('dmThumbWrap').innerHTML = placeThumb(p);
  document.getElementById('dmName').textContent = p.name;
  document.getElementById('dmTown').innerHTML = `<i class="bi bi-geo-alt me-1"></i>${escapeHtml(p.town)}, Leyte`;
  document.getElementById('dmCats').innerHTML = (p.cats || []).map(c => `<span class="chip">${escHtml(label(CATS, c))}</span>`).join('')
    + (p.view ? `<span class="badge text-bg-warning"><i class="bi bi-${p.view}"></i> Good ${p.view} spot</span>` : '');
  document.getElementById('dmBlurb').textContent = p.blurb || '';
  // Optional details: a row (or block) with nothing in it is hidden, never shown empty or broken.
  const $ = id => document.getElementById(id);
  const fact = (id, value) => { const dd = $(id); dd.textContent = value || ''; dd.classList.toggle('d-none', !value); dd.previousElementSibling.classList.toggle('d-none', !value); };
  const names = (list, vals) => (vals || []).map(v => label(list, v)).join(', ');
  $('dmAbout').textContent = p.about || '';
  $('dmAbout').classList.toggle('d-none', !p.about);
  const highlights = p.highlights || [];
  $('dmHighlights').innerHTML = highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('');
  $('dmHighlights').classList.toggle('d-none', !highlights.length);
  $('dmHighlightsHead').classList.toggle('d-none', !highlights.length);
  fact('dmFee', p.fee);
  fact('dmHours', p.hours);
  fact('dmArea', p.area === 'rural' ? 'Rural (countryside, islands, mountains)' : p.area === 'urban' ? 'Urban (city or town center)' : '');
  fact('dmTimes', names(TIMES, p.time));
  fact('dmStay', names(TRIPS, p.stay));
  fact('dmBest', p.best);
  fact('dmGetThere', p.getThere);
  const facilities = p.facilities || [];
  $('dmFacilities').innerHTML = facilities.map(f => `<li>${escapeHtml(f)}</li>`).join('');
  $('dmFacilities').parentElement.classList.toggle('d-none', !facilities.length);
  $('dmFacilities').parentElement.previousElementSibling.classList.toggle('d-none', !facilities.length);
  const anyFact = !!$('dmFacts').querySelector('dd:not(.d-none)');   // no practical details at all: hide the heading too
  $('dmFactsCard').classList.toggle('d-none', !anyFact);
  $('dmTip').textContent = p.tip || '';
  $('dmTipBox').classList.toggle('d-none', !p.tip);

  paintDetailsWeather(p);

  detailsModal.show();
  markViewed(p.name);
}

document.getElementById('detailsModal').addEventListener('hidden.bs.modal', () => { openPlace = null; });

// Fills the weather box in the destination profile from the live OpenWeather reading (api/weather.php). The profile is the one place
// that shows the full reading (temperature, conditions, feels like, humidity, wind, rain, tip). There is no made-up fallback: every
// case without a reading says what is going on. A reading more than three hours old is labelled as old, never as current.
// Temperature tiers for the weather card's accent colour (CSS: .dm-weather[data-tier]). Upper bounds are exclusive and apply to the
// rounded temperature that is shown: <10 cold, 10-19 cool, 20-27 mild, 28-32 warm, 33+ hot. A missing or invalid temperature = no tier (neutral card).
const WX_TIERS = [[10, 'cold'], [20, 'cool'], [28, 'mild'], [33, 'warm']];
function wxTier(tempC) {
  const t = typeof tempC === 'number' ? Math.round(tempC) : NaN;
  if (!Number.isFinite(t)) return '';
  return (WX_TIERS.find(([max]) => t < max) || [0, 'hot'])[1];
}
function paintDetailsWeather(p) {
  const wx = Weather.info(p.name, { allowOld: true });
  const $ = id => document.getElementById(id);
  const say = (icon, title, text, retry) => {
    $('dmWeather').removeAttribute('data-tier');
    $('dmWeatherIcon').className = `bi ${icon}`;
    $('dmWeatherTemp').textContent = '';
    $('dmWeatherCond').textContent = title;
    $('dmWeatherMeta').textContent = '';
    $('dmWeatherTip').textContent = text;
    $('dmWeatherSrc').textContent = '';
    $('dmWeatherRetry').classList.toggle('d-none', !retry);
  };
  if (wx) {
    const tier = wxTier(wx.tempC);
    if (tier) $('dmWeather').dataset.tier = tier; else $('dmWeather').removeAttribute('data-tier');
    $('dmWeatherIcon').className = `bi ${wx.icon}`;
    $('dmWeatherTemp').textContent = `${wx.tempC}°C`;
    $('dmWeatherCond').textContent = wx.desc;
    $('dmWeatherMeta').innerHTML = `<span class="wx-stat"><i class="bi bi-thermometer-half"></i>Feels like <strong>${wx.feelsC}°C</strong></span>`
      + `<span class="wx-stat"><i class="bi bi-droplet-half"></i>Humidity <strong>${wx.humidity}%</strong></span>`
      + `<span class="wx-stat"><i class="bi bi-wind"></i>Wind <strong>${wx.windKph} km/h</strong></span>`
      + (wx.rainMm > 0 ? `<span class="wx-stat"><i class="bi bi-cloud-rain"></i><strong>${wx.rainMm} mm/h</strong></span>` : '');
    $('dmWeatherTip').textContent = wx.old ? '' : wx.tip;
    $('dmWeatherSrc').textContent = wx.old
      ? `Older reading from ${new Date(wx.observed * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. It may not match the weather now.`
      : Weather.stamp();
    $('dmWeatherRetry').classList.toggle('d-none', !wx.old);      // an old reading can be refreshed by hand
  } else if (Weather.loading) {
    say('bi-hourglass-split', 'Loading weather…', '', false);
  } else if (!Weather.live) {
    say('bi-cloud-slash', 'Weather unavailable', Weather.error || 'The live weather could not be loaded.', true);
  } else {
    say('bi-cloud-slash', 'No reading for this place', 'There is no live reading for this destination right now. Its location may be missing, or the weather service did not answer.', true);
  }
}
document.getElementById('dmWeatherRetry').addEventListener('click', async function () {
  this.disabled = true;
  await refreshWeather();                                         // repaints the open profile when the answer arrives
  this.disabled = false;
});

// Event delegation: any element with data-place, anywhere on the page, opens its details.
document.addEventListener('click', e => {
  const el = e.target.closest('[data-place]');
  if (!el) return;
  e.preventDefault();
  openDetails(el.dataset.place);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('[data-place]');
  if (!el) return;
  e.preventDefault();
  openDetails(el.dataset.place);
});

/* ---------- Live weather (OpenWeather, via api/weather.php) ---------- */
// Updates every weather spot on the page in place: card chips, list chips, "rain now" badges, header badge,
// the Check weather popup and (if open) the destination profile.
function paintWeather() {
  document.querySelectorAll('[data-wx]').forEach(el => {
    const wx = Weather.info(el.dataset.wx);
    el.classList.toggle('d-none', !wx);
    el.innerHTML = wx ? `<i class="bi ${wx.icon}"></i> ${wx.tempC}°` : '';
    if (wx) el.title = wx.desc;
  });
  document.querySelectorAll('[data-wx-alert]').forEach(el => {
    const wx = Weather.info(el.dataset.wxAlert);
    const pl = PLACES.find(p => p.name === el.dataset.wxAlert);
    const bad = wx && pl && wx.wet && pl.cats.some(isOutdoorCat);
    el.innerHTML = bad ? `<span class="badge text-bg-info"><i class="bi bi-cloud-rain me-1"></i>${wx.group === 'thunder' ? 'Storm now' : wx.group === 'rain' ? 'Rain now' : 'Rough weather'}</span>` : '';
  });

  const badge = document.getElementById('liveWeather'), tac = Weather.info('Tacloban City');
  badge.innerHTML = tac
    ? `<i class="bi ${tac.icon} me-1"></i>${tac.tempC}°C, ${Weather.esc(tac.desc)} in Tacloban City`
    : (Weather.error || Weather.live ? `<i class="bi bi-cloud-slash me-1"></i>Weather unavailable` : `<i class="bi bi-cloud me-1"></i>Loading weather…`);   // "Loading" only until the first answer arrives
  if (!tac && Weather.error) badge.title = Weather.error;

  renderWeatherList();
  if (openPlace) paintDetailsWeather(openPlace);
}

// "Check weather" popup: every spot, grouped by town (live readings only; a spot with no reading says "No data").
function renderWeatherList() {
  const list = document.getElementById('weatherList');
  const note = document.getElementById('weatherNote');
  if (!Weather.live) {
    // Nothing loaded yet: either the first request is still running, or it failed (the Refresh button tries again).
    list.innerHTML = Weather.loading || !Weather.error
      ? `<div class="empty-state"><span class="spinner-border spinner-border-sm text-secondary mb-2" aria-hidden="true"></span><p class="fw-semibold mb-0">Loading weather…</p></div>`
      : `<div class="empty-state"><i class="bi bi-cloud-slash"></i><p class="fw-semibold mb-1">Live weather isn't available</p><p class="small text-secondary mb-0">${Weather.esc(Weather.error)}</p></div>`;
    note.textContent = '';
    return;
  }
  const byTown = [...PLACES].sort((a, b) => a.town.localeCompare(b.town) || a.name.localeCompare(b.name));
  list.innerHTML = byTown.map(p => {
    const wx = Weather.info(p.name);
    return `<a href="#" class="list-group-item list-group-item-action d-flex align-items-center gap-3" data-place="${escapeHtml(p.name)}">
      ${placeThumb(p, 'sm')}
      <span class="flex-grow-1"><span class="fw-semibold d-block">${escapeHtml(p.name)}</span>
        <span class="small text-secondary">${escapeHtml(p.town)}${wx ? ` · ${Weather.esc(wx.desc)}` : ''}</span></span>
      ${wx ? `<span class="text-end"><span class="fw-bold"><i class="bi ${wx.icon} me-1"></i>${wx.tempC}°C</span>
        <span class="d-block small text-secondary"><i class="bi bi-wind"></i> ${wx.windKph} km/h</span></span>` : '<span class="small text-secondary">No data</span>'}
    </a>`;
  }).join('');
  // Some places answered but the latest refresh failed: say so instead of looking current.
  note.textContent = Weather.stamp() + (Weather.error ? ` · ${Weather.error}` : '');
}

let weatherTimer = null, lastWeatherLoad = 0;
const WEATHER_EVERY_MS = 10 * 60 * 1000;   // matches the server cache (WEATHER_TTL), so asking more often would only repeat the same answer
async function refreshWeather() {
  lastWeatherLoad = Date.now();
  const pending = Weather.load();
  renderWeatherList();                              // "Loading weather…" in the popup while the first request runs
  if (openPlace) paintDetailsWeather(openPlace);    // and in an open profile
  const ok = await pending;
  if (ok) renderRecommended();      // ranking may change (rain moves outdoor spots down); also repaints
  else paintWeather();
}
document.getElementById('refreshWeatherBtn').addEventListener('click', async function () {
  setLoading(this, true, 'Refreshing…');
  await refreshWeather();
  setLoading(this, false);
  this.focus();                       // a disabled button drops focus, which would stop Esc from closing the popup
});
function startWeather() {
  refreshWeather();
  clearInterval(weatherTimer);
  weatherTimer = setInterval(() => { if (document.visibilityState === 'visible') refreshWeather(); }, WEATHER_EVERY_MS);   // a hidden tab doesn't poll
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && lastWeatherLoad && Date.now() - lastWeatherLoad > WEATHER_EVERY_MS) refreshWeather();   // catch up when the tab comes back
});

/* ---------- Load the signed-in user from the server ---------- */
// Remember the theme choice on the account (light | dark).
Theme.onChange(mode => { api('theme.php', { theme: mode }); });

(async function () {
  const res = await api('me.php');
  if (!res.ok) { Session.toLogin(); return; }      // not logged in: back to the login page

  applyUser(res.user);
  await Promise.all([PLACES_READY, CATS_READY]);    // destinations (data/destinations.json) and categories (data/categories.json) come from the server
  lastCatalogLoad = Date.now();
  catalogReady = true;
  startWeather();
  if (res.user.prefs) savedPrefs = cleanPrefs(res.user.prefs);
  recentlyViewed = (res.user.recent || []).filter(n => PLACES.some(p => p.name === n)).slice(0, RECENT_MAX);   // load the saved list
  renderRecent();
  paintPrefsForm();
  renderRecommended();
  renderBrowse();
  if (!Theme.hasSaved()) Theme.set(res.user.theme, { silent: true });     // a browser with no choice of its own takes the account's theme

  // First visit after registering says "Welcome, Name". Later visits say "Welcome back, Name".
  if (sessionStorage.getItem('leyteNewUser')) {
    sessionStorage.removeItem('leyteNewUser');
    document.getElementById('welcomeBack').classList.add('d-none');
  }
  document.body.classList.remove('auth-pending');
})();