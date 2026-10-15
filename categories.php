<?php
// Admin: every category with the number of destinations that use it.
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(function () {
    auth_require_admin();
    $use = cat_usage();
    return ['categories' => array_map(fn($c) => cat_public($c) + ['count' => $use[$c['key']] ?? 0, 'updated' => $c['updated'] ?? ''], cat_all())];
});
