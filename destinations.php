<?php
// SCRUM-16 (Read): list destinations for the admin table, with optional search text and category filter.
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(function (array $in) {
    auth_require_admin();
    $q = mb_strtolower(trim(str_in($in, 'q')));
    $cat = str_in($in, 'cat');
    $all = dest_all();
    $items = [];
    foreach ($all as $d) {
        if ($cat !== '' && !in_array($cat, (array)($d['cats'] ?? []), true)) continue;
        if ($q !== '' && mb_strpos(mb_strtolower($d['name'] . ' ' . ($d['town'] ?? '')), $q) === false) continue;
        $items[] = dest_admin_view($d);
    }
    usort($items, fn($a, $b) => strcasecmp($a['name'], $b['name']));
    return ['destinations' => $items, 'total' => count($all)];
});
