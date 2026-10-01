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
const VIEWS = ['dashboard', 'history'];
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

// Shows one section (#view-dashboard or #view-history) and hides the other.
// skipHash: true when called from a hashchange event, so it doesn't rewrite the URL it was just given.
function showView(name, opts = {}) {
  if (!VIEWS.includes(name)) name = 'dashboard';
  document.querySelectorAll('.dash-view').forEach(el => el.classList.toggle('d-none', el.id !== `view-${name}`));
  document.querySelectorAll('.dash-sidebar-link').forEach(a => a.classList.toggle('active', a.dataset.view === name));
  if (!opts.skipHash) history.pushState(null, '', `#${name}`);
  if (!opts.silent) window.scrollTo({ top: 0, behavior: 'smooth' });
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
      <span><strong>${title}</strong>${sub ? `<small class="d-block text-secondary">${sub}</small>` : ''}</span></label></div>`;
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
  savedPrefs = res.prefs;
  paintPrefsForm();
  renderRecommended();

  alertBox.className = 'alert alert-success py-2 small';
  const none = !hasPrefs();
  alertBox.textContent = none ? 'Preferences cleared. Pick some to get recommendations.' : 'Preferences saved. Your recommendations were updated.';
  notifySuccess('Preferences updated', none ? 'No preferences picked, so there are no recommendations right now.' : 'Your recommendations were refreshed to match.');
});

/* ---------- SCRUM-26: Home Dashboard ---------- */
function placeCard(p, rank) {
  const topPick = rank === 0;
  const greatMatch = rank === 1 || rank === 2;
  return `<div class="col-12 col-xl-6"><div class="place-card place-card-h h-100 ${topPick ? 'is-top-pick' : ''}" role="button" tabindex="0" data-place="${p.name}">
    <div class="dm-thumb-wrap">
      ${placeThumb(p)}
      <span class="wx-chip d-none" data-wx="${p.name}"></span>
      ${topPick ? `<span class="top-pick-ribbon"><i class="bi bi-star-fill"></i> Top pick</span>` : ''}
    </div>
    <div class="place-body">
    <h3 class="h6 fw-bold mb-0">${p.name}</h3><div class="small text-secondary mb-2"><i class="bi bi-geo-alt me-1"></i>${p.town}</div>
    <p class="small mb-0">${p.blurb}</p>
    <div class="d-flex flex-wrap gap-1 mt-2">
      ${greatMatch ? `<span class="badge rank-badge"><i class="bi bi-check-circle-fill me-1"></i>Great match</span>` : ''}
      ${p.view ? `<span class="badge text-bg-warning"><i class="bi bi-${p.view}"></i> Good ${p.view} spot</span>` : ''}
      ${!p.costOk ? `<span class="badge text-bg-secondary"><i class="bi bi-cash-coin"></i> Over your budget</span>` : ''}
      <span data-wx-alert="${p.name}"></span>
    </div>
    </div>
  </div></div>`;
}
// True when the user has picked at least one thing. With nothing picked there is nothing to recommend.
function hasPrefs() {
  return !!((savedPrefs.cats || []).length || savedPrefs.area || savedPrefs.budget || savedPrefs.trip);
}
function renderRecommended() {
  const box = document.getElementById('recommended');
  if (!hasPrefs()) {
    if (box.dataset.sig !== 'none') {
      box.dataset.sig = 'none';
      box.innerHTML = `<div class="recs-empty"><div class="empty-state"><i class="bi bi-sliders"></i>
        <p class="fw-semibold mb-1">No recommendations yet</p>
        <p class="small text-secondary mb-3">You haven't picked any preferences. Choose what you like and we'll suggest places.</p>
        <button class="btn btn-primary btn-sm" type="button" data-bs-toggle="modal" data-bs-target="#prefsModal"><i class="bi bi-sliders me-1"></i>Set preferences</button></div></div>`;
    }
    paintWeather();
    return;
  }
  const scored = PLACES.map(p => {
    const hits = p.cats.filter(c => (savedPrefs.cats || []).includes(c)).length;
    const areaOk = !savedPrefs.area || savedPrefs.area === 'either' || p.area === savedPrefs.area;   // nothing picked = no filter
    const costOk = !savedPrefs.budget || budgetOk(p, savedPrefs.budget);
    const lenOk = !savedPrefs.trip || tripOk(p, savedPrefs.trip);
    const wx = Weather.info(p.name);
    const weatherHit = wx && wx.wet && p.cats.some(c => c === 'beach' || c === 'nature') ? -3 : 0;   // rain or rough seas: outdoor spots slip down
    const score = weatherHit + hits * 3 + (areaOk ? 2 : 0) + (costOk ? 2 : 0) + (lenOk ? 1 : 0);
    return { ...p, costOk, score };
  });
  // Budget-fitting matches come first (mirrors the sign-up questionnaire), so "Free only" etc. actually shapes the list
  // instead of being outweighed by a category match. Only reaches into over-budget places when there aren't enough that fit.
  // For "Any budget", equally good matches break ties by fee, priciest first, then mid-range, then free.
  const byScore = (a, b) => b.score - a.score || (savedPrefs.budget === 'any' ? b.feeAmt - a.feeAmt : 0);
  const fits    = scored.filter(p => p.costOk).sort(byScore);
  const overBudget = scored.filter(p => !p.costOk).sort(byScore);
  const scored6 = [...fits, ...overBudget].slice(0, 6);
  const sig = scored6.map(p => p.name).join('|');
  if (box.dataset.sig !== sig) {                       // only rebuild the cards when the order really changed (keeps animations calm)
    box.dataset.sig = sig;
    box.innerHTML = scored6.map((p, i) => placeCard(p, i)).join('');
  }
  paintWeather();
}
renderRecommended();

// Recently viewed / favorites: this function can be called again any time the underlying list changes.
function simpleList(id, names, empty) {
  const el = document.getElementById(id);
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
    return `<a href="#" class="list-group-item list-group-item-action d-flex align-items-center gap-3" data-place="${p.name}">
      ${placeThumb(p, 'sm')}
      <span><span class="fw-semibold d-block">${p.name}</span><span class="small text-secondary">${p.town}</span></span>
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
    ? found.map(p => `<a href="#" class="nav-search-item" role="option" data-place="${p.name}">
        ${placeThumb(p, 'sm')}
        <span><span class="fw-semibold d-block">${p.name}</span><span class="small text-secondary">${p.town}</span></span>
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

/* ---------- Destination Details popup ---------- */
const detailsModal = new bootstrap.Modal(document.getElementById('detailsModal'));

function weatherIcon(condition) {
  return { sunny: 'bi-sun', partly: 'bi-cloud-sun', cloudy: 'bi-clouds', rain: 'bi-cloud-rain' }[condition] || 'bi-cloud';
}

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
  document.getElementById('dmTown').innerHTML = `<i class="bi bi-geo-alt me-1"></i>${p.town}, Leyte`;
  document.getElementById('dmCats').innerHTML = p.cats.map(c => `<span class="chip">${label(CATS, c)}</span>`).join('')
    + (p.view ? `<span class="badge text-bg-warning"><i class="bi bi-${p.view}"></i> Good ${p.view} spot</span>` : '');
  document.getElementById('dmBlurb').textContent = p.blurb;
  document.getElementById('dmAbout').textContent = p.about || '';
  document.getElementById('dmHighlights').innerHTML = (p.highlights || []).map(h => `<li>${h}</li>`).join('');
  document.getElementById('dmFee').textContent = p.fee;
  document.getElementById('dmHours').textContent = p.hours;
  document.getElementById('dmBest').textContent = p.best || '';
  document.getElementById('dmGetThere').textContent = p.getThere || '';
  document.getElementById('dmTip').textContent = p.tip || '';
  document.getElementById('dmFacilities').innerHTML = p.facilities.map(f => `<li>${f}</li>`).join('');

  paintDetailsWeather(p);

  detailsModal.show();
  markViewed(p.name);
}

document.getElementById('detailsModal').addEventListener('hidden.bs.modal', () => { openPlace = null; });

// Fills the weather box in the popup: live OpenWeather reading, or the sample text from data.js when live weather isn't connected.
function paintDetailsWeather(p) {
  const wx = Weather.info(p.name);
  const $ = id => document.getElementById(id);
  if (wx) {
    $('dmWeatherIcon').className = `bi ${wx.icon}`;
    $('dmWeatherTemp').textContent = `${wx.tempC}°C`;
    $('dmWeatherCond').textContent = wx.desc;
    $('dmWeatherMeta').innerHTML = `<i class="bi bi-thermometer-half"></i> Feels like ${wx.feelsC}°C &nbsp;·&nbsp; <i class="bi bi-droplet-half"></i> ${wx.humidity}% &nbsp;·&nbsp; <i class="bi bi-wind"></i> ${wx.windKph} km/h`
      + (wx.rainMm > 0 ? ` &nbsp;·&nbsp; <i class="bi bi-cloud-rain"></i> ${wx.rainMm} mm/h` : '');
    $('dmWeatherTip').textContent = wx.tip;
    $('dmWeatherSrc').textContent = Weather.stamp();
  } else {
    const s = p.weather;
    $('dmWeatherIcon').className = `bi ${weatherIcon(s.condition)}`;
    $('dmWeatherTemp').textContent = `${s.tempC}°C`;
    $('dmWeatherCond').textContent = WEATHER_LABELS[s.condition] || '';
    $('dmWeatherMeta').textContent = '';
    $('dmWeatherTip').textContent = s.tip;
    $('dmWeatherSrc').textContent = 'Sample weather. Live weather is not connected yet.';
  }
}

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
// the weather popup and (if open) the details popup.
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
    const bad = wx && pl && wx.wet && pl.cats.some(c => c === 'beach' || c === 'nature');
    el.innerHTML = bad ? `<span class="badge text-bg-info"><i class="bi bi-cloud-rain me-1"></i>${wx.group === 'thunder' ? 'Storm now' : wx.group === 'rain' ? 'Rain now' : 'Rough weather'}</span>` : '';
  });

  const badge = document.getElementById('liveWeather'), tac = Weather.info('Tacloban City');
  badge.innerHTML = tac
    ? `<i class="bi ${tac.icon} me-1"></i>${tac.tempC}°C, ${Weather.esc(tac.desc)} in Tacloban City`
    : (Weather.error ? `<i class="bi bi-cloud-slash me-1"></i>Weather unavailable` : `<i class="bi bi-cloud me-1"></i>Loading weather…`);
  if (!tac && Weather.error) badge.title = Weather.error;

  renderWeatherList();
  if (openPlace) paintDetailsWeather(openPlace);
}

// "Check weather" popup: every spot, grouped by town.
function renderWeatherList() {
  const list = document.getElementById('weatherList');
  const note = document.getElementById('weatherNote');
  if (!Weather.live) {
    list.innerHTML = `<div class="empty-state"><i class="bi bi-cloud-slash"></i><p class="fw-semibold mb-1">Live weather isn't available</p><p class="small text-secondary mb-0">${Weather.esc(Weather.error || 'Loading…')}</p></div>`;
    note.textContent = '';
    return;
  }
  const byTown = [...PLACES].sort((a, b) => a.town.localeCompare(b.town) || a.name.localeCompare(b.name));
  list.innerHTML = byTown.map(p => {
    const wx = Weather.info(p.name);
    return `<a href="#" class="list-group-item list-group-item-action d-flex align-items-center gap-3" data-place="${p.name}">
      ${placeThumb(p, 'sm')}
      <span class="flex-grow-1"><span class="fw-semibold d-block">${p.name}</span>
        <span class="small text-secondary">${p.town}${wx ? ` · ${Weather.esc(wx.desc)}` : ''}</span></span>
      ${wx ? `<span class="text-end"><span class="fw-bold"><i class="bi ${wx.icon} me-1"></i>${wx.tempC}°C</span>
        <span class="d-block small text-secondary"><i class="bi bi-wind"></i> ${wx.windKph} km/h</span></span>` : '<span class="small text-secondary">No data</span>'}
    </a>`;
  }).join('');
  note.textContent = Weather.stamp();
}

