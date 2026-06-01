// Version-drift guard. package.json is the single source of truth for the
// plugin version (the asset build + PHP `version` file both derive from it).
// Three other files must agree or a release ships broken:
//   - package-lock.json (root `version` + the `packages[""]` self-entry)
//   - unraid-modernui.plg `<!ENTITY version "X">` — Unraid parses this before
//     any code runs, so it can't reference package.json; it must be kept in sync.
// Run locally (`npm run version:check`) and in CI to catch drift before tagging.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(file) {
  return readFileSync(join(root, file), 'utf8');
}

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const plgText = read('unraid-modernui.plg');

const source = pkg.version;
const plgMatch = plgText.match(/<!ENTITY version\s+"([^"]+)"/);

const checks = [
  ['package.json            version', source],
  ['package-lock.json       version', lock.version],
  ['package-lock.json packages[""]  ', lock.packages?.['']?.version],
  ['unraid-modernui.plg     ENTITY ', plgMatch ? plgMatch[1] : undefined],
];

let ok = true;
for (const [label, value] of checks) {
  const match = value === source;
  if (!match) ok = false;
  console.log(`  ${match ? '✓' : '✗'} ${label} → ${value ?? '(not found)'}`);
}

if (!ok) {
  console.error(
    `\n✗ Version drift: every file above must equal package.json (${source}).\n` +
      '  Bump package.json + package-lock.json + the .plg <!ENTITY version> to the same value.',
  );
  process.exit(1);
}

console.log(`\n✓ Versions in sync at ${source}`);
