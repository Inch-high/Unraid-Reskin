# Phase 4 Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Unraid 7.x's top-nav + bottom status bar with a TrueNAS-style left sidebar (240/64px) + 48px topbar, mounted client-side, gated by a new `shell=on|off` cfg key. Preserve all plugin-contributed DOM (bottom-bar temps/UPS/power and top-right action buttons) via two `MutationObserver` mirrors.

**Architecture:** No new PHP overlays. Phase 1's `DefaultPageLayout.php` injection (one `<link>` + one `<script>`) is reused. A new `src/ts/shell/` module is bundled into the existing `modernui.js` (loaded on every page). At boot it checks `data-modernui-shell`, adds `body.modernui-shell-active`, and mounts a single `<modernui-shell>` Lit element in a fixed-position overlay. CSS hides the stock chrome (`header.tilebar` text, `nav.tabs`, bottom `div.statusbar`) and pads the page content. Two MutationObservers mirror plugin DOM into our shell, driven by `plugin-registry.json`. Same per-feature toggle pattern as Phase 3's `dashboard` key.

**Tech Stack:** TypeScript + Lit 3 (existing); Vitest + jsdom (existing TS test layer); PHP 8 + assert-based test scripts via `tests/unit-php/run-all.mjs` (existing); SCSS via `sass.compile` in `tools/build.mjs` (existing). No new dependencies.

---

## File Structure

End-state — 12 new TS files, 1 new JSON, 1 new SCSS, 3 modified PHP files, 1 modified TS entry, 3 new test files, 2 modified test files.

```
src/ts/
├── modernui.ts                          MODIFY: import + call shellBoot
└── shell/
    ├── boot.ts                          CREATE: shellEnabled() gate + shellBoot()
    ├── nav-builder.ts                   CREATE: curated tree + auto-discovery merge
    ├── breadcrumb.ts                    CREATE: pathname → label[]
    ├── plugin-mirror.ts                 CREATE: MutationObserver wrapper
    ├── plugin-registry.json             CREATE: known plugin selectors/slots
    └── components/
        ├── modernui-shell.ts            CREATE: root component
        ├── shell-sidebar.ts             CREATE: sidebar (logo + nav + status footer)
        ├── shell-topbar.ts              CREATE: topbar (breadcrumb + slots + bell + menu)
        ├── shell-nav-item.ts            CREATE: single nav row
        ├── shell-status-row.ts          CREATE: single status row + popover
        ├── shell-notification-bell.ts   CREATE: bell + popover
        └── shell-user-menu.ts           CREATE: About / Stock UI / Logout

src/styles/
├── modernui.scss                        MODIFY: @use shell-overlay
└── shell-overlay.scss                   CREATE: body class hides stock chrome, pads page

package/
├── Theme.page                           MODIFY: add Shell layout fieldset
└── include/
    ├── save.php                         MODIFY: whitelist 'shell' key
    └── install.php                      MODIFY: emit data-modernui-shell

tests/
├── unit-php/save.test.php               MODIFY: shell key assertions
└── unit-ts/shell/
    ├── boot.test.ts                     CREATE: shellEnabled gate
    ├── nav-builder.test.ts              CREATE: curated + auto-discovery merge
    ├── breadcrumb.test.ts               CREATE: pathname → segments
    └── plugin-mirror.test.ts            CREATE: registry-driven matching
```

**Responsibility split:**

- `save.php` owns the `shell` whitelist — one entry in `$defaults` + one in `$allowed`.
- `install.php`'s `modernui_generate_loader_js()` owns the `data-modernui-shell` emit (one new local + one new line in the loader string).
- `Theme.page` owns the radio fieldset (same shape as Phase 3's Dashboard layout fieldset).
- `src/ts/shell/boot.ts` owns the gate (`shellEnabled(doc)`) and the lifecycle wiring (`shellBoot(doc)`).
- `nav-builder.ts` / `breadcrumb.ts` / `plugin-mirror.ts` are pure helpers — TDD.
- `<modernui-shell>` and its 6 child components own visual rendering — verified live, no DOM mount tests (matches Phase 3 conventions).
- `plugin-registry.json` is hand-edited data — every known community plugin gets an entry; unknowns still mirror, just without first-class styling.

---

## Plan-Wide Conventions

**TDD rhythm:** Pure helpers (`shellEnabled`, `buildNav`, `pathToBreadcrumb`, the registry-matching half of `plugin-mirror`) get the red-green-refactor rhythm. Lit components and CSS get a single edit + live-box verify — same as Phase 3.

**Commits:** One per task once tests/build pass. Conventional Commits — `feat(shell): ...`, `feat(settings): ...`, etc. Matches recent work.

**Live verification recipe** — must be run from PowerShell so the env var sticks:

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Then hard-reload the connected Chrome tab on `https://<your-unraid-host>/Dashboard` (or whichever page the task targets) via `mcp__Claude_in_Chrome__javascript_tool` running `location.reload(true)`. See [[reference_dev_mirror_deploy]] — running this from Bash silently drops the env var and connects to port 22.

**Bottom-bar nchan caveat:** Per [[project_nchan_pauses_when_hidden]] Unraid pauses live updates when the source DOM is not visible. The spec's `display: none` on the bottom statusbar is the simplest hide; if it pauses plugin updates, Task 5 falls back to offscreen positioning. The live-verify in Task 18 explicitly checks that mirrored values still tick.

**Server name source:** Spec says "PHP-injected `data-server-name`". Since `install.php` writes a static `loader.js` (no per-request PHP), we read the server name from the existing tilebar DOM instead — Unraid already renders it there. Saves a PHP change. If the live-verify in Task 7 shows the tilebar doesn't carry it cleanly, fall back to PHP-injected inline `<script>` in `modernui_html_block()`.

**Bundle:** Shell code is added to `src/ts/modernui.ts` (loaded on every page). No new build entry. Bundle size grows by Lit + ~7 small components — still smaller than `modernui-dashboard.js`.

**Order:** Tasks land in numbered order. PHP plumbing first (Tasks 1–3), then the TS gate + CSS shell (4–5), then the visible skeleton (6), then the sidebar (7–12), then the topbar (13–16), then the plugin proxies (17–19), then responsive + final verify (20–21). Each visible-on-screen milestone has its own deploy/verify checkpoint built into the task.

---

## Task 1: Whitelist the `shell` key in `save.php`

**Files:**
- Modify: `package/include/save.php`
- Modify: `tests/unit-php/save.test.php`

- [ ] **Step 1: Add failing tests for the new key**

Open `tests/unit-php/save.test.php`. Just before the final `echo "all save tests passed\n";` line, append:

```php
// Shell layout toggle: 'on' and 'off' are valid, anything else is rejected.
$shellOn = modernui_validate_settings(['shell' => 'on']);
assert($shellOn['ok'] === true, "shell=on should pass: " . var_export($shellOn, true));
assert($shellOn['values']['shell'] === 'on');

$shellOff = modernui_validate_settings(['shell' => 'off']);
assert($shellOff['ok'] === true, "shell=off should pass");
assert($shellOff['values']['shell'] === 'off');

$badShell = modernui_validate_settings(['shell' => 'maybe']);
assert($badShell['ok'] === false, "shell=maybe should fail");
assert(strpos($badShell['error'], 'shell') !== false);

$noShell = modernui_validate_settings([]);
assert($noShell['ok'] === true);
assert($noShell['values']['shell'] === 'on', "default shell should be on");
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm run test:php
```

Expected: at least one new assertion fails — `shell=on should pass: ['ok' => false, ...]` or the default-on check, depending on which the validator hits first.

- [ ] **Step 3: Add the key to the whitelist**

Open `package/include/save.php`. Locate `modernui_validate_settings()` (lines 7-33). Append `'shell'` to both `$defaults` and `$allowed`:

```php
function modernui_validate_settings(array $input): array {
    $defaults = [
        'mode'           => 'system',
        'density'        => 'comfortable',
        'sidebar'        => 'expanded',
        'zebra'          => '0',
        'reduced_motion' => 'auto',
        'dashboard'      => 'on',
        'shell'          => 'on',
    ];
    $allowed = [
        'mode'           => ['system', 'dark', 'light'],
        'density'        => ['comfortable', 'compact'],
        'sidebar'        => ['expanded', 'collapsed'],
        'zebra'          => ['0', '1'],
        'reduced_motion' => ['auto', '0', '1'],
        'dashboard'      => ['on', 'off'],
        'shell'          => ['on', 'off'],
    ];
    // ...rest of the function unchanged
}
```

- [ ] **Step 4: Run the test again to verify it passes**

```powershell
npm run test:php
```

Expected: `all save tests passed`.

- [ ] **Step 5: Commit**

```powershell
git add package/include/save.php tests/unit-php/save.test.php; git commit -m "feat(settings): whitelist shell=on|off in save.php"
```

---

## Task 2: Extend `modernui_generate_loader_js` to emit `data-modernui-shell`

**Files:**
- Modify: `package/include/install.php`

- [ ] **Step 1: Edit the generator**

Open `package/include/install.php`. Locate `modernui_generate_loader_js()` (lines 82-105). Add a `$shell` local and one new `dataset.` line. The full replacement:

```php
function modernui_generate_loader_js(bool $disabled): void {
    $target = $disabled ? 're-enable.js' : 'modernui.js';
    $settings = modernui_parse_cfg('/boot/config/plugins/unraid-modernui/settings.cfg');
    $mode      = $settings['mode']      ?? 'system';
    $density   = $settings['density']   ?? 'comfortable';
    $dashboard = $settings['dashboard'] ?? 'on';
    $shell     = $settings['shell']     ?? 'on';
    $extraScript = $disabled
        ? ''
        : "var d=document.createElement('script');\n"
          . "d.src='/plugins/unraid-modernui/theme/dist/modernui-dashboard.js';\n"
          . "document.head.appendChild(d);\n";
    $loader = "(function(){\n"
        . "var r=document.documentElement;\n"
        . "r.dataset.modernuiMode=" . json_encode($mode) . ";\n"
        . "r.dataset.modernuiDensity=" . json_encode($density) . ";\n"
        . "r.dataset.modernuiDashboard=" . json_encode($dashboard) . ";\n"
        . "r.dataset.modernuiShell=" . json_encode($shell) . ";\n"
        . "var s=document.createElement('script');\n"
        . "s.src='/plugins/unraid-modernui/theme/dist/" . $target . "';\n"
        . "document.head.appendChild(s);\n"
        . $extraScript
        . "})();\n";
    $loaderPath = '/usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js';
    file_put_contents($loaderPath, $loader, LOCK_EX);
}
```

Two changes vs. current:
- New local `$shell = $settings['shell'] ?? 'on';`
- New loader line `r.dataset.modernuiShell=...`

- [ ] **Step 2: Lint to verify it parses**

```powershell
php -l package/include/install.php
```

Expected: `No syntax errors detected`.

- [ ] **Step 3: Run the full PHP suite (no regression)**

```powershell
npm run test:php
```

Expected: all existing test files still pass.

- [ ] **Step 4: Commit**

```powershell
git add package/include/install.php; git commit -m "feat(settings): emit data-modernui-shell from loader.js"
```

---

## Task 3: Add Shell layout fieldset to `Theme.page`

**Files:**
- Modify: `package/Theme.page`

No automated test layer — verification is the live-box step in Task 21. Single edit + commit.

- [ ] **Step 1: Add the new local variable**

Open `package/Theme.page`. After the existing `$dashboard = $settings['dashboard'] ?? 'on';` line (around line 21), add:

```php
$shell     = $settings['shell']     ?? 'on';
```

The full locals block now ends with:

```php
$mode      = $settings['mode']      ?? 'system';
$density   = $settings['density']   ?? 'comfortable';
$sidebar   = $settings['sidebar']   ?? 'expanded';
$zebra     = $settings['zebra']     ?? '0';
$rmotion   = $settings['reduced_motion'] ?? 'auto';
$dashboard = $settings['dashboard'] ?? 'on';
$shell     = $settings['shell']     ?? 'on';
```

- [ ] **Step 2: Add the Shell layout fieldset between "Dashboard layout" and "Density"**

Locate the "Dashboard layout" fieldset (around lines 48-55). After its closing `</fieldset>`, insert:

```php
    <fieldset style="border:1px solid #ddd;padding:12px 16px;margin-bottom:16px;">
      <legend>Shell layout</legend>
      <?= modernui_radio('shell', 'on',  'Modern', $shell) ?>
      <?= modernui_radio('shell', 'off', 'Stock',  $shell) ?>
      <p style="margin:8px 0 0 0;font-size:12px;color:#666;">
        Replace Unraid's top-nav and bottom status bar with a left sidebar and slim topbar. Plugin items (temps, UPS, power buttons) move into the new shell. Master Disable still turns off the whole theme.
      </p>
    </fieldset>
```

- [ ] **Step 3: Lint**

```powershell
php -l package/Theme.page
```

Expected: `No syntax errors detected in package/Theme.page`.

- [ ] **Step 4: Commit**

```powershell
git add package/Theme.page; git commit -m "feat(settings): add Shell layout fieldset to Theme page"
```

---

## Task 4: Shell entry — `shellEnabled()` gate + stub `shellBoot()`

**Files:**
- Create: `src/ts/shell/boot.ts`
- Create: `tests/unit-ts/shell/boot.test.ts`
- Modify: `src/ts/modernui.ts`

Establishes the entry point. `shellBoot()` does nothing yet beyond the gate check — subsequent tasks fill it in. Pure-function `shellEnabled(doc)` is unit-tested.

- [ ] **Step 1: Write the failing test**

Create `tests/unit-ts/shell/boot.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { shellEnabled } from '../../../src/ts/shell/boot';

describe('shellEnabled gate', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.modernuiShell;
  });

  it('returns true when the attribute is absent (failure-mode default)', () => {
    expect(shellEnabled(document)).toBe(true);
  });

  it('returns true when the attribute is "on"', () => {
    document.documentElement.dataset.modernuiShell = 'on';
    expect(shellEnabled(document)).toBe(true);
  });

  it('returns false when the attribute is "off"', () => {
    document.documentElement.dataset.modernuiShell = 'off';
    expect(shellEnabled(document)).toBe(false);
  });

  it('returns true for any other (unknown / future) value', () => {
    document.documentElement.dataset.modernuiShell = 'something-else';
    expect(shellEnabled(document)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm run test:ts
```

Expected: `Failed to resolve import "../../../src/ts/shell/boot"` — module doesn't exist yet.

- [ ] **Step 3: Create the shell entry module**

Create `src/ts/shell/boot.ts`:

```typescript
export function shellEnabled(doc: Document): boolean {
  return doc.documentElement.dataset.modernuiShell !== 'off';
}

export function shellBoot(doc: Document): void {
  if (!shellEnabled(doc)) return;
  // Subsequent tasks add: body class, <modernui-shell> mount, observers.
}
```

- [ ] **Step 4: Wire into the existing top-level entry**

Open `src/ts/modernui.ts`. Add the shell import and call:

```typescript
import { bootThemeInit } from './theme-init';
import { isUrlOverrideOff } from './fallback';
import { shellBoot } from './shell/boot';

if (!isUrlOverrideOff(window.location.href)) {
  bootThemeInit();
  shellBoot(document);
}
```

- [ ] **Step 5: Run the test + build to verify both pass**

```powershell
npm run test:ts
```

Expected: 206 tests pass (202 existing + 4 new).

```powershell
npm run build
```

Expected: `Build complete → ...` with three JS entries (`modernui.js`, `re-enable.js`, `modernui-dashboard.js`).

- [ ] **Step 6: Commit**

```powershell
git add src/ts/shell/boot.ts tests/unit-ts/shell/boot.test.ts src/ts/modernui.ts; git commit -m "feat(shell): add shellEnabled gate + shellBoot stub entry"
```

---

## Task 5: CSS — hide stock chrome, reserve overlay space

**Files:**
- Create: `src/styles/shell-overlay.scss`
- Modify: `src/styles/modernui.scss`

CSS-only step that, once `body.modernui-shell-active` is added (Task 6), hides Unraid's chrome and pushes content to make room for our sidebar/topbar. Nothing visible to the user yet — the body class isn't set. Verified live alongside Task 6.

- [ ] **Step 1: Create the stylesheet**

Create `src/styles/shell-overlay.scss`:

```scss
// Phase 4 shell overlay. Active only while body has .modernui-shell-active
// (added by shellBoot). Sized via two CSS variables that the topbar/sidebar
// components also read so layout stays in sync between CSS-driven hiding
// and Lit-component sizing.
//
// Caveat ([[project_nchan_pauses_when_hidden]]): the bottom statusbar is
// the source for plugin-injected DOM (temps, UPS, power). If display:none
// pauses plugin polling we move it offscreen instead. Initial choice is
// display:none for simplicity; the live verify in Task 18 catches the
// regression if it occurs.
:root {
  --shell-sidebar-width: 240px;
  --shell-sidebar-width-collapsed: 64px;
  --shell-topbar-height: 48px;
}

body.modernui-shell-active {
  // Hide Unraid's top tilebar contents but keep the element so anything
  // we mirror (server name, plugin slot) stays in DOM and stays polled.
  header.tilebar,
  nav.tabs {
    display: none !important;
  }

  // Bottom status bar — Unraid 7.x renders this as <div class="statusbar">
  // inside <footer> in DefaultPageLayout.php. Hide while leaving the DOM
  // for the MutationObserver mirror.
  div.statusbar,
  footer {
    display: none !important;
  }

  // Push the rendered page content to sit inside the shell's frame.
  // Unraid's main content lives in #displaybox; pad both it and the
  // <body> as a belt-and-braces fallback for pages that bypass #displaybox.
  padding-left: var(--shell-sidebar-width);
  padding-top: var(--shell-topbar-height);
  box-sizing: border-box;

  // Make sure the page content scrolls inside the padded region, not under
  // our fixed topbar/sidebar.
  min-height: 100vh;
}

// While the sidebar is collapsed, narrow the padding.
body.modernui-shell-active.modernui-shell-collapsed {
  padding-left: var(--shell-sidebar-width-collapsed);
}
```

- [ ] **Step 2: Wire it into the main stylesheet**

Open `src/styles/modernui.scss`. Append `shell-overlay` after `dashboard-overlay`:

```scss
@use "tokens";
@use "unraid-tokens";
@use "base";
@use "dashboard-overlay";
@use "shell-overlay";
@use "components";
```

- [ ] **Step 3: Build to verify the SCSS compiles**

```powershell
npm run build
```

Expected: `✓ modernui.css (N bytes)` with N noticeably larger than before. No SCSS errors.

- [ ] **Step 4: Commit**

```powershell
git add src/styles/shell-overlay.scss src/styles/modernui.scss; git commit -m "feat(shell): css overlay hides stock chrome + reserves shell space"
```

---

## Task 6: `<modernui-shell>` root component — empty overlay

**Files:**
- Create: `src/ts/shell/components/modernui-shell.ts`
- Modify: `src/ts/shell/boot.ts`

Mounts an empty fixed-position overlay so we can visually confirm the CSS hide + the shell-component positioning are right before any content is added. Empty sidebar (gray block) + empty topbar (gray bar) is the expected look.

- [ ] **Step 1: Create the root component**

Create `src/ts/shell/components/modernui-shell.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('modernui-shell')
export class ModernuiShell extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: 100vw;
      pointer-events: none;
      z-index: 1000;
      font-family: var(--font-sans);
      color: var(--text-primary);
    }
    .sidebar {
      pointer-events: auto;
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: var(--shell-sidebar-width);
      background: var(--bg-surface);
      border-right: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      box-sizing: border-box;
    }
    .topbar {
      pointer-events: auto;
      position: absolute;
      top: 0;
      left: var(--shell-sidebar-width);
      right: 0;
      height: var(--shell-topbar-height);
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      box-sizing: border-box;
    }
  `;

  render() {
    return html`
      <div class="sidebar"></div>
      <div class="topbar"></div>
    `;
  }
}
```

- [ ] **Step 2: Mount the component from `shellBoot`**

Open `src/ts/shell/boot.ts`. Replace its contents with:

```typescript
import './components/modernui-shell';

