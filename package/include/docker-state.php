<?php
// One-shot snapshot of the docker page state.
//
// Wraps Unraid's DockerTemplates::getAllInfo() (the stock backend, untouched)
// and layers in our folders + tags. The front-end calls this once on page
// boot; live updates afterwards arrive via Unraid's existing nchan stream.
//
// IMPORTANT: this endpoint must do zero blocking external I/O and zero
// docker-exec calls. All such work belongs in nchan workers (see
// docs/superpowers/specs/2026-05-27-docker-tab-rebuild-design.md).
// getAllInfo() does call docker socket commands but it's the same path the
// stock page uses; we're not adding any new blocking work on top.

require_once __DIR__ . '/docker-helpers.php';

// Bootstrap Unraid's docker classes + their module-level globals
// ($dockerManPaths, $driver) at FILE scope. If we required them inside
// modernui_docker_state(), their top-level vars would be local to that
// function and getAllInfo()'s `global $dockerManPaths` lookup would see null.
const MODERNUI_DOCKER_CLIENT = '/usr/local/emhttp/plugins/dynamix.docker.manager/include/DockerClient.php';
$docroot ??= ($_SERVER['DOCUMENT_ROOT'] ?: '/usr/local/emhttp');
if (is_file("$docroot/webGui/include/Helpers.php")) {
    require_once "$docroot/webGui/include/Helpers.php"; // _var, var_split, my_explode
}
if (is_file(MODERNUI_DOCKER_CLIENT)) {
    require_once MODERNUI_DOCKER_CLIENT;               // populates $dockerManPaths + $driver
}

function modernui_docker_state(): array {
    global $dockerManPaths, $driver;  // bound from DockerClient.php's top-level scope

    modernui_maybe_migrate_folder_view2();

    $containers = [];
    if (class_exists('DockerTemplates') && class_exists('DockerClient')) {
        try {
            // Two data sources to merge:
            //   getAllInfo() →  per-container user metadata (icon, url, autostart, template, "updated")
            //   getDockerContainers() →  docker socket data (Image, Status, Id, Ports, NetworkMode)
            // Keyed by container Name in both.
            $templates = new DockerTemplates();
            $info = $templates->getAllInfo(false, true, false);

            $client = new DockerClient();
            $rawContainers = $client->getDockerContainers();
            $byName = [];
            foreach ((array)$rawContainers as $ct) {
                if (isset($ct['Name'])) $byName[$ct['Name']] = $ct;
            }

            // Fetch container sizes in one call. /containers/json?size=true walks each
            // container's RW layer — moderately expensive, so we batch it once.
            $sizes = modernui_fetch_sizes($client);

            // Fetch live CPU% and memory usage in one shell-out. Same command
            // Unraid's nchan worker uses (see dynamix.docker.manager/nchan/docker_load).
            // Populates the snapshot so users see stats immediately instead of
            // waiting for the first nchan delta to arrive.
            $stats = modernui_fetch_docker_stats();

            foreach ((array)$info as $name => $row) {
                $container = $byName[$name] ?? [];
                $shortId = substr((string)($container['Id'] ?? ''), 0, 12);
                $vdisk = $sizes[$shortId] ?? null;
                $stat = $stats[$shortId] ?? null;
                $containers[] = modernui_normalize_container((string)$name, (array)$row, (array)$container, $vdisk, $stat);
            }
        } catch (Throwable $e) {
            error_log('[modernui] docker-state error: ' . $e->getMessage());
            $containers = [];
        }
    }

    $folders = modernui_read_folders();
    $tags    = modernui_read_tags();

    return [
        'containers'     => $containers,
        'folders'        => $folders['folders'],
        'tags'           => $tags['tags'],
        'tagAssignments' => (object)$tags['assignments'],
    ];
}

// Walks /containers/json?size=true and returns map of {shortId => SizeRw bytes}.
// One docker socket call covers all containers (vs. N inspect calls). Errors are
// swallowed because the size column is non-critical — if it fails, vdisk shows —.
function modernui_fetch_sizes(DockerClient $client): array {
    try {
        $json = $client->getDockerJSON('/containers/json?all=true&size=true');
        if (!is_array($json)) return [];
        $out = [];
        foreach ($json as $row) {
            if (!isset($row['Id'])) continue;
            $out[substr((string)$row['Id'], 0, 12)] = (int)($row['SizeRw'] ?? 0);
        }
        return $out;
    } catch (Throwable $e) {
        return [];
    }
}

// Parse a docker-style size string like "25.34MiB" or "1.5GiB" into bytes.
// MiB/GiB/TiB use 1024 base; KB/MB/GB use 1000 base — matches Docker CLI.
function modernui_parse_size_string(string $s): int {
    $s = trim($s);
    if (!preg_match('/^([\d.]+)\s*([A-Za-z]*)$/', $s, $m)) return 0;
    $val = (float)$m[1];
    $unit = strtoupper($m[2] ?: 'B');
    $multipliers = [
        'B'  => 1,
        'KB' => 1000,           'KIB' => 1024,
        'MB' => 1000 ** 2,      'MIB' => 1024 ** 2,
        'GB' => 1000 ** 3,      'GIB' => 1024 ** 3,
        'TB' => 1000 ** 4,      'TIB' => 1024 ** 4,
    ];
    return (int)round($val * ($multipliers[$unit] ?? 1));
}

