/* SCRUM-16: Manage Local Tourism Data (admin/destinations.html): list + search + filter, view, add, edit, delete.
   All data goes through api/admin/*. Everything shown is escaped, and the server checks every field again. */
(async function () {
  const admin = await Admin.guard('destinations');
  if (!admin) return;
  await Admin.loadCats();      // categories come from the server (data/categories.json), not from a fixed list

  const $ = id => document.getElementById(id), esc = Admin.esc;
  const MAX_PHOTO = 3 * 1024 * 1024;
  const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  let items = [], total = 0, editing = null, deleting = null, searchTimer = null;

  const formModal = new bootstrap.Modal($('formModal'));
  const viewModal = new bootstrap.Modal($('viewModal'));
  const deleteModal = new bootstrap.Modal($('deleteModal'));
  const form = $('destForm');

  /* ---------- static pieces: checkbox groups and dropdowns ---------- */
  const checks = (box, name, map) => {
    $(box).innerHTML = Object.entries(map).map(([k, label]) =>
      `<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="${name}" id="${name}-${k}" value="${k}"><label class="form-check-label" for="${name}-${k}">${esc(label)}</label></div>`).join('');
  };
  const renderCats = () => checks('fCats', 'cats', ADMIN_CATS);
  const renderCatFilter = () => { const cur = $('catFilter').value; $('catFilter').innerHTML = '<option value="">All categories</option>' +
    Object.entries(ADMIN_CATS).map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join(''); $('catFilter').value = cur; };
  renderCats();
  checks('fTimes', 'time', ADMIN_TIMES);
  renderCatFilter();

  const picked = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
  const setPicked = (name, vals) => form.querySelectorAll(`input[name="${name}"]`).forEach(i => { i.checked = (vals || []).includes(i.value); });
  const lines = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);

  /* ---------- "+ New category" shortcut: create a category without leaving the destination form ---------- */
  const newBox = $('newCatBox'), newErr = $('newCatError');
  function closeNewCat() { newBox.classList.add('d-none'); newErr.classList.add('d-none'); $('nLabel').value = ''; $('nOutdoor').checked = false; $('newCatToggle').setAttribute('aria-expanded', 'false'); }
  $('newCatToggle').addEventListener('click', () => {
    const open = newBox.classList.contains('d-none');
    if (!open) { closeNewCat(); return; }
    Admin.iconGrid($('nIcons'), 'nIcon', null);
    newBox.classList.remove('d-none'); $('newCatToggle').setAttribute('aria-expanded', 'true'); $('nLabel').focus();
  });
  $('nCancel').addEventListener('click', closeNewCat);
  $('nLabel').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('nAdd').click(); } });   // Enter must not submit the destination form
  $('nAdd').addEventListener('click', async function () {
    newErr.classList.add('d-none');
    const label = $('nLabel').value.trim();
    if (label.length < 2) { newErr.textContent = 'Enter a category name (at least two characters).'; newErr.classList.remove('d-none'); return; }
    Admin.loading(this, true, 'Adding…');
    const res = await Admin.api('category-save.php', { label, icon: (document.querySelector('input[name="nIcon"]:checked') || {}).value, outdoor: $('nOutdoor').checked });
    Admin.loading(this, false);
    if (!res.ok) { newErr.textContent = res.message || 'Could not add the category.'; newErr.classList.remove('d-none'); return; }
    const keep = picked('cats');                       // what the admin already ticked stays ticked
    await Admin.loadCats();
    renderCats(); renderCatFilter();
    setPicked('cats', [...keep, res.category.key]);    // the new category is immediately available and selected
    closeNewCat();
    Admin.toast('success', res.message);
  });

  /* ---------- list (Read) ---------- */
  async function load() {
    const res = await Admin.api('destinations.php', { q: $('searchBox').value, cat: $('catFilter').value });
    const err = $('listError');
    if (!res.ok) { err.textContent = res.message || 'Could not load destinations.'; err.classList.remove('d-none'); return; }
    err.classList.add('d-none');
    total = res.total;
    const check = $('qualityFilter').value, keys = Object.keys(ADMIN_CATS);
    items = check ? res.destinations.filter(d => {   // data-check filter (same rules as the dashboard's Needs attention)
      const bad = Admin.issues(d, keys);
      return check === 'has-photo' ? !!d.image : bad.includes(check);
    }) : res.destinations;
    render();
  }

  const thumb = d => d.image
    ? `<img class="ad-thumb" src="../${esc(d.image)}" alt="" loading="lazy">`
    : `<span class="ad-thumb" aria-hidden="true"><i class="bi bi-image"></i></span>`;

  function render() {
    const filtered = $('searchBox').value.trim() || $('catFilter').value || $('qualityFilter').value;
    $('countNote').textContent = total ? `Showing ${items.length} of ${total} destination${total === 1 ? '' : 's'}` : '';
    if (!items.length) {
      $('rows').innerHTML = `<tr><td colspan="6"><div class="ad-empty"><i class="bi bi-geo-alt" aria-hidden="true"></i>${
        filtered ? '<div class="t">No matching destinations</div>Try a different search or clear the filter.'
                 : '<div class="t">No destinations yet</div>Click “Add destination” to create the first one.'}</div></td></tr>`;
      return;
    }
    $('rows').innerHTML = items.map(d => `<tr>
      <td><div class="d-flex align-items-center gap-3">${thumb(d)}<div class="min-w-0"><div class="ad-name">${esc(d.name)}</div>
        <div class="ad-sub">${esc(d.hours)}${d.image ? '' : ' · <span class="ad-badge muted"><i class="bi bi-image" aria-hidden="true"></i>No photo</span>'}</div></div></div></td>
      <td data-label="Location">${esc(d.town)}</td>
      <td data-label="Categories">${(d.cats || []).map(c => `<span class="ad-chip">${esc(ADMIN_CATS[c] || c)}</span>`).join('')}</td>
      <td data-label="Entrance fee">${esc(d.fee)}</td>
      <td class="d-none d-xl-table-cell small text-secondary" title="${esc(Admin.fmtDateTime(d.updated))}">${esc(Admin.fmtDate(d.updated))}</td>
      <td class="ad-actions">
        <button type="button" class="btn btn-outline-secondary" data-act="view" data-id="${esc(d.id)}" title="View" aria-label="View ${esc(d.name)}"><i class="bi bi-eye" aria-hidden="true"></i></button>
        <button type="button" class="btn btn-outline-primary" data-act="edit" data-id="${esc(d.id)}" aria-label="Edit ${esc(d.name)}"><i class="bi bi-pencil-square" aria-hidden="true"></i><span class="ms-1">Edit</span></button>
        <button type="button" class="btn btn-outline-danger" data-act="delete" data-id="${esc(d.id)}" title="Delete" aria-label="Delete ${esc(d.name)}"><i class="bi bi-trash3" aria-hidden="true"></i></button>
      </td></tr>`).join('');
  }

  $('rows').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const d = items.find(x => x.id === b.dataset.id);
    if (!d) return;
    if (b.dataset.act === 'view') openView(d);
    if (b.dataset.act === 'edit') openForm(d);
    if (b.dataset.act === 'delete') openDelete(d);
  });

  // Search as you type (short pause so we don't ask the server on every key), and the category filter.
  $('searchBox').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 250); });
  $('catFilter').addEventListener('change', load);
  $('qualityFilter').addEventListener('change', load);
  $('clearBtn').addEventListener('click', () => { $('searchBox').value = ''; $('catFilter').value = ''; $('qualityFilter').value = ''; load(); });

  /* ---------- view ---------- */
  function openView(d) {
    const row = (label, val) => val ? `<dt>${esc(label)}</dt><dd>${esc(val)}</dd>` : '';
    const list = arr => (arr || []).length ? `<ul class="mb-0 ps-3">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    $('viewTitle').textContent = d.name;
    $('viewBody').innerHTML = `
      <div class="row g-4"><div class="col-md-5">${d.image ? `<img class="ad-photo-prev" src="../${esc(d.image)}" alt="Photo of ${esc(d.name)}">` : '<div class="ad-photo-prev ad-photo-empty"><span><i class="bi bi-image" aria-hidden="true"></i>No photo</span></div>'}</div>
      <div class="col-md-7"><p class="mb-1 fw-semibold">${esc(d.blurb)}</p><p class="text-secondary mb-2"><i class="bi bi-geo-alt me-1"></i>${esc(d.town)}, Leyte</p>
        <div>${(d.cats || []).map(c => `<span class="ad-chip">${esc(ADMIN_CATS[c] || c)}</span>`).join('')}</div></div></div>
      <dl class="ad-dl mb-0">
        ${row('Full description', d.about)}
        <dt>Highlights</dt><dd>${list(d.highlights) || '<span class="text-secondary">None</span>'}</dd>
        ${row('Setting', d.area === 'rural' ? 'Rural' : 'Urban')}
        ${row('Sunrise / sunset spot', d.view ? 'Good ' + d.view + ' spot' : '')}
        ${row('Suggested time of day', (d.time || []).map(t => ADMIN_TIMES[t] || t).join(', '))}
        ${row('Opening hours', d.hours)}
        ${row('Entrance fee', d.fee + ' (₱' + d.feeAmt + ')')}
        <dt>Facilities</dt><dd>${list(d.facilities) || '<span class="text-secondary">None</span>'}</dd>
        ${row('Best time to visit', d.best)}
        ${row('How to get there', d.getThere)}
        ${row('Travel tips', d.tip)}
        ${row('Coordinates', Admin.validCoords(d.lat, d.lng) ? d.lat + ', ' + d.lng : '')}
        ${row('Added', Admin.fmtDateTime(d.created))}
        ${row('Last updated', Admin.fmtDateTime(d.updated))}
      </dl>`;
    $('viewEditBtn').onclick = () => { viewModal.hide(); $('viewModal').addEventListener('hidden.bs.modal', () => openForm(d), { once: true }); };
    viewModal.show();
  }

  /* ---------- live weather preview (read-only) ----------
     Weather is never typed in. This asks the same server endpoint the public site uses (api/weather.php, which holds the OpenWeather key) and shows the
     reading for this destination. If the weather service fails, nothing here blocks saving. */
  let wxToken = 0;
  async function showWeatherPreview(d) {
    const box = $('wxText'), icon = $('wxPreview').querySelector('i'), token = ++wxToken;
    const say = (ico, text) => { icon.className = 'bi ' + ico; box.textContent = text; };
    if (!d) { say('bi-cloud-sun', 'Live weather appears here after you save the destination with valid coordinates.'); return; }
    if (!Admin.validCoords(d.lat, d.lng)) { say('bi-geo-alt', 'No valid coordinates saved, so there is no weather for this place. Add them above.'); return; }
    say('bi-hourglass-split', 'Checking live weather…');
    const res = await Admin.api('../weather.php', {}, { noRedirect: true });
    if (token !== wxToken) return;                       // the form was closed or another one opened meanwhile
    if (!res.ok) { say('bi-cloud-slash', 'Live weather unavailable: ' + (res.message || 'the weather service did not answer.') + ' You can still save this destination.'); return; }
    const r = res.weather && res.weather[d.name];
    if (!r) { say('bi-cloud-slash', 'No reading for this place yet. It appears after the next weather refresh (a few minutes).'); return; }
    const mins = Math.round((Date.now() / 1000 - (r.observed || res.updated || 0)) / 60);
    const old = mins > 180;
    say('bi-cloud-sun', `${r.tempC}°C, ${r.desc} · feels like ${r.feelsC}°C · humidity ${r.humidity}% · wind ${r.windKph} km/h. `
      + (old ? `Older reading from ${Admin.fmtDateTime(r.observed * 1000)}; it may not match the weather now.` : `Live from OpenWeather, updated ${Math.max(0, mins)} min ago${res.stale ? ' (the service is temporarily serving older readings)' : ''}.`));
  }

  /* ---------- add / edit form (Create + Update) ---------- */
  function showFormError(msg) {
    const box = $('formError');
    box.textContent = msg; box.classList.remove('d-none');
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // state: 'none' | 'saved' (the photo stored with the destination) | 'new' (picked, not saved yet)
  function setPhotoPreview(url, state) {
    state = url ? (state || 'saved') : 'none';
    $('photoPrev').classList.toggle('d-none', !url);
    $('photoNone').classList.toggle('d-none', !!url);
    if (url) $('photoPrev').src = url;
    const st = $('photoState');
    st.classList.toggle('new', state === 'new');
    st.innerHTML = state === 'new' ? '<i class="bi bi-eye" aria-hidden="true"></i><span>New photo, not saved yet</span>'
      : state === 'saved' ? '<i class="bi bi-check-circle" aria-hidden="true"></i><span>Current saved photo</span>'
      : '<i class="bi bi-image" aria-hidden="true"></i><span>No photo yet</span>';
    const nm = $('photoName'), f = $('fPhoto').files[0];
    nm.textContent = f && state === 'new' ? f.name : ''; nm.classList.toggle('d-none', !(f && state === 'new'));
  }

  function openForm(d) {
    editing = d || null;
    form.reset();
    closeNewCat();
    form.classList.remove('was-validated');
    $('formError').classList.add('d-none');
    $('formTitle').textContent = d ? 'Edit destination' : 'Add destination';
    $('saveBtn').textContent = d ? 'Save changes' : 'Add destination';
    const set = (id, v) => { $(id).value = v ?? ''; };
    set('fName', d && d.name); set('fTown', d && d.town); set('fArea', (d && d.area) || 'urban'); set('fView', d && d.view);
    set('fHours', d && d.hours); set('fFeeAmt', d ? d.feeAmt : ''); set('fFee', d && d.fee);
    set('fFacilities', d ? (d.facilities || []).join('\n') : ''); set('fBlurb', d && d.blurb); set('fAbout', d && d.about);
    set('fHighlights', d ? (d.highlights || []).join('\n') : ''); set('fBest', d && d.best); set('fGetThere', d && d.getThere); set('fTip', d && d.tip);
    set('fLat', d && d.lat); set('fLng', d && d.lng);
    setPicked('cats', d && d.cats); setPicked('time', d && d.time);
    setPhotoPreview(d && d.image ? '../' + d.image : null, 'saved');
    $('formDesc').textContent = d ? 'Update the details below. Fields marked with * are required.' : 'Fill in the details below. Fields marked with * are required.';
    $('photoLabel').textContent = d && d.image ? 'Replace the photo' : 'Upload a photo';
    $('removeWrap').classList.toggle('d-none', !(d && d.image));
    showWeatherPreview(d);
    formModal.show();
  }
  $('addBtn').addEventListener('click', () => openForm(null));

  // Photo picked: check it here for a quick message (the server checks again), then preview it.
  $('fPhoto').addEventListener('change', () => {
    const f = $('fPhoto').files[0];
    $('formError').classList.add('d-none');
    if (!f) { setPhotoPreview(editing && editing.image ? '../' + editing.image : null, 'saved'); return; }
    if (!PHOTO_TYPES.includes(f.type)) { $('fPhoto').value = ''; setPhotoPreview(editing && editing.image ? '../' + editing.image : null, 'saved'); showFormError('Only JPG, PNG, WebP or AVIF photos are allowed.'); return; }
    if (f.size > MAX_PHOTO) { $('fPhoto').value = ''; setPhotoPreview(editing && editing.image ? '../' + editing.image : null, 'saved'); showFormError('That photo is larger than 3 MB. Choose a smaller one.'); return; }
    $('fRemovePhoto').checked = false;
    setPhotoPreview(URL.createObjectURL(f), 'new');
  });

  // Drag a photo onto the drop zone: same checks as the file picker (it just fills the same input).
  const drop = $('photoDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (!f) return;
    try { const dt = new DataTransfer(); dt.items.add(f); $('fPhoto').files = dt.files; } catch (err) { return; }
    $('fPhoto').dispatchEvent(new Event('change'));
  });

  const toDataUrl = file => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(file); });

  let saving = false;   // blocks a second submit (double click, Enter pressed twice) while the first is still being saved
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (saving) return;
    $('formError').classList.add('d-none');
    if (!form.checkValidity()) { form.classList.add('was-validated'); showFormError('Fill in the required fields marked with *.'); form.querySelector(':invalid')?.focus(); return; }
    if (!picked('cats').length) { showFormError('Choose at least one category.'); return; }

    const v = id => $(id).value;
    const body = {
      id: editing ? editing.id : '',
      name: v('fName'), town: v('fTown'), area: v('fArea'), view: v('fView'), hours: v('fHours'),
      cats: picked('cats'), time: picked('time'),
      feeAmt: v('fFeeAmt'), fee: v('fFee'), facilities: lines('fFacilities'),
      blurb: v('fBlurb'), about: v('fAbout'), highlights: lines('fHighlights'),
      best: v('fBest'), getThere: v('fGetThere'), tip: v('fTip'),
      lat: v('fLat'), lng: v('fLng'),
    };   // no weather: it is fetched automatically from OpenWeather for the coordinates
    const btn = $('saveBtn');
    saving = true;
    Admin.loading(btn, true, 'Saving…');
    try {
      const file = $('fPhoto').files[0];
      if (file) body.photo = await toDataUrl(file);
      else if ($('fRemovePhoto').checked) body.remove_photo = true;
    } catch (err) { saving = false; Admin.loading(btn, false); showFormError('The photo could not be read. Choose it again.'); return; }

    const res = await Admin.api('destination-save.php', body);
    saving = false;
    Admin.loading(btn, false);
    if (!res.ok) { showFormError(res.message || 'Could not save. Try again.'); return; }
    formModal.hide();
    Admin.toast('success', res.message);
    load();
  });

  /* ---------- delete (Delete) ---------- */
  function openDelete(d) {
    deleting = d;
    $('deleteName').textContent = d.name;
    $('deleteError').classList.add('d-none');
    deleteModal.show();
  }
  $('confirmDelete').addEventListener('click', async function () {
    if (!deleting || this.disabled) return;
    Admin.loading(this, true, 'Deleting…');
    const res = await Admin.api('destination-delete.php', { id: deleting.id });
    Admin.loading(this, false);
    if (!res.ok) {
      const box = $('deleteError'); box.textContent = res.message || 'Could not delete. Try again.'; box.classList.remove('d-none');
      if (res.status === 404) load();       // already gone: refresh the list
      return;
    }
    deleteModal.hide();
    deleting = null;
    Admin.toast('success', res.message);
    load();
  });

  /* ---------- links from the dashboard: ?add=1 opens the form, ?q=... pre-fills the search ---------- */
  const params = new URLSearchParams(location.search);
  if (params.get('q')) $('searchBox').value = params.get('q');
  if (['no-photo', 'has-photo', 'no-coords', 'no-category', 'incomplete'].includes(params.get('filter'))) $('qualityFilter').value = params.get('filter');
  await load();
  if (params.has('add')) { history.replaceState(null, '', 'destinations.html'); openForm(null); }
})();
