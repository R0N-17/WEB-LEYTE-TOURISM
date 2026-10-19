<?php
// Admin: add a slide (no "id") or change one ("id"): title, place, description and, optionally, its photo (data URL, checked by img_prepare).
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(function (array $in) {
    auth_require_admin();
    $d = slide_clean($in);
    $photo = null;
    if (isset($in['photo']) && $in['photo'] !== '' && $in['photo'] !== null) {
        if (!is_string($in['photo'])) throw new ApiError('The photo could not be read.', 422);
        $photo = img_prepare($in['photo']);
    }
    $id = str_in($in, 'id');
    $rec = slide_save($id, $d, $photo, !$photo && !empty($in['remove_photo']));
    return ['slide' => slide_view($rec), 'message' => '"' . $rec['title'] . '" was ' . ($id === '' ? 'added to' : 'updated in') . ' the login slideshow.'];
});
