# Dashboard refinements: sidebar Network + collapsible Docker

**Date:** 2026-05-25
**Scope:** Two follow-up refinements to the Phase 3 dashboard rebuild
**Status:** Approved, ready for implementation plan

## Problem

After shipping the Phase 3 dashboard rebuild, two usability gaps remain:

1. **Network is buried in the scroll.** The Interface card lives in the "Network & Power" section of the main column, well below the fold. Users who want to keep an eye on inbound/outbound rates have to scroll. The Processor & Memory card is already pinned in a sticky sidebar — Network belongs alongside it as another always-visible "vitals" widget.

2. **Docker Containers dominates vertical space.** The Docker card renders folder labels, filter chips, and a wide tile grid for every container at all times. For a typical install with 10-20 containers it consumes a large portion of the "Workloads" section even when the user just wants to know "are my containers up?". The Disk Location card already solved a similar problem by collapsing detail into a `<details>` footer; Docker should follow that pattern but inverted — high-level summary up top, detail behind the expander.

## Solution

### 1. Move Network into the sticky sidebar

Pull the Interface widget out of the main column's "Network & Power" section and render it as its own section inside `aside.sidebar`, below the existing "Compute" section.

**Layout** (rendered by `md-dashboard.ts`):

```
aside.sidebar (position: sticky; top: 16px on >= 1400px viewports)
├── md-section label="Compute"   (only when a processor widget exists)
│   └── md-processor-card (with optional Memory companion)
└── md-section label="Network"   (only when an interface widget exists)
    └── md-interface-card

div.main
├── ... (Storage, Devices, Workloads sections unchanged)
└── md-section label="Power"     (renamed from "Network & Power"; renders only when UPS exists)
    └── md-ups-card
```

**Sticky behaviour**: the existing `position: sticky; top: 16px` on `.sidebar` already covers a multi-card sidebar — both cards scroll together as one pinned unit. No CSS change required.

**Empty-state behaviour**:
- `aside.sidebar` collapses out when neither processor nor interface widget exists (today it only collapses when no processor exists).
- The main column's section is renamed: when a UPS exists, render `<md-section label="Power">` containing only the UPS card. When no UPS exists, the section does not render. The old "Network & Power" label disappears entirely.

**No changes** to:
- `md-interface-card.ts` itself — the card renders identically; only its parent slot changes.
- `interface` extractor or any extractor tests.
- The 16-core/4-iface typical-case sidebar height is ~620-700px, comfortable on 1080p, tight on 1366×768. If real-world use surfaces sticky-overflow problems on small viewports we can add a compact variant later; not in scope now.

### 2. Collapsible Docker Containers

`md-docker-card.ts` adopts the `<details>` pattern from `md-disklocation-card.ts`. The existing folder/chips/tiles UI moves inside a `<details>` block that defaults to collapsed. The card's always-visible body becomes a new high-level summary.

**Always-visible summary**, replacing the current top of the card body:

- **Big total**: `${totalCount}` rendered with the same 32px tabular-numeric treatment as `md-processor-card`'s overall-load percent, suffixed with the word "containers" in the secondary text size.
- **Three (or four) counts**, each prefixed with a coloured dot:
  - `● ${started} started` — `--success`
  - `● ${stopped} stopped` — `--danger`
  - `● ${paused} paused` — `--warning`
  - `● ${unknown} unknown` — `--text-muted`, rendered only when `unknown > 0`
- **Stacked proportional bar**: same dimensions as `md-processor-card`'s `.overall-bar` (6px tall, full-radius pill, full width). Three (or four) coloured `<span>` segments sized to `(count / totalCount) * 100%`. Segments use the same tokens as the dots.

**Expander block**, beneath the summary:

- `<details>` element styled with the same chevron + summary-row treatment as `md-disklocation-card`'s "Storage details" expander.
- Summary label: "Show containers" — flips to "Hide containers" via the `[open]` CSS selector.
- Meta text on the right of the summary row (collapsed only): `${totalRunning} running`. When open the meta disappears via `:not([open])` selector to avoid duplicating info now visible in the bar.
- Inside: the **existing** filter chips + folder labels + container tile grid renders unchanged. No HTML restructuring inside the expander.
- Default state: `closed`. No localStorage persistence. Filter chip state persists across collapse/expand within the lifetime of the Lit element (it already lives in `@state`).

**State derivation**: counts are computed in `render()` from `state.folders[].containers[]` + `state.ungrouped[]`. `totalRunning` and `totalCount` already exist on `DockerState`; `stopped`, `paused`, `unknown` are derived inline. No changes to `DockerState`, the docker extractor, or any extractor tests.

**Empty state** (`totalCount === 0`): the big-total reads `0`, the count line and the stacked bar are not rendered (no zero-width segments, no empty bar track), and the expander does not render. The card collapses to just the header + a small body showing the zero — keeps the card present without empty chrome.

## Affected files

- `src/ts/dashboard/components/md-dashboard.ts` — move Interface card out of Network & Power, into sidebar; split `hasNetworkPower` into `hasNetwork` (sidebar) and `hasPower` (main).
- `src/ts/dashboard/components/md-docker-card.ts` — add summary block, wrap existing render output in `<details>`, add new CSS for summary stats / stacked bar / details chrome.
- Tests: a small number of new render assertions on `md-docker-card`'s summary counts and stacked bar; existing Docker card tests should pass unchanged (filters / tiles still render the same way inside the expander).

## Non-goals

- No changes to the Interface card's visual content or extractor.
- No new Docker data plumbed in (`unknown` count already derivable from extractor output).
- No localStorage persistence of expander or filter state.
- No compact "sidebar variant" of the Interface card. If sidebar overflow becomes a problem on small viewports we will revisit, not pre-optimise.
- No changes to other card components (Processor, Memory, GPU, etc.).

## Risks and tradeoffs

- **Sidebar height on small viewports**: Combined Processor & Memory + Network sidebar can reach ~700px. On a 1366×768 laptop with browser chrome the viewport is ~720px; the sticky sidebar would just barely fit. Mitigation: ship as-is; if reports come in, add the compact-Network sidebar variant later. Pinning is enabled only on `>= 1400px` viewports today, which already screens out the smallest laptops.
- **`<details>` styling quirks**: WebKit and Gecko render the disclosure triangle differently. The Disk Location card already overrides `summary::-webkit-details-marker { display: none }` and renders a custom chevron — Docker reuses the same approach.
- **Filter chip discoverability**: With the tile grid collapsed by default, the filter chips are also hidden until the user expands. This is intentional — the filters only make sense when looking at tiles. The summary counts already answer "how many running/stopped".

## Out of scope (future work)

- Settings-driven default expander state.
- Per-folder collapse inside the Docker expander.
- A "Restart all stopped" or similar action bar on the summary row.
- Compact Network card variant for narrow sidebars.
