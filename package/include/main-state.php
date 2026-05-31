<?php

// One-shot, READ-ONLY snapshot of the /Main page state.
//
// Parses /var/local/emhttp/disks.ini (per-device) and var.ini (array/parity
// state machine) into the typed MainPageState the front-end (modernui-main.js)
// consumes. The page fetches this once on boot; live updates afterwards arrive
// via Unraid's existing nchan channels (device_list/disk_load/parity_list).
//
// INVARIANTS (enforced by CI grep): zero external HTTP, zero shelling, zero
// emcmd. We never WRITE disks.ini/var.ini. Every state-changing action is a
// POST to Unraid's stock endpoints from the front-end (see src/ts/main/actions.ts).
//
// NOTE: operation.primary is intentionally NOT computed here. deriveOperation()
// (src/ts/main/derive.ts) is the single source of truth for the Start/Stop
// button label/enabled/gating; PHP only emits the raw var.ini fields and the
// TS layer derives the verdict. operation.busy likewise comes from /sub/mymonitor.

require_once __DIR__ . '/helpers.php';   // modernui_parse_cfg, modernui_is_disabled

const MODERNUI_DISKS_INI = '/var/local/emhttp/disks.ini';
const MODERNUI_VAR_INI   = '/var/local/emhttp/var.ini';

// Parse an Unraid sectioned INI (disks.ini): `["name"]` headers + key="value".
// PHP's parse_ini_file mangles quoted section names and some values, so we
// roll a small, predictable parser.
function modernui_parse_ini_sections(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $out = [];
    $section = null;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $t = trim($line);
        if ($t === '' || $t[0] === ';' || $t[0] === '#') {
            continue;
        }
        if ($t[0] === '[') {
            // ["parity"] or [parity]
            $name = trim($t, '[]');
            $name = trim($name, "\"'");
            $section = $name;
            $out[$section] = [];
            continue;
        }
        $pos = strpos($t, '=');
        if ($pos === false || $section === null) {
            continue;
        }
        $key = trim(substr($t, 0, $pos));
        $val = trim(substr($t, $pos + 1));
        $val = trim($val, "\"'");
        $out[$section][$key] = $val;
    }
    return $out;
}

// Parse a flat quoted INI (var.ini): key="value" lines, no sections. Unlike
// modernui_parse_cfg (built for the unquoted settings.cfg), this strips the
// surrounding quotes Unraid writes around every var.ini value.
function modernui_parse_var_ini(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $out = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $t = trim($line);
        if ($t === '' || $t[0] === ';' || $t[0] === '#' || $t[0] === '[') {
            continue;
        }
        $pos = strpos($t, '=');
        if ($pos === false) {
            continue;
        }
        $key = trim(substr($t, 0, $pos));
        $val = trim(trim(substr($t, $pos + 1)), "\"'");
        if ($key !== '') {
            $out[$key] = $val;
        }
    }
    return $out;
}

function modernui_int_or_null($v): ?int
{
    if ($v === null) {
        return null;
    }
    $s = (string)$v;
    if ($s === '' || !is_numeric($s)) {
        return null;
    }
    return (int)$s;
}

// disks.ini sizes are in 1K units → bytes.
function modernui_kib_to_bytes($v): ?int
{
    $n = modernui_int_or_null($v);
    return $n === null ? null : $n * 1024;
}

// Split disks.ini `id` ("MODEL_SERIAL") on the LAST underscore.
function modernui_split_model_serial(string $id): array
{
    $pos = strrpos($id, '_');
    if ($pos === false) {
        return [$id, ''];
    }
    return [substr($id, 0, $pos), substr($id, $pos + 1)];
}

function modernui_map_role(string $type): string
{
    switch ($type) {
        case 'Parity': return 'parity';
        case 'Cache':  return 'pool';
        case 'Flash':  return 'flash';
        default:       return 'data';   // 'Data' and anything else
    }
}

