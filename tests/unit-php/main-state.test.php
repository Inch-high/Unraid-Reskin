<?php
// TDD for main-state.php — the read-only disks.ini + var.ini → MainPageState
// JSON snapshot. Feeds the captured fixtures and asserts the typed shape.

define('MODERNUI_TESTING', true);
require_once __DIR__ . '/../../package/include/main-state.php';

$fix = realpath(__DIR__ . '/../../src/ts/main/__fixtures__');
$disks = modernui_parse_ini_sections($fix . '/disks.ini.sample');
$var   = modernui_parse_var_ini($fix . '/var.ini.sample');

// Sanity on the parser itself.
assert(isset($disks['parity']), 'parser must produce a [parity] section');
assert($disks['disk1']['id'] === 'ST12000VN0008-2YS101_ZRT0Q2AK', 'parser must read quoted values');

$state = modernui_main_state($disks, $var, 'TESTCSRF');

// --- array (parity + data) --------------------------------------------------
$array = $state['array'];
assert(count($array['devices']) === 14, 'array must have 2 parity + 12 data = 14 devices; got ' . count($array['devices']));

$byName = [];
foreach ($array['devices'] as $d) $byName[$d['name']] = $d;

assert($byName['parity']['role'] === 'parity', 'parity role');
assert($byName['parity']['fsType'] === null, 'parity has no filesystem');
assert($byName['disk1']['role'] === 'data', 'disk1 role');

// model + serial split (the user-requested 1:1 field)
assert($byName['disk1']['model'] === 'ST12000VN0008-2YS101', 'model split: ' . $byName['disk1']['model']);
assert($byName['disk1']['serial'] === 'ZRT0Q2AK', 'serial split: ' . $byName['disk1']['serial']);

// state mapping
assert($byName['disk1']['encrypted'] === true, 'disk1 is luks:xfs → encrypted');
assert($byName['disk1']['luksState'] === 1, 'disk1 luksState=1');
assert($byName['disk1']['spunDown'] === true, 'disk1 spundown=1');
assert($byName['disk1']['spin'] === 'standby', 'spun-down → standby');
assert($byName['disk1']['tempC'] === null, "temp '*' → null");
assert($byName['disk1']['status'] === 'ok', 'DISK_OK → ok');
assert($byName['disk1']['orb'] === 'grey', 'green-blink → grey orb');
assert($byName['disk1']['numReads'] === 1611274, 'numReads parsed');
assert($byName['disk1']['numErrors'] === 0, 'numErrors parsed');

// sizes (disks.ini values are 1K units → bytes = ×1024)
assert($byName['disk1']['sizeBytes'] === 11718885324 * 1024, 'size ×1024 to bytes');
assert($byName['disk1']['utilizationPct'] !== null && $byName['disk1']['utilizationPct'] > 0, 'utilization computed');
assert($byName['disk1']['detailHref'] === '/Main/Device?name=disk1', 'detail link');

// --- pools ------------------------------------------------------------------
assert(count($state['pools']) === 1, 'one cache pool; got ' . count($state['pools']));
$pool = $state['pools'][0];
assert($pool['id'] === 'cache', 'pool leader name');
assert($pool['fsType'] === 'luks:zfs', 'pool fsType');
assert($pool['fsProfile'] === 'raidz1', 'pool profile');
assert(count($pool['devices']) === 4, 'cache pool has 4 members; got ' . count($pool['devices']));
$cacheLeader = $pool['devices'][0];
assert($cacheLeader['name'] === 'cache', 'first pool device is the leader');
assert($cacheLeader['tempC'] === 42, 'nvme temp parsed as int');
assert($cacheLeader['spunDown'] === false, 'nvme spundown=0 → active');
assert($cacheLeader['role'] === 'pool', 'cache role mapped to pool');

// --- boot -------------------------------------------------------------------
assert($state['boot'] !== null, 'boot device present');
assert($state['boot']['role'] === 'flash', 'flash role');
assert($state['boot']['fsType'] === 'vfat', 'flash fsType');

// --- operation (raw fields; primary/busy added client-side by deriveOperation) ---
$op = $state['operation'];
assert($op['mdState'] === 'STARTED', 'mdState passthrough');
assert($op['fsState'] === 'Started', 'fsState passthrough');
assert($op['protected'] === true, 'green-on → protected');
assert($op['moverEnabled'] === true, "shareUser='e' → mover enabled");
assert($op['configValid'] === 'yes', 'configValid passthrough');
assert($op['counts']['disks'] === 14, 'mdNumDisks');
assert(!isset($op['primary']), 'primary is derived client-side (deriveOperation), NOT server-side');

// --- encryption (unlocked: all luksState=1, keyfile path not present on test box) ---
$enc = $op['encryption'];
assert($enc['required'] === true, 'array has luks members');
assert($enc['mode'] === 'unlocked', 'all luksState=1 → unlocked (no key prompt)');
assert(in_array('cache', $enc['poolNames'], true), 'pool names listed for Report.php precheck');

// --- parity -----------------------------------------------------------------
$par = $state['parity'];
assert($par['running'] === false, 'mdResync=0 → not running');
assert($par['errors'] === 0, 'sbSyncErrs=0');

// --- top-level --------------------------------------------------------------
assert($state['csrfToken'] === 'TESTCSRF', 'csrf passthrough');
assert($state['serverVersion'] === '7.3.1', 'version passthrough');

// JSON-encodable (the HTTP path emits this).
$json = json_encode($state);
assert(is_string($json) && strlen($json) > 0, 'state must be json_encodable');

// --- encryption modes against the disks-enc-*.ini fixtures ------------------
foreach (['missing' => 'missing-key', 'wrong' => 'wrong-key', 'enter-new' => 'enter-new'] as $file => $mode) {
    $encDisks = modernui_parse_ini_sections($fix . "/disks-enc-{$file}.ini");
    $varStopped = modernui_parse_var_ini($fix . '/var-stopped.ini');
    $s = modernui_main_state($encDisks, $varStopped, '');
    assert($s['operation']['encryption']['mode'] === $mode,
        "disks-enc-{$file}.ini → encryption mode '{$mode}'; got '" . $s['operation']['encryption']['mode'] . "'");
}

echo "all main-state tests passed\n";
exit(0);
