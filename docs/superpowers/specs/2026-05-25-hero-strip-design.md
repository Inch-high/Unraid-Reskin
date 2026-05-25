# Dashboard hero strip

**Date:** 2026-05-25
**Scope:** Phase 3 Task 23 — implement the top-of-dashboard hero metrics strip
**Status:** Approved, ready for implementation plan

## Problem

After today's layout consolidation:
- **Compute** and **Network** live in a sticky sidebar (always visible).
- **Cache** (full detail) lives inside the Disk Location card's "Storage details" `<details>` expander, closed by default.
- **Docker container tiles** live inside `md-docker-card`'s own `<details>` expander, also closed by default.

The dashboard now opens fast and clean, but storage utilization and workload state are *one click* below the fold. A user scanning the page wants the headline numbers — "how full is the array?", "how many containers are running?", "is the UPS healthy?" — without expanding anything.

The original Phase 3 spec sketched a 5-card hero strip (Array · Cache · Compute · Power · Workloads). Today's sticky-sidebar layout makes the Compute hero redundant. This spec re-aligns the hero strip with the current layout: four cards, focused on the data that's *not* already on screen.

## Solution

### Cards

Four hero cards, in this order (left to right on wide viewports):

| # | Card | Big number | Sub-info | Visual | Renders only if |
|---|---|---|---|---|---|
| 1 | **Array** | `${usedTB} TB` (e.g. `92.2 TB`) | `${pct}% used · Parity ${status}` | 48×48 SVG capacity ring, accent-tinted | `array` widget exists with `usedTB` and `totalTB` non-null |
| 2 | **Cache** | `${used} GB|TB` (e.g. `392 GB`) | `${pct}% used · ${status.toUpperCase()}` | Same capacity ring | at least one `cache` widget exists with non-null totals |
| 3 | **Workloads** | `${dockerRunning} / ${dockerTotal}` (e.g. `31 / 43`) | `${vmRunning} of ${vmTotal} VM${plural} running` | Two state-dot rows: containers + VMs (max 12 dots per row, falls back to text if larger) | at least one of: `docker` widget with `totalCount > 0`, OR `vms` widget with `totalCount > 0` |
| 4 | **Power** | `${loadW} W` (e.g. `375 W`) | `UPS ${batteryPct}% · ${runtimeMin} min` | Battery rectangle + terminal cap, filled to battery %, colored green ≥30% / amber 15–30% / red <15% | `ups` widget exists |

**Per-card edge cases**:
- Array: if `usedTB` or `totalTB` is null, show `—` for the big number, omit the ring, skip the percentage sub-info, keep the card (so users know an array exists).
- Cache: when multiple pools exist, sum `usedGB` + `totalGB` across them; the click target is the *first* pool's card.
- Workloads: if Docker exists but VMs don't, drop the VM sub-info line; if VMs exist but no Docker, swap the big number to `${vmRunning} / ${vmTotal}` and drop the container dot row.
- Power: if UPS status is `unknown`, show `—` in place of all four numbers.

### Layout

The strip renders inside `md-dashboard.ts` between `<div class="content">` and `<div class="layout">` — full-width above the sticky sidebar + main grid. Sidebar's `position: sticky; top: 16px` continues to apply; its top edge sits below the hero strip.

**Sizing:**
- Height: ~140px per card on desktop. Strip is non-sticky; it scrolls away as the user moves down the page.
- Grid: `repeat(4, 1fr)` at ≥1200px, `repeat(2, 1fr)` at 768–1199px, `1fr` below 768px.
- Gap: 16px (matches existing section gap).
- Margin: 0 0 16px (sits flush above the section grid below).

Each hero card visually matches the existing `md-card` chrome (16px corner radius, surface bg, soft shadow). The header label is small-uppercase secondary text; the big number is 32px tabular-nums; the sub-info is 12px secondary; the visual sits on the right side.

### Click behavior

Every hero card is clickable. Clicking:

1. If `expanderTarget` is set, opens the target `<details>` (sets `.open = true`). No-op if already open.
2. On the next animation frame (so the just-opened expander has flowed into the layout), calls `scrollTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })`.