// status (+ fsStatus) → our DeviceStatus.
function modernui_map_status(string $status, string $fsStatus): string
{
    if (strpos($status, '_MISSING') !== false) {
        return 'missing';
    }
    if ($status === 'DISK_DSBL' || $status === 'DISK_NP_DSBL') {
        return 'disabled';
    }
    if ($status === 'DISK_INVALID') {
        return 'invalid';
    }
    if ($status === 'DISK_WRONG') {
        return 'wrong';
    }
    if ($status === 'DISK_NEW') {
        return 'new';
    }
    if ($status === 'DISK_NP') {
        return 'notpresent';
    }
    if ($fsStatus !== '' && stripos($fsStatus, 'Unmountable') === 0) {
        return 'unmountable';
    }
    return 'ok';
}

// disks.ini `color` (green-on/green-blink/yellow-on/yellow-blink/red-*) → orb.
// *-blink renders grey (present-but-stopped/spun-down) per status_indicator().
function modernui_map_orb(string $color): string
{
    if (strpos($color, 'blink') !== false) {
        return 'grey';
    }
    if (strpos($color, 'green') === 0) {
        return 'green';
    }
    if (strpos($color, 'yellow') === 0) {
        return 'yellow';
    }
    if (strpos($color, 'red') === 0) {
        return 'red';
    }
    return 'grey';
}

// Conservative SMART health from disks.ini. The authoritative thumbs status is
// pushed by emhttp into /sub/devices HTML; disks.ini only carries the user's
// warning/critical thresholds + error counts. We surface a best-effort value
// and refine from /sub/devices in the live-update layer if needed.
function modernui_map_smart(array $d): string
{
    if (trim((string)($d['critical'] ?? '')) !== '') {
        return 'failed';
    }
    $errors = modernui_int_or_null($d['numErrors'] ?? null) ?? 0;
    if ($errors > 0 || trim((string)($d['warning'] ?? '')) !== '') {
        return 'warning';
    }
    return 'healthy';
}

// Device class for the tile icon. nvme by kernel name, usb for the flash/boot
// device, otherwise the rotational flag distinguishes SSD from HDD. A missing
// or unreadable sysfs read defaults to 'hdd' so a spinning disk is never
// mislabeled as solid-state. $sysfsBase is injectable so the rotational→ssd
// branch is unit-testable off a real /sys (tests point it at a fixture dir).
function modernui_map_device_type(string $role, string $linuxDevice, string $sysfsBase = '/sys/block'): string
{
    if ($role === 'flash') {
        return 'usb';
    }
    if (strncmp($linuxDevice, 'nvme', 4) === 0) {
        return 'nvme';
    }
    $dev = basename($linuxDevice);
    if ($dev !== '') {
        $path = "{$sysfsBase}/{$dev}/queue/rotational";
        if (is_readable($path)) {
            if (trim((string)@file_get_contents($path)) === '0') {
                return 'ssd';
            }
        }
    }
    return 'hdd';
}

function modernui_normalize_device(string $name, array $d): array
{
    $id = (string)($d['id'] ?? '');
    [$model, $serial] = modernui_split_model_serial($id);
    $fsType = isset($d['fsType']) && $d['fsType'] !== '' ? (string)$d['fsType'] : null;
    $temp = (string)($d['temp'] ?? '');
    $tempC = ($temp === '' || $temp === '*' || !is_numeric($temp)) ? null : (int)$temp;
    $fsSize = modernui_kib_to_bytes($d['fsSize'] ?? null);
    $fsUsed = modernui_kib_to_bytes($d['fsUsed'] ?? null);
    $spunDown = (string)($d['spundown'] ?? '0') === '1';
    $role = modernui_map_role((string)($d['type'] ?? ''));
    $linuxDevice = (string)($d['device'] ?? '');

    return [
        'name'           => $name,
        'role'           => $role,
        'linuxDevice'    => $linuxDevice,
        'deviceType'     => modernui_map_device_type($role, $linuxDevice),
        'model'          => $model,
        'serial'         => $serial,
        'status'         => modernui_map_status((string)($d['status'] ?? ''), (string)($d['fsStatus'] ?? '')),
        'spin'           => $spunDown ? 'standby' : 'active',
        'spunDown'       => $spunDown,
        'tempC'          => $tempC,
        'numReads'       => modernui_int_or_null($d['numReads'] ?? null),
        'numWrites'      => modernui_int_or_null($d['numWrites'] ?? null),
        'numErrors'      => modernui_int_or_null($d['numErrors'] ?? null),
        'fsType'         => $fsType,
        'encrypted'      => $fsType !== null && strpos($fsType, 'luks:') === 0,
        'luksState'      => modernui_int_or_null($d['luksState'] ?? null),
        'sizeBytes'      => modernui_kib_to_bytes($d['size'] ?? null),
        'fsSizeBytes'    => $fsSize,
        'fsUsedBytes'    => $fsUsed,
        'fsFreeBytes'    => modernui_kib_to_bytes($d['fsFree'] ?? null),
        'utilizationPct' => ($fsSize && $fsSize > 0 && $fsUsed !== null) ? round($fsUsed / $fsSize * 100, 1) : null,
        'color'          => (string)($d['color'] ?? ''),
        'orb'            => modernui_map_orb((string)($d['color'] ?? '')),
        'smart'          => modernui_map_smart($d),
        'detailHref'     => '/Main/Device?name=' . rawurlencode($name),
    ];
}

