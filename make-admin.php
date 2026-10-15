<?php
// SCRUM-16: create, promote or demote an administrator. Command line only; there is no web page or API for this on purpose,
// so public registration can never hand out admin rights.
//
//   php tools/make-admin.php list
//   php tools/make-admin.php promote you@example.com
//   php tools/make-admin.php demote  you@example.com
//   php tools/make-admin.php create  you@example.com "First" "Last"      (asks for a password)
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Command line only.'); }

require __DIR__ . '/../includes/config.php';
require __DIR__ . '/../includes/response.php';
require __DIR__ . '/../includes/db.php';
require __DIR__ . '/../includes/auth.php';

function say(string $m): void { fwrite(STDOUT, $m . PHP_EOL); }
function fail(string $m) { fwrite(STDERR, 'Error: ' . $m . PHP_EOL); exit(1); }

function ask_password(): string {
    $hide = DIRECTORY_SEPARATOR === '/' && function_exists('shell_exec') && trim((string)@shell_exec('command -v stty')) !== '';
    fwrite(STDOUT, 'Password (min 8 characters, with a letter and a number): ');
    if ($hide) @shell_exec('stty -echo');
    $pw = rtrim((string)fgets(STDIN), "\r\n");
    if ($hide) { @shell_exec('stty echo'); fwrite(STDOUT, PHP_EOL); }
    else fwrite(STDOUT, PHP_EOL . '(Your typing was visible. This window can show it on Windows. Clear it when done.)' . PHP_EOL);
    return $pw;
}

$cmd = $argv[1] ?? '';
try {
    switch ($cmd) {
        case 'list':
            $n = 0;
            foreach (db_all() as $u) if (auth_is_admin($u)) { say($u['email'] . '  (' . $u['first_name'] . ' ' . $u['last_name'] . ')'); $n++; }
            if (!$n) say('No administrators yet.');
            break;

        case 'promote':
        case 'demote':
            $email = clean_email($argv[2] ?? '');
            $u = db_find_by_email($email) ?? fail("No account with the email $email. Register it on the site first, or use the create command.");
            db_update($u['id'], ['role' => $cmd === 'promote' ? 'admin' : 'user']);
            say($email . ($cmd === 'promote' ? ' is now an administrator.' : ' is now an ordinary user.'));
            break;

        case 'create':
            $email = clean_email($argv[2] ?? '');
            if (db_find_by_email($email)) fail("An account with $email already exists. Use: php tools/make-admin.php promote $email");
            $first = clean_name($argv[3] ?? '', 'first name');
            $last  = clean_name($argv[4] ?? '', 'last name');
            $pw = ask_password();
            check_password($pw);
            db_insert([
                'id' => bin2hex(random_bytes(8)), 'first_name' => $first, 'last_name' => $last, 'email' => $email,
                'password' => password_hash($pw, PASSWORD_DEFAULT), 'theme' => DEFAULT_THEME, 'prefs' => null,
                'recent' => [], 'role' => 'admin', 'created' => date('c'),
            ]);
            say("Administrator $email created.");
            break;

        default:
            say("Usage:\n  php tools/make-admin.php list\n  php tools/make-admin.php promote <email>\n  php tools/make-admin.php demote <email>\n  php tools/make-admin.php create <email> \"First\" \"Last\"");
            exit($cmd === '' ? 0 : 1);
    }
} catch (ApiError $e) {
    fail($e->getMessage());
}
