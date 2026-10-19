<?php
// SCRUM-16: local tourism data.
// One JSON file (data/destinations.json) holds every destination. Everything reads and writes through the dest_* functions
// below, so moving to MySQL later means rewriting THIS file only: the public and admin endpoints never touch the file.
// Same approach as db.php: one exclusive lock around each read-modify-write, and writes go to a temp file that is renamed over the real one.

/* ======================= Storage ======================= */

// "Price Mansion" -> "price-mansion". Used to keep destination names unique (photos are no longer matched by name; see dest_image_url).
function dest_slug(string $name): string {
    return trim(preg_replace('/[^a-z0-9]+/', '-', mb_strtolower($name, 'UTF-8')), '-');
}

function dest_locked(callable $fn) {
    $lock = fopen(DEST_FILE . '.lock', 'c');
    if (!$lock) return $fn();
    flock($lock, LOCK_EX);
    try { return $fn(); }
    finally { flock($lock, LOCK_UN); fclose($lock); }
}

// Reads the file as [id => record]. Never seeds, so it is safe to call while holding the lock.
function dest_read_raw(): array {
    $raw = @file_get_contents(DEST_FILE);
    if ($raw === false || trim($raw) === '') return [];
    $list = json_decode($raw, true);
    // A damaged file must stop the request: carrying on would let the next save overwrite whatever is left.
    if (!is_array($list))
        throw new ApiError('data/destinations.json is damaged. Restore it from a backup (or delete it to start again from the original 11 places).', 500);
    $out = [];
    foreach ($list as $d)
        if (is_array($d) && isset($d['id'])) $out[(string)$d['id']] = $d;
    return $out;
}

