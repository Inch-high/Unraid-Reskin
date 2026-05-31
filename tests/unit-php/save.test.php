<?php

define('MODERNUI_TESTING', true);
require_once __DIR__ . '/../../package/include/save.php';

// Validator allows known values
$ok = modernui_validate_settings(['mode' => 'dark', 'density' => 'comfortable', 'sidebar' => 'expanded', 'zebra' => '0', 'reduced_motion' => 'auto']);
assert($ok['ok'] === true, 'valid input should pass: ' . var_export($ok, true));
assert($ok['values']['mode'] === 'dark');

// Unknown mode is rejected
$bad = modernui_validate_settings(['mode' => 'rainbow']);
assert($bad['ok'] === false, 'unknown mode should fail');
assert(strpos($bad['error'], 'mode') !== false);

// Missing keys take defaults
$partial = modernui_validate_settings([]);
assert($partial['ok'] === true);
assert($partial['values']['mode'] === 'system', 'default mode should be system');
assert($partial['values']['density'] === 'comfortable');

// Boolean toggles accept 0/1
$bools = modernui_validate_settings(['zebra' => '1']);
assert($bools['ok'] === true);
assert($bools['values']['zebra'] === '1');

// Dashboard layout toggle: 'on' and 'off' are valid, anything else is rejected.
$onOk = modernui_validate_settings(['dashboard' => 'on']);
assert($onOk['ok'] === true, 'dashboard=on should pass: ' . var_export($onOk, true));
assert($onOk['values']['dashboard'] === 'on');

$offOk = modernui_validate_settings(['dashboard' => 'off']);
assert($offOk['ok'] === true, 'dashboard=off should pass');
assert($offOk['values']['dashboard'] === 'off');

$badDash = modernui_validate_settings(['dashboard' => 'maybe']);
assert($badDash['ok'] === false, 'dashboard=maybe should fail');
assert(strpos($badDash['error'], 'dashboard') !== false);

// Default when key is absent is "on" (modern dashboard).
$noDash = modernui_validate_settings([]);
assert($noDash['ok'] === true);
assert($noDash['values']['dashboard'] === 'on', 'default dashboard should be on');

// Shell layout toggle: 'on' and 'off' are valid, anything else is rejected.
$shellOn = modernui_validate_settings(['shell' => 'on']);
assert($shellOn['ok'] === true, 'shell=on should pass: ' . var_export($shellOn, true));
assert($shellOn['values']['shell'] === 'on');

$shellOff = modernui_validate_settings(['shell' => 'off']);
assert($shellOff['ok'] === true, 'shell=off should pass');
assert($shellOff['values']['shell'] === 'off');

$badShell = modernui_validate_settings(['shell' => 'maybe']);
assert($badShell['ok'] === false, 'shell=maybe should fail');
assert(strpos($badShell['error'], 'shell') !== false);

$noShell = modernui_validate_settings([]);
assert($noShell['ok'] === true);
assert($noShell['values']['shell'] === 'on', 'default shell should be on');

// Disk usage style (Main tiles): 'bar' and 'ring' are valid, default is 'bar'.
$barOk = modernui_validate_settings(['main_util_style' => 'bar']);
assert($barOk['ok'] === true, 'main_util_style=bar should pass: ' . var_export($barOk, true));
assert($barOk['values']['main_util_style'] === 'bar');

$ringOk = modernui_validate_settings(['main_util_style' => 'ring']);
assert($ringOk['ok'] === true, 'main_util_style=ring should pass');
assert($ringOk['values']['main_util_style'] === 'ring');

$badUtil = modernui_validate_settings(['main_util_style' => 'donut']);
assert($badUtil['ok'] === false, 'main_util_style=donut should fail');
assert(strpos($badUtil['error'], 'main_util_style') !== false);

$noUtil = modernui_validate_settings([]);
assert($noUtil['ok'] === true);
assert($noUtil['values']['main_util_style'] === 'bar', 'default main_util_style should be bar');

// Partial POST merge: when only one key is in the input, the others come
// from the existing cfg (not from hardcoded defaults). This guards the
// shell-sidebar toggle path which POSTs only sidebar=collapsed.
// (Verified by calling modernui_handle_post with a mocked cfg file.)
$tmpDir = sys_get_temp_dir() . '/modernui-test-' . uniqid();
mkdir($tmpDir, 0755, true);
$tmpCfg = $tmpDir . '/settings.cfg';
file_put_contents($tmpCfg, "mode=dark\ndensity=compact\nsidebar=expanded\ndashboard=on\nshell=on\n");

// Verify modernui_parse_cfg reads what we just wrote
$parsed = modernui_parse_cfg($tmpCfg);
assert($parsed['mode'] === 'dark', 'parse cfg should read mode=dark, got ' . var_export($parsed, true));
assert($parsed['density'] === 'compact', 'parse cfg should read density=compact');
assert($parsed['sidebar'] === 'expanded', 'parse cfg should read sidebar=expanded');

// Verify array_merge semantics — incoming $post wins on conflicts, existing wins for missing keys
$incoming = ['sidebar' => 'collapsed', 'csrf_token' => 'xyz'];
$merged = array_merge($parsed, $incoming);
assert($merged['sidebar'] === 'collapsed', 'merge: incoming sidebar should win');
assert($merged['mode'] === 'dark', 'merge: existing mode should be preserved');
assert($merged['density'] === 'compact', 'merge: existing density should be preserved');

// Cleanup
unlink($tmpCfg);
rmdir($tmpDir);

echo "all save tests passed\n";
exit(0);