let weatherTimer = null;
async function refreshWeather() {
  const ok = await Weather.load();
  if (ok) renderRecommended();      // ranking may change (rain moves outdoor spots down); also repaints
  else paintWeather();
}
document.getElementById('refreshWeatherBtn').addEventListener('click', async function () {
  setLoading(this, true, 'Refreshing…');
  await refreshWeather();
  setLoading(this, false);
});
function startWeather() {
  refreshWeather();
  clearInterval(weatherTimer);
  weatherTimer = setInterval(refreshWeather, 10 * 60 * 1000);   // matches the server cache (WEATHER_TTL)
}

/* ---------- Load the signed-in user from the server ---------- */
// Remember the theme choice on the account (light | dark | auto).
Theme.onChange(mode => { api('theme.php', { theme: mode }); });

(async function () {
  const res = await api('me.php');
  if (!res.ok) { Session.toLogin(); return; }      // not logged in: back to the login page

  applyUser(res.user);
  await loadPlaceImages();                          // photos are discovered on the server, not hard-coded
  startWeather();
  if (res.user.prefs) savedPrefs = res.user.prefs;
  recentlyViewed = (res.user.recent || []).filter(n => PLACES.some(p => p.name === n)).slice(0, RECENT_MAX);   // load the saved list
  renderRecent();
  paintPrefsForm();
  document.getElementById('recommended').dataset.sig = '';   // force a rebuild now that photos are known
  renderRecommended();
  Theme.set(res.user.theme, { silent: true });     // use the theme saved on the account

  // First visit after registering says "Welcome, Name". Later visits say "Welcome back, Name".
  if (sessionStorage.getItem('leyteNewUser')) {
    sessionStorage.removeItem('leyteNewUser');
    document.getElementById('welcomeBack').classList.add('d-none');
  }
  document.body.classList.remove('auth-pending');
})();