<?php
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/install.php';   // pulls in MODERNUI_DOCKER_PAGE, MODERNUI_OVERLAY_DIR, modernui_replace_file
require_once __DIR__ . '/uninstall.php'; // pulls in modernui_restore_from_backup

const MODERNUI_SAFEMODE_FLAG = '/boot/config/plugins/unraid-modernui/safemode';

// Tracked overlays: target file → fallback strip function (used when no SHA
// backup is found). For files we replaced wholesale (docker page), there's
// no in-place marker to strip — pass an identity function.
const MODERNUI_TRACKED_OVERLAYS = [
    // target_path                =>  [overlay_source_path, strip_fn]
    // Note: keys built dynamically below because PHP const arrays can't use
    // function references and we want strip_fn to live in code, not config.
];

function modernui_tracked_overlay_table(): array {
    $table = [
        MODERNUI_DOCKER_PAGE => [
            'overlay'  => MODERNUI_OVERLAY_DIR . '/usr/local/emhttp/plugins/dynamix.docker.manager/DockerContainers.page',
            'strip_fn' => fn($s) => $s,
        ],
        // DefaultPageLayout.php is in-place patched (markers stripped on
        // uninstall), not wholesale-replaced — exclude it here.
    ];
    // The four /Main pages we replaced wholesale. If upstream changes any one,
    // restore all originals + enter safe mode (handled by the loop below).
    foreach (modernui_main_overlay_table() as $target => $overlaySrc) {
        $table[$target] = ['overlay' => $overlaySrc, 'strip_fn' => fn($s) => $s];
    }
    return $table;
}

// If an Unraid update changed the .page file we replaced, our backup SHA no
// longer matches what's on disk. That means either: (a) Unraid changed the
// file underneath us mid-life (we never had a chance to update our overlay),
// or (b) our overlay was tampered with. Either way, the safe move is to
// restore Unraid's original (which we stored on first install) and enter
// safe mode — the front-end .page detects the safemode flag and shows a
// stock-style placeholder + a banner about checking for a plugin update.
function modernui_upgrade_check(): void {
    $flag = MODERNUI_SAFEMODE_FLAG;
    $entered_safe = false;

    foreach (modernui_tracked_overlay_table() as $target => $meta) {
        if (!is_file($target)) continue;
        if (!is_file($meta['overlay'])) continue;

        $current_sha = hash_file('sha256', $target);
        $overlay_sha = hash_file('sha256', $meta['overlay']);

        // If the file on disk is our overlay, nothing to do.
        if ($current_sha === $overlay_sha) continue;

        // Not ours — and not Unraid's either, since we replaced theirs. Most
        // likely: Unraid patched the file in place after our install. Restore
        // the original from backup (so behavior reverts cleanly) and flip
        // the safe-mode flag. Re-overlaying would silently mask the change.
        $shaFile = MODERNUI_BACKUP_DIR . '/' . basename($target) . '.current.sha';
        if (is_file($shaFile)) {
            modernui_restore_from_backup($target, $meta['strip_fn']);
            $entered_safe = true;
            echo "Modern UI: safe mode — {$target} changed by upstream; restored original.\n";
        }
    }

    if ($entered_safe) {
        if (!is_dir(dirname($flag))) @mkdir(dirname($flag), 0755, true);
        @touch($flag);
    } elseif (is_file($flag)) {
        // All overlays look fine — clear any stale flag from a prior boot.
        @unlink($flag);
    }

    echo "Modern UI: upgrade check passed (safe_mode=" . ($entered_safe ? 'true' : 'false') . ")\n";
}

if (PHP_SAPI === 'cli' && !defined('MODERNUI_TESTING')) {
    modernui_upgrade_check();
}
