/* register.html only */

// Password strength
const regPassword = document.getElementById('regPassword');
const regConfirm  = document.getElementById('regConfirm');
const bar  = document.getElementById('strengthBar');
const text = document.getElementById('strengthText');

function passwordScore(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/i.test(pw) && /\d/.test(pw)) s++;
  if (pw.length >= 12 || (/[A-Z]/.test(pw) && /[a-z]/.test(pw))) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
regPassword.addEventListener('input', () => {
  const pw = regPassword.value;
  const levels = [
    { w: '0%',   c: '#E9E4F7', t: 'At least 8 characters, with a letter and a number.' },
    { w: '25%',  c: '#dc3545', t: 'Weak' },
    { w: '50%',  c: '#F2A541', t: 'Fair' },
    { w: '75%',  c: '#7C5CFF', t: 'Good' },
    { w: '100%', c: '#198754', t: 'Strong' }
  ];
  const l = levels[pw ? Math.max(1, passwordScore(pw)) : 0];
  bar.style.width = l.w;
  bar.style.backgroundColor = l.c;
  text.textContent = l.t;
  if (regConfirm.value) checkMatch();
});

// Custom checks layered on Bootstrap validation
function checkPasswordRules() {
  const pw = regPassword.value;
  regPassword.setCustomValidity(pw.length >= 8 && /[a-z]/i.test(pw) && /\d/.test(pw) ? '' : 'invalid');
}
function checkMatch() {
  const feedback = document.getElementById('confirmFeedback');
  const mismatch = regConfirm.value !== '' && regConfirm.value !== regPassword.value;
  regConfirm.setCustomValidity(regConfirm.value === regPassword.value ? '' : 'mismatch');
  feedback.textContent = regConfirm.value === '' ? 'Confirm your password.' : 'Your password is not the same.';
  regConfirm.classList.toggle('is-invalid', mismatch);          // shows right away while typing
  regConfirm.classList.toggle('is-valid', regConfirm.value !== '' && !mismatch);
}
regPassword.addEventListener('input', checkPasswordRules);
regConfirm.addEventListener('input', checkMatch);

// Names: no numbers
const checkFirstName = bindNameField(document.getElementById('firstName'), 'first name');
const checkLastName  = bindNameField(document.getElementById('lastName'), 'last name');

// Register submit
document.getElementById('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  checkFirstName();
  checkLastName();
  checkPasswordRules();
  checkMatch();
  form.classList.add('was-validated');
  if (!form.checkValidity()) return;

  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const submitBtn = form.querySelector('button[type=submit]');
  hideAlert();
  setLoading(submitBtn, true, 'Creating account…');

  const res = await api('register.php', {
    first_name: document.getElementById('firstName').value,
    last_name: document.getElementById('lastName').value,
    email,
    password: regPassword.value,
    theme: Theme.get()                       // the new account keeps the theme you are using now
  });
  setLoading(submitBtn, false);
  if (!res.ok) { showAlert('danger', res.message); return; }
  sessionStorage.setItem('leyteNewUser', '1');   // dashboard greets a new account with "Welcome"
  openQuestionnaire();
});

/* ---------- Preference questionnaire ---------- */

function optionCards(list, type, name) {
  return list.map(([v, icon, title, sub]) =>
    `<div class="col-sm-6"><input class="btn-check" type="${type}" name="${name}" id="${name}-${v}" value="${v}">
      <label class="pref-opt" for="${name}-${v}"><i class="bi ${icon}"></i>
      <span><strong>${title}</strong>${sub ? `<small class="d-block text-secondary">${sub}</small>` : ''}</span></label></div>`).join('');
}
document.getElementById('catOpts').innerHTML  = optionCards(CATS, 'checkbox', 'cat');
document.getElementById('areaOpts').innerHTML = optionCards(AREAS, 'radio', 'area');
document.getElementById('budgetOpts').innerHTML = optionCards(BUDGETS, 'radio', 'budget');
document.getElementById('tripOpts').innerHTML = optionCards(TRIPS, 'radio', 'trip');

const prefModal = new bootstrap.Modal(document.getElementById('prefModal'));
const steps = document.querySelectorAll('.pref-step');
const nextBtn = document.getElementById('nextBtn');
const backBtn = document.getElementById('backBtn');
let step = 0;
const QUESTIONS = 4;                 // question steps 0-3; step 4 is the results screen
const prefs = { cats: [], area: null, budget: null, trip: null };

function openQuestionnaire() { step = 0; showStep(); prefModal.show(); }

function readPrefs() {
  prefs.cats = [...document.querySelectorAll('input[name=cat]:checked')].map(i => i.value);
  prefs.area = (document.querySelector('input[name=area]:checked') || {}).value || null;
  prefs.budget = (document.querySelector('input[name=budget]:checked') || {}).value || null;
  prefs.trip = (document.querySelector('input[name=trip]:checked') || {}).value || null;
}
function stepReady() {
  readPrefs();
  return [prefs.cats.length > 0, !!prefs.area, !!prefs.budget, !!prefs.trip, true][step];
}
function showStep() {
  steps.forEach((s, i) => s.classList.toggle('d-none', i !== step));
  const results = step === QUESTIONS;
  document.getElementById('prefBar').style.width = (results ? 100 : (step + 1) * (100 / QUESTIONS)) + '%';
  document.getElementById('stepLabel').textContent = results ? 'All set' : `Question ${step + 1} of ${QUESTIONS}`;
  document.getElementById('skipBtn').classList.toggle('d-none', results);
  backBtn.classList.toggle('d-none', step === 0 || results);
  nextBtn.textContent = step === QUESTIONS - 1 ? 'See my picks' : results ? 'Go to my dashboard' : 'Next';
  nextBtn.disabled = !stepReady();
}

