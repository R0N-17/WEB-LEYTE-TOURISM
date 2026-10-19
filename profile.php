<?php
// Manage profile: name, email and (optionally) password.
require __DIR__ . '/../includes/bootstrap.php';
api_handle(function (array $in) {
    $user = auth_require();
    $email = clean_email(str_in($in, 'email'));
    $other = db_find_by_email($email);
    if ($other && $other['id'] !== $user['id'])
        throw new ApiError('That email is already used by another account.', 409);

    $changes = [
        'first_name' => clean_name(str_in($in, 'first_name'), 'first name'),
        'last_name'  => clean_name(str_in($in, 'last_name'), 'last name'),
        'email'      => $email,
    ];
    if (str_in($in, 'new_password') !== '') {
        if (!password_verify(str_in($in, 'current_password'), $user['password']))
            throw new ApiError('Your current password is not correct.', 403);
        check_password(str_in($in, 'new_password'));
        $changes['password'] = password_hash(str_in($in, 'new_password'), PASSWORD_DEFAULT);
    }
    db_update($user['id'], $changes);
    return ['user' => public_user(db_find($user['id']))];
});
