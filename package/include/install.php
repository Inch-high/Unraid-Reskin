<?php

require_once __DIR__ . '/helpers.php';

const MODERNUI_PLUGIN_NAME    = 'unraid-modernui';
const MODERNUI_DYNAMIX_CFG    = '/boot/config/plugins/dynamix/dynamix.cfg';
const MODERNUI_CFG_DIR        = '/boot/config/plugins/unraid-modernui';
const MODERNUI_BACKUP_DIR     = '/usr/local/emhttp/plugins/unraid-modernui/backups';
const MODERNUI_OVERLAY_DIR    = '/usr/local/emhttp/plugins/unraid-modernui/overlay';
// Discovered in Task 7 Step 0 — verify on Unraid 7.x box if changed in a future release.
const MODERNUI_LAYOUT_FILE    = '/usr/local/emhttp/plugins/dynamix/include/DefaultPageLayout.php';
const MODERNUI_DOCKER_PAGE    = '/usr/local/emhttp/plugins/dynamix.docker.manager/DockerContainers.page';
// The /Main screen is an xmenu assembled from four dynamix .page files. We
// replace all four: ArrayDevices (Main:1) carries the single mount point;
// CacheDevices/BootDevice are empty; ArrayOperation keeps its Nchan attribute.
// SHA-backed + restored exactly like the docker page.
const MODERNUI_DYNAMIX_DIR    = '/usr/local/emhttp/plugins/dynamix';
const MODERNUI_MAIN_PAGES     = ['ArrayDevices.page', 'CacheDevices.page', 'BootDevice.page', 'ArrayOperation.page'];

// target_path => overlay_source_path for each replaced /Main page. Shared by
// install (replace), upgrade (SHA verify + safe-mode), uninstall + save (restore).
function modernui_main_overlay_table(): array
{
    $out = [];
    foreach (MODERNUI_MAIN_PAGES as $name) {
        $out[MODERNUI_DYNAMIX_DIR . '/' . $name] =
            MODERNUI_OVERLAY_DIR . '/usr/local/emhttp/plugins/dynamix/' . $name;
    }
    return $out;
}

// The optional Unassigned Devices plugin's /Main:4 page. Tracked SEPARATELY
// from the core table and deliberately EXCLUDED from the upgrade safe-mode loop
// — the plugin updates often, and a drift there must never disable the core
// Main rebuild. Replaced only when the plugin is installed; if it reclaims its
// page on update, our card auto-hides (ud-state.php marker check) and the stock
// section returns until the next theme (re)install re-applies this overlay.
const MODERNUI_UD_PAGE_TARGET = '/usr/local/emhttp/plugins/unassigned.devices/UnassignedDevices.page';
function modernui_ud_overlay_src(): string
{
    return MODERNUI_OVERLAY_DIR . '/usr/local/emhttp/plugins/unassigned.devices/UnassignedDevices.page';
}
function modernui_ud_plugin_present(): bool
{
    return is_file(MODERNUI_UD_PAGE_TARGET);
}
// Inline filemtime() expressions in the injected tags evaluate per-request
// inside DefaultPageLayout.php (which is a PHP file), turning every cfg save
// into a fresh URL and busting the browser's stale loader.js cache. Without
// this, toggling shell=off via the user menu sticks even after the user
// re-enables it from Settings, because the browser keeps using the cached
// loader.js with the old dataset attributes baked in.
const MODERNUI_STYLE_TAG      = '<link rel="stylesheet" href="/plugins/unraid-modernui/theme/dist/modernui.css?<?= @filemtime(\'/usr/local/emhttp/plugins/unraid-modernui/theme/dist/modernui.css\') ?>">';
const MODERNUI_SCRIPT_TAG     = '<script src="/plugins/unraid-modernui/theme/dist/loader.js?<?= @filemtime(\'/usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js\') ?>"></script>';

const MODERNUI_MARK_BEGIN     = '# >>> unraid-modernui begin >>>';
const MODERNUI_MARK_END       = '# <<< unraid-modernui end <<<';
const MODERNUI_HTML_MARK_BEGIN = '<!-- unraid-modernui:begin -->';
const MODERNUI_HTML_MARK_END   = '<!-- unraid-modernui:end -->';

