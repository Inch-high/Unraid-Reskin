# Unraid ModernUI Dashboard Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Unraid 7.x's stock `/Dashboard` rendering with a hero-strip + grouped-sections layout. Hide the existing `table.dashboard` source via a body class; observe its mutations; render structured state into Lit-based web components. Ship as v0.3.0.

**Architecture:** A new `modernui-dashboard.js` bundle loads on every page (via Phase 1's `loader.js`) but exits early on non-Dashboard pages. On `/Dashboard*`, it adds `body.modernui-dashboard-active` (hides Unraid's `div.frame > div.grid`), mounts `<modernui-dashboard>` (Lit web component with Shadow DOM), wires a debounced `MutationObserver` against the hidden `table.dashboard`, dispatches per-tbody to typed extractors, stores results in a reactive store, and re-renders cards. Unrecognized tbodies fall through to a mirror tier that preserves original innerHTML.

**Tech Stack:** Lit 3 (~5 KB gzipped) for web components; TypeScript + Vite (existing Phase 1 build pipeline); Vitest + jsdom (existing) for extractor/component tests; SSH-driven `tools/capture-fixtures.mjs` (new) for live HTML fixture capture.

---

## File Structure

End-state layout (additions to v0.2 tree):

```
src/ts/dashboard/
├── boot.ts                          Page detection + mount entry; called from modernui.ts
├── source-observer.ts               MutationObserver wrapper with 50ms debounce
├── store.ts                         Simple reactive store (Map + subscribe/notify)
├── types.ts                         All WidgetState interfaces, exported union
├── extractors/
│   ├── index.ts                     Ordered registry + dispatch + match-or-mirror
│   ├── unknown.ts                   Catch-all (raw innerHTML)
│   ├── identity.ts
│   ├── array.ts
│   ├── cache.ts
│   ├── parity.ts
│   ├── disklocation.ts
│   ├── processor.ts
│   ├── system.ts                    Memory pies
│   ├── gpu.ts
│   ├── ipmi.ts
│   ├── docker.ts                    folder.view2 aware
│   ├── vms.ts
│   ├── interface.ts
│   ├── ups.ts
│   ├── motherboard.ts
│   ├── shares.ts
│   ├── users.ts
│   └── __fixtures__/                Captured HTML, one file per widget
└── components/
    ├── md-dashboard.ts              Root <modernui-dashboard>, owns the section grid
    ├── md-section.ts                Themed section with header + grid body
    ├── md-card.ts                   Base card primitive (header + body slots)
    ├── md-hero-strip.ts             Top metrics row
    ├── md-hero-card.ts              Individual hero cell
    ├── md-plugin-card.ts            Mirror tier (raw innerHTML projection)
    ├── md-sparkline.ts              Shared sparkline subcomponent
    ├── md-identity-card.ts
    ├── md-array-card.ts
    ├── md-cache-card.ts
    ├── md-parity-card.ts
    ├── md-disklocation-card.ts
    ├── md-processor-card.ts
    ├── md-memory-card.ts
    ├── md-gpu-card.ts
    ├── md-ipmi-card.ts
    ├── md-docker-card.ts
    ├── md-vms-card.ts
    ├── md-interface-card.ts
    ├── md-ups-card.ts
    ├── md-motherboard-card.ts
    ├── md-shares-card.ts
    └── md-users-card.ts

src/styles/
└── dashboard-overlay.scss           CSS to hide stock dashboard when our overlay is active

tools/
└── capture-fixtures.mjs             SSH to live Unraid box, capture tbody HTML

tests/unit-ts/dashboard/
├── source-observer.test.ts
├── store.test.ts
└── extractors/
    └── (one *.test.ts per extractor)
```

**Responsibility split:**

- `boot.ts` decides if we're on the dashboard page; everything else only runs if yes
- `source-observer.ts` doesn't know about extractors; it just notifies on `tbody` mutations
- `store.ts` doesn't know about specific widget shapes; it stores opaque `WidgetState` values
- Each extractor file owns its `match()` + `extract()` + type re-export
- Each component file owns one Lit element; cards subscribe to store for their slice
- `index.ts` (extractors) is the only place that knows the full registry order

---

## Plan-Wide Conventions

**TDD rhythm for extractors:**

1. Capture (or reuse) the widget's HTML fixture
2. Add the state interface to `types.ts`
3. Write a failing test that parses the fixture and asserts extracted values
4. Run test → fails because extractor doesn't exist
5. Implement the extractor (match + extract)
6. Register it in `extractors/index.ts`
7. Run test → passes

**TDD rhythm for components:**

1. Smoke-test: render with a sample state, assert key text/structure
2. Implement the Lit component
3. Re-run smoke test → passes

**Commits:**

- One commit per task (after all steps pass)
- Conventional Commits: `feat(dashboard): add <widget> extractor and card`
- Per-widget tasks: extractor + component + tests in one commit

**Deploy cadence:**

- Foundation tasks deploy when there's something visible (Task 6 first)
- Per-widget tasks deploy at the end of each section group (Storage / Compute / etc.)
- Hero strip + release task is the final deploy

**Fixture-capture protocol:**

Fixtures live in `src/ts/dashboard/extractors/__fixtures__/`. They're captured once by Task 4's `tools/capture-fixtures.mjs` script. If a widget's selectors change in a future Unraid release, re-run the script to refresh the fixtures and update the affected extractor.

---

## Task 1: Lit dependency + dashboard bundle + types skeleton

**Files:**
- Modify: `package.json`
- Modify: `tools/build.mjs`
- Create: `src/ts/dashboard/types.ts`
- Modify: `src/ts/modernui.ts`

- [ ] **Step 1: Install Lit 3**

Run via PowerShell:

```powershell
cd "C:\Users\<user>\Documents\Projects\Unraid Theme"; npm install lit@^3.1.0
```

Expected: `lit` added to `dependencies` in `package.json`. Lock file updated.

- [ ] **Step 2: Skeleton `src/ts/dashboard/types.ts`**

Create the file with the union and a placeholder. Real interfaces are added as each widget task lands.

```typescript
// All widget state interfaces live here. Each extractor's task adds its own.
// This file is the canonical source for the WidgetState union and the WidgetKind enum.

export type WidgetKind =
  | 'identity'
  | 'array'
  | 'cache'
  | 'parity'
  | 'disklocation'
  | 'processor'
  | 'system'
  | 'gpu'
  | 'ipmi'
  | 'docker'
  | 'vms'
  | 'interface'
  | 'ups'
  | 'motherboard'
  | 'shares'
  | 'users'
  | 'unknown';

export interface UnknownWidget {
  kind: 'unknown';
  id: string;
  hint: string;
  innerHTML: string;
}

// Per-widget interfaces extend this with kind: '<their-kind>'.
// Added incrementally; see each widget's task.

export type WidgetState = UnknownWidget;
// As widget interfaces are added, this expands to:
// export type WidgetState = UnknownWidget | ArrayState | CacheState | ...
```

- [ ] **Step 3: Add the dashboard bundle to `tools/build.mjs`**

Modify the Vite-build loop in `tools/build.mjs` to include the new entry point. Change the entries array from:

```javascript
for (const entry of ['modernui', 're-enable']) {
```

to:

```javascript
for (const entry of ['modernui', 're-enable', 'modernui-dashboard']) {
```

The rest of the loop stays the same (each entry builds as an IIFE bundle).

- [ ] **Step 4: Create placeholder entry**

Create `src/ts/dashboard/boot.ts` with a minimal no-op so the build doesn't fail:

```typescript
// Will be filled in by Task 2. For now just exports a noop so the bundle builds.
export function boot(): void {
  // intentionally empty until Task 2
}
```

Create `src/ts/modernui-dashboard.ts` (top-level entry that becomes the IIFE):

```typescript
import { boot } from './dashboard/boot';

boot();
```

- [ ] **Step 5: Build and verify the new bundle exists**

```powershell
npm run build
```

Expected output includes:

```
✓ modernui.css (...)
✓ modernui.js
✓ re-enable.js
✓ modernui-dashboard.js
Build complete → .../package/theme/dist
```

Confirm `package/theme/dist/modernui-dashboard.js` exists and contains Lit's import shims (search for `lit-html` in the minified output).

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json tools/build.mjs src/ts/dashboard/types.ts src/ts/dashboard/boot.ts src/ts/modernui-dashboard.ts
git commit -m "chore(dashboard): scaffold Lit-based dashboard bundle and types skeleton"
```

---

## Task 2: Boot + hide-source via body class

**Files:**
- Modify: `src/ts/dashboard/boot.ts`
- Create: `src/styles/dashboard-overlay.scss`
- Modify: `src/styles/modernui.scss`
- Modify: `package/include/install.php` (loader.js generation needs to include the dashboard bundle)

- [ ] **Step 1: Implement `boot.ts` page detection + body class**

Replace contents of `src/ts/dashboard/boot.ts`:

```typescript
// Page detection. Returns true if we're on /Dashboard*; false otherwise.
function onDashboardPage(): boolean {
  return /^\/Dashboard/i.test(window.location.pathname);
}