document.getElementById('prefModal').addEventListener('change', () => { nextBtn.disabled = !stepReady(); });
backBtn.addEventListener('click', () => { step--; showStep(); });
nextBtn.addEventListener('click', () => {
  if (step === QUESTIONS - 1) { readPrefs(); renderResults(); }
  if (step === QUESTIONS) {
    setLoading(nextBtn, true, 'Saving…');
    api('preferences.php', prefs).then(res => {
      if (!res.ok) {
        setLoading(nextBtn, false);
        alert(res.message || "Couldn't save your preferences. You can set them again from the dashboard.");
        return;
      }
      prefModal.hide();
      window.location.href = 'dashboard.html';
    });
    return;
  }
  step++; showStep();
});
document.getElementById('skipBtn').addEventListener('click', () => {
  prefModal.hide();
  showAlert('success', 'Account created. Taking you to your dashboard. You can set your preferences there any time.');
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
});

function renderResults() {
  // For "Any budget", equally good matches break ties by fee, priciest first, then mid-range, then free.
  const byScore = (a, b) => b.score - a.score || (prefs.budget === 'any' ? b.feeAmt - a.feeAmt : 0);
  const scored = PLACES.map(p => {
    const hits = p.cats.filter(c => prefs.cats.includes(c));
    const areaOk = prefs.area === 'either' || p.area === prefs.area;
    const costOk = budgetOk(p, prefs.budget);
    const lenOk = tripOk(p, prefs.trip);
    return { ...p, hits, areaOk, costOk, lenOk,
      score: (hits.length ? 3 + hits.length : 0) + (areaOk ? 2 : 0) + (costOk ? 2 : 0) + (lenOk ? 1 : 0) };
  });

  // Three tiers: really close, nearly close, and something different they might enjoy
  const closest = scored.filter(p => p.hits.length && p.areaOk && p.costOk).sort(byScore);
  const nearly  = scored.filter(p => p.hits.length && !(p.areaOk && p.costOk)).sort(byScore);
  const explore = scored.filter(p => !p.hits.length).sort((a, b) => (b.areaOk + b.costOk + !!b.view) - (a.areaOk + a.costOk + !!a.view) || byScore(a, b));

  // Best sunrise / sunset spot for the chosen time of day
  const wanted = 'sunset';   // no time of day is asked any more, so favor a sunset spot when there is one
  const ranked = [...closest, ...nearly, ...explore];
  const close = [...closest, ...nearly];   // prefer spots that fit the user's picks before unrelated ones
  const star = close.find(p => p.view === wanted) || close.find(p => p.view) || ranked.find(p => p.view === wanted) || ranked.find(p => p.view);
  const without = list => list.filter(p => p !== star);

  const chip = (ok, text) => `<span class="chip ${ok ? 'ok' : ''}"><i class="bi bi-${ok ? 'check-lg' : 'dash'}"></i> ${text}</span>`;
  const card = (p, note) => `<div class="col-sm-6"><div class="place-card h-100">
      ${placeThumb(p)}
      <div class="place-body">
      <h4 class="h6 fw-bold mb-0">${p.name}</h4><div class="small text-secondary mb-2">${p.town}</div>
      <p class="small mb-2">${p.blurb}</p>
      <div class="d-flex flex-wrap gap-1">${chip(p.hits.length, 'Type')}${chip(p.areaOk, 'Setting')}${chip(p.costOk, 'Budget')}${chip(p.lenOk, 'Trip length')}</div>
      ${note ? `<div class="small mt-2 fw-medium">${note}</div>` : ''}
      ${p.view ? `<span class="badge text-bg-warning mt-2"><i class="bi bi-${p.view}"></i> Good ${p.view} spot</span>` : ''}
      </div>
    </div></div>`;
  const section = (title, sub, list, noteFn) => list.length ? `<h3 class="h6 fw-bold mb-0 mt-4">${title}</h3>
      <p class="small text-secondary mb-3">${sub}</p><div class="row g-3">${list.map(p => card(p, noteFn && noteFn(p))).join('')}</div>` : '';

  let html = '';
  if (star) {
    const tip = star.view === 'sunrise' ? 'Arrive before sunrise to catch the first light.'
      : 'Arrive by late afternoon to stay for the sunset.';
    html += `<div class="star-pick d-flex gap-3 p-3">
      <i class="bi bi-${star.view}"></i>
      <div><div class="fw-semibold small text-secondary">Best for ${star.view} for you</div>
      <h3 class="h5 fw-bold mb-1">${star.name} <span class="fw-normal text-secondary fs-6">${star.town}</span></h3>
      <p class="mb-1">${star.blurb}</p><p class="small mb-0 fw-medium">${tip}</p></div></div>`;
  }
  html += section('Closest to your picks', 'Matches your place type, setting, and budget.', without(closest));
  html += section('Nearly a match', 'Fits your place type, but differs in setting or budget.', without(nearly));
  html += section('You might also like', 'Outside your picks, but worth a look.', without(explore).slice(0, 4),
    p => p.view ? `A favorite for ${p.view} views.` : `Try something different: ${p.cats.map(c => label(CATS, c).toLowerCase()).join(', ')}.`);
  document.getElementById('results').innerHTML = html;
}