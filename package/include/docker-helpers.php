<?php

// Shared helpers for docker-state.php / save-docker-folders.php / save-docker-tags.php.
//
// These three endpoints all need to (a) load + atomic-write JSON files on the
// USB flash, (b) validate their shape, (c) emit a JSON response. Centralized
// here so the per-endpoint files stay small.

require_once __DIR__ . '/helpers.php';

const MODERNUI_DOCKER_FOLDERS = '/boot/config/plugins/unraid-modernui/docker-folders.json';
const MODERNUI_DOCKER_TAGS    = '/boot/config/plugins/unraid-modernui/docker-tags.json';
// folder.view2 plugin (Squidly/Folder.View2) stores docker groupings in this JSON.
// We read it as a one-shot migration so users with existing folders don't lose them.
const MODERNUI_FOLDERS_LEGACY = '/boot/config/plugins/folder.view2/docker.json';

function modernui_read_json(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = @json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function modernui_write_json_atomic(string $path, array $data): bool
{
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $tmp = $path . '.tmp.' . getmypid();
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }
    if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
        return false;
    }
    // rename() is atomic on POSIX same-filesystem moves.
    return @rename($tmp, $path);
}

function modernui_read_folders(): array
{
    $data = modernui_read_json(MODERNUI_DOCKER_FOLDERS);
    if (!isset($data['version']) || !isset($data['folders']) || !is_array($data['folders'])) {
        return ['version' => 1, 'folders' => []];
    }
    return $data;
}

function modernui_read_tags(): array
{
    $data = modernui_read_json(MODERNUI_DOCKER_TAGS);
    if (!isset($data['version'])) {
        return ['version' => 1, 'tags' => [], 'assignments' => []];
    }
    if (!isset($data['tags']) || !is_array($data['tags'])) {
        $data['tags'] = [];
    }
    if (!isset($data['assignments']) || !is_array($data['assignments'])) {
        $data['assignments'] = [];
    }
    return $data;
}

// =========================================================================
// Validation.
// =========================================================================

function modernui_is_valid_hex_color($v): bool
{
    return is_string($v) && (bool)preg_match('/^#[0-9a-fA-F]{6}$/', $v);
}

function modernui_is_valid_id($v): bool
{
    return is_string($v) && (bool)preg_match('/^[a-z0-9][a-z0-9_-]{1,63}$/i', $v);
}

function modernui_validate_folders(array $data): array
{
    if (($data['version'] ?? null) !== 1) {
        return ['ok' => false, 'error' => 'unsupported version'];
    }
    $folders = $data['folders'] ?? null;
    if (!is_array($folders)) {
        return ['ok' => false, 'error' => 'folders not array'];
    }

    $seenIds = [];
    foreach ($folders as $f) {
        if (!is_array($f)) {
            return ['ok' => false, 'error' => 'folder not object'];
        }
        if (!modernui_is_valid_id($f['id'] ?? null)) {
            return ['ok' => false, 'error' => 'bad folder id'];
        }
        if (isset($seenIds[$f['id']])) {
            return ['ok' => false, 'error' => 'duplicate folder id'];
        }
        $seenIds[$f['id']] = true;
        if (!is_string($f['name'] ?? null) || trim($f['name']) === '') {
            return ['ok' => false, 'error' => 'bad folder name'];
        }
        if (strlen($f['name']) > 64) {
            return ['ok' => false, 'error' => 'folder name too long'];
        }
        if (!is_string($f['icon'] ?? null)) {
            return ['ok' => false, 'error' => 'bad folder icon'];
        }
        if (!modernui_is_valid_hex_color($f['color'] ?? null)) {
            return ['ok' => false, 'error' => 'bad folder color'];
        }
        $names = $f['containerNames'] ?? null;
        if (!is_array($names)) {
            return ['ok' => false, 'error' => 'bad containerNames'];
        }
        foreach ($names as $n) {
            if (!is_string($n) || $n === '') {
                return ['ok' => false, 'error' => 'bad container name'];
            }
        }
    }
    return ['ok' => true];
}

