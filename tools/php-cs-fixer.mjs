// Runs PHP-CS-Fixer over the server-side PHP layer.
//
//   node tools/php-cs-fixer.mjs           # rewrite files in place (npm run format:php)
//   node tools/php-cs-fixer.mjs --check   # dry-run + diff, non-zero on any change (npm run lint:php / CI)
//
// Self-contained: resolves the PHP binary (tools/php-runtime.mjs) and lazily
// downloads a PINNED php-cs-fixer.phar into tools/.cache/ (gitignored) so the
// exact same fixer version runs on a Windows dev box and on the Linux CI runner
// without needing Composer or a global install. Matches the project's existing
// "Node orchestrates the PHP tooling" pattern (run-all.mjs).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requirePhp } from './php-runtime.mjs';

const PHP_CS_FIXER_VERSION = '3.64.0';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const cacheDir = join(here, '.cache');
const pharPath = join(cacheDir, `php-cs-fixer-${PHP_CS_FIXER_VERSION}.phar`);
const configPath = join(repoRoot, '.php-cs-fixer.dist.php');

async function ensurePhar() {
  if (existsSync(pharPath)) return;
  const url = `https://github.com/PHP-CS-Fixer/PHP-CS-Fixer/releases/download/v${PHP_CS_FIXER_VERSION}/php-cs-fixer.phar`;
  console.log(`▶ fetching php-cs-fixer ${PHP_CS_FIXER_VERSION} → ${pharPath}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`error: failed to download php-cs-fixer.phar (HTTP ${res.status}) from ${url}`);
    process.exit(2);
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(pharPath, Buffer.from(await res.arrayBuffer()));
}

const check = process.argv.includes('--check');

await ensurePhar();
const php = requirePhp();

const args = [pharPath, 'fix', `--config=${configPath}`];
if (check) args.push('--dry-run', '--diff');

const result = spawnSync(php, args, { stdio: 'inherit', cwd: repoRoot });
process.exit(result.status ?? 1);
