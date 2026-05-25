# Hero Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4-card hero metrics strip (Array · Cache · Workloads · Power) at the top of the dashboard, with click-to-open-expander-and-scroll navigation into the matching detail cards.

**Architecture:** Two new Lit components — `md-hero-card` (a single cell with header label, big number, sub-info, and a slotted visual) and `md-hero-strip` (responsive grid container that owns the visuals and emits a `data-hero-expander` convention for cross-shadow click navigation). `md-dashboard.ts` mounts the strip full-width above the existing sidebar+main grid. Two existing detail cards (`md-disklocation-card`, `md-docker-card`) get a `data-hero-expander` attribute on their `<details>` elements so the hero's click handler can drill into them through two shadow-root levels.

**Tech Stack:** Lit 3 web components (no new deps); existing Vite-based build (`tools/build.mjs`); Vitest + jsdom for the extractor suite that must continue to pass; manual verification on the user's live Unraid server via the dev-mirror flow.

---

## File Structure

End-state — two new components, three existing files modified.

```
src/ts/dashboard/components/
├── md-hero-card.ts           CREATE: single hero cell, click handler, slotted visual
├── md-hero-strip.ts          CREATE: responsive grid, builds 4 cards from widget state
├── md-dashboard.ts           MODIFY: import + mount the strip above the layout grid
├── md-disklocation-card.ts   MODIFY: add data-hero-expander="storage-details" attribute
└── md-docker-card.ts         MODIFY: add data-hero-expander="container-list" attribute
```

**Responsibility split:**

- `md-hero-card.ts` knows nothing about specific cards — it accepts `scrollTarget` + `expanderTarget` selectors and handles the cross-shadow drill. Visual content is slotted.
- `md-hero-strip.ts` owns the four cards' content: which widgets to show, the per-card visuals (capacity ring, battery, dot rows), and the selectors to pass into each `md-hero-card`.
- `md-dashboard.ts` only changes by importing and mounting `<md-hero-strip>` and forwarding the relevant widget slices.
- The two detail-card modifications add one HTML attribute each — no behavior change there.

---

## Plan-Wide Conventions

**No new component tests.** The project's existing test pattern is extractor-level only (under `tests/unit-ts/dashboard/extractors/`). No `md-*-card.test.ts` files exist. Following the established pattern, we verify the work via:

1. `npm run build` — TypeScript type-check + bundle pass
2. `npm run test:ts` — existing 198-test extractor suite must remain green
3. Manual verification on the live Unraid box: `MODERNUI_SSH_PORT=22 npm run dev-mirror -- <your-unraid-host>` then reload `https://<your-unraid-host>/Dashboard`. See [[reference_dev_mirror_deploy]] memory for the working command (must be invoked from PowerShell, not Bash, so the env var sticks).

**Commits:** one per task once `build` + `test:ts` are both green. Conventional Commits style, matching the recent dashboard work.

**Token discipline:** reuse existing tokens — `--success` (started/active/healthy), `--danger` (stopped/red), `--warning` (paused/amber), `--text-muted` (unknown/grey), `--mui-accent`, `--border-subtle`, `--bg-surface`, `--bg-elevated`, `--radius-lg`, `--radius-md`, `--radius-full`. Do not introduce new tokens.

**Shadow-DOM traversal pattern:** the hero card walks up two shadow-root levels to reach `<modernui-dashboard>`'s root, then queries for sibling cards. From the perspective of `md-hero-card`:
```ts
const dashboardRoot = (this.getRootNode() as ShadowRoot).host.getRootNode() as ShadowRoot;
const targetCard = dashboardRoot.querySelector(this.scrollTarget);   // e.g. 'md-disklocation-card'
const innerDetails = targetCard?.shadowRoot?.querySelector(`[data-hero-expander="${this.expanderTarget}"]`);
```

---

## Task 1: Create `md-hero-card` — base cell + click handler

**Files:**
- Create: `src/ts/dashboard/components/md-hero-card.ts`

This is the generic single-hero-cell component. It does not know about Array, Cache, Workloads, or Power. The hero strip in Task 2 builds the four instances and slots their visuals in.

