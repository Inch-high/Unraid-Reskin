<?php
require_once __DIR__ . '/helpers.php';

const MODERNUI_SAFEMODE_FLAG = '/boot/config/plugins/unraid-modernui/safemode';

function modernui_upgrade_check(): void {
    // Phase 1: no shell PHP overrides exist, so there is nothing to validate.
    // Phase 3 will: for each file under overlay/, compare current upstream SHA against the recorded baseline,
    // and on mismatch write the safemode flag here.
    $flag = MODERNUI_SAFEMODE_FLAG;
    if (is_file($flag)) unlink($flag);
    echo "Modern UI: upgrade check passed (Phase 1 — no overrides to verify)\n";
}

if (PHP_SAPI === 'cli' && !defined('MODERNUI_TESTING')) {
    modernui_upgrade_check();
}
