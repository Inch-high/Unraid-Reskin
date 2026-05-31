<?php

define('MODERNUI_TESTING', true);
require_once __DIR__ . '/../../package/include/uninstall.php';

// Set up a temp scratch dir to act as MODERNUI_BACKUP_DIR for the test.
// We can't redefine the constant, but we can use reflection-style: the function
// reads MODERNUI_BACKUP_DIR at call time, so we override the test by writing
// fake backups to the real path. To keep this test hermetic, we test the
// strip_fallback path only — no real backup needed.

$tmp = tempnam(sys_get_temp_dir(), 'modernui_restore_');

// Seed the temp file with content containing OUR markers
$original = "foo=bar\nbaz=qux\n";
$polluted = $original . "\n" . MODERNUI_MARK_BEGIN . "\nextraCSS=\"x\"\n" . MODERNUI_MARK_END . "\n";
file_put_contents($tmp, $polluted);

// Call modernui_restore_from_backup with no backup present -> should fall through to strip
ob_start();
modernui_restore_from_backup($tmp, 'modernui_strip_block');
ob_end_clean();

$restored = file_get_contents($tmp);
assert(strpos($restored, 'unraid-modernui') === false, 'restore-via-strip should remove our markers; got: ' . var_export($restored, true));
assert(strpos($restored, 'foo=bar') !== false, 'restore-via-strip should preserve unrelated content');

// HTML strip path
$htmlOriginal = "<head>\n<title>x</title>\n</head>\n";
$htmlPolluted = "<head>\n<title>x</title>\n" . MODERNUI_HTML_MARK_BEGIN . "\n<script src=\"y\"></script>\n" . MODERNUI_HTML_MARK_END . "\n</head>\n";
file_put_contents($tmp, $htmlPolluted);

ob_start();
modernui_restore_from_backup($tmp, 'modernui_strip_html_block');
ob_end_clean();

$restored = file_get_contents($tmp);
assert(strpos($restored, 'unraid-modernui') === false, 'HTML restore-via-strip should remove our markers');
assert(strpos($restored, '<title>x</title>') !== false, 'HTML restore-via-strip should preserve other head content');

unlink($tmp);
echo "all uninstall restore tests passed\n";
exit(0);
