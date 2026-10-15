/* Admin dashboard (admin/index.html).
   Category counts come from api/admin/stats.php. Everything else is calculated here from the real destination records returned by
   api/admin/destinations.php, so the numbers and the "Needs attention" list always agree with the destination list. Nothing is invented. */
(async function () {
  const admin = await Admin.guard('dashboard');
  if (!admin) return;
  const $ = id => document.getElementById(id), esc = Admin.esc;
  $('greetName').textContent = [admin.first_name, admin.last_name].filter(Boolean).join(' ') || 'admin';

  // The weather status chip is independent of the rest: a weather failure never affects the dashboard.
  const wx = Admin.api('../weather.php', {}, { noRedirect: true });
  const [res, list] = await Promise.all([Admin.api('stats.php'), Admin.api('destinations.php')]);
  if (!res.ok) { const e = $('statsError'); e.textContent = res.message || 'Could not load the numbers.'; e.classList.remove('d-none'); $('catBars').innerHTML = ''; $('recentList').innerHTML = ''; $('attnBody').innerHTML = ''; return; }
  const s = res.stats, catKeys = s.cats.map(c => c.key);
  const dests = list.ok ? list.destinations : null;

  // ---- numbers ----
  const total = dests ? dests.length : s.total;
  const withPhoto = dests ? dests.filter(d => d.image).length : s.withPhoto;
  $('sTotal').textContent = total;
  $('sTowns').textContent = dests ? Admin.distinctTowns(dests) : s.towns;
  $('sPhoto').textContent = withPhoto;

  // ---- categories (a destination can have several, so the bars can add up to more than the total) ----
  const max = Math.max(1, ...s.cats.map(c => c.count));
  $('catBars').innerHTML = s.cats.length ? s.cats.map(c =>
    `<div class="mb-2"><div class="d-flex justify-content-between small mb-1"><span class="fw-semibold">${esc(c.label)}</span><span class="text-secondary">${c.count}</span></div>
      <div class="ad-bar" role="img" aria-label="${esc(c.label)}: ${c.count} destinations"><span style="width:${Math.round(c.count / max * 100)}%"></span></div></div>`).join('')
    + '<div class="small text-secondary mt-3">A destination can belong to more than one category.</div>'
    : '<div class="text-secondary small">No categories yet. <a href="categories.html">Add one</a>.</div>';

  // ---- recently updated: real timestamps. "Added" = never edited since it was created; "Updated" = saved again later. ----
  const thumb = d => d && d.image ? `<img class="ad-thumb" src="../${esc(d.image)}" alt="" loading="lazy">` : `<span class="ad-thumb" aria-hidden="true"><i class="bi bi-image"></i></span>`;
  const recent = dests ? [...dests].sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || ''))).slice(0, 5)
                       : s.recent.map(r => ({ ...r, image: null }));
  $('recentList').innerHTML = recent.length
    ? recent.map(d => {
        const edited = d.created && d.updated && d.created !== d.updated;
        return `<li><a href="destinations.html?q=${encodeURIComponent(d.name)}">${thumb(d)}
          <span><span class="t d-block">${esc(d.name)}</span><span class="s"><i class="bi bi-geo-alt" aria-hidden="true"></i> ${esc(d.town)}</span></span>
          <span class="when" title="${esc(Admin.fmtDateTime(d.updated))}"><small>${edited ? 'Updated' : 'Added'}</small>${esc(Admin.fmtDate(d.updated))}</span></a></li>`;
      }).join('')
    : '<li class="ad-empty"><i class="bi bi-geo-alt" aria-hidden="true"></i><div class="t">No destinations yet</div><a href="destinations.html?add=1">Add the first one</a></li>';

  // ---- needs attention: real data-quality problems, each linking to the matching filtered list ----
  const attn = $('attnBody');
  if (!dests) { attn.innerHTML = '<div class="ad-allgood"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i>The destination list could not be loaded, so the checks are unavailable.</div>'; }
  else {
    const count = { 'no-photo': 0, 'no-coords': 0, 'no-category': 0, incomplete: 0 };
    dests.forEach(d => Admin.issues(d, catKeys).forEach(k => { count[k]++; }));
    const rows = [
      ['no-photo', 'bi-image-alt', n => `${n} destination${n === 1 ? ' has' : 's have'} no photo`, 'Visitors see an icon tile instead of a picture.'],
      ['no-coords', 'bi-geo-alt', n => `${n} destination${n === 1 ? ' has' : 's have'} missing or invalid coordinates`, 'Live weather cannot be shown without them.'],
      ['no-category', 'bi-tags', n => `${n} destination${n === 1 ? ' has' : 's have'} no valid category`, "It won't appear in category filters or recommendations."],
      ['incomplete', 'bi-card-text', n => `${n} destination${n === 1 ? ' is' : 's are'} missing required details`, 'Name, town, hours, descriptions or the fee amount is empty.'],
    ].filter(r => count[r[0]] > 0);
    $('attnNote').textContent = rows.length ? `${rows.length} item${rows.length === 1 ? '' : 's'}` : '';
    attn.innerHTML = rows.length
      ? '<ul class="ad-attn">' + rows.map(([k, ico, t, sub]) => `<li><span class="ico"><i class="bi ${ico}" aria-hidden="true"></i></span>
          <div><div class="t">${t(count[k])}</div><div class="s">${esc(sub)}</div></div><a class="go" href="destinations.html?filter=${k}">Review<span class="ad-sr"> ${esc(t(count[k]))}</span> <i class="bi bi-arrow-right" aria-hidden="true"></i></a></li>`).join('') + '</ul>'
      : '<div class="ad-allgood"><i class="bi bi-check-circle-fill" aria-hidden="true"></i>Everything looks complete. No destination needs attention.</div>';
  }

  // ---- weather service status (small, read-only) ----
  const w = await wx, chip = $('wxStatus');
  if (w.ok) {
    const spots = dests ? dests.filter(d => Admin.validCoords(d.lat, d.lng)).length : null;
    const got = dests ? dests.filter(d => w.weather && w.weather[d.name]).length : null;
    const when = w.updated ? new Date(w.updated * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    const partial = spots !== null && got < spots;
    chip.className = 'ad-status ' + (w.stale || partial ? 'warn' : 'ok');
    chip.textContent = `Weather: live${when ? ' · updated ' + when : ''}${w.stale ? ' (older readings)' : ''}${spots !== null ? ` · ${got} of ${spots} places` : ''}`;
  } else {
    chip.className = 'ad-status warn';
    chip.textContent = 'Weather unavailable';
    chip.title = w.message || 'The weather service did not answer.';
  }
})();
