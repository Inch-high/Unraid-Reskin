# Phase 4.1: Shell mirror sources for Unraid 7.3 Vue DOM

**Date:** 2026-05-25
**Scope:** Update Phase 4's plugin-registry + DOM observer source selectors to match Unraid 7.3.0's Vue-based webGui. Ships as v0.4.0 (replacing v0.4.0-beta) once the four gaps below are closed.
**Status:** Approved (pending review)

## Problem

Phase 4 (v0.4.0-beta) shipped the visible shell — left sidebar with curated nav + active highlighting, 48px topbar with breadcrumb + user menu + bell + search, sidebar collapse toggle, responsive drawer. But it was designed against Unraid 7.x's *pre-Vue* DOM. Live verify against the user's HL15Rack (Unraid 7.3.0) on 2026-05-25 showed that 7.3 removed every legacy chrome element the spec targeted:

| Legacy element | Unraid 7.3 replacement |
|---|---|
| `<header class="tilebar">` | `<div id="header">` + `unraid-standalone-Header*` Vue components |
| `<nav class="tabs">` | `<div id="menu">` with `.nav-tile > .nav-item > a[href]` |
| `<div class="statusbar">` | `<footer>` with `.footer-left` (Array state) + `.footer-right` (Dynamix spans for temps, power, UPS) |
| `#notifier` | `unraid-standalone-CriticalNotifications-*` Vue component |
| `.array-state` | text inside `<footer .footer-left>` ("Array Started"/"Array Stopped") |

Phase 4's `shell-overlay.scss` got hot-fixed during live verify to hide `#header, #menu` in addition to the legacy selectors. Everything ELSE — the bottom-bar mirror, the topbar plugin mirror, the notification bell observer — is reading from sources that no longer exist on Unraid 7.3, so the corresponding UI surfaces render empty (or with generic "Plugin" labels for the bottom mirror because of the unknown-fallback path).

See [[unraid-73-vue-dom]] for the full DOM inventory captured during verify.

## Solution

Four targeted file changes that preserve all of Phase 4's component shapes and only swap selectors / source query strings.

### 1. Update `plugin-registry.json` selectors

The Phase 4 registry assumed `.dynamix-system-temp` / `.nut_status` / `.dynamix-system-stats-power` classes. Unraid 7.3 renders these as bare `<span>` elements inside `<footer .footer-right>` with icon FontAwesome classes — `.fa-thermometer` for temps, no class for UPS/power text. Strategy: drop class-based matching for bottom plugins and key off icon class + sibling-text patterns instead.

Proposed new `bottom` entries:

```json
"bottom": [
  {
    "name": "dynamix.system.temp",
    "selector": "span:has(> i.fa-thermometer), span:has(> font + small)",
    "slot": "cpu-temp",
    "label": "CPU temp"
  },
  {
    "name": "dynamix.ups",
    "selector": "span:has(> i.fa-battery-three-quarters), [class*='nut']",
    "slot": "ups",
    "label": "UPS"
  },
  {
    "name": "dynamix.system.stats",
    "selector": "span:has(> i.fa-flash), span:has(> i.fa-bolt)",
    "slot": "power",
    "label": "Power"
  }
]
```

