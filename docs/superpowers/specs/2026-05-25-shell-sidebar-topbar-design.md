# Phase 4: Shell rebuild — left sidebar + topbar + plugin proxy

**Date:** 2026-05-25
**Scope:** Replace Unraid 7.x's top-nav and bottom status bar with a TrueNAS-style left sidebar + 48px topbar, while preserving plugin-contributed items in both regions. Ships as v0.4.0.
**Status:** Approved, ready for implementation plan

## Problem

Phases 1–3 themed Unraid's existing chrome and rebuilt `/Dashboard`. The chrome itself — the top-nav, the page header, the bottom status bar — is still Unraid's stock layout. The umbrella spec ([2026-05-24-unraid-modernui-design.md](2026-05-24-unraid-modernui-design.md)) describes a left-sidebar + slim-topbar shell modelled on TrueNAS SCALE that replaces the entire chrome with one consistent layout across every page.

This phase implements that shell, plus the two plugin-proxy mechanisms that keep community-plugin contributions (bottom-bar temps/UPS/power and top-right action buttons) working inside the new layout.

## Solution

### Architecture

No new PHP overlay beyond what v0.1 already does. `DefaultPageLayout.php` is already backed up and patched to inject our CSS + `loader.js` before `</head>`. Phase 4 mounts client-side via the existing `modernui.js` bundle.

**At runtime, gated on `data-modernui-shell="on"`:**

1. `boot.ts` (new, in `src/ts/shell/`) checks the dataset attribute; if `"off"`, exits immediately and stock chrome stays.
2. `body.modernui-shell-active` class is added — CSS hides `header.tilebar` text content, `nav.tabs`, and the bottom status bar.
3. `<modernui-shell>` (new Lit web component) mounts into a fixed-position overlay covering left + top of the viewport. Page content gets `padding-left: var(--shell-sidebar-width)` and `padding-top: var(--shell-topbar-height)` so Unraid's rendered content sits naturally inside.
4. Two `MutationObserver`s start:
   - One watches Unraid's hidden bottom status bar; mirrors children into the sidebar System Status footer (see Plugin proxy below).
   - One watches the top-right plugin-injection area in Unraid's `tilebar`; mirrors children into the topbar's plugin slot.

**Why client-side mounting rather than full PHP shell override:**
- Survives Unraid patch releases that change `DefaultPageLayout.php` internals (we only inject one `<script>` and one `<link>` tag — same minimal contract since v0.1.1).
- Plugin DOM hooks stay alive in the hidden source; their polling/update logic keeps running without modification.
- Master enable/disable still works exactly as before.

### Sidebar (240px expanded / 64px collapsed)

**Top section (~64px):** small Unraid logo + server name from `$var['NAME']` rendered in PHP-injected `data-server-name="HL15Rack"` attribute on `<html>` (same loader.js mechanism that already writes mode/density/dashboard). Clickable → `/Dashboard`.

**Nav body — hybrid sourcing:**

1. **Curated baseline** (hard-coded TS):

| Entry | URL | Sub-items |
|---|---|---|
| Dashboard | `/Dashboard` | — |
| Storage | (expandable) | Main / Shares / Pools |
| Docker | `/Docker` | — |
| VMs | `/VMs` | — |
| Users | `/Users` | — |
| Plugins | `/Plugins` | — |
| Settings | `/Settings` | — |
| Tools | `/Tools` | — |
| Apps | `/Apps` | — |

2. **Auto-discovery**: at boot, walk Unraid's stock top-nav DOM. Any anchor whose URL isn't already in the curated tree appends to an **"Other"** section at the bottom. Catches plugin-added entries (Tailscale, custom dashboards, etc.) without hard-coding.

3. **Active-page highlight**: current page from `location.pathname`; matching entry gets a 3px left accent bar (no filled background — preserves flat aesthetic).

