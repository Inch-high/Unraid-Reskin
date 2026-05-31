<?php

require_once __DIR__ . '/../../package/include/helpers.php';

$tmp = tempnam(sys_get_temp_dir(), 'modernui_test_');

// parse_cfg should return empty array for empty file
$result = modernui_parse_cfg($tmp);
assert($result === [], 'empty file should yield empty array, got ' . var_export($result, true));

// write_cfg should round-trip a simple map
modernui_write_cfg($tmp, ['mode' => 'dark', 'density' => 'comfortable']);
$round = modernui_parse_cfg($tmp);
assert($round === ['mode' => 'dark', 'density' => 'comfortable'], 'round-trip failed: ' . var_export($round, true));

// parse_cfg should ignore comments and blank lines
file_put_contents($tmp, "# comment\n\nmode=light\n");
$result = modernui_parse_cfg($tmp);
assert($result === ['mode' => 'light'], 'should ignore comments/blanks, got ' . var_export($result, true));

// values with = signs in them should round-trip
modernui_write_cfg($tmp, ['accent' => '#ff8c2f']);
$result = modernui_parse_cfg($tmp);
assert($result === ['accent' => '#ff8c2f'], 'hex value round-trip failed: ' . var_export($result, true));

// is_disabled / set_disabled toggle a file-based flag
$flagdir = sys_get_temp_dir() . '/modernui_test_flagdir';
@mkdir($flagdir);
assert(modernui_is_disabled($flagdir) === false, 'should not be disabled initially');
modernui_set_disabled($flagdir, true);
assert(modernui_is_disabled($flagdir) === true, 'should be disabled after set');
modernui_set_disabled($flagdir, false);
assert(modernui_is_disabled($flagdir) === false, 'should not be disabled after unset');

unlink($tmp);
@rmdir($flagdir);

echo "all helpers tests passed\n";
exit(0);
