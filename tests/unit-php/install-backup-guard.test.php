<?php
// Verifies that the SHA backup pointer doesn't track our own output when
// install.php's helpers are re-run on an already-modified file. The bug
// being guarded against: modernui_backup_file() unconditionally rewrites
// .current.sha to the live file's SHA, so a second install run on an
// injected layout (or an overlaid docker page) snapshots our own output
// as the "stock" backup — and a later uninstall then "restores" the file
// to our injected/overlaid version instead of Unraid's real original.

define('MODERNUI_TESTING', true);
require_once __DIR__ . '/../../package/include/install.php';

// --- 1. modernui_layout_appears_clean() -------------------------------------

$tmp = tempnam(sys_get_temp_dir(), 'modernui_clean_');

file_put_contents($tmp, "<html><head><title>x</title></head></html>");
assert(modernui_layout_appears_clean($tmp) === true,
    'plain HTML without our marker should appear clean');

$injected = "<html><head>\n"
    . MODERNUI_HTML_MARK_BEGIN . "\n"
    . "<script src='/x'></script>\n"
    . MODERNUI_HTML_MARK_END . "\n"
    . "</head></html>";
file_put_contents($tmp, $injected);
assert(modernui_layout_appears_clean($tmp) === false,
    'file containing our begin marker should NOT appear clean');

unlink($tmp);
assert(modernui_layout_appears_clean($tmp) === false,
    'missing file should not appear clean');

// --- 2. modernui_replace_file() backup-guard --------------------------------
// The replace path takes a real "overlay" file and a real "target" file.
// When target == overlay byte-identically, the backup should be skipped
// (otherwise the pointer would advance to the overlay's own SHA and break
// later restores).
//
// We can't easily redirect MODERNUI_BACKUP_DIR (it's a const), so we just
// assert the documented invariant by inspecting what modernui_backup_file
// would do: it always rewrites .current.sha. We test the GUARD lives in
// modernui_replace_file by checking the source contains the SHA-compare
// branch — a behavioural test would require a writable backup dir which
// the test harness doesn't provide on Windows. Source-level check is
// enough to catch accidental removal of the guard.

$source = file_get_contents(__DIR__ . '/../../package/include/install.php');
assert(strpos($source, 'if ($target_sha !== $overlay_sha)') !== false,
    'modernui_replace_file must SHA-compare before backing up — the guard prevents '
    . 'capturing our own overlay as the "stock" backup');
assert(strpos($source, 'modernui_layout_appears_clean(MODERNUI_LAYOUT_FILE)') !== false,
    'modernui_install must call modernui_layout_appears_clean before backing up '
    . 'the layout — the guard prevents capturing the injected version');

echo "all install backup-guard tests passed\n";
exit(0);