export function shellEnabled(doc: Document): boolean {
  return doc.documentElement.dataset.modernuiShell !== 'off';
}

export function shellBoot(doc: Document): void {
  if (!shellEnabled(doc)) return;
  doc.body.classList.add('modernui-shell-active');
  const shell = doc.createElement('modernui-shell');
  doc.body.appendChild(shell);
}
```

- [ ] **Step 3: Re-run TS tests (the existing gate test still passes)**

```powershell
npm run test:ts
```

Expected: 206 pass.

- [ ] **Step 4: Build**

```powershell
npm run build
```

Expected: `Build complete →` — `modernui.js` is now bigger (Lit + root component bundled in).

- [ ] **Step 5: Deploy + live verify the empty shell overlays correctly**

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Then in the connected Chrome on `https://<your-unraid-host>/Dashboard`, hard-reload and probe via `mcp__Claude_in_Chrome__javascript_tool`:

```javascript
({
  dataset: { ...document.documentElement.dataset },
  bodyClass: document.body.className,
  hasShell: !!document.querySelector('modernui-shell'),
  tilebarHidden: getComputedStyle(document.querySelector('header.tilebar')).display,
  navTabsHidden: getComputedStyle(document.querySelector('nav.tabs') || document.body).display,
  bodyPaddingLeft: getComputedStyle(document.body).paddingLeft,
})
```

Expected: `dataset.modernuiShell === 'on'`, `bodyClass` contains `modernui-shell-active`, `hasShell === true`, `tilebarHidden === 'none'`, `bodyPaddingLeft === '240px'`.

Visually take a screenshot via `mcp__Claude_in_Chrome__gif_creator` or screenshot tool — you should see a gray sidebar on the left and a gray topbar on the top of the page; Unraid's tilebar + top nav are hidden.

- [ ] **Step 6: Verify Stock fallback still works**

In the Chrome tab, navigate to `https://<your-unraid-host>/Dashboard?modernui=off` (URL escape hatch from v0.1). Expected: stock Unraid renders, no gray overlay. Then navigate to `https://<your-unraid-host>/Settings/Theme`, click Stock under Shell layout, Save, return to `/Dashboard` and reload. Expected: stock Unraid, no overlay, no `modernui-shell-active` class. Set back to Modern before continuing.

- [ ] **Step 7: Commit**

```powershell
git add src/ts/shell/components/modernui-shell.ts src/ts/shell/boot.ts; git commit -m "feat(shell): mount empty <modernui-shell> overlay when enabled"
```

---

## Task 7: `<shell-sidebar>` skeleton — logo + server name header

**Files:**
- Create: `src/ts/shell/components/shell-sidebar.ts`
- Modify: `src/ts/shell/components/modernui-shell.ts`

Top 64px of the sidebar — small logo + server name. Server name comes from the tilebar DOM (already rendered by Unraid). Clickable → `/Dashboard`.

- [ ] **Step 1: Create the sidebar component**

