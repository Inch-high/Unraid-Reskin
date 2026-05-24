# Unraid ModernUI — Dashboard Rebuild Design Spec

**Status:** Approved for implementation planning
**Target:** Unraid 7.x (developed against 7.3.0)
**Date:** 2026-05-24
**Release:** v0.3.0

## Summary

Replace Unraid's stock `/Dashboard` rendering with a fundamentally different layout — a hero metrics strip on top, followed by themed grouped sections (Storage, Compute, Workloads, Network & Power, System, Plugins). Every widget and data source that currently appears stays; only the presentation and arrangement change. Built as a CSS/JS overlay using a `MutationObserver` against Unraid's hidden source DOM, so plugin contributions ride along automatically and the existing v0.1.1 fallback paths still revert to stock with one click.

## Goals

- Visibly modern, opinionated dashboard layout — large numbers up top, grouped detail below
- Preserve every widget currently on the dashboard (built-in + plugin-contributed)
- Live updates — same refresh cadence as Unraid's existing dashboard (~1 Hz)
- All four existing fallback paths still return to stock Unraid dashboard
- Plugin compatibility: first-class for the 4 plugins verified on the test box (disklocation, folder.view2, ipmi, gpustat); mirrored fallback for everything else
- Ship as v0.3.0, independently of Phase 3's sidebar work (v0.4.0)

## Non-goals

- Customizable widget arrangement (drag-rearrange, hide/show per widget) — deferred to Phase 4
- New data sources (cloud sync, external metrics) — out of scope
- Touch any other page than `/Dashboard*` — sidebar/topbar work is v0.4
- Direct nchan subscription — we observe the rendered DOM Unraid produces, not the raw JSON streams
- PHP changes — pure CSS/JS overlay
- Mobile-tier-1 fully responsive variant — Phase 4 polish; v0.3 ships desktop-first with usable collapse below 480 px

## Approach (chosen from three alternatives)

**DOM mirror with full re-render** — Unraid's `Dashboard.page` keeps rendering its existing `table.dashboard` and child `<tbody>` widgets. We hide that table via a body class, observe its mutations, extract structured state per widget, and render our own Lit-based component tree into the same content area.

Alternatives considered:

- *Direct nchan subscription*: rejected — would require reverse-engineering Unraid's data format and would not pick up plugin contributions (Disklocation, IPMI, GPU stats, folder.view2 don't push to the same streams).
- *PHP template fork*: rejected — would hard-fork `Dashboard.page` and break on every Unraid release; same rationale that rejected Approach C in Phase 1's spec.

DOM-mirror is the only approach that keeps Unraid as the data source of truth, automatically picks up plugin widgets, and reuses the v0.1.1 fallback architecture.

---

## 1. Architecture & overlay mechanism

A new JS bundle `modernui-dashboard.js` is loaded on every page via Phase 1's `loader.js` mechanism. On boot it:

1. **Page detection** — checks `window.location.pathname.match(/^\/Dashboard/)`. Bails on every other page (zero side effects).
2. **Wait for source** — if `table.dashboard` isn't in the DOM yet, attaches a bootstrap `MutationObserver` on `<body>` and waits up to 5 seconds. Falls back to no-op on timeout.
3. **Hide source** — adds the class `modernui-dashboard-active` to `<body>`. CSS in our stylesheet sets `body.modernui-dashboard-active div.frame > div.grid { display: none }`, hiding Unraid's whole dashboard tile grid. The legacy `<table class="dashboard">` remains in the DOM and its nchan subscribers keep updating it.
4. **Mount our shell** — appends `<modernui-dashboard>` to the same content area (`div.frame` parent). This is a Lit web component with its own Shadow DOM (style isolation).
5. **Wire the observer** — a `MutationObserver` watches the hidden `table.dashboard` for subtree changes. Each fire pushes through a debounced (50 ms trailing-edge) extraction pass.
6. **Extractors → store → view** — a registry of `(selector, extractor)` pairs reads each known widget into structured values. The values land in a tiny reactive store. Lit components subscribe and re-render only the bindings whose values changed.

**Tech choice — Lit 3** (~5 KB gzipped). Reasons: tiny footprint, native web-component model (matches the direction Unraid 7.x is going with `<unraid-header-os-version>`, etc.), efficient `lit-html` updates, fast iteration via `html\`...\`` templates. Added as a regular dependency, shipped inside the bundle.

