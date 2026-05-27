<?php
// Async "check for updates" trigger.
//
// DockerUpdate::reloadUpdateStatus() walks every local image and fetches its
// tag manifest from the remote registry over HTTPS. On a host with 30+
// containers that's 10s+ of serial network I/O — running it synchronously on
// the request path made the morph button block until completion.
//
// New contract (zero blocking I/O on request path, per the rebuild spec):
//
//   POST  /docker-check-updates.php          → spawns a detached PHP CLI worker
//                                              if none is running, returns
//                                              { ok, queued, running }
//                                              immediately.
//   GET   /docker-check-updates.php          → { running: bool,
//                                                finishedAt: int|null,
//                                                error: string|null }
//                                              cheap status poll for the
//                                              front-end to watch.
//   CLI   php docker-check-updates.php --run → actually does the work. Writes
//                                              a PID lock file on start,
//                                              clears it on finish.
//
// The lock + status file pair lives in /var/lock (tmpfs on Unraid — survives
// the request but not a reboot, which is what we want).

require_once __DIR__ . '/docker-helpers.php';

// define() (not const) so tests can pre-define these to a writable temp dir
// — /var/lock is tmpfs on Unraid but doesn't exist on the Windows test host.
if (!defined('MODERNUI_CHECK_UPDATES_LOCK'))   define('MODERNUI_CHECK_UPDATES_LOCK',   '/var/lock/modernui-check-updates.pid');
if (!defined('MODERNUI_CHECK_UPDATES_STATUS')) define('MODERNUI_CHECK_UPDATES_STATUS', '/var/lock/modernui-check-updates.status.json');

// True if a worker PID file exists AND that PID is still alive. Cleans up a
// stale lock (e.g. worker crashed before unlink) so the next POST isn't
// blocked forever.
function modernui_check_updates_running(): bool {
    if (!is_file(MODERNUI_CHECK_UPDATES_LOCK)) return false;
    $pid = (int)@file_get_contents(MODERNUI_CHECK_UPDATES_LOCK);
    if ($pid <= 0) { @unlink(MODERNUI_CHECK_UPDATES_LOCK); return false; }
    // posix_kill(pid, 0) is the standard "is process alive" probe — signal 0
    // performs error checking without actually sending a signal.
    if (function_exists('posix_kill') && @posix_kill($pid, 0)) return true;
    @unlink(MODERNUI_CHECK_UPDATES_LOCK);
    return false;
}

function modernui_check_updates_status_payload(): array {
    $finishedAt = null;
    $error = null;
    if (is_file(MODERNUI_CHECK_UPDATES_STATUS)) {
        $data = @json_decode((string)@file_get_contents(MODERNUI_CHECK_UPDATES_STATUS), true);
        if (is_array($data)) {
            $finishedAt = isset($data['finishedAt']) ? (int)$data['finishedAt'] : null;
            $error      = isset($data['error']) && is_string($data['error']) ? $data['error'] : null;
        }
    }
    return [
        'running'    => modernui_check_updates_running(),
        'finishedAt' => $finishedAt,
        'error'      => $error,
    ];
}

// Kick off a detached PHP CLI worker. nohup + & + redirected stdio so the
// caller doesn't block waiting on the child's fd's, which would defeat the
// whole point of going async.
function modernui_check_updates_start(): array {
    if (modernui_check_updates_running()) {
        return ['ok' => true, 'queued' => false, 'running' => true];
    }
    $php = '/usr/bin/php';
    if (!is_executable($php)) $php = 'php';
    $script = escapeshellarg(__FILE__);
    $cmd = "nohup $php $script --run >/dev/null 2>&1 &";
    @exec($cmd);
    return ['ok' => true, 'queued' => true, 'running' => true];
}

// CLI entry: runs the actual update check. Writes PID lock on start, status
// file on finish (regardless of success), clears lock so the next POST can
// start a new run.
function modernui_check_updates_run_cli(): void {
    @file_put_contents(MODERNUI_CHECK_UPDATES_LOCK, (string)getmypid());

    // DockerUpdate lives in dynamix.docker.manager. From a CLI context we
    // need to pull its dependencies in explicitly — Helpers.php for _var/etc,
    // DockerClient.php for $dockerManPaths + the DockerUpdate class.
    $docroot = '/usr/local/emhttp';
    if (is_file("$docroot/webGui/include/Helpers.php")) {
        require_once "$docroot/webGui/include/Helpers.php";
    }
    $dockerClient = '/usr/local/emhttp/plugins/dynamix.docker.manager/include/DockerClient.php';
    if (is_file($dockerClient)) require_once $dockerClient;

    $error = null;
    try {
        if (!class_exists('DockerUpdate')) {
            throw new RuntimeException('DockerUpdate class missing — docker manager plugin not installed?');
        }
        $update = new DockerUpdate();
        $update->reloadUpdateStatus();
    } catch (Throwable $e) {
        $error = $e->getMessage();
        error_log('[modernui] check-updates worker failed: ' . $error);
    }

    @file_put_contents(MODERNUI_CHECK_UPDATES_STATUS, json_encode([
        'finishedAt' => time(),
        'error'      => $error,
    ]));
    @unlink(MODERNUI_CHECK_UPDATES_LOCK);
}

if (PHP_SAPI === 'cli') {
    // Worker mode. Only run when explicitly invoked with --run so accidental
    // imports (e.g. from tests) don't trigger a registry walk.
    $argv = $_SERVER['argv'] ?? [];
    if (in_array('--run', $argv, true)) {
        modernui_check_updates_run_cli();
    }
} elseif (!defined('MODERNUI_TESTING')) {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'POST') {
        modernui_json_response(modernui_check_updates_start());
    } else {
        modernui_json_response(modernui_check_updates_status_payload());
    }
}
