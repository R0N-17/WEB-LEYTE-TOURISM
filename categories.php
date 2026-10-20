<?php
// Tourism categories (beaches, nature, ...). One JSON file (data/categories.json) holds them, in display order.
// Same approach as destinations.php: one exclusive lock around each read-modify-write, temp file + rename.
// Each category has a KEY that never changes (destinations and users' saved preferences refer to it), a display LABEL, a Bootstrap icon,
// and an "outdoor" flag (rain or rough-sea warnings apply to outdoor categories). Renaming only changes the label, so nothing can break.
// Lock order when several files are involved: categories -> destinations -> users. Always in that order, so two requests can't deadlock.

function cat_locked(callable $fn) {
    $lock = fopen(CAT_FILE . '.lock', 'c');
    if (!$lock) return $fn();
    flock($lock, LOCK_EX);
    try { return $fn(); }
    finally { flock($lock, LOCK_UN); fclose($lock); }
}

function cat_read_raw(): array {
    $raw = @file_get_contents(CAT_FILE);
    if ($raw === false || trim($raw) === '') return [];
    $list = json_decode($raw, true);
    if (!is_array($list))
        throw new ApiError('data/categories.json is damaged. Restore it from a backup (or delete it to start again from the original 4 categories).', 500);
    $out = [];
    foreach ($list as $c)
        if (is_array($c) && isset($c['key'], $c['label'])) $out[] = $c;
    return $out;
}