function dest_save(array $all): void {
    $json = json_encode(array_values($all), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    $tmp = DEST_FILE . '.tmp' . getmypid();
    if (file_put_contents($tmp, $json) === false || !@rename($tmp, DEST_FILE)) {
        @unlink($tmp);
        if (file_put_contents(DEST_FILE, $json, LOCK_EX) === false)
            throw new ApiError('Could not save the destination. Check that the data folder is writable.', 500);
    }
}

// First use: copy the original 11 places (includes/destinations.seed.json) into data/destinations.json.
function dest_ensure(): void {
    if (is_file(DEST_FILE)) return;
    dest_locked(function () {
        if (is_file(DEST_FILE)) return;   // another request seeded it while we waited for the lock
        $seed = json_decode((string)@file_get_contents(DEST_SEED_FILE), true);
        $now = date('c');
        $all = [];
        foreach (is_array($seed) ? $seed : [] as $d) {
            if (!is_array($d)) continue;
            $d['id'] = 'd' . bin2hex(random_bytes(6));   // starts with a letter so PHP never turns the key into an integer
            $d['created'] = $now;
            $d['updated'] = $now;
            $all[$d['id']] = $d;
        }
        dest_save($all);
    });
}

function dest_all(): array {
    dest_ensure();
    $all = dest_read_raw();
    foreach ($all as $d)
        if (!array_key_exists('image', $d)) {   // records from before the photo moved into the record: link their existing photo once
            return dest_locked(function () {
                $all = dest_read_raw();
                if (dest_apply_legacy_images($all)) dest_save($all);
                return $all;
            });
        }
    return $all;
}

function dest_find(string $id): ?array {
    return dest_all()[$id] ?? null;
}

function dest_slug_taken(array $all, string $slug, ?string $exceptId): bool {
    foreach ($all as $id => $d)
        if ((string)$id !== $exceptId && dest_slug((string)($d['name'] ?? '')) === $slug) return true;
    return false;
}

// Adds a destination. $d is already validated (dest_clean). $photo is the result of img_prepare() or null. Returns the saved record.
// The photo file is written first and removed again if the record cannot be saved, so a failure never leaves a record pointing at a missing file.
function dest_insert(array $d, ?array $photo = null): array {
    dest_ensure();
    return dest_locked(function () use ($d, $photo) {
        $all = dest_read_raw();
        dest_apply_legacy_images($all);
        if (dest_slug_taken($all, dest_slug($d['name']), null))
            throw new ApiError('A destination named "' . $d['name'] . '" already exists.', 409);
        $now = date('c');
        $d['id'] = 'd' . bin2hex(random_bytes(6));   // starts with a letter so PHP never turns the key into an integer
        $d['created'] = $now;
        $d['updated'] = $now;
        $d['image'] = null;
        $file = null;
        if ($photo) {
            $file = img_store($d['id'], $photo['bytes'], $photo['ext']);
            $d['image'] = ['file' => $file, 'v' => time()];
        }
        $all[$d['id']] = $d;
        try { dest_save($all); }
        catch (Throwable $e) { if ($file) @unlink(PLACE_IMG_DIR . '/' . $file); throw $e; }
        return $d;
    });
}

// Replaces the fields of one destination (and, optionally, its photo). Returns [oldRecord, newRecord].
// $photo = img_prepare() result to replace the photo, $removePhoto = true to clear it. With neither, the photo is left alone.
// The new file is written first. The old file is only removed after the record points at the new one, and never if another destination still uses it.
function dest_update(string $id, array $d, ?array $photo = null, bool $removePhoto = false): array {
    dest_ensure();
    return dest_locked(function () use ($id, $d, $photo, $removePhoto) {
        $all = dest_read_raw();
        dest_apply_legacy_images($all);
        if (!isset($all[$id])) throw new ApiError('That destination no longer exists. Refresh the list.', 404);
        if (dest_slug_taken($all, dest_slug($d['name']), $id))
            throw new ApiError('Another destination is already named "' . $d['name'] . '".', 409);
        $old = $all[$id];
        $oldImg = $old['image'] ?? null;
        $img = $oldImg;
        $newFile = null;
        if ($photo) {
            $newFile = img_store($id, $photo['bytes'], $photo['ext']);
            $img = ['file' => $newFile, 'v' => time()];
        } elseif ($removePhoto) {
            $img = null;
        }
        $new = $d + ['id' => $id, 'created' => $old['created'] ?? date('c'), 'updated' => date('c'), 'image' => $img];
        // Visit length ("stay") is no longer edited in the admin, but records that already have it keep it: the recommendations still use it.
        if (array_key_exists('stay', $old)) $new['stay'] = $old['stay'];
        $all[$id] = $new;
        try { dest_save($all); }
        catch (Throwable $e) { if ($newFile) @unlink(PLACE_IMG_DIR . '/' . $newFile); throw $e; }   // the record still points at the old, working photo
        if ($oldImg && ($img['file'] ?? null) !== $oldImg['file'])
            img_release((string)$oldImg['file'], $all, $photo ? false : true);   // replaced: delete. removed: keep a copy in the private folder
        return [$old, $new];
    });
}

// Removes one destination and returns the removed record.
function dest_delete(string $id): array {
    dest_ensure();
    return dest_locked(function () use ($id) {
        $all = dest_read_raw();
        if (!isset($all[$id])) throw new ApiError('That destination was already deleted. Refresh the list.', 404);
        dest_apply_legacy_images($all);
        $old = $all[$id];
        unset($all[$id]);
        dest_save($all);
        if (!empty($old['image']['file'])) img_release((string)$old['image']['file'], $all, true);   // archived, and only if nobody else uses it
        return $old;
    });
}

/* ======================= Shapes sent to the browser ======================= */

// What the public website gets. No weather in here on purpose: readings come live from OpenWeather (includes/weather.php).
// 'stay' is legacy visit-length data that is kept only so recommendations can still match it against a visitor's trip preference.
function dest_public(array $d): array {
    return [
        'id'         => (string)$d['id'],
        'name'       => (string)$d['name'],
        'image'      => dest_image_url($d),   // the ONE place the website learns a photo URL (null = show the icon tile)
        'feeAmt'     => (int)($d['feeAmt'] ?? 0),
        'stay'       => array_values((array)($d['stay'] ?? [])),
        'town'       => (string)($d['town'] ?? ''),
        'cats'       => array_values(array_intersect((array)($d['cats'] ?? []), cat_keys())),   // only categories that still exist
        'area'       => (string)($d['area'] ?? 'urban'),
        'time'       => array_values((array)($d['time'] ?? [])),
        'view'       => ($d['view'] ?? '') === '' ? null : $d['view'],
        'fee'        => (string)($d['fee'] ?? ''),
        'hours'      => (string)($d['hours'] ?? ''),
        'facilities' => array_values((array)($d['facilities'] ?? [])),
        'about'      => (string)($d['about'] ?? ''),
        'highlights' => array_values((array)($d['highlights'] ?? [])),
        'best'       => (string)($d['best'] ?? ''),
        'getThere'   => (string)($d['getThere'] ?? ''),
        'tip'        => (string)($d['tip'] ?? ''),
        'blurb'      => (string)($d['blurb'] ?? ''),
    ];
}

// What the admin screens get: everything, plus the slug and the photo URL (same URL the public site gets).
function dest_admin_view(array $d): array {
    $slug = dest_slug((string)($d['name'] ?? ''));
    unset($d['weather']);   // sample weather from older versions: never shown anywhere
    return ['slug' => $slug, 'image' => dest_image_url($d)] + $d;   // left side wins: 'image' becomes the URL, not the stored {file, v}
}

/* ======================= Validation ======================= */

// One line of text. Rejects < and > (nobody needs HTML in a tourism description) and control characters.
function dest_text(array $in, string $key, string $label, bool $required, int $max): string {
    $v = $in[$key] ?? '';
    if (!is_string($v)) throw new ApiError("The $label is not valid.", 422);
    $v = trim(preg_replace('/\s+/u', ' ', $v));
    if (preg_match('/[<>]/', $v)) throw new ApiError("The $label can't contain the characters < or >.", 422);
    if (preg_match('/[\x00-\x1F\x7F]/', $v)) throw new ApiError("The $label contains characters that aren't allowed.", 422);
    if ($v === '') {
        if ($required) throw new ApiError("Enter the $label.", 422);
        return '';
    }
    if (mb_strlen($v) > $max) throw new ApiError("The $label must be $max characters or fewer.", 422);
    return $v;
}

// A list of short lines (facilities, highlights). Blank lines and repeats are dropped.
function dest_lines(array $in, string $key, string $label, int $maxItems, int $maxLen): array {
    $v = $in[$key] ?? [];
    if (!is_array($v)) throw new ApiError("The $label list is not valid.", 422);
    $out = [];
    foreach ($v as $item) {
        $line = dest_text(['x' => $item], 'x', "$label item", false, $maxLen);
        if ($line === '') continue;
        $dupe = false;
        foreach ($out as $o) if (mb_strtolower($o) === mb_strtolower($line)) $dupe = true;
        if (!$dupe) $out[] = $line;
    }
    if (count($out) > $maxItems) throw new ApiError("Use at most $maxItems $label items.", 422);
    return $out;
}

// One or more values from a fixed list (categories, time slots). Returned in the list's own order.
function dest_picks(array $in, string $key, array $allowed, string $label, bool $required = true): array {
    $v = $in[$key] ?? [];
    if (!is_array($v)) $v = [];
    $v = array_values(array_unique(array_filter($v, 'is_string')));
    foreach ($v as $x)
        if (!in_array($x, $allowed, true)) throw new ApiError("The $label \"" . mb_substr($x, 0, 30) . "\" is not allowed.", 422);
    if (!$v && $required) throw new ApiError("Choose at least one $label.", 422);
    return array_values(array_intersect($allowed, $v));
}

function dest_number(array $in, string $key, string $label, float $min, float $max, bool $required = true): ?float {
    $v = $in[$key] ?? null;
    if ($v === null || $v === '') {
        if ($required) throw new ApiError("Enter the $label.", 422);
        return null;
    }
    if (is_string($v)) $v = trim($v);
    if (!is_numeric($v)) throw new ApiError("The $label must be a number.", 422);
    $v = (float)$v;
    if ($v < $min || $v > $max) throw new ApiError("The $label must be between $min and $max.", 422);
    return $v;
}

// Turns the form's data into a clean record (no id or timestamps). Throws ApiError with a message the form can show.
function dest_clean(array $in): array {
    $name = dest_text($in, 'name', 'destination name', true, 100);
    if (mb_strlen($name) < 2 || dest_slug($name) === '')
        throw new ApiError('The destination name needs at least two characters, including a letter or number.', 422);

    $area = str_in($in, 'area');
    if (!in_array($area, DEST_AREAS, true)) throw new ApiError('Choose urban or rural for the setting.', 422);

    $view = str_in($in, 'view');
    if ($view !== '' && !in_array($view, DEST_VIEWS, true)) throw new ApiError('The view must be sunrise, sunset or none.', 422);

    $feeAmt = (int)round(dest_number($in, 'feeAmt', 'entrance fee amount', 0, 100000));
    $fee = dest_text($in, 'fee', 'fee description', false, 100);
    if ($fee === '') $fee = $feeAmt === 0 ? 'Free' : '₱' . $feeAmt . ' entrance fee';

    $lat = dest_number($in, 'lat', 'latitude', -90, 90);
    $lng = dest_number($in, 'lng', 'longitude', -180, 180);

    return [
        'name'       => $name,
        'town'       => dest_text($in, 'town', 'town or city', true, 100),
        'cats'       => dest_picks($in, 'cats', cat_keys(), 'category'),
        'area'       => $area,
        'time'       => dest_picks($in, 'time', PREF_TIMES, 'suggested time of day', false),   // optional: describes the place, not the visitor
        'view'       => $view === '' ? null : $view,
        'feeAmt'     => $feeAmt,
        'fee'        => $fee,
        'hours'      => dest_text($in, 'hours', 'opening hours', true, 100),
        'facilities' => dest_lines($in, 'facilities', 'facility', 20, 60),
        'blurb'      => dest_text($in, 'blurb', 'short description', true, 200),
        'about'      => dest_text($in, 'about', 'full description', true, 2000),
        'highlights' => dest_lines($in, 'highlights', 'highlight', 10, 200),
        'best'       => dest_text($in, 'best', 'best time to visit', false, 500),
        'getThere'   => dest_text($in, 'getThere', 'directions', false, 500),
        'tip'        => dest_text($in, 'tip', 'travel tip', false, 500),
        'lat'        => $lat,
        'lng'        => $lng,
        // No weather here on purpose: live weather is fetched from OpenWeather for these coordinates (includes/weather.php).
    ];
}

/* ======================= Photos (images/places/<id>-<version>.<ext>) ======================= */
// SINGLE SOURCE OF TRUTH: a destination's photo is stored in its own record as  image = {file, v}.
//   file = the file name inside images/places/   v = a timestamp that changes on every replacement (the cache-busting version)
// Every public and admin response gets the URL from dest_image_url(). Nothing else in the project builds a photo path.
// The file name is built here from the destination's stable id, a version stamp and a fixed extension. Nothing from the upload's own name is ever used.

const IMG_FILE_RE = '/^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpg|jpeg|png|webp|avif)$/i';

// The stored file name, but only if it looks safe and the file really exists.
function dest_image_file(array $d): ?string {
    $f = $d['image']['file'] ?? null;
    if (!is_string($f) || !preg_match(IMG_FILE_RE, $f) || strpos($f, '..') !== false) return null;
    return is_file(PLACE_IMG_DIR . '/' . $f) ? $f : null;
}

// Public URL of a destination's photo (relative to the site root), versioned so browsers fetch a replaced photo at once. null = no photo.
function dest_image_url(array $d): ?string {
    $f = dest_image_file($d);
    if ($f === null) return null;
    $v = (int)($d['image']['v'] ?? 0) ?: (int)@filemtime(PLACE_IMG_DIR . '/' . $f);
    return 'images/places/' . rawurlencode($f) . '?v=' . $v;
}

// Photo files that sit in images/places (any allowed extension).
function img_listing(): array {
    if (!is_dir(PLACE_IMG_DIR)) return [];
    $out = [];
    foreach (scandir(PLACE_IMG_DIR) ?: [] as $f)
        if ($f !== '' && $f[0] !== '.' && is_file(PLACE_IMG_DIR . '/' . $f) && preg_match(IMG_FILE_RE, $f)) $out[] = $f;
    return $out;
}

// One-time link for records saved before photos lived in the record: the photo that used to be found by name is written into the record,
// using the same matching the old website used (exact name, then a file whose name starts with / is started by the place's name).
// A file that exactly matches another destination's own name is never borrowed. Works on $all in place, returns true if anything changed. No locking, no saving.
function dest_apply_legacy_images(array &$all): bool {
    $todo = array_filter($all, fn($d) => !array_key_exists('image', $d));
    if (!$todo) return false;
    $files = [];
    foreach (img_listing() as $f) $files[strtolower(pathinfo($f, PATHINFO_FILENAME))] ??= $f;
    $slugs = array_map(fn($d) => dest_slug((string)($d['name'] ?? '')), $all);
    foreach ($todo as $id => $d) {
        $slug = dest_slug((string)($d['name'] ?? ''));
        $file = $slug !== '' ? ($files[$slug] ?? null) : null;
        if ($file === null && $slug !== '')
            foreach ($files as $base => $f)
                if (!in_array((string)$base, $slugs, true) && (str_starts_with($slug, (string)$base) || str_starts_with((string)$base, $slug))) { $file = $f; break; }
        $all[$id]['image'] = $file !== null ? ['file' => $file, 'v' => (int)@filemtime(PLACE_IMG_DIR . '/' . $file)] : null;
    }
    return true;
}

// Checks an uploaded photo (sent as a data URL) and returns ['bytes' => ..., 'ext' => ...]. Throws before anything is saved.
function img_prepare(string $data): array {
    $bad = 'The photo could not be read. Choose a JPG, PNG, WebP or AVIF file.';
    if (!preg_match('#^data:[a-z0-9/+.\-]+;base64,#i', $data, $m)) throw new ApiError($bad, 422);
    $b64 = substr($data, strlen($m[0]));
    if (strlen($b64) > (int)(IMG_MAX_BYTES * 4 / 3) + 64) throw new ApiError('The photo is too large. The limit is ' . (IMG_MAX_BYTES / 1048576) . ' MB.', 422);
    $bytes = base64_decode($b64, true);
    if ($bytes === false || $bytes === '') throw new ApiError($bad, 422);
    if (strlen($bytes) > IMG_MAX_BYTES) throw new ApiError('The photo is too large. The limit is ' . (IMG_MAX_BYTES / 1048576) . ' MB.', 422);

    // Trust the file's real contents, never the name, the extension or the type the browser claimed.
    $mime = class_exists('finfo') ? (string)(new finfo(FILEINFO_MIME_TYPE))->buffer($bytes) : '';
    $info = @getimagesizefromstring($bytes);
    if (!isset(IMG_TYPES[$mime]) && $info && isset(IMG_TYPES[$info['mime']])) $mime = $info['mime'];
    if (!isset(IMG_TYPES[$mime])) throw new ApiError('Only JPG, PNG, WebP or AVIF photos are allowed. Other files, including scripts and documents, are rejected.', 422);
    if ($mime !== 'image/avif' && !$info) throw new ApiError('That file is not a valid image.', 422);
    if ($info && ($info[0] > IMG_MAX_SIDE || $info[1] > IMG_MAX_SIDE))
        throw new ApiError('The photo is too big in pixels. Keep it under ' . IMG_MAX_SIDE . ' px on each side.', 422);
    if (stripos($bytes, '<?php') !== false) throw new ApiError('That file contains program code and was rejected.', 422);

    return ['bytes' => $bytes, 'ext' => IMG_TYPES[$mime]];
}

// Writes the validated photo to images/places/<id>-<stamp>.<ext> (new name every time, so an existing photo is never overwritten) and returns the file name.
function img_store(string $id, string $bytes, string $ext): string {
    if (!preg_match('/^d[a-f0-9]{12}$/', $id) || !preg_match('/^[a-z0-9]{3,4}$/', $ext)) throw new ApiError('Invalid photo name.', 500);
    if (!is_dir(PLACE_IMG_DIR) && !@mkdir(PLACE_IMG_DIR, 0755, true))
        throw new ApiError('Could not create the images/places folder.', 500);
    $name = $id . '-' . dechex(time()) . bin2hex(random_bytes(2)) . '.' . $ext;
    $tmp = PLACE_IMG_DIR . '/.upload-' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, $bytes) === false) { @unlink($tmp); throw new ApiError('Could not save the photo. Check that images/places is writable.', 500); }
    @chmod($tmp, 0644);
    if (!@rename($tmp, PLACE_IMG_DIR . '/' . $name)) {
        @unlink($tmp);
        throw new ApiError('Could not save the photo. Check that images/places is writable.', 500);
    }
    return $name;
}

// Gets rid of a photo file nobody points at any more. $all is the record list AFTER the change: if any destination still uses the file, it stays.
// With $archive the file is moved to data/deleted-photos (not web-accessible) instead of destroyed.
function img_release(string $file, array $all, bool $archive): void {
    if (!preg_match(IMG_FILE_RE, $file) || strpos($file, '..') !== false) return;
    foreach ($all as $d) if (($d['image']['file'] ?? null) === $file) return;
    $path = PLACE_IMG_DIR . '/' . $file;
    if (!is_file($path)) return;
    if ($archive) {
        if (!is_dir(DEST_TRASH_DIR)) @mkdir(DEST_TRASH_DIR, 0755, true);
        if (@rename($path, DEST_TRASH_DIR . '/' . pathinfo($file, PATHINFO_FILENAME) . '-' . date('Ymd-His') . '.' . strtolower(pathinfo($file, PATHINFO_EXTENSION)))) return;
    }
    @unlink($path);
}
