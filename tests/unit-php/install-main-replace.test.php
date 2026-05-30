<?php
// Verifies the /Main page replacement wiring: the shared overlay table, the
// four overlay .page files' attributes, and that every lifecycle path
// (install / upgrade safe-mode / uninstall / save toggle + disable/enable)
// operates on all four files. A behavioural round-trip would need a writable
// MODERNUI_BACKUP_DIR (a const pointing at a system path), which the harness
// can't provide on Windows — so, like install-backup-guard.test.php, we use
// pure-function + source-level assertions.

define('MODERNUI_TESTING', true);
require_once __DIR__ . '/../../package/include/install.php';

$root = realpath(__DIR__ . '/../..');

// --- 1. modernui_main_overlay_table(): exactly the four Main pages ----------

$table = modernui_main_overlay_table();
assert(count($table) === 4, 'overlay table must have 4 entries; got ' . count($table));

foreach (['ArrayDevices.page', 'CacheDevices.page', 'BootDevice.page', 'ArrayOperation.page'] as $name) {
    $target = MODERNUI_DYNAMIX_DIR . '/' . $name;
    assert(array_key_exists($target, $table), "overlay table missing target {$target}");
    assert($table[$target] === MODERNUI_OVERLAY_DIR . '/usr/local/emhttp/plugins/dynamix/' . $name,
        "overlay source path wrong for {$name}");
}

// --- 2. The overlay .page files exist with the right attributes -------------
// Read the repo copies (overlay table points at the deployed system path).

function read_overlay(string $root, string $name): string {
    $p = $root . '/package/overlay/usr/local/emhttp/plugins/dynamix/' . $name;
    assert(is_file($p), "overlay file missing in repo: {$p}");
    return file_get_contents($p);
}

$slots = ['ArrayDevices.page' => 'Main:1', 'CacheDevices.page' => 'Main:2',
          'BootDevice.page' => 'Main:3', 'ArrayOperation.page' => 'Main:5'];

foreach ($slots as $name => $slot) {
    $c = read_overlay($root, $name);
    // Front-matter (before the first '---') carries the attributes.
    $front = explode("---", $c, 2)[0];
    assert(strpos($front, 'Menu="' . $slot . '"') !== false, "{$name} must keep {$slot}");
    assert(strpos($front, 'Markdown="false"') !== false, "{$name} must set Markdown=false (our body is HTML, not markdown)");
    // No Title → renders inline with no tab/title chrome in both tabbed and
    // tabless layouts (the "title-less page with text" path).
    assert(strpos($front, 'Title=') === false, "{$name} must NOT declare a Title (avoids tab/section chrome)");
}

// ArrayDevices carries the single mount point + csrf.
$ad = read_overlay($root, 'ArrayDevices.page');
assert(strpos($ad, 'id="modernui-main-root"') !== false, 'ArrayDevices must emit #modernui-main-root');
assert(strpos($ad, 'data-csrf=') !== false, 'ArrayDevices must pass csrf_token to the front-end');
assert(strpos($ad, 'safemode') !== false && strpos($ad, 'disabled') !== false,
    'ArrayDevices must guard on safemode/disabled flags');

// ArrayOperation MUST preserve the Nchan attribute so emhttp keeps publishing
// the live channels we subscribe to.
$ao = read_overlay($root, 'ArrayOperation.page');
assert(strpos($ao, 'Nchan="device_list,disk_load,parity_list"') !== false,
    'ArrayOperation must preserve Nchan="device_list,disk_load,parity_list"');

// CacheDevices/BootDevice render no visible content — no second mount div.
// (Comments may mention the root id; guard against the actual `id="…"` div.)
foreach (['CacheDevices.page', 'BootDevice.page'] as $name) {
    $c = read_overlay($root, $name);
    assert(strpos($c, 'id="modernui-main-root"') === false, "{$name} must NOT emit a second mount point");
}

// --- 3. Every lifecycle path operates on all four files ---------------------

$install = file_get_contents($root . '/package/include/install.php');
assert(preg_match('/foreach \(modernui_main_overlay_table\(\) as \$target => \$overlaySrc\) \{\s*modernui_replace_file/', $install) === 1,
    'modernui_install must replace every Main overlay');

$upgrade = file_get_contents($root . '/package/include/upgrade.php');
assert(strpos($upgrade, 'modernui_main_overlay_table()') !== false,
    'upgrade tracked-overlay table must include the Main pages (safe-mode coverage)');

$uninstall = file_get_contents($root . '/package/include/uninstall.php');
assert(strpos($uninstall, 'modernui_main_overlay_table()') !== false,
    'uninstall must restore the Main pages');

$save = file_get_contents($root . '/package/include/save.php');
assert(strpos($save, 'modernui_replace_main_pages()') !== false
    && strpos($save, 'modernui_restore_main_pages()') !== false,
    'save must replace/restore Main pages on toggle');
assert(strpos($save, "'main'") !== false, 'save must register the "main" setting');
// Disable restores stock Main pages (true fallback for the critical page);
// enable re-applies only when Main layout is Modern.
assert(preg_match('/action.*disable.*\}.*modernui_restore_main_pages\(\)/s', $save) !== 0
    || strpos($save, 'modernui_restore_main_pages();') !== false,
    'disable action must restore stock Main pages');

echo "all main-page replacement tests passed\n";
exit(0);
