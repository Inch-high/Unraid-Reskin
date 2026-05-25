# Unraid ModernUI — Phase 1: Foundation & Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working `.plg` plugin that installs cleanly on Unraid 7.x, applies the design-token CSS layer (dark/light/accent), exposes a Settings > Theme page with the five config toggles, and provides all four fallback paths (in-theme button, floating re-enable pill, URL param, SSH flag). No shell PHP overrides yet — those land in Phase 3 once the safety net is proven.

**Architecture:** Plugin distributed as `.txz` referenced by a `.plg` XML manifest. **CSS injection** uses Unraid's existing `extraCSS` hook in `dynamix.cfg`. **JS injection** requires a tiny overlay of the page-layout PHP file (Unraid's dynamix.cfg has no `extraJS` equivalent), so Phase 1 overlays exactly one shell file to add a single `<script>` tag — backed up SHA-keyed and restored on uninstall. State persisted to `/boot/config/plugins/unraid-modernui/settings.cfg`. Enable/disable state is reflected in *which* JS file the overlay loads: `modernui.js` when enabled, `re-enable.js` (the floating pill only) when disabled.

**Layout-file caveat:** the exact filename and path of Unraid 7.x's page-layout PHP is discovered in Task 7 Step 0 (SSH into your test box and find the file that renders `<head>` for every page — likely `/usr/local/emhttp/plugins/dynamix/include/DefaultPageLayout.php` but verify). All references to `LAYOUT_FILE` in the plan are filled in after that discovery.

**Tech Stack:** Sass (Dart Sass) for styles, TypeScript + Vite for JS, Node.js for build/test tooling, PHP 8.x for server-side scripts (matches Unraid 7.x), bash for Unraid event hooks, OpenSSH (built into Windows 10+) for dev-mirror.

**Phase 1 limitation (deliberate):** Because no shell override is installed in Phase 1, there is a brief flash-of-unstyled-content on page navigation — Unraid paints its default theme, then `modernui.js` runs and sets `<html data-theme="...">`. The no-FOUC promise in the spec is delivered by Phase 3's shell overrides.

---

## File Structure

Files that will exist at the end of Phase 1:

```
unraid-modernui/                              # repo root
├── README.md                                 # Public docs: install, fallback paths, dev workflow
├── INSTALL.md                                # Install troubleshooting
├── unraid-modernui.plg                       # The .plg XML manifest (also goes in the release)
├── .gitignore
├── package.json                              # Build/test scripts + deps
├── tsconfig.json
├── package/                                  # Source tree of the .txz tarball
│   ├── event/
│   │   ├── started                           # bash, runs install.php
│   │   ├── stopped                           # bash, runs uninstall.php
│   │   └── disks_mounted                     # bash, runs upgrade.php
│   ├── include/
│   │   ├── install.php                       # Backs up dynamix.cfg, wires CSS/JS hooks
│   │   ├── uninstall.php                     # Restores dynamix.cfg from backup
│   │   ├── upgrade.php                       # Phase 1: stub. Phase 3: shell-file SHA checks
│   │   ├── helpers.php                       # parse_cfg, write_cfg, is_disabled, set_disabled
│   │   └── save.php                          # HTTP endpoint for the settings form
│   ├── pages/
│   │   └── Theme.page                        # Settings > Theme page
│   ├── theme/dist/                           # Populated by build:
│   │   ├── modernui.css                      # Built CSS (tokens + minimal selector overrides)
│   │   ├── modernui.js                       # Full theme JS (active when enabled)
│   │   └── re-enable.js                      # Tiny floating pill (active when disabled)
│   ├── scripts/
│   │   └── rc.modernui                       # init.d-style script, checks disabled flag at boot
│   └── backups/                              # Created at install time, holds dynamix.cfg pre-image
├── src/                                      # Build inputs
│   ├── styles/
│   │   ├── tokens.scss                       # All CSS custom properties (dark + light)
│   │   ├── base.scss                         # Minimal :root selector overrides (body bg/text)
│   │   └── modernui.scss                     # Entry point that @uses tokens + base
│   └── ts/
│       ├── theme-init.ts                     # Sets <html data-theme/density> from settings/system
│       ├── fallback.ts                       # URL param ?modernui=off short-circuit, floating pill
│       ├── modernui.ts                       # Main entry — invoked when enabled
│       └── re-enable.ts                      # Entry — invoked when disabled, only injects pill
├── tools/
│   ├── build.mjs                             # Vite + Sass build, packages package/ into .txz
│   ├── dev-mirror.mjs                        # Build + rsync to test Unraid box over SSH
│   └── package-txz.mjs                       # tar+gzip+xz the package/ directory
├── tests/
│   ├── unit-php/
│   │   ├── run-all.mjs                       # Node runner: shells out to `php` for each test file
│   │   ├── helpers.test.php                  # parse_cfg / write_cfg / disabled-flag helpers
│   │   └── save.test.php                     # save.php endpoint behavior
│   ├── unit-ts/
│   │   ├── theme-init.test.ts                # determineTheme() pure function
│   │   └── fallback.test.ts                  # URL param parsing
│   └── integration/
│       └── install-uninstall.mjs             # SSH to test box, install, assert, uninstall, assert
└── docs/
    └── compatibility.md                      # Plugin compatibility matrix (seeded with the three Dynamix plugins)
```

**Responsibility split:**
- `package/` is exactly what ends up on the Unraid box, byte-for-byte
- `src/` and `tools/` only run on the dev machine
- `tests/unit-php/` runs against a local PHP install (Windows: `winget install PHP.PHP` or use WSL)
- `tests/integration/` requires a running Unraid 7.x box reachable over SSH (production or VM)
- All persistent state on Unraid lives under `/boot/config/plugins/unraid-modernui/` — never touched by the package itself

---

## Task 1: Initialize repository structure

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: directory tree from File Structure section (empty dirs OK)

- [ ] **Step 1: Initialize git repo and create directory skeleton**

Run from the project root (`C:\Users\<user>\Documents\Projects\Unraid Theme`):

```powershell
git init
New-Item -ItemType Directory -Force -Path `
  package/event, package/include, package/pages, `
  package/theme/dist, package/scripts, package/backups, `
  src/styles, src/ts, tools, `
  tests/unit-php, tests/unit-ts, tests/integration, `
  docs | Out-Null
```

- [ ] **Step 2: Create `.gitignore`**

Contents:

```gitignore
node_modules/
package/theme/dist/
package/backups/
*.txz
.DS_Store
dist/
coverage/
.env
.env.local
*.log
.vscode/settings.json
```

- [ ] **Step 3: Create `package.json`**

Contents:

```json
{
  "name": "unraid-modernui",
  "version": "0.1.0",
  "private": true,
  "description": "Clean, flat, responsive theme for Unraid 7.x — Phase 1: foundation & safety",
  "type": "module",
  "scripts": {
    "build": "node tools/build.mjs",
    "package": "node tools/package-txz.mjs",
    "dev-mirror": "node tools/dev-mirror.mjs",
    "test": "npm run test:ts && npm run test:php",
    "test:ts": "vitest run",
    "test:php": "node tests/unit-php/run-all.mjs",
    "test:integration": "node tests/integration/install-uninstall.mjs"
  },
  "devDependencies": {
    "sass": "^1.77.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 4: Create `tsconfig.json`**

Contents:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals"]
  },
  "include": ["src/ts/**/*.ts", "tests/unit-ts/**/*.ts"]
}
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors. Confirm `sass`, `vite`, `vitest`, `typescript` resolve.

- [ ] **Step 6: Commit**

```powershell
git add .gitignore package.json package-lock.json tsconfig.json
git commit -m "chore: initialize repo structure and toolchain"
```

---

## Task 2: Plugin manifest (`.plg`)

**Files:**
- Create: `unraid-modernui.plg`

- [ ] **Step 1: Write the `.plg` XML manifest**

Contents of `unraid-modernui.plg`:

