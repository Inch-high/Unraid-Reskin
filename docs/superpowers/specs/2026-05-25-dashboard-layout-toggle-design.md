# Dashboard layout toggle (Settings page)

**Date:** 2026-05-25
**Scope:** Phase 3 Task 24 — add a Settings-page toggle to enable/disable the dashboard rebuild
**Status:** Approved, ready for implementation plan

## Problem

The v0.3 dashboard rebuild is the headline feature of this release, but the only way to turn it off is to disable the entire theme (which also reverts every other page) or hit `?modernui=off` per-session. We need a persistent, per-feature toggle so users can keep the modernized theme on other pages but choose between the rebuilt dashboard and the stock Unraid dashboard on `/Dashboard`.

This complements — does not replace — the existing fallback hatches documented in [[project-fallback-toggle-requirement]]:
- Master in-theme "Disable theme" button
- Floating "Enable Modern UI" pill (visible when theme is off)
- `?modernui=off` URL override
- SSH `touch /boot/config/plugins/unraid-modernui/disabled`

After this change the user has the full matrix:

|                            | Theme on | Theme off |
|---                         |---       |---        |
| **Dashboard rebuild on**   | full modern UI (default) | stock UI everywhere |
| **Dashboard rebuild off**  | modern theme + stock /Dashboard | stock UI everywhere |

## Solution

### Settings storage

`settings.cfg` gets one new key:

| Key | Type | Default | Allowed |
|---  |---   |---      |---      |
| `dashboard` | string | `"on"` | `"on"`, `"off"` |

Default is `"on"` so users who upgrade from v0.2 or do a fresh install see the new dashboard immediately. If the cfg file is absent or unreadable for any reason, the loader falls back to `"on"` as well — the user only ever sees the stock dashboard if they explicitly opted out.

### Theme.page UI

A new fieldset placed immediately below the existing "Color mode" fieldset:

```
┌─ Dashboard layout ─────────────────────────┐
│  ⦿ Modern   ○ Stock                         │
│  Toggle whether /Dashboard shows the new   │
│  layout (hero strip, sticky sidebar,       │
│  collapsible sections). The rest of the    │
│  theme stays modernized either way.        │
└────────────────────────────────────────────┘
```

Two radio buttons with values `on` and `off`, labelled "Modern" and "Stock", rendered via the existing `modernui_radio($name, $value, $label, $current)` helper. A small description sits beneath the radios explaining the scope so users understand it only affects `/Dashboard`. The fieldset uses the same border + padding + legend treatment as the existing five fieldsets.

### Save path

`include/save.php`'s `modernui_validate_settings()` gets one new entry in both `$defaults` and `$allowed`:

```php
$defaults['dashboard'] = 'on';
$allowed['dashboard']  = ['on', 'off'];
```

Nothing else in the save flow changes. Invalid values are rejected with the same `Invalid value for dashboard: ...` error pattern as every other key. After a successful save, the existing `modernui_generate_loader_js()` call regenerates `loader.js` so the new value lands on the next page load.

### Loader → dataset attribute

`include/install.php`'s `modernui_generate_loader_js()` already produces a `loader.js` that runs before any other modernui script and sets `data-modernui-mode` and `data-modernui-density` on `<html>`. We append one more attribute alongside them:

```javascript
document.documentElement.dataset.modernuiDashboard = "on";  // or "off"
```

If `settings.cfg` is missing or the key is absent, the generator emits `"on"` (matches the cfg-level default).

### Boot gate

`src/ts/dashboard/boot.ts`'s `boot()` adds a single check at the very top, before the existing `onDashboardPage()` guard:

```typescript
export function boot(): void {
  if (document.documentElement.dataset.modernuiDashboard === 'off') return;
  if (!onDashboardPage()) return;
  // ...rest unchanged
}
```

When the gate is off, `boot()` returns immediately:
- No `body.modernui-dashboard-active` class is added.
- No `MutationObserver` is attached to `table.dashboard`.
- No `<modernui-dashboard>` element is mounted.
- Stock Unraid's `table.dashboard` and `div.frame > div.grid` render normally (the CSS hide rule in `dashboard-overlay.scss` is gated on `body.modernui-dashboard-active`).