// Wait up to `timeoutMs` for the source table.dashboard to appear in the DOM.
// Calls `onReady` with the element once it's present, or `onTimeout` if not seen in time.
function waitForSource(
  timeoutMs: number,
  onReady: (el: HTMLTableElement) => void,
  onTimeout: () => void,
): void {
  const existing = document.querySelector<HTMLTableElement>('table.dashboard');
  if (existing) {
    onReady(existing);
    return;
  }
  const observer = new MutationObserver(() => {
    const found = document.querySelector<HTMLTableElement>('table.dashboard');
    if (found) {
      observer.disconnect();
      clearTimeout(timeoutHandle);
      onReady(found);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const timeoutHandle = window.setTimeout(() => {
    observer.disconnect();
    onTimeout();
  }, timeoutMs);
}

export function boot(): void {
  if (!onDashboardPage()) return;

  waitForSource(
    5000,
    (source) => {
      // Hide Unraid's stock dashboard by toggling a body class.
      // CSS in dashboard-overlay.scss handles the actual display:none.
      document.body.classList.add('modernui-dashboard-active');

      // Mount placeholder will come in Task 6. For now just log.
      console.log('[modernui-dashboard] booted, source detected', source);
    },
    () => {
      console.warn('[modernui-dashboard] source not found within 5s; leaving stock UI');
    },
  );
}
```

- [ ] **Step 2: Create the overlay stylesheet**

Create `src/styles/dashboard-overlay.scss`:

```scss
// When our dashboard overlay is active, hide Unraid's stock dashboard tile grid.
// The table.dashboard element stays in the DOM (Unraid's nchan subscribers keep
// updating it), but it's not visible to the user.

body.modernui-dashboard-active {
  // Hide the tile grid Unraid renders
  div.frame > div.grid {
    display: none !important;
  }

  // Hide the stopgap rows and any leftover dashboard chrome
  table.dashboard {
    display: none !important;
  }
}
```

- [ ] **Step 3: Wire the new stylesheet into `modernui.scss`**

Modify `src/styles/modernui.scss` — replace contents:

```scss
@use "tokens";
@use "unraid-tokens";
@use "base";
@use "dashboard-overlay";
@use "components";
```

- [ ] **Step 4: Update install.php to load the dashboard bundle from loader.js**

Modify `package/include/install.php`'s `modernui_generate_loader_js()` function. Find the block that constructs the loader script and change the target list. The current function loads either `modernui.js` or `re-enable.js`. The new behavior: when enabled, ALSO load `modernui-dashboard.js` as a separate script. Replace the function body:

```php
function modernui_generate_loader_js(bool $disabled): void {
    $target = $disabled ? 're-enable.js' : 'modernui.js';
    $settings = modernui_parse_cfg('/boot/config/plugins/unraid-modernui/settings.cfg');
    $mode = $settings['mode'] ?? 'system';
    $density = $settings['density'] ?? 'comfortable';
    $extraScript = $disabled
        ? ''
        : "var d=document.createElement('script');\n"
          . "d.src='/plugins/unraid-modernui/theme/dist/modernui-dashboard.js';\n"
          . "document.head.appendChild(d);\n";
    $loader = "(function(){\n"
        . "var r=document.documentElement;\n"
        . "r.dataset.modernuiMode=" . json_encode($mode) . ";\n"
        . "r.dataset.modernuiDensity=" . json_encode($density) . ";\n"
        . "var s=document.createElement('script');\n"
        . "s.src='/plugins/unraid-modernui/theme/dist/" . $target . "';\n"
        . "document.head.appendChild(s);\n"
        . $extraScript
        . "})();\n";
    $loaderPath = '/usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js';
    file_put_contents($loaderPath, $loader, LOCK_EX);
}
```

When the theme is disabled, `modernui-dashboard.js` is NOT loaded — same fallback behavior. When enabled, both bundles load.

- [ ] **Step 5: Build, deploy, verify hide works**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Then open `http://<your-unraid-host>/Dashboard` and hard-refresh. **Expected:** dashboard area is now empty (Unraid's stock grid is hidden), browser console shows `[modernui-dashboard] booted, source detected ...`. The page still has the top nav and bottom bar — only the dashboard content area is empty. This is correct; Task 6 will mount the new UI.

Verify the fallback works: navigate to `http://<your-unraid-host>/Dashboard?modernui=off`. Stock dashboard should reappear (because our JS short-circuits before adding the body class).

- [ ] **Step 6: Commit**

```powershell
git add src/ts/dashboard/boot.ts src/styles/dashboard-overlay.scss src/styles/modernui.scss package/include/install.php
git commit -m "feat(dashboard): hide stock grid behind body class on /Dashboard*"
```

---

## Task 3: Source observer + reactive store (TDD)

**Files:**
- Create: `src/ts/dashboard/source-observer.ts`
- Create: `src/ts/dashboard/store.ts`
- Create: `tests/unit-ts/dashboard/source-observer.test.ts`
- Create: `tests/unit-ts/dashboard/store.test.ts`

- [ ] **Step 1: Write failing test for `store.ts`**

Create `tests/unit-ts/dashboard/store.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../../../src/ts/dashboard/store';

describe('dashboard store', () => {
  it('stores widget state under a key', () => {
    const store = createStore();
    store.set('tbody1', { kind: 'unknown', id: 'tbody1', hint: '', innerHTML: '' });
    expect(store.get('tbody1')?.kind).toBe('unknown');
  });

  it('notifies subscribers when state changes', () => {
    const store = createStore();
    const cb = vi.fn();
    store.subscribe(cb);
    store.set('tbody1', { kind: 'unknown', id: 'tbody1', hint: '', innerHTML: '' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('skips notify when set with identical value (cheap dedupe)', () => {
    const store = createStore();
    const cb = vi.fn();
    store.subscribe(cb);
    const v = { kind: 'unknown' as const, id: 'tbody1', hint: '', innerHTML: '<p>x</p>' };
    store.set('tbody1', v);
    store.set('tbody1', { ...v });  // same shape, different reference
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('removes widget on delete and notifies', () => {
    const store = createStore();
    store.set('tbody1', { kind: 'unknown', id: 'tbody1', hint: '', innerHTML: '' });
    const cb = vi.fn();
    store.subscribe(cb);
    store.delete('tbody1');
    expect(store.get('tbody1')).toBeUndefined();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications', () => {
    const store = createStore();
    const cb = vi.fn();
    const unsub = store.subscribe(cb);
    unsub();
    store.set('tbody1', { kind: 'unknown', id: 'tbody1', hint: '', innerHTML: '' });
    expect(cb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
npm run test:ts
```

Expected: fails with "Failed to resolve import '../../../src/ts/dashboard/store'".

- [ ] **Step 3: Implement `store.ts`**

Create `src/ts/dashboard/store.ts`:

```typescript
import type { WidgetState } from './types';

export interface DashboardStore {
  get(id: string): WidgetState | undefined;
  set(id: string, value: WidgetState): void;
  delete(id: string): void;
  keys(): IterableIterator<string>;
  subscribe(callback: () => void): () => void;
}

// Shallow JSON-compare for dedupe. Widget state is small and serializable.
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createStore(): DashboardStore {
  const data = new Map<string, WidgetState>();
  const subscribers = new Set<() => void>();

  const notify = () => {
    for (const cb of subscribers) cb();
  };

  return {
    get: (id) => data.get(id),
    set: (id, value) => {
      const prev = data.get(id);
      if (prev !== undefined && shallowEqual(prev, value)) return;
      data.set(id, value);
      notify();
    },
    delete: (id) => {
      if (!data.has(id)) return;
      data.delete(id);
      notify();
    },
    keys: () => data.keys(),
    subscribe: (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb) as unknown as void;
    },
  };
}
```

- [ ] **Step 4: Run test → passes**

```powershell
npm run test:ts
```

Expected: 5 new tests pass; existing tests still pass.

- [ ] **Step 5: Write failing test for `source-observer.ts`**

Create `tests/unit-ts/dashboard/source-observer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSourceObserver } from '../../../src/ts/dashboard/source-observer';

describe('source observer', () => {
  let table: HTMLTableElement;

  beforeEach(() => {
    document.body.innerHTML = '<table class="dashboard"><tbody id="t1"><tr><td>a</td></tr></tbody></table>';
    table = document.querySelector('table.dashboard')!;
  });

  it('fires onChange once after a mutation', async () => {
    const onChange = vi.fn();
    const obs = createSourceObserver(table, onChange, 10);
    obs.start();

    const tbody = table.querySelector('tbody')!;
    tbody.querySelector('td')!.textContent = 'b';

    await new Promise((r) => setTimeout(r, 30));
    expect(onChange).toHaveBeenCalledTimes(1);
    obs.stop();
  });

  it('debounces multiple rapid mutations into one fire', async () => {
    const onChange = vi.fn();
    const obs = createSourceObserver(table, onChange, 20);
    obs.start();

    const tbody = table.querySelector('tbody')!;
    for (let i = 0; i < 5; i++) {
      tbody.querySelector('td')!.textContent = `v${i}`;
    }

    await new Promise((r) => setTimeout(r, 50));
    expect(onChange).toHaveBeenCalledTimes(1);
    obs.stop();
  });

  it('stop() prevents further fires', async () => {
    const onChange = vi.fn();
    const obs = createSourceObserver(table, onChange, 10);
    obs.start();
    obs.stop();

    table.querySelector('td')!.textContent = 'changed';
    await new Promise((r) => setTimeout(r, 30));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run to verify failure**

```powershell
npm run test:ts
```

Expected: fails to resolve `source-observer`.

- [ ] **Step 7: Implement `source-observer.ts`**

Create `src/ts/dashboard/source-observer.ts`:

```typescript
export interface SourceObserver {
  start(): void;
  stop(): void;
}

// Watches a <table.dashboard> for subtree changes and calls onChange at most once
// per debounceMs window (trailing edge).
export function createSourceObserver(
  source: Element,
  onChange: () => void,
  debounceMs: number = 50,
): SourceObserver {
  let timer: number | null = null;
  let observer: MutationObserver | null = null;

  const schedule = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = null;
      onChange();
    }, debounceMs);
  };

  return {
    start: () => {
      if (observer) return;
      observer = new MutationObserver(schedule);
      observer.observe(source, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });
    },
    stop: () => {
      observer?.disconnect();
      observer = null;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    },
  };
}
```

- [ ] **Step 8: Run all tests → pass**

```powershell
npm run test:ts
```

Expected: 8 new tests pass (5 store + 3 observer), existing 13 still pass.

- [ ] **Step 9: Commit**

```powershell
git add src/ts/dashboard/source-observer.ts src/ts/dashboard/store.ts tests/unit-ts/dashboard/
git commit -m "feat(dashboard): add reactive store and debounced source observer (TDD)"
```

---

## Task 4: Capture-fixtures tool

**Files:**
- Create: `tools/capture-fixtures.mjs`
- Create: `src/ts/dashboard/extractors/__fixtures__/.gitkeep`
- Run: capture all fixtures from the live box

- [ ] **Step 1: Create the capture script**

Create `tools/capture-fixtures.mjs`:

```javascript
#!/usr/bin/env node
// Captures one HTML fixture file per <tbody> inside <table class="dashboard">
// from the live Unraid box's /Dashboard page. Writes to
// src/ts/dashboard/extractors/__fixtures__/.
//
// Usage:  MODERNUI_SSH_PORT=22 node tools/capture-fixtures.mjs <your-unraid-host>

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
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