**Why Shadow DOM**: isolates our dashboard CSS from Unraid's stylesheet so we don't fight `default-base.css` rules. Design tokens still flow in (CSS custom properties pierce shadow boundaries by default).

**File structure** (under `src/ts/dashboard/`):

```
dashboard/
├── boot.ts                  page-detect + mount entry point
├── source-observer.ts       MutationObserver wrapper, fires on widget changes
├── store.ts                 reactive state (simple pub/sub, ~50 LOC)
├── types.ts                 all widget state interfaces
├── extractors/
│   ├── index.ts             registry + dispatch
│   ├── identity.ts          HL15RACK / model / registration / uptime
│   ├── array.ts             ARRAY tbody → { used, total, disks[] }
│   ├── cache.ts
│   ├── parity.ts
│   ├── processor.ts         per-core CPU loads + temp
│   ├── system.ts            CPU / RAM / Boot / Log / Docker pies
│   ├── docker.ts            container categories + states (handles folder.view2)
│   ├── vms.ts
│   ├── shares.ts
│   ├── users.ts
│   ├── ups.ts
│   ├── ipmi.ts
│   ├── gpu.ts
│   ├── disklocation.ts
│   ├── interface.ts
│   ├── motherboard.ts
│   ├── unknown.ts           catch-all for unrecognized tbody siblings
│   └── __fixtures__/        captured tbody HTML snapshots for tests
└── components/              Lit components, one file per widget type
    ├── md-dashboard.ts      root <modernui-dashboard> shell
    ├── md-hero-strip.ts     top hero metrics
    ├── md-hero-card.ts      individual hero cell
    ├── md-section.ts        themed grouped section (Storage, Compute, …)
    ├── md-card.ts           generic card primitive (header + body slots)
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
    ├── md-identity-card.ts
    ├── md-motherboard-card.ts
    ├── md-shares-card.ts
    ├── md-users-card.ts
    ├── md-plugin-card.ts    mirrored / unknown tier
    └── md-sparkline.ts      shared sparkline subcomponent
```

`modernui-dashboard.js` is loaded on every page but exits-early on non-dashboard pages. ~30 KB on those pages — negligible.

---

## 2. Data flow & extractors

**Extractor contract** — pure functions, one per widget type:

```typescript
interface ExtractorContext {
  /** A single <tbody> node from the hidden table.dashboard */
  source: HTMLTableSectionElement;
  /** Plugin hint extracted from id="tbl<Plugin>Dash" or tbody.<class>, if any */
  hint?: string;
}

interface Extractor<T extends WidgetState> {
  /** Returns true if this extractor can read this tbody */
  match: (ctx: ExtractorContext) => boolean;
  /** Pulls structured values out; null = source malformed, render fallback */
  extract: (ctx: ExtractorContext) => T | null;
}
```

**Widget state shapes** — strongly typed, one interface per kind. Example:

```typescript
type WidgetKind =
  | 'identity' | 'array' | 'cache' | 'parity' | 'disklocation'
  | 'processor' | 'system' | 'gpu' | 'ipmi'
  | 'docker' | 'vms' | 'shares' | 'users'
  | 'ups' | 'interface' | 'motherboard'
  | 'unknown';

interface ArrayState {
  kind: 'array';
  status: 'started' | 'starting' | 'stopped';
  usedTB: number;
  totalTB: number;
  disks: Array<{
    name: string;            // "Disk 1", "Parity", ...
    state: 'active' | 'standby' | 'spinning-up' | 'unmounted';
    tempC: number | null;
    smart: 'healthy' | 'warning' | 'failed' | 'unknown';
    utilizationPct: number | null;
  }>;
}

// …one interface per WidgetKind in types.ts
```

**Store shape** — single map keyed by tbody id:

```typescript
interface DashboardStore {
  widgets: Map<string, WidgetState | UnknownWidget>;
  lastUpdate: number;
  subscribe(callback: () => void): () => void;
  notify(): void;
}

interface UnknownWidget {
  kind: 'unknown';
  id: string;            // tbody id or generated
  innerHTML: string;     // preserved verbatim
  hint: string;          // class name or plugin hint
}
```

