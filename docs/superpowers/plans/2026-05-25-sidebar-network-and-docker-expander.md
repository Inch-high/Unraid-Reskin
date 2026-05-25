# Sidebar Network + collapsible Docker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the Network (Interface) card into the sticky sidebar under Processor & Memory, and convert the Docker Containers card to a collapsed-by-default summary + `<details>` expander matching the Disk Location pattern.

**Architecture:** Two isolated component changes. `md-dashboard.ts` re-slots the Interface card from the main column's "Network & Power" section into a new "Network" section inside `aside.sidebar`, and renames the residual main-column section to "Power". `md-docker-card.ts` adds a high-level summary block (big total + dot-prefixed state counts + stacked proportional bar) above its existing render output, then wraps the existing filter chips + folder grid + ungrouped grid inside a `<details>` element styled with the same chevron/summary chrome as `md-disklocation-card.ts`'s "Storage details" footer.

**Tech Stack:** Lit 3 web components (no new deps); existing Vite-based build (`tools/build.mjs`); Vitest + jsdom for the extractor suite that must continue to pass; manual verification on the user's live Unraid server.

---

## File Structure

End-state — only two source files change. No new files, no deletes.

```
src/ts/dashboard/components/
├── md-dashboard.ts            modified: move Interface to sidebar, split Network & Power
└── md-docker-card.ts          modified: summary block + <details> wrapper

docs/superpowers/
├── specs/2026-05-25-sidebar-network-and-docker-expander-design.md   (already exists)
└── plans/2026-05-25-sidebar-network-and-docker-expander.md           (this file)
```

**Responsibility split (unchanged):**

- `md-dashboard.ts` owns the section/layout assembly; cards still come from their existing component files.
- `md-docker-card.ts` owns its own internal expander state — no new shared state, no `localStorage`.
- The Interface card (`md-interface-card.ts`) is untouched; only its parent slot changes.
- `DockerState`/`DockerContainer` types in `types.ts` are untouched; new counts are derived in `render()`.

---

## Plan-Wide Conventions

**No new component tests.** The project's existing test pattern is extractor-level only (under `tests/unit-ts/dashboard/extractors/`). No `md-*-card.test.ts` files exist. Following the existing pattern: we verify these changes by

1. `npm run build` — TypeScript type-check + bundle pass
2. `npm run test:ts` — existing 198-test extractor suite must remain green
3. Manual verification on the user's live Unraid server (per the testing-on-live-install convention)

**Commits:**

- One commit per task once `build` + `test:ts` are both green.
- Conventional Commits style, matching the recent dashboard work:
  - `feat(dashboard): move Network card into sticky sidebar`
  - `feat(dashboard): collapsible Docker card with high-level summary`

**Live verification rhythm:**