// Fetch /Dashboard HTML via curl from the box itself (avoids auth issues).
// Then run a small PHP one-liner that splits tbody children out.
const remoteScript = `
php -r '
$html = file_get_contents("http://localhost/Dashboard");
if ($html === false) { fwrite(STDERR, "fetch failed\\n"); exit(1); }
preg_match_all("#<tbody[^>]*>.*?</tbody>#is", $html, \\$m);
foreach (\\$m[0] as \\$i => \\$tb) {
  preg_match("#id=\\"([^\\"]+)\\"#", \\$tb, \\$idm);
  preg_match("#class=\\"([^\\"]+)\\"#", \\$tb, \\$cm);
  \\$id = \\$idm[1] ?? "";
  \\$cls = \\$cm[1] ?? "";
  \\$name = \\$id !== "" ? \\$id : (\\$cls !== "" ? str_replace(" ", "_", \\$cls) : "anon_" . \\$i);
  echo "===FIXTURE-NAME=== " . \\$name . "\\n";
  echo \\$tb . "\\n";
  echo "===FIXTURE-END===\\n";
}
'
`;

const ssh = spawnSync('ssh', [...sshFlags, host, remoteScript], { encoding: 'utf8' });
if (ssh.status !== 0) {
  console.error('SSH failed:', ssh.stderr);
  process.exit(1);
}

const sections = ssh.stdout.split('===FIXTURE-NAME===').slice(1);
let count = 0;
for (const section of sections) {
  const [headerLine, ...rest] = section.split('\n');
  const name = headerLine.trim();
  const body = rest.join('\n').split('===FIXTURE-END===')[0].trim();
  if (!body) continue;
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outPath = join(outDir, `${safeName}.html`);
  writeFileSync(outPath, body + '\n');
  count++;
  console.log(`✓ ${safeName}.html (${body.length} bytes)`);
}

console.log(`\nCaptured ${count} fixtures → ${outDir}`);
```

- [ ] **Step 2: Create the fixtures directory placeholder**

```powershell
New-Item -ItemType Directory -Force -Path "src/ts/dashboard/extractors/__fixtures__" | Out-Null
New-Item -ItemType File -Force -Path "src/ts/dashboard/extractors/__fixtures__/.gitkeep" | Out-Null
```

- [ ] **Step 3: Run the capture against the live box**

```powershell
$env:MODERNUI_SSH_PORT="22"; node tools/capture-fixtures.mjs <your-unraid-host>
```

Expected: prints `✓ <name>.html` for each tbody (~15-20 files). Output dir contains one .html file per widget. Naming patterns will vary by Unraid version but typically include `system`, `array_status`, `share_status`, `tblDiskLocation`, `tblIPMIDash`, etc.

If the curl-via-php approach gets blocked by the auth wall, fall back to: SSH in and `cat /tmp/dashboard.html` or use `wget --user/--password` with the box's credentials. The exact alternate command depends on the box; report back if blocked and we'll adjust.

- [ ] **Step 4: Inspect a fixture file to confirm it parsed sensibly**

```powershell
Get-Content "src/ts/dashboard/extractors/__fixtures__/*.html" | Select-Object -First 30
```

Expected: visible HTML, balanced `<tbody>...</tbody>`, no truncation.

- [ ] **Step 5: Commit (the tool + the fixtures)**

```powershell
git add tools/capture-fixtures.mjs src/ts/dashboard/extractors/__fixtures__/
git commit -m "tools(dashboard): add capture-fixtures + initial live captures"
```

---

## Task 5: Extractor registry + unknown extractor + plugin-card mirror (TDD)

**Files:**
- Create: `src/ts/dashboard/extractors/index.ts`
- Create: `src/ts/dashboard/extractors/unknown.ts`
- Create: `tests/unit-ts/dashboard/extractors/unknown.test.ts`
- Create: `tests/unit-ts/dashboard/extractors/registry.test.ts`

- [ ] **Step 1: Write failing test for `unknown` extractor**

Create `tests/unit-ts/dashboard/extractors/unknown.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { unknownExtractor } from '../../../../src/ts/dashboard/extractors/unknown';

function parseTbody(html: string): HTMLTableSectionElement {
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('unknown extractor', () => {
  it('always matches', () => {
    const tbody = parseTbody('<tbody id="x"><tr><td>hi</td></tr></tbody>');
    expect(unknownExtractor.match({ source: tbody })).toBe(true);
  });

  it('preserves innerHTML verbatim', () => {
    const tbody = parseTbody('<tbody id="x"><tr><td>hi <b>bold</b></td></tr></tbody>');
    const result = unknownExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('unknown');
    expect(result?.innerHTML).toContain('<b>bold</b>');
    expect(result?.id).toBe('x');
  });

  it('derives hint from class when no id', () => {
    const tbody = parseTbody('<tbody class="mywidget custom"><tr><td>x</td></tr></tbody>');
    const result = unknownExtractor.extract({ source: tbody });
    expect(result?.hint).toBe('mywidget');  // first class
  });
});
```

- [ ] **Step 2: Run → fails**

```powershell
npm run test:ts
```

Expected: import not found.

- [ ] **Step 3: Implement `unknown.ts`**

Create `src/ts/dashboard/extractors/unknown.ts`:

```typescript
import type { UnknownWidget } from '../types';

export interface ExtractorContext {
  source: HTMLTableSectionElement;
  hint?: string;
}

export interface Extractor<T> {
  match: (ctx: ExtractorContext) => boolean;
  extract: (ctx: ExtractorContext) => T | null;
}

export const unknownExtractor: Extractor<UnknownWidget> = {
  match: () => true,  // catch-all: always matches as a last-resort fallback
  extract: ({ source }) => {
    const id = source.id || '';
    const firstClass = source.classList.length > 0 ? source.classList[0] : '';
    const hint = firstClass || id;
    return {
      kind: 'unknown',
      id: id || `anon-${Math.random().toString(36).slice(2, 8)}`,
      hint,
      innerHTML: source.innerHTML,
    };
  },
};
```

- [ ] **Step 4: Run → passes**

```powershell
npm run test:ts
```

Expected: 3 new tests pass.

- [ ] **Step 5: Write failing test for the registry**

Create `tests/unit-ts/dashboard/extractors/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { dispatch, registry } from '../../../../src/ts/dashboard/extractors/index';

function parseTbody(html: string): HTMLTableSectionElement {
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('extractor registry', () => {
  it('includes the unknown extractor as the last entry', () => {
    const last = registry[registry.length - 1];
    expect(last.name).toBe('unknown');
  });

  it('dispatches unknown tbody to the unknown extractor', () => {
    const tbody = parseTbody('<tbody id="abc"><tr><td>?</td></tr></tbody>');
    const result = dispatch({ source: tbody });
    expect(result?.kind).toBe('unknown');
  });
});
```

- [ ] **Step 6: Run → fails**

```powershell
npm run test:ts
```

Expected: `index.ts` not found.

- [ ] **Step 7: Implement `index.ts`**

Create `src/ts/dashboard/extractors/index.ts`:

```typescript
import type { WidgetState } from '../types';
import { unknownExtractor, type Extractor, type ExtractorContext } from './unknown';

export type { Extractor, ExtractorContext };

// Ordered registry — earlier entries win.
// Per-widget tasks insert their entries above the 'unknown' fallback.
export const registry: Array<{ name: string; extractor: Extractor<WidgetState> }> = [
  // Future entries land here (above unknown):
  // { name: 'array', extractor: arrayExtractor },
  // { name: 'cache', extractor: cacheExtractor },
  // ...
  { name: 'unknown', extractor: unknownExtractor as Extractor<WidgetState> },
];

// Walk registry in order; first matching extractor wins.
export function dispatch(ctx: ExtractorContext): WidgetState | null {
  for (const entry of registry) {
    if (entry.extractor.match(ctx)) {
      return entry.extractor.extract(ctx);
    }
  }
  return null;
}
```

- [ ] **Step 8: Run → passes**

```powershell
npm run test:ts
```

Expected: 2 new tests pass + all prior tests still green.

- [ ] **Step 9: Commit**

```powershell
git add src/ts/dashboard/extractors/index.ts src/ts/dashboard/extractors/unknown.ts tests/unit-ts/dashboard/extractors/
git commit -m "feat(dashboard): add extractor registry + unknown catch-all (TDD)"
```

---

## Task 6: Layout primitives + first deploy (visible empty dashboard)

**Files:**
- Create: `src/ts/dashboard/components/md-card.ts`
- Create: `src/ts/dashboard/components/md-section.ts`
- Create: `src/ts/dashboard/components/md-plugin-card.ts`
- Create: `src/ts/dashboard/components/md-dashboard.ts`
- Modify: `src/ts/dashboard/boot.ts` (mount the component)

- [ ] **Step 1: Create the base card component**

Create `src/ts/dashboard/components/md-card.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('md-card')
export class MdCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.20),
        0 1px 3px rgba(0, 0, 0, 0.12);
      transition: box-shadow 120ms cubic-bezier(0.2, 0, 0, 1);
      overflow: hidden;
    }
    :host(:hover) {
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.20),
        0 2px 6px rgba(0, 0, 0, 0.18);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px 12px 20px;
      gap: 12px;
    }
    .title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
      flex: 1;
      min-width: 0;
    }
    .meta {
      font-size: 12px;
      color: var(--text-secondary);
      font-weight: 400;
    }
    .body {
      padding: 0 20px 18px 20px;
      color: var(--text-primary);
      font-size: 14px;
    }
    ::slotted(*) {
      box-sizing: border-box;
    }
  `;

  @property({ type: String }) cardTitle = '';
  @property({ type: String }) meta = '';

  render() {
    return html`
      <div class="header">
        <h3 class="title">${this.cardTitle}</h3>
        ${this.meta ? html`<span class="meta">${this.meta}</span>` : ''}
      </div>
      <div class="body">
        <slot></slot>
      </div>
    `;
  }
}
```

- [ ] **Step 2: Create the section component**

Create `src/ts/dashboard/components/md-section.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('md-section')
export class MdSection extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 24px 0;
    }
    .label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin: 0 4px 12px 4px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px;
    }
    ::slotted([data-wide]) {
      grid-column: 1 / -1;
    }
  `;

  @property({ type: String }) label = '';

  render() {
    return html`
      <div class="label">${this.label}</div>
      <div class="grid"><slot></slot></div>
    `;
  }
}
```

- [ ] **Step 3: Create the plugin (mirror tier) card**

Create `src/ts/dashboard/components/md-plugin-card.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { UnknownWidget } from '../types';
import './md-card';

@customElement('md-plugin-card')
export class MdPluginCard extends LitElement {
  static styles = css`
    :host { display: contents; }
    .mirror {
      /* Pierce shadow boundary by using a div with innerHTML.
         Original CSS classes from Unraid still apply because the
         outer modernui.css is global. */
    }
  `;

