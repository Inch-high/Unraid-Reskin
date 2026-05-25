# Dashboard Layout Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings-page on/off toggle that gates the dashboard rebuild specifically, leaving the rest of the modernized theme active when the user opts out.

**Architecture:** Three small PHP changes (add a `dashboard` key to the whitelist, render a new fieldset on `Theme.page`, extend `modernui_generate_loader_js` to read the key and emit `data-modernui-dashboard` on `<html>`), plus one tiny TS change (a `isDashboardEnabled(doc)` helper that boot.ts calls before the existing `/Dashboard*` path check). Default value is `"on"`, applied both in cfg and as a runtime fallback so a missing or corrupt cfg never silently disables the dashboard.

**Tech Stack:** PHP 8 (existing Theme.page + save/install pipeline); TypeScript + Lit 3 (existing dashboard bootstrap); Vitest + jsdom for TS tests; assert-based PHP test scripts (existing pattern, run via `tests/unit-php/run-all.mjs`).

---

## File Structure

End-state — six existing files modified, zero new files.

```
package/
├── pages/Theme.page                 MODIFY: add "Dashboard layout" fieldset
└── include/
    ├── save.php                     MODIFY: whitelist 'dashboard' key
    └── install.php                  MODIFY: extend loader.js generator

src/ts/dashboard/
└── boot.ts                          MODIFY: gate on isDashboardEnabled(document)

tests/
├── unit-php/save.test.php           MODIFY: cover the new key
└── unit-ts/dashboard/boot.test.ts   MODIFY: cover the gate helper
```

**Responsibility split:**

- `save.php` owns the whitelist. One new entry in `$defaults` + one in `$allowed`.
- `install.php`'s `modernui_generate_loader_js()` owns the JS string that writes the dataset attribute. One new line, plus reading the value out of settings.
- `Theme.page` owns the UI. One new fieldset of the same shape as the existing five.
- `boot.ts` owns the runtime gate. A tiny `isDashboardEnabled(doc)` helper plus a one-line early return.
- Tests are extended in place — both `save.test.php` and `boot.test.ts` already exist for these modules.

---

## Plan-Wide Conventions

**TDD rhythm**: where the change is a pure function (`modernui_validate_settings`, the new `isDashboardEnabled`), write the failing test first, then implement. For Theme.page UI and the loader.js generator, the verification is manual on the live box (no test layer for those today).

**Commits**: one per task once the relevant test or build passes. Conventional Commits, matching the recent work.

**Verification on the live box** (Task 5): `MODERNUI_SSH_PORT=22 npm run dev-mirror -- <your-unraid-host>` from PowerShell, then reload `/Dashboard`. See [[reference_dev_mirror_deploy]] for the working command — running it from Bash silently drops the env var and connects to port 22.

**Order**: Tasks 1–4 land in any order in principle, but the recommended sequence below (PHP whitelist → UI → loader → TS gate → deploy/verify) is the cleanest narrative and means each commit corresponds to one observable change.

---

## Task 1: Whitelist the `dashboard` key in `save.php`

**Files:**
- Modify: `package/include/save.php`
- Modify: `tests/unit-php/save.test.php`

- [ ] **Step 1: Add failing tests for the new key**

Open `tests/unit-php/save.test.php`. Just before the final `echo "all save tests passed\n";` line, append the following block:

```php
// Dashboard layout toggle: 'on' and 'off' are valid, anything else is rejected.
$onOk = modernui_validate_settings(['dashboard' => 'on']);
assert($onOk['ok'] === true, "dashboard=on should pass: " . var_export($onOk, true));
assert($onOk['values']['dashboard'] === 'on');

$offOk = modernui_validate_settings(['dashboard' => 'off']);
assert($offOk['ok'] === true, "dashboard=off should pass");
assert($offOk['values']['dashboard'] === 'off');

$badDash = modernui_validate_settings(['dashboard' => 'maybe']);
assert($badDash['ok'] === false, "dashboard=maybe should fail");
assert(strpos($badDash['error'], 'dashboard') !== false);

// Default when key is absent is "on" (modern dashboard).
$noDash = modernui_validate_settings([]);
assert($noDash['ok'] === true);
assert($noDash['values']['dashboard'] === 'on', "default dashboard should be on");
```

- [ ] **Step 2: Run the test to verify it fails**

Run via PowerShell:

```powershell
npm run test:php
```

Expected: at least one of the new assertions fails. Likely with a message like `dashboard=on should pass: ['ok' => false, 'error' => 'Invalid value for dashboard: on']`, because `dashboard` is not yet in the whitelist so any non-default value is rejected — except actually for the all-empty input it currently passes through with no `dashboard` field at all, which would also fail the new `default dashboard should be on` assertion. Either failure is fine; both go away in Step 3.

