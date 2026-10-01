<?php
// Saves the travel-preference questionnaire answers.
require __DIR__ . '/../includes/bootstrap.php';
api_handle(function (array $in) {
    $user = auth_require();
    // Every answer is optional: the user can un-pick an option, and an empty pick simply means "no preference".
    $cats = array_values(array_intersect(array_filter((array)($in['cats'] ?? []), 'is_string'), PREF_CATS));
    $one = fn(string $key, array $allowed) => in_array($in[$key] ?? null, $allowed, true) ? $in[$key] : null;
    $prefs = ['cats' => $cats, 'area' => $one('area', PREF_AREAS), 'budget' => $one('budget', PREF_BUDGETS), 'trip' => $one('trip', PREF_TRIPS)];
    db_update($user['id'], ['prefs' => $prefs]);
    return ['prefs' => $prefs];
});