  @property({ type: Object }) state: UnknownWidget = {
    kind: 'unknown',
    id: '',
    hint: '',
    innerHTML: '',
  };

  render() {
    const title = this.state.hint || this.state.id || 'Plugin';
    return html`
      <md-card .cardTitle=${title} meta="plugin">
        <div class="mirror" .innerHTML=${this.state.innerHTML}></div>
      </md-card>
    `;
  }
}
```

- [ ] **Step 4: Create the root dashboard component**

Create `src/ts/dashboard/components/md-dashboard.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { DashboardStore } from '../store';
import type { WidgetState, UnknownWidget } from '../types';
import './md-section';
import './md-plugin-card';

@customElement('modernui-dashboard')
export class ModernuiDashboard extends LitElement {
  static styles = css`
    :host {
      display: block;
      max-width: 1440px;
      margin: 0 auto;
      padding: 16px 24px 48px;
      color: var(--text-primary);
      font-family: var(--font-sans);
    }
  `;

  private _store: DashboardStore | null = null;
  private _unsubscribe: (() => void) | null = null;

  @state() private _widgets: WidgetState[] = [];

  setStore(store: DashboardStore): void {
    this._unsubscribe?.();
    this._store = store;
    this._unsubscribe = store.subscribe(() => this._sync());
    this._sync();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
  }

  private _sync(): void {
    if (!this._store) return;
    const all: WidgetState[] = [];
    for (const id of this._store.keys()) {
      const v = this._store.get(id);
      if (v) all.push(v);
    }
    this._widgets = all;
  }

  render() {
    const unknown = this._widgets.filter((w): w is UnknownWidget => w.kind === 'unknown');
    return html`
      <md-section label="Plugins (untyped)">
        ${unknown.map(
          (w) => html`<md-plugin-card .state=${w}></md-plugin-card>`,
        )}
      </md-section>
    `;
  }
}
```

- [ ] **Step 5: Wire boot.ts to mount the root and start the observer + store**

Replace `src/ts/dashboard/boot.ts`:

```typescript
import { createStore } from './store';
import { createSourceObserver } from './source-observer';
import { dispatch } from './extractors';
import './components/md-dashboard';
import type { ModernuiDashboard } from './components/md-dashboard';

function onDashboardPage(): boolean {
  return /^\/Dashboard/i.test(window.location.pathname);
}