```xml
<?xml version="1.0" standalone="yes"?>
<!DOCTYPE PLUGIN [
<!ENTITY name      "unraid-modernui">
<!ENTITY author    "Inch-high">
<!ENTITY version   "0.1.0">
<!ENTITY launch    "Settings/Theme">
<!ENTITY plugindir "/usr/local/emhttp/plugins/&name;">
<!ENTITY cfgdir    "/boot/config/plugins/&name;">
<!ENTITY tarball   "&name;-&version;.txz">
<!ENTITY tarurl    "https://github.com/EXAMPLE/unraid-modernui/releases/download/v&version;/&tarball;">
<!ENTITY pluginurl "https://raw.githubusercontent.com/EXAMPLE/unraid-modernui/main/&name;.plg">
]>

<PLUGIN
  name="&name;"
  author="&author;"
  version="&version;"
  launch="&launch;"
  pluginURL="&pluginurl;"
  min="7.0.0"
  support="https://github.com/EXAMPLE/unraid-modernui/issues">

<CHANGES>
##0.1.0 2026-05-24
- Phase 1: foundation, safety, design tokens, settings page, fallback paths
</CHANGES>

<FILE Name="&cfgdir;/&tarball;">
<URL>&tarurl;</URL>
</FILE>

<FILE Run="/bin/bash">
<INLINE>
mkdir -p "&plugindir;" "&cfgdir;"
tar -xJf "&cfgdir;/&tarball;" -C "&plugindir;"
php "&plugindir;/include/install.php"
echo "Modern UI installed."
</INLINE>
</FILE>

<FILE Run="/bin/bash" Method="remove">
<INLINE>
php "&plugindir;/include/uninstall.php"
rm -rf "&plugindir;"
rm -f "&cfgdir;/&tarball;"
echo "Modern UI removed."
</INLINE>
</FILE>

</PLUGIN>
```

The `EXAMPLE` placeholder in the URLs will be replaced with the real GitHub org/user when the repo is published — see Task 17.

- [ ] **Step 2: Validate XML well-formedness**

Run: `node -e "import('node:fs').then(m => { const x = m.readFileSync('unraid-modernui.plg','utf8'); console.log(x.length, 'bytes — XML lint via DOMParser:'); import('jsdom').then(({JSDOM}) => { const d = new JSDOM(); const p = new d.window.DOMParser(); const doc = p.parseFromString(x, 'application/xml'); const errs = doc.getElementsByTagName('parsererror'); console.log(errs.length ? 'INVALID: ' + errs[0].textContent : 'valid'); }); })"`

Expected: prints byte count and `valid`.

- [ ] **Step 3: Commit**

```powershell
git add unraid-modernui.plg
git commit -m "feat: add plugin .plg manifest"
```

---

## Task 3: PHP helpers (TDD)

**Files:**
- Create: `package/include/helpers.php`
- Create: `tests/unit-php/run-all.mjs`
- Create: `tests/unit-php/helpers.test.php`

- [ ] **Step 1: Write the PHP test runner (Node script)**

Contents of `tests/unit-php/run-all.mjs`:

```javascript
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.test.php'));

let failed = 0;
for (const f of files) {
  process.stdout.write(`▶ ${f}: `);
  const result = spawnSync('php', [join(dir, f)], { encoding: 'utf8' });
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
```

- [ ] **Step 2: Write the failing helpers test**

Contents of `tests/unit-php/helpers.test.php`:

