<?php
// SCRUM-16: numbers for the admin dashboard.
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(function () {
    auth_require_admin();
    $all = array_values(dest_all());
    $cats = cat_all();
    $byCat = array_fill_keys(array_column($cats, 'key'), 0);
    $towns = [];
    $withPhoto = 0;
    foreach ($all as $d) {
        foreach ((array)($d['cats'] ?? []) as $c) if (isset($byCat[$c])) $byCat[$c]++;
        $towns[mb_strtolower((string)($d['town'] ?? ''))] = true;
        if (dest_image_file($d) !== null) $withPhoto++;
    }
    usort($all, fn($a, $b) => strcmp((string)($b['updated'] ?? ''), (string)($a['updated'] ?? '')));
    $recent = array_map(fn($d) => ['id' => $d['id'], 'name' => $d['name'], 'town' => $d['town'] ?? '', 'updated' => $d['updated'] ?? ''], array_slice($all, 0, 5));
    return ['stats' => [
        'total'     => count($all),
        'withPhoto' => $withPhoto,
        'noPhoto'   => count($all) - $withPhoto,
        'towns'     => count($towns),
        'byCat'     => $byCat,
        'cats'      => array_map(fn($c) => ['key' => $c['key'], 'label' => $c['label'], 'count' => $byCat[$c['key']]], $cats),
        'recent'    => $recent,
    ]];
});
