<?php
require __DIR__ . '/../includes/bootstrap.php';
api_handle(fn(array $in) => ['user' => public_user(auth_register($in))]);
