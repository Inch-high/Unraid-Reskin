<?php
// POST-only endpoint. Triggers Unraid's standard "check for updates" path:
// DockerUpdate->reloadUpdateStatus() which compares each local image's RepoDigest
// against the remote registry's tag manifest and writes the result to
// $dockerManPaths['update-status'] (a JSON keyed by image:tag).
//
// Hits the docker registry over HTTPS — can take a while when the host has
// many containers (each is a separate manifest fetch). We run it synchronously
// here; for huge installs we should background it via an nchan worker, but
// that's a follow-up.
//
// Returns { ok: true } on success. The front-end then re-fetches docker-state
// to pick up the refreshed `updated` flags.

require_once __DIR__ . '/docker-helpers.php';

$docroot ??= ($_SERVER['DOCUMENT_ROOT'] ?: '/usr/local/emhttp');
if (is_file("$docroot/webGui/include/Helpers.php")) {
    require_once "$docroot/webGui/include/Helpers.php";
}
$DOCKER_CLIENT = '/usr/local/emhttp/plugins/dynamix.docker.manager/include/DockerClient.php';
if (is_file($DOCKER_CLIENT)) {
    require_once $DOCKER_CLIENT;
}

function modernui_handle_check_updates(): array {
    if (!class_exists('DockerUpdate')) {
        return ['ok' => false, 'error' => 'DockerUpdate class missing — docker manager plugin not installed?'];
    }
    try {
        $update = new DockerUpdate();
        $update->reloadUpdateStatus();   // refreshes update-status.json for every image
        return ['ok' => true];
    } catch (Throwable $e) {
        error_log('[modernui] check-updates failed: ' . $e->getMessage());
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

if (PHP_SAPI !== 'cli') {
    modernui_json_response(modernui_handle_check_updates());
}
