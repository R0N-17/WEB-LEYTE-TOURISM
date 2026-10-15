<?php
// SCRUM-16 (Delete): removes a destination. Its photo is moved to data/deleted-photos (not web-accessible) by dest_delete(), unless another destination still uses it.
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(function (array $in) {
    auth_require_admin();
    $id = str_in($in, 'id');
    if ($id === '') throw new ApiError('Choose a destination to delete.', 422);
    $old = dest_delete($id);
    return ['message' => '"' . $old['name'] . '" was deleted.'];
});
