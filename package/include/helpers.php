<?php

function modernui_parse_cfg(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $out = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || $trimmed[0] === '#') {
            continue;
        }
        $pos = strpos($trimmed, '=');
        if ($pos === false) {
            continue;
        }
        $key = trim(substr($trimmed, 0, $pos));
        $value = trim(substr($trimmed, $pos + 1));
        if ($key !== '') {
            $out[$key] = $value;
        }
    }
    return $out;
}

function modernui_write_cfg(string $path, array $values): void
{
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $lines = [];
    foreach ($values as $k => $v) {
        $lines[] = $k . '=' . $v;
    }
    file_put_contents($path, implode("\n", $lines) . "\n", LOCK_EX);
}

// Parse an Unraid sectioned INI (disks.ini): `["name"]` headers + key="value".
// PHP's parse_ini_file mangles quoted section names and some values, so we
// roll a small, predictable parser. Shared by main-state.php (snapshot) and
// main-smart.php (per-device SMART), so it lives here as the single source.
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

// Split disks.ini `id` ("MODEL_SERIAL") on the LAST underscore.
function modernui_split_model_serial(string $id): array
{
    $pos = strrpos($id, '_');
    if ($pos === false) {
        return [$id, ''];
    }
    return [substr($id, 0, $pos), substr($id, $pos + 1)];
}

// Read the plugin version from the `version` file the build emits into the
// payload root (one dir up from include/). Lets render-time PHP pages show the
// real version without hardcoding it. Returns '' if the file is missing.
function modernui_plugin_version(): string
{
    $path = dirname(__DIR__) . '/version';
    if (!is_file($path)) {
        return '';
    }
    return trim((string) file_get_contents($path));
}

function modernui_disabled_flag_path(string $cfgdir): string
{
    return rtrim($cfgdir, '/') . '/disabled';
}

function modernui_is_disabled(string $cfgdir): bool
{
    return is_file(modernui_disabled_flag_path($cfgdir));
}

function modernui_set_disabled(string $cfgdir, bool $disabled): void
{
    $path = modernui_disabled_flag_path($cfgdir);
    if ($disabled) {
        if (!is_dir($cfgdir)) {
            mkdir($cfgdir, 0755, true);
        }
        touch($path);
    } else {
        if (is_file($path)) {
            unlink($path);
        }
    }
}
