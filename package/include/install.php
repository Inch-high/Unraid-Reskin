<?php
require_once __DIR__ . '/helpers.php';

const MODERNUI_PLUGIN_NAME    = 'unraid-modernui';
const MODERNUI_DYNAMIX_CFG    = '/boot/config/plugins/dynamix/dynamix.cfg';
const MODERNUI_CFG_DIR        = '/boot/config/plugins/unraid-modernui';
const MODERNUI_BACKUP_DIR     = '/usr/local/emhttp/plugins/unraid-modernui/backups';
// Discovered in Task 7 Step 0 — verify on Unraid 7.x box if changed in a future release.
const MODERNUI_LAYOUT_FILE    = '/usr/local/emhttp/plugins/dynamix/include/DefaultPageLayout.php';
const MODERNUI_STYLE_TAG      = '<link rel="stylesheet" href="/plugins/unraid-modernui/theme/dist/modernui.css">';
const MODERNUI_SCRIPT_TAG     = '<script src="/plugins/unraid-modernui/theme/dist/loader.js"></script>';

const MODERNUI_MARK_BEGIN     = '# >>> unraid-modernui begin >>>';
const MODERNUI_MARK_END       = '# <<< unraid-modernui end <<<';
const MODERNUI_HTML_MARK_BEGIN = '<!-- unraid-modernui:begin -->';
const MODERNUI_HTML_MARK_END   = '<!-- unraid-modernui:end -->';

function modernui_hash_file(string $path): string {
    return is_file($path) ? hash_file('sha256', $path) : '';
}

function modernui_backup_file(string $path): void {
    if (!is_dir(MODERNUI_BACKUP_DIR)) mkdir(MODERNUI_BACKUP_DIR, 0755, true);
    if (!is_file($path)) return;
    $basename = basename($path);
    $sha = modernui_hash_file($path);
    $dest = MODERNUI_BACKUP_DIR . "/{$basename}.{$sha}";
    if (!is_file($dest)) copy($path, $dest);
    file_put_contents(MODERNUI_BACKUP_DIR . "/{$basename}.current.sha", $sha);
}

function modernui_strip_block(string $contents): string {
    $begin = preg_quote(MODERNUI_MARK_BEGIN, '/');
    $end   = preg_quote(MODERNUI_MARK_END, '/');
    return preg_replace("/\\n?{$begin}.*?{$end}\\n?/s", "\n", $contents) ?? $contents;
}

function modernui_strip_html_block(string $contents): string {
    $begin = preg_quote(MODERNUI_HTML_MARK_BEGIN, '/');
    $end   = preg_quote(MODERNUI_HTML_MARK_END, '/');
    return preg_replace("/\\s*{$begin}.*?{$end}\\s*/s", "\n", $contents) ?? $contents;
}

function modernui_html_block(): string {
    // Inject both the stylesheet link AND the bootstrap script before </head>.
    // CSS is unconditional (theme tokens). JS is loader.js which routes to modernui.js or re-enable.js
    // based on the disabled flag (regenerated at install/save time).
    return "\n" . MODERNUI_HTML_MARK_BEGIN . "\n"
        . MODERNUI_STYLE_TAG . "\n"
        . MODERNUI_SCRIPT_TAG . "\n"
        . MODERNUI_HTML_MARK_END . "\n";
}

function modernui_strip_dynamix_cfg(): void {
    // Older versions (v0.1.0) wrote a fictitious extraCSS= block here. Clean it up.
    // Going forward we don't touch dynamix.cfg at all.
    if (!is_file(MODERNUI_DYNAMIX_CFG)) return;
    $cfg = file_get_contents(MODERNUI_DYNAMIX_CFG);
    $stripped = modernui_strip_block($cfg);
    if ($stripped !== $cfg) {
        file_put_contents(MODERNUI_DYNAMIX_CFG, $stripped, LOCK_EX);
    }
}

function modernui_inject_script_tag(): void {
    if (!is_file(MODERNUI_LAYOUT_FILE)) {
        echo "Modern UI: WARNING — layout file not found at " . MODERNUI_LAYOUT_FILE . "\n";
        echo "Modern UI: did you set MODERNUI_LAYOUT_FILE in install.php after running Task 7 Step 0?\n";
        return;
    }
    $contents = file_get_contents(MODERNUI_LAYOUT_FILE);
    $contents = modernui_strip_html_block($contents);
    // Insert just before </head>; case-insensitive
    $injected = preg_replace('/(<\\/head\\s*>)/i', modernui_html_block() . "$1", $contents, 1, $count);
    if ($count !== 1) {
        echo "Modern UI: WARNING — could not find </head> in layout file; JS not injected.\n";
        return;
    }
    file_put_contents(MODERNUI_LAYOUT_FILE, $injected, LOCK_EX);
}

function modernui_generate_loader_js(bool $disabled): void {
    $target = $disabled ? 're-enable.js' : 'modernui.js';
    $settings = modernui_parse_cfg('/boot/config/plugins/unraid-modernui/settings.cfg');
    $mode      = $settings['mode']      ?? 'system';
    $density   = $settings['density']   ?? 'comfortable';
    $dashboard = $settings['dashboard'] ?? 'on';
    $shell     = $settings['shell']     ?? 'on';
    $sidebar   = $settings['sidebar']   ?? 'expanded';
    $extraScript = $disabled
        ? ''
        : "var d=document.createElement('script');\n"
          . "d.src='/plugins/unraid-modernui/theme/dist/modernui-dashboard.js';\n"
          . "document.head.appendChild(d);\n";
    $loader = "(function(){\n"
        . "var r=document.documentElement;\n"
        . "r.dataset.modernuiMode=" . json_encode($mode) . ";\n"
        . "r.dataset.modernuiDensity=" . json_encode($density) . ";\n"
        . "r.dataset.modernuiDashboard=" . json_encode($dashboard) . ";\n"
        . "r.dataset.modernuiShell=" . json_encode($shell) . ";\n"
        . "r.dataset.modernuiSidebar=" . json_encode($sidebar) . ";\n"
        . "var s=document.createElement('script');\n"
        . "s.src='/plugins/unraid-modernui/theme/dist/" . $target . "';\n"
        . "document.head.appendChild(s);\n"
        . $extraScript
        . "})();\n";
    $loaderPath = '/usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js';
    file_put_contents($loaderPath, $loader, LOCK_EX);
}

function modernui_install(): void {
    if (!is_dir(MODERNUI_CFG_DIR)) mkdir(MODERNUI_CFG_DIR, 0755, true);

    modernui_backup_file(MODERNUI_LAYOUT_FILE);
    modernui_strip_dynamix_cfg();
    modernui_inject_script_tag();

    $disabled = modernui_is_disabled(MODERNUI_CFG_DIR);
    modernui_generate_loader_js($disabled);

    // Make sure rc.modernui is executable so /etc/rc.d picks it up
    $rc = '/usr/local/emhttp/plugins/unraid-modernui/scripts/rc.modernui';
    if (is_file($rc)) chmod($rc, 0755);

    echo "Modern UI: install complete (disabled=" . ($disabled ? 'true' : 'false') . ")\n";
}

if (PHP_SAPI === 'cli' && !defined('MODERNUI_TESTING')) {
    modernui_install();
}