- [ ] **Step 1: Create the file with the component skeleton, props, and styles**

Create `src/ts/dashboard/components/md-hero-card.ts` with the following contents:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * A single hero cell. The strip wires four of these up with their own
 * label / numbers / visual slot content. The card handles click navigation:
 * - if `expanderTarget` is non-empty, open the matching <details> first
 * - then scrollIntoView on the `scrollTarget` element
 *
 * The card lives two shadow-root levels below <modernui-dashboard>, so the
 * click handler walks up via getRootNode().host.getRootNode() to reach the
 * dashboard's shadow root, then queries for sibling cards there.
 */
@customElement('md-hero-card')
export class MdHeroCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.20),
        0 1px 3px rgba(0, 0, 0, 0.12);
      transition: box-shadow 120ms cubic-bezier(0.2, 0, 0, 1);
      cursor: pointer;
      user-select: none;
    }
    :host(:hover) {
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.20),
        0 2px 6px rgba(0, 0, 0, 0.18);
    }
    .body {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 20px 20px;
      min-height: 140px;
      box-sizing: border-box;
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
    }
    .big {
      font-size: 32px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .sub {
      font-size: 12px;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .visual {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 56px;
    }
  `;

  @property({ type: String }) label = '';
  @property({ type: String }) bigText = '—';
  @property({ type: String }) subText = '';
  // CSS selector queried inside <modernui-dashboard>'s shadow root.
  @property({ type: String }) scrollTarget = '';
  // Value of the [data-hero-expander="..."] attribute on the <details> inside
  // the target card's shadow root. Empty string = no expander to open.
  @property({ type: String }) expanderTarget = '';

  private _onClick(): void {
    if (!this.scrollTarget) return;

    const stripRoot = this.getRootNode() as ShadowRoot;
    const dashboardRoot = (stripRoot.host?.getRootNode() as ShadowRoot) ?? null;
    if (!dashboardRoot) return;

    const targetCard = dashboardRoot.querySelector(this.scrollTarget) as HTMLElement | null;
    if (!targetCard) return;

    if (this.expanderTarget) {
      const details = targetCard.shadowRoot?.querySelector(
        `[data-hero-expander="${this.expanderTarget}"]`,
      ) as HTMLDetailsElement | null;
      if (details && !details.open) details.open = true;
    }

    // Wait one frame so the just-opened expander has flowed into the layout
    // before we compute the scroll position.
    requestAnimationFrame(() => {
      targetCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  render() {
    return html`
      <div class="body" @click=${this._onClick}>
        <div class="text">
          <span class="label">${this.label}</span>
          <span class="big">${this.bigText}</span>
          ${this.subText ? html`<span class="sub">${this.subText}</span>` : ''}
        </div>
        <div class="visual">
          <slot></slot>
        </div>
      </div>
    `;
  }
}
```

- [ ] **Step 2: Build to verify it compiles**

Run via PowerShell:

```powershell
npm run build
```

Expected: build succeeds. No TypeScript errors. The component bundle includes `md-hero-card`.

- [ ] **Step 3: Run the test suite**

Run:

```powershell
npm run test:ts
```

Expected: 198 tests still pass. No new tests added.

- [ ] **Step 4: Commit**

Run:

```powershell
git add src/ts/dashboard/components/md-hero-card.ts; git commit -m "feat(dashboard): add md-hero-card base component"
```

---

## Task 2: Create `md-hero-strip` with the four cards and their visuals

**Files:**
- Create: `src/ts/dashboard/components/md-hero-strip.ts`

The strip builds the four hero card instances from the widget state passed in by `md-dashboard`. It owns the per-card visuals (capacity ring, battery, dot rows) as small inline-SVG / CSS templates.

- [ ] **Step 1: Create the file**

Create `src/ts/dashboard/components/md-hero-strip.ts` with the following contents:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ArrayState, CacheState, DockerState, VmsState, UpsState } from '../types';
import './md-hero-card';

/**
 * Renders up to four hero cards. Each card renders only when its underlying
 * widget data exists. If none qualify, the strip renders nothing.
 */
@customElement('md-hero-strip')
export class MdHeroStrip extends LitElement {
  static styles = css`
    :host { display: block; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin: 0 0 16px;
    }
    @media (max-width: 1199px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 767px) {
      .grid { grid-template-columns: 1fr; }
    }

    /* Capacity ring used by Array + Cache heroes */
    .ring {
      width: 48px;
      height: 48px;
      position: relative;
    }
    .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .ring circle { fill: none; stroke-width: 6; }
    .ring .track { stroke: var(--border-default); }
    .ring .fill  { stroke: var(--mui-accent); transition: stroke-dashoffset 240ms cubic-bezier(0.2, 0, 0, 1); }

    /* Battery icon used by Power hero */
    .battery {
      position: relative;
      width: 56px;
      height: 28px;
      border: 2px solid var(--text-primary);
      border-radius: 4px;
      box-sizing: border-box;
    }
    .battery::after {
      content: '';
      position: absolute;
      top: 6px;
      right: -5px;
      width: 3px;
      height: 12px;
      background: var(--text-primary);
      border-radius: 0 1px 1px 0;
    }
    .battery > span {
      display: block;
      height: 100%;
      transition: width 240ms cubic-bezier(0.2, 0, 0, 1), background 120ms;
    }

    /* Dot rows used by Workloads hero */
    .dots-stack {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .dots-row {
      display: flex;
      gap: 3px;
      align-items: center;
    }
    .dots-row .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .dots-row .label {
      font-size: 10px;
      color: var(--text-secondary);
      margin-left: 4px;
      font-variant-numeric: tabular-nums;
    }
  `;

  @property({ type: Object }) arrayState: ArrayState | null = null;
  @property({ type: Array })  cacheStates: CacheState[] = [];
  @property({ type: Object }) dockerState: DockerState | null = null;
  @property({ type: Object }) vmsState: VmsState | null = null;
  @property({ type: Object }) upsState: UpsState | null = null;

  // ----- per-card derivations -----

  private _arrayCard() {
    const s = this.arrayState;
    if (!s) return '';
    if (s.usedTB === null || s.totalTB === null) {
      return html`
        <md-hero-card
          label="Array"
          bigText="—"
          subText="capacity unknown"
          scrollTarget="md-disklocation-card"
          expanderTarget="storage-details"
        ></md-hero-card>
      `;
    }
    const pct = Math.round((s.usedTB / s.totalTB) * 100);
    return html`
      <md-hero-card
        label="Array"
        bigText="${s.usedTB.toFixed(1)} TB"
        subText="${pct}% used · Parity ${s.status}"
        scrollTarget="md-disklocation-card"
        expanderTarget="storage-details"
      >${this._ring(pct)}</md-hero-card>
    `;
  }

  private _cacheCard() {
    const pools = this.cacheStates.filter((c) => c.usedGB !== null && c.totalGB !== null);
    if (pools.length === 0) return '';
    const totalUsed = pools.reduce((s, c) => s + (c.usedGB ?? 0), 0);
    const totalCap  = pools.reduce((s, c) => s + (c.totalGB ?? 0), 0);
    const pct = totalCap > 0 ? Math.round((totalUsed / totalCap) * 100) : 0;
    const used = totalUsed >= 1024 ? `${(totalUsed / 1024).toFixed(1)} TB` : `${totalUsed.toFixed(0)} GB`;
    const status = pools[0].status.toUpperCase();
    return html`
      <md-hero-card
        label="Cache"
        bigText="${used}"
        subText="${pct}% used · ${status}"
        scrollTarget="md-disklocation-card"
        expanderTarget="storage-details"
      >${this._ring(pct)}</md-hero-card>
    `;
  }

  private _workloadsCard() {
    const d = this.dockerState;
    const v = this.vmsState;
    const dockerHas = !!d && d.totalCount > 0;
    const vmsHas    = !!v && v.totalCount > 0;
    if (!dockerHas && !vmsHas) return '';

    if (dockerHas) {
      const dockerStarted = d!.totalRunning;
      const dockerTotal   = d!.totalCount;
      const vmLine = vmsHas
        ? `${v!.totalRunning} of ${v!.totalCount} VM${v!.totalCount === 1 ? '' : 's'} running`
        : '';
      return html`
        <md-hero-card
          label="Workloads"
          bigText="${dockerStarted} / ${dockerTotal}"
          subText="${vmLine}"
          scrollTarget="md-docker-card"
          expanderTarget="container-list"
        >${this._dotsStack(dockerStarted, dockerTotal, vmsHas ? v!.totalRunning : null, vmsHas ? v!.totalCount : null)}</md-hero-card>
      `;
    }

    // VMs-only fallback
    return html`
      <md-hero-card
        label="Workloads"
        bigText="${v!.totalRunning} / ${v!.totalCount}"
        subText="${v!.totalCount === 1 ? 'VM' : 'VMs'} running"
        scrollTarget="md-vms-card"
        expanderTarget=""
      >${this._dotsStack(null, null, v!.totalRunning, v!.totalCount)}</md-hero-card>
    `;
  }

  private _powerCard() {
    const u = this.upsState;
    if (!u) return '';
    if (u.status === 'unknown') {
      return html`
        <md-hero-card
          label="Power"
          bigText="—"
          subText="UPS status unknown"
          scrollTarget="md-ups-card"
          expanderTarget=""
        ></md-hero-card>
      `;
    }
    const watts = u.loadW !== null ? `${Math.round(u.loadW)} W` : '—';
    const battParts: string[] = [];
    if (u.batteryChargePct !== null) battParts.push(`UPS ${Math.round(u.batteryChargePct)}%`);
    if (u.runtimeMinutes !== null)   battParts.push(`${u.runtimeMinutes} min`);
    return html`
      <md-hero-card
        label="Power"
        bigText="${watts}"
        subText="${battParts.join(' · ')}"
        scrollTarget="md-ups-card"
        expanderTarget=""
      >${this._battery(u.batteryChargePct ?? 0)}</md-hero-card>
    `;
  }

  // ----- visual builders -----

  private _ring(pct: number) {
    // Circle r=20, circumference = 2*pi*r ≈ 125.66
    const r = 20;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - pct / 100);
    return html`
      <div class="ring">
        <svg viewBox="0 0 48 48">
          <circle class="track" cx="24" cy="24" r="${r}"></circle>
          <circle class="fill"  cx="24" cy="24" r="${r}"
                  stroke-dasharray="${c}" stroke-dashoffset="${offset}"></circle>
        </svg>
      </div>
    `;
  }

  private _battery(pct: number) {
    const color = pct >= 30 ? 'var(--success)' : pct >= 15 ? 'var(--warning)' : 'var(--danger)';
    return html`
      <div class="battery">
        <span style="width: ${Math.max(0, Math.min(100, pct))}%; background: ${color}"></span>
      </div>
    `;
  }

  private _dotsStack(
    dockerStarted: number | null, dockerTotal: number | null,
    vmStarted: number | null, vmTotal: number | null,
  ) {
    return html`
      <div class="dots-stack">
        ${dockerTotal !== null ? this._dotsRow(dockerStarted ?? 0, dockerTotal, 'CT') : ''}
        ${vmTotal !== null ? this._dotsRow(vmStarted ?? 0, vmTotal, 'VM') : ''}
      </div>
    `;
  }

  private _dotsRow(running: number, total: number, label: string) {
    if (total > 12) {
      return html`
        <div class="dots-row">
          <span class="label">${running}/${total} ${label}</span>
        </div>
      `;
    }
    const dots = Array.from({ length: total }, (_, i) => i < running);
    return html`
      <div class="dots-row">
        ${dots.map((on) => html`<span class="dot" style="background: ${on ? 'var(--success)' : 'var(--text-muted)'}"></span>`)}
        <span class="label">${label}</span>
      </div>
    `;
  }

  render() {
    const cards = [this._arrayCard(), this._cacheCard(), this._workloadsCard(), this._powerCard()]
      .filter((c) => c !== '');
    if (cards.length === 0) return html``;
    return html`<div class="grid">${cards}</div>`;
  }
}
```

- [ ] **Step 2: Build to verify it compiles**

Run:

```powershell
npm run build
```

Expected: build succeeds. No TypeScript errors.

- [ ] **Step 3: Run the test suite**

Run:

```powershell
npm run test:ts
```

Expected: 198 tests still pass.

- [ ] **Step 4: Commit**

```powershell
git add src/ts/dashboard/components/md-hero-strip.ts; git commit -m "feat(dashboard): add md-hero-strip with Array/Cache/Workloads/Power cells"
```

---

## Task 3: Mount the strip in `md-dashboard`

**Files:**
- Modify: `src/ts/dashboard/components/md-dashboard.ts`

The strip needs to render above the `.layout` grid and receive the right widget slices.

- [ ] **Step 1: Add the import**

Open `src/ts/dashboard/components/md-dashboard.ts`. Locate the existing block of component imports (around lines 24-41) and append the hero-strip import to the end:

```typescript
import './md-shares-card';
import './md-users-card';
import './md-hero-strip';
```

The line you're adding is the final `import './md-hero-strip';` — keep the existing imports above it untouched.

- [ ] **Step 2: Mount the strip inside `.content`, above `.layout`**

In the same file, locate the `render()` return template. Just before the existing `<div class="layout">` opening tag, insert a `<md-hero-strip>` element with bound widget slices. The full `.content` block changes from:

```typescript
    return html`
      <div class="content">
        <div class="layout">
          <aside class="sidebar">
```

