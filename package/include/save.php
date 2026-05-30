<?php
require_once __DIR__ . '/helpers.php';

const MODERNUI_SETTINGS_PATH = '/boot/config/plugins/unraid-modernui/settings.cfg';
const MODERNUI_SETTINGS_DIR  = '/boot/config/plugins/unraid-modernui';

function modernui_validate_settings(array $input): array {
    $defaults = [
        'mode'                  => 'system',
        'density'               => 'comfortable',
        'sidebar'               => 'expanded',
        'zebra'                 => '0',
        'reduced_motion'        => 'auto',
        'dashboard'             => 'on',
        'shell'                 => 'on',
        'docker'                => 'on',
        'main'                  => 'on',
        'docker_folder_default' => 'expanded',
        'docker_show_stats'     => 'off',
    ];
    $allowed = [
        'mode'                  => ['system', 'dark', 'light'],
        'density'               => ['comfortable', 'compact'],
        'sidebar'               => ['expanded', 'collapsed'],
        'zebra'                 => ['0', '1'],
        'reduced_motion'        => ['auto', '0', '1'],
        'dashboard'             => ['on', 'off'],
        'shell'                 => ['on', 'off'],
        'docker'                => ['on', 'off'],
        'main'                  => ['on', 'off'],
        'docker_folder_default' => ['expanded', 'collapsed'],
        'docker_show_stats'     => ['on', 'off'],
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

// Replace / restore the four /Main .page overlays as a unit. Both rely on
// modernui_main_overlay_table() + modernui_replace_file / restore from
// install.php + uninstall.php (required by the caller before these run).
function modernui_replace_main_pages(): void {
    foreach (modernui_main_overlay_table() as $target => $overlaySrc) {
        modernui_replace_file($target, $overlaySrc);
    }
    // Optional Unassigned Devices suppression overlay (only if plugin present).
    if (modernui_ud_plugin_present()) {
        modernui_replace_file(MODERNUI_UD_PAGE_TARGET, modernui_ud_overlay_src());
    }
}
function modernui_restore_main_pages(): void {
    foreach (modernui_main_overlay_table() as $target => $_overlaySrc) {
        modernui_restore_from_backup($target, fn($s) => $s);
    }
    if (is_file(MODERNUI_UD_PAGE_TARGET)) {
        modernui_restore_from_backup(MODERNUI_UD_PAGE_TARGET, fn($s) => $s);
    }
}

function modernui_handle_post(array $post): array {
    require_once __DIR__ . '/install.php';   // pulls in modernui_install + modernui_generate_loader_js + modernui_replace_file + modernui_main_overlay_table
    require_once __DIR__ . '/uninstall.php'; // pulls in modernui_restore_from_backup

    if (($post['action'] ?? '') === 'disable') {
        modernui_set_disabled(MODERNUI_SETTINGS_DIR, true);
        modernui_generate_loader_js(true);
        // Restore stock pages so users have a true fallback, not a "disabled"
        // placeholder. Re-applied on enable below.
        modernui_restore_from_backup(MODERNUI_DOCKER_PAGE, fn($s) => $s);
        modernui_restore_main_pages();
        return ['ok' => true, 'reload' => true];
    }
    if (($post['action'] ?? '') === 'enable') {
        modernui_set_disabled(MODERNUI_SETTINGS_DIR, false);
        modernui_generate_loader_js(false);
        modernui_replace_file(
            MODERNUI_DOCKER_PAGE,
            MODERNUI_OVERLAY_DIR . '/usr/local/emhttp/plugins/dynamix.docker.manager/DockerContainers.page'
        );
        // Only re-apply the Main overlays if the Main layout is set to Modern.
        if ((modernui_parse_cfg(MODERNUI_SETTINGS_PATH)['main'] ?? 'on') !== 'off') {
            modernui_replace_main_pages();
        }
        return ['ok' => true, 'reload' => true];
    }

    // Merge incoming POST over existing cfg so partial POSTs (e.g. just
    // sidebar=collapsed from the shell toggle) don't reset other settings
    // to defaults. Validation runs against the merged input.
    $existing = modernui_parse_cfg(MODERNUI_SETTINGS_PATH);
    $merged = array_merge($existing, $post);

    $v = modernui_validate_settings($merged);
    if (!$v['ok']) return $v;

    // Docker layout toggle requires swapping the .page file on disk because
    // our overlay replaced Unraid's. If the user just turned docker off, we
    // restore the stock file; if they turned it on, we re-apply our overlay.
    $docker_was = $existing['docker'] ?? 'on';
    $docker_now = $v['values']['docker'];
    if ($docker_was !== $docker_now) {
        if ($docker_now === 'off') {
            modernui_restore_from_backup(MODERNUI_DOCKER_PAGE, fn($s) => $s);
        } else {
            modernui_replace_file(
                MODERNUI_DOCKER_PAGE,
                MODERNUI_OVERLAY_DIR . '/usr/local/emhttp/plugins/dynamix.docker.manager/DockerContainers.page'
            );
        }
    }

    // Main layout toggle — same swap-the-file-on-disk semantics. Turning Main
    // off restores all four stock /Main pages (true fallback for this critical
    // page); turning it on re-applies our overlays.
    $main_was = $existing['main'] ?? 'on';
    $main_now = $v['values']['main'];
    if ($main_was !== $main_now) {
        if ($main_now === 'off') {
            modernui_restore_main_pages();
        } else {
            modernui_replace_main_pages();
        }
    }

    modernui_write_cfg(MODERNUI_SETTINGS_PATH, $v['values']);
    // Regenerate loader.js so data-modernui-mode/density on <html> reflects the new settings on next reload
    modernui_generate_loader_js(modernui_is_disabled(MODERNUI_SETTINGS_DIR));
    return ['ok' => true, 'values' => $v['values']];
}

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json');
    echo json_encode(modernui_handle_post($_POST));
}
