<?php
require __DIR__ . '/../includes/bootstrap.php';
api_handle(fn() => ['user' => public_user(auth_require())]);
