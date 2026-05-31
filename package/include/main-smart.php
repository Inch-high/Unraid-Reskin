<?php

// Per-device SMART info for the /Main drive-info modal.
//
// Unlike main-state.php (the read-only snapshot, which is forbidden from
// shelling by a CI grep), this endpoint DOES run `smartctl` — the SMART
// attribute table, self-test log and error log have no on-disk INI source.
// It is therefore a SEPARATE file, and a dedicated CI guard asserts the only
// binary it ever invokes is /usr/sbin/smartctl.
//
// Two paths:
//   GET  ?name=disk1[&fields=selftest][&wake=1]  → read SMART JSON
//   POST {name, action:short|extended|abort, csrf_token}  → run/abort self-test
//
// SAFETY:
//   • The client only ever sends a logical `name` (disk1/cache/parity…). The
//     /dev node is resolved from disks.ini's OWN `device` field, never from the
//     client — and basename()'d + escapeshellarg'd. Unknown names are rejected.
//   • `-n standby` is passed on every read/poll so opening the modal NEVER
//     spins up a sleeping disk; we surface standby instead.
//   • The self-test POST (the one state-changing action) validates csrf_token
//     against var.ini, mirroring Unraid's stock update.php.

require_once __DIR__ . '/helpers.php';   // modernui_parse_ini_sections, modernui_parse_cfg

const MODERNUI_SMART_DISKS_INI = '/var/local/emhttp/disks.ini';
const MODERNUI_SMART_VAR_INI   = '/var/local/emhttp/var.ini';
const MODERNUI_SMART_CFG       = '/boot/config/smart-one.cfg';
const MODERNUI_SMARTCTL        = '/usr/sbin/smartctl';
const MODERNUI_SMART_CFGDIR    = '/boot/config/plugins/unraid-modernui';

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in tests/unit-php/main-smart.test.php)
// ---------------------------------------------------------------------------

// Resolve a client-supplied logical name to a real device node WITHOUT trusting
// the client. Returns one of:
//   ['status'=>'ok',      'node'=>'/dev/sdk', 'id'=>'MODEL_SERIAL', 'transport'=>'ata']
//   ['status'=>'unknown'] — name failed the allowlist or isn't in disks.ini (→404)
//   ['status'=>'flash']   — USB boot device, no useful SMART (→supported:false)
//   ['status'=>'absent']  — slot present but no device attached (→supported:false)
function modernui_smart_resolve(array $disks, string $name): array
{
    // Allowlist: parity, parity2, disk1.., cache, cache2, flash — lowercase
    // alphanumerics only. Defangs path traversal / shell metacharacters.
    if ($name === '' || !preg_match('/^[a-z0-9]+$/', $name) || !isset($disks[$name])) {
        return ['status' => 'unknown'];
    }
    $d = $disks[$name];
    if ((string)($d['type'] ?? '') === 'Flash') {
        return ['status' => 'flash'];
    }
    $status = (string)($d['status'] ?? '');
    $device = basename((string)($d['device'] ?? ''));   // basename defangs ../
    if ($device === '' || strpos($status, '_NP') !== false || strpos($status, '_MISSING') !== false) {
        return ['status' => 'absent'];
    }
    return [
        'status'    => 'ok',
        'node'      => '/dev/' . $device,
        'id'        => (string)($d['id'] ?? ''),
        'transport' => (string)($d['transport'] ?? ''),
    ];
}