**Update flow** (per MutationObserver fire):

1. Walk all `<tbody>` children of the hidden `<table class="dashboard">`
2. For each tbody, iterate the extractor registry; pick the first whose `match()` returns true
3. If none matches → wrap as `UnknownWidget` with raw `innerHTML`
4. Compare extracted state to current store value (shallow deep-equal). Skip if unchanged
5. Write changed values into the store; notify subscribers
6. Lit components re-render only the cells whose bound values changed

**Debouncing** — coalesced into a 50 ms trailing-edge batch so a burst of mutations (Unraid's nchan ticks at ~1 Hz but several tbodies update per tick) becomes one extraction pass.

**Initial extraction** — runs synchronously at boot before any observer firing, so the first render isn't a flicker of empty cards.

**Plugin handling** — three tiers:

| Tier | Behavior |
|---|---|
| **First-class** | Ship an extractor + a Lit card component. Plugin data lands in our themed UI. Initial set: built-in widgets + Disklocation, IPMI, GPU stats, folder.view2. |
| **Mirrored** | tbody recognized by hint (id/class) but no typed card yet. Renders inside `<md-plugin-card>` which projects the original `innerHTML` into our themed shell. |
| **Unknown** | Same as Mirrored, but title falls back to the tbody's id/class. Nothing silently dropped. |

The plugin registry (`extractors/index.ts`) is a single ordered array; adding a new known plugin = adding one entry + one component file.

**What we explicitly do not do**: parse nchan JSON directly. We rely on the rendered DOM as the source of truth. Trades a bit of overhead for huge plugin-compat wins.

---

## 3. Layout & widget catalog

Page structure (top → bottom):

```
┌──────────────────────────────────────────────────────────────┐
│  HERO STRIP — 5 metric cards, 1 row (wraps to 2-3 on narrow) │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                    │
│  │ARRY │ │CACHE│ │CPU  │ │PWR  │ │WORK │                    │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                    │
├──────────────────────────────────────────────────────────────┤
│  STORAGE                                                      │
│  [Array]  [Cache]  [Parity]  [Disk Location]                 │
├──────────────────────────────────────────────────────────────┤
│  COMPUTE                                                      │
│  [Processor]  [Memory]  [GPU]  [IPMI]                        │
├──────────────────────────────────────────────────────────────┤
│  WORKLOADS                                                    │
│  [Docker (wide)]                                              │
│  [VMs]                                                        │
├──────────────────────────────────────────────────────────────┤
│  NETWORK & POWER                                              │
│  [Interface]  [UPS]                                           │
├──────────────────────────────────────────────────────────────┤
│  SYSTEM                                                       │
│  [Identity]  [Motherboard]  [Shares]  [Users]                │
├──────────────────────────────────────────────────────────────┤
│  PLUGINS (conditional)                                        │
│  [Mirrored card 1]  [Mirrored card 2]  …                     │
└──────────────────────────────────────────────────────────────┘
```

Each section is `<md-section>` with a small uppercase label and a CSS Grid body (`grid-template-columns: repeat(auto-fill, minmax(340px, 1fr))`). Wide cards span all columns via `grid-column: 1 / -1`.

### Hero strip

| # | Card | Big number | Sub-info | Mini visual |
|---|---|---|---|---|
| 1 | **Array** | `92.1 TB / 144 TB` | `64% used · Parity valid` | Donut, accent-tinted |
| 2 | **Cache** | `504 GB / 5.7 TB` | `9% used · ONLINE` | Donut |
| 3 | **Compute** | `48 °C` (CPU temp) | `3% load · 16 cores` | 16-core load sparkbar |
| 4 | **Power** | `49 W` | `UPS 100% · 51 min` | Battery icon + bar |
| 5 | **Workloads** | `21 / 23` | `1 VM running` | Two state dots: containers + VMs |

Each hero card ~200 px tall, large numerals (32-40 px, semi-bold, tabular-nums). Click anywhere on the card → smooth-scroll to the corresponding section card:

| Hero card | Scrolls to |
|---|---|
| Array | `md-array-card` (Storage section) |
| Cache | `md-cache-card` (Storage section) |
| Compute | `md-processor-card` (Compute section) |
| Power | `md-ups-card` (Network & Power section) |
| Workloads | `md-docker-card` (Workloads section) |

### STORAGE

- **Array card** — total/used/% in header · primary visual: disk LED row (Parity, Parity 2, then 12 data disks colored by state) · per-disk expandable list: name · state · temp · SMART · utilization bar
- **Cache card** — same pattern as Array, fewer disks (4)
- **Parity card** — status pill (Valid / Running / Invalid / Disabled) · last check date · duration · errors found · scheduled check status
- **Disk Location card** — physical slot map (NVMe rail + HDD rail) — preserves disklocation plugin's grid, rendered with our tokens and larger squares

### COMPUTE

- **Processor card** — model · core count · total power · temp · two columns of per-core mini-bars (HT pairs) · 60 s overall load sparkline below
- **Memory card** — donut for total used · color-coded legend (System / VM / ZFS / Docker / Free) · Boot + Log + Docker filesystem mini-bars
- **GPU card** — model · VRAM bar · GPU-util sparkline · power · temperature · active apps count (renders only if gpustat plugin present)
- **IPMI card** — sensor list with colored orb + name + reading, grouped by type (Temps / Fans / Voltages) (renders only if ipmi plugin present)

### WORKLOADS

- **Docker card** (wide, spans full row) — header has running/total + filter chips (All / Running / Stopped) · grid of compact container tiles (icon + name + state dot) · grouped by folder.view2 categories if installed
- **VMs card** — list of VMs with state pill, CPU/RAM allocation, action buttons (start/stop/console — links to existing Unraid routes)

### NETWORK & POWER

- **Interface card** — bond/eth list · current ↓/↑ · 60 s throughput sparkline · MTU · mode
- **UPS card** — battery percentage as ring · status pill · load watts · runtime remaining · nominal power · transfer reason if recently switched

### SYSTEM

- **Identity card** — server name · clock (local time) · model · Unraid OS edition + version · uptime
- **Motherboard card** — vendor · model · BIOS version + date
- **Shares card** — count · public/private breakdown · top 5 by size with mini usage bars
- **Users card** — count · unprotected count · list with read/write counts

### PLUGINS (conditional)

Only renders if at least one mirrored/unknown widget exists. Cards titled by the plugin name (or tbody id), content = original `innerHTML` wrapped in our themed shell.

### Visual rules across all cards

- 16 px corner radius
- Header: 14-15 px semibold title + 12 px muted meta on a single line, with a tiny icon at left
- Body: 14 px content text, generous 16 px padding
- Big numbers: 32-40 px on hero, 24-28 px on detail cards, tabular-nums
- Semantic colors via existing tokens (`--success` / `--warning` / `--danger` / `--info`)
- Sparklines: 4 px line, accent color, no axes, ~60-90 s window
- Hover lift: card elevation level-1 → level-2, 120 ms transition
- Card click → no nav for v0.3 (except hero cards which scroll), keeps things predictable

---

## 4. Error states, fallbacks, edge cases

### Boot-time failures

| Condition | Behavior |
|---|---|
| Dashboard bundle fails to load (404 / network) | Phase 1's loader.js continues; user sees stock Unraid dashboard. No crash. |
| User not on `/Dashboard*` URL | `boot.ts` exits before any DOM touch. Zero side-effects on other pages. |
| `table.dashboard` not yet in DOM at boot | Bootstrap observer on `document.body`; mount when source appears. 5 s timeout → log warning, leave stock UI as-is. |
| User toggles theme off mid-session | Existing fallback paths apply — `?modernui=off` URL param short-circuits before any of our JS, the floating re-enable pill replaces it, SSH `disabled` flag works at next reload. |

### Per-widget failures

| Condition | Behavior |
|---|---|
| Extractor's `match()` returns false for a tbody | Falls through to next extractor; ultimately to `unknown.ts` → renders as mirrored card |
| Extractor throws while parsing | Caught at dispatch level; widget marked `kind: 'unknown'`, raw `innerHTML` preserved into a mirrored card. Error logged to console (`[modernui] extractor "array" threw:`). User still sees that widget's data. |
| Extracted state has missing fields | Cards render `—` for null fields, no error. Disk rows degrade gracefully. |
| Tbody disappears between updates | Observer fire removes that widget from store; component unmounts cleanly. |
| Tbody appears mid-session | Observer fire detects it; extractor runs; new card mounts. |
| Lit component render throws | Lit's error path replaces that subtree with a minimal `<md-error-card>` (title + "Render error — check console"). Other widgets keep working. |

### Visual edge cases

- **First paint** — every card renders an immediate skeleton (dimmed version of itself with `--text-muted` placeholders). Initial synchronous extraction populates real values within the first frame. No flash of empty boxes.
- **Reduced motion** — sparkline animations and hover-lift transitions respect `prefers-reduced-motion: reduce`. Data still updates; animations don't play.
- **Very narrow widths** (< 480 px) — hero strip wraps to 2-then-1 column; section grids collapse to single column. No horizontal scroll.
- **Very wide widths** (> 1920 px) — content max-width caps at 1440 px.
- **Print** — explicitly out-of-scope for v0.3; defer to Phase 4.

### Destructive actions in widget headers

Unraid's stock dashboard has action buttons on some tiles (`StopArray()`, `Sleep()`, `Reboot()`, `Shutdown()`, plus cog-icon settings shortcuts). Our cards mirror these:

- **Destructive actions** — call the same global JS functions Unraid defines (available on `window`). Same confirm dialog behavior via `swal()` (Phase 2's `dialogs.scss` already restyled).
- **Settings shortcuts** — link to the same destination URLs Unraid uses. No custom backend.
- **Refresh icons** — call Unraid's existing refresh handlers where defined; otherwise hidden (we observe live anyway).

No new backend endpoints. Every interactive control invokes an existing Unraid global or navigates to an existing route.

### The one cardinal rule

If our dashboard fails to render for any reason — bundle error, exception during init, all extractors throw — the user **still sees the stock Unraid dashboard** because we only hide it via CSS class on `<body>` after successful init. If init throws before that line, the stock dashboard remains visible. Belt-and-suspenders.

---

## 5. Performance budgets & testing

### Performance budgets

| Budget | Target |
|---|---|
| Dashboard JS bundle size (gzipped) | ≤ 30 KB |
| Initial mount → first useful paint | ≤ 100 ms |
| Per-update render time | ≤ 16 ms |
| Observer fire → state propagation | ≤ 50 ms |
| Memory footprint | ≤ 2 MB JS heap |

If any budget is exceeded measurably during dev, trim features or split the bundle by route — but at this scope all budgets are achievable.

### Testing layers

1. **Unit — extractors** *(primary test layer)*

Each extractor gets a real `<tbody>` HTML fixture captured from the live box (`tools/capture-fixtures.mjs` script SSH's in, fetches `/Dashboard`, writes one file per widget). Tests use Vitest + jsdom:

```typescript
import fixture from './__fixtures__/array-12disks-parity-valid.html?raw';

it('extracts 12 disks with parity status', () => {
  const tbody = parseHTML(fixture).querySelector('tbody')!;
  const result = arrayExtractor.extract({ source: tbody });
  expect(result?.kind).toBe('array');
  expect(result?.disks).toHaveLength(12);
  expect(result?.disks[0]).toMatchObject({ name: 'Parity', state: 'standby' });
  expect(result?.usedTB).toBeCloseTo(92.1, 1);
});
```

2. **Component smoke — Lit cards**

Light coverage. Per card, one test that renders with sample state and checks key text + structure. No pixel diffing.

3. **Integration — extend existing round-trip**

Phase 1's `tests/integration/install-uninstall.mjs` gets one additional assertion: after install, the live box serves `/Dashboard` without a 500 (server-side check; client-side JS-render verification waits for Playwright in Phase 5).

4. **Manual visual checklist** *(part of release task)*

User walks through after each deploy:
- Hero strip renders 5 cards with live numbers
- Each section header visible, cards in grid
- Sparklines animate (CPU load, network throughput)
- Hover lifts work (disabled if `prefers-reduced-motion`)
- Plugin widgets (Disklocation, IPMI, GPU, folder.view2) render first-class
- Removing a plugin (or never having it) doesn't break layout
- `?modernui=off` URL still reveals stock Unraid dashboard
- Light/dark mode both render correctly

### Out of scope for v0.3

- Cross-browser parity (target evergreen Chrome/Firefox/Safari/Edge)
- Performance with >50 widget tbodies (degenerate case)
- Plugin compatibility beyond the 4 known ones (handled by mirror fallback)

---

## 6. Release strategy & integration

### Version target

Ships as **v0.3.0**.

### Phase 3 split

The original Phase 3 plan was *left-sidebar shell replacement + plugin-safe footer proxy*. The dashboard rebuild is a sibling effort and ships as its own focused release:

- **v0.3.0** — Dashboard rebuild (this spec)
- **v0.4.0** — Left sidebar + footer proxy (the originally-scoped Phase 3 work)

Splitting reduces release risk; both are large enough that bundling would make regressions hard to pinpoint.

### Integration with Phase 1's fallback system

Rides on top of the existing fallback architecture — no new escape hatches needed:

| Escape | Effect on the new dashboard |
|---|---|
| `?modernui=off` URL param | `loader.js` short-circuits before loading anything. Body never gets `modernui-dashboard-active` class. Unraid's stock dashboard visible because we never hid it. |
| Settings → Theme → Disable theme | Same outcome — `loader.js` swaps to `re-enable.js` which doesn't load `modernui-dashboard.js`. |
| Floating re-enable pill | Same as above. |
| SSH `disabled` flag + reboot | `install.php` honors the flag on next boot; regenerates `loader.js` pointing at `re-enable.js`. |

### One new setting

Added to `Settings > Theme`: **Dashboard layout** — radio: `Modern` / `Stock`. Defaults to `Modern`. When set to `Stock`, our JS loads but `boot.ts` exits before mounting. Lets users keep the theme's tokens/buttons/tables but pin the dashboard to the original layout. Adds one entry to the Phase 1 `Theme.page` form + one key to `settings.cfg` + one entry to the validator's `$allowed` map.

### Plugin compatibility statement

`docs/compatibility.md` (Phase 1) gets updated rows:

```
| Plugin                          | Last tested | Status      | Notes                                                              |
|---------------------------------|-------------|-------------|--------------------------------------------------------------------|
| disklocation                    | 7.3.0       | first-class | Renders in Storage section as Disk Location card                   |
| folder.view2                    | 7.3.0       | first-class | Renders in Workloads section, container folder categories preserved |
| ipmi                            | 7.3.0       | first-class | Renders in Compute section as IPMI sensors card                    |
| gpustat                         | 7.3.0       | first-class | Renders in Compute section as GPU card                             |
| unassigned.devices              | 7.3.0       | mirrored    | Renders in Plugins section (typed extractor deferred to v0.4)      |
| Dynamix System Temperature/UPS  | —           | mirrored    | Augments built-in widgets; standalone tbody (if any) mirrored      |
| (any other contributing tbody)  | —           | mirrored    | Renders in Plugins section, HTML kept verbatim                     |
```

### Acceptance criteria for v0.3.0

1. `/Dashboard` renders the new hero strip + grouped sections layout
2. All 5 hero cards show live values within 100 ms of page load
3. All currently-visible widgets on the user's box render as first-class cards with live data — Array, Cache, Parity, Processor, Memory, GPU, IPMI, Docker (via folder.view2), VMs, Shares, Users, UPS, Interface, Identity, Motherboard, Disk Location
4. Each fallback path returns to stock dashboard cleanly
5. `Settings → Theme → Dashboard layout = Stock` makes `/Dashboard` render Unraid's original
6. Removing any plugin from the box → that card disappears, no JS error, no layout break
7. Integration test (`install-uninstall.mjs`) still passes byte-identically
8. Unit tests (extractor fixtures) pass — 1 fixture + 1 test per first-class extractor
9. CSS bundle remains ≤ 30 KB; dashboard JS bundle ≤ 30 KB gzipped
10. Light/dark mode both work, system-pref auto-detect still works
11. Browser console produces no errors during normal navigation

### Risks & mitigations

| Risk | Mitigation |
|---|---|
| Unraid release changes tbody class names or structure | Extractor `match()` returns false → falls to mirror tier. User loses styled card, still sees data. Update selectors on next release. |
| Plugin ships unusual DOM | Mirror tier renders untouched. Add typed extractor later. |
| Sparkline data overwhelm (very high mutation rate) | Observer debouncing caps re-render at 20 Hz. |
| Lit version drift / supply-chain risk | Pin to specific Lit 3.x version in `package.json`; audit on upgrade. |
