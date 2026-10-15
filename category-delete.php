<?php
// Admin: delete a category. Destinations that still use it must be moved to "move_to" first (done here, in the same request),
// and users' saved preferences are migrated so none of them is left pointing at a category that no longer exists.
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(function (array $in) {
    auth_require_admin();
    $key = str_in($in, 'key');
    if ($key === '') throw new ApiError('Choose a category to delete.', 422);
    $r = cat_delete($key, str_in($in, 'move_to'));
    $msg = '"' . $r['category']['label'] . '" was deleted.';
    if ($r['moved']) $msg .= ' ' . $r['moved'] . ' destination' . ($r['moved'] === 1 ? ' was' : 's were') . ' moved.';
    return ['message' => $msg, 'moved' => $r['moved'], 'users' => $r['users']];
});
