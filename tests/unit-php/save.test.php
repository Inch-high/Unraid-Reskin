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
assert($onOk['ok'] === true, "dashboard=on should pass: " . var_export($onOk, true));
assert($onOk['values']['dashboard'] === 'on');

$offOk = modernui_validate_settings(['dashboard' => 'off']);
assert($offOk['ok'] === true, "dashboard=off should pass");
assert($offOk['values']['dashboard'] === 'off');

$badDash = modernui_validate_settings(['dashboard' => 'maybe']);
assert($badDash['ok'] === false, "dashboard=maybe should fail");
assert(strpos($badDash['error'], 'dashboard') !== false);

// Default when key is absent is "on" (modern dashboard).
$noDash = modernui_validate_settings([]);
assert($noDash['ok'] === true);
assert($noDash['values']['dashboard'] === 'on', "default dashboard should be on");

echo "all save tests passed\n";
exit(0);
