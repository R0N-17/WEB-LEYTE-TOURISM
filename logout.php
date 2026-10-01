<?php
require __DIR__ . '/../includes/bootstrap.php';
api_handle(function () { auth_logout(); return []; });