to:

```typescript
    return html`
      <div class="content">
        <md-hero-strip
          .arrayState=${arrays[0] ?? null}
          .cacheStates=${caches}
          .dockerState=${dockers[0] ?? null}
          .vmsState=${vms[0] ?? null}
          .upsState=${upses[0] ?? null}
        ></md-hero-strip>
        <div class="layout">
          <aside class="sidebar">
```

(Only the new `<md-hero-strip>` block is inserted; the existing `<div class="content">` / `<div class="layout">` / `<aside class="sidebar">` lines stay unchanged.)

- [ ] **Step 3: Build to verify it compiles**

Run:

```powershell
npm run build
```

Expected: build succeeds. The bundle now includes the hero strip and references the right state.

- [ ] **Step 4: Run the test suite**

Run:

```powershell
npm run test:ts
```

Expected: 198 tests still pass.

- [ ] **Step 5: Commit**

```powershell
git add src/ts/dashboard/components/md-dashboard.ts; git commit -m "feat(dashboard): mount md-hero-strip above the layout grid"
```

---

## Task 4: Expose `data-hero-expander` on the two detail cards

**Files:**
- Modify: `src/ts/dashboard/components/md-disklocation-card.ts`
- Modify: `src/ts/dashboard/components/md-docker-card.ts`

The hero's click handler drills into these cards' shadow roots and looks for a `<details>` element marked with a `data-hero-expander` attribute. Without it, the click only scrolls and never opens the expander.

- [ ] **Step 1: Tag the Disk Location expander**

Open `src/ts/dashboard/components/md-disklocation-card.ts`. Locate the `<details class="storage-details">` opening tag in the render template (currently around the line that reads `<details class="storage-details">`). Change that single tag from:

```typescript
          <details class="storage-details">
