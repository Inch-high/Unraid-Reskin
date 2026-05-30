<?php
// Verifies ud-state.php normalizes the Unassigned Devices data into a clean,
// CREDENTIAL-STRIPPED shape. The single most important assertion: the share
// password / user command are NEVER present in the emitted JSON.

define('MODERNUI_TESTING', true);
require_once __DIR__ . '/../../package/include/ud-state.php';

// A samba mount as get_samba_mounts() returns it — including the sensitive
// fields we must drop (pass, user, domain, command, user_command, logfile).
$smb = [[
    'protocol' => 'smb', 'ip' => '192.168.10.99', 'path' => '/Backups',
    'user' => 'alex', 'domain' => 'WORKGROUP', 'pass' => 'SUPERSECRET',
    'share' => 'Backups', 'automount' => 'yes', 'device' => 'SMB_192.168.10.99_Backups',
    'name' => '192.168.10.99_Backups', 'mountpoint' => '/mnt/remotes/192.168.10.99_Backups',
    'fstype' => 'cifs', 'alive' => true, 'read_only' => false, 'smb_share' => true,
    'mounted' => true, 'size' => 1000000000000, 'used' => 400000000000, 'avail' => 600000000000,
    'command' => '/boot/config/plugins/unassigned.devices/scripts/x.sh', 'user_command' => 'rm -rf /',
    'logfile' => '/var/log/x', 'prog_name' => 'x', 'running' => false,
]];
$iso = [[
    'protocol' => 'root', 'mountpoint' => '/mnt/disks/myiso', 'fstype' => 'iso9660',
    'device' => '/boot/x.iso', 'name' => 'myiso', 'mounted' => false, 'pass' => 'n/a',
]];
$disks = [[
    'device' => 'sdz', 'serial' => 'WDC_WD40_ABC123', 'id' => 'WDC WD40EFRX', 'size' => 4000787030016,
    'temp' => '38',
    'partitions' => [[
        'device' => 'sdz1', 'mountpoint' => '/mnt/disks/backup', 'fstype' => 'xfs',
        'mounted' => true, 'pass_through' => false, 'size' => 4000000000000,
        'used' => 1000000000000, 'avail' => 3000000000000, 'target' => 'backup',
    ]],
]];

// UD config (serial-keyed). [Config] is skipped; serials present in $disks are
// not historical; the rest are previous devices.
$config = [
    'Config'                  => ['destructive_mode' => ''],
    'WDC_WD40_ABC123'         => ['unassigned_dev' => 'sdz'],        // currently attached → NOT historical
    'KINGSTON_SNV3S1000G_50026B768724BA9E' => ['unassigned_dev' => 'dev1', 'mountpoint.1' => '/mnt/disks/dev1'],
    'Seagate_ZP2000GM30063_D3300D81'       => ['unassigned_dev' => 'dev2'],
];

$state = modernui_ud_state($disks, $smb, $iso, $config);
$json = json_encode($state);

// --- credential leakage guard (the critical one) ---------------------------
foreach (['SUPERSECRET', 'user_command', 'rm -rf', 'WORKGROUP', '"pass"', '"command"', '"logfile"'] as $forbidden) {
    assert(strpos($json, $forbidden) === false, "ud-state JSON must NOT contain sensitive field/value: {$forbidden}");
}

// --- remotes whitelist ------------------------------------------------------
assert(count($state['remotes']) === 2, 'smb + iso = 2 remotes');
$r = $state['remotes'][0];
assert($r['protocol'] === 'smb', 'protocol kept');
assert($r['name'] === '192.168.10.99_Backups', 'name kept');
assert($r['share'] === 'Backups', 'share kept');
assert($r['mounted'] === true, 'mounted bool');
assert($r['device'] === 'SMB_192.168.10.99_Backups', 'device id kept (for mount/umount)');
assert($r['sizeBytes'] === 1000000000000, 'size mapped');
assert(!array_key_exists('pass', $r), 'pass key absent');
assert(!array_key_exists('user', $r), 'user key absent');
assert(!array_key_exists('command', $r), 'command key absent');

// --- disks + partitions whitelist ------------------------------------------
assert(count($state['disks']) === 1, 'one disk');
$d = $state['disks'][0];
assert($d['serial'] === 'WDC_WD40_ABC123', 'disk serial kept');
assert($d['tempC'] === 38, 'temp parsed int');
assert($d['device'] === 'sdz', 'disk device kept');
assert(count($d['partitions']) === 1, 'one partition');
$p = $d['partitions'][0];
assert($p['device'] === 'sdz1', 'partition device (mount target) kept');
assert($p['mountpoint'] === '/mnt/disks/backup', 'mountpoint kept');
assert($p['mounted'] === true, 'partition mounted bool');
assert($p['fsType'] === 'xfs', 'fstype mapped to fsType');

assert($state['available'] === true, 'state available');

// --- historical / previous devices -----------------------------------------
$hist = $state['historical'];
$histSerials = array_column($hist, 'serial');
assert(!in_array('Config', $histSerials, true), '[Config] section excluded from historical');
assert(!in_array('WDC_WD40_ABC123', $histSerials, true), 'currently-attached disk excluded from historical');
assert(in_array('KINGSTON_SNV3S1000G_50026B768724BA9E', $histSerials, true), 'absent device IS historical');
$k = null; foreach ($hist as $h) if ($h['serial'] === 'KINGSTON_SNV3S1000G_50026B768724BA9E') $k = $h;
assert($k['device'] === 'dev1', 'historical remembers the assigned device name');
assert($k['mountpoint'] === 'dev1', 'historical mountpoint is the basename of mountpoint.1');

echo "all ud-state tests passed\n";
exit(0);