// Honor the per-disk controller-type override stored in smart-one.cfg
// ([<id>] smType="-d sat", smPort1, smDevice). Returns a list of validated
// tokens (NOT yet shell-escaped — the command builder escapes each). Operator
// config is still treated as untrusted: anything that isn't a plain
// flag/value token is dropped.
function modernui_smart_build_type_args(array $cfg, string $id): array
{
    $section = $cfg[$id] ?? [];
    $smType = trim((string)($section['smType'] ?? ''));
    // "-1" (use default), "" and " " (Automatic) all mean: let smartctl detect.
    if ($smType === '' || $smType === '-1') {
        return [];
    }
    $out = [];
    foreach (preg_split('/\s+/', $smType) as $tok) {
        if ($tok === '') {
            continue;
        }
        // Accept only "-d" or device-type tokens like sat / nvme / megaraid,N.
        if ($tok === '-d' || preg_match('/^[a-z0-9][a-z0-9,+]*$/i', $tok)) {
            $out[] = $tok;
        } else {
            return [];   // a hostile token poisons the whole override → drop it
        }
    }
    // Append controller port/device suffixes (e.g. megaraid disk number) when set.
    foreach (['smPort1', 'smPort2', 'smPort3'] as $k) {
        $v = trim((string)($section[$k] ?? ''));
        if ($v !== '' && preg_match('/^[a-z0-9,\/]+$/i', $v)) {
            // Glue onto the last "-d xxx" token the way smartctl expects (xxx,N).
            $n = count($out);
            if ($n > 0 && $out[$n - 1] !== '-d') {
                $out[$n - 1] .= ',' . $v;
            }
        }
    }
    return $out;
}

// smartctl's exit status is a BITMASK, never a simple 0/nonzero:
//   bit0(1)=cmdline parse error  bit1(2)=device open failed / low-power (standby)
//   bit2(4)=some SMART cmd failed bit3(8)=SMART status FAILED (disk failing)
//   bits4-7 = prefail/old-age/selftest-log/etc. (informational)
// Only bits 0/1 short-circuit; everything else means "data usable, annotate".
function modernui_smart_normalize(array $json, int $exitCode): array
{
    $proto = strtolower((string)($json['device']['protocol'] ?? ''));
    $class = $proto === 'nvme' ? 'nvme' : ($proto === 'scsi' ? 'scsi' : 'ata');

    // Standby detection: with `-n standby`, smartctl exits with bit1 set and no
    // health/attribute data. Also sniff the messages array when present.
    $msgs = '';
    foreach (($json['smartctl']['messages'] ?? []) as $m) {
        $msgs .= ' ' . (string)($m['string'] ?? '');
    }
    $standby = stripos($msgs, 'standby') !== false
        || stripos($msgs, 'low-power') !== false
        || stripos($msgs, 'sleep') !== false
        || (($exitCode & 2) !== 0 && empty($json['smart_status']) && empty($json['ata_smart_attributes']));

    if ($standby) {
        return [
            'supported' => true,
            'standby'   => true,
            'reason'    => 'standby',
            'class'     => $class,
            'smartctl'  => modernui_smart_meta($json, $exitCode),
        ];
    }

    $passed = $json['smart_status']['passed'] ?? null;
    // bit3 set = SMART FAILED even if smart_status missing.
    $failed = ($passed === false) || (($exitCode & 8) !== 0);

    $attributes = [];
    foreach (($json['ata_smart_attributes']['table'] ?? []) as $a) {
        $whenFailed = (string)($a['when_failed'] ?? '');
        $attributes[] = [
            'id'         => (int)($a['id'] ?? 0),
            'name'       => (string)($a['name'] ?? ''),
            'value'      => isset($a['value']) ? (int)$a['value'] : null,
            'worst'      => isset($a['worst']) ? (int)$a['worst'] : null,
            'thresh'     => isset($a['thresh']) ? (int)$a['thresh'] : null,
            'raw'        => isset($a['raw']['value']) ? (int)$a['raw']['value'] : null,
            'rawString'  => (string)($a['raw']['string'] ?? ''),
            'whenFailed' => ($whenFailed === '' || $whenFailed === '-') ? null : $whenFailed,
        ];
    }

    $nvme = null;
    if ($class === 'nvme') {
        $n = $json['nvme_smart_health_information_log'] ?? [];
        $nvme = [
            'criticalWarning'        => (int)($n['critical_warning'] ?? 0),
            'availableSpare'         => isset($n['available_spare']) ? (int)$n['available_spare'] : null,
            'availableSpareThreshold' => isset($n['available_spare_threshold']) ? (int)$n['available_spare_threshold'] : null,
            'percentageUsed'         => isset($n['percentage_used']) ? (int)$n['percentage_used'] : null,
            'mediaErrors'            => isset($n['media_errors']) ? (int)$n['media_errors'] : null,
            'unsafeShutdowns'        => isset($n['unsafe_shutdowns']) ? (int)$n['unsafe_shutdowns'] : null,
            'dataUnitsRead'          => isset($n['data_units_read']) ? (int)$n['data_units_read'] : null,
            'dataUnitsWritten'       => isset($n['data_units_written']) ? (int)$n['data_units_written'] : null,
        ];
    }

    $rotation = $json['rotation_rate'] ?? null;

    return [
        'supported'       => true,
        'standby'         => false,
        'reason'          => null,
        'class'           => $class,
        'health'          => ['passed' => $passed === true, 'failed' => $failed],
        'identity'        => [
            'model'         => (string)($json['model_name'] ?? $json['scsi_model_name'] ?? ''),
            'serial'        => (string)($json['serial_number'] ?? ''),
            'firmware'      => (string)($json['firmware_version'] ?? ''),
            'capacityBytes' => isset($json['user_capacity']['bytes']) ? (int)$json['user_capacity']['bytes'] : null,
            'rotationRate'  => is_numeric($rotation) ? (int)$rotation : 0,
            'wwn'           => modernui_smart_wwn($json['wwn'] ?? null),
        ],
        'temperatureC'    => isset($json['temperature']['current']) ? (int)$json['temperature']['current'] : null,
        'powerOnHours'    => isset($json['power_on_time']['hours']) ? (int)$json['power_on_time']['hours'] : null,
        'powerCycleCount' => isset($json['power_cycle_count']) ? (int)$json['power_cycle_count'] : null,
        'attributes'      => $attributes,
        'nvme'            => $nvme,
        'selfTest'        => modernui_smart_selftest($json, $class),
        'errorLog'        => modernui_smart_errorlog($json, $class),
        'smartctl'        => modernui_smart_meta($json, $exitCode),
    ];
}