function modernui_hash_file(string $path): string
{
    return is_file($path) ? hash_file('sha256', $path) : '';
}

function modernui_backup_file(string $path): void
{
    if (!is_dir(MODERNUI_BACKUP_DIR)) {
        mkdir(MODERNUI_BACKUP_DIR, 0755, true);
    }
    if (!is_file($path)) {
        return;
    }
    $basename = basename($path);
    $sha = modernui_hash_file($path);
    $dest = MODERNUI_BACKUP_DIR . "/{$basename}.{$sha}";
    if (!is_file($dest)) {
        copy($path, $dest);
    }
    file_put_contents(MODERNUI_BACKUP_DIR . "/{$basename}.current.sha", $sha);
}

// True if the layout file is in a "presumed-stock" state — no injected
// marker block. Used to prevent modernui_install() from re-pointing the
// SHA backup at our own output when install.php runs a second time
// (e.g. via dev-mirror after first .plg install). If a previous run
// already advanced the pointer, the existing pointer file is the only
// real stock backup we have — leave it alone.
function modernui_layout_appears_clean(string $path): bool
{
    if (!is_file($path)) {
        return false;
    }
    $contents = file_get_contents($path);
    return $contents !== false
        && strpos($contents, MODERNUI_HTML_MARK_BEGIN) === false;
}

function modernui_strip_block(string $contents): string
{
    $begin = preg_quote(MODERNUI_MARK_BEGIN, '/');
    $end   = preg_quote(MODERNUI_MARK_END, '/');
    return preg_replace("/\\n?{$begin}.*?{$end}\\n?/s", "\n", $contents) ?? $contents;
}

function modernui_strip_html_block(string $contents): string
{
    $begin = preg_quote(MODERNUI_HTML_MARK_BEGIN, '/');
    $end   = preg_quote(MODERNUI_HTML_MARK_END, '/');
    return preg_replace("/\\s*{$begin}.*?{$end}\\s*/s", "\n", $contents) ?? $contents;
}

function modernui_html_block(): string
{
    // Inject both the stylesheet link AND the bootstrap script before </head>.
    // CSS is unconditional (theme tokens). JS is loader.js which routes to modernui.js or re-enable.js
    // based on the disabled flag (regenerated at install/save time).
    return "\n" . MODERNUI_HTML_MARK_BEGIN . "\n"
        . MODERNUI_STYLE_TAG . "\n"
        . MODERNUI_SCRIPT_TAG . "\n"
        . MODERNUI_HTML_MARK_END . "\n";
}

function modernui_strip_dynamix_cfg(): void
{
    // Older versions (v0.1.0) wrote a fictitious extraCSS= block here. Clean it up.
    // Going forward we don't touch dynamix.cfg at all.
    if (!is_file(MODERNUI_DYNAMIX_CFG)) {
        return;
    }
    $cfg = file_get_contents(MODERNUI_DYNAMIX_CFG);
    $stripped = modernui_strip_block($cfg);
    if ($stripped !== $cfg) {
        file_put_contents(MODERNUI_DYNAMIX_CFG, $stripped, LOCK_EX);
    }
}

function modernui_inject_script_tag(): void
{
    if (!is_file(MODERNUI_LAYOUT_FILE)) {
        echo 'Modern UI: WARNING — layout file not found at ' . MODERNUI_LAYOUT_FILE . "\n";
        echo "Modern UI: did you set MODERNUI_LAYOUT_FILE in install.php after running Task 7 Step 0?\n";
        return;
    }
    $contents = file_get_contents(MODERNUI_LAYOUT_FILE);
    $contents = modernui_strip_html_block($contents);
    // Insert just before </head>; case-insensitive
    $injected = preg_replace('/(<\\/head\\s*>)/i', modernui_html_block() . '$1', $contents, 1, $count);
    if ($count !== 1) {
        echo "Modern UI: WARNING — could not find </head> in layout file; JS not injected.\n";
        return;
    }
    file_put_contents(MODERNUI_LAYOUT_FILE, $injected, LOCK_EX);
}

