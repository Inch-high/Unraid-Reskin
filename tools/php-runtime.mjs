// Shared PHP-binary resolver used by the test runner (tests/unit-php/run-all.mjs)
// and the formatter runner (tools/php-cs-fixer.mjs).
//
// Resolution order: whatever `php` is on PATH first, then the known Windows
// winget/XAMPP install locations (dev boxes often have PHP installed but not
// exported onto a pre-existing shell's PATH).

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export function resolvePhp() {
  const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['php'], {
    encoding: 'utf8',
  });
  if (probe.status === 0) {
    const first = probe.stdout.split(/\r?\n/).filter(Boolean)[0];
    if (first) return first.trim();
  }
  if (process.platform === 'win32') {
    const candidates = [
      join(
        homedir(),
        'AppData/Local/Microsoft/WinGet/Packages/PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe/php.exe',
      ),
      join(
        homedir(),
        'AppData/Local/Microsoft/WinGet/Packages/PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe/php.exe',
      ),
      join(
        homedir(),
        'AppData/Local/Microsoft/WinGet/Packages/PHP.PHP.8.4_Microsoft.Winget.Source_8wekyb3d8bbwe/php.exe',
      ),
      'C:/php/php.exe',
      'C:/xampp/php/php.exe',
    ];
    for (const c of candidates) if (existsSync(c)) return c;
  }
  return null;
}

export function requirePhp() {
  const php = resolvePhp();
  if (!php) {
    console.error('error: php binary not found on PATH or in known Windows install locations');
    console.error(
      'install PHP via `winget install PHP.PHP.8.2` (matches Unraid 7.x) and reopen your shell',
    );
    process.exit(2);
  }
  return php;
}