function modernui_smart_wwn($wwn): string
{
    if (!is_array($wwn)) {
        return '';
    }
    // smartctl emits wwn as {naa, oui, id} hex parts.
    if (isset($wwn['naa'], $wwn['oui'], $wwn['id'])) {
        return sprintf('%x%06x%09x', (int)$wwn['naa'], (int)$wwn['oui'], (int)$wwn['id']);
    }
    return '';
}

function modernui_smart_meta(array $json, int $exitCode): array
{
    return [
        'exitStatus' => $exitCode,
        'version'    => isset($json['smartctl']['version']) && is_array($json['smartctl']['version'])
            ? implode('.', $json['smartctl']['version'])
            : (string)($json['smartctl']['version'] ?? ''),
    ];
}

// Normalize ATA / NVMe / SCSI self-test status + log into one shape.
function modernui_smart_selftest(array $json, string $class): array
{
    $status = ['value' => null, 'string' => '', 'remainingPercent' => null, 'inProgress' => false];
    $log = [];

    if ($class === 'nvme') {
        $cur = $json['nvme_self_test_log'] ?? [];
        $op = $cur['current_self_test_operation'] ?? [];
        $inProgress = (int)($op['value'] ?? 0) !== 0;
        $status = [
            'value'            => (int)($op['value'] ?? 0),
            'string'           => (string)($op['string'] ?? ''),
            'remainingPercent' => isset($cur['current_self_test_completion']) ? (int)$cur['current_self_test_completion'] : null,
            'inProgress'       => $inProgress,
        ];
        foreach (($cur['table'] ?? []) as $e) {
            $log[] = [
                'type'          => (string)($e['self_test_code']['string'] ?? ''),
                'status'        => (string)($e['self_test_result']['string'] ?? ''),
                'lifetimeHours' => isset($e['power_on_hours']) ? (int)$e['power_on_hours'] : null,
                'lbaFirstError' => $e['lba'] ?? null,
            ];
        }
        return ['status' => $status, 'log' => $log];
    }

    // ATA (and SCSI falls through with mostly-empty data).
    $st = $json['ata_smart_data']['self_test']['status'] ?? [];
    if ($st) {
        $remaining = $st['remaining_percent'] ?? null;
        $status = [
            'value'            => isset($st['value']) ? (int)$st['value'] : null,
            'string'           => (string)($st['string'] ?? ''),
            'remainingPercent' => $remaining !== null ? (int)$remaining : null,
            'inProgress'       => $remaining !== null,
        ];
    }
    foreach (($json['ata_smart_self_test_log']['standard']['table'] ?? []) as $e) {
        $log[] = [
            'type'          => (string)($e['type']['string'] ?? ''),
            'status'        => (string)($e['status']['string'] ?? ''),
            'lifetimeHours' => isset($e['lifetime_hours']) ? (int)$e['lifetime_hours'] : null,
            'lbaFirstError' => $e['lba'] ?? null,
        ];
    }
    return ['status' => $status, 'log' => $log];
}