// Derive the encrypted-array key-entry state (reproduces ArrayOperation.page
// lines 19–50 / check_encryption()). $disks is the parsed disks.ini sections.
function modernui_derive_encryption(array $disks, array $var, array $poolNames): array
{
    $defaultFsType = (string)($var['defaultFsType'] ?? '');
    $forced = $present = $missing = $wrong = false;
    foreach ($disks as $d) {
        $fsType = (string)($d['fsType'] ?? '');
        $luks = strpos($fsType, 'luks:') === 0;
        $auto = $fsType === 'auto';
        if ($luks || ($auto && strpos($defaultFsType, 'luks:') === 0)) {
            $forced = true;
        }
        if ($luks || $auto) {
            switch (modernui_int_or_null($d['luksState'] ?? null)) {
                case 1: $present = true;
                    break;
                case 2: $missing = true;
                    break;
                case 3: $wrong = true;
                    break;
            }
        }
    }
    $encrypt = $forced || $present || $missing || $wrong;
    if ($forced && ($present || $missing || $wrong)) {
        $forced = false;
    }

    if (!$encrypt) {
        $mode = 'none';
    } elseif ($forced) {
        $mode = 'enter-new';
    } elseif ($missing) {
        $mode = 'missing-key';
    } elseif ($wrong) {
        $mode = 'wrong-key';
    } else {
        $mode = 'unlocked';
    }

    return [
        'required'       => $encrypt,
        'mode'           => $mode,
        'keyfilePresent' => isset($var['luksKeyfile']) && $var['luksKeyfile'] !== '' && is_file((string)$var['luksKeyfile']),
        'allowReformat'  => false,   // user toggles client-side; never default-on
        'poolNames'      => array_values($poolNames),
    ];
}

function modernui_parity_state(array $var): array
{
    $resync = modernui_int_or_null($var['mdResync'] ?? null) ?? 0;
    $pos    = modernui_kib_to_bytes($var['mdResyncPos'] ?? null);
    $size   = modernui_kib_to_bytes($var['mdResyncSize'] ?? null);
    $action = strtolower((string)($var['mdResyncAction'] ?? ''));
    $verb = null;
    if (strpos($action, 'recon') !== false) {
        $verb = 'recon';
    } elseif (strpos($action, 'clear') !== false) {
        $verb = 'clear';
    } elseif (strpos($action, 'check') !== false) {
        $verb = 'check';
    }

    $synced  = modernui_int_or_null($var['sbSynced'] ?? null);
    $synced2 = modernui_int_or_null($var['sbSynced2'] ?? null);
    $errors  = modernui_int_or_null($var['sbSyncErrs'] ?? null);
    $last = null;
    if ($synced2 && $synced2 > 0) {
        $duration = ($synced && $synced > 0 && $synced2 >= $synced) ? ($synced2 - $synced) : 0;
        $last = [
            'date'         => gmdate('Y-m-d H:i', $synced2),
            'durationText' => $duration > 0 ? gmdate('H\h i\m s\s', $duration) : '',
            'speed'        => '',
            'errors'       => $errors ?? 0,
        ];
    }

    return [
        'action'          => $verb,
        'correcting'      => (modernui_int_or_null($var['mdResyncCorr'] ?? null) ?? 0) > 0,
        'running'         => $resync > 0,
        'paused'          => false,   // pause lives in stamps.ini / nchan; filled client-side
        'posBytes'        => $pos,
        'sizeBytes'       => $size,
        'pct'             => ($size && $size > 0 && $pos !== null) ? round($pos / $size * 100, 1) : null,
        'speed'           => null,    // computed in the parity panel from live deltas
        'errors'          => $errors,
        'corrected'       => modernui_int_or_null($var['mdResyncCorr'] ?? null),
        'last'            => $last,
        'scheduleEnabled' => true,    // schedule lives in dynamix cron cfg; refined later
    ];
}