function waitForSource(
  timeoutMs: number,
  onReady: (el: HTMLTableElement) => void,
  onTimeout: () => void,
): void {
  const existing = document.querySelector<HTMLTableElement>('table.dashboard');
  if (existing) {
    onReady(existing);
    return;
  }
  const observer = new MutationObserver(() => {
    const found = document.querySelector<HTMLTableElement>('table.dashboard');
    if (found) {
      observer.disconnect();
      clearTimeout(timeoutHandle);
      onReady(found);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const timeoutHandle = window.setTimeout(() => {
    observer.disconnect();
    onTimeout();
  }, timeoutMs);
}

function extractAll(source: HTMLTableElement, store: ReturnType<typeof createStore>): void {
  const tbodies = Array.from(source.querySelectorAll<HTMLTableSectionElement>(':scope > tbody'));
  const seen = new Set<string>();
  for (const tbody of tbodies) {
    const result = dispatch({ source: tbody });
    if (!result) continue;
    const id = (result as { id?: string }).id || tbody.id || `idx-${seen.size}`;
    seen.add(id);
    store.set(id, result);
  }
  // Remove widgets that have disappeared
  for (const key of Array.from(store.keys())) {
    if (!seen.has(key)) store.delete(key);
  }
}

export function boot(): void {
  if (!onDashboardPage()) return;

  waitForSource(
    5000,
    (source) => {
      document.body.classList.add('modernui-dashboard-active');

      // Find or create the mount container
      const container = document.querySelector('div.frame') || document.body;
      const root = document.createElement('modernui-dashboard') as ModernuiDashboard;
      container.appendChild(root);

      // Wire store + observer
      const store = createStore();
      root.setStore(store);

      // Initial sync
      extractAll(source, store);

      // Watch for live updates
      const obs = createSourceObserver(source, () => extractAll(source, store), 50);
      obs.start();
    },
    () => {
      console.warn('[modernui-dashboard] source not found; leaving stock UI');
    },
  );
}
```

- [ ] **Step 6: Build, deploy, visually verify the first overlay**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Open `http://<your-unraid-host>/Dashboard`, hard-refresh.

**Expected:** stock dashboard hidden; you see ONE section labeled "Plugins (untyped)" with many cards — one per `<tbody>` Unraid renders, with the original innerHTML projected inside our themed card shell. Every widget shows up as "unknown" because no typed extractors exist yet — that's the goal. Visual confirmation: the pipeline (hide → observe → extract → store → render) works end-to-end. Per-widget styling lands in subsequent tasks.

If nothing renders or you see errors in console, that's a bug to investigate before moving on.

- [ ] **Step 7: Commit**

```powershell
git add src/ts/dashboard/components/ src/ts/dashboard/boot.ts
git commit -m "feat(dashboard): root component + mount + initial mirror-only render"
```

---

## Task 7: Array widget (exemplar — full TDD)

This task is the **template for all subsequent per-widget tasks**. Tasks 8-22 (Cache, Parity, Disklocation, Processor, Memory, GPU, IPMI, Docker, VMs, Interface, UPS, Identity, Motherboard, Shares, Users) follow the same five-step rhythm — write extractor test against the captured fixture, implement extractor, register, write component, mount in `md-dashboard`. Each later task lists the unique code (state interface, selectors, render template) without repeating the boilerplate.

**Files:**
- Modify: `src/ts/dashboard/types.ts`
- Create: `src/ts/dashboard/extractors/array.ts`
- Modify: `src/ts/dashboard/extractors/index.ts`
- Create: `src/ts/dashboard/components/md-array-card.ts`
- Modify: `src/ts/dashboard/components/md-dashboard.ts`
- Create: `tests/unit-ts/dashboard/extractors/array.test.ts`

- [ ] **Step 1: Add `ArrayState` to `types.ts`**

Replace contents of `src/ts/dashboard/types.ts` (only the WidgetState union — the rest stays):

```typescript
export type DiskState = 'active' | 'standby' | 'spinning-up' | 'unmounted' | 'unknown';
export type SmartHealth = 'healthy' | 'warning' | 'failed' | 'unknown';

export interface DiskRow {
  name: string;
  state: DiskState;
  tempC: number | null;
  smart: SmartHealth;
  utilizationPct: number | null;
}

export interface ArrayState {
  kind: 'array';
  status: 'started' | 'starting' | 'stopped' | 'unknown';
  usedTB: number | null;
  totalTB: number | null;
  disks: DiskRow[];
}

export type WidgetState = UnknownWidget | ArrayState;
```

(Each subsequent widget task adds its interface here and extends the union.)

- [ ] **Step 2: Write the failing extractor test**

Create `tests/unit-ts/dashboard/extractors/array.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrayExtractor } from '../../../../src/ts/dashboard/extractors/array';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('arrayExtractor', () => {
  // The fixture file name depends on how Task 4's capture script named the array
  // tbody (its id or first class). Inspect __fixtures__/ to confirm; common
  // candidates: 'array_status.html', 'array.html', 'tblArrayDash.html'.
  const tbody = loadFixture('array_status.html');

  it('matches the array tbody', () => {
    expect(arrayExtractor.match({ source: tbody })).toBe(true);
  });

  it('extracts at least one disk', () => {
    const result = arrayExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('array');
    expect((result?.disks.length ?? 0)).toBeGreaterThan(0);
  });

  it('detects parity disk', () => {
    const result = arrayExtractor.extract({ source: tbody });
    const parity = result?.disks.find((d) => d.name.toLowerCase().includes('parity'));
    expect(parity).toBeDefined();
  });

  it('parses utilization on at least one disk', () => {
    const result = arrayExtractor.extract({ source: tbody });
    const withUtil = result?.disks.filter((d) => d.utilizationPct !== null);
    expect((withUtil?.length ?? 0)).toBeGreaterThan(0);
  });
});
```

If the fixture file name doesn't match yours, list `src/ts/dashboard/extractors/__fixtures__/` and update the string.

- [ ] **Step 3: Run → fails**

```powershell
npm run test:ts
```

Expected: `array` import not found.

- [ ] **Step 4: Implement `src/ts/dashboard/extractors/array.ts`**

```typescript
import type { ArrayState, DiskRow, DiskState, SmartHealth } from '../types';
import type { Extractor } from './unknown';

function parseDiskState(row: Element): DiskState {
  const orb = row.querySelector('i.orb, span.orb, [class*="-orb"]');
  if (!orb) return 'unknown';
  const cls = orb.className;
  if (cls.includes('green-orb') || cls.includes('green-blink')) return 'active';
  if (cls.includes('grey-orb')) return 'standby';
  if (cls.includes('yellow-orb') || cls.includes('yellow-blink')) return 'spinning-up';
  if (cls.includes('red-orb') || cls.includes('blue-orb')) return 'unmounted';
  return 'unknown';
}

function parseTempCelsius(row: Element): number | null {
  const tempSpan = row.querySelector('span.green-text, span.orange-text, span.red-text');
  if (!tempSpan) return null;
  const m = tempSpan.textContent?.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseSmart(row: Element): SmartHealth {
  const icon = row.querySelector('[class*="fa-thumbs"]');
  if (!icon) return 'unknown';
  const cls = icon.className;
  if (cls.includes('fa-thumbs-o-up')) return 'healthy';
  if (cls.includes('red-text')) return 'failed';
  if (cls.includes('orange-text')) return 'warning';
  return 'unknown';
}

function parseUtilization(row: Element): number | null {
  const fill = row.querySelector('.usage-disk > span[style*="width"], .usage-bar > span[style*="width"]');
  if (!fill) return null;
  const m = (fill as HTMLElement).style.width.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function parseDiskName(row: Element): string {
  const firstCell = row.querySelector('td, a, span[name="Device"]');
  return firstCell?.textContent?.trim().split(/\s+/).slice(0, 2).join(' ') ?? '';
}

function parseHeaderTotals(tbody: HTMLTableSectionElement): { usedTB: number | null; totalTB: number | null } {
  const text = tbody.textContent ?? '';
  const m = text.match(/(\d+(?:\.\d+)?)\s*TB[^0-9]+(\d+(?:\.\d+)?)\s*TB/);
  if (!m) return { usedTB: null, totalTB: null };
  return { usedTB: Number(m[1]), totalTB: Number(m[2]) };
}

export const arrayExtractor: Extractor<ArrayState> = {
  match: ({ source }) => {
    if (source.classList.contains('array')) return true;
    const headerText = source.querySelector('h3, .tile-header-main')?.textContent?.toUpperCase() ?? '';
    return headerText.includes('ARRAY') && !headerText.includes('VIRTUAL');
  },
  extract: ({ source }) => {
    const diskRows = Array.from(source.querySelectorAll('tr')).filter((row) =>
      row.querySelector('.orb, [class*="-orb"]') !== null,
    );

    const disks: DiskRow[] = diskRows.map((row) => ({
      name: parseDiskName(row),
      state: parseDiskState(row),
      tempC: parseTempCelsius(row),
      smart: parseSmart(row),
      utilizationPct: parseUtilization(row),
    }));

    const { usedTB, totalTB } = parseHeaderTotals(source);

    return {
      kind: 'array',
      status: 'started',
      usedTB,
      totalTB,
      disks,
    };
  },
};
```

- [ ] **Step 5: Register in `src/ts/dashboard/extractors/index.ts`**

```typescript
import type { WidgetState } from '../types';
import { unknownExtractor, type Extractor, type ExtractorContext } from './unknown';
import { arrayExtractor } from './array';

export type { Extractor, ExtractorContext };

export const registry: Array<{ name: string; extractor: Extractor<WidgetState> }> = [
  { name: 'array', extractor: arrayExtractor as Extractor<WidgetState> },
  // Subsequent widgets register above 'unknown' in their tasks
  { name: 'unknown', extractor: unknownExtractor as Extractor<WidgetState> },
];

export function dispatch(ctx: ExtractorContext): WidgetState | null {
  for (const entry of registry) {
    if (entry.extractor.match(ctx)) {
      return entry.extractor.extract(ctx);
    }
  }
  return null;
}
```

- [ ] **Step 6: Run → 4 tests pass**

```powershell
npm run test:ts
```

- [ ] **Step 7: Implement `src/ts/dashboard/components/md-array-card.ts`**

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ArrayState, DiskState, SmartHealth } from '../types';
import './md-card';

function stateColor(s: DiskState): string {
  if (s === 'active') return 'var(--success)';
  if (s === 'standby') return 'var(--text-muted)';
  if (s === 'spinning-up') return 'var(--warning)';
  if (s === 'unmounted') return 'var(--danger)';
  return 'var(--text-muted)';
}
function smartIcon(s: SmartHealth): string {
  return s === 'healthy' ? '✓' : s === 'warning' ? '!' : s === 'failed' ? '✕' : '?';
}
function smartColor(s: SmartHealth): string {
  if (s === 'healthy') return 'var(--success)';
  if (s === 'warning') return 'var(--warning)';
  if (s === 'failed') return 'var(--danger)';
  return 'var(--text-muted)';
}

@customElement('md-array-card')
export class MdArrayCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .leds { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 16px; }
    .led { width: 14px; height: 18px; border-radius: 2px; background: var(--text-muted); }
    .disk-list { display: grid; gap: 6px; }
    .disk {
      display: grid;
      grid-template-columns: 1fr auto auto auto 80px;
      gap: 12px;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 13px;
    }
    .disk:last-child { border-bottom: none; }
    .name { color: var(--text-primary); font-weight: 500; }
    .state { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .temp, .smart { font-variant-numeric: tabular-nums; font-size: 12px; }
    .util { position: relative; height: 4px; background: var(--bg-base); border-radius: 4px; overflow: hidden; }
    .util > span {
      display: block; height: 100%; background: var(--accent);
      transition: width 240ms cubic-bezier(0.2, 0, 0, 1);
    }
  `;

  @property({ type: Object }) state: ArrayState = {
    kind: 'array', status: 'unknown', usedTB: null, totalTB: null, disks: [],
  };

  render() {
    const { usedTB, totalTB, disks } = this.state;
    const meta = usedTB !== null && totalTB !== null
      ? `${usedTB.toFixed(1)} TB / ${totalTB.toFixed(0)} TB`
      : `${disks.length} disks`;

    return html`
      <md-card cardTitle="Array" meta=${meta}>
        <div class="leds">
          ${disks.map((d) => html`<div class="led" style="background: ${stateColor(d.state)}"></div>`)}
        </div>
        <div class="disk-list">
          ${disks.map((d) => html`
            <div class="disk">
              <span class="name">${d.name}</span>
              <span class="state">
                <span class="dot" style="background: ${stateColor(d.state)}"></span>${d.state}
              </span>
              <span class="temp">${d.tempC !== null ? `${d.tempC} °C` : '—'}</span>
              <span class="smart" style="color: ${smartColor(d.smart)}">${smartIcon(d.smart)}</span>
              <div class="util">
                ${d.utilizationPct !== null ? html`<span style="width: ${d.utilizationPct}%"></span>` : ''}
              </div>
            </div>
          `)}
        </div>
      </md-card>
    `;
  }
}
```

- [ ] **Step 8: Mount in `src/ts/dashboard/components/md-dashboard.ts`**

Add `ArrayState` to the type import:

```typescript
import type { WidgetState, UnknownWidget, ArrayState } from '../types';
```

Add the array card import:

```typescript
import './md-array-card';
```

Replace the `render()` method:

```typescript
render() {
  const widgets = this._widgets;
  const arrays = widgets.filter((w): w is ArrayState => w.kind === 'array');
  const unknown = widgets.filter((w): w is UnknownWidget => w.kind === 'unknown');

  return html`
    ${arrays.length > 0 ? html`
      <md-section label="Storage">
        ${arrays.map((s) => html`<md-array-card .state=${s}></md-array-card>`)}
      </md-section>
    ` : ''}
    ${unknown.length > 0 ? html`
      <md-section label="Plugins (untyped)">
        ${unknown.map((w) => html`<md-plugin-card .state=${w}></md-plugin-card>`)}
      </md-section>
    ` : ''}
  `;
}
```

- [ ] **Step 9: Build, deploy, verify**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Expected: a Storage section with the array card showing the disk LED row + per-disk list with live temps/SMART/utilization.

- [ ] **Step 10: Commit**

```powershell
git add src/ts/dashboard/types.ts src/ts/dashboard/extractors/array.ts src/ts/dashboard/extractors/index.ts src/ts/dashboard/components/md-array-card.ts src/ts/dashboard/components/md-dashboard.ts tests/unit-ts/dashboard/extractors/array.test.ts
git commit -m "feat(dashboard): first-class Array card with LED grid and per-disk list"
```

---

## Tasks 8-22: Widget Catalog

The remaining 15 widget tasks follow Task 7's pattern exactly:

1. Add the widget's state interface to `types.ts` (extend the `WidgetState` union)
2. Write failing extractor test referencing the captured fixture
3. Implement the extractor in `extractors/<name>.ts`
4. Register in `extractors/index.ts` (insert above `unknown`)
5. Implement the Lit component in `components/md-<name>-card.ts`
6. Mount in `md-dashboard.ts` (add to type filter + render in correct section)
7. Build + deploy + visual verify
8. Commit with message `feat(dashboard): first-class <Name> card`

Below are the unique pieces per widget — state shape, key selectors, and component render template. Each fully-specified block plugs into the rhythm above.

---

### Task 8: Cache widget

Sister pattern to Array — same disk-row layout but on the `cache` tbody.

**State** (append to `types.ts`):

```typescript
export interface CacheState {
  kind: 'cache';
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  usedGB: number | null;
  totalGB: number | null;
  disks: DiskRow[];  // reuses DiskRow from Array task
}
// Extend union: WidgetState = UnknownWidget | ArrayState | CacheState
```

**Extractor selectors** (`src/ts/dashboard/extractors/cache.ts`):

- `match`: `source.classList.contains('cache')` OR header text contains 'CACHE'
- Reuse `parseDiskState`, `parseTempCelsius`, `parseSmart`, `parseUtilization`, `parseDiskName` — export them from `array.ts` to share, or duplicate them here (DRY violation acceptable given separation)
- Parse status from header: look for "Status: ONLINE" pattern in `textContent`
- Parse totals: header pattern `"504 GB used of 5.7 TB (8.9 %)"` — convert TB→GB consistently

**Test** (`tests/unit-ts/dashboard/extractors/cache.test.ts`): mirror array.test.ts using `cache.html` fixture; assert disks count > 0 and status is one of the unions.

**Component** (`md-cache-card.ts`): identical layout to `md-array-card`, change title to "Cache", meta shows GB. Reuse `stateColor`/`smartIcon`/`smartColor` helpers — export them from array-card or duplicate.

**Mount**: add `cacheCards` to the Storage section.

---

### Task 9: Parity widget

**State**:

```typescript
export type ParityStatus = 'valid' | 'running' | 'invalid' | 'disabled' | 'unknown';

export interface ParityState {
  kind: 'parity';
  status: ParityStatus;
  lastCheckText: string | null;     // e.g. "Thu 21 May 2026 05:08 AM (three days ago)"
  durationText: string | null;      // e.g. "18 hours, 20 seconds"
  averageSpeedMBs: number | null;   // 185.1
  errorsFound: number | null;       // 0
  scheduleEnabled: boolean;
}
```

**Extractor selectors**:

- `match`: `source.id === 'tblParity'` OR `source.classList.contains('parity')` OR header text 'PARITY' (but not 'VIRTUAL')
- `status`: look for "Parity is valid" / "Parity check running" / "Parity is invalid" inline text; otherwise unknown
- `lastCheckText`: text after "Last check completed on" up to newline
- `durationText`: text after "Duration:"
- `averageSpeedMBs`: regex `/Average speed:\s*([\d.]+)\s*MB\/s/`
- `errorsFound`: regex `/Finding\s+(\d+)\s+errors/`
- `scheduleEnabled`: absence of "Scheduled parity check is disabled" text

**Component sketch** (`md-parity-card.ts`):

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ParityState, ParityStatus } from '../types';
import './md-card';

function statusPill(s: ParityStatus) {
  const map: Record<ParityStatus, { text: string; color: string }> = {
    valid:    { text: 'Valid',    color: 'var(--success)' },
    running:  { text: 'Running',  color: 'var(--info)' },
    invalid:  { text: 'Invalid',  color: 'var(--danger)' },
    disabled: { text: 'Disabled', color: 'var(--text-muted)' },
    unknown:  { text: 'Unknown',  color: 'var(--text-muted)' },
  };
  const { text, color } = map[s];
  return html`<span style="
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    background: ${color}26; color: ${color};
  ">${text}</span>`;
}

@customElement('md-parity-card')
export class MdParityCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .label { color: var(--text-secondary); }
    .value { color: var(--text-primary); font-weight: 500; }
  `;

  @property({ type: Object }) state: ParityState = {
    kind: 'parity', status: 'unknown', lastCheckText: null, durationText: null,
    averageSpeedMBs: null, errorsFound: null, scheduleEnabled: false,
  };

  render() {
    const s = this.state;
    return html`
      <md-card cardTitle="Parity">
        <div style="margin-bottom: 12px">${statusPill(s.status)}</div>
        ${s.lastCheckText ? html`<div class="row"><span class="label">Last check</span><span class="value">${s.lastCheckText}</span></div>` : ''}
        ${s.durationText ? html`<div class="row"><span class="label">Duration</span><span class="value">${s.durationText}</span></div>` : ''}
        ${s.averageSpeedMBs !== null ? html`<div class="row"><span class="label">Average speed</span><span class="value">${s.averageSpeedMBs} MB/s</span></div>` : ''}
        ${s.errorsFound !== null ? html`<div class="row"><span class="label">Errors found</span><span class="value">${s.errorsFound}</span></div>` : ''}
        <div class="row"><span class="label">Schedule</span><span class="value">${s.scheduleEnabled ? 'Enabled' : 'Disabled'}</span></div>
      </md-card>
    `;
  }
}
```

**Mount**: add to Storage section after the array/cache cards.

---

### Task 10: Disk Location widget

Plugin-contributed (`disklocation` plugin). The tbody id is `tblDiskLocation`. Renders a flex-grid of colored slot rectangles representing NVMe + HDD bays.

**State**:

```typescript
export interface DiskSlot {
  position: number;
  occupied: boolean;
  orbColor: 'green' | 'yellow' | 'red' | 'blue' | 'grey';
  label: string;  // slot number or disk identifier
}

export interface DisklocationState {
  kind: 'disklocation';
  assignedCount: number;
  totalCount: number;
  nvmeSlots: DiskSlot[];
  hddSlots: DiskSlot[];
}
```

**Extractor selectors** (`extractors/disklocation.ts`):

- `match`: `source.id === 'tblDiskLocation'`
- Parse header text `"14 of 19 drives assigned."`: regex `/(\d+) of (\d+)/`
- Walk `.grid-container > div` children; each has `style="order:N"` for position, contains an inner `div` with inline `background-color` (occupied vs empty), an `<i class="...orb-disklocation">` for color state, and a label `<b>N</b>`
- Split by parent context — the layout typically has two grid-containers (NVMe rail + HDD rail)

**Component sketch** (`md-disklocation-card.ts`): two rows of small rectangles (16×24 px each), tinted by occupancy. Color the orb dot inside. Tooltip on hover shows the disk identifier.

**Mount**: add to Storage section.

---

### Task 11: Processor widget

**State**:

```typescript
export interface CoreLoad {
  index: number;
  threadLabel: string;  // "CPU 0 - HT 16"
  loadPct: number;
}

export interface ProcessorState {
  kind: 'processor';
  model: string;
  cores: number;
  totalPowerW: number | null;
  temperatureC: number | null;
  overallLoadPct: number | null;
  coreLoads: CoreLoad[];
  loadHistory: number[];  // last 30 samples, populated incrementally
}
```

**Extractor selectors** (`extractors/processor.ts`):

- `match`: header text contains 'PROCESSOR' or 'CPU' (case-insensitive); id often `tblCpu` or class `cpu`
- `model`: first row text after the header — typically "AMD EPYC 8124P 16-Core @ 2450 MHz"
- `cores`: parse from the model string `/(\d+)-Core/` or count `span.cpuN.load` elements
- `totalPowerW`: text after "Total Power:" → `/([\d.]+)\s*W/`
- `temperatureC`: text after "Temperature:" → `/(\d+)\s*°C/`
- `overallLoadPct`: text after "Overall Load:" → `/(\d+)\s*%/`
- `coreLoads`: each `span.cpuN.load` has the percent text; thread label is the preceding `span.w26` text
- `loadHistory`: NOT extracted (we'd lose history on every update). The component maintains its own history in component state, appending `overallLoadPct` on each prop change.

**Component sketch** (`md-processor-card.ts`):

- Title "Processor", meta = "16 cores · 48 °C · 49 W"
- Big number: overall load %
- Per-core grid: 2 columns × N rows, each row "CPU 0 - HT 16 [bar] 3%"
- Sparkline at bottom showing 30s history (uses `md-sparkline.ts` shared component)

The sparkline component (`components/md-sparkline.ts`):

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('md-sparkline')
export class MdSparkline extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; height: 32px; }
    svg { width: 100%; height: 100%; display: block; }
  `;

  @property({ type: Array }) values: number[] = [];
  @property({ type: Number }) max = 100;

  render() {
    if (this.values.length < 2) return html`<svg viewBox="0 0 100 32"></svg>`;
    const pts = this.values.map((v, i) => {
      const x = (i / (this.values.length - 1)) * 100;
      const y = 32 - (Math.min(v, this.max) / this.max) * 32;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    return html`
      <svg viewBox="0 0 100 32" preserveAspectRatio="none">
        <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }
}
```

**Mount**: Compute section, alongside Memory.

---

### Task 12: Memory (System) widget

The Unraid SYSTEM widget contains the four memory pies — RAM usage, Boot device, Log filesystem, Docker vdisk. Each is a `div.pie` with conic-gradient set inline.

**State**:

```typescript
export interface MemorySlice {
  label: string;            // "RAM usage", "Boot device", "Log filesystem", "Docker vdisk"
  percentUsed: number;
  detail: string;           // tooltip text "Percent of total used memory (62.6 GiB)"
}

