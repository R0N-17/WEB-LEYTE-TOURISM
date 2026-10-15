<?php
// Admin: create a category (no "key") or rename / change the icon of one ("key" given). The key itself never changes.
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(function (array $in) {
    auth_require_admin();
    $key = str_in($in, 'key');
    if ($key === '') { $c = cat_create($in); $msg = '"' . $c['label'] . '" was added.'; }
    else             { $c = cat_update($key, $in); $msg = '"' . $c['label'] . '" was updated.'; }
    return ['category' => cat_public($c), 'message' => $msg];
});
