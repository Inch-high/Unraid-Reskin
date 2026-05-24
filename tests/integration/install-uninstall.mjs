import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = process.env.MODERNUI_TEST_HOST;
if (!host) {
  console.error('Set MODERNUI_TEST_HOST=user@unraidhost before running.');
  process.exit(2);
}

// Set this to the same path you used for MODERNUI_LAYOUT_FILE in install.php (Task 7 Step 0).
const LAYOUT_FILE = process.env.MODERNUI_LAYOUT_FILE
  || '/usr/local/emhttp/plugins/dynamix/include/DefaultPageLayout.php';

const root = dirname(fileURLToPath(import.meta.url)) + '/../..';

const port = process.env.MODERNUI_SSH_PORT;
const sshFlags = port ? ['-p', port] : [];

function ssh(cmd, opts = {}) {
  const r = spawnSync('ssh', [...sshFlags, host, cmd], { encoding: 'utf8' });
  if (r.status !== 0 && !opts.allowFail) {
    console.error('SSH command failed:', cmd);
    console.error(r.stderr);
    process.exit(1);
  }
  return r.stdout.trim();
}

function sha(path) {
  return ssh(`sha256sum ${path} 2>/dev/null | cut -d' ' -f1 || echo MISSING`);
}

console.log('▶ ensuring clean state — uninstall if theme is currently installed…');
ssh('test -f /usr/local/emhttp/plugins/unraid-modernui/include/uninstall.php && php /usr/local/emhttp/plugins/unraid-modernui/include/uninstall.php || echo "(not installed, skipping uninstall)"', { allowFail: true });

console.log('▶ capturing pre-install state…');
const preDynamix = sha('/boot/config/plugins/dynamix/dynamix.cfg');
const preLayout  = sha(LAYOUT_FILE);
console.log('  dynamix.cfg SHA:', preDynamix);
console.log('  layout SHA:     ', preLayout);

console.log('▶ installing plugin via dev-mirror…');
const install = spawnSync('node', [join(root, 'tools/dev-mirror.mjs'), host], { stdio: 'inherit', env: process.env });
if (install.status !== 0) { console.error('install failed'); process.exit(1); }

console.log('▶ verifying installed state…');
// dynamix.cfg should NOT have our marker (we don't touch it as of v0.1.1)
const dynamixBlock = ssh('n=$(grep -c "unraid-modernui begin" /boot/config/plugins/dynamix/dynamix.cfg 2>/dev/null || true); echo "$n"');
if (dynamixBlock !== '0') { console.error('FAIL: dynamix.cfg should have no modernui block, got', dynamixBlock); process.exit(1); }
// Layout file must have exactly one marker (the <link>+<script> injection point)
const layoutBlock = ssh(`grep -c "unraid-modernui:begin" ${LAYOUT_FILE}`);
if (layoutBlock !== '1') { console.error('FAIL: expected one modernui:begin marker in layout, got', layoutBlock); process.exit(1); }
// And it should contain both the stylesheet link and the loader script
const linkPresent = ssh(`grep -c 'rel="stylesheet" href="/plugins/unraid-modernui/theme/dist/modernui.css"' ${LAYOUT_FILE}`);
if (linkPresent !== '1') { console.error('FAIL: stylesheet link not found in layout, got count', linkPresent); process.exit(1); }
const scriptPresent = ssh(`grep -c 'src="/plugins/unraid-modernui/theme/dist/loader.js"' ${LAYOUT_FILE}`);
if (scriptPresent !== '1') { console.error('FAIL: loader script not found in layout, got count', scriptPresent); process.exit(1); }
const cssExists    = ssh('test -f /usr/local/emhttp/plugins/unraid-modernui/theme/dist/modernui.css && echo yes || echo no');
if (cssExists    !== 'yes') { console.error('FAIL: modernui.css not present'); process.exit(1); }
const loaderExists = ssh('test -f /usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js && echo yes || echo no');
if (loaderExists !== 'yes') { console.error('FAIL: loader.js not present'); process.exit(1); }

console.log('▶ uninstalling…');
ssh('php /usr/local/emhttp/plugins/unraid-modernui/include/uninstall.php');

console.log('▶ verifying restored state…');
const postDynamix = sha('/boot/config/plugins/dynamix/dynamix.cfg');
const postLayout  = sha(LAYOUT_FILE);
if (postDynamix !== preDynamix) {
  console.error('FAIL: dynamix.cfg SHA mismatch'); console.error('  pre:', preDynamix); console.error('  post:', postDynamix); process.exit(1);
}
if (postLayout !== preLayout) {
  console.error(`FAIL: ${LAYOUT_FILE} SHA mismatch`); console.error('  pre:', preLayout); console.error('  post:', postLayout); process.exit(1);
}

console.log('▶ re-installing to leave the box in installed state (since user is testing live)…');
const reinstall = spawnSync('node', [join(root, 'tools/dev-mirror.mjs'), host], { stdio: 'inherit', env: process.env });
if (reinstall.status !== 0) { console.error('re-install failed'); process.exit(1); }

console.log('✓ install → verify → uninstall → verify passed (both dynamix.cfg and layout file restored byte-identical)');
console.log('✓ theme re-installed so user can continue using it');