export interface MemoryState {
  kind: 'system';           // Unraid calls this widget "System"; we use 'system' kind
  pies: MemorySlice[];
}
```

**Extractor selectors** (`extractors/system.ts`):

- `match`: contains `.tile-system-memory-charts` OR id starts with `tblSystem`
- For each `div.pie`:
  - label from the sibling `a.info` text
  - percent from the `span.sysN` text (`/(\d+)\s*%/`)
  - detail from `a.info > span` (the tooltip span)

**Component sketch** (`md-memory-card.ts`):

```typescript
@customElement('md-memory-card')
export class MdMemoryCard extends LitElement {
  static styles = css`
    .pies { display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-around; }
    .pie-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11px; color: var(--text-secondary); }
    .pie {
      width: 64px; height: 64px;
      border-radius: 50%;
      position: relative;
    }
    .pie::after {
      content: ""; position: absolute; inset: 6px;
      background: var(--bg-surface); border-radius: 50%;
    }
    .pie span {
      position: absolute; inset: 0; display: flex;
      align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600; color: var(--text-primary);
      z-index: 1;
    }
  `;

  @property({ type: Object }) state: MemoryState = { kind: 'system', pies: [] };

  render() {
    return html`
      <md-card cardTitle="Memory" meta="${this.state.pies.length} volumes">
        <div class="pies">
          ${this.state.pies.map((p) => {
            const deg = (p.percentUsed / 100) * 360;
            const gradient = `conic-gradient(var(--accent) 0 ${deg}deg, var(--bg-elevated) ${deg}deg 360deg)`;
            return html`
              <div class="pie-wrap">
                <div class="pie" style="background: ${gradient}" title="${p.detail}">
                  <span>${p.percentUsed}%</span>
                </div>
                <div>${p.label}</div>
              </div>
            `;
          })}
        </div>
      </md-card>
    `;
  }
}
```

**Mount**: Compute section.

---

### Task 13: GPU widget (gpustat plugin)

**State**:

```typescript
export interface GpuState {
  kind: 'gpu';
  model: string;
  pciBus: string;
  utilizationPct: number | null;
  memoryUsedPct: number | null;
  memoryMHz: number | null;
  fanRpm: number | null;
  powerW: number | null;
  temperatureC: number | null;
  activeApps: number;
  throttling: boolean;
}
```

**Extractor**: `match` on `source.id === 'tblGPU'` or text containing 'NVIDIA' in the row labels. Parse each `<td>` for "Load - Memory", "Encoder - Decoder", "GPU - Memory (MHz)", "Fan (RPM) - Power", "PCI Bus Rx/Tx (MB/s)", "Power State - Throttling", "Active Apps" — extract the values from the `.usage-disk` bar fills or text content next to them.

**Component sketch**: Title "GPU", meta = "NVIDIA RTX A2000 12GB · 40 °C". Body: two columns — left shows model + bus + temp + power, right shows utilization sparkline + memory bar + active apps count.

**Mount**: Compute section. Skip rendering if `state.model === ''` (plugin not installed).

---

### Task 14: IPMI widget (ipmi plugin)

**State**:

```typescript
export interface IpmiSensor {
  name: string;
  reading: string;
  status: 'green' | 'yellow' | 'red' | 'blue' | 'grey';
  group: 'temperature' | 'fan' | 'voltage' | 'other';
}

export interface IpmiState {
  kind: 'ipmi';
  sensors: IpmiSensor[];
}
```

**Extractor**: `match` on `source.id === 'tblIPMIDash'`. For each `<tr>` inside:
- `name` from `span.w36` (second span)
- `reading` from `span.reading > font` textContent
- `status` from the orb class (`green-orb`/`yellow-orb`/`red-orb`/etc.)
- `group` heuristic: name contains 'TEMP' → temperature; 'FAN' or 'RPM' → fan; 'VOLT' → voltage; else other

**Component sketch**: Title "IPMI Sensors", meta = "{count} sensors". Body: grouped list. Each group has a sub-heading; within a group, each sensor is a row of `[orb] name [value]` with the value color-tracked.

**Mount**: Compute section.

---

### Task 15: Docker widget (folder.view2-aware)

**State**:

```typescript
export interface DockerContainer {
  name: string;
  state: 'started' | 'stopped' | 'paused' | 'unknown';
  imgUrl: string | null;
  folderName: string | null;   // null if not in a folder.view2 grouping
}

export interface DockerFolder {
  name: string;
  state: 'started' | 'stopped' | 'paused' | 'mixed';
  containers: DockerContainer[];
  totalCount: number;
  runningCount: number;
}

