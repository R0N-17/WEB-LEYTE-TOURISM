/* Shared destination + preference data. Used by register.js and dashboard.js.
   SCRUM-16: the destinations are no longer written in this file. They live in data/destinations.json and are managed
   from the admin module (admin/). loadPlaces() fills PLACES from api/destinations.php. PLACES keeps the same shape as before:
   { id, name, image, town, cats, area, time, view, fee, feeAmt, hours, facilities, stay, blurb, about, highlights, best, getThere, tip }.
   There is no weather in a destination: live readings come from OpenWeather through js/weather.js.
   The array object itself never changes (it is refilled in place), so every PLACES.find / PLACES.filter in the other scripts keeps working. */
const PLACES = [];

// Destination text is entered by admins, so it is escaped before it goes into any HTML template.
function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

let PLACES_ERROR = '';   // Sprint 2 (SCRUM-12): the last load error, '' when the last load worked. The directory shows it with a Try again button.
async function loadPlaces() {
  const res = await api('destinations.php');
  if (res && res.ok && Array.isArray(res.places)) { PLACES.splice(0, PLACES.length, ...res.places); PLACES_ERROR = ''; }
  else PLACES_ERROR = (res && res.message) || 'Could not load the destinations.';
  return PLACES;
}
const PLACES_READY = loadPlaces();   // starts as soon as the page loads; dashboard.js waits for it before drawing

// Categories are managed in the admin console (data/categories.json) and loaded from api/categories.php.
// CATS keeps its old shape, [key, icon, label], and is refilled in place so optionCards() and label() keep working.
// "Outdoor" categories (rain / rough-sea warnings) are tracked separately in OUTDOOR_CATS.
const CATS = [];
const OUTDOOR_CATS = new Set();
const isOutdoorCat = c => OUTDOOR_CATS.has(c);
// "Sea" categories get the rough-sea (strong wind) warning. The built-in key is 'beach'; an admin-created category such as "Islands & coves"
// counts too when its label names the sea, so the warning does not depend on one fixed key.
const isSeaCat = c => c === 'beach' || /\b(beach|beaches|island|islands|coast|coastal|sea|marine|bay)\b/i.test((CATS.find(x => x[0] === c) || [])[2] || '');
let CATS_ERROR = '';
async function loadCats() {
  const res = await api('categories.php');
  if (res && res.ok && Array.isArray(res.categories)) {
    CATS.splice(0, CATS.length, ...res.categories.map(c => [c.key, c.icon, c.label]));
    OUTDOOR_CATS.clear();
    res.categories.forEach(c => { if (c.outdoor) OUTDOOR_CATS.add(c.key); });
    CATS_ERROR = '';
  } else CATS_ERROR = (res && res.message) || 'Could not load the categories.';
  return CATS;
}
const CATS_READY = loadCats();   // starts as soon as the page loads; register.js and dashboard.js wait for it before drawing
const AREAS = [
  ['urban', 'bi-buildings', 'Urban', 'City and town centers'],
  ['rural', 'bi-tree-fill', 'Rural', 'Countryside, islands, and mountains'],
  ['either', 'bi-shuffle', 'Either', 'Show me both']
];
const TIMES = [
  ['morning', 'bi-sunrise', 'Morning', 'Cooler air and sunrise views'],
  ['afternoon', 'bi-sun', 'Afternoon', 'Full daylight for touring'],
  ['evening', 'bi-sunset', 'Evening', 'Golden hour and sunset views']
];
const BUDGETS = [
  ['free', 'bi-gift', 'Free only', 'No entrance or environmental fee'],
  ['50', 'bi-cash', 'Up to ₱50', 'A small entrance fee, not free'],
  ['100', 'bi-cash-stack', 'Up to ₱100', 'Mid-range entrance fees'],
  ['any', 'bi-infinity', 'Any budget', 'Show me everything, priciest first']
];
const TRIPS = [
  ['half', 'bi-hourglass-split', 'Half day', 'A few hours at one or two stops'],
  ['full', 'bi-brightness-high', 'Full day', 'Spend the whole day out'],
  ['overnight', 'bi-moon-stars', 'Overnight', 'Camping or staying over']
];
// Each tier is its own price band, not a running maximum, so picking "Up to ₱50" shows places
// that actually cost something up to ₱50 rather than quietly including the free ones too.
const BUDGET_RANGE = { free: [0, 0], '50': [1, 50], '100': [51, 100], any: [0, Infinity] };
// Shared match helpers so register.js and dashboard.js score the same way.
const budgetOk = (p, budget) => {
  const [min, max] = BUDGET_RANGE[budget] ?? [0, Infinity];
  return p.feeAmt >= min && p.feeAmt <= max;
};
// Visit length is no longer entered in the admin. Places that still carry it (older records) are matched against the visitor's trip preference;
// a place with no visit-length data is never penalised (it counts as a fit), and hasStay() lets the screens skip any "fits your trip" label for it.
const hasStay = p => Array.isArray(p.stay) && p.stay.length > 0;
const tripOk = (p, trip) => !hasStay(p) || p.stay.includes(trip);
const label = (list, v) => (list.find(x => x[0] === v) || [, , v])[2];   // an unknown key (e.g. just deleted) shows as itself instead of crashing


// Photos are NOT stored or matched here. Each destination arrives from api/destinations.php with its own `image` URL
// (versioned, e.g. images/places/d1a2b3c4d5e6-1f9a8b7c.jpg?v=1760000000), or null when it has no photo.
// That one field is used by every card, popup, search result, filter and recommendation, so replacing a photo in the admin changes them all.
const placePhotoUrl = p => p.image || null;

// Thumbnail for a place: the real photo when one is found, otherwise the category-tinted icon tile.
function placeThumb(p, size) {
  const cat = p.cats[0];
  const icon = (CATS.find(c => c[0] === cat) || [,'bi-geo-alt'])[1];
  const cls = size === 'sm' ? 'place-thumb place-thumb-sm' : 'place-thumb';
  // The four original categories have colours in style.css; any category an admin adds gets a steady colour made from its key.
  const hue = [...String(cat)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  const tint = ['beach', 'nature', 'history', 'landmark'].includes(cat) ? '' : ` style="background:linear-gradient(135deg,hsl(${hue} 65% 45%),hsl(${(hue + 30) % 360} 70% 62%))"`;
  const url = placePhotoUrl(p);
  const photo = url ? `<img class="place-photo" src="${url}" alt="${escHtml(p.name)}" loading="lazy" decoding="async" onerror="this.remove()">` : '';
  return `<div class="${cls} cat-${escHtml(cat)}"${tint}><i class="bi ${escHtml(icon)}"></i>${photo}</div>`;
}