- [ ] **Step 3: Add the key to the whitelist**

Open `package/include/save.php`. Locate `modernui_validate_settings()` (around lines 7-33). The `$defaults` and `$allowed` arrays currently end with `'reduced_motion'`. Add a `'dashboard'` entry to each so they read:

```php
function modernui_validate_settings(array $input): array {
    $defaults = [
        'mode'           => 'system',
        'density'        => 'comfortable',
        'sidebar'        => 'expanded',
        'zebra'          => '0',
        'reduced_motion' => 'auto',
        'dashboard'      => 'on',
    ];
    $allowed = [
        'mode'           => ['system', 'dark', 'light'],
        'density'        => ['comfortable', 'compact'],
        'sidebar'        => ['expanded', 'collapsed'],
        'zebra'          => ['0', '1'],
        'reduced_motion' => ['auto', '0', '1'],
        'dashboard'      => ['on', 'off'],
    ];
    // ...rest of the function unchanged
}
```

- [ ] **Step 4: Run the test again to verify it passes**

Run:

```powershell
npm run test:php
```

Expected: `all save tests passed`. All four new assertions plus all existing ones.

- [ ] **Step 5: Commit**

```powershell
git add package/include/save.php tests/unit-php/save.test.php; git commit -m "feat(settings): whitelist dashboard=on|off in save.php"
```

---

## Task 2: Add the "Dashboard layout" fieldset to Theme.page

**Files:**
- Modify: `package/pages/Theme.page`

No automated test layer for Theme.page — the verification is the live-box step at the end of Task 5. This task is therefore a single edit + commit; the page is exercised end-to-end during Task 5.

- [ ] **Step 1: Read the existing fieldset pattern**

The five existing fieldsets in `package/pages/Theme.page` (around lines 33-62) all follow the same shape: `<fieldset>` with a `<legend>`, then two-or-three `<?= modernui_radio('name', 'value', 'Label', $current) ?>` calls. We add a sixth fieldset matching that style.

- [ ] **Step 2: Add the new local variable**

In the PHP block at the top of the file (around lines 6-21), the existing locals look like:

```php
$mode    = $settings['mode']    ?? 'system';
$density = $settings['density'] ?? 'comfortable';
$sidebar = $settings['sidebar'] ?? 'expanded';
$zebra   = $settings['zebra']   ?? '0';
$rmotion = $settings['reduced_motion'] ?? 'auto';
```

Add one more line after `$rmotion`:

```php
$dashboard = $settings['dashboard'] ?? 'on';
```

The full local-init block now reads:

```php
$mode      = $settings['mode']      ?? 'system';
$density   = $settings['density']   ?? 'comfortable';
$sidebar   = $settings['sidebar']   ?? 'expanded';
$zebra     = $settings['zebra']     ?? '0';
$rmotion   = $settings['reduced_motion'] ?? 'auto';
$dashboard = $settings['dashboard'] ?? 'on';
```

- [ ] **Step 3: Add the new fieldset between "Color mode" and "Density"**

In the same file, locate the "Color mode" fieldset (around lines 33-38). It ends with `</fieldset>`. Insert this new fieldset immediately after it, before the "Density" fieldset:

```php
    <fieldset style="border:1px solid #ddd;padding:12px 16px;margin-bottom:16px;">
      <legend>Dashboard layout</legend>
      <?= modernui_radio('dashboard', 'on',  'Modern', $dashboard) ?>
      <?= modernui_radio('dashboard', 'off', 'Stock',  $dashboard) ?>
      <p style="margin:8px 0 0 0;font-size:12px;color:#666;">
        Toggle whether <code>/Dashboard</code> shows the new layout (hero strip, sticky sidebar, collapsible sections). The rest of the theme stays modernized either way.
      </p>
    </fieldset>
```

- [ ] **Step 4: Build and deploy to verify the page renders**

Build is unnecessary here — the .page file is server-side PHP and ships in the package as-is. Deploy in Task 5 covers it.

For now just verify the file parses cleanly:

```powershell
php -l package/pages/Theme.page
```

Expected: `No syntax errors detected in package/pages/Theme.page`.

(Note: `php -l` on a `.page` file works because the `Menu="..."` header is treated as plain HTML by the lint.)

- [ ] **Step 5: Commit**

```powershell
git add package/pages/Theme.page; git commit -m "feat(settings): add Dashboard layout fieldset to Theme page"
```

---

## Task 3: Extend `modernui_generate_loader_js` to emit the dashboard attribute

**Files:**
- Modify: `package/include/install.php`

- [ ] **Step 1: Edit the generator**

Open `package/include/install.php`. Locate `modernui_generate_loader_js()` (around lines 82-103). The current implementation reads `mode` and `density` and writes them onto `<html>`. Add a third read and a third `dataset.` line.

