import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requirePhp } from '../../tools/php-runtime.mjs';

const dir = dirname(fileURLToPath(import.meta.url));

const php = requirePhp();

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