```php
<?php
require_once __DIR__ . '/../../package/include/helpers.php';

$tmp = tempnam(sys_get_temp_dir(), 'modernui_test_');

// parse_cfg should return empty array for empty file
$result = modernui_parse_cfg($tmp);
assert($result === [], 'empty file should yield empty array, got ' . var_export($result, true));

// write_cfg should round-trip a simple map
modernui_write_cfg($tmp, ['mode' => 'dark', 'density' => 'comfortable']);
$round = modernui_parse_cfg($tmp);
assert($round === ['mode' => 'dark', 'density' => 'comfortable'], 'round-trip failed: ' . var_export($round, true));

// parse_cfg should ignore comments and blank lines
file_put_contents($tmp, "# comment\n\nmode=light\n");
$result = modernui_parse_cfg($tmp);
assert($result === ['mode' => 'light'], 'should ignore comments/blanks, got ' . var_export($result, true));

// values with = signs in them should round-trip
modernui_write_cfg($tmp, ['accent' => '#ff8c2f']);
$result = modernui_parse_cfg($tmp);
assert($result === ['accent' => '#ff8c2f'], 'hex value round-trip failed: ' . var_export($result, true));

// is_disabled / set_disabled toggle a file-based flag
$flagdir = sys_get_temp_dir() . '/modernui_test_flagdir';
@mkdir($flagdir);
assert(modernui_is_disabled($flagdir) === false, 'should not be disabled initially');
modernui_set_disabled($flagdir, true);
assert(modernui_is_disabled($flagdir) === true, 'should be disabled after set');
modernui_set_disabled($flagdir, false);
assert(modernui_is_disabled($flagdir) === false, 'should not be disabled after unset');

unlink($tmp);
@rmdir($flagdir);

echo "all helpers tests passed\n";
exit(0);
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:php`
Expected: FAIL — `Fatal error: Uncaught Error: Call to undefined function modernui_parse_cfg()` (because `helpers.php` is empty / doesn't exist yet).

- [ ] **Step 4: Implement `helpers.php`**

Contents of `package/include/helpers.php`:

```php
<?php

function modernui_parse_cfg(string $path): array {
    if (!is_file($path)) return [];
    $out = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || $trimmed[0] === '#') continue;
        $pos = strpos($trimmed, '=');
        if ($pos === false) continue;
        $key = trim(substr($trimmed, 0, $pos));
        $value = trim(substr($trimmed, $pos + 1));
        if ($key !== '') $out[$key] = $value;
    }
    return $out;
}

function modernui_write_cfg(string $path, array $values): void {
    $dir = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $lines = [];
    foreach ($values as $k => $v) {
        $lines[] = $k . '=' . $v;
    }
    file_put_contents($path, implode("\n", $lines) . "\n", LOCK_EX);
}

function modernui_disabled_flag_path(string $cfgdir): string {
    return rtrim($cfgdir, '/') . '/disabled';
}

function modernui_is_disabled(string $cfgdir): bool {
    return is_file(modernui_disabled_flag_path($cfgdir));
}

function modernui_set_disabled(string $cfgdir, bool $disabled): void {
    $path = modernui_disabled_flag_path($cfgdir);
    if ($disabled) {
        if (!is_dir($cfgdir)) mkdir($cfgdir, 0755, true);
        touch($path);
    } else {
        if (is_file($path)) unlink($path);
    }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:php`
Expected: `▶ helpers.test.php: PASS` and exit code 0.

- [ ] **Step 6: Commit**

```powershell
git add package/include/helpers.php tests/unit-php/run-all.mjs tests/unit-php/helpers.test.php
git commit -m "feat(php): add settings.cfg helpers and disabled-flag helpers (TDD)"
```

---

## Task 4: Build pipeline (Sass + TypeScript)

**Files:**
- Create: `tools/build.mjs`
- Create: `src/styles/tokens.scss`
- Create: `src/styles/base.scss`
- Create: `src/styles/modernui.scss`
- Create: `src/ts/modernui.ts`
- Create: `src/ts/re-enable.ts`

- [ ] **Step 1: Create the token source file**

Contents of `src/styles/tokens.scss`:

```scss
:root {
  --bg-base: #0f1419;
  --bg-surface: #161c23;
  --bg-elevated: #1e252e;

  --border-subtle: #232b35;
  --border-default: #2d3744;

  --text-primary: #e5e9ef;
  --text-secondary: #9aa4b2;
  --text-muted: #6b7280;

  --accent: #ff8c2f;
  --accent-hover: #ff9e4a;
  --accent-muted: rgba(255, 140, 47, 0.15);

  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #3b82f6;

  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", Inter, system-ui, sans-serif;
  --font-mono: ui-monospace, "JetBrains Mono", "SF Mono", Consolas, monospace;

  --duration-fast: 120ms;
  --duration-base: 180ms;
  --duration-slow: 240ms;
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
}

[data-theme="light"] {
  --bg-base: #ffffff;
  --bg-surface: #f8f9fb;
  --bg-elevated: #ffffff;

  --border-subtle: #eef0f3;
  --border-default: #d8dde4;

  --text-primary: #0f1419;
  --text-secondary: #4a5160;
  --text-muted: #8b94a3;

  --accent: #e8731c;
  --accent-hover: #ff8c2f;
}
```

- [ ] **Step 2: Create the minimal base overrides**

Contents of `src/styles/base.scss`:

```scss
// Phase 1 applies tokens to the page body and form controls only.
// Component-level styling (cards, tables, etc.) lands in Phase 2.

body {
  background: var(--bg-base) !important;
  color: var(--text-primary) !important;
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--accent);
  &:hover { color: var(--accent-hover); }
}

input, select, textarea, button {
  font-family: inherit;
}

button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-muted);
}

// Respect user preference if reduced-motion is on
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Create the SCSS entry point**

Contents of `src/styles/modernui.scss`:

```scss
@use "tokens";
@use "base";
```

- [ ] **Step 4: Create placeholder TypeScript entries**

Contents of `src/ts/modernui.ts`:

```typescript
// Main entry — Phase 1 boots theme-init + fallback URL-param handling.
// Fuller behavior arrives in later phases.

console.log("[modernui] booting v0.1.0");
```

Contents of `src/ts/re-enable.ts`:

```typescript
// Tiny entry loaded when the theme is disabled.
// Phase 1: placeholder — pill rendering added in Task 8.

console.log("[modernui] disabled — re-enable pill will render here");
```

- [ ] **Step 5: Write the build script**

Contents of `tools/build.mjs`:

```javascript
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
import { build as viteBuild } from 'vite';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const distDir = join(root, 'package/theme/dist');

if (existsSync(distDir)) rmSync(distDir, { recursive: true });
mkdirSync(distDir, { recursive: true });

// Build CSS
const css = sass.compile(join(root, 'src/styles/modernui.scss'), { style: 'compressed' });
writeFileSync(join(distDir, 'modernui.css'), css.css);
console.log(`✓ modernui.css (${css.css.length} bytes)`);

// Build JS entries via Vite (two outputs: modernui.js, re-enable.js)
for (const entry of ['modernui', 're-enable']) {
  await viteBuild({
    root,
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

console.log('Build complete →', distDir);
```

- [ ] **Step 6: Run the build**

Run: `npm run build`
Expected output:
```
✓ modernui.css (xxx bytes)
✓ modernui.js
✓ re-enable.js
Build complete → .../package/theme/dist
```
And `package/theme/dist/` contains those three files.

- [ ] **Step 7: Commit**

```powershell
git add tools/build.mjs src/styles/ src/ts/modernui.ts src/ts/re-enable.ts
git commit -m "feat: add Sass+Vite build pipeline with design tokens and base styles"
```

---

## Task 5: Theme initialization (TDD)

**Files:**
- Create: `tests/unit-ts/theme-init.test.ts`
- Create: `src/ts/theme-init.ts`
- Modify: `src/ts/modernui.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create Vitest config**

Contents of `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit-ts/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write the failing test**

Contents of `tests/unit-ts/theme-init.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveTheme, applyTheme } from '../../src/ts/theme-init';

describe('resolveTheme', () => {
  it('returns "dark" when mode is "dark"', () => {
    expect(resolveTheme('dark', () => false)).toBe('dark');
  });

  it('returns "light" when mode is "light"', () => {
    expect(resolveTheme('light', () => true)).toBe('light');
  });

  it('returns "dark" when mode is "system" and system prefers dark', () => {
    expect(resolveTheme('system', () => true)).toBe('dark');
  });

  it('returns "light" when mode is "system" and system prefers light', () => {
    expect(resolveTheme('system', () => false)).toBe('light');
  });

  it('defaults to "dark" when mode is unknown', () => {
    expect(resolveTheme('garbage' as any, () => false)).toBe('dark');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-density');
  });

  it('sets data-theme on <html>', () => {
    applyTheme({ theme: 'dark', density: 'comfortable' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('sets data-density on <html>', () => {
    applyTheme({ theme: 'light', density: 'compact' });
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('replaces an existing data-theme rather than appending', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    applyTheme({ theme: 'dark', density: 'comfortable' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:ts`
Expected: FAIL — "Failed to resolve import '../../src/ts/theme-init'".

- [ ] **Step 4: Implement `theme-init.ts`**

Contents of `src/ts/theme-init.ts`:

```typescript
export type ThemeMode = 'system' | 'dark' | 'light';
export type Density = 'comfortable' | 'compact';
export type ResolvedTheme = 'dark' | 'light';

export interface ThemeState {
  theme: ResolvedTheme;
  density: Density;
}

export function resolveTheme(
  mode: ThemeMode,
  prefersDark: () => boolean,
): ResolvedTheme {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  if (mode === 'system') return prefersDark() ? 'dark' : 'light';
  return 'dark';
}

export function applyTheme(state: ThemeState): void {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.documentElement.setAttribute('data-density', state.density);
}

export function readSettingsFromMeta(): { mode: ThemeMode; density: Density } {
  const root = document.documentElement;
  const mode = (root.dataset.modernuiMode as ThemeMode) || 'system';
  const density = (root.dataset.modernuiDensity as Density) || 'comfortable';
  return { mode, density };
}

export function bootThemeInit(): void {
  const { mode, density } = readSettingsFromMeta();
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const prefersDark = () => mql.matches;

  applyTheme({ theme: resolveTheme(mode, prefersDark), density });

  if (mode === 'system') {
    mql.addEventListener('change', () => {
      applyTheme({ theme: resolveTheme('system', prefersDark), density });
    });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:ts`
Expected: 7 tests pass, 0 fail.

- [ ] **Step 6: Wire `theme-init` into the main entry**

Replace contents of `src/ts/modernui.ts`:

```typescript
import { bootThemeInit } from './theme-init';

bootThemeInit();
```

- [ ] **Step 7: Commit**

```powershell
git add vitest.config.ts tests/unit-ts/ src/ts/theme-init.ts src/ts/modernui.ts
git commit -m "feat(ts): add theme-init with resolveTheme and applyTheme (TDD)"
```

---

## Task 6: Fallback module — URL param + disabled-flag client-side check (TDD)

**Files:**
- Create: `tests/unit-ts/fallback.test.ts`
- Create: `src/ts/fallback.ts`

- [ ] **Step 1: Write the failing test**

Contents of `tests/unit-ts/fallback.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isUrlOverrideOff, isClientReady } from '../../src/ts/fallback';

describe('isUrlOverrideOff', () => {
  it('returns true when modernui=off is in the URL', () => {
    expect(isUrlOverrideOff('https://tower/Main?modernui=off')).toBe(true);
  });

  it('returns false when modernui=on', () => {
    expect(isUrlOverrideOff('https://tower/Main?modernui=on')).toBe(false);
  });

  it('returns false when modernui param is absent', () => {
    expect(isUrlOverrideOff('https://tower/Main')).toBe(false);
  });

  it('returns true for modernui=OFF (case-insensitive)', () => {
    expect(isUrlOverrideOff('https://tower/Main?modernui=OFF')).toBe(true);
  });
});

describe('isClientReady', () => {
  it('returns true when document.body exists', () => {
    expect(isClientReady(document)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fallback.ts`**

Contents of `src/ts/fallback.ts`:

```typescript
export function isUrlOverrideOff(href: string): boolean {
  const url = new URL(href);
  const value = url.searchParams.get('modernui');
  return value !== null && value.toLowerCase() === 'off';
}

export function isClientReady(doc: Document): boolean {
  return doc.body !== null;
}

export function injectReEnablePill(doc: Document, onClick: () => void): void {
  if (doc.getElementById('modernui-reenable-pill')) return;

  const pill = doc.createElement('button');
  pill.id = 'modernui-reenable-pill';
  pill.type = 'button';
  pill.textContent = 'Enable Modern UI';
  pill.style.cssText = [
    'position: fixed',
    'bottom: 16px',
    'right: 16px',
    'z-index: 99999',
    'padding: 8px 14px',
    'background: #ff8c2f',
    'color: #fff',
    'border: none',
    'border-radius: 9999px',
    'font: 500 13px -apple-system, "Segoe UI", system-ui, sans-serif',
    'cursor: pointer',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.25)',
  ].join(';');
  pill.addEventListener('click', onClick);
  doc.body.appendChild(pill);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:ts`
Expected: all tests pass.

- [ ] **Step 5: Wire the URL-param short-circuit into `modernui.ts`**

Replace contents of `src/ts/modernui.ts`:

```typescript
import { bootThemeInit } from './theme-init';
import { isUrlOverrideOff } from './fallback';

if (!isUrlOverrideOff(window.location.href)) {
  bootThemeInit();
}
```

- [ ] **Step 6: Wire the pill into `re-enable.ts`**

Replace contents of `src/ts/re-enable.ts`:

```typescript
import { injectReEnablePill, isClientReady } from './fallback';

function reEnable(): void {
  fetch('/plugins/unraid-modernui/include/save.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'action=enable',
  })
    .then(() => window.location.reload())
    .catch(err => {
      console.error('[modernui] failed to re-enable:', err);
      alert('Could not re-enable Modern UI. Check the browser console.');
    });
}

function boot(): void {
  if (isClientReady(document)) {
    injectReEnablePill(document, reEnable);
  } else {
    document.addEventListener('DOMContentLoaded', () => injectReEnablePill(document, reEnable));
  }
}

boot();
```

- [ ] **Step 7: Run the build to confirm both entries still build**

Run: `npm run build`
Expected: both `modernui.js` and `re-enable.js` regenerate without errors.

- [ ] **Step 8: Commit**

```powershell
git add tests/unit-ts/fallback.test.ts src/ts/fallback.ts src/ts/modernui.ts src/ts/re-enable.ts
git commit -m "feat(ts): add URL-param fallback short-circuit and re-enable pill (TDD)"
```

---

## Task 7: Install script — wire CSS via `dynamix.cfg`, JS via layout overlay

**Files:**
- Create: `package/include/install.php`
- Create: `package/event/started`
- Create: `package/overlay/usr/local/emhttp/plugins/dynamix/include/<LAYOUT_FILE>` (path filled in at Step 0)

- [ ] **Step 0: Discover the layout PHP file on your Unraid 7.x box**

SSH into your test Unraid box and find the file that renders `<head>` for every page:

```bash
ssh root@<your-unraid-host>
grep -rln '<head>' /usr/local/emhttp/plugins/dynamix/include/ 2>/dev/null | head
grep -rln 'DOCTYPE html' /usr/local/emhttp/plugins/dynamix/include/ 2>/dev/null | head
ls /usr/local/emhttp/plugins/dynamix/include/*Layout* 2>/dev/null
```

You're looking for a single PHP file that outputs the global `<head>` (where every page's `<link rel="stylesheet">` and inline scripts land). On Unraid 7.x this is most likely `DefaultPageLayout.php`, but possibly `Wrappers.php` or `template.php`. Note the absolute path you find.

Save the discovered path to your notes — it becomes `<LAYOUT_FILE>` in the remaining steps. Example: if you find `/usr/local/emhttp/plugins/dynamix/include/DefaultPageLayout.php`, then everywhere this plan says `<LAYOUT_FILE>` substitute `DefaultPageLayout.php`.

If `grep` returns multiple files, pick the one that contains `<!DOCTYPE html>` AND `<head>` AND outputs CSS link tags for `$css[]` or similar — that's the global layout.

- [ ] **Step 1: Write `install.php`**

Contents of `package/include/install.php`:

```php
<?php
require_once __DIR__ . '/helpers.php';

const MODERNUI_PLUGIN_NAME    = 'unraid-modernui';
const MODERNUI_DYNAMIX_CFG    = '/boot/config/plugins/dynamix/dynamix.cfg';
const MODERNUI_CFG_DIR        = '/boot/config/plugins/unraid-modernui';
const MODERNUI_BACKUP_DIR     = '/usr/local/emhttp/plugins/unraid-modernui/backups';
// Replace this with the path you discovered in Step 0:
const MODERNUI_LAYOUT_FILE    = '/usr/local/emhttp/plugins/dynamix/include/DefaultPageLayout.php';
const MODERNUI_SCRIPT_TAG     = '<script src="/plugins/unraid-modernui/theme/dist/loader.js"></script>';

const MODERNUI_MARK_BEGIN     = '# >>> unraid-modernui begin >>>';
const MODERNUI_MARK_END       = '# <<< unraid-modernui end <<<';
const MODERNUI_HTML_MARK_BEGIN = '<!-- unraid-modernui:begin -->';
const MODERNUI_HTML_MARK_END   = '<!-- unraid-modernui:end -->';

function modernui_hash_file(string $path): string {
    return is_file($path) ? hash_file('sha256', $path) : '';
}

function modernui_backup_file(string $path): void {
    if (!is_dir(MODERNUI_BACKUP_DIR)) mkdir(MODERNUI_BACKUP_DIR, 0755, true);
    if (!is_file($path)) return;
    $basename = basename($path);
    $sha = modernui_hash_file($path);
    $dest = MODERNUI_BACKUP_DIR . "/{$basename}.{$sha}";
    if (!is_file($dest)) copy($path, $dest);
    file_put_contents(MODERNUI_BACKUP_DIR . "/{$basename}.current.sha", $sha);
}

function modernui_strip_block(string $contents): string {
    $begin = preg_quote(MODERNUI_MARK_BEGIN, '/');
    $end   = preg_quote(MODERNUI_MARK_END, '/');
    return preg_replace("/\\n?{$begin}.*?{$end}\\n?/s", "\n", $contents) ?? $contents;
}

function modernui_strip_html_block(string $contents): string {
    $begin = preg_quote(MODERNUI_HTML_MARK_BEGIN, '/');
    $end   = preg_quote(MODERNUI_HTML_MARK_END, '/');
    return preg_replace("/\\s*{$begin}.*?{$end}\\s*/s", "\n", $contents) ?? $contents;
}

function modernui_dynamix_block(): string {
    return MODERNUI_MARK_BEGIN . "\n"
        . "extraCSS=\"/plugins/unraid-modernui/theme/dist/modernui.css\"\n"
        . MODERNUI_MARK_END . "\n";
}

function modernui_html_block(): string {
    // Single loader.js — install-time-generated (Task 9 Step 3 / save.php) — handles enabled/disabled routing.
    return "\n" . MODERNUI_HTML_MARK_BEGIN . "\n"
        . MODERNUI_SCRIPT_TAG . "\n"
        . MODERNUI_HTML_MARK_END . "\n";
}

function modernui_write_dynamix_block(): void {
    $cfg = is_file(MODERNUI_DYNAMIX_CFG) ? file_get_contents(MODERNUI_DYNAMIX_CFG) : '';
    $cfg = modernui_strip_block($cfg);
    $cfg = rtrim($cfg, "\n") . "\n\n" . modernui_dynamix_block();
    file_put_contents(MODERNUI_DYNAMIX_CFG, $cfg, LOCK_EX);
}

function modernui_inject_script_tag(): void {
    if (!is_file(MODERNUI_LAYOUT_FILE)) {
        echo "Modern UI: WARNING — layout file not found at " . MODERNUI_LAYOUT_FILE . "\n";
        echo "Modern UI: did you set MODERNUI_LAYOUT_FILE in install.php after running Task 7 Step 0?\n";
        return;
    }
    $contents = file_get_contents(MODERNUI_LAYOUT_FILE);
    $contents = modernui_strip_html_block($contents);
    // Insert just before </head>; case-insensitive
    $injected = preg_replace('/(<\\/head\\s*>)/i', modernui_html_block() . "$1", $contents, 1, $count);
    if ($count !== 1) {
        echo "Modern UI: WARNING — could not find </head> in layout file; JS not injected.\n";
        return;
    }
    file_put_contents(MODERNUI_LAYOUT_FILE, $injected, LOCK_EX);
}

function modernui_generate_loader_js(bool $disabled): void {
    $target = $disabled ? 're-enable.js' : 'modernui.js';
    $settings = modernui_parse_cfg('/boot/config/plugins/unraid-modernui/settings.cfg');
    $mode = $settings['mode'] ?? 'system';
    $density = $settings['density'] ?? 'comfortable';
    $loader = "(function(){\n"
        . "var r=document.documentElement;\n"
        . "r.dataset.modernuiMode=" . json_encode($mode) . ";\n"
        . "r.dataset.modernuiDensity=" . json_encode($density) . ";\n"
        . "var s=document.createElement('script');\n"
        . "s.src='/plugins/unraid-modernui/theme/dist/" . $target . "';\n"
        . "document.head.appendChild(s);\n"
        . "})();\n";
    $loaderPath = '/usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js';
    file_put_contents($loaderPath, $loader, LOCK_EX);
}

function modernui_install(): void {
    if (!is_dir(MODERNUI_CFG_DIR)) mkdir(MODERNUI_CFG_DIR, 0755, true);

    modernui_backup_file(MODERNUI_DYNAMIX_CFG);
    modernui_backup_file(MODERNUI_LAYOUT_FILE);

    modernui_write_dynamix_block();
    modernui_inject_script_tag();

    $disabled = modernui_is_disabled(MODERNUI_CFG_DIR);
    modernui_generate_loader_js($disabled);

    // Make sure rc.modernui is executable so /etc/rc.d picks it up
    $rc = '/usr/local/emhttp/plugins/unraid-modernui/scripts/rc.modernui';
    if (is_file($rc)) chmod($rc, 0755);

    echo "Modern UI: install complete (disabled=" . ($disabled ? 'true' : 'false') . ")\n";
}

if (PHP_SAPI === 'cli') {
    modernui_install();
}
```

This new install.php:
- Wires CSS via `dynamix.cfg`'s `extraCSS=` (existing Unraid mechanism, no overlay needed)
- Wires JS via a SHA-backed overlay of one shell file (`MODERNUI_LAYOUT_FILE`) that adds a single `<script src=".../loader.js">` tag before `</head>`
- Generates `loader.js` at install/save time — a tiny redirector that sets `data-modernui-*` attributes from settings.cfg and then loads either `modernui.js` (when enabled) or `re-enable.js` (when disabled)
- This way enable/disable doesn't require modifying any Unraid file — just regenerating loader.js

- [ ] **Step 2: Write the `event/started` bash hook**

Contents of `package/event/started`:

```bash
#!/bin/bash
# Unraid plugin lifecycle: fired when the plugin starts.
php /usr/local/emhttp/plugins/unraid-modernui/include/install.php
```

- [ ] **Step 3: Make the event script executable in the build**

Modify `tools/build.mjs` — add at the end of the file (before the final `console.log`):

```javascript
// Mark event scripts executable so they run on Unraid
import { chmodSync } from 'node:fs';
for (const f of ['started', 'stopped', 'disks_mounted']) {
  const p = join(root, 'package/event', f);
  if (existsSync(p)) chmodSync(p, 0o755);
}
```

- [ ] **Step 4: Manual verification — dry run the install logic locally**

Run on the dev machine (uses a temp directory, not your real Unraid):

```powershell
$env:MODERNUI_DRY=1
php -r "
define('MODERNUI_DYNAMIX_CFG_OVERRIDE', sys_get_temp_dir() . '/dryrun-dynamix.cfg');
file_put_contents(MODERNUI_DYNAMIX_CFG_OVERRIDE, 'foo=bar' . PHP_EOL);
echo 'dry-run hash: ' . hash_file('sha256', MODERNUI_DYNAMIX_CFG_OVERRIDE) . PHP_EOL;
"
```

Expected: prints a SHA256 hash. This just confirms PHP works on Windows. The full install runs only on Unraid (Task 11 integration test).

- [ ] **Step 5: Commit**

```powershell
git add package/include/install.php package/event/started tools/build.mjs
git commit -m "feat(install): wire CSS/JS into dynamix.cfg with SHA-keyed backup"
```

---

## Task 8: Uninstall script — restore `dynamix.cfg`

**Files:**
- Create: `package/include/uninstall.php`
- Create: `package/event/stopped`
- Create: `tests/unit-php/uninstall.test.php`

- [ ] **Step 1: Write a failing test for the strip-and-restore logic**

Contents of `tests/unit-php/uninstall.test.php`:

```php
<?php
require_once __DIR__ . '/../../package/include/install.php';

// strip block removes our markers and content between them
$with = "foo=bar\n\n" . MODERNUI_MARK_BEGIN . "\nextraCSS=\"x\"\n" . MODERNUI_MARK_END . "\n";
$stripped = modernui_strip_block($with);
assert(strpos($stripped, 'unraid-modernui') === false, 'stripped should have no marker, got: ' . var_export($stripped, true));
assert(strpos($stripped, 'foo=bar') !== false, 'stripped should preserve other config');

// strip block on input without markers is a no-op
$plain = "foo=bar\nbaz=qux\n";
$result = modernui_strip_block($plain);
assert($result === $plain, 'no-op on input without markers, got: ' . var_export($result, true));

// strip block handles input with only markers
$only = MODERNUI_MARK_BEGIN . "\nextraCSS=x\n" . MODERNUI_MARK_END . "\n";
$result = modernui_strip_block($only);
assert(trim($result) === '', 'fully-stripped input should be empty/whitespace, got: ' . var_export($result, true));

echo "all uninstall tests passed\n";
exit(0);
```

- [ ] **Step 2: Run the test to verify it passes** (the `strip_block` helper was added in Task 7's `install.php`)

Run: `npm run test:php`
Expected: PASS for both `helpers.test.php` and `uninstall.test.php`.

- [ ] **Step 3: Write `uninstall.php`**

Contents of `package/include/uninstall.php`:

```php
<?php
require_once __DIR__ . '/install.php'; // re-uses constants, helpers, and modernui_strip_block

function modernui_restore_from_backup(string $path, callable $stripFallback): void {
    $basename = basename($path);
    $shaFile = MODERNUI_BACKUP_DIR . "/{$basename}.current.sha";
    if (is_file($shaFile)) {
        $sha = trim(file_get_contents($shaFile));
        $backup = MODERNUI_BACKUP_DIR . "/{$basename}.{$sha}";
        if (is_file($backup)) {
            copy($backup, $path);
            echo "Modern UI: restored {$basename} from backup ({$sha})\n";
            return;
        }
    }
    // No backup found — fall through to strip-only mode
    if (is_file($path)) {
        $contents = file_get_contents($path);
        $stripped = $stripFallback($contents);
        file_put_contents($path, $stripped, LOCK_EX);
        echo "Modern UI: no backup, stripped marker from {$basename}\n";
    }
}

function modernui_uninstall(): void {
    modernui_restore_from_backup(MODERNUI_DYNAMIX_CFG, 'modernui_strip_block');
    modernui_restore_from_backup(MODERNUI_LAYOUT_FILE, 'modernui_strip_html_block');
    // We keep MODERNUI_CFG_DIR (settings.cfg + disabled flag) so a reinstall remembers prefs.
    // The .plg remove block deletes the plugin payload itself.
}

if (PHP_SAPI === 'cli') {
    modernui_uninstall();
}
```

- [ ] **Step 4: Write the `event/stopped` bash hook**

Contents of `package/event/stopped`:

```bash
#!/bin/bash
php /usr/local/emhttp/plugins/unraid-modernui/include/uninstall.php
```

- [ ] **Step 5: Commit**

```powershell
git add package/include/uninstall.php package/event/stopped tests/unit-php/uninstall.test.php
git commit -m "feat(install): add uninstall.php that restores dynamix.cfg from SHA backup"
```

---

## Task 9: Settings page (`Theme.page`) and save endpoint

**Files:**
- Create: `package/pages/Theme.page`
- Create: `package/include/save.php`
- Create: `tests/unit-php/save.test.php`

- [ ] **Step 1: Write a failing test for save.php's pure validator**

Contents of `tests/unit-php/save.test.php`:

```php
<?php
require_once __DIR__ . '/../../package/include/save.php';

// Validator allows known values
$ok = modernui_validate_settings(['mode' => 'dark', 'density' => 'comfortable', 'sidebar' => 'expanded', 'zebra' => '0', 'reduced_motion' => 'auto']);
assert($ok['ok'] === true, 'valid input should pass: ' . var_export($ok, true));
assert($ok['values']['mode'] === 'dark');

// Unknown mode is rejected
$bad = modernui_validate_settings(['mode' => 'rainbow']);
assert($bad['ok'] === false, 'unknown mode should fail');
assert(strpos($bad['error'], 'mode') !== false);

// Missing keys take defaults
$partial = modernui_validate_settings([]);
assert($partial['ok'] === true);
assert($partial['values']['mode'] === 'system', 'default mode should be system');
assert($partial['values']['density'] === 'comfortable');

// Boolean toggles accept 0/1
$bools = modernui_validate_settings(['zebra' => '1']);
assert($bools['ok'] === true);
assert($bools['values']['zebra'] === '1');

echo "all save tests passed\n";
exit(0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:php`
Expected: FAIL — `modernui_validate_settings` not defined.

- [ ] **Step 3: Implement `save.php`**

Contents of `package/include/save.php`:

```php
<?php
require_once __DIR__ . '/helpers.php';

const MODERNUI_SETTINGS_PATH = '/boot/config/plugins/unraid-modernui/settings.cfg';
const MODERNUI_SETTINGS_DIR  = '/boot/config/plugins/unraid-modernui';

function modernui_validate_settings(array $input): array {
    $defaults = [
        'mode'           => 'system',
        'density'        => 'comfortable',
        'sidebar'        => 'expanded',
        'zebra'          => '0',
        'reduced_motion' => 'auto',
    ];
    $allowed = [
        'mode'           => ['system', 'dark', 'light'],
        'density'        => ['comfortable', 'compact'],
        'sidebar'        => ['expanded', 'collapsed'],
        'zebra'          => ['0', '1'],
        'reduced_motion' => ['auto', '0', '1'],
    ];

    $out = $defaults;
    foreach ($defaults as $key => $default) {
        if (!isset($input[$key])) continue;
        $value = (string)$input[$key];
        if (!in_array($value, $allowed[$key], true)) {
            return ['ok' => false, 'error' => "Invalid value for {$key}: {$value}"];
        }
        $out[$key] = $value;
    }
    return ['ok' => true, 'values' => $out];
}

function modernui_handle_post(array $post): array {
    require_once __DIR__ . '/install.php'; // pulls in modernui_install + modernui_generate_loader_js

    if (($post['action'] ?? '') === 'disable') {
        modernui_set_disabled(MODERNUI_SETTINGS_DIR, true);
        modernui_generate_loader_js(true);
        return ['ok' => true, 'reload' => true];
    }
    if (($post['action'] ?? '') === 'enable') {
        modernui_set_disabled(MODERNUI_SETTINGS_DIR, false);
        modernui_generate_loader_js(false);
        return ['ok' => true, 'reload' => true];
    }

    $v = modernui_validate_settings($post);
    if (!$v['ok']) return $v;
    modernui_write_cfg(MODERNUI_SETTINGS_PATH, $v['values']);
    // Regenerate loader.js so data-modernui-mode/density on <html> reflects the new settings on next reload
    modernui_generate_loader_js(modernui_is_disabled(MODERNUI_SETTINGS_DIR));
    return ['ok' => true, 'values' => $v['values']];
}

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json');
    echo json_encode(modernui_handle_post($_POST));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:php`
Expected: PASS.

- [ ] **Step 5: Write the Settings page**

Contents of `package/pages/Theme.page`:

```
Menu="Settings"
Title="Theme"
Icon="icon-theme"
Tag="paint-brush"
---
<?php
require_once '/usr/local/emhttp/plugins/unraid-modernui/include/helpers.php';
$settings = modernui_parse_cfg('/boot/config/plugins/unraid-modernui/settings.cfg');
$disabled = modernui_is_disabled('/boot/config/plugins/unraid-modernui');

function modernui_radio(string $name, string $value, string $label, string $current): string {
    $checked = $value === $current ? ' checked' : '';
    return "<label style='margin-right:16px;'><input type='radio' name='{$name}' value='{$value}'{$checked}> {$label}</label>";
}

$mode    = $settings['mode']    ?? 'system';
$density = $settings['density'] ?? 'comfortable';
$sidebar = $settings['sidebar'] ?? 'expanded';
$zebra   = $settings['zebra']   ?? '0';
$rmotion = $settings['reduced_motion'] ?? 'auto';
?>
<div style="max-width:720px;padding:16px;">
  <h2 style="margin:0 0 8px 0;">Modern UI</h2>
  <p style="margin:0 0 24px 0;color:#888;">A clean, flat theme for Unraid 7.x. Phase 1: design tokens only — full UI overhaul in later releases.</p>

  <?php if ($disabled): ?>
  <div style="padding:12px 16px;border-left:4px solid #f59e0b;background:#fff7e6;margin-bottom:16px;">
    Modern UI is currently <strong>disabled</strong>. Stock Unraid UI is active. Click <em>Enable</em> below or the floating pill in any page.
  </div>
  <?php endif; ?>

  <form id="modernui-settings" method="post" action="/plugins/unraid-modernui/include/save.php">
    <fieldset style="border:1px solid #ddd;padding:12px 16px;margin-bottom:16px;">
      <legend>Color mode</legend>
      <?= modernui_radio('mode', 'system', 'System', $mode) ?>
      <?= modernui_radio('mode', 'dark',   'Dark',   $mode) ?>
      <?= modernui_radio('mode', 'light',  'Light',  $mode) ?>
    </fieldset>

    <fieldset style="border:1px solid #ddd;padding:12px 16px;margin-bottom:16px;">
      <legend>Density</legend>
      <?= modernui_radio('density', 'comfortable', 'Comfortable', $density) ?>
      <?= modernui_radio('density', 'compact',     'Compact',     $density) ?>
    </fieldset>

    <fieldset style="border:1px solid #ddd;padding:12px 16px;margin-bottom:16px;">
      <legend>Sidebar default</legend>
      <?= modernui_radio('sidebar', 'expanded',  'Expanded',  $sidebar) ?>
      <?= modernui_radio('sidebar', 'collapsed', 'Collapsed', $sidebar) ?>
    </fieldset>

    <fieldset style="border:1px solid #ddd;padding:12px 16px;margin-bottom:16px;">
      <legend>Table zebra stripes</legend>
      <label><input type="checkbox" name="zebra" value="1"<?= $zebra === '1' ? ' checked' : '' ?>> Enabled</label>
    </fieldset>

    <fieldset style="border:1px solid #ddd;padding:12px 16px;margin-bottom:16px;">
      <legend>Reduced motion</legend>
      <?= modernui_radio('reduced_motion', 'auto', 'Auto (system)', $rmotion) ?>
      <?= modernui_radio('reduced_motion', '1',    'Always',        $rmotion) ?>
      <?= modernui_radio('reduced_motion', '0',    'Never',         $rmotion) ?>
    </fieldset>

    <div style="margin-top:24px;">
      <button type="submit" name="save" value="1">Save</button>
      <?php if ($disabled): ?>
        <button type="button" id="modernui-enable" style="margin-left:8px;background:#ff8c2f;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;">Enable Modern UI</button>
      <?php else: ?>
        <button type="button" id="modernui-disable" style="margin-left:8px;background:#444;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;">Disable theme (revert to stock UI)</button>
      <?php endif; ?>
    </div>
  </form>

  <hr style="margin:32px 0 16px 0;">
  <h3 style="margin:0 0 8px 0;">About</h3>
  <p style="margin:0 0 4px 0;font-size:13px;color:#666;">Modern UI v0.1.0 (Phase 1). <a href="https://github.com/EXAMPLE/unraid-modernui" target="_blank">GitHub</a></p>
  <p style="margin:0;font-size:13px;color:#666;">Unraid® webGui © Lime Technology, Inc. <a href="/webGui/include/Help.php" target="_blank">Manual</a></p>
</div>

<script>
(function() {
  const form = document.getElementById('modernui-settings');
  if (!form) return;

  function post(action) {
    const fd = new FormData();
    fd.append('action', action);
    return fetch('/plugins/unraid-modernui/include/save.php', { method: 'POST', body: fd });
  }

  const dis = document.getElementById('modernui-disable');
  if (dis) dis.addEventListener('click', () => post('disable').then(() => location.reload()));
  const en = document.getElementById('modernui-enable');
  if (en) en.addEventListener('click', () => post('enable').then(() => location.reload()));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    fetch(form.action, { method: 'POST', body: new FormData(form) })
      .then(r => r.json())
      .then(j => {
        if (j.ok) location.reload();
        else alert('Save failed: ' + (j.error || 'unknown'));
      });
  });
})();
</script>
```

- [ ] **Step 6: Commit**

```powershell
git add package/include/save.php package/pages/Theme.page tests/unit-php/save.test.php
git commit -m "feat(settings): add Theme.page with five toggles, Disable button, and About section"
```

---

## Task 10: Upgrade safety stub & boot-time rc.modernui

**Files:**
- Create: `package/include/upgrade.php`
- Create: `package/event/disks_mounted`
- Create: `package/scripts/rc.modernui`

- [ ] **Step 1: Write `upgrade.php` (Phase 1 stub)**

Contents of `package/include/upgrade.php`:

```php
<?php
require_once __DIR__ . '/helpers.php';

const MODERNUI_SAFEMODE_FLAG = '/boot/config/plugins/unraid-modernui/safemode';

function modernui_upgrade_check(): void {
    // Phase 1: no shell PHP overrides exist, so there is nothing to validate.
    // Phase 3 will: for each file under overlay/, compare current upstream SHA against the recorded baseline,
    // and on mismatch write the safemode flag here.
    $flag = MODERNUI_SAFEMODE_FLAG;
    if (is_file($flag)) unlink($flag);
    echo "Modern UI: upgrade check passed (Phase 1 — no overrides to verify)\n";
}

if (PHP_SAPI === 'cli') {
    modernui_upgrade_check();
}
```

- [ ] **Step 2: Write `event/disks_mounted`**

Contents of `package/event/disks_mounted`:

```bash
#!/bin/bash
php /usr/local/emhttp/plugins/unraid-modernui/include/upgrade.php
```

- [ ] **Step 3: Write `rc.modernui` (boot-time guarantee that disabled flag is honored)**

Contents of `package/scripts/rc.modernui`:

```bash
#!/bin/bash
# rc.modernui — runs at plugin start time, ensures dynamix.cfg block matches disabled state.
#
# Why: an SSH user may `touch /boot/config/plugins/unraid-modernui/disabled` while the box is down.
# On next boot we must rewrite dynamix.cfg's block so the floating re-enable pill is what loads,
# not the full theme.

PHP=/usr/bin/php
INCLUDE=/usr/local/emhttp/plugins/unraid-modernui/include

if [ -x "$PHP" ] && [ -f "$INCLUDE/install.php" ]; then
  "$PHP" "$INCLUDE/install.php"
fi
```

- [ ] **Step 4: Commit**

(The `chmod` on `rc.modernui` was already added to `modernui_install()` in Task 7.)

```powershell
git add package/include/upgrade.php package/event/disks_mounted package/scripts/rc.modernui
git commit -m "feat(install): add upgrade stub, disks_mounted hook, and rc.modernui boot guard"
```

---

## Task 11: Package as `.txz` and dev-mirror to Unraid box

**Files:**
- Create: `tools/package-txz.mjs`
- Create: `tools/dev-mirror.mjs`

- [ ] **Step 1: Write the txz packager**

Contents of `tools/package-txz.mjs`:

```javascript
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const distRoot = join(root, 'dist');
const pkgDir = join(root, 'package');

if (!existsSync(distRoot)) mkdirSync(distRoot);

const version = JSON.parse(spawnSync('node', ['-e', "process.stdout.write(JSON.stringify(require('./package.json').version))"], { cwd: root, encoding: 'utf8' }).stdout);
const out = join(distRoot, `unraid-modernui-${version}.txz`);

// On Windows we use built-in tar (Win10+); on others, tar with -J for xz.
// Build artifacts (package/theme/dist/) must be present — call `npm run build` first.
const tarArgs = ['-cJf', out, '-C', pkgDir, '.'];
const result = spawnSync('tar', tarArgs, { stdio: 'inherit' });
if (result.status !== 0) {
  console.error('tar failed. On Windows ensure you have a recent Win10 build (tar.exe is built-in).');
  process.exit(1);
}
console.log(`Packaged → ${out}`);
```

- [ ] **Step 2: Run the packager**

Run: `npm run build && npm run package`
Expected: `dist/unraid-modernui-0.1.0.txz` exists.

- [ ] **Step 3: Write the dev-mirror script**

Contents of `tools/dev-mirror.mjs`:

```javascript
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
```

**Note on the SSH port flag:** OpenSSH uses lowercase `-p` for ssh and uppercase `-P` for scp. Set `MODERNUI_SSH_PORT=22` (or whatever) in your environment before running `npm run dev-mirror`.

- [ ] **Step 4: Manually test dev-mirror against your Unraid box**

Run: `npm run dev-mirror -- root@<your-unraid-host>`
Expected: build → package → scp → ssh install runs without error. SSH-in afterwards and verify:
- `/usr/local/emhttp/plugins/unraid-modernui/theme/dist/modernui.css` exists
- `/boot/config/plugins/dynamix/dynamix.cfg` contains the `# >>> unraid-modernui begin >>>` block
- `/boot/config/plugins/unraid-modernui/` directory exists

Open the Unraid webGui in a browser, hard-refresh. You should see:
- Body background changes to `#0f1419` (dark) or `#fff` (light) depending on system preference
- Settings > Theme appears in the nav

If anything looks wrong: navigate to `<unraid>/Main?modernui=off` and confirm stock UI returns.

- [ ] **Step 5: Commit**

```powershell
git add tools/package-txz.mjs tools/dev-mirror.mjs
git commit -m "feat(tools): add txz packager and dev-mirror script (build + scp + remote install)"
```

---

## Task 12: Integration test — install / verify / uninstall round-trip

**Files:**
- Create: `tests/integration/install-uninstall.mjs`

- [ ] **Step 1: Write the integration test**

Contents of `tests/integration/install-uninstall.mjs`:

```javascript
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

function ssh(cmd) {
  const r = spawnSync('ssh', [...sshFlags, host, cmd], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('SSH command failed:', cmd);
    console.error(r.stderr);
    process.exit(1);
  }
  return r.stdout.trim();
}

function sha(path) {
  return ssh(`sha256sum ${path} 2>/dev/null | cut -d' ' -f1 || echo MISSING`);
}

console.log('▶ capturing pre-install state…');
const preDynamix = sha('/boot/config/plugins/dynamix/dynamix.cfg');
const preLayout  = sha(LAYOUT_FILE);
console.log('  dynamix.cfg SHA:', preDynamix);
console.log('  layout SHA:     ', preLayout);

console.log('▶ installing plugin via dev-mirror…');
const install = spawnSync('node', [join(root, 'tools/dev-mirror.mjs'), host], { stdio: 'inherit' });
if (install.status !== 0) { console.error('install failed'); process.exit(1); }

console.log('▶ verifying installed state…');
const dynamixBlock = ssh('grep -c "unraid-modernui begin" /boot/config/plugins/dynamix/dynamix.cfg');
if (dynamixBlock !== '1') { console.error('FAIL: expected one modernui block in dynamix.cfg, got', dynamixBlock); process.exit(1); }
const layoutBlock = ssh(`grep -c "unraid-modernui:begin" ${LAYOUT_FILE}`);
if (layoutBlock !== '1') { console.error('FAIL: expected one modernui:begin marker in layout, got', layoutBlock); process.exit(1); }
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

console.log('▶ cleaning up plugin payload…');
ssh('rm -rf /usr/local/emhttp/plugins/unraid-modernui');

console.log('✓ install → verify → uninstall → verify passed (both dynamix.cfg and layout file restored byte-identical)');
```

- [ ] **Step 2: Run the integration test against your Unraid box**

Run:
```powershell
$env:MODERNUI_TEST_HOST="root@<your-unraid-host>"; npm run test:integration
```

Expected: every `▶` step prints, ending with `✓ install → verify → uninstall → verify passed`.

If the test fails partway through, your `dynamix.cfg` may have an orphan block. To restore: SSH in and run `php /usr/local/emhttp/plugins/unraid-modernui/include/uninstall.php` (if the plugin payload still exists) or manually edit `dynamix.cfg` to delete lines between the `# >>> unraid-modernui begin >>>` and `# <<< unraid-modernui end <<<` markers.

- [ ] **Step 3: Commit**

```powershell
git add tests/integration/install-uninstall.mjs
git commit -m "test(integration): add install/verify/uninstall round-trip against live Unraid box"
```

---

## Task 13: Verify all four fallback paths manually on the test box

This is a manual verification task — no code, but a recorded checklist. Each step is a 1-minute action plus an observation.

- [ ] **Step 1: Path 1 — In-theme Disable button**
  1. Reinstall the plugin: `npm run dev-mirror -- root@<host>`
  2. Open `<unraid>/Settings/Theme` in a browser. Hard-refresh.
  3. Click "Disable theme". Page reloads.
  4. **Verify**: body background returns to Unraid's default (no `#0f1419`). The orange floating pill "Enable Modern UI" appears in the bottom-right of every page.
  5. SSH in: `cat /usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js`
  6. **Verify**: the `src=` in loader.js points at `re-enable.js`, not `modernui.js`.

- [ ] **Step 2: Path 2 — Floating re-enable pill**
  1. With the theme still disabled from Step 1, click the floating "Enable Modern UI" pill.
  2. Page reloads.
  3. **Verify**: body background returns to `#0f1419`. Pill disappears.
  4. SSH in: `cat /usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js`
  5. **Verify**: the `src=` in loader.js points back at `modernui.js`.

- [ ] **Step 3: Path 3 — URL parameter `?modernui=off`**
  1. Navigate to `<unraid>/Main?modernui=off`
  2. **Verify**: body background is Unraid's default for this page load only. Theme JS runs but immediately short-circuits (check browser console — no `[modernui] booting` log).
  3. Navigate to `<unraid>/Main` (no param)
  4. **Verify**: theme applies again.

- [ ] **Step 4: Path 4 — SSH disabled flag**
  1. SSH in: `touch /boot/config/plugins/unraid-modernui/disabled`
  2. Trigger plugin restart: `php /usr/local/emhttp/plugins/unraid-modernui/include/install.php`
  3. Hard-refresh the Unraid webGui in browser.
  4. **Verify**: theme is disabled, floating pill is visible.
  5. SSH in: `rm /boot/config/plugins/unraid-modernui/disabled && php /usr/local/emhttp/plugins/unraid-modernui/include/install.php`
  6. Hard-refresh.
  7. **Verify**: theme is enabled.

- [ ] **Step 5: Document the manual checklist in the repo**

Create `docs/manual-verification.md`:

```markdown
# Manual verification checklist (run before every release)

## Fallback paths

1. **In-theme Disable button** — Settings > Theme > Disable theme → body returns to stock, pill appears, dynamix.cfg points at re-enable.js
2. **Floating re-enable pill** — Click pill → theme returns, dynamix.cfg points at modernui.js
3. **URL parameter** — `?modernui=off` → stock UI for that load only, no `[modernui]` console log
4. **SSH disabled flag** — `touch /boot/config/plugins/unraid-modernui/disabled` + reinstall → stock UI; remove flag + reinstall → theme back

## Other v0.1 acceptance criteria

5. Install/uninstall round-trip leaves dynamix.cfg byte-identical (covered by `tests/integration/install-uninstall.mjs`)
6. Settings page persists values across reloads
7. `<html data-theme>` matches the Settings > Theme > Color mode choice (Dark/Light/System honoring prefers-color-scheme)
```

- [ ] **Step 6: Commit**

```powershell
git add docs/manual-verification.md
git commit -m "docs: add manual verification checklist for fallback paths"
```

---

## Task 14: README and INSTALL docs

**Files:**
- Create: `README.md`
- Create: `INSTALL.md`
- Create: `docs/compatibility.md`

- [ ] **Step 1: Write the README**

Contents of `README.md`:

```markdown
# Unraid ModernUI

A clean, flat, responsive theme for Unraid 7.x. Inspired by TrueNAS SCALE with refined Unraid orange accent.

> **Phase 1 status:** Design-token-only re-tone (dark/light body color, accent, focus rings). Full UI overhaul — sidebar, restyled components, mobile responsive — lands in later phases.

## Install

Two options:

**1. Community Apps** (once published) — search for "Modern UI".

**2. Direct URL** — Unraid → Plugins → Install Plugin → paste:
```
https://raw.githubusercontent.com/EXAMPLE/unraid-modernui/main/unraid-modernui.plg
```

After install, open **Settings → Theme** to configure.

## Fallback to stock UI (any time, instantly)

Four independent escape hatches — all safe to use on a production install:

1. **Settings → Theme → Disable theme** — instant revert, plugin stays installed
2. **Floating pill** — appears in the bottom-right when theme is disabled, click to re-enable
3. **URL param** — append `?modernui=off` to any Unraid page for a single-load bypass
4. **SSH** — `touch /boot/config/plugins/unraid-modernui/disabled` then restart Unraid

## Develop

Requires Node.js 20+, PHP 8.x on PATH, OpenSSH client (Windows 10+ has it built-in).

```bash
npm install
npm run build        # Sass + Vite → package/theme/dist/
npm test             # Unit tests (TypeScript + PHP)
npm run dev-mirror -- root@<your-unraid-host>   # Build + scp + remote install
```

Run the integration test (assumes you have a test Unraid box reachable over SSH):

```bash
MODERNUI_TEST_HOST=root@<host> npm run test:integration
```

See [INSTALL.md](INSTALL.md) for install troubleshooting and [docs/manual-verification.md](docs/manual-verification.md) for the pre-release checklist.

## License

MIT
```

- [ ] **Step 2: Write INSTALL.md**

Contents of `INSTALL.md`:

```markdown
# Install troubleshooting

## Symptoms and fixes

### "Theme installed but the webGui looks unchanged"

1. Hard-refresh your browser (Ctrl+Shift+R / Cmd+Shift+R) — Unraid caches CSS aggressively.
2. Check that `/boot/config/plugins/dynamix/dynamix.cfg` contains the `# >>> unraid-modernui begin >>>` block. If missing, re-run `php /usr/local/emhttp/plugins/unraid-modernui/include/install.php`.
3. Check that the theme isn't disabled: `ls /boot/config/plugins/unraid-modernui/disabled` — if that file exists, delete it and reinstall.

### "I broke the webGui and can't reach it"

SSH into the box and run:

```bash
touch /boot/config/plugins/unraid-modernui/disabled
php /usr/local/emhttp/plugins/unraid-modernui/include/install.php
```

This swaps the active JS to `re-enable.js` (just the pill) — your next page load will be stock Unraid with a single small pill in the corner.

If even that fails, fully remove the dynamix.cfg block:

```bash
php /usr/local/emhttp/plugins/unraid-modernui/include/uninstall.php
```

### "Uninstall didn't fully revert dynamix.cfg"

The SHA-keyed backup should restore the original. If you've manually edited dynamix.cfg since install, the backup may be older than your changes — check `/usr/local/emhttp/plugins/unraid-modernui/backups/` for the most recent `dynamix.cfg.<sha>` and restore manually.

### "Settings page isn't appearing"

The page registers under `Settings > Theme`. If it's not there:

1. Confirm `/usr/local/emhttp/plugins/unraid-modernui/pages/Theme.page` exists.
2. Restart emhttpd: `/etc/rc.d/rc.nginx restart` (or simply reboot).

## Where things live

| Path | Contents |
|---|---|
| `/boot/config/plugins/unraid-modernui/settings.cfg` | Your saved preferences (persisted across reboots, flash-backed up) |
| `/boot/config/plugins/unraid-modernui/disabled` | Presence = theme disabled |
| `/boot/config/plugins/unraid-modernui/safemode` | Presence = Phase 3 safe-mode (no shell overrides applied) |
| `/usr/local/emhttp/plugins/unraid-modernui/` | The plugin payload (CSS, JS, PHP) |
| `/usr/local/emhttp/plugins/unraid-modernui/backups/dynamix.cfg.<sha>` | Pre-install backup of dynamix.cfg |
```

- [ ] **Step 3: Seed the plugin compatibility matrix**

Contents of `docs/compatibility.md`:

```markdown
# Plugin compatibility matrix

Status of community plugins that contribute UI into Unraid's footer or other shared surfaces.

| Plugin | Last tested version | Status | Notes |
|---|---|---|---|
| Dynamix System Temperature | _untested_ | — | Phase 3: render in sidebar System Status footer |
| Dynamix System Statistics | _untested_ | — | Phase 3: render in sidebar System Status footer |
| Dynamix UPS | _untested_ | — | Phase 3: render in sidebar System Status footer |

**Status meanings:**
- **first-class** — recognized by selector, styled to match the theme
- **generic-mirrored** — content preserved in a generic "Plugins" sidebar slot, basic styling
- **known-broken** — actively breaks under the theme; tracked in GitHub issues until fixed

Phase 1 does not interact with these plugins — bottom bar remains in stock Unraid form.
```

- [ ] **Step 4: Commit**

```powershell
git add README.md INSTALL.md docs/compatibility.md
git commit -m "docs: add README, INSTALL troubleshooting, and plugin compatibility matrix"
```

---

## Task 15: Final smoke test — run the full quality gate

- [ ] **Step 1: Run the full local test suite**

Run: `npm test`
Expected: TS tests pass (Vitest output) and PHP tests pass (`run-all.mjs` output).

- [ ] **Step 2: Build a release artifact**

Run: `npm run build && npm run package`
Expected: `dist/unraid-modernui-0.1.0.txz` exists.

- [ ] **Step 3: Deploy to the test box and run the integration test**

Run:
```powershell
$env:MODERNUI_TEST_HOST="root@<your-unraid-host>"; npm run test:integration
```
Expected: round-trip passes.

- [ ] **Step 4: Walk the manual fallback checklist**

Follow every step in [docs/manual-verification.md](docs/manual-verification.md). Tick each box.

- [ ] **Step 5: Verify Phase 1 acceptance criteria**

Confirm each:
- [x] Plugin installs cleanly from `npm run dev-mirror`
- [x] Plugin uninstalls leaving `dynamix.cfg` byte-identical to pre-install state (Task 12 integration test)
- [x] Settings > Theme page appears with five controls
- [x] Saving settings persists across page reloads (settings.cfg on /boot)
- [x] All four fallback paths work (Task 13 manual checklist)
- [x] CSS tokens apply: body bg is `#0f1419` (or `#ffffff` light) instead of Unraid's default

- [ ] **Step 6: Tag the release**

```powershell
git tag -a v0.1.0 -m "Phase 1: foundation & safety"
```

(Do not push the tag yet — wait for the user to confirm they want to publish.)

- [ ] **Step 7: Commit any final cleanup**

If anything was uncommitted during the smoke test:

```powershell
git add -A
git commit -m "chore: Phase 1 final cleanup"
```

---

## Phase 1 done

You should now have:
- A working `.plg` plugin installable on Unraid 7.x
- Design-token CSS applied across the webGui (body bg, text colors, accent on links, focus rings)
- Settings > Theme page with five controls
- All four fallback paths working
- An install/uninstall round-trip that's byte-reversible
- Unit + integration tests passing

**Not yet** (deferred to later phases):
- Component-level styling (cards, tables, forms, dialogs) — **Phase 2**
- Left sidebar replacing the top nav — **Phase 3**
- Plugin-safe footer proxy for temps/UPS/stats — **Phase 3**
- Mobile responsive transforms — **Phase 4**
- Playwright visual regression — **Phase 5**