Create `src/ts/shell/components/shell-sidebar.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('shell-sidebar')
export class ShellSidebar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      height: 64px;
      box-sizing: border-box;
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      color: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    .header:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .logo {
      width: 32px;
      height: 32px;
      background: var(--accent, #ff8c2f);
      border-radius: 6px;
      flex-shrink: 0;
    }
    .name {
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .body { flex: 1; min-height: 0; overflow-y: auto; }
    .footer {
      border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      padding: 8px 0;
    }
  `;

  @state() private _serverName = '';

  connectedCallback(): void {
    super.connectedCallback();
    this._serverName = this._readServerName();
  }

  private _readServerName(): string {
    // Unraid's tilebar carries the server name as visible text. Try a few
    // selectors in case the DOM shape varies between releases. Falls back
    // to document.title's first segment so we always have something.
    const tilebar = document.querySelector('header.tilebar');
    if (tilebar) {
      const logo = tilebar.querySelector('.logo, .server-name, .name');
      const text = (logo?.textContent || tilebar.textContent || '').trim();
      if (text) return text.split(/\s{2,}|\n/)[0].trim();
    }
    return (document.title || '').split('/')[0].trim() || 'Unraid';
  }

  render() {
    return html`
      <a class="header" href="/Dashboard">
        <span class="logo"></span>
        <span class="name">${this._serverName}</span>
      </a>
      <div class="body"></div>
      <div class="footer"></div>
    `;
  }
}
```

- [ ] **Step 2: Render the sidebar component from `<modernui-shell>`**

Open `src/ts/shell/components/modernui-shell.ts`. Add the import and replace the `.sidebar` empty div with the new component:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import './shell-sidebar';

@customElement('modernui-shell')
export class ModernuiShell extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: 100vw;
      pointer-events: none;
      z-index: 1000;
      font-family: var(--font-sans);
      color: var(--text-primary);
    }
    .sidebar {
      pointer-events: auto;
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: var(--shell-sidebar-width);
      background: var(--bg-surface);
      border-right: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      box-sizing: border-box;
    }
    .topbar {
      pointer-events: auto;
      position: absolute;
      top: 0;
      left: var(--shell-sidebar-width);
      right: 0;
      height: var(--shell-topbar-height);
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      box-sizing: border-box;
    }
  `;

  render() {
    return html`
      <div class="sidebar"><shell-sidebar></shell-sidebar></div>
      <div class="topbar"></div>
    `;
  }
}
```

- [ ] **Step 3: Build**

```powershell
npm run build
```

Expected: build succeeds. `modernui.js` grows slightly.

- [ ] **Step 4: Deploy + live verify server name renders**

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

In the Chrome tab on `/Dashboard`, hard-reload then probe:

```javascript
({
  serverNameInSidebar: document.querySelector('modernui-shell')
    ?.shadowRoot?.querySelector('shell-sidebar')
    ?.shadowRoot?.querySelector('.name')?.textContent?.trim(),
  tilebarRawText: document.querySelector('header.tilebar')?.textContent?.trim().slice(0, 60),
})
```

Expected: `serverNameInSidebar` is a non-empty string matching the server name shown in the tilebar (e.g. `"HL15Rack"`). Take a screenshot — the orange logo block + server name should appear at the top of the sidebar.

If the server name comes through empty or wrong, that's the fallback signal — log the tilebar DOM via `document.querySelector('header.tilebar').outerHTML` and either tighten the selector or fall back to PHP injection per the Plan-Wide Conventions note.

- [ ] **Step 5: Commit**

```powershell
git add src/ts/shell/components/shell-sidebar.ts src/ts/shell/components/modernui-shell.ts; git commit -m "feat(shell): shell-sidebar header with logo + server name"
```

---

## Task 8: Nav-builder — curated tree (TDD)

**Files:**
- Create: `src/ts/shell/nav-builder.ts`
- Create: `tests/unit-ts/shell/nav-builder.test.ts`

Pure function that returns the hard-coded baseline nav tree (matching the spec's table). Auto-discovery merge lands in Task 9.

- [ ] **Step 1: Write the failing test**

Create `tests/unit-ts/shell/nav-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CURATED_NAV, buildNav } from '../../../src/ts/shell/nav-builder';

describe('CURATED_NAV baseline', () => {
  it('lists the nine spec entries in order', () => {
    const labels = CURATED_NAV.map((n) => n.label);
    expect(labels).toEqual([
      'Dashboard', 'Storage', 'Docker', 'VMs',
      'Users', 'Plugins', 'Settings', 'Tools', 'Apps',
    ]);
  });

  it('Storage is the only expandable group, with Main/Shares/Pools children', () => {
    const storage = CURATED_NAV.find((n) => n.label === 'Storage');
    expect(storage?.children?.map((c) => c.label)).toEqual(['Main', 'Shares', 'Pools']);
    expect(CURATED_NAV.filter((n) => n.children?.length).length).toBe(1);
  });

  it('Dashboard, Docker, VMs etc. carry their own URLs and no children', () => {
    const dashboard = CURATED_NAV.find((n) => n.label === 'Dashboard');
    expect(dashboard?.url).toBe('/Dashboard');
    expect(dashboard?.children).toBeUndefined();
  });
});

describe('buildNav — curated only (no auto-discovery)', () => {
  it('returns the curated tree unchanged when no anchors passed', () => {
    expect(buildNav([])).toEqual(CURATED_NAV);
  });

  it('returns the curated tree unchanged when every anchor matches a curated URL', () => {
    const anchors = [
      { href: '/Dashboard', text: 'Dashboard' },
      { href: '/Docker',    text: 'Docker' },
      { href: '/Settings',  text: 'Settings' },
    ];
    expect(buildNav(anchors)).toEqual(CURATED_NAV);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm run test:ts
```

Expected: import error — module doesn't exist.

- [ ] **Step 3: Implement the curated tree**

Create `src/ts/shell/nav-builder.ts`:

```typescript
export interface NavItem {
  label: string;
  url?: string;
  children?: NavItem[];
  icon?: string;
}

export interface StockAnchor {
  href: string;
  text: string;
}

export const CURATED_NAV: NavItem[] = [
  { label: 'Dashboard', url: '/Dashboard', icon: 'dashboard' },
  { label: 'Storage', icon: 'storage', children: [
    { label: 'Main',   url: '/Main' },
    { label: 'Shares', url: '/Shares' },
    { label: 'Pools',  url: '/Pools' },
  ] },
  { label: 'Docker',   url: '/Docker',   icon: 'docker' },
  { label: 'VMs',      url: '/VMs',      icon: 'vms' },
  { label: 'Users',    url: '/Users',    icon: 'users' },
  { label: 'Plugins',  url: '/Plugins',  icon: 'plugin' },
  { label: 'Settings', url: '/Settings', icon: 'settings' },
  { label: 'Tools',    url: '/Tools',    icon: 'tools' },
  { label: 'Apps',     url: '/Apps',     icon: 'apps' },
];

function flattenCuratedUrls(tree: NavItem[]): Set<string> {
  const out = new Set<string>();
  for (const node of tree) {
    if (node.url) out.add(node.url);
    if (node.children) for (const c of flattenCuratedUrls(node.children)) out.add(c);
  }
  return out;
}

export function buildNav(anchors: StockAnchor[]): NavItem[] {
  const known = flattenCuratedUrls(CURATED_NAV);
  const unknowns = anchors.filter((a) => a.href && !known.has(a.href));
  if (unknowns.length === 0) return CURATED_NAV;
  return [
    ...CURATED_NAV,
    { label: 'Other', icon: 'other', children: unknowns.map((a) => ({
      label: a.text.trim() || a.href,
      url: a.href,
    })) },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
npm run test:ts
```

Expected: 211 tests pass (206 existing + 5 new).

- [ ] **Step 5: Commit**

```powershell
git add src/ts/shell/nav-builder.ts tests/unit-ts/shell/nav-builder.test.ts; git commit -m "feat(shell): nav-builder curated baseline + buildNav skeleton"
```

---

## Task 9: Nav-builder — auto-discovery merge (TDD)

**Files:**
- Modify: `tests/unit-ts/shell/nav-builder.test.ts`

The `buildNav` function from Task 8 already handles auto-discovery via the `unknowns` branch — verify with explicit tests for plugin-added anchors so the contract is locked in.

- [ ] **Step 1: Add failing tests**

Open `tests/unit-ts/shell/nav-builder.test.ts`. Append a new describe block:

```typescript
describe('buildNav — auto-discovery merge', () => {
  it('appends an "Other" section for anchors not in the curated tree', () => {
    const anchors: StockAnchor[] = [
      { href: '/Dashboard',  text: 'Dashboard' },          // curated
      { href: '/Tailscale',  text: 'Tailscale' },          // unknown
      { href: '/CADashboard', text: 'CA Custom Dashboard' }, // unknown
    ];
    const tree = buildNav(anchors);
    const other = tree.find((n) => n.label === 'Other');
    expect(other).toBeDefined();
    expect(other?.children?.map((c) => c.label)).toEqual(['Tailscale', 'CA Custom Dashboard']);
    expect(other?.children?.map((c) => c.url)).toEqual(['/Tailscale', '/CADashboard']);
  });

  it('treats curated sub-item URLs as "known" (Main is not duplicated into Other)', () => {
    const anchors: StockAnchor[] = [{ href: '/Main', text: 'Main' }];
    const tree = buildNav(anchors);
    expect(tree.find((n) => n.label === 'Other')).toBeUndefined();
  });

  it('falls back to the URL as label if anchor text is empty', () => {
    const anchors: StockAnchor[] = [{ href: '/Mystery', text: '' }];
    const tree = buildNav(anchors);
    const other = tree.find((n) => n.label === 'Other');
    expect(other?.children?.[0]?.label).toBe('/Mystery');
  });

  it('ignores anchors with no href', () => {
    const anchors: StockAnchor[] = [{ href: '', text: 'nope' }];
    const tree = buildNav(anchors);
    expect(tree.find((n) => n.label === 'Other')).toBeUndefined();
  });
});
```

Make sure `StockAnchor` is imported. Update the import line at the top of the file to:

```typescript
import { CURATED_NAV, buildNav, type StockAnchor } from '../../../src/ts/shell/nav-builder';
```

- [ ] **Step 2: Run the test to verify it passes (already implemented in Task 8)**

```powershell
npm run test:ts
```

Expected: 215 tests pass (211 existing + 4 new). All four pass without further changes — the unknowns branch already handles them. If any fail, fix the implementation in `nav-builder.ts` before continuing.

- [ ] **Step 3: Commit**

```powershell
git add tests/unit-ts/shell/nav-builder.test.ts; git commit -m "test(shell): nav-builder auto-discovery merge coverage"
```

---

## Task 10: `<shell-nav-item>` + render nav body in sidebar

**Files:**
- Create: `src/ts/shell/components/shell-nav-item.ts`
- Modify: `src/ts/shell/components/shell-sidebar.ts`

Each curated entry becomes a `<shell-nav-item>` row; active page (matching `location.pathname`) gets a 3px left accent bar. Sub-items render under expandable groups. Auto-discovered Other section appears at the bottom.

- [ ] **Step 1: Create the nav-item component**

Create `src/ts/shell/components/shell-nav-item.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { NavItem } from '../nav-builder';

@customElement('shell-nav-item')
export class ShellNavItem extends LitElement {
  static styles = css`
    :host { display: block; }
    a, button {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      color: var(--text-primary);
      text-decoration: none;
      font-size: 14px;
      width: 100%;
      box-sizing: border-box;
      background: transparent;
      border: 0;
      border-left: 3px solid transparent;
      cursor: pointer;
      text-align: left;
      font: inherit;
    }
    a:hover, button:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    :host([active]) a, :host([active]) > button {
      border-left-color: var(--accent, #ff8c2f);
      color: var(--text-primary);
      font-weight: 600;
    }
    .icon {
      width: 18px; height: 18px; flex-shrink: 0;
      background: currentColor;
      mask-size: contain; -webkit-mask-size: contain;
      opacity: 0.7;
    }
    .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chevron { font-size: 10px; opacity: 0.6; transition: transform 120ms; }
    :host([expanded]) .chevron { transform: rotate(90deg); }
    .children { padding-left: 20px; }
    :host([active][child]) a { font-weight: 500; }
  `;

  @property({ attribute: false }) item!: NavItem;
  @property({ type: String, attribute: 'current-path' }) currentPath = '/';
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Boolean, reflect: true }) expanded = false;

  willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('item') || changed.has('currentPath')) {
      this.active = this._isActive(this.item, this.currentPath);
      // Auto-expand a group whose child matches the current path.
      if (this.item.children?.some((c) => c.url === this.currentPath)) {
        this.expanded = true;
      }
    }
  }

  private _isActive(item: NavItem, path: string): boolean {
    if (item.url && item.url === path) return true;
    if (item.children) return item.children.some((c) => c.url === path);
    return false;
  }

  private _toggle(): void {
    this.expanded = !this.expanded;
  }

  render() {
    const { item } = this;
    if (item.children && item.children.length > 0) {
      return html`
        <button type="button" @click=${this._toggle}>
          <span class="label">${item.label}</span>
          <span class="chevron">▶</span>
        </button>
        ${this.expanded ? html`
          <div class="children">
            ${item.children.map((c) => html`
              <shell-nav-item child .item=${c} current-path=${this.currentPath}></shell-nav-item>
            `)}
          </div>
        ` : ''}
      `;
    }
    return html`
      <a href=${item.url || '#'}>
        <span class="label">${item.label}</span>
      </a>
    `;
  }
}
```

- [ ] **Step 2: Render the nav tree from the sidebar**

Open `src/ts/shell/components/shell-sidebar.ts`. Add the import and update the body. The full file becomes:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { buildNav, type NavItem, type StockAnchor } from '../nav-builder';
import './shell-nav-item';

@customElement('shell-sidebar')
export class ShellSidebar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      height: 64px;
      box-sizing: border-box;
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      color: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    .header:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .logo {
      width: 32px; height: 32px;
      background: var(--accent, #ff8c2f);
      border-radius: 6px;
      flex-shrink: 0;
    }
    .name {
      font-size: 14px; font-weight: 600;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    }
    .body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 0; }
    .footer {
      border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      padding: 8px 0;
    }
  `;

  @state() private _serverName = '';
  @state() private _nav: NavItem[] = [];
  @state() private _currentPath = '/';

  connectedCallback(): void {
    super.connectedCallback();
    this._serverName = this._readServerName();
    this._nav = buildNav(this._readStockAnchors());
    this._currentPath = window.location.pathname;
    window.addEventListener('popstate', this._onNav);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._onNav);
  }

  private _onNav = (): void => {
    this._currentPath = window.location.pathname;
  };

  private _readServerName(): string {
    const tilebar = document.querySelector('header.tilebar');
    if (tilebar) {
      const logo = tilebar.querySelector('.logo, .server-name, .name');
      const text = (logo?.textContent || tilebar.textContent || '').trim();
      if (text) return text.split(/\s{2,}|\n/)[0].trim();
    }
    return (document.title || '').split('/')[0].trim() || 'Unraid';
  }

  private _readStockAnchors(): StockAnchor[] {
    // Walk Unraid's hidden top-nav anchors so we pick up plugin-added entries.
    const nav = document.querySelector('nav.tabs');
    if (!nav) return [];
    return Array.from(nav.querySelectorAll('a[href]')).map((a) => ({
      href: (a as HTMLAnchorElement).getAttribute('href') || '',
      text: a.textContent?.trim() || '',
    }));
  }

  render() {
    return html`
      <a class="header" href="/Dashboard">
        <span class="logo"></span>
        <span class="name">${this._serverName}</span>
      </a>
      <div class="body">
        ${this._nav.map((item) => html`
          <shell-nav-item .item=${item} current-path=${this._currentPath}></shell-nav-item>
        `)}
      </div>
      <div class="footer"></div>
    `;
  }
}
```

- [ ] **Step 3: Build**

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Deploy + live verify the nav renders + active highlight works**

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

In Chrome on `/Dashboard`, hard-reload then probe:

```javascript
({
  navItemCount: document.querySelector('modernui-shell')
    ?.shadowRoot?.querySelector('shell-sidebar')
    ?.shadowRoot?.querySelectorAll('shell-nav-item').length,
  dashboardActive: document.querySelector('modernui-shell')
    ?.shadowRoot?.querySelector('shell-sidebar')
    ?.shadowRoot?.querySelector('shell-nav-item[active]')
    ?.item?.label,
})
```

Expected: `navItemCount >= 9` (curated count, maybe more if "Other" appeared), `dashboardActive === 'Dashboard'`. Take a screenshot — you should see the nine rows in the sidebar with Dashboard highlighted.

Then navigate to `https://<your-unraid-host>/Docker` and reload — the active row should shift to Docker. Then `https://<your-unraid-host>/Main` — Storage group should auto-expand and Main should highlight inside it.