`:has()` is supported in all modern Chromium versions (Unraid's WebUI is opened in real browsers — already targeting current Chrome/Firefox/Safari). Skip:has-incompatible browsers gracefully — `matchPlugin`'s try/catch already swallows invalid selector exceptions.

Topbar entries stay — Unraid 7.3's top-right action region is still being investigated. Tracked as an open item below.

### 2. Re-source the bottom-bar mirror

`src/ts/shell/components/shell-sidebar.ts` Task-18 wiring:

```ts
const bottomBar = document.querySelector('div.statusbar') || document.querySelector('footer');
```

Refine to specifically target the inner content containers and observe BOTH halves so the array indicator + plugin spans both flow into our mirror:

```ts
const bottomBar = document.querySelector('footer .footer-left, footer .footer-right')?.parentElement
  || document.querySelector('footer')
  || document.querySelector('div.statusbar');
```

The parent containing both halves is the `<footer>` itself; observing it with the existing `{ childList: true, subtree: true, characterData: true }` config catches both the Array Started transition AND the temp value ticks. The map step in `startMirror` already iterates `source.children`, so each footer half (left/right) gets matched independently — the left typically contains the Array state, the right contains the registry-matchable plugin spans.

### 3. Re-source the topbar plugin mirror

`src/ts/shell/components/shell-topbar.ts` Task-19 wiring assumes `header.tilebar .tilebar-icons`. Investigation needed: open Unraid 7.3 with apcupsd plugin installed (the user has it on HL15Rack) and identify the actual mount point for plugin-injected top-right action icons. Candidates from initial DOM survey:

- `#header > div.tile-header > .tile-header-right` (uses Tailwind utility classes)
- Inside an `unraid-standalone-Header*-vue` web component shadow root (may need to query the shadow)

Once located, update the selector to:

```ts
const tilebar = document.querySelector('#header [class*="tile-header-right"], unraid-header-action-icons, header.tilebar .tilebar-icons, header.tilebar .icons, header.tilebar');
```

Open question: if plugins inject into a Vue component's slot, the slot mount might not be observable from outside the shadow root. Fallback strategy: scan `document.querySelectorAll('a.apcupsd-power-button, [data-apcupsd]')` directly and clone those matches into the topbar slot regardless of where in the DOM they live.

### 4. Re-source the notification bell observer

`src/ts/shell/components/shell-notification-bell.ts` Task-15 wiring queries `#notifier` which doesn't exist in 7.3. The Vue replacement is `unraid-standalone-CriticalNotifications-*` (visible from the script-tag survey). Strategy:

```ts
const source = document.getElementById('notifier')
  || document.querySelector('unraid-standalone-criticalnotifications, [class*="CriticalNotifications"]')
  || document.querySelector('[data-notifications]')
  || document.body;
```

And update `_sync()` to look for the Vue component's badge element. Unraid's Vue toast/notification system probably uses a count attribute somewhere — needs the same kind of selector hunt as item 3.

### 5. Update `_readStockAnchors` to walk the new menu

`src/ts/shell/components/shell-sidebar.ts`:

```ts
const nav = document.querySelector('nav.tabs');
```

Becomes:

```ts
const nav = document.querySelector('#menu, nav.tabs');
```

The `#menu` selector picks up Unraid 7.3's `.nav-item > a[href]` anchors; the `nav.tabs` fallback preserves 7.x compatibility.

## Architecture (files)

| File | Action |
|---|---|
| `src/ts/shell/plugin-registry.json` | modify — swap class selectors for `:has()` icon selectors |
| `src/ts/shell/components/shell-sidebar.ts` | modify — re-source bottom-bar mirror + update _readStockAnchors |
| `src/ts/shell/components/shell-topbar.ts` | modify — re-source topbar plugin mirror once Vue header point is identified |
| `src/ts/shell/components/shell-notification-bell.ts` | modify — re-source notifier observer + update _sync selectors |
| `tests/unit-ts/shell/plugin-mirror.test.ts` | modify — add a test case for `:has()` selectors (will require jsdom 24+ compatibility check) |
| `package.json` | modify — bump version `0.4.0-beta` → `0.4.0` |
| `src/ts/shell/components/shell-user-menu.ts` | modify — update VERSION constant |
| `package/include/install.php` | no change |
| `package/Theme.page` | no change |
| `src/styles/shell-overlay.scss` | already has the chrome-hide fix from v0.4.0-beta hot-fix commit `bee84c0` |

## Testing

- **TS unit** — extend `plugin-mirror.test.ts` with a jsdom-realistic Unraid 7.3 footer fragment. Verify `matchPlugin` correctly identifies the temp/UPS/power spans by their icon children.
- **Live verification** on `https://<your-unraid-host>`: after each change, deploy via `npm run dev-mirror` and confirm:
  - Sidebar System Status footer shows distinct rows: Array (with started/stopped color dot), CPU temp (with first sensor value), UPS (with battery %), Power (with W draw)
  - Topbar plugin slot shows the apcupsd power button (clickable, triggers Unraid's original action)
  - Notification bell badge accurately reflects Unraid's actual unread count

## Acceptance gates

- `npm run build` + `npm run test:ts` (227+ tests) + `npm run test:php` (8+ tests) all green
- Sidebar footer renders the 4 expected status rows with non-generic labels (not "Plugin" fallback)
- Topbar plugin slot renders at least apcupsd
- Bell badge changes within 3s of triggering an Unraid notification via `/usr/local/emhttp/webGui/scripts/notify`
- All v0.4.0-beta verified behaviors continue to work (shell mounts, nav highlights, breadcrumb, URL escape hatch, Master Disable)

## Non-goals

- No new component shapes or features beyond v0.4.0-beta — purely selector swaps
- No support for Unraid versions prior to 7.0 (legacy DOM fallbacks stay but aren't actively tested)
- No SVG icon work (NavItem.icon field stays dormant — Phase 5)
- No notification write actions (bell is still read-only)

## Risks and tradeoffs

- **`:has()` selector support**: requires Chromium 105+ / Firefox 121+ / Safari 15.4+. Unraid users are typically on current browsers — flagged as a known constraint, not a blocker.
- **Vue component shadow roots**: if plugin items live inside `<unraid-standalone-*>` shadow DOM, our `document.querySelector` won't reach them. Mitigation: each component's tag name is known; we can walk `document.querySelectorAll('unraid-standalone-Header*')` and check `el.shadowRoot?.querySelector(...)` for each.
- **Cloned plugin buttons** — same caveat as v0.4.0-beta: `addEventListener` handlers don't survive `cloneNode(true)`. For apcupsd this works because the button uses `<a href>` navigation. Plugins that use JS-attached handlers will fail silently. Document as a known limitation in release notes.

## Out of scope (Phase 5+)

- Per-page rebuilds beyond `/Dashboard` (Main, Docker, VMs lists)
- In-app search
- User-customizable nav (drag-to-reorder)
- SVG icon system + icon mapping on NavItem
- Multiple-theme support