| Hero | scrollTarget | expanderTarget |
|---|---|---|
| Array | first `md-array-card` (inside Disk Location's shadow root) | `md-disklocation-card`'s `<details data-hero-expander="storage-details">` |
| Cache | first `md-cache-card` (inside Disk Location's shadow root) | same expander |
| Workloads | `md-docker-card` | `md-docker-card`'s `<details data-hero-expander="container-list">` |
| Power | `md-ups-card` | none |

**Cross-shadow reach:** The hero card lives two shadow-root levels deep: `<md-hero-card>` is inside `<md-hero-strip>`'s shadow root, which is inside `<modernui-dashboard>`'s shadow root. To find the destination card (a sibling of the strip), the click handler walks up two levels — `this.getRootNode().host.getRootNode()` resolves to `<modernui-dashboard>`'s shadow root — then `.querySelector('md-disklocation-card' | 'md-docker-card' | 'md-ups-card')` finds the target. From there, `.shadowRoot.querySelector('[data-hero-expander="storage-details"]')` (or `"container-list"`) finds the inner `<details>` to open. The two expander-bearing cards expose a `data-hero-expander` attribute on their `<details>` element so the hero doesn't have to couple to internal class names.

For visual feedback on hover the card raises its shadow elevation (matching the existing `md-card:hover` rule) and changes the cursor to pointer.

### Empty state

If none of the four cards qualify (no array, no cache, no docker/vms, no UPS), `<md-hero-strip>` renders nothing and takes zero vertical space — `md-dashboard.ts` falls through to its existing sidebar+main layout unchanged.

## Architecture

Two new files:

- `src/ts/dashboard/components/md-hero-card.ts` — Lit component for a single hero cell. Props: `label`, `bigText`, `subText`, `scrollTarget` (CSS selector), `expanderTarget` (CSS selector, optional). Slot for the visual (ring / battery / dot rows). Click handler implements the open-then-scroll behavior described above.
- `src/ts/dashboard/components/md-hero-strip.ts` — Container that owns the grid and the four card slots. Reads from `ArrayState`, `CacheState[]`, `DockerState`, `VmsState`, `UpsState` props passed in by the parent. Implements per-card visuals (capacity ring / battery / dot rows) as small inline SVG templates.

**Modifications to existing files:**

- `src/ts/dashboard/components/md-dashboard.ts` — import `md-hero-strip`, mount it at the top of `.content`, pass the relevant widget slices.
- `src/ts/dashboard/components/md-disklocation-card.ts` — add `data-hero-expander="storage-details"` to its existing `<details class="storage-details">` element.
- `src/ts/dashboard/components/md-docker-card.ts` — add `data-hero-expander="container-list"` to its existing `<details class="container-list">` element.

No changes to types, extractors, or tests.

## Non-goals

- No new widget data: hero cards are presentational over existing `WidgetState`.
- No `localStorage` persistence of any hero state.
- No expand-on-hover or other gesture-driven interactions — click only.
- No reordering / customization UI in v0.3. Card order and selection are hard-coded.
- No GPU or IPMI hero card. Those plugins are optional and adding them would require either conditional card slots (complicating the grid) or a different "broad 6-card" approach we explicitly rejected.
- No sparkline / chart inside any hero card. The visual budget is one ring, one battery, or one pair of dot rows per card.
- No keyboard navigation. Click is mouse / touch; the underlying detail cards are reachable via the existing scroll.

## Affected files

| File | Action |
|---|---|
| `src/ts/dashboard/components/md-hero-card.ts` | create |
| `src/ts/dashboard/components/md-hero-strip.ts` | create |
| `src/ts/dashboard/components/md-dashboard.ts` | modify — import and mount the strip |
| `src/ts/dashboard/components/md-disklocation-card.ts` | modify — add `data-hero-expander` attribute |
| `src/ts/dashboard/components/md-docker-card.ts` | modify — add `data-hero-expander` attribute |

Tests: no new test files; the existing 198-test suite must continue to pass.

## Risks and tradeoffs

- **Cross-shadow expander reach is fragile.** The hero relies on querying a sibling card's shadow root by tag name and a `data-hero-expander` attribute. If those tag names change (refactor) or the attribute is forgotten on a new expander, the click silently scrolls without opening. Mitigation: keep the selector list short (just two cards today), and document the `data-hero-expander` convention.
- **`scrollIntoView` smooth behavior is variable across browsers.** Modern Chromium and Firefox both honor it; on older WebKit it falls back to instant scroll. Acceptable.
- **No sparkline budget means Workloads hero is the least dynamic.** With static `${dockerRunning} / ${dockerTotal}` and dot rows, the card barely changes between renders. If users find it dull, we can revisit later with a 60s history bar (out of scope for v0.3).
- **140px × 4 cards eats vertical space above the fold.** On a 1080p viewport with browser chrome (~960px usable), the user sees: hero (140px) + section header + Disk Location card. The Compute sidebar still occupies the left column down to ~600px. This is a deliberate trade — the hero is a glance bar, not the detail.

## Out of scope (future work)

- Sparklines / mini-charts inside hero cards.
- User-configurable hero card selection or order.
- Keyboard shortcut to expand all expanders matching the hero strip's targets at once.
- Mobile-specific hero layout (the 1-column collapse is enough for v0.3).
