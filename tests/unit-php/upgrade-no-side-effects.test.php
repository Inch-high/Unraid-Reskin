<?php
// Regression guard: requiring install.php or uninstall.php must NOT run their
// CLI bodies as a side effect. upgrade.php pulls both in for shared helpers
// (modernui_replace_file, modernui_restore_from_backup); before the fix in
// v0.5.5 those required files re-ran modernui_install() / modernui_uninstall()
// at the bottom because the CLI guard was just `PHP_SAPI === 'cli' &&
// !defined('MODERNUI_TESTING')`. The net effect on every event/disks_mounted
// fire was install → uninstall → upgrade_check, leaving the plugin uninstalled.
//
// We can't actually invoke modernui_install/uninstall here (they'd touch real
// /usr/local/emhttp paths), but we CAN verify the guard logic at the source
// level — the CLI block must include the realpath-vs-__FILE__ check.

$install_src   = file_get_contents(__DIR__ . '/../../package/include/install.php');
$uninstall_src = file_get_contents(__DIR__ . '/../../package/include/uninstall.php');

foreach (['install.php' => $install_src, 'uninstall.php' => $uninstall_src] as $name => $src) {
    assert(
        strpos($src, "realpath(\$_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)") !== false,
        "{$name} must guard its CLI block with a realpath(\$_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__) "
            . 'check — otherwise require_once from upgrade.php triggers a full install/uninstall as a surprise.'
    );
}

// Also lock in the SCRIPT_FILENAME isset() guard so include from web SAPI
// (where $_SERVER may not have SCRIPT_FILENAME) doesn't fatal-error.
foreach (['install.php' => $install_src, 'uninstall.php' => $uninstall_src] as $name => $src) {
    assert(
        strpos($src, "isset(\$_SERVER['SCRIPT_FILENAME'])") !== false,
        "{$name} must guard \$_SERVER['SCRIPT_FILENAME'] access with isset() "
            . 'so PHP-FPM / web-SAPI includes don\'t fatal.'
    );
}

echo "all upgrade-no-side-effects tests passed\n";
exit(0);
