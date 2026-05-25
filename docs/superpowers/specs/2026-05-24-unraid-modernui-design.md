# Unraid ModernUI — Design Spec

**Status:** Approved for implementation planning
**Target:** Unraid 7.x
**Date:** 2026-05-24

## Summary

A modern, flat, responsive theme for Unraid 7.x that replaces the legacy chrome (top nav + bottom status bar) with a TrueNAS-style left sidebar and a slim top action bar. Distributed as a standard `.plg` plugin. Supports dark + light modes, equal-priority desktop and mobile layouts, and a refined Unraid orange accent. Built around hard reversibility — one-click revert to stock Unraid UI at any time without uninstalling.

## Goals

- Replace Unraid 7.x's old-fashioned chrome with a clean, flat, responsive UI inspired by TrueNAS SCALE
- Ship as a real Unraid plugin (`.plg`) installable via Community Apps or URL
- Equal tier-1 support for desktop and mobile — Unraid's current UI is barely usable on phones
- Preserve compatibility with community plugins that contribute UI into the legacy footer (temps, UPS, stats)
- Survive Unraid point releases without bricking the webGui — safe-mode fallback when shell files change underneath us
- Provide an always-available one-click escape back to stock Unraid UI

## Non-goals

- Supporting Unraid 6.12 — different webGui generation, would double the work
- Replacing Unraid's core PHP logic — we only re-skin and restyle the shell
- Building our own dashboards or telemetry — we render what Unraid and existing plugins already produce
- Multi-language / i18n in v1 — English only initially (Unraid's own strings remain Unraid's)
- A theme marketplace or user-uploadable themes — single opinionated theme with minimal settings

## Approach (chosen from three alternatives)

**Hybrid shell override + CSS-driven page styling.** The plugin overrides only Unraid's page-shell PHP files (the includes that render header, sidebar/nav, footer) and ships a comprehensive CSS bundle plus targeted JS enhancements for the rest. Every replaced file is backed up at install and restored on uninstall.

Alternatives considered:

- *Pure CSS + JS overlay (no PHP changes)*: rejected — visible flash as the original UI paints then gets rewritten on every navigation, sidebar transformation is fragile, layout shifts hurt UX.
- *Full PHP template fork*: rejected — would break on every Unraid release including patch releases; effectively a fork of Unraid's webGui with severe ongoing maintenance cost.

The hybrid is the only approach that gives the TrueNAS-style sidebar shell *without* either the overlay's flicker or the fork's maintenance burden.

---

## 1. Architecture & install model

### Package layout

Distributed as a versioned `.txz` referenced by a `.plg` XML manifest hosted on GitHub releases. Extracted to `/usr/local/emhttp/plugins/unraid-modernui/`:

```
unraid-modernui/
├── event/                    Unraid lifecycle hooks (started, stopped, disks_mounted)
├── include/
│   ├── install.php           Back up originals, place overlays, wire CSS/JS
│   ├── uninstall.php         Restore originals from backups/, remove hooks
│   ├── upgrade.php           Detect Unraid version change, re-overlay or enter safe mode
│   ├── helpers.php           Shared utilities (settings.cfg read/write, hash compare)
│   └── save.php              Endpoint for the settings form
├── overlay/                  Mirror of paths we override in Unraid's tree
│   └── usr/local/emhttp/plugins/dynamix/include/
│       ├── DefaultPageLayout.php
│       ├── Wrappers.php
│       └── ...               (only shell files: header, nav, footer, layout wrapper)
├── theme/
│   ├── dist/                 Built modernui.css, modernui.js, icons.svg, plugin-registry.json
│   └── src/                  Sass + TS sources (built into dist/ at package time, not on the Unraid box)
├── pages/
│   └── Theme.page            Settings > Theme page (5 controls + fallback button)
├── backups/                  Populated at install with SHA-keyed originals of every replaced file
└── scripts/rc.modernui       init.d script — wires CSS/JS into Unraid's custom-CSS hook on boot
```

### Install flow

