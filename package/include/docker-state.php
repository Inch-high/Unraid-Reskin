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

            foreach ((array)$info as $name => $row) {
                $container = $byName[$name] ?? [];
                $containers[] = modernui_normalize_container((string)$name, (array)$row, (array)$container);
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

// Build a single typed container record by merging getAllInfo() row + the matching
// getDockerContainers() entry. The "info" row has icon/url/autostart/template/updated;
// "ct" has Image/Status/Id/Ports/NetworkMode.
function modernui_normalize_container(string $name, array $info, array $ct): array {
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
        'cpuPct'          => null,                          // arrives via nchan deltas, never the snapshot
        'memBytes'        => null,
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