function modernui_smart_errorlog(array $json, string $class): array
{
    if ($class === 'scsi') {
        // SCSI/SAS: grown defect list count is the closest analog.
        $count = (int)($json['scsi_grown_defect_list'] ?? 0);
        return ['count' => $count, 'entries' => []];
    }
    $summary = $json['ata_smart_error_log']['summary'] ?? ($json['ata_smart_error_log']['extended'] ?? []);
    $count = (int)($summary['count'] ?? 0);
    $entries = [];
    foreach (($summary['table'] ?? []) as $e) {
        $entries[] = [
            'lifetimeHours' => isset($e['lifetime_hours']) ? (int)$e['lifetime_hours'] : null,
            'description'   => (string)($e['error_description'] ?? ''),
        ];
    }
    return ['count' => $count, 'entries' => $entries];
}

// Parse the editable SMART settings subset from smart-one.cfg [<id>] so the
// modal's Settings form prefills exactly like the stock page.
function modernui_smart_settings(array $cfg, string $id): array
{
    $s = $cfg[$id] ?? [];
    $get = fn (string $k) => isset($s[$k]) ? (string)$s[$k] : null;
    return [
        'hotTemp'  => $get('hotTemp'),
        'maxTemp'  => $get('maxTemp'),
        'smSelect' => $get('smSelect'),
        'smLevel'  => $get('smLevel'),
        'smType'   => $get('smType'),
        'smCustom' => $get('smCustom'),
    ];
}

// ---------------------------------------------------------------------------
// Shell boundary — the ONLY place this file invokes a binary (smartctl).
// ---------------------------------------------------------------------------

// Build + run a smartctl command. $flags are smartctl option tokens (already
// trusted literals like '-x'); $typeArgs are the validated controller tokens.
// Returns ['exit'=>int, 'json'=>array]. Never throws.
function modernui_smart_exec(array $flags, array $typeArgs, string $node): array
{
    $parts = [escapeshellarg(MODERNUI_SMARTCTL)];
    foreach (array_merge($flags, $typeArgs, [$node]) as $tok) {
        $parts[] = escapeshellarg($tok);
    }
    $cmd = implode(' ', $parts);
    $out = [];
    $rc = 0;
    exec($cmd . ' 2>/dev/null', $out, $rc);
    $json = json_decode(implode("\n", $out), true);
    return ['exit' => $rc, 'json' => is_array($json) ? $json : []];
}

// ---------------------------------------------------------------------------
// Web entry
// ---------------------------------------------------------------------------