- [ ] **Step 5: Commit**

```powershell
git add src/ts/shell/components/shell-nav-item.ts src/ts/shell/components/shell-sidebar.ts; git commit -m "feat(shell): render curated nav + active-page highlight"
```

---

## Task 11: Sidebar collapse / expand toggle

**Files:**
- Modify: `src/ts/shell/components/shell-sidebar.ts`
- Modify: `src/ts/shell/components/modernui-shell.ts`
- Modify: `src/ts/shell/components/shell-nav-item.ts`
- Modify: `src/styles/shell-overlay.scss`

A chevron toggle at the sidebar bottom flips between 240px expanded and 64px icons-only. State reads from the existing `sidebar=expanded|collapsed` cfg (already in save.php since v0.1) and updates the cfg on toggle. Body class `modernui-shell-collapsed` drives the CSS narrowing already wired in Task 5.

- [ ] **Step 1: Read initial collapsed state from the dataset attribute**

The loader already emits `data-modernui-sidebar` because of save.php Phase-1 plumbing... actually it doesn't yet — the loader only emits mode/density/dashboard/shell. Add `sidebar` to the loader emit first.

Open `package/include/install.php`. In `modernui_generate_loader_js()`, add `$sidebar` next to `$shell`:

```php
    $sidebar   = $settings['sidebar']   ?? 'expanded';
```

And in the loader string, add the corresponding line:

```php
        . "r.dataset.modernuiSidebar=" . json_encode($sidebar) . ";\n"
```

The full updated function now has four dataset lines (`Mode`, `Density`, `Dashboard`, `Shell`, `Sidebar`).

- [ ] **Step 2: Lint + run PHP tests (no regression)**

```powershell
php -l package/include/install.php; npm run test:php
```

Expected: parse clean, all PHP tests pass.

- [ ] **Step 3: Read the attribute in the sidebar component**

Open `src/ts/shell/components/shell-sidebar.ts`. Add a `_collapsed` state + read it in `connectedCallback`:

```typescript
  @state() private _collapsed = false;
```

In `connectedCallback`, after `this._currentPath = window.location.pathname;`:

```typescript
    this._collapsed = document.documentElement.dataset.modernuiSidebar === 'collapsed';
    if (this._collapsed) document.body.classList.add('modernui-shell-collapsed');
```

- [ ] **Step 4: Render the toggle button in the footer**

Replace the `<div class="footer"></div>` line in the sidebar's `render()` with:

```typescript
      <div class="footer">
        <button class="collapse-toggle" type="button" @click=${this._toggleCollapsed}>
          ${this._collapsed ? '▶' : '◀'}
        </button>
      </div>
```

Add a `_toggleCollapsed` method:

```typescript
  private _toggleCollapsed = async (): Promise<void> => {
    this._collapsed = !this._collapsed;
    document.body.classList.toggle('modernui-shell-collapsed', this._collapsed);
    document.documentElement.dataset.modernuiSidebar = this._collapsed ? 'collapsed' : 'expanded';
    await this._persistCollapsed(this._collapsed);
  };

  private async _persistCollapsed(collapsed: boolean): Promise<void> {
    const csrf = (window as { csrf_token?: string }).csrf_token;
    if (!csrf) return; // best-effort; UI state still toggles
    const body = new URLSearchParams();
    body.set('sidebar', collapsed ? 'collapsed' : 'expanded');
    body.set('csrf_token', csrf);
    await fetch('/plugins/unraid-modernui/include/save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).catch(() => undefined);
  }
```

Add CSS for the toggle button inside the `static styles` block (between `.footer` and the closing backtick):

```css
    .collapse-toggle {
      width: 100%;
      background: transparent;
      color: var(--text-secondary);
      border: 0;
      padding: 8px;
      cursor: pointer;
      font: inherit;
    }
    .collapse-toggle:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
```

- [ ] **Step 5: Wire the collapsed state into the CSS — labels hide at 64px**

Open `src/styles/shell-overlay.scss`. Append after the existing `body.modernui-shell-active.modernui-shell-collapsed` rule:

```scss
body.modernui-shell-active.modernui-shell-collapsed modernui-shell::part(sidebar) {
  width: var(--shell-sidebar-width-collapsed);
}
```

That uses CSS `::part` for cross-shadow-DOM styling; expose the `part` from `modernui-shell.ts`.

Open `src/ts/shell/components/modernui-shell.ts`. Update the sidebar div in `render()` to expose a part:

```typescript
      <div class="sidebar" part="sidebar"><shell-sidebar></shell-sidebar></div>
```

And inside the component's CSS, add a width-collapsed variant:

```css
    :host([collapsed]) .sidebar { width: var(--shell-sidebar-width-collapsed); }
    :host([collapsed]) .topbar { left: var(--shell-sidebar-width-collapsed); }
```

Then reflect the collapsed state from sidebar up to shell. In `shell-sidebar.ts`'s `_toggleCollapsed`, after toggling, dispatch an event:

```typescript
    this.dispatchEvent(new CustomEvent('shell-collapsed-changed', {
      detail: { collapsed: this._collapsed },
      bubbles: true,
      composed: true,
    }));
```

Also dispatch the initial state in `connectedCallback` so `<modernui-shell>` syncs on first paint:

```typescript
    // After this._collapsed = ... line, fire a one-shot event
    queueMicrotask(() => this.dispatchEvent(new CustomEvent('shell-collapsed-changed', {
      detail: { collapsed: this._collapsed },
      bubbles: true,
      composed: true,
    })));
```

In `modernui-shell.ts`, listen for it and set a `collapsed` attribute on the host:

```typescript
  @property({ type: Boolean, reflect: true }) collapsed = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('shell-collapsed-changed', (e: Event) => {
      this.collapsed = (e as CustomEvent<{ collapsed: boolean }>).detail.collapsed;
    });
  }
```

Don't forget to add `property` to the lit imports: `import { customElement, property } from 'lit/decorators.js';`.

- [ ] **Step 6: Hide labels when collapsed**

In `shell-nav-item.ts`, observe `document.body.classList.contains('modernui-shell-collapsed')` via a ResizeObserver-style mechanism is overkill. Simpler: a CSS rule scoped via `:host-context()`:

Inside `shell-nav-item.ts`'s `static styles`, append:

```css
    :host-context(body.modernui-shell-collapsed) .label,
    :host-context(body.modernui-shell-collapsed) .chevron,
    :host-context(body.modernui-shell-collapsed) .children {
      display: none;
    }
```