1. **Pre-flight**: assert Unraid 7.0+ via `version.ini`. If unsupported, abort with a clear `.plg` install error.
2. **Extract** the tarball.
3. **`started` event** triggers `install.php`:
   1. For each file in `overlay/`, compute SHA256 of the existing upstream file and store both the hash and the original content under `backups/<sha>/`.
   2. Atomically copy overlay files into Unraid's tree (`cp` then `mv`, not symlinks — symlinks are wiped by Unraid flash updates).
   3. Append our `modernui.css` and `modernui.js` references to Unraid's existing custom-CSS hook in `dynamix.cfg`.
4. Force webGui reload (Unraid serves a one-time reload directive).

### Uninstall flow

`stopped` event runs `uninstall.php`:
1. Restore every file under `backups/` to its original location.
2. Remove our entries from `dynamix.cfg`.
3. Delete the plugin directory.

End state: byte-identical to a system that never had the plugin installed.

### Unraid-upgrade safety (Approach A's main risk)

The `disks_mounted` event compares each backed-up file's SHA against the current upstream version on the system. If upstream changed:

1. Plugin enters **safe mode**:
   - Shell overrides are skipped (originals stay in place)
   - CSS-only theme remains applied (it's resilient to most DOM changes)
   - Sidebar features are disabled; stock Unraid nav renders
2. A dashboard banner appears: "Theme compatibility update needed — running in safe mode. Click for details."
3. The user can disable the plugin entirely or wait for an updated release.

### Reversibility

Three independent escape hatches, all converging on the same `disabled` flag:

1. **In-theme toggle** — `Settings > Theme > Disable theme` button. Writes the flag, reloads, stock UI returns immediately.
2. **Floating re-enable pill** — when disabled, the plugin still injects a small bottom-right pill: "Modern UI is off — click to enable". Lets the user toggle back without remembering the settings URL.
3. **URL parameter override** — `?modernui=off` on any page forces stock UI for that page load, *short-circuited before our CSS/JS load* so a broken bundle can't prevent fallback.
4. **SSH escape hatch** — `touch /boot/config/plugins/unraid-modernui/disabled` then reboot returns stock UI even if the webGui is unreachable.

These exist because the user develops directly against a production Unraid install.

---

## 2. Visual design system

All visual properties are CSS custom properties. Switching mode = swapping a `data-theme` attribute on `<html>`. No JS color math, no FOUC.

### Color tokens

**Dark mode** (default; listens to `prefers-color-scheme`):

| Token | Value | Usage |
|---|---|---|
| `--bg-base` | `#0f1419` | Page background |
| `--bg-surface` | `#161c23` | Cards |
| `--bg-elevated` | `#1e252e` | Modals, popovers, hover states |
| `--border-subtle` | `#232b35` | Internal dividers |
| `--border-default` | `#2d3744` | Card/input outlines |
| `--text-primary` | `#e5e9ef` | Body text |
| `--text-secondary` | `#9aa4b2` | Labels, helper text |
| `--text-muted` | `#6b7280` | Disabled, placeholder |
| `--accent` | `#ff8c2f` | Primary actions, links, focus |
| `--accent-hover` | `#ff9e4a` | Hover state |
| `--accent-muted` | `rgba(255,140,47,0.15)` | Focus rings, accent backgrounds |
| `--success` | `#22c55e` | Array started, container running |
| `--warning` | `#f59e0b` | Spin-up, attention needed |
| `--danger` | `#ef4444` | Errors, destructive actions |
| `--info` | `#3b82f6` | Informational |

**Light mode** mirrors with bg `#ffffff` / surface `#f8f9fb`, accent darkened to `#e8731c` (passes WCAG AA on white), text `#0f1419` → `#4a5160` → `#8b94a3`.

### Typography

- Stack: `-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", Inter, system-ui, sans-serif`
- Mono: `ui-monospace, "JetBrains Mono", "SF Mono", Consolas, monospace`
- Modular scale, ratio 1.125, root 14px: `xs 12 · sm 13 · base 14 · md 16 · lg 18 · xl 20 · 2xl 24 · 3xl 30`
- Weights: 400 (body), 500 (UI labels), 600 (headings/emphasis). No 700.
- Emphasis without bold: uppercase + 0.04em letter-spacing on small uppercase labels (very flat-modern feel)

### Spacing (4px base scale)

`1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64`. Used for padding, margin, gap — no arbitrary values in components.

### Radii

`xs 4` (chips), `sm 6` (buttons/inputs), `md 8` (cards), `lg 12` (modals), `full` (pills/avatars).

### Elevation

- *Light mode* uses subtle shadows: `xs/sm/md/lg` at low rgba opacity
- *Dark mode is flat* — no shadows; uses `--border-subtle` for separation
- Universal focus ring: `0 0 0 3px var(--accent-muted)` — accessibility baseline

### Density (user-configurable)

- *Comfortable* (default): 14px text, 12px row padding
- *Compact*: 13px text, 8px row padding — for users with many disks/containers

### Motion

`--duration-fast: 120ms`, `--duration-base: 180ms`, `--duration-slow: 240ms` with `cubic-bezier(0.2, 0, 0, 1)`. All transitions respect `prefers-reduced-motion`.

### Implementation

- Single Sass source tree → built CSS with `:root { ... }` and `[data-theme="light"] { ... }` blocks
- Token catalog lives in `theme/src/tokens.scss` — one file, the source of truth
- Components reference tokens only, never raw values

---

## 3. Layout & shell

### Zones

Three-zone layout, no bottom bar:

```
┌─────────────────────────────────────────────────────────────┐
│ SIDEBAR (240px)         │  TOPBAR (48px)                    │
│                         │  Breadcrumb · Page actions · 🔔 · 👤 │
│ [logo]  Tower           ├───────────────────────────────────┤
│                         │                                   │
│ ▸ Dashboard             │                                   │
│ ▾ Storage               │                                   │
│   · Array               │                                   │
│   · Shares              │   PAGE CONTENT                    │
│   · Pools               │   (max-width 1440px, fluid below) │
│ ▸ Docker                │                                   │
│ ▸ VMs                   │                                   │
│ ▸ Users                 │                                   │
│ ▸ Settings              │                                   │
│ ▸ Tools                 │                                   │
│                         │                                   │
│ ─── SYSTEM STATUS ───   │                                   │
│ ● Array Started         │                                   │
│ 🌡 CPU 47°C (avg)        │                                   │
│ ⚡ 241 W                  │                                   │
│ 🔋 UPS 100%              │                                   │
└─────────────────────────────────────────────────────────────┘
```

### Sidebar (240px expanded, 64px collapsed)

- **Header**: small Unraid logo + server name (`Tower`) — clickable, navigates to dashboard
- **Nav**: section tree with sub-items, collapsible groups, current page highlighted with a thin left accent bar (not a filled background — keeps the flat aesthetic)
- **System status footer** (pinned, always visible):
  - Array state with colored dot — green `Started` / amber `Starting` / red `Stopped`
  - CPU temp rolled up to a single average; hover/tap reveals per-core in a popover
  - Power draw — `241 W` (peak in the popover)
  - UPS battery % + on-line/on-battery (only renders if a UPS plugin is configured)
  - Each row is a button that opens a popover with detail + a link to the relevant settings page
- **Collapse toggle** at the bottom — collapsed state shows icons only, hover-out popovers reveal labels

### Topbar (48px)

- **Left**: breadcrumb (e.g. `Storage / Shares / appdata`)
- **Right**: page-level action buttons · notification bell · user menu (About, Logout)
- No copyright/manual text in chrome — both moved into the user menu's About panel

### Plugin-safe footer proxy

Unraid's bottom-bar items (CPU temps, UPS, stats) come from third-party plugins like **Dynamix System Temperature**, **Dynamix System Statistics**, and **Dynamix UPS**. The theme does *not* delete the legacy footer container — it hides it and proxies its contents:

1. The legacy footer DOM container stays in the page, `display: none`.
2. `modernui.js` attaches a `MutationObserver` to it on load.
3. When a child node appears or updates:
   - **Recognized plugins** (matched by class/id from `plugin-registry.json`) render with proper styling in the sidebar's System Status footer.
   - **Unknown contributors** are mirrored into a generic "Plugins" sub-section of the sidebar status footer — their inner HTML is preserved so they keep updating via their own polling logic.
4. The legacy footer keeps receiving updates from plugin code (we never modify it); the observer fires; the sidebar mirror updates in real time.

The plugin registry is a JSON data file — new community plugins can be added without changing JS code.

### Responsive behavior (desktop and mobile both tier-1)

| Breakpoint | Layout |
|---|---|
| `≥1280px` | Sidebar expanded, topbar full |
| `960–1279px` | Sidebar collapsed-to-icons by default (user can pin open) |
| `640–959px` (tablet) | Sidebar becomes a slide-over drawer, hamburger in topbar |
| `<640px` (phone) | Same drawer; topbar collapses breadcrumb into a back-arrow + page title; system status moves into the drawer footer |

On mobile, pages with sub-tabs (Settings, Tools) gain a horizontal scrolling sub-tab strip below the topbar — better thumb reach than top-aligned tabs.

### Page content area

- Max-width 1440px centered on huge monitors (anything wider is wasted whitespace)
- Fluid below 1440px
- Consistent 24 / 16 / 12 px padding at desktop / tablet / phone
- Uniform page header: title (h1, lg) + optional description (sm, muted) + right-aligned action buttons

---

## 4. Component patterns

All composed from the tokens in §2.

**Cards**: single 1px `--border-default`, `--bg-surface`, `--radius-md`, 16/24px padding. Optional header with title + actions, divided from body by `--border-subtle`. No shadows on dark; subtle `--shadow-xs` on light.

**Tables**: sticky header on `--bg-elevated`, semibold sm text. Hover lifts row to `--bg-elevated`. Zebra-striping off by default (user-toggleable). Sortable columns, multi-select via leading checkbox, row actions menu. **Mobile transform**: at `<640px`, each row collapses to a card with key/value pairs stacked.

**Forms**: labels above inputs (familiar, accessible, no animation overhead). Inputs 36px (comfortable) / 32px (compact), 1px border, `--radius-sm`, focus ring `--accent-muted`. Helper text below in sm `--text-secondary`; error text replaces helper in `--danger`. Field groups in cards with headings; long forms broken into sections.

**Buttons**:
- *Primary*: filled `--accent`, white text
- *Secondary*: 1px outline `--border-default`
- *Ghost*: text only, hover gets `--bg-elevated`
- *Danger*: filled `--danger` (destructive only)
- All 36/32 px height, 12px horizontal padding, `--radius-sm`. No gradients, no inner shadows. Icon-only variant is 36px square.

**Badges**: pill (`--radius-full`), 11px semibold uppercase. Semantic backgrounds at 15% opacity + matching text color. Used for array status, container state, disk health, share security.

**Toggles**: 36×20 px pill switch, accent fill when on, 180ms slide. Paired with label + optional helper. Replaces nearly all boolean checkboxes Unraid currently uses.

**Dialogs**: backdrop `rgba(0,0,0,0.4)` + 4px `backdrop-filter` blur (with non-blur fallback). Centered card max-width 480 (confirmation) / 640 (form) / 960 (large editor). Header + body + right-aligned footer actions. Mobile: full-screen sheet sliding from the bottom with drag handle.

**Toasts**: top-right stack on desktop, top-center on mobile. Slide+fade in 180ms, auto-dismiss 6s, manual close. Semantic color on left border (4px stripe), neutral background. Replaces `swal`-style modals for non-blocking messages. Notification bell in topbar shows persistent history.

**Progress bars**: 4px thin, accent-colored, full radius. Used for parity check, disk fill %, mover progress. Indeterminate variant: animated gradient sweep.

**Universal states** (empty / loading / error):
- *Empty*: muted icon + heading + description + optional primary action
- *Loading*: skeleton blocks at the same dimensions as real content (no spinner overlays)
- *Error*: same as empty, danger-tinted icon, with a "Retry" action

**Icons**: single inline SVG sprite (~80 Lucide-style line icons, 1.5px stroke, 16/20/24px sizes). No emoji, no icon font.

---

## 5. Settings, state & error handling

### Settings page (`Settings > Theme`, rendered from `Theme.page`)

| Setting | Type | Default | Effect |
|---|---|---|---|
| Color mode | Radio: System / Dark / Light | System | Sets `<html data-theme>` |
| Density | Radio: Comfortable / Compact | Comfortable | Sets `<html data-density>` |
| Sidebar default | Radio: Expanded / Collapsed | Expanded | Initial state at page load |
| Table zebra stripes | Toggle | Off | Adds `.zebra` class to tables |
| Reduced motion | Toggle | Auto (system) | Honors `prefers-reduced-motion` by default |

Below the form:
- **Disable theme** button — writes `disabled` flag, reloads, returns to stock Unraid UI immediately. Plugin remains installed; floating re-enable pill appears.
- **About** section — version, GitHub link, the Unraid copyright/manual links that used to live in the footer.

### State storage

Settings persisted to `/boot/config/plugins/unraid-modernui/settings.cfg` — plain `key=value`, Unraid's standard config format. On the USB flash, so it survives reboots and is included in Unraid's flash backups.

Read/write via `include/helpers.php`. The settings form posts to `include/save.php` which validates and writes.

### Data flow at page load

```
Browser request
  ↓
Unraid PHP renders page (our overridden DefaultPageLayout.php)
  ↓
PHP reads settings.cfg → outputs <html data-theme="..." data-density="...">
  ↓
modernui.css applies tokens conditionally on those data-attributes (no FOUC)
  ↓
modernui.js boots:
  • attaches MutationObserver to legacy footer (plugin proxy)
  • wires sidebar collapse + drawer
  • initializes responsive table-to-card transforms
  • listens for prefers-color-scheme changes (if mode=System)
  • injects floating "Enable Modern UI" pill if disabled flag is set
```

Theme data-attributes are written in the initial HTML response, not by JS — correct theme paints on first frame.

### Error handling matrix

| Failure | Behavior |
|---|---|
| Unraid version too old at install | `.plg` install aborts with clear message; no files placed |
| Unraid update changed a shell file (checksum mismatch) | Safe mode on next boot: shell overrides skipped, CSS-only theme remains, dashboard banner shows compatibility update needed |
| `settings.cfg` corrupted/missing | Falls back to defaults silently; rewrites file on next save |
| Unknown plugin contributes to legacy footer | Mirrored generically — never silently dropped |
| Recognized plugin removes its DOM node | Sidebar mirror removes its node via the same MutationObserver |
| JS runtime error | Top-level `window.onerror` logs to console + emits a one-time toast; CSS theme remains intact (independent of JS) |
| User locked out by broken UI | URL param `?modernui=off` works at any page; SSH `touch disabled` works at boot |
| User wants to bail without uninstalling | In-theme Disable button → instant stock UI; floating pill re-enables |

### Cardinal rules the design enforces

1. **Never block Unraid's webGui from rendering.** CSS-only fallback must always paint.
2. **Never destructively modify Unraid or plugin DOM.** Hide and observe — don't delete.
3. **Every shell file change is reversible.** Hash-keyed backups, atomic restore.
4. **Reversibility is always one click or one URL away.** No SSH required for normal use.

---

## 6. Testing, plugin compatibility & releases

### Local development

- Source in a single repo with `theme/src/` (Sass + TS) building into `theme/dist/`
- Build = `npm run build` (Vite for TS, Dart Sass for styles)
- `dev-mirror` script rsyncs the built plugin to the test Unraid box over SSH, runs `installplg`, refreshes — full round-trip ~10s

### Test rig

The user develops against their production Unraid install. In addition, a dedicated Unraid 7.x VM (KVM or VirtualBox) provides a smoke-test rig for destructive testing:
- 3-4 simulated disks
- A couple of shares
- Docker enabled with 5+ containers
- A UPS simulator
- Installed plugins: **Dynamix System Temperature**, **Dynamix System Statistics**, **Dynamix UPS** (the three big plugin-footer contributors)

### Manual test matrix (run before each release)

| Surface | Cases |
|---|---|
| Install/uninstall | Fresh install · uninstall restores originals · disable flag works · reinstall over existing |
| Pages | Dashboard · Main · Shares · Users · Docker · VMs · Settings (every subpage) · Tools (every subpage) · Plugins · Logs |
| Plugin proxy | Each Dynamix plugin renders in sidebar · unknown plugin gracefully mirrored · plugin removed mid-session disappears from sidebar |
| Responsive | 1920 / 1440 / 1024 / 768 / 414 / 360 widths — all major pages |
| Color modes | Dark default · light toggle · system mode switching live · all three across all major pages |
| State | Sidebar collapse persists · density change re-renders · settings.cfg survives reboot |
| Fallback toggles | In-theme Disable button · floating pill re-enables · `?modernui=off` URL works · `disabled` flag respected on boot |
| Failure modes | Safe mode triggers on synthetic shell file change · uninstall is fully reversible · broken JS bundle doesn't block fallback |

### Visual regression

Playwright runs against the test VM, capturing screenshots of every major page at 3 widths × 2 color modes = 6 variants per page. Diffs against committed baselines, fails CI on >0.5% pixel delta. Baselines updated by PR review, never automatically.

### Plugin compatibility matrix

Versioned in `docs/compatibility.md`:
- Plugin name · last-tested version · status (first-class / generic-mirrored / known-broken)
- Goal: every plugin in Unraid's official Community Apps "Dynamix" namespace is first-class on day one
- "Known-broken" list is public — community can PR fixes or report issues

### Releases

Semver `MAJOR.MINOR.PATCH`:
- **PATCH**: CSS-only tweaks, plugin registry additions, copy fixes
- **MINOR**: new components, new settings, sidebar improvements, new Unraid version range added
- **MAJOR**: shell-override breaking changes (e.g., dropping support for an Unraid version)

Each release pins a **tested-against Unraid version range** in the `.plg` `<UNRAID>` field — install aborts cleanly outside the range and points users at a newer build.

### Browser support

- Modern evergreen browsers (Chrome / Edge / Firefox / Safari, last 2 versions)
- `backdrop-filter` and `:has()` used with progressive enhancement (graceful fallbacks)
- No IE, no legacy Edge

---

## Open questions for implementation planning

(Surface during writing-plans, not blocking spec approval.)

- Exact list of shell PHP files in Unraid 7.x that need overriding — requires reading the install
- Specific selectors/classes used by each Dynamix plugin's footer contribution — verified against the test rig
- Whether Unraid 7.x's newer web components (any pages already migrated to Svelte/Lit) need separate styling rules
- Exact location of Unraid's "custom CSS injection" hook in 7.x — may have moved from 6.12

## Acceptance criteria for v0.1 release

1. Installs cleanly via `.plg` URL on Unraid 7.x; uninstalls byte-identically to a never-installed state
2. Replaces top nav with left sidebar across all default Unraid pages (Main, Shares, Users, Docker, VMs, Settings, Tools, Plugins, Logs)
3. Dark + light modes both render every page correctly, switchable via Settings > Theme and via system preference
4. All three big plugin-footer contributors (Dynamix System Temperature, System Statistics, UPS) render in the sidebar's System Status footer
5. Every page works at 1920 / 1440 / 1024 / 768 / 414 px widths
6. All four fallback paths work: in-theme Disable button · floating re-enable pill · `?modernui=off` URL · `disabled` flag file
7. Safe mode triggers correctly when a tracked shell file's SHA changes underneath the plugin
