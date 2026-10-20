<?php
// Admin: move a slide one place up or down.
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(function (array $in) {
    auth_require_admin();
    $dir = str_in($in, 'dir');
    if (!in_array($dir, ['up', 'down'], true)) throw new ApiError('Invalid direction.', 422);
    slide_move(str_in($in, 'id'), $dir);
    return ['slides' => array_map('slide_view', slide_read())];
});