```

to:

```typescript
          <details class="storage-details" data-hero-expander="storage-details">
```

(Just adds the `data-hero-expander="storage-details"` attribute. Everything else in the file stays.)

- [ ] **Step 2: Tag the Docker container-list expander**

Open `src/ts/dashboard/components/md-docker-card.ts`. Locate the `<details class="container-list">` opening tag and change it from:

```typescript
          <details class="container-list">
```

to:

```typescript
          <details class="container-list" data-hero-expander="container-list">
```

(Same single-attribute addition.)

- [ ] **Step 3: Build to verify it compiles**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Run the test suite**

Run:

```powershell
npm run test:ts
```

Expected: 198 tests still pass.

- [ ] **Step 5: Commit**

```powershell
git add src/ts/dashboard/components/md-disklocation-card.ts src/ts/dashboard/components/md-docker-card.ts; git commit -m "feat(dashboard): tag detail-card expanders for hero-strip navigation"
```

---

## Task 5: Deploy and verify on the live Unraid box

**Files:** none (deploy + verify only)

- [ ] **Step 1: Deploy via dev-mirror**

Run via PowerShell (the env var only works in PowerShell — running this in Bash silently falls back to SSH port 22 and the connection is refused):

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Expected: ends with `Modern UI: install complete (disabled=false)`.

- [ ] **Step 2: Hard reload the dashboard in Chrome**

In the connected browser tab on `https://<your-unraid-host>/Dashboard`, run:

