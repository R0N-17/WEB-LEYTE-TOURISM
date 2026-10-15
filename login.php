<?php
// SCRUM-16: admin sign-in. Only accounts with role "admin" get in.
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(fn(array $in) => ['admin' => admin_public(auth_admin_login($in))]);