function modernui_validate_tags(array $data): array
{
    if (($data['version'] ?? null) !== 1) {
        return ['ok' => false, 'error' => 'unsupported version'];
    }
    $tags = $data['tags'] ?? null;
    if (!is_array($tags)) {
        return ['ok' => false, 'error' => 'tags not array'];
    }

    $tagIds = [];
    foreach ($tags as $t) {
        if (!is_array($t)) {
            return ['ok' => false, 'error' => 'tag not object'];
        }
        if (!modernui_is_valid_id($t['id'] ?? null)) {
            return ['ok' => false, 'error' => 'bad tag id'];
        }
        if (isset($tagIds[$t['id']])) {
            return ['ok' => false, 'error' => 'duplicate tag id'];
        }
        $tagIds[$t['id']] = true;
        if (!is_string($t['name'] ?? null) || trim($t['name']) === '') {
            return ['ok' => false, 'error' => 'bad tag name'];
        }
        if (strlen($t['name']) > 32) {
            return ['ok' => false, 'error' => 'tag name too long'];
        }
        if (!modernui_is_valid_hex_color($t['color'] ?? null)) {
            return ['ok' => false, 'error' => 'bad tag color'];
        }
    }

    $assignments = $data['assignments'] ?? null;
    if (!is_array($assignments)) {
        return ['ok' => false, 'error' => 'assignments not array'];
    }
    foreach ($assignments as $containerName => $ids) {
        if (!is_string($containerName) || $containerName === '') {
            return ['ok' => false, 'error' => 'bad assignment key'];
        }
        if (!is_array($ids)) {
            return ['ok' => false, 'error' => 'bad assignment value'];
        }
        foreach ($ids as $tid) {
            if (!is_string($tid) || !isset($tagIds[$tid])) {
                return ['ok' => false, 'error' => "assignment references unknown tag {$tid}"];
            }
        }
    }
    return ['ok' => true];
}

// =========================================================================
// One-time migration from folder.view2's docker.json, if present.
//
// folder.view2 schema (verified against a live install):
//   { "<random-id>": {
//        "name": "Media",
//        "icon": "",
//        "containers": ["plex", "sonarr"],
//        ...lots of settings we ignore...
//     }, ... }
//
// We map to our shape, picking a sensible default icon + color since
// folder.view2 doesn't always set them. Runs only when our file is absent —
// never re-runs after the user has saved at least once.
// =========================================================================
function modernui_maybe_migrate_folder_view2(): void
{
    if (is_file(MODERNUI_DOCKER_FOLDERS)) {
        return;
    }
    if (!is_file(MODERNUI_FOLDERS_LEGACY)) {
        return;
    }

    $data = modernui_read_json(MODERNUI_FOLDERS_LEGACY);
    if (empty($data) || !is_array($data)) {
        return;
    }

    // Default icon/color rotated through a palette so each folder visually
    // distinguishes itself. The user can edit afterwards via Manage Folders.
    $palette = [
        ['film',    '#ff8c2f'],
        ['book',    '#a78bfa'],
        ['chart',   '#22c55e'],
        ['archive', '#3b82f6'],
        ['layers',  '#14b8a6'],
        ['globe',   '#ef4444'],
        ['wifi',    '#f59e0b'],
        ['bot',     '#3b82f6'],
        ['wrench',  '#6b7280'],
    ];

    $folders = [];
    $i = 0;
    foreach ($data as $legacyId => $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $name = trim((string)($entry['name'] ?? ''));
        if ($name === '') {
            continue;
        }
        $containerNames = $entry['containers'] ?? [];
        if (!is_array($containerNames)) {
            continue;
        }
        $containerNames = array_values(array_filter(array_map(
            fn ($n) => is_string($n) ? $n : '',
            $containerNames
        )));

        [$defaultIcon, $defaultColor] = $palette[$i % count($palette)];
        $icon = is_string($entry['icon'] ?? null) && trim($entry['icon']) !== '' ? trim($entry['icon']) : $defaultIcon;
        // folder.view2 icons are font-awesome class names we don't render; fall
        // back to default unless the icon happens to match one of our names.
        $allowedIcons = ['folder','film','wifi','chart','book','bot','wrench','globe','layers','archive'];
        if (!in_array($icon, $allowedIcons, true)) {
            $icon = $defaultIcon;
        }

        $folders[] = [
            'id'             => 'f-' . substr(sha1((string)$legacyId), 0, 10),
            'name'           => $name,
            'icon'           => $icon,
            'color'          => $defaultColor,
            'containerNames' => $containerNames,
        ];
        $i++;
    }
    if (!empty($folders)) {
        modernui_write_json_atomic(MODERNUI_DOCKER_FOLDERS, ['version' => 1, 'folders' => $folders]);
    }
}

// =========================================================================
// Response helpers.
// =========================================================================

function modernui_json_response(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
}

function modernui_payload_from_post(array $post)
{
    $raw = $post['payload'] ?? null;
    if (!is_string($raw) || $raw === '') {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}