(`:host-context()` works in Chromium-based browsers; Unraid's WebUI is opened in a real browser, so this is fine.)

In `shell-sidebar.ts`'s `static styles`, append:

```css
    :host-context(body.modernui-shell-collapsed) .name { display: none; }
```

- [ ] **Step 7: Build**

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 8: Deploy + live-verify the toggle**

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Reload `/Dashboard`. Click the chevron at the sidebar bottom. Probe:

```javascript
({
  bodyHasCollapsed: document.body.classList.contains('modernui-shell-collapsed'),
  sidebarComputedWidth: getComputedStyle(
    document.querySelector('modernui-shell')?.shadowRoot?.querySelector('.sidebar')!
  ).width,
  paddingLeft: getComputedStyle(document.body).paddingLeft,
})
```

Expected first click: `bodyHasCollapsed === true`, `sidebarComputedWidth === '64px'`, `paddingLeft === '64px'`. Reload page — collapsed state persists (cfg saved).

Click again to expand — width returns to 240, body padding likewise. Reload — persists expanded.

- [ ] **Step 9: Commit**

```powershell
git add package/include/install.php src/ts/shell/components/shell-sidebar.ts src/ts/shell/components/modernui-shell.ts src/ts/shell/components/shell-nav-item.ts src/styles/shell-overlay.scss; git commit -m "feat(shell): sidebar collapse toggle persists via sidebar=collapsed cfg"
```

---

## Task 12: Breadcrumb pure function (TDD)

**Files:**
- Create: `src/ts/shell/breadcrumb.ts`
- Create: `tests/unit-ts/shell/breadcrumb.test.ts`

`pathToBreadcrumb(pathname, navTree)` returns an array of `{ label, url }` segments. Lookup labels from the curated tree; unknown segments fall back to the URL segment with leading capital.

- [ ] **Step 1: Write the failing test**

Create `tests/unit-ts/shell/breadcrumb.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { pathToBreadcrumb } from '../../../src/ts/shell/breadcrumb';
import { CURATED_NAV } from '../../../src/ts/shell/nav-builder';

describe('pathToBreadcrumb', () => {
  it('returns a single root segment for "/"', () => {
    expect(pathToBreadcrumb('/', CURATED_NAV)).toEqual([{ label: 'Home', url: '/' }]);
  });

  it('maps /Dashboard to its curated label', () => {
    expect(pathToBreadcrumb('/Dashboard', CURATED_NAV)).toEqual([
      { label: 'Dashboard', url: '/Dashboard' },
    ]);
  });

  it('returns label hierarchy for nested curated routes', () => {
    expect(pathToBreadcrumb('/Main', CURATED_NAV)).toEqual([
      { label: 'Storage', url: undefined },
      { label: 'Main', url: '/Main' },
    ]);
  });

  it('falls back to capitalized URL segments for unknown paths', () => {
    expect(pathToBreadcrumb('/Tailscale/Status', CURATED_NAV)).toEqual([
      { label: 'Tailscale', url: '/Tailscale' },
      { label: 'Status',    url: '/Tailscale/Status' },
    ]);
  });

  it('handles deep settings paths like /Settings/Theme', () => {
    const out = pathToBreadcrumb('/Settings/Theme', CURATED_NAV);
    expect(out[0]).toEqual({ label: 'Settings', url: '/Settings' });
    expect(out[1]).toEqual({ label: 'Theme', url: '/Settings/Theme' });
  });

  it('ignores trailing slashes', () => {
    expect(pathToBreadcrumb('/Docker/', CURATED_NAV)).toEqual([
      { label: 'Docker', url: '/Docker' },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm run test:ts
```

Expected: import error.

- [ ] **Step 3: Implement the helper**

Create `src/ts/shell/breadcrumb.ts`:

```typescript
import type { NavItem } from './nav-builder';

export interface BreadcrumbSegment {
  label: string;
  url: string | undefined;
}

function findInTree(tree: NavItem[], url: string): { node: NavItem; parent?: NavItem } | null {
  for (const node of tree) {
    if (node.url === url) return { node };
    if (node.children) {
      for (const child of node.children) {
        if (child.url === url) return { node: child, parent: node };
      }
    }
  }
  return null;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function pathToBreadcrumb(pathname: string, tree: NavItem[]): BreadcrumbSegment[] {
  const path = pathname.replace(/\/+$/, '');
  if (path === '' || path === '/') return [{ label: 'Home', url: '/' }];

  // Try a direct curated match first — Storage children give us a parent label.
  const direct = findInTree(tree, path);
  if (direct) {
    if (direct.parent) {
      return [
        { label: direct.parent.label, url: direct.parent.url },
        { label: direct.node.label, url: direct.node.url },
      ];
    }
    return [{ label: direct.node.label, url: direct.node.url }];
  }

  // Otherwise split + capitalize, accumulating URLs as we go.
  const parts = path.split('/').filter(Boolean);
  const out: BreadcrumbSegment[] = [];
  let acc = '';
  for (const part of parts) {
    acc += '/' + part;
    const match = findInTree(tree, acc);
    out.push({ label: match?.node.label ?? capitalize(part), url: acc });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
npm run test:ts
```

Expected: 221 tests pass (215 existing + 6 new).

- [ ] **Step 5: Commit**

```powershell
git add src/ts/shell/breadcrumb.ts tests/unit-ts/shell/breadcrumb.test.ts; git commit -m "feat(shell): pathToBreadcrumb pure helper"
```

---

## Task 13: `<shell-topbar>` skeleton — breadcrumb + empty slots

**Files:**
- Create: `src/ts/shell/components/shell-topbar.ts`
- Modify: `src/ts/shell/components/modernui-shell.ts`

Topbar with the breadcrumb on the left and 4 empty slots on the right (actions, plugin, search, bell, user). The bell/user-menu components fill their slots in Tasks 14-15.

- [ ] **Step 1: Create the topbar component**

Create `src/ts/shell/components/shell-topbar.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { pathToBreadcrumb, type BreadcrumbSegment } from '../breadcrumb';
import { CURATED_NAV } from '../nav-builder';

@customElement('shell-topbar')
export class ShellTopbar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      width: 100%;
      height: 100%;
      padding: 0 16px;
      box-sizing: border-box;
      gap: 12px;
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--text-primary);
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .breadcrumb a, .breadcrumb span {
      color: inherit;
      text-decoration: none;
      white-space: nowrap;
    }
    .breadcrumb a:hover { text-decoration: underline; }
    .sep { opacity: 0.5; }
    .right {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .slot-host {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .icon-btn {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: 0; color: var(--text-primary);
      cursor: pointer; border-radius: 6px;
      font-size: 14px;
    }
    .icon-btn:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
  `;

  @state() private _crumbs: BreadcrumbSegment[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    this._refresh();
    window.addEventListener('popstate', this._refresh);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._refresh);
  }

  private _refresh = (): void => {
    this._crumbs = pathToBreadcrumb(window.location.pathname, CURATED_NAV);
  };

  private _searchToast(): void {
    // Placeholder per spec — search is reserved for v0.5+.
    const note = document.createElement('div');
    note.textContent = 'Search coming soon';
    Object.assign(note.style, {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-surface, #222)', color: 'var(--text-primary, #fff)',
      padding: '8px 16px', borderRadius: '6px', zIndex: '2000', fontSize: '13px',
    });
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 1800);
  }

  render() {
    return html`
      <nav class="breadcrumb">
        ${this._crumbs.map((c, i) => html`
          ${i > 0 ? html`<span class="sep">/</span>` : ''}
          ${c.url ? html`<a href=${c.url}>${c.label}</a>` : html`<span>${c.label}</span>`}
        `)}
      </nav>
      <div class="right">
        <div id="modernui-topbar-actions" class="slot-host"></div>
        <div id="modernui-topbar-plugins" class="slot-host"></div>
        <button class="icon-btn" type="button" title="Search" @click=${this._searchToast}>⌕</button>
        <slot name="bell"></slot>
        <slot name="user"></slot>
      </div>
    `;
  }
}
```

- [ ] **Step 2: Mount the topbar from `<modernui-shell>`**

Open `src/ts/shell/components/modernui-shell.ts`. Add the import and render the topbar:

```typescript
import './shell-sidebar';
import './shell-topbar';
```

Update `render()` so the topbar div has the component inside:

```typescript
      <div class="topbar"><shell-topbar></shell-topbar></div>
```

- [ ] **Step 3: Build**

```powershell
npm run build
```

Expected: succeeds.

- [ ] **Step 4: Deploy + live-verify breadcrumb**

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Reload `/Dashboard`. Probe:

```javascript
({
  crumbText: document.querySelector('modernui-shell')
    ?.shadowRoot?.querySelector('shell-topbar')
    ?.shadowRoot?.querySelector('.breadcrumb')?.textContent?.trim().replace(/\s+/g, ' '),
})
```

Expected: `crumbText === 'Dashboard'`. Navigate to `/Settings/Theme` and reload — expected: `'Settings / Theme'`.

- [ ] **Step 5: Commit**

```powershell
git add src/ts/shell/components/shell-topbar.ts src/ts/shell/components/modernui-shell.ts; git commit -m "feat(shell): shell-topbar with breadcrumb + reserved slots"
```

---

## Task 14: `<shell-user-menu>` — About / Stock UI / Logout

**Files:**
- Create: `src/ts/shell/components/shell-user-menu.ts`
- Modify: `src/ts/shell/components/shell-topbar.ts`

Click-to-open popover. About panel carries the strings that used to live in the page footer (version, GitHub link, Unraid copyright + manual link). Stock UI flips `shell=off`. Logout posts to `/logout`.

- [ ] **Step 1: Create the user-menu component**

Create `src/ts/shell/components/shell-user-menu.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

const VERSION = '0.4.0';
const GITHUB_URL = 'https://github.com/EXAMPLE/unraid-modernui';
const MANUAL_URL = '/webGui/include/Help.php';

@customElement('shell-user-menu')
export class ShellUserMenu extends LitElement {
  static styles = css`
    :host { position: relative; }
    .trigger {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--accent, #ff8c2f); color: #fff;
      border: 0; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 600;
    }
    .popover {
      position: absolute; top: calc(100% + 6px); right: 0;
      background: var(--bg-surface, #1a1a1a);
      border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      min-width: 240px;
      padding: 8px;
      display: none;
      z-index: 100;
    }
    :host([open]) .popover { display: block; }
    .item {
      display: block; padding: 8px 12px; width: 100%; text-align: left;
      background: transparent; border: 0; color: var(--text-primary);
      cursor: pointer; border-radius: 4px;
      font: inherit;
    }
    .item:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .about { padding: 12px; font-size: 12px; color: var(--text-secondary); }
    .about p { margin: 4px 0; }
    .about a { color: var(--accent, #ff8c2f); text-decoration: none; }
    .divider { height: 1px; background: var(--border-subtle, rgba(255,255,255,0.08)); margin: 4px 0; }
  `;

  @state() private _open = false;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('click', this._onOutside);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onOutside);
  }

  private _onOutside = (e: MouseEvent): void => {
    if (!this.contains(e.target as Node) && !this.shadowRoot?.contains(e.target as Node)) {
      this._open = false;
      this.removeAttribute('open');
    }
  };

  private _toggle = (e: MouseEvent): void => {
    e.stopPropagation();
    this._open = !this._open;
    this.toggleAttribute('open', this._open);
  };

  private _useStock = async (): Promise<void> => {
    const csrf = (window as { csrf_token?: string }).csrf_token;
    if (!csrf) return;
    const body = new URLSearchParams();
    body.set('shell', 'off');
    body.set('csrf_token', csrf);
    await fetch('/plugins/unraid-modernui/include/save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    window.location.reload();
  };

  render() {
    return html`
      <button class="trigger" type="button" @click=${this._toggle} title="User menu">U</button>
      <div class="popover" role="menu">
        <div class="about">
          <p><strong>Modern UI v${VERSION}</strong> · <a href=${GITHUB_URL} target="_blank">GitHub</a></p>
          <p>Unraid® webGui © Lime Technology, Inc. · <a href=${MANUAL_URL} target="_blank">Manual</a></p>
        </div>
        <div class="divider"></div>
        <button class="item" type="button" @click=${this._useStock}>Stock UI</button>
        <a class="item" href="/logout">Logout</a>
      </div>
    `;
  }
}
```

- [ ] **Step 2: Wire the user menu into the topbar's `user` slot**

Open `src/ts/shell/components/shell-topbar.ts`. Add the import:

```typescript
import './shell-user-menu';
```

In the `render()` template, replace `<slot name="user"></slot>` with the component directly (slots are not needed because we own the topbar's contents):

```typescript
        <shell-user-menu></shell-user-menu>
