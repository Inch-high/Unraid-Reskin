import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const distRoot = join(root, 'dist');
const pkgDir = join(root, 'package');

if (!existsSync(distRoot)) mkdirSync(distRoot);

// Unraid's PageBuilder splits .page files on "\n---\n" — a Windows working tree
// with core.autocrlf=true tainted Theme.page with CRLF and the split silently
// failed, hiding the page from Settings → User Preferences. .gitattributes is
// the primary defense; this pass is a belt-and-braces for any path that bypassed
// it (a fresh clone without renormalize, a third-party editor that re-saved with
// CRLF, etc).
const TEXT_EXTS = new Set([
  '.page',
  '.php',
  '.cfg',
  '.plg',
  '.html',
  '.css',
  '.scss',
  '.js',
  '.mjs',
  '.ts',
  '.json',
  '.md',
  '.sh',
  '.svg',
  '.xml',
]);

function normalizeCrlf(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      normalizeCrlf(full);
      continue;
    }
    if (!TEXT_EXTS.has(extname(name))) continue;
    const buf = readFileSync(full);
    if (!buf.includes(0x0d)) continue; // no CR present, leave alone
    const cleaned = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    if (cleaned.length !== buf.length) {
      writeFileSync(full, cleaned);
      console.log(`normalized CRLF → LF: ${full.slice(pkgDir.length + 1)}`);
    }
  }
}

normalizeCrlf(pkgDir);

const version = JSON.parse(
  spawnSync(
    'node',
    ['-e', "process.stdout.write(JSON.stringify(require('./package.json').version))"],
    { cwd: root, encoding: 'utf8' },
  ).stdout,
);
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
  console.error(
    'tar failed. On Windows ensure you have a recent Win10 build (tar.exe is built-in).',
  );
  process.exit(1);
}
console.log(`Packaged → ${out}`);
