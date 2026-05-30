<?php
// Read-only snapshot of the Unassigned Devices plugin state, normalized into a
// clean, CREDENTIAL-STRIPPED JSON shape for the modern /Main UD card.
//
// We require the plugin's own lib.php (its data layer) and call its high-level
// functions — same pattern as docker-state.php wrapping DockerClient. We then
// whitelist only display-safe fields. CRITICAL: get_samba_mounts() returns the
// share PASSWORD (`pass`) and the user-defined `command`/`user_command`; these
// MUST NOT be emitted. Only the whitelist below is ever serialized.
//
// Read-only: no mounting/formatting here — actions go straight to the plugin's
// own endpoint (POST .../UnassignedDevices.php {action, device}).

require_once __DIR__ . '/helpers.php';

const MODERNUI_UD_LIB  = '/usr/local/emhttp/plugins/unassigned.devices/include/lib.php';
const MODERNUI_UD_PAGE = '/usr/local/emhttp/plugins/unassigned.devices/UnassignedDevices.page';

function modernui_ud_to_int($v): ?int {
    if ($v === null || $v === '' || !is_numeric($v)) return null;
    return (int)$v;
}

function modernui_ud_to_bool($v): bool {
    return $v === true || $v === 1 || $v === '1' || $v === 'yes' || $v === 'true';
}

// Whitelist a remote SMB/NFS/ISO mount — display-safe fields ONLY. Never copy
// pass / user / domain / command / user_command / logfile / prog_name.
function modernui_ud_remote(array $m): array {
    return [
        'protocol'   => (string)($m['protocol'] ?? ''),       // smb | nfs | root (iso)
        'name'       => (string)($m['name'] ?? ''),
        'ip'         => (string)($m['ip'] ?? ''),
        'share'      => (string)($m['share'] ?? ''),
        'mountpoint' => (string)($m['mountpoint'] ?? ''),
        'fsType'     => (string)($m['fstype'] ?? ''),
        'device'     => (string)($m['device'] ?? ''),         // identifier for mount/umount
        'mounted'    => modernui_ud_to_bool($m['mounted'] ?? false),
        'alive'      => modernui_ud_to_bool($m['alive'] ?? false),
        'readOnly'   => modernui_ud_to_bool($m['read_only'] ?? false),
        'sizeBytes'  => modernui_ud_to_int($m['size'] ?? null),
        'usedBytes'  => modernui_ud_to_int($m['used'] ?? null),
        'freeBytes'  => modernui_ud_to_int($m['avail'] ?? null),
    ];
}

// Whitelist one partition of an unassigned disk.
function modernui_ud_partition(array $p): array {
    return [
        'device'     => (string)($p['device'] ?? ''),         // e.g. sdX1 — identifier for mount/umount
        'mountpoint' => (string)($p['mountpoint'] ?? ''),
        'fsType'     => (string)($p['fstype'] ?? ''),
        'label'      => (string)($p['label'] ?? ($p['target'] ?? '')),
        'mounted'    => modernui_ud_to_bool($p['mounted'] ?? false),
        'passThrough'=> modernui_ud_to_bool($p['pass_through'] ?? false),
        'sizeBytes'  => modernui_ud_to_int($p['size'] ?? null),
        'usedBytes'  => modernui_ud_to_int($p['used'] ?? null),
        'freeBytes'  => modernui_ud_to_int($p['avail'] ?? null),
    ];
}

// Whitelist one unassigned disk + its partitions.
function modernui_ud_disk(array $d): array {
    $parts = [];
    foreach ((array)($d['partitions'] ?? []) as $p) {
        if (is_array($p)) $parts[] = modernui_ud_partition($p);
    }
    return [
        'device'     => (string)($d['device'] ?? ''),         // sdX
        'serial'     => (string)($d['serial'] ?? ''),
        'model'      => (string)($d['id'] ?? ($d['device'] ?? '')),
        'sizeBytes'  => modernui_ud_to_int($d['size'] ?? null),
        'tempC'      => modernui_ud_to_int($d['temp'] ?? null),
        'partitions' => $parts,
    ];
}

// Build the normalized state from the plugin's data functions. Pass the raw
// arrays in for testability (the HTTP path reads them live).
function modernui_ud_state(array $rawDisks, array $smb, array $iso): array {
    $disks = [];
    foreach ($rawDisks as $d) if (is_array($d)) $disks[] = modernui_ud_disk($d);
    $remotes = [];
    foreach ($smb as $m) if (is_array($m)) $remotes[] = modernui_ud_remote($m);
    foreach ($iso as $m) if (is_array($m)) $remotes[] = modernui_ud_remote($m);
    return ['available' => true, 'disks' => $disks, 'remotes' => $remotes];
}

// True only when the plugin is installed AND our suppression overlay is the
// active UnassignedDevices.page (so the stock section is hidden and rendering
// our card won't duplicate it). If UD reclaimed its page (plugin update), the
// marker is gone → available:false → the card hides and stock section shows.
function modernui_ud_available(): bool {
    if (!is_file(MODERNUI_UD_LIB)) return false;
    if (!is_file(MODERNUI_UD_PAGE)) return false;
    $page = @file_get_contents(MODERNUI_UD_PAGE);
    return is_string($page) && strpos($page, 'modernui') !== false;
}

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json');
    if (is_file('/boot/config/plugins/unraid-modernui/disabled')
        || is_file('/boot/config/plugins/unraid-modernui/safemode')
        || !modernui_ud_available()) {
        echo json_encode(['available' => false, 'disks' => [], 'remotes' => []]);
        return;
    }
    require_once MODERNUI_UD_LIB;
    $disks = function_exists('get_all_disks_info') ? (array)get_all_disks_info() : [];
    $smb   = function_exists('get_samba_mounts')   ? (array)get_samba_mounts()   : [];
    $iso   = function_exists('get_iso_mounts')     ? (array)get_iso_mounts()     : [];
    echo json_encode(modernui_ud_state($disks, $smb, $iso));
}