```

Remove the `<slot name="user">` from the template.

- [ ] **Step 3: Build**

```powershell
npm run build
```

- [ ] **Step 4: Deploy + live-verify the menu opens and Stock UI works**

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Reload `/Dashboard`. Click the orange `U` button in the topbar right corner. Probe:

```javascript
({
  menuOpen: document.querySelector('modernui-shell')
    ?.shadowRoot?.querySelector('shell-topbar')
    ?.shadowRoot?.querySelector('shell-user-menu')?.hasAttribute('open'),
})
```

Expected: `menuOpen === true` after clicking. Take a screenshot — popover with About text + Stock UI + Logout visible.

Click outside — popover closes (`menuOpen === false`). Click `Stock UI` — page reloads to stock Unraid; sidebar is gone. Restore: go to `/Settings/Theme` → Shell layout → Modern → Save.

- [ ] **Step 5: Commit**

```powershell
git add src/ts/shell/components/shell-user-menu.ts src/ts/shell/components/shell-topbar.ts; git commit -m "feat(shell): user menu with About / Stock UI / Logout"
```

---

## Task 15: `<shell-notification-bell>` — observe Unraid's notifier

**Files:**
- Create: `src/ts/shell/components/shell-notification-bell.ts`
- Modify: `src/ts/shell/components/shell-topbar.ts`

Read-only mirror of Unraid's existing notifications feed. The stock `#notifier` element carries the unread count; the same element renders the popover content. We watch it via MutationObserver and re-render our badge + popover.

- [ ] **Step 1: Create the bell component**

Create `src/ts/shell/components/shell-notification-bell.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('shell-notification-bell')
export class ShellNotificationBell extends LitElement {
  static styles = css`
    :host { position: relative; }
    .trigger {
      width: 32px; height: 32px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: 0; color: var(--text-primary);
      cursor: pointer; border-radius: 6px; font-size: 16px;
    }
    .trigger:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .badge {
      position: absolute; top: 2px; right: 2px;
      min-width: 14px; height: 14px;
      background: var(--accent, #ff8c2f); color: #fff;
      border-radius: 7px; font-size: 9px; font-weight: 600;
      display: flex; align-items: center; justify-content: center;
      padding: 0 3px; box-sizing: border-box;
      pointer-events: none;
    }
    .popover {
      position: absolute; top: calc(100% + 6px); right: 0;
      background: var(--bg-surface, #1a1a1a);
      border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      width: 320px; max-height: 400px; overflow-y: auto;
      padding: 8px; display: none; z-index: 100;
    }
    :host([open]) .popover { display: block; }
    .item {
      padding: 8px; font-size: 12px; color: var(--text-primary);
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04));
    }
    .item:last-child { border-bottom: 0; }
    .empty { padding: 16px; color: var(--text-secondary); font-size: 12px; text-align: center; }
  `;

  @state() private _open = false;
  @state() private _unread = 0;
  @state() private _items: Array<{ title: string; subject?: string; severity?: string }> = [];

  private _observer: MutationObserver | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._sync();
    const source = document.getElementById('notifier') || document.querySelector('[data-notifications]') || document.body;
    this._observer = new MutationObserver(() => this._sync());
    this._observer.observe(source, { childList: true, subtree: true, characterData: true });
    document.addEventListener('click', this._onOutside);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._observer?.disconnect();
    document.removeEventListener('click', this._onOutside);
  }

  private _onOutside = (e: MouseEvent): void => {
    if (!this.contains(e.target as Node) && !this.shadowRoot?.contains(e.target as Node)) {
      this._open = false;
      this.removeAttribute('open');
    }
  };

  private _toggle = (e: MouseEvent): void => {
    e.stopPropagation();
    this._open = !this._open;
    this.toggleAttribute('open', this._open);
  };

  private _sync(): void {
    // Unraid's #notifier has a span.unread (or .total) with a count + children
    // describing each notification. Be liberal in what we accept.
    const notifier = document.getElementById('notifier');
    if (!notifier) {
      this._unread = 0;
      this._items = [];
      return;
    }
    const countNode = notifier.querySelector('.unread, .total, [data-count]');
    const count = parseInt(countNode?.textContent?.trim() || '0', 10);
    this._unread = isFinite(count) ? count : 0;

    const items = Array.from(notifier.querySelectorAll('.notification, [data-notification]')).slice(0, 20);
    this._items = items.map((el) => ({
      title: el.querySelector('.subject, .title')?.textContent?.trim() || el.textContent?.trim().slice(0, 80) || '',
      severity: (el.getAttribute('data-severity') || 'info') as string,
    }));
  }

  render() {
    return html`
      <button class="trigger" type="button" @click=${this._toggle} title="Notifications">🔔</button>
      ${this._unread > 0 ? html`<span class="badge">${this._unread > 99 ? '99+' : this._unread}</span>` : ''}
      <div class="popover" role="menu">
        ${this._items.length === 0
          ? html`<div class="empty">No notifications</div>`
          : this._items.map((it) => html`<div class="item">${it.title}</div>`)}
      </div>
    `;
  }
}
```

- [ ] **Step 2: Mount the bell in the topbar**

Open `src/ts/shell/components/shell-topbar.ts`. Add the import:

```typescript
import './shell-notification-bell';
```

In the `render()` template, replace `<slot name="bell"></slot>` with:

```typescript
        <shell-notification-bell></shell-notification-bell>
```

Remove `<slot name="bell">` from the template.

- [ ] **Step 3: Build**

```powershell
npm run build
```

- [ ] **Step 4: Deploy + live-verify**

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Reload `/Dashboard`. Probe:

```javascript
({
  bellExists: !!document.querySelector('modernui-shell')
    ?.shadowRoot?.querySelector('shell-topbar')
    ?.shadowRoot?.querySelector('shell-notification-bell'),
  unreadVisible: !!document.querySelector('modernui-shell')
    ?.shadowRoot?.querySelector('shell-topbar')
    ?.shadowRoot?.querySelector('shell-notification-bell')
    ?.shadowRoot?.querySelector('.badge'),
  notifierExists: !!document.getElementById('notifier'),
})
```

