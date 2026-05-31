<?php

require_once __DIR__ . '/install.php'; // re-uses constants, helpers, and modernui_strip_block

function modernui_restore_from_backup(string $path, callable $stripFallback): void
{
    $basename = basename($path);
    $shaFile = MODERNUI_BACKUP_DIR . "/{$basename}.current.sha";
    if (is_file($shaFile)) {
        $sha = trim(file_get_contents($shaFile));
        $backup = MODERNUI_BACKUP_DIR . "/{$basename}.{$sha}";
        if (is_file($backup)) {
            copy($backup, $path);
            echo "Modern UI: restored {$basename} from backup ({$sha})\n";
            return;
        }
    }
    // No backup found — fall through to strip-only mode
    if (is_file($path)) {
        $contents = file_get_contents($path);
        $stripped = $stripFallback($contents);
        file_put_contents($path, $stripped, LOCK_EX);
        echo "Modern UI: no backup, stripped marker from {$basename}\n";
    }
}

function modernui_uninstall(): void
{
    // Strip any leftover marker from dynamix.cfg (v0.1.0 wrote a fictitious extraCSS= line there)
    modernui_strip_dynamix_cfg();
    // Restore the layout file from its SHA-keyed backup (or strip our markers if backup is missing)
    modernui_restore_from_backup(MODERNUI_LAYOUT_FILE, 'modernui_strip_html_block');
    // Restore Unraid's docker manager page from backup. Fallback is a no-op
    // (no strip needed — our overlay file replaced the original wholesale).
    modernui_restore_from_backup(MODERNUI_DOCKER_PAGE, fn ($s) => $s);
    // Restore Unraid's four /Main .page files from backup (wholesale replace,
    // so the strip fallback is a no-op).
    foreach (modernui_main_overlay_table() as $target => $_overlaySrc) {
        modernui_restore_from_backup($target, fn ($s) => $s);
    }
    // Restore the Unassigned Devices plugin's page if we suppressed it.
    if (is_file(MODERNUI_UD_PAGE_TARGET)) {
        modernui_restore_from_backup(MODERNUI_UD_PAGE_TARGET, fn ($s) => $s);
    }
    // We keep MODERNUI_CFG_DIR (settings.cfg + disabled flag + docker-*.json)
    // so a reinstall remembers prefs and user-curated folders/tags survive.
    // The .plg remove block deletes the plugin payload itself.
}

// See the matching note in install.php — the realpath check prevents
// upgrade.php (which require_once's this file for modernui_restore_from_backup)
// from accidentally triggering a full uninstall as a side effect.
if (PHP_SAPI === 'cli'
    && !defined('MODERNUI_TESTING')
    && isset($_SERVER['SCRIPT_FILENAME'])
    && realpath($_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)) {
    modernui_uninstall();
}