```javascript
location.reload(true)
```

- [ ] **Step 3: Probe rendered structure**

In the same Chrome tab, run via `mcp__Claude_in_Chrome__javascript_tool`:

```javascript
(() => {
  const d = document.querySelector('modernui-dashboard');
  const strip = d.shadowRoot.querySelector('md-hero-strip');
  const cards = strip ? Array.from(strip.shadowRoot.querySelectorAll('md-hero-card')).map(c => ({
    label: c.label, big: c.bigText, sub: c.subText, scroll: c.scrollTarget, exp: c.expanderTarget,
  })) : null;
  const disklocExp = d.shadowRoot.querySelector('md-disklocation-card')?.shadowRoot?.querySelector('[data-hero-expander="storage-details"]');
  const dockerExp  = d.shadowRoot.querySelector('md-docker-card')?.shadowRoot?.querySelector('[data-hero-expander="container-list"]');
  return { stripExists: !!strip, cards, disklocExpFound: !!disklocExp, dockerExpFound: !!dockerExp };
})()
```

Expected:
- `stripExists: true`
- `cards`: array of 4 entries with non-empty `label`, `big`, `sub` (Array shows `92.2 TB`, Cache shows `392 GB`, Workloads shows `31 / 43`, Power shows `~375 W`).
- `disklocExpFound: true`, `dockerExpFound: true`.

