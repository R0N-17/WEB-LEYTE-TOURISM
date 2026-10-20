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

  // ---------- Login page slideshow ----------
  const slideList = $('slideList'), slideModal = new bootstrap.Modal($('slideModal')), slideDelModal = new bootstrap.Modal($('slideDelModal'));
  const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], MAX_PHOTO = 3 * 1024 * 1024;
  let slides = [], slideMax = 8, editingSlide = null, deletingSlide = null, slideSaving = false;

  function renderSlides() {
    slideList.setAttribute('aria-busy', 'false');
    slideList.innerHTML = slides.map((s, i) => `<div class="ad-slide-row" data-id="${esc(s.id)}">
        <span class="num" aria-hidden="true">${i + 1}</span>
        <div class="ad-slide-thumb">${s.image ? `<img src="../${esc(s.image)}" alt="">` : '<i class="bi bi-image" aria-hidden="true"></i>'}</div>
        <div class="ad-slide-info"><div class="t">${esc(s.title)}</div><div class="s">${esc([s.place, s.text].filter(Boolean).join(' · ')) || '<i>No place or description</i>'}${s.image ? '' : ' · <i>illustrated background</i>'}</div></div>
        <div class="ad-actions">
          <button type="button" class="btn btn-outline-secondary" data-act="up" aria-label="Move ${esc(s.title)} up" ${i === 0 ? 'disabled' : ''}><i class="bi bi-arrow-up" aria-hidden="true"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-act="down" aria-label="Move ${esc(s.title)} down" ${i === slides.length - 1 ? 'disabled' : ''}><i class="bi bi-arrow-down" aria-hidden="true"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-act="edit"><i class="bi bi-pencil me-1" aria-hidden="true"></i>Edit</button>
          <button type="button" class="btn btn-outline-danger" data-act="del" aria-label="Remove ${esc(s.title)}" ${slides.length <= 1 ? 'disabled' : ''}><i class="bi bi-trash3" aria-hidden="true"></i></button>
        </div></div>`).join('');
    $('slideCount').textContent = `${slides.length} of ${slideMax} slides`;
    $('slideAdd').disabled = slides.length >= slideMax;
  }

  async function loadSlides() {
    const res = await Admin.api('login-slides.php');
    if (!res.ok) {
      slideList.setAttribute('aria-busy', 'false');
      slideList.innerHTML = '<div class="alert alert-danger mb-0" role="alert"></div>';
      slideList.firstChild.textContent = res.message || 'Could not load the slideshow.';
      return;
    }
    slides = res.slides; slideMax = res.max || 8; renderSlides();
  }

  slideList.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-act]'); if (!btn || btn.disabled) return;
    const s = slides.find(x => x.id === btn.closest('.ad-slide-row').dataset.id); if (!s) return;
    if (btn.dataset.act === 'edit') openSlide(s);
    else if (btn.dataset.act === 'del') { deletingSlide = s; $('slideDelName').textContent = s.title; $('slideDelError').classList.add('d-none'); slideDelModal.show(); }
    else {
      btn.disabled = true;
      const res = await Admin.api('login-slide-move.php', { id: s.id, dir: btn.dataset.act });
      if (res.ok) { slides = res.slides; renderSlides(); } else { Admin.toast('danger', res.message || 'Could not move the slide.'); loadSlides(); }
    }
  });

  // Live preview inside the form
  const slideErr = msg => { const b = $('slideError'); b.textContent = msg; b.classList.toggle('d-none', !msg); if (msg) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  function paintPreview() {
    $('pvTitle').textContent = $('sTitle').value || 'Title'; $('pvPlace').textContent = $('sPlace').value; $('pvText').textContent = $('sText').value;
  }
  ['sTitle', 'sPlace', 'sText'].forEach(id => $(id).addEventListener('input', paintPreview));

  // state: 'none' | 'saved' | 'new'
  function setSlidePhoto(url, state) {
    state = url ? state : 'none';
    $('slidePrev').classList.toggle('d-none', !url); $('slideArt').classList.toggle('d-none', !!url);
    if (url) $('slidePrev').src = url;
    const st = $('slidePhotoState'); st.classList.toggle('new', state === 'new');
    st.innerHTML = state === 'new' ? '<i class="bi bi-eye" aria-hidden="true"></i><span>New photo, not saved yet</span>'
      : state === 'saved' ? '<i class="bi bi-check-circle" aria-hidden="true"></i><span>Current saved photo</span>'
      : '<i class="bi bi-image" aria-hidden="true"></i><span>No photo (illustrated background)</span>';
    const f = $('sPhoto').files[0]; $('slideFile').textContent = f && state === 'new' ? f.name : ''; $('slideFile').classList.toggle('d-none', !(f && state === 'new'));
  }
  const savedUrl = () => (editingSlide && editingSlide.image ? '../' + editingSlide.image : null);

  function openSlide(s) {
    editingSlide = s || null;
    $('slideForm').reset(); $('slideForm').classList.remove('was-validated'); slideErr('');
    $('slideTitle').textContent = s ? 'Edit slide' : 'Add slide'; $('slideSave').textContent = s ? 'Save changes' : 'Add slide';
    $('sTitle').value = s ? s.title : ''; $('sPlace').value = s ? s.place : ''; $('sText').value = s ? s.text : '';
    $('slideRemoveWrap').classList.toggle('d-none', !(s && s.image));
    setSlidePhoto(savedUrl(), 'saved'); paintPreview(); slideModal.show();
  }
  $('slideAdd').addEventListener('click', () => openSlide(null));

  $('sPhoto').addEventListener('change', () => {
    const f = $('sPhoto').files[0]; slideErr('');
    if (!f) { setSlidePhoto(savedUrl(), 'saved'); return; }
    if (!TYPES.includes(f.type)) { $('sPhoto').value = ''; setSlidePhoto(savedUrl(), 'saved'); slideErr('Only JPG, PNG, WebP or AVIF photos are allowed.'); return; }
    if (f.size > MAX_PHOTO) { $('sPhoto').value = ''; setSlidePhoto(savedUrl(), 'saved'); slideErr('That photo is larger than 3 MB. Choose a smaller one.'); return; }
    $('sRemove').checked = false; setSlidePhoto(URL.createObjectURL(f), 'new');
  });
  $('sRemove').addEventListener('change', () => { if ($('sRemove').checked) { $('sPhoto').value = ''; setSlidePhoto(null); } else setSlidePhoto(savedUrl(), 'saved'); });
  const drop = $('slideDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files[0]; if (!f) return;
    try { const dt = new DataTransfer(); dt.items.add(f); $('sPhoto').files = dt.files; } catch (err) { return; }
    $('sPhoto').dispatchEvent(new Event('change'));
  });

  const toDataUrl = file => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(file); });

  $('slideForm').addEventListener('submit', async e => {
    e.preventDefault(); if (slideSaving) return; slideErr('');
    if (!e.target.checkValidity()) { e.target.classList.add('was-validated'); slideErr('Enter the title.'); return; }
    const body = { id: editingSlide ? editingSlide.id : '', title: $('sTitle').value, place: $('sPlace').value, text: $('sText').value };
    const btn = $('slideSave'); slideSaving = true; Admin.loading(btn, true, 'Saving…');
    try {
      const f = $('sPhoto').files[0];
      if (f) body.photo = await toDataUrl(f); else if ($('sRemove').checked) body.remove_photo = true;
    } catch (err) { slideSaving = false; Admin.loading(btn, false); slideErr('The photo could not be read. Choose it again.'); return; }
    const res = await Admin.api('login-slide-save.php', body);
    slideSaving = false; Admin.loading(btn, false);
    if (!res.ok) { slideErr(res.message || 'Could not save. Try again.'); return; }
    slideModal.hide(); Admin.toast('success', res.message); loadSlides();
  });

  $('slideDelOk').addEventListener('click', async function () {
    if (!deletingSlide || this.disabled) return;
    Admin.loading(this, true, 'Removing…');
    const res = await Admin.api('login-slide-delete.php', { id: deletingSlide.id });
    Admin.loading(this, false);
    if (!res.ok) { const b = $('slideDelError'); b.textContent = res.message || 'Could not remove. Try again.'; b.classList.remove('d-none'); if (res.status === 404) loadSlides(); return; }
    slideDelModal.hide(); deletingSlide = null; Admin.toast('success', res.message); loadSlides();
  });

  loadSlides();
})();