function modernui_main_state(array $disks, array $var, string $csrf = ''): array
{
    $arrayDevices = [];
    $poolDevicesByOwner = [];   // leaderName => [devices]
    $poolLeaders = [];          // ordered leader names
    $boot = null;

    // First pass: classify.
    foreach ($disks as $name => $d) {
        $type = (string)($d['type'] ?? '');
        $dev = modernui_normalize_device($name, $d);
        if ($type === 'Flash') {
            $boot = $dev;
        } elseif ($type === 'Cache') {
            // Pool leader = a Cache device carrying an FS block (fsType set).
            if (isset($d['fsType']) && $d['fsType'] !== '') {
                $poolLeaders[$name] = $d;
                $poolDevicesByOwner[$name] = $poolDevicesByOwner[$name] ?? [];
            }
        } else {
            // Parity + Data.
            $arrayDevices[] = ['idx' => modernui_int_or_null($d['idx'] ?? null) ?? 9999, 'dev' => $dev];
        }
    }

    // Assign cache members to their leader (leader itself first).
    foreach ($disks as $name => $d) {
        if ((string)($d['type'] ?? '') !== 'Cache') {
            continue;
        }
        $owner = null;
        foreach (array_keys($poolLeaders) as $leader) {
            if ($name === $leader || preg_match('/^' . preg_quote($leader, '/') . '\d+$/', $name)) {
                $owner = $leader;
                break;
            }
        }
        if ($owner === null) {
            continue;
        }   // orphan member without a detectable leader
        $poolDevicesByOwner[$owner][] = [
            'idx' => modernui_int_or_null($d['idx'] ?? null) ?? 9999,
            'dev' => modernui_normalize_device($name, $d),
            'leader' => ($name === $owner),
        ];
    }

    // Order array: parity first, then data, each by idx.
    usort($arrayDevices, function ($a, $b) {
        $ra = $a['dev']['role'] === 'parity' ? 0 : 1;
        $rb = $b['dev']['role'] === 'parity' ? 0 : 1;
        return $ra === $rb ? ($a['idx'] <=> $b['idx']) : ($ra <=> $rb);
    });
    $arrayOut = array_map(fn ($x) => $x['dev'], $arrayDevices);

    // Array totals (data members only; parity has no filesystem).
    $aSize = $aUsed = $aFree = 0;
    $haveFs = false;
    foreach ($arrayOut as $dev) {
        if ($dev['role'] === 'data' && $dev['fsSizeBytes'] !== null) {
            $haveFs = true;
            $aSize += $dev['fsSizeBytes'];
            $aUsed += (int)$dev['fsUsedBytes'];
            $aFree += (int)$dev['fsFreeBytes'];
        }
    }

    // Build pools (leader device first, then members by idx).
    $pools = [];
    foreach ($poolLeaders as $leaderName => $ld) {
        $members = $poolDevicesByOwner[$leaderName] ?? [];
        usort($members, function ($a, $b) {
            if ($a['leader'] !== $b['leader']) {
                return $a['leader'] ? -1 : 1;
            }
            return $a['idx'] <=> $b['idx'];
        });
        $devs = array_map(fn ($x) => $x['dev'], $members);
        $fsStatus = (string)($ld['fsStatus'] ?? '');
        $status = stripos($fsStatus, 'Mounted') === 0 ? 'online'
                : (stripos($fsStatus, 'Unmountable') === 0 ? 'offline' : 'unknown');
        $size = modernui_kib_to_bytes($ld['fsSize'] ?? null);
        $used = modernui_kib_to_bytes($ld['fsUsed'] ?? null);
        $pools[] = [
            'id'             => $leaderName,
            'label'          => $leaderName,
            'status'         => $status,
            'statusText'     => $fsStatus,
            'fsType'         => isset($ld['fsType']) && $ld['fsType'] !== '' ? (string)$ld['fsType'] : null,
            'fsProfile'      => isset($ld['fsProfile']) && $ld['fsProfile'] !== '' ? (string)$ld['fsProfile'] : null,
            'sizeBytes'      => $size,
            'usedBytes'      => $used,
            'freeBytes'      => modernui_kib_to_bytes($ld['fsFree'] ?? null),
            'utilizationPct' => ($size && $size > 0 && $used !== null) ? round($used / $size * 100, 1) : null,
            'devices'        => $devs,
        ];
    }

    $mdColor = (string)($var['mdColor'] ?? '');
    $operation = [
        'fsState'         => (string)($var['fsState'] ?? ''),
        'mdState'         => (string)($var['mdState'] ?? ''),
        'mdColor'         => $mdColor,
        'protected'       => $mdColor === 'green-on',
        'configValid'     => (string)($var['configValid'] ?? ''),
        'startMode'       => (string)($var['startMode'] ?? 'Normal'),
        'counts'          => [
            'disks'    => modernui_int_or_null($var['mdNumDisks'] ?? null) ?? 0,
            'disabled' => modernui_int_or_null($var['mdNumDisabled'] ?? null) ?? 0,
            'invalid'  => modernui_int_or_null($var['mdNumInvalid'] ?? null) ?? 0,
            'missing'  => modernui_int_or_null($var['mdNumMissing'] ?? null) ?? 0,
            'new'      => modernui_int_or_null($var['mdNumNew'] ?? null) ?? 0,
        ],
        'unmountableMask' => (string)($var['fsUnmountableMask'] ?? ''),
        'encryption'      => modernui_derive_encryption($disks, $var, array_keys($poolLeaders)),
        'moverEnabled'    => (string)($var['shareUser'] ?? '') === 'e',
        // primary + busy are added client-side (deriveOperation + /sub/mymonitor).
    ];

    return [
        'array' => [
            'devices'        => $arrayOut,
            'sizeBytes'      => $haveFs ? $aSize : null,
            'usedBytes'      => $haveFs ? $aUsed : null,
            'freeBytes'      => $haveFs ? $aFree : null,
            'utilizationPct' => ($haveFs && $aSize > 0) ? round($aUsed / $aSize * 100, 1) : null,
        ],
        'pools'         => $pools,
        'boot'          => $boot,
        'parity'        => modernui_parity_state($var),
        'operation'     => $operation,
        'serverVersion' => (string)($var['version'] ?? ''),
        'csrfToken'     => $csrf,
    ];
}

function modernui_main_state_from_files(string $disksPath, string $varPath): array
{
    $disks = modernui_parse_ini_sections($disksPath);
    $var   = modernui_parse_var_ini($varPath);
    // Intentionally do NOT emit the CSRF token in the snapshot body. The token
    // reaches the page via the #modernui-main-root data-csrf attribute
    // (htmlspecialchars-escaped in ArrayDevices.page), and that attribute is the
    // authoritative source the front-end reads (boot.ts backfills it onto the
    // snapshot). Keeping the per-boot token out of this read-only JSON response
    // means nothing that can read the body ever sees it.
    return modernui_main_state($disks, $var, '');
}

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json');
    // Don't serve a snapshot when the theme is disabled / in safe mode — the
    // stock page is active in those states.
    if (is_file('/boot/config/plugins/unraid-modernui/disabled')
        || is_file('/boot/config/plugins/unraid-modernui/safemode')) {
        http_response_code(409);
        echo json_encode(['error' => 'modernui-main disabled']);
        return;
    }
    echo json_encode(modernui_main_state_from_files(MODERNUI_DISKS_INI, MODERNUI_VAR_INI));
}