After each commit, deploy by rebuilding to the live Unraid server (the user's existing dev-mirror or manual copy) and refreshing `/Dashboard`. Each task ends with a checklist of behaviors to confirm visually.

**Token discipline:**

Reuse existing tokens — `--success` (started/active), `--danger` (stopped), `--warning` (paused), `--text-muted` (unknown), `--mui-accent`, `--border-subtle`, `--bg-surface`, `--radius-full`. Do not introduce new tokens.

---

## Task 1: Move Network card into the sticky sidebar

**Files:**
- Modify: `src/ts/dashboard/components/md-dashboard.ts`

- [ ] **Step 1: Edit the `render()` derivations**

Open `src/ts/dashboard/components/md-dashboard.ts`. Around line 139 (the block that defines `hasNetworkPower`), replace this block:

```typescript
    const hasStorage = arrays.length + caches.length + parities.length + disklocations.length > 0;
    const hasCompute = gpus.length + ipmis.length + (processors.length === 0 && memories.length > 0 ? memories.length : 0) > 0;
    const hasWorkloads = dockers.length + vms.length > 0;
    const hasNetworkPower = interfaces.length + upses.length > 0;
    const hasSystem = identities.length + motherboards.length + shares.length + users.length > 0;
    const hasSidebarHero = processors.length > 0;
```

with:

```typescript
    const hasStorage = arrays.length + caches.length + parities.length + disklocations.length > 0;
    const hasCompute = gpus.length + ipmis.length + (processors.length === 0 && memories.length > 0 ? memories.length : 0) > 0;
    const hasWorkloads = dockers.length + vms.length > 0;
    const hasNetwork = interfaces.length > 0;
    const hasPower = upses.length > 0;
    const hasSystem = identities.length + motherboards.length + shares.length + users.length > 0;
    const hasSidebarHero = processors.length > 0;
```

- [ ] **Step 2: Add the Network section to the sidebar**

In the same file, locate the `<aside class="sidebar">` block (around line 146) and replace it with:

```typescript
          <aside class="sidebar">
            ${hasSidebarHero ? html`
              <md-section label="Compute">
                <md-processor-card
                  .state=${processors[0]}
                  .memoryState=${memories[0] ?? null}
                ></md-processor-card>
              </md-section>
            ` : ''}
            ${hasNetwork ? html`
              <md-section label="Network">
                ${interfaces.map((s) => html`<md-interface-card .state=${s}></md-interface-card>`)}
              </md-section>
            ` : ''}
          </aside>
```

- [ ] **Step 3: Remove Interface from the main column, rename to "Power"**

In the same file, replace the `${hasNetworkPower ? ... : ''}` block in the `.main` div (around lines 187-192) with:

```typescript
            ${hasPower ? html`
              <md-section label="Power">
                ${upses.map((s) => html`<md-ups-card .state=${s}></md-ups-card>`)}
              </md-section>
            ` : ''}
```

- [ ] **Step 4: Build to verify it compiles**

Run via PowerShell:

```powershell
npm run build
```

Expected: build succeeds. No TypeScript errors. Bundle output written to `package/usr/local/emhttp/plugins/unraid-modernui/`.

- [ ] **Step 5: Run the existing test suite**

Run:

```powershell
npm run test:ts
```

Expected: all 198 tests still pass. No new tests added, no existing tests touched.

- [ ] **Step 6: Commit**

```powershell
git add src/ts/dashboard/components/md-dashboard.ts; git commit -m "feat(dashboard): move Network card into sticky sidebar"
```

- [ ] **Step 7: Deploy + manual verify on live Unraid**

Deploy via the user's existing dev-mirror flow (e.g. `npm run dev-mirror` or whatever the user normally uses to push the built bundle to the live box). Refresh `/Dashboard` in a browser.

Verify in order:

1. Sidebar now shows two stacked sections: "COMPUTE" (Processor & Memory) and "NETWORK" (Interface card with inbound/outbound and the per-iface list).
2. The main column no longer has a "Network & Power" section. If a UPS is configured, a "POWER" section remains in the main column containing only the UPS card.
3. Scroll the main column. Both sidebar sections (Compute + Network) stay pinned to the top of the viewport.
4. Inbound/Outbound text continues to update live (Unraid's nchan push still reaches the source).

If any of these fail, do not move on to Task 2 — diagnose first.

---

## Task 2: Add the Docker high-level summary block

**Files:**
- Modify: `src/ts/dashboard/components/md-docker-card.ts`

This task adds the summary block but **does not yet** wrap the existing content in a `<details>` element. Doing the summary alone first means we can verify the counts and the bar render correctly before introducing the expander chrome.

- [ ] **Step 1: Add the summary CSS to the static `styles` block**

In `src/ts/dashboard/components/md-docker-card.ts`, append the following CSS rules inside the existing `static styles = css\`...\`` template, just before the closing backtick (after the existing `.container-tile .dot` rule):

```typescript
    .summary {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    }
    .summary .total {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .summary .total .big {
      font-size: 32px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .summary .total .small {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .summary .counts {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .summary .counts .count {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
    }
    .summary .counts .count .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .summary .counts .count .num {
      color: var(--text-primary);
      font-weight: 600;
    }
    .summary-bar {
      display: flex;
      height: 6px;
      background: var(--border-default);
      border-radius: var(--radius-full);
      overflow: hidden;
    }
    .summary-bar > span {
      display: block;
      height: 100%;
      transition: width 240ms cubic-bezier(0.2, 0, 0, 1);
    }
    .summary-bar > span.started { background: var(--success); }
    .summary-bar > span.stopped { background: var(--danger); }
    .summary-bar > span.paused  { background: var(--warning); }
    .summary-bar > span.unknown { background: var(--text-muted); }
```

- [ ] **Step 2: Replace the `render()` method with a version that adds the summary above the existing content**

In the same file, replace the entire `render()` method (currently around lines 117-151) with:

```typescript
  render() {
    const { folders, ungrouped, totalRunning, totalCount } = this.state;

    // Derive the four state counts from folders + ungrouped. totalRunning
    // already exists on DockerState; the others we count here so we don't
    // touch the extractor's state shape.
    const allContainers = [...ungrouped, ...folders.flatMap((f) => f.containers)];
    const stopped = allContainers.filter((c) => c.state === 'stopped').length;
    const paused  = allContainers.filter((c) => c.state === 'paused').length;
    const unknown = allContainers.filter((c) => c.state === 'unknown').length;

    const meta = totalCount > 0 ? `${totalRunning} / ${totalCount} running` : '';

    return html`
      <md-card cardTitle="Docker Containers" meta=${meta}>
        ${totalCount > 0 ? html`
          <div class="summary">
            <div class="total">
              <span class="big">${totalCount}</span>
              <span class="small">container${totalCount === 1 ? '' : 's'}</span>
            </div>
            <div class="counts">
              <span class="count">
                <span class="dot" style="background: var(--success)"></span>
                <span class="num">${totalRunning}</span> started
              </span>
              <span class="count">
                <span class="dot" style="background: var(--danger)"></span>
                <span class="num">${stopped}</span> stopped
              </span>
              <span class="count">
                <span class="dot" style="background: var(--warning)"></span>
                <span class="num">${paused}</span> paused
              </span>
              ${unknown > 0 ? html`
                <span class="count">
                  <span class="dot" style="background: var(--text-muted)"></span>
                  <span class="num">${unknown}</span> unknown
                </span>
              ` : ''}
            </div>
            <div class="summary-bar">
              <span class="started" style="width: ${(totalRunning / totalCount) * 100}%"></span>
              <span class="stopped" style="width: ${(stopped / totalCount) * 100}%"></span>
              <span class="paused"  style="width: ${(paused  / totalCount) * 100}%"></span>
              ${unknown > 0 ? html`<span class="unknown" style="width: ${(unknown / totalCount) * 100}%"></span>` : ''}
            </div>
          </div>
        ` : html`
          <div class="summary">
            <div class="total">
              <span class="big">0</span>
              <span class="small">containers</span>
            </div>
          </div>
        `}

        ${totalCount > 0 ? html`
          <div class="filters">
            <span class="chip" ?data-active=${this._filter === 'all'}
                  @click=${() => (this._filter = 'all')}>All</span>
            <span class="chip" ?data-active=${this._filter === 'running'}
                  @click=${() => (this._filter = 'running')}>Running</span>
            <span class="chip" ?data-active=${this._filter === 'stopped'}
                  @click=${() => (this._filter = 'stopped')}>Stopped</span>
          </div>
          ${folders.map((f) => {
            const visible = this._filtered(f.containers);
            if (visible.length === 0) return '';
            return html`
              <div class="folder-label">
                <span>${f.name}</span>
                <span>${f.runningCount} / ${f.totalCount}</span>
              </div>
              <div class="container-grid">
                ${visible.map((c) => this._renderTile(c))}
              </div>
            `;
          })}
          ${ungrouped.length > 0 ? html`
            <div class="folder-label"><span>Ungrouped</span></div>
            <div class="container-grid">
              ${this._filtered(ungrouped).map((c) => this._renderTile(c))}
            </div>
          ` : ''}
        ` : ''}
      </md-card>
    `;
  }
```

This intentionally keeps the existing filter chips + folder grid + ungrouped grid in the same flow position; Task 3 will wrap them in `<details>`. The only behavioral change here is the new summary block above and the empty-state branch.

- [ ] **Step 3: Build to verify it compiles**

Run:

```powershell
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Run the test suite**

Run:

```powershell
npm run test:ts
```

Expected: all 198 tests still pass. The Docker extractor tests don't touch the card render path; they should be unaffected.

- [ ] **Step 5: Commit**

```powershell
git add src/ts/dashboard/components/md-docker-card.ts; git commit -m "feat(dashboard): add Docker high-level summary (counts + stacked bar)"
```

- [ ] **Step 6: Deploy + manual verify on live Unraid**

Deploy and refresh `/Dashboard`. Verify:

1. The Docker Containers card now opens with: a big "N" + "containers" label, three (or four) dot-prefixed counts, and a slim full-width bar split into proportional coloured segments.
2. The counts add up to the total (e.g. `12 started + 3 stopped + 1 paused = 16`).
3. Bar segments are proportional and use: green=started, red=stopped, amber=paused, grey=unknown (only if any unknown).
4. The existing filter chips + folder labels + container tiles still render below the summary, exactly as before.
5. When containers start/stop on the host, the counts and bar update reactively within the usual debounce window.

---

## Task 3: Wrap container view in a `<details>` expander

**Files:**
- Modify: `src/ts/dashboard/components/md-docker-card.ts`

This task adopts the `<details>` pattern from `md-disklocation-card.ts` so the filter chips + folder grid + ungrouped grid are collapsed by default and revealed when the user clicks the summary row.

- [ ] **Step 1: Add the `<details>`/`<summary>` CSS**

Append the following rules inside the same `static styles = css\`...\`` template in `src/ts/dashboard/components/md-docker-card.ts`, after the `.summary-bar` rules added in Task 2:

```typescript
    details.container-list {
      margin-top: 16px;
      border-top: 1px solid var(--border-subtle);
      padding-top: 12px;
    }
    details.container-list summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      user-select: none;
      padding: 4px 0;
    }
    details.container-list summary::-webkit-details-marker { display: none; }
    details.container-list .chevron {
      display: inline-block;
      width: 0;
      height: 0;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-left: 6px solid var(--text-secondary);
      transition: transform var(--duration-fast) var(--ease-out);
    }
    details.container-list[open] .chevron {
      transform: rotate(90deg);
    }
    details.container-list .summary-meta {
      color: var(--text-secondary);
      font-weight: 400;
      font-size: 12px;
      margin-left: auto;
    }
    details.container-list[open] .summary-meta {
      display: none;
    }
    details.container-list .label-closed { display: inline; }
    details.container-list .label-open    { display: none; }
    details.container-list[open] .label-closed { display: none; }
    details.container-list[open] .label-open    { display: inline; }
    details.container-list .container-body {
      margin-top: 12px;
    }
```

- [ ] **Step 2: Wrap the filter chips + folder grids in `<details>`**

In `src/ts/dashboard/components/md-docker-card.ts` `render()`, locate the **second** `${totalCount > 0 ? html\`...\` : ''}` ternary — the one that renders the filter chips + folders + ungrouped (the first ternary renders the summary block + empty-state and stays as-is). Replace the truthy branch of that second ternary so the whole ternary becomes:

```typescript
        ${totalCount > 0 ? html`
```

followed by the new `<details>` block:

```typescript
          <details class="container-list">
            <summary>
              <span class="chevron"></span>
              <span class="label-closed">Show containers</span>
              <span class="label-open">Hide containers</span>
              <span class="summary-meta">${totalRunning} running</span>
            </summary>
            <div class="container-body">
              <div class="filters">
                <span class="chip" ?data-active=${this._filter === 'all'}
                      @click=${() => (this._filter = 'all')}>All</span>
                <span class="chip" ?data-active=${this._filter === 'running'}
                      @click=${() => (this._filter = 'running')}>Running</span>
                <span class="chip" ?data-active=${this._filter === 'stopped'}
                      @click=${() => (this._filter = 'stopped')}>Stopped</span>
              </div>
              ${folders.map((f) => {
                const visible = this._filtered(f.containers);
                if (visible.length === 0) return '';
                return html`
                  <div class="folder-label">
                    <span>${f.name}</span>
                    <span>${f.runningCount} / ${f.totalCount}</span>
                  </div>
                  <div class="container-grid">
                    ${visible.map((c) => this._renderTile(c))}
                  </div>
                `;
              })}
              ${ungrouped.length > 0 ? html`
                <div class="folder-label"><span>Ungrouped</span></div>
                <div class="container-grid">
                  ${this._filtered(ungrouped).map((c) => this._renderTile(c))}
                </div>
              ` : ''}
            </div>
          </details>
        ` : ''}
```

The `<details>` element has no `open` attribute, so it renders closed on first mount. The native browser keeps track of open/closed state — no extra JS state is needed. The card's `@state` filter chip selection (`this._filter`) persists across collapse/expand because the Lit element instance is the same; only the rendered subtree visibility toggles.

- [ ] **Step 3: Build to verify it compiles**

Run:

```powershell
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Run the test suite**

Run:

```powershell
npm run test:ts
```

Expected: all 198 tests still pass.

- [ ] **Step 5: Commit**

```powershell
git add src/ts/dashboard/components/md-docker-card.ts; git commit -m "feat(dashboard): collapse Docker container list into <details> expander"
```

- [ ] **Step 6: Deploy + manual verify on live Unraid**

Deploy and refresh `/Dashboard`. Verify:

1. On first page load the Docker card shows: card header → big total + counts + stacked bar → a single summary row "▶ Show containers ... 12 running" — and **no** container tiles.
2. Click the summary row. The chevron rotates 90°, the label switches to "Hide containers", the right-side "12 running" meta disappears, and the filter chips + folder labels + container tiles slide in below.
3. The card header's right-side meta ("12 / 16 running") remains visible in both states (it's outside the `<details>`).
4. Click a filter chip (Running / Stopped), confirm the tile list filters. Collapse the expander, re-expand — the filter chip selection is preserved.
5. Reload the page. The expander returns to closed (no localStorage persistence — by design).
6. Reactivity: when containers start/stop on the host, the summary counts + bar update; if the expander is open, the tiles update too.

---

## Done When

- All three tasks committed.
- `npm run build` and `npm run test:ts` both clean on the final commit.
- Manual verification checklist for each task ticked off on the live Unraid box.
- No regressions in any other card (Processor & Memory, Disk Location, GPU, IPMI, VMs, etc. all render and update as before).

If any of those fail, do not advance to the next task; diagnose the regression on the live box first. The user's prior memory notes (especially nchan-pauses-when-hidden and unraid-token-collisions) cover the most likely classes of breakage — re-read them if a card stops updating or an accent token starts bleeding.