export interface DockerState {
  kind: 'docker';
  folders: DockerFolder[];      // populated when folder.view2 is installed
  ungrouped: DockerContainer[]; // containers not in any folder
  totalRunning: number;
  totalCount: number;
}
```

**Extractor**: `match` on id contains 'Docker' or class contains 'docker'. Walk `span.outer.solid.apps`:
- folder tiles have `.folder-docker` class — collect their children from `.folder-showcase` (if expanded) or `.folder-storage` (collapsed)
- non-folder tiles are direct containers
- state from `span.state.folder-state-docker` text (folders) or `span.state` text (containers)
- counts via tallying

**Component sketch** (wide card with `data-wide` attribute so it spans the section grid):

- Title "Docker Containers", meta = "21 / 23 started"
- Filter chips at top: All / Running / Stopped (click to filter — state in component)
- Below: grouped grid — each folder is a section header followed by its container tiles; ungrouped tiles in a final section
- Each container tile = small card with icon (img) + name + colored state dot

**Mount**: Workloads section. Mark the card with `data-wide` for grid-column: 1 / -1 span (per `md-section.ts` styles).

---

### Task 16: VMs widget

**State**:

```typescript
export interface VmRow {
  name: string;
  state: 'started' | 'stopped' | 'paused' | 'unknown';
  iconUrl: string | null;
  vCPUs: number | null;
  ramGiB: number | null;
}

export interface VmsState {
  kind: 'vms';
  vms: VmRow[];
  totalRunning: number;
}
```

**Extractor**: `match` on id contains 'VM' or 'vms'. Walk `span.outer.solid.vms` for each VM tile; name from `span.inner > span:first-child`, state from `span.state`, icon from `img.img`.

**Component sketch**: Title "Virtual Machines", meta = "1 running". Body: list of VMs with name + state pill + (if available) vCPU/RAM. Each row has a small action menu trigger linking to `/VMs` for management.

**Mount**: Workloads section.

---

### Task 17: Interface widget

**State**:

```typescript
export interface NetworkInterface {
  name: string;             // "bond0", "eth0", "eth1", "lo"
  mode: string;             // "fault-tolerance (active-backup), mtu 9000"
  speedGbps: number | null;
  duplex: string | null;
  inboundKbps: number;
  outboundKbps: number;
}

export interface InterfaceState {
  kind: 'interface';
  interfaces: NetworkInterface[];
  selectedName: string;     // currently-shown interface in the widget header
}
```

**Extractor**: `match` on header text contains 'INTERFACE' or `select[name="enter_iface"]` exists. Parse the interface list table at bottom, and the live values shown for the selected interface in the header.

**Component sketch**: Title "Network", meta = "{selected} · {speed} Gbps". Body: live ↓/↑ throughput row with sparkline, list of interfaces below with mode + speed.

**Mount**: Network & Power section.

---

### Task 18: UPS widget

**State**:

```typescript
export interface UpsState {
  kind: 'ups';
  status: 'on-line' | 'on-battery' | 'low-battery' | 'replace-battery' | 'unknown';
  batteryPct: number;
  loadPct: number;
  loadW: number;            // load% × nominal
  runtimeMinutes: number;
  nominalPowerW: number;
  nominalVA: number;
}
```

**Extractor**: `match` on header text contains 'UPS' (also matches NUT). Parse rows:
- `UPS Status:` text → status
- `Battery Charge:` `(\d+)\s*%` → batteryPct
- `Load:` `(\d+)\s*%\s*-\s*(\d+)\s*W` → loadPct + loadW (the `-` indicates the calculated wattage)
- `Runtime Left:` `(\d+):(\d+):(\d+)` → runtimeMinutes
- `Nominal Power:` `(\d+)\s*W\s*\((\d+)\s*VA\)` → nominalPowerW + nominalVA

**Component sketch**: Title "UPS", meta = `status`. Body: battery ring (donut) with percentage in middle, plus rows for runtime / load / nominal power.

**Mount**: Network & Power section.

---

### Task 19: Identity widget

**State**:

```typescript
export interface IdentityState {
  kind: 'identity';
  serverName: string;       // "HL15RACK"
  description: string;      // "Media server"
  localTimeText: string;    // "8:02 pm" + "Sun 24 May 2026, BST"
  model: string;            // "Custom"
  registration: string;     // "Unraid OS Pro"
  uptimeText: string;       // "4 days, 8 hours, 59 minutes"
}
```

**Extractor**: `match` on header text contains the server hostname (extracted from `document.title` or by detecting `.tile-header-main` text matching `/^[A-Z0-9_-]+$/`). Parse rows by label-then-value pattern.

**Component sketch**: Title "{serverName}", meta = `{registration}`. Body: large local time digital clock, model/uptime/description below.

**Mount**: System section.

---

### Task 20: Motherboard widget

**State**:

```typescript
export interface MotherboardState {
  kind: 'motherboard';
  vendor: string;
  model: string;
  biosVersion: string;
  biosDate: string;
}
```

**Extractor**: `match` on header text contains 'MOTHERBOARD'. Parse text lines for vendor / model / "BIOS dated:" / "Version".

**Component sketch**: Title "Motherboard", body shows the 4 fields as a vertical list.

**Mount**: System section.

---

### Task 21: Shares widget

**State**:

```typescript
export interface ShareRow {
  name: string;
  description: string;
  security: 'public' | 'private' | 'secure' | 'hidden';
  streams: number;
}

export interface SharesState {
  kind: 'shares';
  shares: ShareRow[];
  publicSmbCount: number;
  publicNfsCount: number;
  protocol: 'smb' | 'nfs';   // currently-selected in widget header
}
```

**Extractor**: `match` on header contains 'SHARES' or `select[name="enter_share"]` exists. Parse the inner share rows and the header count text.

**Component sketch**: Title "Shares", meta = "{count} · {public} public". Body: protocol toggle (SMB/NFS), then a table of name / description / security pill / stream count.

**Mount**: System section.

---

### Task 22: Users widget

**State**:

```typescript
export interface UserRow {
  name: string;
  description: string;
  unprotected: boolean;
  writeCount: number;
  readCount: number;
}

export interface UsersState {
  kind: 'users';
  users: UserRow[];
  unprotectedCount: number;
}
```

**Extractor**: `match` on header contains 'USERS'. Parse each row.

**Component sketch**: Title "Users", meta = "{count} · {unprotected} unprotected". Body: rows of name / write / read counts with avatar placeholder.

**Mount**: System section.

---

## Task 23: Hero strip (composition + scroll-to behavior)

**Files:**
- Create: `src/ts/dashboard/components/md-hero-strip.ts`
- Create: `src/ts/dashboard/components/md-hero-card.ts`
- Modify: `src/ts/dashboard/components/md-dashboard.ts`

- [ ] **Step 1: Create `md-hero-card.ts`**

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('md-hero-card')
export class MdHeroCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      padding: 20px 24px;
      cursor: pointer;
      transition: transform 120ms cubic-bezier(0.2, 0, 0, 1),
                  box-shadow 120ms cubic-bezier(0.2, 0, 0, 1);
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.20),
        0 1px 3px rgba(0, 0, 0, 0.12);
    }
    :host(:hover) {
      transform: translateY(-1px);
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.20),
        0 4px 12px rgba(0, 0, 0, 0.22);
    }
    .label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    .value {
      font-size: 32px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .sub {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 6px;
    }
  `;

  @property({ type: String }) label = '';
  @property({ type: String }) value = '';
  @property({ type: String }) sub = '';
  @property({ type: String }) scrollTarget = '';

  private _onClick() {
    if (!this.scrollTarget) return;
    const el = document.querySelector(this.scrollTarget);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  render() {
    return html`
      <div @click=${this._onClick}>
        <div class="label">${this.label}</div>
        <div class="value">${this.value}</div>
        <div class="sub">${this.sub}</div>
      </div>
    `;
  }
}
```

- [ ] **Step 2: Create `md-hero-strip.ts`**

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type {
  ArrayState, CacheState, ProcessorState, UpsState, DockerState, VmsState,
} from '../types';
import './md-hero-card';

@customElement('md-hero-strip')
export class MdHeroStrip extends LitElement {
  static styles = css`
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
  `;

  @property({ type: Object }) array: ArrayState | null = null;
  @property({ type: Object }) cache: CacheState | null = null;
  @property({ type: Object }) processor: ProcessorState | null = null;
  @property({ type: Object }) ups: UpsState | null = null;
  @property({ type: Object }) docker: DockerState | null = null;
  @property({ type: Object }) vms: VmsState | null = null;

  render() {
    const arr = this.array;
    const cch = this.cache;
    const proc = this.processor;
    const ups = this.ups;
    const dk = this.docker;
    const vm = this.vms;
    return html`
      ${arr ? html`
        <md-hero-card label="Array"
          value="${arr.usedTB?.toFixed(1) ?? '—'} TB / ${arr.totalTB?.toFixed(0) ?? '—'} TB"
          sub="${arr.disks.length} disks"
          scrollTarget="md-array-card"></md-hero-card>` : ''}
      ${cch ? html`
        <md-hero-card label="Cache"
          value="${cch.usedGB?.toFixed(0) ?? '—'} GB"
          sub="${cch.disks.length} disks · ${cch.status}"
          scrollTarget="md-cache-card"></md-hero-card>` : ''}
      ${proc ? html`
        <md-hero-card label="Compute"
          value="${proc.temperatureC !== null ? `${proc.temperatureC} °C` : '—'}"
          sub="${proc.overallLoadPct ?? 0}% load · ${proc.cores} cores"
          scrollTarget="md-processor-card"></md-hero-card>` : ''}
      ${ups ? html`
        <md-hero-card label="Power"
          value="${ups.loadW} W"
          sub="UPS ${ups.batteryPct}% · ${ups.runtimeMinutes} min"
          scrollTarget="md-ups-card"></md-hero-card>` : ''}
      ${(dk || vm) ? html`
        <md-hero-card label="Workloads"
          value="${dk?.totalRunning ?? 0} / ${dk?.totalCount ?? 0}"
          sub="${vm?.totalRunning ?? 0} VM${(vm?.totalRunning ?? 0) === 1 ? '' : 's'} running"
          scrollTarget="md-docker-card"></md-hero-card>` : ''}
    `;
  }
}
```

- [ ] **Step 3: Mount the strip in `md-dashboard.ts`**

Add the imports and update `render()`:

