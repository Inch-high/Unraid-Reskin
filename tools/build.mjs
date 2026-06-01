import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
import { build as viteBuild } from 'vite';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const distDir = join(root, 'package/theme/dist');

if (existsSync(distDir)) rmSync(distDir, { recursive: true });
mkdirSync(distDir, { recursive: true });

// Emit the plugin version into the payload so render-time PHP pages (Theme.page)
// can show the real version instead of a hardcoded literal. Ships in the txz, so
// it's present after both `dev-mirror` and a real .plg install.
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
writeFileSync(join(root, 'package/version'), pkgVersion + '\n');
console.log(`✓ version (${pkgVersion})`);

// Build CSS
const css = sass.compile(join(root, 'src/styles/modernui.scss'), { style: 'compressed' });
writeFileSync(join(distDir, 'modernui.css'), css.css);
console.log(`✓ modernui.css (${css.css.length} bytes)`);

// Build JS entries via Vite — produces modernui.js, re-enable.js, modernui-dashboard.js, modernui-docker.js, modernui-main.js
for (const entry of [
  'modernui',
  're-enable',
  'modernui-dashboard',
  'modernui-docker',
  'modernui-main',
]) {
  await viteBuild({
    root,
    define: { __MODERNUI_VERSION__: JSON.stringify(pkgVersion) },
    build: {
      outDir: distDir,
      emptyOutDir: false,
      lib: {
        entry: join(root, `src/ts/${entry}.ts`),
        name: entry.replace(/-/g, '_'),
        formats: ['iife'],
        fileName: () => `${entry}.js`,
      },
      minify: true,
    },
    configFile: false,
    logLevel: 'warn',
  });
  console.log(`✓ ${entry}.js`);
}

// Mark event scripts executable so they run on Unraid
for (const f of ['started', 'stopped', 'disks_mounted']) {
  const p = join(root, 'package/event', f);
  if (existsSync(p)) chmodSync(p, 0o755);
}

console.log('Build complete →', distDir);
