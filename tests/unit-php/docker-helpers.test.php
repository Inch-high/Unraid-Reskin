<?php
define('MODERNUI_TESTING', true);
require_once __DIR__ . '/../../package/include/docker-helpers.php';

// ===========================================================================
// modernui_validate_folders
// ===========================================================================

$valid_folders = [
    'version' => 1,
    'folders' => [
        ['id' => 'f-abc', 'name' => 'Media', 'icon' => 'film', 'color' => '#ff8c2f', 'containerNames' => ['plex', 'sonarr']],
        ['id' => 'f-xyz', 'name' => 'Network', 'icon' => 'wifi', 'color' => '#3b82f6', 'containerNames' => []],
    ],
];
$res = modernui_validate_folders($valid_folders);
assert($res['ok'] === true, 'valid folders should pass: ' . var_export($res, true));

// version mismatch
$bad = $valid_folders; $bad['version'] = 2;
assert(modernui_validate_folders($bad)['ok'] === false, 'bad version should fail');

// missing folders array
assert(modernui_validate_folders(['version' => 1])['ok'] === false, 'missing folders should fail');

// duplicate ids
$bad = $valid_folders;
$bad['folders'][1]['id'] = 'f-abc';
assert(modernui_validate_folders($bad)['ok'] === false, 'duplicate id should fail');

// bad id format (e.g. SQL injection chars)
$bad = $valid_folders;
$bad['folders'][0]['id'] = "f-abc'; DROP TABLE--";
assert(modernui_validate_folders($bad)['ok'] === false, 'bad id chars should fail');

// empty name
$bad = $valid_folders;
$bad['folders'][0]['name'] = '   ';
assert(modernui_validate_folders($bad)['ok'] === false, 'empty name should fail');

// over-long name
$bad = $valid_folders;
$bad['folders'][0]['name'] = str_repeat('a', 200);
assert(modernui_validate_folders($bad)['ok'] === false, 'long name should fail');

// bad color (not hex)
$bad = $valid_folders;
$bad['folders'][0]['color'] = 'red';
assert(modernui_validate_folders($bad)['ok'] === false, 'non-hex color should fail');

// bad color (3-char hex not supported — we require 6)
$bad = $valid_folders;
$bad['folders'][0]['color'] = '#fff';
assert(modernui_validate_folders($bad)['ok'] === false, '3-char hex should fail');

// containerNames not an array
$bad = $valid_folders;
$bad['folders'][0]['containerNames'] = 'plex,sonarr';
assert(modernui_validate_folders($bad)['ok'] === false, 'csv string should fail');

// containerName with empty entry
$bad = $valid_folders;
$bad['folders'][0]['containerNames'] = ['plex', '', 'sonarr'];
assert(modernui_validate_folders($bad)['ok'] === false, 'empty container name should fail');

// ===========================================================================
// modernui_validate_tags
// ===========================================================================

$valid_tags = [
    'version' => 1,
    'tags' => [
        ['id' => 't-gpu', 'name' => 'gpu', 'color' => '#22c55e'],
        ['id' => 't-vpn', 'name' => 'vpn', 'color' => '#3b82f6'],
    ],
    'assignments' => [
        'plex'   => ['t-gpu'],
        'sonarr' => ['t-gpu', 't-vpn'],
    ],
];
$res = modernui_validate_tags($valid_tags);
assert($res['ok'] === true, 'valid tags should pass: ' . var_export($res, true));

// duplicate tag id
$bad = $valid_tags;
$bad['tags'][1]['id'] = 't-gpu';
assert(modernui_validate_tags($bad)['ok'] === false, 'duplicate tag id should fail');

// assignment references unknown tag
$bad = $valid_tags;
$bad['assignments']['plex'] = ['t-ghost'];
assert(modernui_validate_tags($bad)['ok'] === false, 'unknown tag id in assignments should fail');

// missing assignments object
$bad = $valid_tags;
unset($bad['assignments']);
assert(modernui_validate_tags($bad)['ok'] === false, 'missing assignments should fail');

// assignments is not an object
$bad = $valid_tags;
$bad['assignments'] = 'no';
assert(modernui_validate_tags($bad)['ok'] === false, 'non-object assignments should fail');

// over-long tag name
$bad = $valid_tags;
$bad['tags'][0]['name'] = str_repeat('a', 50);
assert(modernui_validate_tags($bad)['ok'] === false, 'long tag name should fail');

// ===========================================================================
// modernui_write_json_atomic / modernui_read_json round-trip
// ===========================================================================

$tmpDir = sys_get_temp_dir() . '/modernui-docker-test-' . uniqid();
mkdir($tmpDir, 0755, true);
$tmpFile = $tmpDir . '/folders.json';

assert(modernui_write_json_atomic($tmpFile, $valid_folders) === true, 'write should succeed');
assert(is_file($tmpFile), 'file should exist after write');
// Confirm the file is well-formed JSON, not the .tmp leftover
$decoded = json_decode(file_get_contents($tmpFile), true);
assert(is_array($decoded), 'file should round-trip JSON');
assert($decoded['folders'][0]['id'] === 'f-abc', 'round-trip preserves data');

// modernui_read_json on missing file returns empty array, not error
$missing = modernui_read_json($tmpDir . '/does-not-exist.json');
assert($missing === [], 'missing file should return []');

// modernui_read_json on garbage returns empty array
file_put_contents($tmpDir . '/garbage.json', 'not json at all {{');
assert(modernui_read_json($tmpDir . '/garbage.json') === [], 'garbage should return []');

// Cleanup
@unlink($tmpFile);
@unlink($tmpDir . '/garbage.json');
@rmdir($tmpDir);

echo "all docker-helpers tests passed\n";
exit(0);