Expected: `bellExists === true`. `notifierExists === true` (Unraid's stock notifier element is still in the DOM). `unreadVisible` may be `true` or `false` depending on current notification state.

Click the bell — popover opens. If you have unread notifications, take a screenshot — they should appear inside. If none, "No notifications" placeholder.

If the badge count is wrong (e.g. shows 0 when Unraid's stock bell shows a count), the `#notifier` query selector inside `_sync` is mismatched — capture `document.getElementById('notifier').outerHTML` and adjust the selector list.

- [ ] **Step 5: Commit**

```powershell
git add src/ts/shell/components/shell-notification-bell.ts src/ts/shell/components/shell-topbar.ts; git commit -m "feat(shell): notification bell observes #notifier feed"
```

---

## Task 16: Plugin registry + plugin-mirror module (TDD on matching)

**Files:**
- Create: `src/ts/shell/plugin-registry.json`
- Create: `src/ts/shell/plugin-mirror.ts`
- Create: `tests/unit-ts/shell/plugin-mirror.test.ts`

The MutationObserver wiring is not unit-testable (it touches live DOM and timers — Phase 3 convention). What we DO test is the pure matching function `matchPlugin(node, registry)` that turns an Unraid bottom-bar / tilebar DOM node into a registry entry (or `null` for unknown).

- [ ] **Step 1: Create the registry**

Create `src/ts/shell/plugin-registry.json`:

```json
{
  "bottom": [
    {
      "name": "dynamix.system.temp",
      "selector": ".dynamix-system-temp, [class*='system-temp']",
      "slot": "cpu-temp",
      "label": "CPU temp"
    },
    {
      "name": "dynamix.system.stats",
      "selector": ".dynamix-system-stats-power, .power",
      "slot": "power",
      "label": "Power"
    },
    {
      "name": "dynamix.ups",
      "selector": ".nut_status, .nut_battery",
      "slot": "ups",
      "label": "UPS"
    }
  ],
  "topbar": [
    {
      "name": "apcupsd",
      "selector": "a.apcupsd-power-button, [data-apcupsd]",
      "icon": "power"
    },
    {
      "name": "ipmi.tools",
      "selector": "a.ipmi-tools-button, [data-ipmi-tools]"
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit-ts/shell/plugin-mirror.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { matchPlugin, type PluginEntry } from '../../../src/ts/shell/plugin-mirror';

const BOTTOM_REGISTRY: PluginEntry[] = [
  { name: 'dynamix.system.temp', selector: '.dynamix-system-temp', slot: 'cpu-temp', label: 'CPU temp' },
  { name: 'dynamix.ups', selector: '.nut_status', slot: 'ups', label: 'UPS' },
];

describe('matchPlugin', () => {
  it('matches a node against the first registry entry whose selector hits', () => {
    const div = document.createElement('div');
    div.className = 'dynamix-system-temp';
    expect(matchPlugin(div, BOTTOM_REGISTRY)?.name).toBe('dynamix.system.temp');
  });

  it('matches a node by descendant selector (the registry entry uses a child class)', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    child.className = 'nut_status';
    parent.appendChild(child);
    expect(matchPlugin(parent, BOTTOM_REGISTRY)?.name).toBe('dynamix.ups');
  });

  it('returns null when no registry entry matches', () => {
    const div = document.createElement('div');
    div.className = 'something-else';
    expect(matchPlugin(div, BOTTOM_REGISTRY)).toBeNull();
  });

  it('returns null for empty registry', () => {
    const div = document.createElement('div');
    div.className = 'dynamix-system-temp';
    expect(matchPlugin(div, [])).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```powershell
npm run test:ts
```

Expected: module-not-found error.

- [ ] **Step 4: Implement `plugin-mirror.ts`**

Create `src/ts/shell/plugin-mirror.ts`:

```typescript
import registry from './plugin-registry.json';

export interface PluginEntry {
  name: string;
  selector: string;
  slot?: string;
  label?: string;
  icon?: string;
}

export interface PluginRegistry {
  bottom: PluginEntry[];
  topbar: PluginEntry[];
}

export const REGISTRY: PluginRegistry = registry as PluginRegistry;

export function matchPlugin(node: Element, entries: PluginEntry[]): PluginEntry | null {
  for (const entry of entries) {
    try {
      if (node.matches(entry.selector)) return entry;
      if (node.querySelector(entry.selector)) return entry;
    } catch {
      // Invalid selector — skip
    }
  }
  return null;
}

export interface MirrorOptions {
  source: Element | null;
  registry: PluginEntry[];
  onUpdate: (entries: Array<{ entry: PluginEntry | null; node: Element }>) => void;
  debounceMs?: number;
}

export function startMirror(opts: MirrorOptions): () => void {
  const { source, registry: entries, onUpdate, debounceMs = 50 } = opts;
  if (!source) return () => undefined;

  let pending: number | null = null;
  const schedule = (): void => {
    if (pending !== null) return;
    pending = window.setTimeout(() => {
      pending = null;
      const children = Array.from(source.children);
      const mapped = children.map((node) => ({ entry: matchPlugin(node, entries), node }));
      onUpdate(mapped);
    }, debounceMs);
  };

  schedule(); // initial sync
  const observer = new MutationObserver(schedule);
  observer.observe(source, { childList: true, subtree: true, characterData: true });

  return () => {
    observer.disconnect();
    if (pending !== null) window.clearTimeout(pending);
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```powershell
npm run test:ts
```

Expected: 225 tests pass (221 existing + 4 new).

- [ ] **Step 6: Verify vite/vitest can import the JSON**

The vite build should already handle JSON imports — no config change needed. Run:

```powershell
npm run build
```

Expected: build succeeds with `modernui.js` slightly larger (registry bundled in).

- [ ] **Step 7: Commit**

```powershell
git add src/ts/shell/plugin-registry.json src/ts/shell/plugin-mirror.ts tests/unit-ts/shell/plugin-mirror.test.ts; git commit -m "feat(shell): plugin registry + mirror module (matching covered)"
```

---

## Task 17: `<shell-status-row>` component

**Files:**
- Create: `src/ts/shell/components/shell-status-row.ts`

Single row used inside the sidebar's System Status footer. Renders a label + value + optional colored dot, with click → popover that shows detail. We don't wire it up yet — Task 18 does that.

- [ ] **Step 1: Create the component**

Create `src/ts/shell/components/shell-status-row.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('shell-status-row')
export class ShellStatusRow extends LitElement {
  static styles = css`
    :host { display: block; position: relative; }
    .row {
      display: flex; align-items: center; gap: 8px;
      width: 100%; box-sizing: border-box;
      padding: 6px 16px;
      background: transparent; color: var(--text-primary); border: 0;
      cursor: pointer; font: inherit; text-align: left;
    }
    .row:hover { background: var(--bg-elev-1, rgba(255,255,255,0.04)); }
    .dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      background: var(--dot-color, var(--text-secondary));
    }
    .label { flex: 1; min-width: 0; font-size: 12px; color: var(--text-secondary); }
    .value { font-size: 12px; color: var(--text-primary); }
    .popover {
      position: absolute; left: calc(100% + 8px); bottom: 0;
      background: var(--bg-surface, #1a1a1a);
      border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      min-width: 200px; padding: 12px; font-size: 12px;
      display: none; z-index: 100;
    }
    :host([open]) .popover { display: block; }
    :host-context(body.modernui-shell-collapsed) .label,
    :host-context(body.modernui-shell-collapsed) .value { display: none; }
  `;

  @property({ type: String }) label = '';
  @property({ type: String }) value = '';
  @property({ type: String, attribute: 'dot-color' }) dotColor = '';
  @property({ type: String }) detail = '';
  @property({ type: String, attribute: 'settings-url' }) settingsUrl = '';
  @state() private _open = false;

  private _toggle = (e: MouseEvent): void => {
    e.stopPropagation();
    this._open = !this._open;
    this.toggleAttribute('open', this._open);
  };

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('click', this._onOutside);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onOutside);
  }

  private _onOutside = (e: MouseEvent): void => {
    if (!this.contains(e.target as Node) && !this.shadowRoot?.contains(e.target as Node)) {
      this._open = false;
      this.removeAttribute('open');
    }
  };

  render() {
    return html`
      <button class="row" type="button" @click=${this._toggle} style=${`--dot-color: ${this.dotColor || 'currentColor'}`}>
        <span class="dot"></span>
        <span class="label">${this.label}</span>
        <span class="value">${this.value}</span>
      </button>
      <div class="popover">
        <div>${this.detail || this.label}</div>
        ${this.settingsUrl ? html`<p style="margin:8px 0 0 0;"><a href=${this.settingsUrl}>Settings</a></p>` : ''}
      </div>
    `;
  }
}
```

- [ ] **Step 2: Build to make sure the component compiles**

```powershell
npm run build
```

- [ ] **Step 3: Commit**

```powershell
git add src/ts/shell/components/shell-status-row.ts; git commit -m "feat(shell): shell-status-row presentational component"
```

---

## Task 18: Wire bottom-bar mirror → sidebar System Status footer

**Files:**
- Modify: `src/ts/shell/components/shell-sidebar.ts`

The hidden `div.statusbar` keeps polling because the elements are in DOM (per Task 5's CSS the parent is `display: none`, but plugin polling that walks `document.querySelector('.dynamix-system-temp')` still finds it). We mirror its children into our footer via the plugin-mirror module + status rows.

**Risk:** If display:none pauses plugin polling, this task's live verify will catch it — fall back to offscreen positioning in `shell-overlay.scss`.

- [ ] **Step 1: Add the mirror state + observer wiring to the sidebar**

Open `src/ts/shell/components/shell-sidebar.ts`. Add the imports:

```typescript
import { REGISTRY, startMirror, type PluginEntry } from '../plugin-mirror';
import './shell-status-row';
```

Add state + lifecycle:

```typescript
  @state() private _statusItems: Array<{ entry: PluginEntry | null; node: Element }> = [];
  private _disposeMirror: (() => void) | null = null;
```

In `connectedCallback`, after the existing event listener line, start the mirror:

```typescript
    const bottomBar = document.querySelector('div.statusbar') || document.querySelector('footer');
    this._disposeMirror = startMirror({
      source: bottomBar,
      registry: REGISTRY.bottom,
      onUpdate: (items) => {
        this._statusItems = items;
      },
    });
```

And dispose in `disconnectedCallback`:

```typescript
    this._disposeMirror?.();
```

- [ ] **Step 2: Render the status rows in the footer**

In `render()`, replace the existing footer markup:

```typescript
      <div class="footer">
        ${this._statusItems.map((it) => this._renderStatus(it))}
        <button class="collapse-toggle" type="button" @click=${this._toggleCollapsed}>
          ${this._collapsed ? '▶' : '◀'}
        </button>
      </div>
```

Add the helper:

```typescript
  private _renderStatus(it: { entry: PluginEntry | null; node: Element }) {
    const text = it.node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 32) || '';
    if (it.entry) {
      return html`
        <shell-status-row
          label=${it.entry.label || it.entry.name}
          value=${text}
        ></shell-status-row>
      `;
    }
    // Unknown plugin — render generic row preserving the original DOM via innerHTML clone
    return html`
      <shell-status-row label="Plugin" value=${text}></shell-status-row>
    `;
  }
```

- [ ] **Step 3: Add Array state row from Unraid's own indicator**

The spec lists Array state as its own row, sourced from `.array-state`. That's not in the registry — it's a built-in. Add a separate render call:

In the footer template, before `${this._statusItems.map(...)}`, add:

```typescript
        ${this._renderArrayState()}
```

Add the helper:

```typescript
  private _renderArrayState() {
    const el = document.querySelector('.array-state, [data-array-state]');
    if (!el) return '';
    const text = el.textContent?.trim() || '';
    const dotColor = /started/i.test(text) ? '#22c55e' : /stopped/i.test(text) ? '#ef4444' : '#f59e0b';
    return html`
      <shell-status-row label="Array" value=${text} dot-color=${dotColor}></shell-status-row>
    `;
  }
```

Also set up a small interval so we re-read the array state periodically (it doesn't trigger our existing mirror because it's outside the statusbar):

In `connectedCallback`:

```typescript
    this._arrayInterval = window.setInterval(() => this.requestUpdate(), 5000);
```

In `disconnectedCallback`:

```typescript
    if (this._arrayInterval) clearInterval(this._arrayInterval);
```

And the field declaration near the others:

```typescript
  private _arrayInterval: number | null = null;
```

- [ ] **Step 4: Build**

```powershell
npm run build
```

- [ ] **Step 5: Deploy + live-verify status rows appear AND keep ticking**

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Reload `/Dashboard`. Probe:

```javascript
({
  statusRows: Array.from(
    document.querySelector('modernui-shell')
      ?.shadowRoot?.querySelector('shell-sidebar')
      ?.shadowRoot?.querySelectorAll('shell-status-row') || []
  ).map(r => ({ label: r.getAttribute('label'), value: r.getAttribute('value') })),
  bottomBarDisplay: getComputedStyle(document.querySelector('div.statusbar') || document.body).display,
  bottomBarTextContent: (document.querySelector('div.statusbar') || document.querySelector('footer'))?.textContent?.trim().slice(0, 200),
})
```

Expected: `statusRows` includes at least an Array row; if your Unraid has the Dynamix temp/UPS/power plugins installed, one row per plugin. `bottomBarDisplay === 'none'` (it's hidden). `bottomBarTextContent` is non-empty (DOM still exists).

Now the **critical regression check** — wait 15 seconds, then probe again:

```javascript
({
  rowValues: Array.from(
    document.querySelector('modernui-shell')
      ?.shadowRoot?.querySelector('shell-sidebar')
      ?.shadowRoot?.querySelectorAll('shell-status-row') || []
  ).map(r => r.getAttribute('value')),
  bottomBarLatest: (document.querySelector('div.statusbar') || document.querySelector('footer'))?.textContent?.trim().slice(0, 200),
})
```

The Dynamix temp plugin's value should change between probes (CPU temps fluctuate). If `bottomBarLatest` is identical to the earlier read AND the mirrored value also hasn't moved → plugin polling has paused. Fix: open `src/styles/shell-overlay.scss` and replace `div.statusbar, footer { display: none !important; }` with offscreen positioning:

```scss
  div.statusbar, footer {
    position: absolute !important;
    left: -10000px !important;
    top: -10000px !important;
    width: 1px !important; height: 1px !important;
    overflow: hidden !important;
  }
```

Rebuild + redeploy + re-verify. The Unraid `display: none` rule from [[project_nchan_pauses_when_hidden]] applies here too if the bottom-bar plugins use the same IntersectionObserver / visibility gate. Offscreen positioning keeps them in the layout tree (`getBoundingClientRect` returns real dimensions) so polling continues.

- [ ] **Step 6: Commit**

```powershell
git add src/ts/shell/components/shell-sidebar.ts src/styles/shell-overlay.scss; git commit -m "feat(shell): mirror bottom-bar plugins into sidebar status footer"
```

---

## Task 19: Wire top-right tilebar mirror → topbar plugin slot

**Files:**
- Modify: `src/ts/shell/components/shell-topbar.ts`

The right side of Unraid's `header.tilebar` contains plugin-injected action buttons (apcupsd, ipmi-tools, etc.). The header itself is hidden by our CSS, but DOM is preserved. Mirror its right region's children into our `#modernui-topbar-plugins` slot.

- [ ] **Step 1: Add mirror state + observer to the topbar**

Open `src/ts/shell/components/shell-topbar.ts`. Add imports:

```typescript
import { REGISTRY, startMirror, type PluginEntry } from '../plugin-mirror';
```

Add state + dispose field:

```typescript
  @state() private _pluginItems: Array<{ entry: PluginEntry | null; node: Element }> = [];
  private _disposeMirror: (() => void) | null = null;
```

In `connectedCallback`, add the mirror after the existing `_refresh()` call:

```typescript
    const tilebar = document.querySelector('header.tilebar .tilebar-icons, header.tilebar .icons, header.tilebar');
    this._disposeMirror = startMirror({
      source: tilebar,
      registry: REGISTRY.topbar,
      onUpdate: (items) => { this._pluginItems = items; },
    });
```

In `disconnectedCallback`:

```typescript
    this._disposeMirror?.();
```

- [ ] **Step 2: Render mirrored items in the plugin slot**

Find this line in `render()`:

```typescript
        <div id="modernui-topbar-plugins" class="slot-host"></div>
```

Replace with:

```typescript
        <div id="modernui-topbar-plugins" class="slot-host">
          ${this._pluginItems.map((it) => this._renderPluginItem(it))}
        </div>
```

Add the `ref` import at the top of the file:

```typescript
import { ref, createRef, type Ref } from 'lit/directives/ref.js';
```

Then add the helper method + the `updated()` lifecycle hook to the class. We clone the original DOM (preserving click handlers, icons, `<a href>`) and re-insert it into the host span on every render via Lit's `ref` directive:

```typescript
  private _pluginRefs = new Map<Element, Ref<HTMLElement>>();

  private _renderPluginItem(it: { entry: PluginEntry | null; node: Element }) {
    let r = this._pluginRefs.get(it.node);
    if (!r) { r = createRef(); this._pluginRefs.set(it.node, r); }
    return html`
      <span
        class="plugin-mirror"
        title=${it.entry?.name || 'plugin'}
        ${ref(r)}
      ></span>
    `;
  }

  protected updated(): void {
    for (const [node, r] of this._pluginRefs) {
      const host = r.value;
      if (!host) continue;
      host.innerHTML = '';
      host.appendChild(node.cloneNode(true));
    }
  }
```

Why `updated()` over inline cloning in `_renderPluginItem`: Lit re-runs `render()` on every state change. Cloning inside the template would create a fresh clone every render, but the `ref(r)` directive only resolves after the DOM is committed — `updated()` is the proper place to mutate the host. The map is keyed by the original node so disposed entries clean up automatically when `_pluginItems` shrinks.

Add a small CSS rule inside the topbar's `static styles` (next to `.icon-btn`) so the cloned items size sensibly:

```css
    .plugin-mirror {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px;
    }
    .plugin-mirror a, .plugin-mirror button {
      width: 100%; height: 100%;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .plugin-mirror img, .plugin-mirror svg { width: 18px; height: 18px; }
```

- [ ] **Step 3: Build**

```powershell
npm run build
```

- [ ] **Step 4: Deploy + live-verify**

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Reload `/Dashboard`. Probe:

```javascript
({
  pluginMirrors: Array.from(
    document.querySelector('modernui-shell')
      ?.shadowRoot?.querySelector('shell-topbar')
      ?.shadowRoot?.querySelectorAll('.plugin-mirror') || []
  ).map(el => el.getAttribute('title')),
  tilebarHidden: getComputedStyle(document.querySelector('header.tilebar')).display,
})
```

Expected: `pluginMirrors` lists plugin names if any are installed (e.g. `["apcupsd"]` if APC daemon plugin is present). `tilebarHidden === 'none'`. Take a screenshot — the apcupsd power button should appear in the topbar's right-side region.

Click the mirrored apcupsd button — it should trigger the same action as the original (Unraid's own click handlers fire because the click traverses the cloned `<a>` href / handler chain).

- [ ] **Step 5: Commit**

```powershell
git add src/ts/shell/components/shell-topbar.ts; git commit -m "feat(shell): mirror tilebar plugin buttons into topbar slot"
```

---

## Task 20: Responsive CSS — drawer mode + breakpoints

**Files:**
- Modify: `src/styles/shell-overlay.scss`
- Modify: `src/ts/shell/components/modernui-shell.ts`

`@media` queries drive the responsive behavior — no JS layout. At <960px the sidebar becomes a slide-over drawer (hidden by default; hamburger in topbar opens it). At <640px the topbar collapses the breadcrumb to back-arrow + current page title.

- [ ] **Step 1: Update shell-overlay.scss with responsive rules**

Open `src/styles/shell-overlay.scss`. Append after the existing rules:

```scss
// Drawer mode — sidebar hidden by default, body padding drops to 0 on the left.
@media (max-width: 959px) {
  body.modernui-shell-active {
    padding-left: 0;
  }
}

// Slim mode — sidebar collapsed by default at intermediate widths.
@media (min-width: 960px) and (max-width: 1279px) {
  body.modernui-shell-active:not(.modernui-shell-expanded-pinned) {
    padding-left: var(--shell-sidebar-width-collapsed);
  }
}
```

- [ ] **Step 2: Add drawer behavior to `<modernui-shell>`**

Open `src/ts/shell/components/modernui-shell.ts`. Inside the `static styles` block, add the media-query CSS for the sidebar:

```css
    @media (max-width: 959px) {
      .sidebar {
        transform: translateX(-100%);
        transition: transform 180ms cubic-bezier(0.2, 0, 0, 1);
      }
      :host([drawer-open]) .sidebar {
        transform: translateX(0);
        box-shadow: 0 0 24px rgba(0,0,0,0.4);
      }
      .topbar { left: 0; }
      .scrim {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.4);
        pointer-events: auto;
        display: none;
      }
      :host([drawer-open]) .scrim { display: block; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sidebar { transition: none; }
    }
```

In `render()`, add the scrim and a hamburger trigger:

```typescript
  render() {
    return html`
      <div class="scrim" @click=${this._closeDrawer}></div>
      <div class="sidebar" part="sidebar"><shell-sidebar></shell-sidebar></div>
      <div class="topbar"><shell-topbar @shell-toggle-drawer=${this._toggleDrawer}></shell-topbar></div>
    `;
  }
```

Add the toggle methods + property:

```typescript
  @property({ type: Boolean, reflect: true, attribute: 'drawer-open' }) drawerOpen = false;

  private _toggleDrawer = (): void => {
    this.drawerOpen = !this.drawerOpen;
  };

  private _closeDrawer = (): void => {
    this.drawerOpen = false;
  };
```

- [ ] **Step 3: Add a hamburger button to the topbar**

Open `src/ts/shell/components/shell-topbar.ts`. Before the `.breadcrumb` nav, add:

```typescript
      <button class="icon-btn hamburger" type="button" @click=${this._onHamburger} title="Menu">☰</button>
      <nav class="breadcrumb">
```

Add the handler:

```typescript
  private _onHamburger = (): void => {
    this.dispatchEvent(new CustomEvent('shell-toggle-drawer', { bubbles: true, composed: true }));
  };
```

Add CSS so the hamburger only shows at the drawer breakpoint:

```css
    .hamburger { display: none; }
    @media (max-width: 959px) {
      .hamburger { display: inline-flex; }
    }
    @media (max-width: 639px) {
      .breadcrumb { font-size: 12px; }
      .breadcrumb a:not(:last-child), .breadcrumb .sep:not(:last-of-type) { display: none; }
    }
```

- [ ] **Step 4: Build**

```powershell
npm run build
```

- [ ] **Step 5: Deploy + live-verify the breakpoints**

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Reload `/Dashboard` at full width. Resize the browser window to 800px wide via:

```javascript
mcp__Claude_in_Chrome__resize_window({ width: 800, height: 800 })
```

Probe:

```javascript
({
  paddingLeft: getComputedStyle(document.body).paddingLeft,
  hamburgerVisible: getComputedStyle(
    document.querySelector('modernui-shell')?.shadowRoot
      ?.querySelector('shell-topbar')?.shadowRoot?.querySelector('.hamburger')!
  ).display,
})
```

Expected: `paddingLeft === '0px'` (drawer mode), `hamburgerVisible` is `'inline-flex'`. Click the hamburger — sidebar slides in. Click the scrim — sidebar slides out.

Resize to 320px:

```javascript
mcp__Claude_in_Chrome__resize_window({ width: 320, height: 700 })
```

Verify the breadcrumb collapses to the last segment only.

Restore: `mcp__Claude_in_Chrome__resize_window({ width: 1440, height: 900 })`.

- [ ] **Step 6: Commit**

```powershell
git add src/styles/shell-overlay.scss src/ts/shell/components/modernui-shell.ts src/ts/shell/components/shell-topbar.ts; git commit -m "feat(shell): responsive drawer + breadcrumb collapse at <640px"
```

---

## Task 21: End-to-end live verification + acceptance gates

**Files:** none (verify only)

The full acceptance-gates checklist from the spec — runs on at least 5 different pages, validates plugin updates keep ticking, master-disable + per-feature shell toggle work.

- [ ] **Step 1: Run the full test suite**

```powershell
npm run build; npm run test:ts; npm run test:php
```

Expected: build clean, 225+ TS tests pass, all PHP tests pass.

- [ ] **Step 2: Visit five pages and confirm the shell renders**

For each of these URLs, reload in Chrome and verify the sidebar + topbar render + the active nav row matches:

| URL | Expected active sidebar item | Expected breadcrumb |
|---|---|---|
| `https://<your-unraid-host>/Dashboard`        | Dashboard               | `Dashboard` |
| `https://<your-unraid-host>/Main`             | Storage → Main          | `Storage / Main` |
| `https://<your-unraid-host>/Shares`           | Storage → Shares        | `Storage / Shares` |
| `https://<your-unraid-host>/Settings/Theme`   | Settings                | `Settings / Theme` |
| `https://<your-unraid-host>/Docker`           | Docker                  | `Docker` |

Take a screenshot of each. Take a final wide-screen screenshot of `/Dashboard` for the v0.4.0 release notes.

- [ ] **Step 3: Confirm plugin updates keep ticking**

On `/Dashboard`, run the probe + 15s wait + re-probe sequence from Task 18 Step 5. Confirm at least one Dynamix sensor value changed in both the mirrored status row AND the hidden source DOM.

- [ ] **Step 4: Confirm bell sees Unraid notifications**

Trigger a notification on the Unraid side:

```powershell
ssh -p 22 <your-unraid-host> "/usr/local/emhttp/webGui/scripts/notify -s 'modernui test' -d 'verification' -i normal"
```

Within ~3s, the bell badge should appear (or the count should bump). Click — popover lists the new notification.

- [ ] **Step 5: Confirm Master Disable still works**

In Chrome, on any page, click the floating fallback pill (or visit `?modernui=off`). Reload — stock Unraid renders, no shell, no theme tokens. URL escape hatch documented in [[project_fallback_toggle_requirement]] must still work.

- [ ] **Step 6: Confirm per-feature `shell=off` reverts only the shell**

Navigate to `/Settings/Theme`, select Stock under Shell layout, Save. Reload `/Dashboard`:
- Sidebar + topbar gone — stock Unraid chrome visible
- BUT theme tokens still applied (dark mode, accent color, etc.)
- AND `/Dashboard` modern layout still applied if `dashboard=on` (Phase 3)

Restore Modern shell before continuing.

- [ ] **Step 7: Confirm `shell=off` survives the loader regeneration**

Verify the loader emits `off`:

```powershell
ssh -p 22 <your-unraid-host> "cat /usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js"
```

The output should include `r.dataset.modernuiShell="on"` (or `"off"` if you set Stock). Confirm the value matches what's in `/boot/config/plugins/unraid-modernui/settings.cfg`.

- [ ] **Step 8: Final commit + tag**

If any inline cleanups were made during live verify (selector tweaks, fallback paths), commit them. Then bump the version + tag:

```powershell
# Edit package.json: "version": "0.4.0"
# Update README + spawn the chip for an unreleased-changes note in CHANGELOG if one exists
git add package.json; git commit -m "chore(release): v0.4.0 — Phase 4 shell rebuild (sidebar + topbar + plugin proxy)"
git tag v0.4.0
```

Then build the txz for the GitHub release:

```powershell
npm run package
```

Expected: `dist/unraid-modernui-0.4.0.txz`.

- [ ] **Step 9: Verification chip — list outstanding follow-ups**

If anything surfaced during this plan that's worth a future patch (e.g. plugin-registry entries to add for plugins we noticed but didn't first-class), capture them as chips via `mcp__ccd_session__spawn_task` so they don't get lost.

---

## Done When

- All 21 implementation tasks (1–21) committed in order.
- Final `npm run test:php`, `npm run test:ts`, `npm run build` clean.
- Task 21's seven verification gates pass on the live box, including the plugin-still-ticking regression check and the Master Disable + per-feature shell toggle.
- A v0.4.0 tag exists locally; the txz is built for release.
- No regressions in Phase 3 work — `/Dashboard` modern layout still renders inside the new shell; dashboard `on|off` toggle still works alongside `shell` toggle.

### Likely failure modes

- **Plugin polling pauses** after Task 18 deploy → switch `display:none` on `div.statusbar` to offscreen positioning per Plan-Wide Conventions caveat.
- **Server name comes through empty** in Task 7 → Unraid's tilebar DOM doesn't expose it via the queried selectors; either tighten the selector after inspecting `header.tilebar.outerHTML` or fall back to PHP injection in `modernui_html_block()`.
- **`#notifier` selector mismatch** in Task 15 → bell shows 0 unread when stock bell shows N; inspect `document.getElementById('notifier').outerHTML` and add the right child selector to `_sync()`.
- **Cloned plugin button no-ops** when clicked in Task 19 → some plugins attach event handlers directly to the element rather than via delegated handlers. Mitigation: instead of cloning, re-parent the original node into our slot; that breaks the source visibility but only one of source-or-mirror needs to live. Decide per-plugin.
- **`:host-context()` not supported** in some browsers → Unraid 7.x is Chromium-based so this is fine; fallback would be using attribute reflection from `<modernui-shell>` down to children.

### Self-review note

Coverage check against the spec:
- ✅ Architecture (boot.ts + body class + Lit root) → Tasks 4-6
- ✅ Sidebar 240/64 + logo/server name + curated nav + auto-discovery + active highlight → Tasks 7-10
- ✅ Collapse states + chevron + cfg persist → Task 11
- ✅ System Status footer (Array + temp + power + UPS) → Task 18
- ✅ Topbar with breadcrumb + actions slot + plugin slot + search placeholder + bell + user menu → Tasks 12-15, 19
- ✅ Plugin proxy with registry.json → Tasks 16-19
- ✅ Responsive (drawer at <960, breadcrumb collapse at <640) → Task 20
- ✅ Settings cfg key `shell=on|off` + radio fieldset + loader.js emit → Tasks 1-3
- ✅ TDD on `shellEnabled` / `buildNav` / `pathToBreadcrumb` / `matchPlugin` → Tasks 4, 8-9, 12, 16
- ✅ Live verification on 5+ pages → Task 21