// Build a dist asset URL with a cache-busting ?v=<mtime> query so a plugin
// update doesn't leave the browser running a stale bundle (the classic
// blank-page-until-hard-refresh after an upgrade). Mirrors the filemtime
// busting already applied to loader.js + modernui.css via MODERNUI_SCRIPT_TAG /
// MODERNUI_STYLE_TAG. install.php runs after the new files are extracted, so the
// mtimes are fresh. Falls back to the bare URL if the file is unreadable.
function modernui_dist_asset_url(string $file): string
{
    $base = '/plugins/unraid-modernui/theme/dist/' . $file;
    $mtime = @filemtime('/usr/local/emhttp/plugins/unraid-modernui/theme/dist/' . $file);
    return $mtime ? $base . '?v=' . $mtime : $base;
}

function modernui_generate_loader_js(bool $disabled): void
{
    $target = $disabled ? 're-enable.js' : 'modernui.js';
    $settings = modernui_parse_cfg('/boot/config/plugins/unraid-modernui/settings.cfg');
    $mode      = $settings['mode']      ?? 'system';
    $density   = $settings['density']   ?? 'comfortable';
    $dashboard = $settings['dashboard'] ?? 'on';
    $shell     = $settings['shell']     ?? 'on';
    $sidebar   = $settings['sidebar']   ?? 'expanded';
    $docker    = $settings['docker']    ?? 'on';
    $main      = $settings['main']      ?? 'on';
    $mainUtil  = in_array($settings['main_util_style'] ?? 'bar', ['bar', 'ring'], true)
                 ? ($settings['main_util_style'] ?? 'bar') : 'bar';
    $dockerFolderDefault = $settings['docker_folder_default'] ?? 'expanded';
    $dockerShowStats = $settings['docker_show_stats'] ?? 'off';
    // When enabled, lazy-load the dashboard + docker bundles too. Each one
    // page-detects internally and exits early off-route — adding them here
    // costs ~5 KB gzipped per route guard. Keeping them out of the main
    // bundle keeps /Main, /Settings etc. lighter.
    $extraScript = '';
    if (!$disabled) {
        $extraScript .= "var d=document.createElement('script');\n"
                      . "d.src='" . modernui_dist_asset_url('modernui-dashboard.js') . "';\n"
                      . "document.head.appendChild(d);\n";
        $extraScript .= "var dk=document.createElement('script');\n"
                      . "dk.src='" . modernui_dist_asset_url('modernui-docker.js') . "';\n"
                      . "document.head.appendChild(dk);\n";
        $extraScript .= "var mn=document.createElement('script');\n"
                      . "mn.src='" . modernui_dist_asset_url('modernui-main.js') . "';\n"
                      . "document.head.appendChild(mn);\n";
    }
    $loader = "(function(){\n"
        . "var r=document.documentElement;\n"
        . 'r.dataset.modernuiMode=' . json_encode($mode) . ";\n"
        . 'r.dataset.modernuiDensity=' . json_encode($density) . ";\n"
        . 'r.dataset.modernuiDashboard=' . json_encode($dashboard) . ";\n"
        . 'r.dataset.modernuiShell=' . json_encode($shell) . ";\n"
        . 'r.dataset.modernuiSidebar=' . json_encode($sidebar) . ";\n"
        . 'r.dataset.modernuiDocker=' . json_encode($docker) . ";\n"
        . 'r.dataset.modernuiMain=' . json_encode($main) . ";\n"
        . 'r.dataset.modernuiMainUtil=' . json_encode($mainUtil) . ";\n"
        . 'r.dataset.modernuiDockerFolderDefault=' . json_encode($dockerFolderDefault) . ";\n"
        . 'r.dataset.modernuiDockerStats=' . json_encode($dockerShowStats) . ";\n"
        . "var s=document.createElement('script');\n"
        . "s.src='" . modernui_dist_asset_url($target) . "';\n"
        . "document.head.appendChild(s);\n"
        . $extraScript
        . "})();\n";
    $loaderPath = '/usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js';
    file_put_contents($loaderPath, $loader, LOCK_EX);
}

