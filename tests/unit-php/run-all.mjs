import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const dir = dirname(fileURLToPath(import.meta.url));

function resolvePhp() {
  const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['php'], { encoding: 'utf8' });
  if (probe.status === 0) {
    const first = probe.stdout.split(/\r?\n/).filter(Boolean)[0];
    if (first) return first.trim();
  }
  if (process.platform === 'win32') {
    const candidates = [
      join(homedir(), 'AppData/Local/Microsoft/WinGet/Packages/PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe/php.exe'),
      join(homedir(), 'AppData/Local/Microsoft/WinGet/Packages/PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe/php.exe'),
      join(homedir(), 'AppData/Local/Microsoft/WinGet/Packages/PHP.PHP.8.4_Microsoft.Winget.Source_8wekyb3d8bbwe/php.exe'),
      'C:/php/php.exe',
      'C:/xampp/php/php.exe',
    ];
    for (const c of candidates) if (existsSync(c)) return c;
  }
  return null;
}

const php = resolvePhp();
if (!php) {
  console.error('error: php binary not found on PATH or in known Windows install locations');
  console.error('install PHP via `winget install PHP.PHP.8.2` (matches Unraid 7.x) and reopen your shell');
  process.exit(2);
}

const files = readdirSync(dir).filter(f => f.endsWith('.test.php'));

let failed = 0;
for (const f of files) {
  process.stdout.write(`▶ ${f}: `);
  const result = spawnSync(php, ['-d', 'zend.assertions=1', '-d', 'assert.exception=1', join(dir, f)], { encoding: 'utf8' });
  if (result.status === 0) {
    console.log('PASS');
  } else {
    console.log('FAIL');
    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
    failed += 1;
  }
}

process.exit(failed === 0 ? 0 : 1);
