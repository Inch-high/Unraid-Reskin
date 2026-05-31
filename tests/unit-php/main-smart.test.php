<?php

// TDD for main-smart.php — the per-device SMART endpoint. Exercises the pure
// helpers (name→node resolution, controller-type arg building, smartctl JSON
// normalization) without ever shelling out; smartctl output is fed from the
// captured fixtures in src/ts/main/__fixtures__/smart/.

define('MODERNUI_TESTING', true);
require_once __DIR__ . '/../../package/include/main-smart.php';

$fix = realpath(__DIR__ . '/../../src/ts/main/__fixtures__/smart');
$load = fn (string $name) => json_decode(file_get_contents($fix . '/' . $name), true);

// --- modernui_smart_resolve: never trust the client --------------------------
$disks = [
    'disk1'  => ['device' => 'sdk', 'id' => 'MODEL_SER', 'type' => 'Data', 'status' => 'DISK_OK', 'transport' => 'ata'],
    'parity' => ['device' => 'sdh', 'id' => 'PAR_SER', 'type' => 'Parity', 'status' => 'DISK_OK'],
    'flash'  => ['device' => 'sda', 'id' => 'USB_X', 'type' => 'Flash'],
    'disk9'  => ['device' => '', 'id' => 'X', 'type' => 'Data', 'status' => 'DISK_NP'],
    'evil'   => ['device' => '../../etc/passwd', 'id' => 'E', 'type' => 'Data', 'status' => 'DISK_OK'],
];

$r = modernui_smart_resolve($disks, 'disk1');
assert($r['status'] === 'ok', 'disk1 resolves');
assert($r['node'] === '/dev/sdk', 'disk1 → /dev/sdk; got ' . ($r['node'] ?? 'null'));
assert($r['id'] === 'MODEL_SER', 'disk1 id passed through');

assert(modernui_smart_resolve($disks, 'flash')['status'] === 'flash', 'flash → unsupported');
assert(modernui_smart_resolve($disks, 'disk9')['status'] === 'absent', 'DISK_NP → absent');
assert(modernui_smart_resolve($disks, 'nope')['status'] === 'unknown', 'unknown name rejected');
assert(modernui_smart_resolve($disks, '../etc')['status'] === 'unknown', 'path-traversal name rejected by allowlist');
assert(modernui_smart_resolve($disks, 'Disk1')['status'] === 'unknown', 'uppercase rejected by allowlist');
// basename() neutralizes a traversal sneaked into disks.ini's device field.
$evil = modernui_smart_resolve($disks, 'evil');
assert($evil['status'] === 'ok' && $evil['node'] === '/dev/passwd', 'device path is basename-d; got ' . ($evil['node'] ?? 'null'));

// --- modernui_smart_build_type_args: untrusted operator config ---------------
assert(modernui_smart_build_type_args(['ID' => ['smType' => '-1']], 'ID') === [], '"-1" → autodetect (no args)');
assert(modernui_smart_build_type_args(['ID' => ['smType' => '']], 'ID') === [], 'empty → autodetect');
assert(modernui_smart_build_type_args(['ID' => ['smType' => '-d sat']], 'ID') === ['-d', 'sat'], '"-d sat" → tokens');
assert(
    modernui_smart_build_type_args(['ID' => ['smType' => '-d sat; rm -rf /']], 'ID') === [],
    'injection attempt drops the whole override'
);
assert(
    modernui_smart_build_type_args(['ID' => ['smType' => '-d megaraid', 'smPort1' => '0']], 'ID') === ['-d', 'megaraid,0'],
    'controller port glued onto the -d token'
);

// --- modernui_smart_normalize: healthy ATA -----------------------------------
$h = modernui_smart_normalize($load('ata-healthy.json'), 0);
assert($h['supported'] === true && $h['standby'] === false, 'healthy: supported, not standby');
assert($h['class'] === 'ata', 'protocol ATA → class ata');
assert($h['health']['passed'] === true && $h['health']['failed'] === false, 'healthy passed');
assert($h['identity']['model'] === 'ST12000VN0008-2YS101', 'model parsed');
assert($h['identity']['serial'] === 'ZRT0Q2AK', 'serial parsed');
assert($h['identity']['capacityBytes'] === 12000138625024, 'capacity parsed');
assert($h['identity']['rotationRate'] === 7200, 'rotation rate parsed');
assert($h['temperatureC'] === 38, 'temperature parsed');
assert($h['powerOnHours'] === 17453, 'power-on hours parsed');
assert(count($h['attributes']) === 2, 'two attributes; got ' . count($h['attributes']));
assert($h['attributes'][0]['id'] === 5 && $h['attributes'][0]['raw'] === 0, 'attr 5 raw 0');
assert($h['attributes'][0]['whenFailed'] === null, 'empty when_failed → null');
assert($h['selfTest']['status']['inProgress'] === false, 'no test in progress');
assert(count($h['selfTest']['log']) === 1, 'one self-test log row');
assert($h['errorLog']['count'] === 0, 'no errors');
assert($h['nvme'] === null, 'ATA has no nvme block');

// --- failing ATA: bit3 of exit code = FAILED, when_failed=now ----------------
$f = modernui_smart_normalize($load('ata-failing.json'), 8);
assert($f['health']['failed'] === true, 'smart_status passed=false → failed');
assert($f['attributes'][0]['whenFailed'] === 'now', 'when_failed "now" surfaced');
assert($f['errorLog']['count'] === 5, 'error count parsed');
assert(count($f['errorLog']['entries']) === 1, 'error entry parsed');
// Even with smart_status absent, exit bit3 alone marks failure.
$bitOnly = modernui_smart_normalize(['device' => ['protocol' => 'ATA']], 8);
assert($bitOnly['health']['failed'] === true, 'exit bit3 alone → failed');

// --- NVMe: no attribute table, health block instead --------------------------
$n = modernui_smart_normalize($load('nvme.json'), 0);
assert($n['class'] === 'nvme', 'protocol NVMe → class nvme');
assert($n['attributes'] === [], 'nvme has no ATA attributes');
assert($n['nvme']['percentageUsed'] === 3, 'nvme wear parsed');
assert($n['nvme']['availableSpare'] === 100, 'nvme spare parsed');
assert($n['temperatureC'] === 41, 'nvme temperature parsed');

// --- self-test in progress ---------------------------------------------------
$st = modernui_smart_normalize($load('selftest-running.json'), 0);
assert($st['selfTest']['status']['inProgress'] === true, 'remaining_percent present → in progress');
assert($st['selfTest']['status']['remainingPercent'] === 40, 'remaining percent parsed');

// --- standby: exit bit1 + no data, never woke the disk -----------------------
$sb = modernui_smart_normalize([], 2);
assert($sb['standby'] === true && $sb['reason'] === 'standby', 'exit bit1 + empty → standby');
assert($sb['supported'] === true, 'standby is still a supported device');

// --- defensive parsing: missing keys must not fatal --------------------------
$bare = modernui_smart_normalize(['device' => ['protocol' => 'ATA'], 'smart_status' => ['passed' => true]], 0);
assert($bare['temperatureC'] === null, 'missing temperature → null');
assert($bare['powerOnHours'] === null, 'missing power_on_time → null');
assert($bare['attributes'] === [], 'missing attribute table → []');

echo "main-smart: all assertions passed\n";
