import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = process.argv[2];
if (!host) {
  console.error('Usage: npm run dev-mirror -- <user@unraidhost>');
  console.error('Optional: set MODERNUI_SSH_PORT for non-default SSH port (e.g. 22)');
  process.exit(2);
}

const port = process.env.MODERNUI_SSH_PORT;
const sshFlags = port ? ['-p', port] : [];
const scpFlags = port ? ['-P', port] : [];

const root = dirname(fileURLToPath(import.meta.url)) + '/..';

// 1. Build + package
const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status);
const pack = spawnSync('npm', ['run', 'package'], { cwd: root, stdio: 'inherit', shell: true });
if (pack.status !== 0) process.exit(pack.status);

const version = JSON.parse(spawnSync('node', ['-e', "process.stdout.write(JSON.stringify(require('./package.json').version))"], { cwd: root, encoding: 'utf8' }).stdout);
const txz = join(root, `dist/unraid-modernui-${version}.txz`);

// 2. Ensure remote cfg dir exists, then scp
const cfgDir = '/boot/config/plugins/unraid-modernui';
const mkdir = spawnSync('ssh', [...sshFlags, host, `mkdir -p ${cfgDir}`], { stdio: 'inherit' });
if (mkdir.status !== 0) process.exit(mkdir.status);

const scp = spawnSync('scp', [...scpFlags, txz, `${host}:${cfgDir}/`], { stdio: 'inherit' });
if (scp.status !== 0) process.exit(scp.status);

// 3. SSH: extract, run install.php
const remoteCmd = [
  `mkdir -p /usr/local/emhttp/plugins/unraid-modernui`,
  `tar -xJf ${cfgDir}/unraid-modernui-${version}.txz -C /usr/local/emhttp/plugins/unraid-modernui`,
  `chmod +x /usr/local/emhttp/plugins/unraid-modernui/event/* /usr/local/emhttp/plugins/unraid-modernui/scripts/rc.modernui 2>/dev/null || true`,
  `php /usr/local/emhttp/plugins/unraid-modernui/include/install.php`,
].join(' && ');

const ssh = spawnSync('ssh', [...sshFlags, host, remoteCmd], { stdio: 'inherit' });
process.exit(ssh.status ?? 0);
