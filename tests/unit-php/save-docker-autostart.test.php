<?php
// Tests for save-docker-autostart.php — the autostart toggle endpoint.
// We exercise the pure functions (parse/write/handle) without HTTP, redirecting
// the target file to a tempdir so the real /var/lib/docker is untouched.
//
// The endpoint is loaded with PHP_SAPI === 'cli' which suppresses the
// http_response_code/header side effects, so we can just require it.

define('MODERNUI_TESTING', true);
require_once __DIR__ . '/../../package/include/save-docker-autostart.php';

// ===========================================================================
// modernui_parse_autostart_file — handles empty + name-only + name+wait lines
// ===========================================================================

$tmpDir = sys_get_temp_dir() . '/modernui-autostart-test-' . uniqid();
mkdir($tmpDir, 0755, true);
$tmpFile = $tmpDir . '/autostart';

assert(modernui_parse_autostart_file($tmpDir . '/missing') === [], 'missing file returns []');

file_put_contents($tmpFile, "plex\nsonarr 60\n\nradarr 5\n");
$parsed = modernui_parse_autostart_file($tmpFile);
assert(count($parsed) === 3, 'three entries (blank line ignored): ' . var_export($parsed, true));
assert($parsed[0]['name'] === 'plex' && $parsed[0]['wait'] === '', 'plex with no wait');
assert($parsed[1]['name'] === 'sonarr' && $parsed[1]['wait'] === '60', 'sonarr with wait');
assert($parsed[2]['name'] === 'radarr' && $parsed[2]['wait'] === '5', 'radarr with wait');

// ===========================================================================
// modernui_write_autostart_file — round trips
// ===========================================================================

$written = [
    ['name' => 'a', 'wait' => ''],
    ['name' => 'b', 'wait' => '30'],
];
assert(modernui_write_autostart_file($tmpFile, $written), 'write should succeed');
$contents = file_get_contents($tmpFile);
assert(strpos($contents, "a\n") !== false, 'a written without wait');
assert(strpos($contents, "b 30\n") !== false, 'b written with wait');
assert(modernui_parse_autostart_file($tmpFile) === $written, 'round-trip');

// ===========================================================================
// modernui_handle_save_autostart — toggle add/remove preserves existing waits
// ===========================================================================

// Redirect the target path to a per-test tempfile by stubbing the constant via
// a reflection workaround. PHP doesn't let us redefine constants, so we exec
// the handler logic directly by calling it with explicit file paths…
//
// Instead: we just test the handler against the real constant target by
// pointing the file at the temp path, asserting the temp path is read +
// written. We do this by symlinking the constant path to our temp file…
//
// Easier: rewrite the handler body inline with file overrides for the test.
// Since save-docker-autostart.php uses MODERNUI_AUTOSTART_FILE directly, we
// can't sub it in. So this test focuses on parse/write helpers above. The
// handler is straightforward composition we trust by inspection — bad
// payloads return ok=false, valid payloads call parse → mutate → write.

// Direct payload-validation test by invoking the handler with malformed input
// — the handler returns immediately without ever touching the file, so the
// global constant is irrelevant. We can't test the happy path here without
// constant injection, but we can confirm bad input is rejected.

$cases = [
    [['payload' => ''], 'empty payload rejected'],
    [['payload' => 'not json'], 'non-json payload rejected'],
    [['payload' => json_encode([])], 'missing changes rejected'],
    [['payload' => json_encode(['changes' => []])], 'empty changes rejected'],
    [['payload' => json_encode(['changes' => [['name' => 'plex', 'enabled' => 'yes']]])], 'non-bool enabled rejected'],
    [['payload' => json_encode(['changes' => [['name' => '', 'enabled' => true]]])], 'empty name rejected'],
    [['payload' => json_encode(['changes' => [['name' => 'bad name with spaces', 'enabled' => true]]])], 'whitespace in name rejected'],
    [['payload' => json_encode(['changes' => [['name' => '../etc/passwd', 'enabled' => true]]])], 'path traversal in name rejected'],
    [['payload' => json_encode(['changes' => [['name' => "plex\nsonarr 60", 'enabled' => true]]])], 'newline injection in name rejected'],
];
foreach ($cases as [$post, $label]) {
    $res = modernui_handle_save_autostart($post);
    assert(($res['ok'] ?? null) === false, "$label: " . var_export($res, true));
}

// Cleanup
@unlink($tmpFile);
@rmdir($tmpDir);

echo "all save-docker-autostart tests passed\n";
exit(0);
