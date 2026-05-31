#!/usr/bin/env node
// Captures one HTML fixture file per <tbody> inside <table class="dashboard">
// from the live Unraid box's /Dashboard page. Writes to
// src/ts/dashboard/extractors/__fixtures__/.
//
// Strategy:
//   1. SSH in and find an active PHP session (must have unraid_login set)
//   2. From inside the box, curl http://localhost/Dashboard with that session
//      cookie -- this bypasses the nginx auth_request wall because the cookie
//      is a real authenticated session.
//   3. Locally, regex-split the HTML into one fixture per <tbody>, naming
//      each by its title= attribute (falls back to id, then class, then index).
//
// Why split locally rather than via remote PHP heredoc:
//   Nested escaping (JS backticks -> SSH shell -> PHP heredoc) is fragile.
//   Splitting client-side after fetching the raw HTML is straightforward.
//
// Usage:  MODERNUI_SSH_PORT=22 node tools/capture-fixtures.mjs <your-unraid-host>

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = process.argv[2];
if (!host) {
  console.error('Usage: node tools/capture-fixtures.mjs <user@host>');
  console.error('Optional env: MODERNUI_SSH_PORT (default 22)');
  process.exit(2);
}
const port = process.env.MODERNUI_SSH_PORT;
const sshFlags = port ? ['-p', port] : [];

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const outDir = join(root, 'src/ts/dashboard/extractors/__fixtures__');
mkdirSync(outDir, { recursive: true });

// Step 1: Find an active session file on the box.
// Unraid's local_prepend.php sets the session cookie name to
// "unraid_" + md5(strstr(HTTP_HOST.':', ':', true)). We use Host: localhost,
// so the cookie name is "unraid_" + md5("localhost").
const cookieName = 'unraid_' + createHash('md5').update('localhost').digest('hex');

// Remote command: find the newest session file that has unraid_login set.
// Using basename + sed to strip the "sess_" prefix and get the raw session id.
const findSessionCmd =
  `ls -t /var/lib/php/sess_* 2>/dev/null | ` +
  `while read f; do if grep -q unraid_login "$f"; then ` +
  `basename "$f" | sed 's/^sess_//'; break; fi; done`;

const findSession = spawnSync('ssh', [...sshFlags, host, findSessionCmd], { encoding: 'utf8' });
if (findSession.status !== 0) {
  console.error('SSH failed while searching for session:', findSession.stderr);
  process.exit(1);
}
const sessionId = findSession.stdout.trim();
if (!sessionId) {
  console.error('No authenticated PHP session found on the box.');
  console.error('Log in to the Unraid webGUI in a browser at least once, then retry.');
  process.exit(1);
}
console.log(`Using session ${cookieName}=${sessionId.slice(0, 8)}...`);

// Step 2: Fetch /Dashboard via curl from inside the box with that cookie.
const fetchCmd =
  `curl -sS -H 'Host: localhost' --cookie '${cookieName}=${sessionId}' ` +
  `http://localhost/Dashboard`;

const fetched = spawnSync('ssh', [...sshFlags, host, fetchCmd], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (fetched.status !== 0) {
  console.error('SSH/curl failed:', fetched.stderr);
  process.exit(1);
}
const html = fetched.stdout;
if (!html || html.length < 1000) {
  console.error('Fetched HTML is suspiciously short:', html.length, 'bytes');
  console.error('First 500 chars:', html.slice(0, 500));
  process.exit(1);
}
if (/<title>30[12] /.test(html) || /Location:\s*\/login/i.test(html)) {
  console.error('Got a redirect instead of /Dashboard -- session likely expired.');
  console.error('First 500 chars:', html.slice(0, 500));
  process.exit(1);
}
console.log(`Fetched ${html.length} bytes of dashboard HTML.`);

// Step 3: Split into fixtures. Match each <tbody ...>...</tbody>.
// The Unraid dashboard uses non-nested tbodys (one per widget tile), so
// a non-greedy match against the opening + closing tags is sufficient.
const tbodyRe = /<tbody\b[^>]*>[\s\S]*?<\/tbody>/g;
const matches = html.match(tbodyRe) || [];
if (matches.length === 0) {
  console.error('No <tbody> elements found in the fetched HTML.');
  process.exit(1);
}

// Attribute extraction from the tbody open tag only (not the body).
const openTagRe = /^<tbody\b[^>]*>/;
const attrRe = (name) => new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i');

const usedNames = new Map(); // base name -> count, used for disambiguation
function uniqueName(base) {
  const safe = base
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const key = safe || 'anon';
  const n = usedNames.get(key) ?? 0;
  usedNames.set(key, n + 1);
  return n === 0 ? key : `${key}_${n + 1}`;
}

let count = 0;
const written = [];
for (let i = 0; i < matches.length; i++) {
  const tb = matches[i];
  const openTag = (tb.match(openTagRe) || [''])[0];
  const idMatch = openTag.match(attrRe('id'));
  const titleMatch = openTag.match(attrRe('title'));
  const classMatch = openTag.match(attrRe('class'));
  const base = idMatch?.[1] || titleMatch?.[1] || classMatch?.[1] || `anon_${i}`;
  const safeName = uniqueName(base);
  const outPath = join(outDir, `${safeName}.html`);
  writeFileSync(outPath, tb + '\n');
  count++;
  written.push(safeName);
  console.log(`  wrote ${safeName}.html (${tb.length} bytes)`);
}

console.log(`\nCaptured ${count} fixtures -> ${outDir}`);
console.log('Names:', written.join(', '));
