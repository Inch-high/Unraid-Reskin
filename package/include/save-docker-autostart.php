<?php
// POST-only endpoint. Toggles container entries in /var/lib/docker/unraid-autostart.
// The file is read by rc.docker at boot to start containers sequentially (with
// optional WAIT seconds between each). Stock UI maintains it via UserPrefs.php,
// but stock writes the *full* list from the form; we update one or more entries
// in place, preserving wait values for entries we don't touch.
//
// CSRF: auto_prepend rejects POSTs without a matching csrf_token before this file
// runs, so we don't re-check it here.
//
// Payload: { "changes": [ { "name": "plex", "enabled": true }, ... ] }

require_once __DIR__ . '/docker-helpers.php';

const MODERNUI_AUTOSTART_FILE = '/var/lib/docker/unraid-autostart';

// Parse the autostart file into an ordered list of [name, wait] pairs. Lines
// look like "Plex" or "Plex 60". Blank lines are skipped. Preserves order
// because rc.docker honors it as the start-up sequence.
function modernui_parse_autostart_file(string $path): array {
    if (!is_file($path)) return [];
    $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) return [];
    $entries = [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '') continue;
        $parts = preg_split('/\s+/', $line, 2);
        $name = $parts[0];
        $wait = isset($parts[1]) ? trim($parts[1]) : '';
        $entries[] = ['name' => $name, 'wait' => $wait];
    }
    return $entries;
}

// Write entries back to the file. Each line is "<name>" or "<name> <wait>".
// Trailing newline matches the stock format from UserPrefs.php.
function modernui_write_autostart_file(string $path, array $entries): bool {
    $lines = [];
    foreach ($entries as $e) {
        $name = $e['name'];
        $wait = $e['wait'] ?? '';
        $lines[] = $wait !== '' ? ($name . ' ' . $wait) : $name;
    }
    $body = implode(PHP_EOL, $lines) . PHP_EOL;
    $tmp = $path . '.tmp.' . getmypid();
    if (@file_put_contents($tmp, $body, LOCK_EX) === false) return false;
    return @rename($tmp, $path);
}

function modernui_handle_save_autostart(array $post): array {
    $raw = $post['payload'] ?? null;
    if (!is_string($raw) || $raw === '') return ['ok' => false, 'error' => 'invalid payload'];
    $data = json_decode($raw, true);
    if (!is_array($data)) return ['ok' => false, 'error' => 'invalid payload'];

    $changes = $data['changes'] ?? null;
    if (!is_array($changes) || count($changes) === 0) {
        return ['ok' => false, 'error' => 'no changes'];
    }

    // Validate + index by name so we can apply changes in one pass below.
    $byName = [];
    foreach ($changes as $c) {
        if (!is_array($c)) return ['ok' => false, 'error' => 'bad change'];
        $name = $c['name'] ?? null;
        $enabled = $c['enabled'] ?? null;
        if (!is_string($name) || $name === '') return ['ok' => false, 'error' => 'bad name'];
        // Container names are alphanumerics + _ . -; reject anything else so a
        // malformed name can't smuggle whitespace/control chars into the file.
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]*$/', $name)) {
            return ['ok' => false, 'error' => "bad name format: {$name}"];
        }
        if (!is_bool($enabled)) return ['ok' => false, 'error' => 'bad enabled'];
        $byName[$name] = $enabled;
    }

    $existing = modernui_parse_autostart_file(MODERNUI_AUTOSTART_FILE);
    $existingNames = array_column($existing, 'name');

    // Pass 1: remove entries the change set disables.
    $next = [];
    foreach ($existing as $e) {
        $name = $e['name'];
        if (isset($byName[$name]) && $byName[$name] === false) continue;
        $next[] = $e;
    }

    // Pass 2: append newly-enabled entries that weren't already listed.
    foreach ($byName as $name => $enabled) {
        if (!$enabled) continue;
        if (in_array($name, $existingNames, true)) continue;
        $next[] = ['name' => $name, 'wait' => ''];
    }

    if (!modernui_write_autostart_file(MODERNUI_AUTOSTART_FILE, $next)) {
        return ['ok' => false, 'error' => 'write failed'];
    }
    return ['ok' => true];
}

if (PHP_SAPI !== 'cli') {
    modernui_json_response(modernui_handle_save_autostart($_POST));
}
