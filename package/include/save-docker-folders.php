<?php
// POST-only endpoint. Validates + atomically writes docker-folders.json.
// CSRF: auto_prepend (/usr/local/emhttp/webGui/include/local_prepend.php)
// rejects any POST without a matching csrf_token before this file runs, so
// we don't need to re-check the token here.

require_once __DIR__ . '/docker-helpers.php';

function modernui_handle_save_folders(array $post): array {
    $data = modernui_payload_from_post($post);
    if ($data === null) return ['ok' => false, 'error' => 'invalid payload'];
    $v = modernui_validate_folders($data);
    if (!$v['ok']) return $v;
    if (!modernui_write_json_atomic(MODERNUI_DOCKER_FOLDERS, $data)) {
        return ['ok' => false, 'error' => 'write failed'];
    }
    return ['ok' => true];
}

if (PHP_SAPI !== 'cli') {
    modernui_json_response(modernui_handle_save_folders($_POST));
}
