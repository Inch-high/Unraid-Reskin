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