**Collapse states:**
- **Expanded (240px)**: full labels + sub-items when group is open
- **Collapsed (64px)**: icons only; hover/focus reveals popover with label + sub-items
- Toggle: chevron at bottom; state persists in `settings.cfg` (`sidebar=expanded|collapsed` key already exists from v0.1)

**System Status footer (pinned at sidebar bottom):**

Rows populated by mirroring Unraid's hidden bottom-bar DOM:

| Row | Source | Notes |
|---|---|---|
| Array state | `.array-state` text + colored dot | Green `Started` / amber `Starting` / red `Stopped` |
| CPU temp | Dynamix System Temperature plugin's emitted spans | Average rolled up across sensors; hover popover shows per-sensor |
| Power draw | Dynamix System Stats plugin's `.power` span | Only renders if the plugin is present |
| UPS | Dynamix UPS plugin's `.nut_*` spans | Battery % + on-line/on-battery state; only renders if a UPS plugin is configured |

Each row is a button → popover with detail + link to relevant settings page.

In collapsed mode, footer shows 4 icons; click-through opens the same popovers.

### Topbar (48px)

**Position**: `position: fixed; top: 0; left: var(--shell-sidebar-width); right: 0; height: 48px`.

**Left side:**
- **Hamburger** at `<960px` — toggles the sidebar drawer
- **Breadcrumb** derived from `location.pathname` by splitting on `/` and looking up labels against the curated nav tree. Unknown segments fall back to the raw URL segment with leading capital.

**Right side (in order):**

1. **Page actions slot** — `<div id="modernui-topbar-actions">` left empty; reserved for future per-page action buttons (Phase 5+ pages mount actions here).
2. **Topbar plugin slot** — mirror of Unraid's top-right plugin injection area. Recognized plugins (matched via `plugin-registry.json` by class/id) render with our visual treatment; unknowns are cloned as-is preserving their `<a>` / `<button>` DOM (including click handlers and icons). Plugin items re-render their own DOM; we re-clone on each MutationObserver tick so the mirror stays current.
3. **Search icon** — placeholder, no behavior in v0.4.0; click shows "coming soon" toast. Reserved slot.
4. **Notification bell** — observes Unraid's existing notifications channel (`#notifier` element or its data feed). Shows a badge when unread > 0. Click → popover listing recent notifications, sourced from the same feed Unraid's bell uses.
5. **User menu** — replaces Unraid's existing top-right avatar. Items:
   - **About** — version, GitHub link, Unraid copyright + manual links (the strings that used to live in the footer)
   - **Stock UI** — one-click flip; same effect as toggling Shell layout off in Settings
   - **Logout** — `/logout`

**No copyright/manual text in chrome itself** — both moved into the user menu's About panel.