- [ ] **Step 4: Simulate click → open expander → scroll**

In Chrome, run:

```javascript
(() => {
  const d = document.querySelector('modernui-dashboard');
  const strip = d.shadowRoot.querySelector('md-hero-strip');
  const cards = strip.shadowRoot.querySelectorAll('md-hero-card');
  const cacheCard = Array.from(cards).find(c => c.label === 'Cache');
  cacheCard.shadowRoot.querySelector('.body').click();
  // Give scroll a moment then probe expander state
  return new Promise(resolve => setTimeout(() => {
    const disklocExp = d.shadowRoot.querySelector('md-disklocation-card').shadowRoot.querySelector('[data-hero-expander="storage-details"]');
    resolve({ expanderOpen: disklocExp.open });
  }, 600));
})()
```

Expected: `{ expanderOpen: true }`. The page should also have visibly scrolled to the Cache card.

- [ ] **Step 5: Visual screenshot for sanity check**

Take a screenshot of the dashboard (`mcp__Claude_in_Chrome__computer` with `screenshot`). Look for:
- The hero strip rendered full-width at the top with 4 cards side-by-side
- Capacity rings on Array + Cache, battery on Power, dot rows on Workloads
- Numbers matching the detail cards below (Array hero `92.2 TB` matches Disk Location card's `Array 92.2 / 144 TB` footer)

- [ ] **Step 6: Resize check (optional but recommended)**

Resize the Chrome window to ~1100px wide → strip should reflow to 2×2 grid. Resize to ~600px → single column.

---

## Done When

- All four tasks (1–4) committed in order.
- `npm run build` and `npm run test:ts` clean on the final commit.
- Task 5's live verification checklist passes — strip renders, four cards have real numbers, clicking Cache opens the Storage details expander and scrolls into view.
- No regressions in any other card (Processor & Memory sidebar, Disk Location bays grid, Docker summary, etc. all render and update as before).

If any verification fails, do not proceed — diagnose first. The [[shadow-dom-unraid-css]] memory covers the most likely class of UI breakage (Unraid CSS not crossing shadow boundaries). The [[reference_dev_mirror_deploy]] memory covers the deploy gotchas (PowerShell env var, port 22).