function cat_save(array $list): void {
    $json = json_encode(array_values($list), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    $tmp = CAT_FILE . '.tmp' . getmypid();
    if (file_put_contents($tmp, $json) === false || !@rename($tmp, CAT_FILE)) {
        @unlink($tmp);
        if (file_put_contents(CAT_FILE, $json, LOCK_EX) === false)
            throw new ApiError('Could not save the category. Check that the data folder is writable.', 500);
    }
}

// First use: copy the original four categories into data/categories.json (same keys the existing destinations and user preferences already use).
function cat_ensure(): void {
    if (is_file(CAT_FILE)) return;
    cat_locked(function () {
        if (is_file(CAT_FILE)) return;
        $seed = json_decode((string)@file_get_contents(CAT_SEED_FILE), true);
        $now = date('c');
        $list = [];
        foreach (is_array($seed) ? $seed : [] as $c)
            if (is_array($c)) $list[] = ['key' => $c['key'], 'label' => $c['label'], 'icon' => $c['icon'], 'outdoor' => !empty($c['outdoor']), 'created' => $now, 'updated' => $now];
        cat_save($list);
    });
}

function cat_all(): array { cat_ensure(); return cat_read_raw(); }
function cat_keys(): array { return array_column(cat_all(), 'key'); }

// Same normalising as destination names: case, spacing and punctuation don't make two categories different.
function cat_norm(string $label): string { return dest_slug($label); }

function cat_public(array $c): array {
    return ['key' => $c['key'], 'label' => $c['label'], 'icon' => $c['icon'] ?? 'bi-geo-alt', 'outdoor' => !empty($c['outdoor'])];
}

/* ---------- validation ---------- */

function cat_clean(array $in): array {
    $label = dest_text($in, 'label', 'category name', true, 40);
    if (mb_strlen($label) < 2 || cat_norm($label) === '')
        throw new ApiError('The category name needs at least two characters, including a letter or number.', 422);
    $icon = str_in($in, 'icon');
    if (!preg_match('/^bi-[a-z0-9]+(-[a-z0-9]+){0,4}$/', $icon) || strlen($icon) > 40)
        throw new ApiError('Choose an icon from the list.', 422);
    return ['label' => $label, 'icon' => $icon, 'outdoor' => !empty($in['outdoor'])];
}

// $exceptKey: the category being edited (it may keep its own name).
function cat_check_unique(array $list, string $label, ?string $newKey, ?string $exceptKey): void {
    $n = cat_norm($label);
    foreach ($list as $c) {
        if ($c['key'] === $exceptKey) continue;
        if (cat_norm((string)$c['label']) === $n || $c['key'] === $n || ($newKey !== null && $c['key'] === $newKey))
            throw new ApiError('A category named "' . $c['label'] . '" already exists.', 409);
    }
}

/* ---------- create / update / delete ---------- */

function cat_create(array $in): array {
    cat_ensure();
    $d = cat_clean($in);
    return cat_locked(function () use ($d) {
        $list = cat_read_raw();
        if (count($list) >= CAT_MAX) throw new ApiError('You can have at most ' . CAT_MAX . ' categories.', 422);
        $key = substr(cat_norm($d['label']), 0, 40);
        $key = rtrim($key, '-');
        cat_check_unique($list, $d['label'], $key, null);
        $now = date('c');
        $rec = ['key' => $key, 'label' => $d['label'], 'icon' => $d['icon'], 'outdoor' => $d['outdoor'], 'created' => $now, 'updated' => $now];
        $list[] = $rec;
        cat_save($list);
        return $rec;
    });
}

// Renames / changes the icon. The key never changes, so destinations and saved preferences stay valid.
function cat_update(string $key, array $in): array {
    cat_ensure();
    $d = cat_clean($in);
    return cat_locked(function () use ($key, $d) {
        $list = cat_read_raw();
        $i = null;
        foreach ($list as $j => $c) if ($c['key'] === $key) $i = $j;
        if ($i === null) throw new ApiError('That category no longer exists. Refresh the list.', 404);
        cat_check_unique($list, $d['label'], null, $key);
        $list[$i] = ['key' => $key, 'label' => $d['label'], 'icon' => $d['icon'], 'outdoor' => $d['outdoor'],
                     'created' => $list[$i]['created'] ?? date('c'), 'updated' => date('c')];
        cat_save($list);
        return $list[$i];
    });
}

// How many destinations use each category: [key => count].
function cat_usage(): array {
    $use = [];
    foreach (dest_all() as $d)
        foreach (array_unique((array)($d['cats'] ?? [])) as $k) $use[$k] = ($use[$k] ?? 0) + 1;
    return $use;
}

// Deletes a category. If destinations still use it, $moveTo (another existing category) is required and they are reassigned first.
// Users' saved preferences are migrated too: the deleted key is replaced by $moveTo (or dropped when nothing is in use / no target).
// The category itself is removed LAST, so if anything fails half-way it still exists and the delete can simply be repeated.
function cat_delete(string $key, string $moveTo): array {
    cat_ensure();
    return cat_locked(function () use ($key, $moveTo) {
        $list = cat_read_raw();
        $found = null;
        foreach ($list as $c) if ($c['key'] === $key) $found = $c;
        if (!$found) throw new ApiError('That category was already deleted. Refresh the list.', 404);
        if (count($list) <= 1) throw new ApiError('You need at least one category. Add another before deleting this one.', 422);

        $keys = array_column($list, 'key');
        if ($moveTo !== '') {
            if ($moveTo === $key) throw new ApiError('Choose a different category to move the destinations to.', 422);
            if (!in_array($moveTo, $keys, true)) throw new ApiError('The category to move destinations to does not exist.', 422);
        }
        $inUse = cat_usage()[$key] ?? 0;
        if ($inUse > 0 && $moveTo === '')
            throw new ApiError("$inUse destination" . ($inUse === 1 ? ' still uses' : 's still use') . ' this category. Choose another category to move ' . ($inUse === 1 ? 'it' : 'them') . ' to first.', 409);

        $after = array_values(array_filter($keys, fn($k) => $k !== $key));   // category order without the deleted one
        $remap = function (array $cats) use ($key, $moveTo, $after): array {
            if (!in_array($key, $cats, true)) return $cats;
            $cats = array_values(array_filter($cats, fn($k) => $k !== $key));
            if ($moveTo !== '' && !in_array($moveTo, $cats, true)) $cats[] = $moveTo;
            return array_values(array_intersect($after, $cats));               // keep the categories' display order
        };

        // 1. destinations (lock order: categories -> destinations -> users)
        $moved = 0;
        dest_locked(function () use ($remap, $key, &$moved) {
            $all = dest_read_raw();
            foreach ($all as $id => $d) {
                $cats = array_values((array)($d['cats'] ?? []));
                if (!in_array($key, $cats, true)) continue;
                $all[$id]['cats'] = $remap($cats);
                $all[$id]['updated'] = date('c');
                $moved++;
            }
            if ($moved) dest_save($all);
        });

        // 2. users' saved preferences
        $fixedUsers = 0;
        db_locked(function () use ($remap, $key, &$fixedUsers) {
            $users = db_all();
            $changed = false;
            foreach ($users as $id => $u) {
                $cats = $u['prefs']['cats'] ?? null;
                if (!is_array($cats) || !in_array($key, $cats, true)) continue;
                $users[$id]['prefs']['cats'] = $remap(array_values($cats));
                $changed = true; $fixedUsers++;
            }
            if ($changed) db_save($users);
        });

        // 3. finally the category itself
        cat_save(array_values(array_filter($list, fn($c) => $c['key'] !== $key)));
        return ['category' => $found, 'moved' => $moved, 'users' => $fixedUsers];
    });
}
