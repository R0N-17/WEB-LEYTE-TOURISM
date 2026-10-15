<?php
// SCRUM-16 (Create + Update): saves one destination and, optionally, its photo. Without "id" it creates, with "id" it updates.
// The photo arrives as a data URL inside the JSON body (the same JSON-only rule as every other endpoint) and is checked before anything is written.
// The photo is stored in the destination's own record (see includes/destinations.php), which is where the whole website reads it from.
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(function (array $in) {
    auth_require_admin();

    $data = dest_clean($in);                    // throws a readable message if anything is missing or invalid

    $photo = null;
    if (isset($in['photo']) && $in['photo'] !== '' && $in['photo'] !== null) {
        if (!is_string($in['photo'])) throw new ApiError('The photo could not be read.', 422);
        $photo = img_prepare($in['photo']);     // bad type, too big, or contains code: rejected here, before anything is saved
    }

    $id = str_in($in, 'id');
    if ($id === '') {
        $rec = dest_insert($data, $photo);      // 409 on a duplicate name; a failed photo save means no record is created
        $message = '"' . $rec['name'] . '" was added' . ($photo ? ' with its photo.' : '.');
    } else {
        [$old, $rec] = dest_update($id, $data, $photo, !$photo && !empty($in['remove_photo']));   // 404 if it vanished, 409 on a duplicate name
        $message = '"' . $rec['name'] . '" was updated' . ($photo ? ' and its photo was replaced. It now shows everywhere on the website.' : (!empty($in['remove_photo']) ? ' and its photo was removed.' : '.'));
    }
    return ['destination' => dest_admin_view($rec), 'message' => $message];
});
