<?php

require_once __DIR__ . '/docker-helpers.php';

function modernui_handle_save_tags(array $post): array
{
    $data = modernui_payload_from_post($post);
    if ($data === null) {
        return ['ok' => false, 'error' => 'invalid payload'];
    }
    $v = modernui_validate_tags($data);
    if (!$v['ok']) {
        return $v;
    }
    if (!modernui_write_json_atomic(MODERNUI_DOCKER_TAGS, $data)) {
        return ['ok' => false, 'error' => 'write failed'];
    }
    return ['ok' => true];
}

if (PHP_SAPI !== 'cli') {
    modernui_json_response(modernui_handle_save_tags($_POST));
}
