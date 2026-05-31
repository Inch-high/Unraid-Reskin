<?php

// Async "check for updates" trigger.
//
// The update check (getAllInfo($reload=true), which walks every local image and
// fetches its tag manifest from the remote registry over HTTPS) is 10s+ of
// serial network I/O on a host with 30+ containers — running it synchronously on
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
if (!defined('MODERNUI_CHECK_UPDATES_LOCK')) {
    define('MODERNUI_CHECK_UPDATES_LOCK', '/var/lock/modernui-check-updates.pid');
}
if (!defined('MODERNUI_CHECK_UPDATES_STATUS')) {
    define('MODERNUI_CHECK_UPDATES_STATUS', '/var/lock/modernui-check-updates.status.json');
}

// True if a worker PID file exists AND that PID is still alive. Cleans up a
// stale lock (e.g. worker crashed before unlink) so the next POST isn't
// blocked forever.
function modernui_check_updates_running(): bool
{
    if (!is_file(MODERNUI_CHECK_UPDATES_LOCK)) {
        return false;
    }
    $pid = (int)@file_get_contents(MODERNUI_CHECK_UPDATES_LOCK);
    if ($pid <= 0) {
        @unlink(MODERNUI_CHECK_UPDATES_LOCK);
        return false;
    }
    // posix_kill(pid, 0) is the standard "is process alive" probe — signal 0
    // performs error checking without actually sending a signal.
    if (function_exists('posix_kill') && @posix_kill($pid, 0)) {
        return true;
    }
    @unlink(MODERNUI_CHECK_UPDATES_LOCK);
    return false;
}

function modernui_check_updates_status_payload(): array
{
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
function modernui_check_updates_start(): array
{
    if (modernui_check_updates_running()) {
        return ['ok' => true, 'queued' => false, 'running' => true];
    }
    $php = '/usr/bin/php';
    if (!is_executable($php)) {
        $php = 'php';
    }
    $script = escapeshellarg(__FILE__);
    $cmd = "nohup $php $script --run >/dev/null 2>&1 &";
    @exec($cmd);
    return ['ok' => true, 'queued' => true, 'running' => true];
}

// CLI entry: runs the actual update check. Writes PID lock on start, status
// file on finish (regardless of success), clears lock so the next POST can
// start a new run.
// NOTE: Unraid's docker classes + their module-level globals ($dockerManPaths,
// $driver) MUST be required at FILE scope by the caller before this runs — see
// the bootstrap in the CLI dispatch block at the bottom. DockerClient.php defines
// $dockerManPaths at its top level; requiring it from inside this function would
// scope that array locally and getAllInfo()'s `global $dockerManPaths` would see
// null (manifesting as a "Path must not be empty" throw when it loads/saves the
// webui-info cache). docker-state.php solves the same way.
function modernui_check_updates_run_cli(): void
{
    @file_put_contents(MODERNUI_CHECK_UPDATES_LOCK, (string)getmypid());

    $error = null;
    try {
        if (!class_exists('DockerTemplates')) {
            throw new RuntimeException('DockerTemplates class missing — docker manager plugin not installed?');
        }
        // Call getAllInfo($reload=true) rather than DockerUpdate::reloadUpdateStatus()
        // directly. There are TWO caches in the stock backend:
        //   • unraid-update-status.json — raw local-vs-remote digest comparison,
        //     written by reloadUpdateStatus().
        //   • webui-info — the per-container metadata cache getAllInfo() serves,
        //     including the `updated` string field docker-state.php reads.
        // The `updated` field is ONLY recomputed from update-status.json when
        // $reload=true. Our snapshot path (docker-state.php) calls getAllInfo with
        // $reload=false for speed, so if the worker only refreshed update-status.json
        // the snapshot would keep serving the STALE cached `updated` value forever
        // and update badges would never appear. getAllInfo(true,…) does the per-image
        // remote digest fetch AND rewrites webui-info in one pass — exactly what the
        // stock UI's "check for updates" does. Off the request path, in this detached
        // worker, the extra cost is fine.
        $templates = new DockerTemplates();
        $templates->getAllInfo(true, true, false);
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
        // Bootstrap Unraid's docker stack at FILE scope (this block runs in the
        // global namespace, NOT inside a function) so DockerClient.php's top-level
        // $dockerManPaths / $driver land as globals that getAllInfo() can see via
        // `global`. Doing this inside run_cli() would scope them locally → empty
        // paths → "Path must not be empty". DOCUMENT_ROOT is empty under CLI, so
        // $docroot falls back to /usr/local/emhttp (matching the web request path,
        // so the webui-info cache file resolves to the same docker.json).
        $docroot = ($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '/usr/local/emhttp';
        if (is_file("$docroot/webGui/include/Helpers.php")) {
            require_once "$docroot/webGui/include/Helpers.php";
        }
        $dockerClient = "$docroot/plugins/dynamix.docker.manager/include/DockerClient.php";
        if (is_file($dockerClient)) {
            require_once $dockerClient; // defines $dockerManPaths, $driver + classes
        }
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