function modernui_smart_json(array $data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
}

function modernui_smart_handle(): void
{
    // Don't serve while the theme is disabled / in safe mode (stock page active).
    if (is_file(MODERNUI_SMART_CFGDIR . '/disabled') || is_file(MODERNUI_SMART_CFGDIR . '/safemode')) {
        modernui_smart_json(['error' => 'modernui-main disabled'], 409);
        return;
    }

    $disks = modernui_parse_ini_sections(MODERNUI_SMART_DISKS_INI);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'POST') {
        modernui_smart_handle_post($disks);
        return;
    }

    $name = (string)($_GET['name'] ?? '');
    $res = modernui_smart_resolve($disks, $name);
    if ($res['status'] === 'unknown') {
        modernui_smart_json(['error' => 'unknown device'], 404);
        return;
    }
    if ($res['status'] !== 'ok') {
        modernui_smart_json(['name' => $name, 'supported' => false, 'reason' => $res['status']]);
        return;
    }

    $cfg = modernui_parse_cfg(MODERNUI_SMART_CFG);
    $typeArgs = modernui_smart_build_type_args($cfg, $res['id']);

    // Cheap status-only poll (used while a self-test runs) vs full read.
    $selftestOnly = ($_GET['fields'] ?? '') === 'selftest';
    // `-n standby` is dropped only when the user explicitly opts to wake the disk.
    $standbyGuard = ($_GET['wake'] ?? '') === '1' ? [] : ['-n', 'standby'];
    $readFlags = $selftestOnly ? ['-c'] : ['-x'];
    $flags = array_merge(['--json=c'], $standbyGuard, $readFlags);

    $run = modernui_smart_exec($flags, $typeArgs, $res['node']);
    $info = modernui_smart_normalize($run['json'], $run['exit']);
    $info['name'] = $name;
    $info['device'] = $res['node'];
    $info['settings'] = modernui_smart_settings($cfg, $res['id']);

    modernui_smart_json($info);
}

function modernui_smart_handle_post(array $disks): void
{
    // CSRF — validate against var.ini, the same token stock update.php checks.
    $var = [];
    foreach (file(MODERNUI_SMART_VAR_INI, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        if (preg_match('/^csrf_token\s*=\s*"?([^"]*)"?/', trim($line), $m)) {
            $var['csrf_token'] = $m[1];
            break;
        }
    }
    $token = (string)($_POST['csrf_token'] ?? '');
    if ($token === '' || empty($var['csrf_token']) || !hash_equals($var['csrf_token'], $token)) {
        modernui_smart_json(['error' => 'csrf'], 403);
        return;
    }

    $name = (string)($_POST['name'] ?? '');
    $action = (string)($_POST['action'] ?? '');
    $res = modernui_smart_resolve($disks, $name);
    if ($res['status'] !== 'ok') {
        modernui_smart_json(['error' => 'device not testable', 'reason' => $res['status']], 400);
        return;
    }

    $testFlag = match ($action) {
        'short'    => ['-t', 'short'],
        'extended' => ['-t', 'long'],
        'abort'    => ['-X'],
        default    => null,
    };
    if ($testFlag === null) {
        modernui_smart_json(['error' => 'bad action'], 400);
        return;
    }

    $cfg = modernui_parse_cfg(MODERNUI_SMART_CFG);
    $typeArgs = modernui_smart_build_type_args($cfg, $res['id']);
    $run = modernui_smart_exec(array_merge(['--json=c'], $testFlag), $typeArgs, $res['node']);

    modernui_smart_json([
        'ok'       => ($run['exit'] & 1) === 0,   // bit0 = cmdline/parse error
        'name'     => $name,
        'action'   => $action,
        'smartctl' => modernui_smart_meta($run['json'], $run['exit']),
    ]);
}

if (PHP_SAPI !== 'cli') {
    modernui_smart_handle();
}
