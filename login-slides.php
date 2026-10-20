<?php
// Admin: the login slideshow, in order.
require __DIR__ . '/../../includes/bootstrap.php';
api_handle(function () {
    auth_require_admin();
    return ['slides' => array_map('slide_view', slide_read()), 'max' => SLIDE_MAX];
});
