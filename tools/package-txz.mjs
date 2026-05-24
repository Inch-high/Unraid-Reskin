import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const distRoot = join(root, 'dist');
const pkgDir = join(root, 'package');

if (!existsSync(distRoot)) mkdirSync(distRoot);

const version = JSON.parse(spawnSync('node', ['-e', "process.stdout.write(JSON.stringify(require('./package.json').version))"], { cwd: root, encoding: 'utf8' }).stdout);
const out = join(distRoot, `unraid-modernui-${version}.txz`);

// On Windows we use built-in tar (Win10+, libarchive/bsdtar) explicitly — Git-for-Windows GNU tar
// mis-parses drive letters like "C:\…" as remote hosts and fails with "Cannot connect to C:".
// On other platforms, the PATH `tar` is fine.
// Build artifacts (package/theme/dist/) must be present — call `npm run build` first.
const isWin = platform() === 'win32';
const tarBin = isWin ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
const tarArgs = ['-cJf', out, '-C', pkgDir, '.'];
const result = spawnSync(tarBin, tarArgs, { stdio: 'inherit' });
if (result.status !== 0) {
  console.error('tar failed. On Windows ensure you have a recent Win10 build (tar.exe is built-in).');
  process.exit(1);
}
console.log(`Packaged → ${out}`);