Replace the existing function body with:

```php
function modernui_generate_loader_js(bool $disabled): void {
    $target = $disabled ? 're-enable.js' : 'modernui.js';
    $settings = modernui_parse_cfg('/boot/config/plugins/unraid-modernui/settings.cfg');
    $mode      = $settings['mode']      ?? 'system';
    $density   = $settings['density']   ?? 'comfortable';
    $dashboard = $settings['dashboard'] ?? 'on';
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
        . "var s=document.createElement('script');\n"
        . "s.src='/plugins/unraid-modernui/theme/dist/" . $target . "';\n"
        . "document.head.appendChild(s);\n"
        . $extraScript
        . "})();\n";
    $loaderPath = '/usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js';
    file_put_contents($loaderPath, $loader, LOCK_EX);
}
```

The only changes from the current implementation:
- One new local `$dashboard = $settings['dashboard'] ?? 'on';`
- One new line in the loader string: `r.dataset.modernuiDashboard=` ...

- [ ] **Step 2: Lint to verify it parses**

Run:

```powershell
php -l package/include/install.php
```

Expected: `No syntax errors detected`.

- [ ] **Step 3: Run the existing PHP suite to verify no regression**

Run:

```powershell
npm run test:php
```

Expected: `all save tests passed` plus all other existing test files. The loader generator isn't directly covered by tests, but adjacent tests must still pass.

- [ ] **Step 4: Commit**

```powershell
git add package/include/install.php; git commit -m "feat(settings): emit data-modernui-dashboard from loader.js"
```

---

## Task 4: Gate `boot()` on the dataset attribute

**Files:**
- Modify: `src/ts/dashboard/boot.ts`
- Modify: `tests/unit-ts/dashboard/boot.test.ts`

We extract a tiny pure helper `isDashboardEnabled(doc)` so the gate logic can be tested in isolation without standing up the full Lit mount. `boot()` itself stays untestable as before (it touches MutationObservers and timers); only the gate is unit-tested.

- [ ] **Step 1: Add the failing test**

Open `tests/unit-ts/dashboard/boot.test.ts`. After the final closing `});` of the existing `describe('dashboard DOM walk — multi-table', () => {...})` block, append a new describe block:

```typescript
import { isDashboardEnabled } from '../../../src/ts/dashboard/boot';

describe('isDashboardEnabled gate', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.modernuiDashboard;
  });

  it('returns true when the attribute is absent (failure-mode default)', () => {
    expect(isDashboardEnabled(document)).toBe(true);
  });

  it('returns true when the attribute is "on"', () => {
    document.documentElement.dataset.modernuiDashboard = 'on';
    expect(isDashboardEnabled(document)).toBe(true);
  });

  it('returns false when the attribute is "off"', () => {
    document.documentElement.dataset.modernuiDashboard = 'off';
    expect(isDashboardEnabled(document)).toBe(false);
  });

  it('returns true for any other (unknown / future) value', () => {
    document.documentElement.dataset.modernuiDashboard = 'something-else';
    expect(isDashboardEnabled(document)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm run test:ts
```

Expected: the new tests fail to import `isDashboardEnabled` from `boot.ts` — error like `No matching export in src/ts/dashboard/boot.ts for import "isDashboardEnabled"`. All 198 existing tests still pass.

- [ ] **Step 3: Implement the helper and the gate**

Open `src/ts/dashboard/boot.ts`. Just below the existing `onDashboardPage()` helper (around lines 8-10), add the new helper:

```typescript
export function isDashboardEnabled(doc: Document): boolean {
  return doc.documentElement.dataset.modernuiDashboard !== 'off';
}
```

Then update `boot()` (around line 51) to call it at the very top. The full updated `boot()` becomes:

```typescript
export function boot(): void {
  if (!isDashboardEnabled(document)) return;
  if (!onDashboardPage()) return;

  waitForSource(
    5000,
    () => {
      document.body.classList.add('modernui-dashboard-active');

      // Find or create the mount container
      const container = document.querySelector('div.frame') || document.body;
      const root = document.createElement('modernui-dashboard') as ModernuiDashboard;
      container.appendChild(root);

      // Wire store
      const store = createStore();
      root.setStore(store);

      // Initial sync across all dashboard tables
      extractAll(store);

      // Watch every table for live updates (Unraid renders db_box1/2/3)
      for (const table of collectDashboardTables()) {
        const obs = createSourceObserver(table, () => extractAll(store), 50);
        obs.start();
      }
    },
    () => {
      console.warn('[modernui-dashboard] source not found; leaving stock UI');
    },
  );
}
```

