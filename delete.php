<?php
require __DIR__ . '/../includes/bootstrap.php';
api_handle(function () {
    $user = auth_require();
    db_delete($user['id']);
    auth_logout();
    return [];
});
