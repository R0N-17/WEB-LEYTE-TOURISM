<?php
// Admin: remove a slide from the login slideshow (at least one must remain).
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(function (array $in) {
    auth_require_admin();
    $id = str_in($in, 'id');
    if ($id === '') throw new ApiError('Choose a slide to delete.', 422);
    $old = slide_delete($id);
    return ['message' => '"' . $old['title'] . '" was removed from the login slideshow.'];
});
