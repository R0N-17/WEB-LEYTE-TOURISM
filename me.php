<?php
// SCRUM-16: who is the signed-in admin? Every admin page calls this first. 401 = not signed in, 403 = not an admin.
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(fn() => ['admin' => admin_public(auth_require_admin())]);
