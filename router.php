<?php
// Only for `php -S localhost:8000 router.php`. Blocks direct access to /data, /includes and /tools,
// and refuses to serve or run scripts from the photo folder.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/(data|includes|tools)(/|$)#', $path)) {
    http_response_code(403);
    exit('Forbidden');
}
if (preg_match('#^/images/places/.*\.(php[0-9]?|phtml|phar|html?|js)$#i', $path)) {   // SCRUM-16: photos only
    http_response_code(403);
    exit('Forbidden');
}
return false;   // serve everything else normally