// Replace an Unraid file with our overlay copy. Backs up the original by SHA
// first, so uninstall (and safe-mode recovery) can restore byte-identically.
function modernui_replace_file(string $target, string $overlaySrc): bool
{
    if (!is_file($overlaySrc)) {
        echo "Modern UI: WARNING — overlay source missing: {$overlaySrc}\n";
        return false;
    }
    if (is_file($target)) {
        // Skip the backup step if the target is already byte-identical to our
        // overlay — otherwise we'd snapshot our own overlay as the "stock"
        // backup, and a later uninstall would "restore" the file to our
        // overlay (with no JS/CSS to back it) instead of Unraid's original.
        // The existing pointer (if any) is the only real stock backup we have.
        $overlay_sha = modernui_hash_file($overlaySrc);
        $target_sha  = modernui_hash_file($target);
        if ($target_sha !== $overlay_sha) {
            modernui_backup_file($target);
        }
    }
    $dir = dirname($target);
    if (!is_dir($dir)) {
        echo "Modern UI: WARNING — target directory missing: {$dir} (plugin not installed?)\n";
        return false;
    }
    // Atomic replace via tmp + rename so a half-written file can never serve.
    $tmp = $target . '.modernui.tmp';
    if (!@copy($overlaySrc, $tmp)) {
        echo "Modern UI: WARNING — copy to {$tmp} failed\n";
        return false;
    }
    if (!@rename($tmp, $target)) {
        @unlink($tmp);
        echo "Modern UI: WARNING — atomic rename of {$tmp} -> {$target} failed\n";
        return false;
    }
    return true;
}

function modernui_install(): void
{
    if (!is_dir(MODERNUI_CFG_DIR)) {
        mkdir(MODERNUI_CFG_DIR, 0755, true);
    }

    // Only refresh the layout backup when the file looks unmodified.
    // Re-running install.php on an already-injected file would otherwise
    // snapshot our own output as the "stock" backup and break uninstall's
    // ability to restore Unraid's real original.
    if (modernui_layout_appears_clean(MODERNUI_LAYOUT_FILE)) {
        modernui_backup_file(MODERNUI_LAYOUT_FILE);
    }
    modernui_strip_dynamix_cfg();
    modernui_inject_script_tag();

    // Replace the docker manager's page file with our mount-point shell.
    // The backend (DockerContainers.php, Events.php, nchan workers) stays
    // stock — only the .page front-end is ours.
    modernui_replace_file(
        MODERNUI_DOCKER_PAGE,
        MODERNUI_OVERLAY_DIR . '/usr/local/emhttp/plugins/dynamix.docker.manager/DockerContainers.page'
    );

    // Replace the four dynamix /Main .page files with our overlays. Same model:
    // backend (emhttp / update.htm / emcmd / ToggleState.php / Boot.php) stays
    // stock — only the .page front-end is ours.
    foreach (modernui_main_overlay_table() as $target => $overlaySrc) {
        modernui_replace_file($target, $overlaySrc);
    }

    // Suppress the optional Unassigned Devices section (only if the plugin is
    // present). Separate from the core pages + the safe-mode loop on purpose.
    if (modernui_ud_plugin_present()) {
        modernui_replace_file(MODERNUI_UD_PAGE_TARGET, modernui_ud_overlay_src());
    }

    $disabled = modernui_is_disabled(MODERNUI_CFG_DIR);
    modernui_generate_loader_js($disabled);

    // Make sure rc.modernui is executable so /etc/rc.d picks it up
    $rc = '/usr/local/emhttp/plugins/unraid-modernui/scripts/rc.modernui';
    if (is_file($rc)) {
        chmod($rc, 0755);
    }

    echo 'Modern UI: install complete (disabled=' . ($disabled ? 'true' : 'false') . ")\n";
}

// Only auto-run modernui_install() when this file is invoked directly
// (e.g. `php install.php`). Without the realpath check, requiring this file
// from upgrade.php / tests / dev-mirror — which need its functions and
// constants — would re-run the full install side-effect as a surprise. The
// MODERNUI_TESTING guard remains for the rare case a test wants to load
// this file as the entry script with side-effects suppressed.
if (PHP_SAPI === 'cli'
    && !defined('MODERNUI_TESTING')
    && isset($_SERVER['SCRIPT_FILENAME'])
    && realpath($_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)) {
    modernui_install();
}
