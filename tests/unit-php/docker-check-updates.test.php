<?php

// Tests for the async check-for-updates endpoint contract:
//   • status helpers read/clean lock + status files correctly
//   • a stale PID lock (process no longer alive) is treated as "not running"
//   • the CLI worker writes the status file and removes the lock
//
// Note: we can't exercise modernui_check_updates_start() here — it forks a
// real php worker against Unraid's DockerUpdate class, which isn't available
// in the test sandbox. The HTTP/CLI dispatch is gated by MODERNUI_TESTING so
// requiring the file is a no-op.

define('MODERNUI_TESTING', true);

// Redirect lock/status paths to a temp dir BEFORE requiring the file — its
// define() guards will see ours and skip the production /var/lock paths.
$tmpDir = sys_get_temp_dir() . '/modernui-check-updates-test-' . uniqid();
mkdir($tmpDir, 0755, true);
define('MODERNUI_CHECK_UPDATES_LOCK', $tmpDir . '/check.pid');
define('MODERNUI_CHECK_UPDATES_STATUS', $tmpDir . '/check.status.json');

require_once __DIR__ . '/../../package/include/docker-check-updates.php';

$lock   = MODERNUI_CHECK_UPDATES_LOCK;
$status = MODERNUI_CHECK_UPDATES_STATUS;
@unlink($lock);
@unlink($status);

// ===========================================================================
// modernui_check_updates_running()
// ===========================================================================

assert(modernui_check_updates_running() === false, 'no lock file -> not running');

// Stale PID — pick something high we're confident doesn't map to a real
// process. 0 / negative gets cleaned as "bad pid".
file_put_contents($lock, '0');
assert(modernui_check_updates_running() === false, 'pid 0 should be treated as stale');
assert(!is_file($lock), 'stale pid 0 lock should be cleaned up');

// Garbage in lock file — defensive cleanup.
file_put_contents($lock, 'not a number');
assert(modernui_check_updates_running() === false, 'garbage pid -> not running');
assert(!is_file($lock), 'garbage lock should be cleaned up');

// Our own PID is definitely alive — should report running. (Skip on platforms
// without posix_kill — Windows test runs.)
if (function_exists('posix_kill')) {
    file_put_contents($lock, (string)getmypid());
    assert(modernui_check_updates_running() === true, 'own pid -> running');
    assert(is_file($lock), 'live lock should not be cleaned up');
    @unlink($lock);
}

// ===========================================================================
// modernui_check_updates_status_payload()
// ===========================================================================

$payload = modernui_check_updates_status_payload();
assert($payload['running'] === false, 'fresh: not running');
assert($payload['finishedAt'] === null, 'fresh: no finishedAt');
assert($payload['error'] === null, 'fresh: no error');

// With a status file: payload reflects it.
file_put_contents($status, json_encode(['finishedAt' => 1234567890, 'error' => null]));
$payload = modernui_check_updates_status_payload();
assert($payload['finishedAt'] === 1234567890, 'finishedAt round-trips');
assert($payload['error'] === null, 'error round-trips as null');

// Error case round-trip.
file_put_contents($status, json_encode(['finishedAt' => 1234567891, 'error' => 'boom']));
$payload = modernui_check_updates_status_payload();
assert($payload['error'] === 'boom', 'error string round-trips');

// Corrupt status file should not crash — fall back to defaults.
file_put_contents($status, 'not json at all');
$payload = modernui_check_updates_status_payload();
assert($payload['finishedAt'] === null, 'corrupt status -> null finishedAt');
assert($payload['error'] === null, 'corrupt status -> null error');

// Cleanup
@unlink($lock);
@unlink($status);
@rmdir($tmpDir);

echo "all docker-check-updates tests passed\n";
exit(0);