// Map of shortId => ['cpu' => float|null, 'mem' => int|null] using `docker stats`.
// Stopped containers don't appear in output. Errors return empty map.
function modernui_fetch_docker_stats(): array {
    $out = @shell_exec("docker stats --no-stream --format='{{.ID}};{{.CPUPerc}};{{.MemUsage}}' 2>/dev/null");
    if (!is_string($out) || $out === '') return [];
    $result = [];
    foreach (explode("\n", trim($out)) as $line) {
        $parts = explode(';', $line);
        if (count($parts) < 3) continue;
        $shortId = trim($parts[0]);
        if ($shortId === '') continue;
        $cpu = (float)str_replace('%', '', trim($parts[1]));
        // MemUsage is "X.XXMiB / Y.YYGiB" — used / limit. Take the used part.
        $memUsed = trim(explode('/', $parts[2])[0] ?? '');
        $memBytes = modernui_parse_size_string($memUsed);
        $result[$shortId] = ['cpu' => $cpu, 'mem' => $memBytes];
    }
    return $result;
}

// Pull a usable MAC address from the Networks dict. Containers attached to a
// custom bridge or br0.* have one network with a MacAddress; host/none mode has
// no MAC. Returns null when the field is absent.
function modernui_extract_mac(array $networks): ?string {
    foreach ($networks as $net) {
        if (!is_array($net)) continue;
        $mac = $net['MacAddress'] ?? '';
        if (is_string($mac) && $mac !== '') return strtolower($mac);
    }
    return null;
}

// Build a single typed container record by merging getAllInfo() row + the matching
// getDockerContainers() entry. The "info" row has icon/url/autostart/template/updated;
// "ct" has Image/Status/Id/Ports/NetworkMode/Networks. $stat is from `docker stats`.
function modernui_normalize_container(string $name, array $info, array $ct, ?int $vdisk = null, ?array $stat = null): array {
    $running = !empty($info['running']) || !empty($ct['Running']);
    $paused  = !empty($info['paused'])  || !empty($ct['Paused']);
    $state   = $paused ? 'paused' : ($running ? 'started' : 'stopped');

    // "updated" is emitted as the STRING "true"/"false" — `!empty("false")` is true,
    // so we'd flag every container as having an update. Compare to "true" explicitly.
    $updateAvailable = ($info['updated'] ?? null) === 'true';

    // Status is "Up 3 days (healthy)" / "Exited (0) 2 days ago" — usable as-is.
    $uptime = $running ? ($ct['Status'] ?? null) : null;

    return [
        'name'            => $name,
        'id'              => substr((string)($ct['Id'] ?? ''), 0, 12),
        'image'           => (string)($ct['Image'] ?? ''),
        'state'           => $state,
        'autostart'       => (bool)($info['autostart'] ?? false),
        'uptime'          => $uptime,
        'cpuPct'          => $stat['cpu'] ?? null,           // snapshot value; deltas refresh live
        'memBytes'        => $stat['mem'] ?? null,
        'vdiskBytes'      => $vdisk,                        // bytes; null when /containers?size=true is unavailable
        'macAddress'      => modernui_extract_mac((array)($ct['Networks'] ?? [])),
        'webuiUrl'        => $info['url'] ?? null,
        'iconUrl'         => (string)($info['icon'] ?? '/plugins/dynamix.docker.manager/images/question.png'),
        'ports'           => modernui_normalize_ports((array)($ct['Ports'] ?? []), (string)($info['url'] ?? '')),
        'updateAvailable' => $updateAvailable,
        'templatePath'    => (string)($info['template'] ?? ''),
        'shell'           => (string)($info['shell'] ?? 'sh'),
    ];
}

// Ports in getDockerContainers() are network-mode-keyed dictionaries — non-uniform
// shape that varies per container. Rather than expose that, we derive a single
// display-friendly port from the resolved WebUI URL (which already contains the
// canonical "IP:port" the user reaches the container at). Falls back to ip-only
// for vlan/macvlan containers that don't have a webui.
function modernui_normalize_ports(array $rawPorts, string $url): array {
    if ($url !== '' && preg_match('#https?://([^/]+)#', $url, $m)) {
        $authority = $m[1];
        $parts = explode(':', $authority, 2);
        $host = $parts[0];
        $hostPort = $parts[1] ?? '';
        return [[
            'host'          => $host,
            'hostPort'      => $hostPort,
            'containerPort' => $hostPort,
            'proto'         => 'tcp',
        ]];
    }
    // No URL — try to extract an IP from vlan/host mode raw ports.
    foreach ($rawPorts as $networkMode => $entries) {
        if (!is_array($entries)) continue;
        foreach ($entries as $k => $v) {
            $ip = is_string($v) ? $v : (is_string($k) ? $k : '');
            if ($ip !== '' && $ip !== 'host') {
                return [['host' => $ip, 'hostPort' => '', 'containerPort' => '', 'proto' => 'tcp']];
            }
        }
    }
    return [];
}

if (PHP_SAPI !== 'cli') {
    modernui_json_response(modernui_docker_state());
}