Only one new line is added to `boot()` itself: `if (!isDashboardEnabled(document)) return;` at the top.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
npm run test:ts
```

Expected: 202 tests pass (198 existing + 4 new). Build also stays clean:

```powershell
npm run build
```

Expected: `Build complete → ...`.

- [ ] **Step 5: Commit**

```powershell
git add src/ts/dashboard/boot.ts tests/unit-ts/dashboard/boot.test.ts; git commit -m "feat(dashboard): gate boot() on data-modernui-dashboard attribute"
```

---

## Task 5: Deploy and live-verify the full toggle

**Files:** none (deploy + verify only)

- [ ] **Step 1: Deploy to the live Unraid box**

Run via PowerShell:

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Expected: ends with `Modern UI: install complete (disabled=false)`. This regenerates `loader.js` with the new third dataset attribute.

- [ ] **Step 2: Reload and confirm the default-on state**

In the connected Chrome tab on `https://<your-unraid-host>/Dashboard`, run:

```javascript
location.reload(true)
```

Then probe via `mcp__Claude_in_Chrome__javascript_tool`:

```javascript
({
  dataset: { ...document.documentElement.dataset },
  hasModernuiDashboard: !!document.querySelector('modernui-dashboard'),
  bodyHasActiveClass: document.body.classList.contains('modernui-dashboard-active'),
})
```

Expected: `dataset.modernuiDashboard === 'on'`, `hasModernuiDashboard === true`, `bodyHasActiveClass === true`. Modern dashboard renders.

- [ ] **Step 3: Visit the Settings page, confirm the new fieldset**

Navigate the Chrome tab to `https://<your-unraid-host>/Settings/Theme`. Take a screenshot. The page should show a new "Dashboard layout" fieldset between "Color mode" and "Density", with "Modern" radio pre-selected.

- [ ] **Step 4: Toggle to Stock and save**

In the Settings page, click the "Stock" radio under "Dashboard layout", then click the "Save" button. The page reloads.

Navigate back to `https://<your-unraid-host>/Dashboard` and reload. Probe again:

```javascript
({
  dataset: { ...document.documentElement.dataset },
  hasModernuiDashboard: !!document.querySelector('modernui-dashboard'),
  bodyHasActiveClass: document.body.classList.contains('modernui-dashboard-active'),
  hasStockTable: !!document.querySelector('table.dashboard'),
})
```

Expected: `dataset.modernuiDashboard === 'off'`, `hasModernuiDashboard === false`, `bodyHasActiveClass === false`, `hasStockTable === true`. Stock Unraid dashboard layout is fully visible. Take a screenshot to confirm.

- [ ] **Step 5: Verify other pages still themed**

In the same Chrome tab, navigate to `https://<your-unraid-host>/Main` (or `/Shares`, `/Users`, etc.). The page should still show the modernui theme (tokens, colors, etc.). The `disabled` master flag is *not* set; only the dashboard rebuild is gated.

- [ ] **Step 6: Toggle back to Modern**

Return to `https://<your-unraid-host>/Settings/Theme`. Select "Modern" under "Dashboard layout", click Save. Reload `/Dashboard`. Modern dashboard returns. Probe once more to confirm `dataset.modernuiDashboard === 'on'` and `hasModernuiDashboard === true`.

- [ ] **Step 7: Verify the cfg-corruption fallback**

In a terminal SSH'd to the Unraid box, hand-edit `/boot/config/plugins/unraid-modernui/settings.cfg` and set `dashboard=garbage`. Reload `/Dashboard`. The server-side save flow won't ever write a bad value (validated in Task 1), but the read path must also be robust:

```javascript
({ dashboardAttr: document.documentElement.dataset.modernuiDashboard })
```

Expected: `dashboardAttr === 'garbage'` (the loader passes through whatever the cfg holds), but `isDashboardEnabled` only returns false for the exact string `'off'` — so the modern dashboard still renders.

Restore the cfg afterward (`dashboard=on`).

---

## Done When

- All four implementation tasks (1–4) committed in order.
- `npm run test:php`, `npm run test:ts`, and `npm run build` all clean on the final commit.
- Task 5's live verification checklist passes — the toggle works from the Settings UI, persists across reloads, and a corrupt cfg value falls back to modern.
- No regressions in any other settings (color mode, density, sidebar, zebra, reduced motion still save and load as before).

If any verification fails, do not proceed — diagnose first. Most likely failure modes:
- `dataset.modernuiDashboard` undefined after deploy → `loader.js` wasn't regenerated; re-run `dev-mirror` and confirm the install.php change shipped.
- "Stock" save reloads but dashboard still modern → check the new `if (!isDashboardEnabled(document)) return;` actually shipped in the new `modernui-dashboard.js` bundle.
- New fieldset doesn't render → PHP parse error in Theme.page; check `php -l`.
