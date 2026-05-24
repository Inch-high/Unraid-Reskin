<?php
// Guard install.php's CLI runner so requiring it here does not try to touch /boot or /usr/local on Windows.
define('MODERNUI_TESTING', true);
require_once __DIR__ . '/../../package/include/install.php';

// Test strip_block
$with = "foo=bar\n\n" . MODERNUI_MARK_BEGIN . "\nextraCSS=\"x\"\n" . MODERNUI_MARK_END . "\n";
$stripped = modernui_strip_block($with);
assert(strpos($stripped, 'unraid-modernui') === false, 'strip_block should remove markers');
assert(strpos($stripped, 'foo=bar') !== false, 'strip_block should preserve unrelated content');

$plain = "foo=bar\nbaz=qux\n";
$result = modernui_strip_block($plain);
assert($result === $plain, 'strip_block on input without markers is a no-op');

// Test strip_html_block
$html = "<head>\n<title>x</title>\n" . MODERNUI_HTML_MARK_BEGIN . "\n<script src=\"y\"></script>\n" . MODERNUI_HTML_MARK_END . "\n</head>\n";
$stripped = modernui_strip_html_block($html);
assert(strpos($stripped, 'unraid-modernui') === false, 'strip_html_block should remove HTML markers');
assert(strpos($stripped, '<title>x</title>') !== false, 'strip_html_block should preserve other head content');

echo "all install strip tests passed\n";
exit(0);
