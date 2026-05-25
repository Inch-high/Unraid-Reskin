<?php
require_once __DIR__ . '/helpers.php';

const MODERNUI_SETTINGS_PATH = '/boot/config/plugins/unraid-modernui/settings.cfg';
const MODERNUI_SETTINGS_DIR  = '/boot/config/plugins/unraid-modernui';

function modernui_validate_settings(array $input): array {
    $defaults = [
        'mode'           => 'system',
        'density'        => 'comfortable',
        'sidebar'        => 'expanded',
        'zebra'          => '0',
        'reduced_motion' => 'auto',
        'dashboard'      => 'on',
        'shell'          => 'on',
    ];
    $allowed = [
        'mode'           => ['system', 'dark', 'light'],
        'density'        => ['comfortable', 'compact'],
        'sidebar'        => ['expanded', 'collapsed'],
        'zebra'          => ['0', '1'],
        'reduced_motion' => ['auto', '0', '1'],
        'dashboard'      => ['on', 'off'],
        'shell'          => ['on', 'off'],
    ];

    $out = $defaults;
    foreach ($defaults as $key => $default) {
        if (!isset($input[$key])) continue;
        $value = (string)$input[$key];
        if (!in_array($value, $allowed[$key], true)) {
            return ['ok' => false, 'error' => "Invalid value for {$key}: {$value}"];
        }
        $out[$key] = $value;
    }
    return ['ok' => true, 'values' => $out];
}

function modernui_handle_post(array $post): array {
    require_once __DIR__ . '/install.php'; // pulls in modernui_install + modernui_generate_loader_js

    if (($post['action'] ?? '') === 'disable') {
        modernui_set_disabled(MODERNUI_SETTINGS_DIR, true);
        modernui_generate_loader_js(true);
        return ['ok' => true, 'reload' => true];
    }
    if (($post['action'] ?? '') === 'enable') {
        modernui_set_disabled(MODERNUI_SETTINGS_DIR, false);
        modernui_generate_loader_js(false);
        return ['ok' => true, 'reload' => true];
    }

    $v = modernui_validate_settings($post);
    if (!$v['ok']) return $v;
    modernui_write_cfg(MODERNUI_SETTINGS_PATH, $v['values']);
    // Regenerate loader.js so data-modernui-mode/density on <html> reflects the new settings on next reload
    modernui_generate_loader_js(modernui_is_disabled(MODERNUI_SETTINGS_DIR));
    return ['ok' => true, 'values' => $v['values']];
}

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json');
    echo json_encode(modernui_handle_post($_POST));
}