The existing master enable/disable, URL-parameter override, and SSH escape hatches continue to work unchanged.

### Interaction with the master toggle

If the master `disabled` flag is set, `loader.js` never runs at all — the `data-modernui-dashboard` attribute is never written. boot.ts is also never loaded. The dashboard setting becomes a no-op in that state, which is correct: master-off means stock UI everywhere, no matter what the dashboard sub-setting says.

### Verification on the live box

Manually verify in this order against `https://<your-unraid-host>/Dashboard`:

1. Default install (or upgrade): `data-modernui-dashboard="on"` on `<html>`. Modern dashboard renders. Theme.page shows "Modern" selected.
2. Toggle to "Stock", save, reload `/Dashboard`. `data-modernui-dashboard="off"`. Stock Unraid `table.dashboard` rendering is visible. No `<modernui-dashboard>` element in the DOM. Other pages (Main, Shares, Settings) still look themed.
3. Toggle back to "Modern", save, reload. Modern dashboard returns.
4. Edit `settings.cfg` by hand to set `dashboard = "garbage"`, reload. Loader falls back to `"on"`; modern dashboard renders. (Server-side validation prevents the form from ever writing a garbage value, but the read path must also be robust.)

## Architecture

End-state — three small TS and three small PHP touches, no new files:

| File | Action | Change |
|---   |---     |---     |
| `package/pages/Theme.page` | modify | add the "Dashboard layout" fieldset between "Color mode" and "Density" |
| `package/include/save.php` | modify | add `dashboard` to `$defaults` + `$allowed` |
| `package/include/install.php` | modify | extend `modernui_generate_loader_js()` to read and emit `dashboard` |
| `src/ts/dashboard/boot.ts` | modify | add the early `dataset.modernuiDashboard === 'off'` return |
| `tests/unit-php/save.test.php` | modify | add tests for the new key (accept on/off, reject other values) |
| `tests/unit-ts/dashboard/boot.test.ts` | modify | add a test that `boot()` exits early when the dataset attribute is `off` |

No new components, no new stylesheets, no new data plumbing.

## Testing

- **PHP**: extend `save.test.php` with two assertions — `dashboard=on` saves successfully and `dashboard=off` saves successfully; `dashboard=maybe` returns `ok=false`.
- **TS**: extend `boot.test.ts` with one test that sets `document.documentElement.dataset.modernuiDashboard = 'off'`, calls `boot()`, and asserts the dashboard mount does not happen (no `body.modernui-dashboard-active` class, no `<modernui-dashboard>` element in the test DOM).
- **Manual** (live Unraid): the verification checklist above.

## Non-goals

- No new escape hatch in addition to the existing four ([[project-fallback-toggle-requirement]]).
- No per-card sub-toggles (Hero strip on/off, Sticky sidebar on/off, etc.). Single switch only.
- No transitional animation between modern → stock — a full page reload is fine.
- No per-user setting persistence (cfg is per-install, all users see the same setting).
- No telemetry on which mode users prefer.

## Risks and tradeoffs

- **Cache**: `loader.js` is served with versioning so the regenerated file is picked up on next reload. If a user has the page open in another tab when they toggle, that tab keeps the old dataset value until they reload — acceptable and matches the existing color-mode behavior.
- **Browser back/forward cache**: a back-button navigation might restore the previous dashboard state from BFCache. Reloading explicitly after save (as the existing form-submit handler already does) avoids this.
- **First-paint flash**: the gate runs at boot, so there's no flash of modern dashboard before falling back to stock — boot.ts exits before adding the body class that hides stock content. Confirmed via the `dashboard-overlay.scss` rule being gated on `body.modernui-dashboard-active`.

## Out of scope (future work)

- Page-level rebuild toggles once we modernize Main, Shares, Settings, etc.
- A user-visible indicator (banner/pill) on /Dashboard when "Stock" is selected, explaining how to flip it back. Existing settings page entry is the documented path.
- Migration from one cfg location to another.