**What CSS hides** (gated on `body.modernui-shell-active`):
- `header.tilebar` text content (logo image stays for fallback)
- `nav.tabs` (Unraid's top-nav)
- Bottom status bar `<footer>` / `div.statusbar`

These elements stay in the DOM, only their visual position changes (`display: none` or pulled out of layout flow). Plugin polling logic continues to update them unmodified.

### Plugin proxy strategy

Two parallel MutationObservers, both backed by the same `plugin-registry.json`:

**Bottom-bar → sidebar System Status footer:**
- Recognized plugin signatures (CSS selectors keyed in registry) → render via our footer component with proper labels, icons, color tokens.
- Unknown items → mirror inner HTML into a generic "Plugins" sub-section of the System Status footer, preserving each plugin's own polling-target DOM by cloning.

**Top-right tilebar plugin area → topbar plugin slot:**
- Same registry, separate selector list per plugin (some plugins render in both regions; the registry entry indicates which slot each belongs in).
- Unknowns clone into the topbar's plugin strip with default 32px square icon styling.

**`plugin-registry.json`** ships in `src/ts/shell/plugin-registry.json` and lists known community plugins:

```json
{
  "bottom": [
    { "name": "dynamix.system.temp",  "selector": ".dynamix-system-temp", "slot": "cpu-temp", "label": "CPU temp" },
    { "name": "dynamix.system.stats", "selector": ".dynamix-system-stats-power", "slot": "power", "label": "Power" },
    { "name": "dynamix.ups",          "selector": ".nut_status", "slot": "ups", "label": "UPS" }
  ],
  "topbar": [
    { "name": "apcupsd",        "selector": "a.apcupsd-power-button", "icon": "power" },
    { "name": "ipmi.tools",     "selector": "a.ipmi-tools-button" }
  ]
}
```

Adding a new community plugin = a registry entry, no code change. Unknown plugins still appear (mirrored as-is), just without first-class styling.

### Responsive behavior

| Width | Layout |
|---|---|
| ≥1280px | Sidebar 240px expanded; topbar full breadcrumb + actions + plugin slot + bell + menu |
| 960–1279px | Sidebar 64px collapsed-to-icons by default; user can pin open (state persists); topbar unchanged |
| 640–959px (tablet) | Sidebar becomes slide-over drawer; topbar gains hamburger; breadcrumb visible |
| <640px (phone) | Same drawer; topbar collapses breadcrumb into back-arrow + current page title; System Status moves into drawer footer |

Implementation: CSS `@media` queries on the shell component; drawer animation uses `transform: translateX()` + `prefers-reduced-motion` guard. No JS-driven layout — everything CSS-driven for performance.

### Settings toggle

New cfg key `shell` (values `on` / `off`, default `on`):

- `save.php`: extend `$defaults` and `$allowed` with `'shell' => 'on'` / `['on', 'off']`
- `install.php`'s `modernui_generate_loader_js`: read `$settings['shell']`, emit `r.dataset.modernuiShell = "...";`
- `boot.ts` (shell): `if (doc.documentElement.dataset.modernuiShell === 'off') return;`
- `Theme.page`: add third radio fieldset between "Dashboard layout" and "Density":

```
┌─ Shell layout ──────────────────────────────┐
│  ⦿ Modern   ○ Stock                          │
│  Replace Unraid's top-nav with a left       │
│  sidebar and slim topbar. Master Disable    │
│  still turns off the whole theme.           │
└─────────────────────────────────────────────┘
```

Same `modernui_radio()` helper. Same `csrf_token` + urlencoded form-submit pattern as Phase 3.

## Architecture (files)

End-state — most changes are new files; minimal modifications to shared infrastructure.

| File | Action |
|---|---|
| `src/ts/shell/boot.ts` | create — entry point, gate, mount |
| `src/ts/shell/components/modernui-shell.ts` | create — root component (sidebar + topbar) |
| `src/ts/shell/components/shell-sidebar.ts` | create — sidebar with nav + status footer |
| `src/ts/shell/components/shell-topbar.ts` | create — topbar with breadcrumb + slots + bell + menu |
| `src/ts/shell/components/shell-nav-item.ts` | create — single nav row with active-state + collapse handling |
| `src/ts/shell/components/shell-status-row.ts` | create — single System Status row + popover |
| `src/ts/shell/components/shell-notification-bell.ts` | create — bell + popover, observes notifier feed |
| `src/ts/shell/components/shell-user-menu.ts` | create — user menu (About / Stock UI / Logout) |
| `src/ts/shell/nav-builder.ts` | create — curated + auto-discovery nav tree builder |
| `src/ts/shell/breadcrumb.ts` | create — pathname → label[] |
| `src/ts/shell/plugin-mirror.ts` | create — MutationObserver wrapper, registry-driven mirroring |
| `src/ts/shell/plugin-registry.json` | create — known plugin selectors + slots |
| `src/styles/shell-overlay.scss` | create — body class hides stock chrome; CSS-only |
| `src/ts/modernui.ts` | modify — call `shellBoot(document)` after dashboard boot |
| `package/include/save.php` | modify — whitelist `shell` key |
| `package/include/install.php` | modify — emit `data-modernui-shell` in loader.js |
| `package/Theme.page` | modify — add Shell layout fieldset |
| `tests/unit-php/save.test.php` | modify — assertions for `shell` key |
| `tests/unit-ts/shell/boot.test.ts` | create — `shellEnabled(doc)` gate tests |
| `tests/unit-ts/shell/nav-builder.test.ts` | create — curated + auto-discovery merge |
| `tests/unit-ts/shell/breadcrumb.test.ts` | create — pathname → breadcrumb segments |

## Testing

- **PHP** (`save.test.php`): four assertions for the `shell` key (on/off accepted, garbage rejected, default `on`). Same pattern as Phase 3.
- **TS unit** (Vitest + jsdom): focused tests for the pure helpers:
  - `shellEnabled(doc)` — gate logic
  - `buildNav(stockNavAnchors, curatedTree)` — hybrid merge
  - `pathToBreadcrumb(pathname, navTree)` — pathname → label array
  - No DOM-mounted shell tests — full shell verified via live box (matches Phase 3 conventions).
- **Live verification** on `https://<your-unraid-host>`: every page (Dashboard, Main, Shares, Users, Settings/*, Docker, VMs, Apps, Tools, Plugins) renders with the new shell; nav highlights active page; breadcrumb is accurate; bottom-bar plugin items appear in sidebar System Status with values that update; topbar plugin slot shows the apcupsd power button + any other recognized plugins.

## Acceptance gates

- `npm run build` + `npm run test:ts` (200+ tests) + `npm run test:php` (8+ tests) all green
- Manual verification on at least 5 different pages (Dashboard, Main, Shares, Settings/Theme, Docker)
- Notifications bell shows live updates from the existing notifier channel (verifying we didn't break it)
- Master Disable still works (turns off entire theme including the shell)
- Per-feature `shell=off` toggle reverts to Unraid's stock chrome on next reload while leaving the rest of the theme (tokens, dashboard rebuild) active
- Bottom-bar plugin items keep updating their values in the mirror (proving DOM hooks are preserved)

## Non-goals

- No new PHP shell-file overrides beyond Phase 1's `DefaultPageLayout.php` injection
- No persistent per-user state beyond the cfg keys we already have (`mode`, `density`, `sidebar`, `zebra`, `reduced_motion`, `dashboard`, plus new `shell`)
- No notification *write* path — bell is read-only mirror of Unraid's feed
- No in-app search — the search icon is a placeholder for v0.5+
- No new color tokens — reuse the v0.1 token set
- No PWA / installable manifest in v0.4

## Risks and tradeoffs

- **Plugin-registry maintenance**: every new community plugin we want to first-class needs a registry entry. Mitigation: unknowns still mirror, just without first-class styling — installing a new plugin doesn't break anything, it just appears in the generic Plugins sub-section until we add an entry.
- **Auto-discovery of unknown nav items** could surface admin-only or hidden entries from plugins. We accept this — if Unraid renders it in the top-nav, the user is allowed to see it.
- **MutationObserver overhead** for the two mirrors: same debounce pattern as Phase 3's dashboard observer (50ms), low GC pressure, runs only when something actually mutates.
- **Drawer mode on mobile** requires Lit re-render on resize cross-breakpoint. Use `ResizeObserver` against `<html>` to detect breakpoint changes, debounced.
- **Sidebar height on very short viewports** (<600px tall, rare): System Status footer might push above viewport bottom. Mitigation: footer becomes scrollable inside the sidebar at small heights.

## Out of scope (future phases)

- Per-page rebuilds beyond `/Dashboard` (Main, Docker, VMs, Users lists) — separate phases
- Search functionality
- Notification write actions (clear, dismiss-all)
- User-customizable nav (drag-to-reorder, hide entries)
- Multiple-theme support / theme marketplace
- i18n (English only initially)