```typescript
import './md-hero-strip';
// ... and import the WidgetState union members used below

render() {
  const widgets = this._widgets;
  const findOf = <K extends WidgetState['kind']>(k: K) =>
    widgets.find((w): w is Extract<WidgetState, { kind: K }> => w.kind === k) ?? null;

  const array = findOf('array');
  const cache = findOf('cache');
  const proc = findOf('processor');
  const ups = findOf('ups');
  const docker = findOf('docker');
  const vms = findOf('vms');

  // ... section filters as before, then wrap in:
  return html`
    <md-hero-strip
      .array=${array}
      .cache=${cache}
      .processor=${proc}
      .ups=${ups}
      .docker=${docker}
      .vms=${vms}
    ></md-hero-strip>

    ${/* sections as before */ ''}
  `;
}
```

- [ ] **Step 4: Build, deploy, verify**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Expected: hero strip with 5 cards at the top; clicking any card scrolls to the corresponding detail card.

- [ ] **Step 5: Commit**

```powershell
git add src/ts/dashboard/components/md-hero-strip.ts src/ts/dashboard/components/md-hero-card.ts src/ts/dashboard/components/md-dashboard.ts
git commit -m "feat(dashboard): hero metrics strip with click-to-scroll"
```

---

## Task 24: Settings page Dashboard layout toggle

**Files:**
- Modify: `package/include/save.php` (add `dashboard_layout` to validator)
- Modify: `package/pages/Theme.page` (add the form field)
- Modify: `src/ts/dashboard/boot.ts` (check the setting before mounting)
- Modify: `package/include/install.php` (export setting into loader.js dataset)

- [ ] **Step 1: Extend the validator in `save.php`**

In `modernui_validate_settings()`, add `dashboard_layout` to both `$defaults` and `$allowed`:

```php
$defaults = [
    'mode'             => 'system',
    'density'          => 'comfortable',
    'sidebar'          => 'expanded',
    'zebra'            => '0',
    'reduced_motion'   => 'auto',
    'dashboard_layout' => 'modern',  // NEW
];
$allowed = [
    'mode'             => ['system', 'dark', 'light'],
    'density'          => ['comfortable', 'compact'],
    'sidebar'          => ['expanded', 'collapsed'],
    'zebra'            => ['0', '1'],
    'reduced_motion'   => ['auto', '0', '1'],
    'dashboard_layout' => ['modern', 'stock'],  // NEW
];
```

- [ ] **Step 2: Export the setting through loader.js**

In `install.php`'s `modernui_generate_loader_js()`, read the dashboard_layout setting and write it as a data attribute:

```php
$layout = $settings['dashboard_layout'] ?? 'modern';
// ... in the loader script:
"r.dataset.modernuiDashboardLayout=" . json_encode($layout) . ";\n"
```

- [ ] **Step 3: Honor the setting in `boot.ts`**

```typescript
function dashboardLayoutMode(): 'modern' | 'stock' {
  const v = document.documentElement.dataset.modernuiDashboardLayout;
  return v === 'stock' ? 'stock' : 'modern';
}

export function boot(): void {
  if (!onDashboardPage()) return;
  if (dashboardLayoutMode() === 'stock') return;
  // ... rest unchanged
}
```

- [ ] **Step 4: Add the radio field to `Theme.page`**

Add a fieldset block in the form:

```php
<fieldset style="border:1px solid #ddd;padding:12px 16px;margin-bottom:16px;">
  <legend>Dashboard layout</legend>
  <?= modernui_radio('dashboard_layout', 'modern', 'Modern', $dashboard_layout) ?>
  <?= modernui_radio('dashboard_layout', 'stock',  'Stock',  $dashboard_layout) ?>
</fieldset>
```

And read the variable above the form:

```php
$dashboard_layout = $settings['dashboard_layout'] ?? 'modern';
```

- [ ] **Step 5: Add a test for the validator change**

Append to `tests/unit-php/save.test.php`:

```php
// dashboard_layout accepts known values
$ok = modernui_validate_settings(['dashboard_layout' => 'modern']);
assert($ok['ok'] === true);
assert($ok['values']['dashboard_layout'] === 'modern');

$ok2 = modernui_validate_settings(['dashboard_layout' => 'stock']);
assert($ok2['ok'] === true);

$bad = modernui_validate_settings(['dashboard_layout' => 'classic']);
assert($bad['ok'] === false);
```

- [ ] **Step 6: Run all tests**

```powershell
npm test
```

Expected: all unit tests pass (TS + PHP).

- [ ] **Step 7: Build, deploy, verify toggle works**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Open Settings > Theme. Confirm "Dashboard layout: Modern / Stock" radio appears. Toggle to Stock, reload `/Dashboard` — stock Unraid dashboard returns. Toggle to Modern — new dashboard returns.

- [ ] **Step 8: Commit**

```powershell
git add package/include/save.php package/include/install.php package/pages/Theme.page src/ts/dashboard/boot.ts tests/unit-php/save.test.php
git commit -m "feat(settings): add Dashboard layout (Modern/Stock) toggle"
```

---

## Task 25: v0.3.0 release

**Files:**
- Modify: `package.json` (version bump)
- Modify: `unraid-modernui.plg` (version + CHANGES)
- Modify: `docs/compatibility.md` (plugin status table)
- Modify: `tests/integration/install-uninstall.mjs` (assert /Dashboard serves 200)

- [ ] **Step 1: Run full test suite**

```powershell
cd "C:\Users\<user>\Documents\Projects\Unraid Theme"; npm test
```

Expected: all TS + PHP unit tests pass.

- [ ] **Step 2: Extend integration test to assert /Dashboard responds**

Add the assertion before the final cleanup block in `tests/integration/install-uninstall.mjs`:

```javascript
console.log('▶ verifying /Dashboard serves 200…');
const status = ssh(`curl -s -o /dev/null -w "%{http_code}" -L "http://localhost/Dashboard" || echo "000"`);
// Unraid auth might redirect (302 → login). Accept both 200 and 302 as "served".
if (status !== '200' && status !== '302') {
  console.error('FAIL: /Dashboard returned', status);
  process.exit(1);
}
```

- [ ] **Step 3: Run integration test**

```powershell
$env:MODERNUI_SSH_PORT="22"; $env:MODERNUI_TEST_HOST="<your-unraid-host>"; npm run test:integration
```

Expected: round-trip + new /Dashboard assertion passes.

- [ ] **Step 4: Bump versions**

`package.json`:

```json
  "version": "0.3.0",
```

`unraid-modernui.plg` — entity:

```xml
<!ENTITY version   "0.3.0">
```

And prepend a CHANGES entry above v0.2.0:

```
###v0.3.0 (2026-05-24)
- Phase 3: Dashboard rebuild — hero strip + grouped sections (Storage, Compute, Workloads, Network & Power, System, Plugins)
- Lit-based web components with Shadow DOM isolation
- MutationObserver mirror of Unraid's hidden table.dashboard — plugin contributions ride along
- First-class cards for: Array, Cache, Parity, Disklocation, Processor, Memory, GPU, IPMI, Docker (folder.view2-aware), VMs, Interface, UPS, Identity, Motherboard, Shares, Users
- Mirror-tier card for any unrecognized tbody
- New setting: Dashboard layout (Modern / Stock)
- All four Phase 1 fallback paths continue to work
```

- [ ] **Step 5: Update `docs/compatibility.md`**

```markdown
| Plugin                          | Last tested | Status      | Notes                                                              |
|---------------------------------|-------------|-------------|--------------------------------------------------------------------|
| disklocation                    | 7.3.0       | first-class | Renders in Storage section as Disk Location card                   |
| folder.view2                    | 7.3.0       | first-class | Renders in Workloads section; container folder groupings preserved |
| ipmi                            | 7.3.0       | first-class | Renders in Compute section as IPMI sensors card                    |
| gpustat                         | 7.3.0       | first-class | Renders in Compute section as GPU card                             |
| unassigned.devices              | 7.3.0       | mirrored    | Renders in Plugins section; typed extractor deferred to v0.4       |
| (any other contributing tbody)  | —           | mirrored    | Renders in Plugins section, HTML kept verbatim                     |
```

- [ ] **Step 6: Build + deploy**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

- [ ] **Step 7: Walk the manual visual checklist**

In a browser, hard-refresh `http://<your-unraid-host>/Dashboard` and verify:

- [ ] Hero strip renders 5 cards with live values within 100 ms
- [ ] Storage section: Array + Cache + Parity + Disk Location cards
- [ ] Compute section: Processor (with per-core grid + sparkline) + Memory pies + GPU + IPMI
- [ ] Workloads section: Docker (wide, folder-grouped) + VMs
- [ ] Network & Power section: Interface + UPS
- [ ] System section: Identity + Motherboard + Shares + Users
- [ ] Plugins section appears only if an unknown tbody exists; mirrored content readable
- [ ] Clicking any hero card smooth-scrolls to its detail card
- [ ] Hover on any card → subtle lift; respect prefers-reduced-motion
- [ ] Toggle Settings > Theme > Dashboard layout to Stock → reload → stock Unraid dashboard returns
- [ ] Toggle back to Modern → new dashboard returns
- [ ] `?modernui=off` URL still reveals stock under-the-hood
- [ ] Browser console produces no errors

- [ ] **Step 8: Commit + tag**

```powershell
git add package.json unraid-modernui.plg docs/compatibility.md tests/integration/install-uninstall.mjs
git commit -m "chore(release): v0.3.0 — Phase 3 dashboard rebuild"
git tag -a v0.3.0 -m "Phase 3: Dashboard rebuild (hero + grouped sections)"
```

- [ ] **Step 9: Confirm final state**

```powershell
git log --oneline -25
git tag
```

Expected: v0.3.0 tag points at the release commit, ~25-30 new commits since v0.2.0.

---

## Phase 3 done

End state:

- `/Dashboard` renders the new hero + grouped sections layout
- 16 widgets are first-class typed cards with live data
- Unknown / unrecognized widgets fall through to the mirror tier (themed shell + original HTML)
- All four v0.1.1 fallback paths still return to stock dashboard
- `Settings → Theme → Dashboard layout = Stock` is a fifth opt-out
- Integration test extended with a `/Dashboard` HTTP check
- v0.3.0 tagged locally

**Deferred to v0.4.0:**

- Left sidebar replacing the top nav (the originally-scoped Phase 3 work)
- Plugin-safe footer proxy for temps/UPS/stats (Phase 3)
- Mobile responsive transforms (Phase 4)
- Playwright visual regression (Phase 5)
- Drag-rearrange / hide-show widget customization (Phase 4 polish)
