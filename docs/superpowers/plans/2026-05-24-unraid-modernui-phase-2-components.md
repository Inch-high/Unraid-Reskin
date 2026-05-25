# Unraid ModernUI — Phase 2: Component Re-skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle all stock Unraid 7.x components (buttons, tables, forms, cards, dialogs, badges) to match the spec's flat/modern visual language, while leaving the top-nav chrome intact. Phase 2 still uses Unraid's existing markup — no DOM manipulation, no shell template overrides beyond the v0.1.1 `<link>`/`<script>` injection.

**Architecture:** Unraid 7.3.0 already exposes a complete semantic CSS-variable system (`--text-color`, `--button-background`, `--table-border-color`, etc.) with per-theme files that are pure variable overrides. Phase 2 layers our component styling on top via two mechanisms:

1. **Token-override layer** (`unraid-tokens.scss`): redefines Unraid's semantic variables to point at our design tokens (`--bg-base`, `--accent`, etc.). One file replaces 60-80% of the per-component color work.
2. **Component override layer** (`src/styles/components/*.scss`): targeted CSS for components whose *shape* changes — buttons (flat fill instead of gradient frame), tables (sticky headers, responsive transforms), forms (full borders instead of bottom-only), sweet-alert dialogs (backdrop blur, modern footer). Each file matches Unraid's actual selectors discovered in pre-plan exploration.

Both layers load via the existing `<link rel="stylesheet" href="…/modernui.css">` already injected before `</head>` (Phase 1's mechanism). No new install logic, no PHP changes.

**Tech Stack:** Sass (Dart Sass) with `@use` imports, Vite for the JS side (unchanged from Phase 1). No new runtime dependencies.

**Key insight from exploration:** Unraid uses `:where(:not(.unapi *))` to scope-exclude third-party widgets. We honor that convention in our overrides — every component selector matches Unraid's existing pattern so behavior is consistent.

---

## Pre-plan exploration findings (reference for all tasks)

Captured from a live SSH probe of `<your-unraid-host>` running Unraid 7.3.0. Selectors and class names below are real, not invented:

- **CSS load order in `DefaultPageLayout.php`** ends with `themes/{$theme}.css` then **our** `modernui.css` immediately before `</head>` (Phase 1 injection). We always win on load-order cascade.
- **Body root classes:** `<body class="…">` may carry `.Theme--sidebar` (Phase 3 hook) or `.Theme--width-boxed`. We do not set or rely on these in Phase 2.
- **Buttons:** selector pattern `input[type="button"|reset|submit"]:where(:not(.unapi *)), button:where(:not(.unapi *)), button[type="button"]:where(:not(.unapi *)), a.button:where(:not(.unapi *))`. Currently rendered as red-to-orange gradient *border frame* (no fill); hover fills the frame. We collapse this to a flat accent fill.
- **Tables:** `<table>` with classes `.unraid`, `.tablesorter`, `.disk_status`, `.array_status`, `.share_status`, `.dashboard`, `.legacy`. Wrapped in `.TableContainer { overflow-x: auto; }`. Row state classes `tr.alert`, `tr.warn`.
- **Form rows:** `dl`/`dt`/`dd` grid (35% / 1fr at ≥769px). Inputs have bottom border only.
- **Cards / containers:** `.shade` is the primary box primitive; `div.title` is the section header bar; `.Panels` / `.Panel` is the icon-tile grid on menu pages; `table.dashboard td div.section` for dashboard widget grouping.
- **Dialogs:** SweetAlert (`.sweet-overlay`, `.sweet-alert`, `.sa-icon`, `.sa-button-container`). No internal header/body/footer divs — uses `h2`/`p`/buttons directly. Special `.sweet-alert.nchan` variant for live log streams.

---

## File Structure

End-state layout (additions to Phase 1's tree):

```
src/styles/
├── tokens.scss                    (existing — our design tokens)
├── base.scss                      (existing — body, links, focus rings)
├── unraid-tokens.scss             (NEW — maps Unraid's semantic vars to ours)
├── components/                    (NEW)
│   ├── _index.scss                (forwards all component partials)
│   ├── buttons.scss
│   ├── tables.scss
│   ├── forms.scss
│   ├── containers.scss            (.shade, .Panels, div.title, .dashboard sections)
│   ├── dialogs.scss               (.sweet-overlay, .sweet-alert, .sa-*)
│   └── feedback.scss              (badges, tr.alert/.warn, progress bars, scrollbar)
└── modernui.scss                  (entry — imports tokens, unraid-tokens, base, components)
```

**Responsibility split:**
- `tokens.scss` defines OUR design system (`--bg-base`, `--accent`, etc.)
- `unraid-tokens.scss` re-points Unraid's existing semantic variables to ours — single file does most of the visual work
- `base.scss` keeps the body/link/focus rules from Phase 1
- `components/` holds shape-changing overrides — one file per component family
- `_index.scss` is a one-line forwarder (`@forward "buttons"; @forward "tables"; …`) so `modernui.scss` only needs one component import line

---

## Task 1: Unraid token-override layer

**Files:**
- Create: `src/styles/unraid-tokens.scss`
- Modify: `src/styles/modernui.scss`

- [ ] **Step 1: Create the token override file**

Contents of `src/styles/unraid-tokens.scss`:

```scss
// Remap Unraid's semantic CSS variables to point at our design tokens.
// Unraid defines these in default-color-palette.css + themes/{theme}.css.
// Our modernui.css loads after both, so :root assignments here win the cascade.
//
// Mappings reference OUR tokens (defined in tokens.scss). Because OUR tokens
// already change between dark and light modes via [data-theme="light"],
// these mappings automatically Light-mode correctly without duplication.

:root {
  // Text
  --text-color: var(--text-primary);
  --alt-text-color: var(--text-secondary);
  --disabled-text-color: var(--text-muted);
  --inverse-text-color: #ffffff;
  --link-text-color: var(--accent);
  --blockquote-text-color: var(--text-secondary);

  // Background
  --background-color: var(--bg-base);
  --mild-background-color: var(--bg-surface);
  --opac-background-color: rgba(15, 20, 25, 0.6);
  --inverse-background-color: var(--text-primary);
  --shade-bg-color: var(--bg-surface);
  --focus-input-bg-color: var(--bg-elevated);
  --input-bg-color: var(--bg-surface);
  --radio-background-color: var(--bg-elevated);

  // Borders
  --border-color: var(--border-default);
  --input-border-color: var(--border-default);
  --disabled-input-border-color: var(--border-subtle);
  --textarea-border-color: var(--border-default);
  --table-border-color: var(--border-subtle);
  --inverse-border-color: var(--text-primary);

  // Buttons — Unraid's are red-to-orange gradient frames; we want flat accent fills
  --button-text-color: #ffffff;
  --button-border: 1px solid transparent;
  --button-background: var(--accent);
  --button-background-size: 100% 100%;
  --hover-button-border: 1px solid transparent;
  --hover-button-text-color: #ffffff;
  --hover-button-background: var(--accent-hover);

  // Tables
  --table-background-color: var(--bg-surface);
  --table-header-background-color: var(--bg-elevated);
  --hover-table-row-background-color: var(--bg-elevated);

  // Header / footer (kept for compatibility; Phase 3 will overhaul header)
  --header-text-color: var(--text-primary);
  --header-background-color: var(--bg-surface);
  --footer-text: var(--text-secondary);
  --footer-background-color: var(--bg-surface);
  --title-header-background-color: var(--bg-elevated);

  // Misc
  --small-shadow: none;
  --hr-color: var(--border-subtle);
  --scrollbar-color: var(--border-default);
  --scrollbar-hover-color: var(--accent);
  --checkbox-color: var(--accent);
  --bg-opacity-10: rgba(255, 255, 255, 0.10);
  --bg-opacity-30: rgba(255, 255, 255, 0.30);

  // Dynamix-specific
  --dynamix-sweet-alert-text-color: var(--text-primary);
}

// Light-mode adjustments: opacities and shadows need to invert.
// Our text/bg tokens already swap via [data-theme="light"], so semantic
// names just inherit correctly. Only override the values whose RAW form
// is inappropriate for light (rgba over black).
[data-theme="light"] {
  --opac-background-color: rgba(255, 255, 255, 0.6);
  --bg-opacity-10: rgba(0, 0, 0, 0.06);
  --bg-opacity-30: rgba(0, 0, 0, 0.20);
  --small-shadow: 0 1px 2px rgba(15, 20, 25, 0.06);
}
```

- [ ] **Step 2: Update the SCSS entry point**

Replace contents of `src/styles/modernui.scss`:

```scss
@use "tokens";
@use "unraid-tokens";
@use "base";
```

- [ ] **Step 3: Build and verify**

Run via PowerShell:

```powershell
cd "C:\Users\<user>\Documents\Projects\Unraid Theme"; npm run build
```

Expected: `modernui.css` rebuilds. Size should grow modestly (from 1518 bytes to ~2500-3500 bytes — token assignments are compact).

- [ ] **Step 4: Deploy to live box and visually inspect**

Run:

```powershell
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

Open `http://<your-unraid-host>/Main` in browser, hard-refresh (Ctrl+Shift+R).

Expected visible changes:
- Page text color, link color, table backgrounds, sidebar/nav backgrounds all shift toward our token palette
- Button colors change (full appearance change comes in Task 2)
- The four built-in Unraid themes (white/black/azure/gray) all now show our color scheme regardless of which is selected in Display Settings — our `:root` always wins
- Light mode (set via our Settings > Theme page or system pref) correctly inverts

If anything is unreadably broken — text on bg with insufficient contrast — note which selector and revisit the token mapping. The most common issue is a single hardcoded RGB that we didn't catch.

- [ ] **Step 5: Commit**

```powershell
git add src/styles/unraid-tokens.scss src/styles/modernui.scss
git commit -m "feat(phase2): remap Unraid semantic tokens to our design palette"
```

---

## Task 2: Buttons

**Files:**
- Create: `src/styles/components/buttons.scss`
- Create: `src/styles/components/_index.scss`
- Modify: `src/styles/modernui.scss`

- [ ] **Step 1: Create the components index file**

Contents of `src/styles/components/_index.scss`:

```scss
@forward "buttons";
```

(Later tasks append `@forward "tables";` etc. — keep this file the single import point so `modernui.scss` stays clean.)

- [ ] **Step 2: Create the button override**

Contents of `src/styles/components/buttons.scss`:

```scss
// Unraid renders buttons as a red-to-orange gradient *border frame* with
// transparent fill; hover fills the frame. We flatten to solid accent fill,
// modern weights, modern radius. Selectors match Unraid's exact pattern
// (default-base.css lines 209-232) including the .unapi guard.

input[type="button"]:where(:not(.unapi *)),
input[type="reset"]:where(:not(.unapi *)),
input[type="submit"]:where(:not(.unapi *)),
button:where(:not(.unapi *)),
button[type="button"]:where(:not(.unapi *)),
a.button:where(:not(.unapi *)) {
  background: var(--accent);
  background-size: 100% 100%;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: #ffffff;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  text-decoration: none;
  padding: 8px 14px;
  min-width: 0;
  min-height: 36px;
  line-height: 1.2;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out);
}

input[type="button"]:where(:not(.unapi *)):hover:not([disabled]),
input[type="reset"]:where(:not(.unapi *)):hover:not([disabled]),
input[type="submit"]:where(:not(.unapi *)):hover:not([disabled]),
button:where(:not(.unapi *)):hover:not([disabled]),
button[type="button"]:where(:not(.unapi *)):hover:not([disabled]),
a.button:where(:not(.unapi *)):hover:not([disabled]) {
  background: var(--accent-hover);
  color: #ffffff;
  text-decoration: none;
}

input[type="button"]:where(:not(.unapi *))[disabled],
input[type="reset"]:where(:not(.unapi *))[disabled],
input[type="submit"]:where(:not(.unapi *))[disabled],
button:where(:not(.unapi *))[disabled],
button[type="button"]:where(:not(.unapi *))[disabled],
a.button:where(:not(.unapi *))[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--bg-elevated);
  color: var(--text-muted);
}

// Unraid's small variant
.button-small {
  min-height: 32px;
  padding: 6px 12px;
  font-size: 12px;
}

// Spacing utility used by Unraid for button rows — preserve, just modernize gap
.buttons-no-margin,
.buttons-spaced {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
```

- [ ] **Step 3: Wire the components index into modernui.scss**

Replace contents of `src/styles/modernui.scss`:

```scss
@use "tokens";
@use "unraid-tokens";
@use "base";
@use "components";
```

(Sass resolves `components` to `components/_index.scss`.)

- [ ] **Step 4: Build, deploy, visually verify**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

In browser (hard refresh):
- Open `Settings > Theme` — the Save / Disable buttons should be flat orange fill with white text, 36px tall, 6px corners
- Open `Tools > New Config` or any page with multiple buttons — they should be uniform, no uppercase, no letter-spacing, hover darkens
- Disabled buttons (e.g., during a parity check) should be muted-grey, not just opaque

- [ ] **Step 5: Commit**

```powershell
git add src/styles/components/buttons.scss src/styles/components/_index.scss src/styles/modernui.scss
git commit -m "feat(phase2): flat accent-fill buttons replacing gradient frames"
```

---

## Task 3: Tables

**Files:**
- Create: `src/styles/components/tables.scss`
- Modify: `src/styles/components/_index.scss`

- [ ] **Step 1: Create the table styles**

Contents of `src/styles/components/tables.scss`:

```scss
// Unraid uses <table> heavily — the array, shares, users, containers, VMs,
// plugins all render as tables. Classes: .unraid, .tablesorter, .disk_status,
// .array_status, .share_status, .dashboard, .legacy.
// .TableContainer wraps with overflow-x: auto.

table:where(:not(.unapi *)) {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  overflow: hidden;
}

table:where(:not(.unapi *)) th,
table:where(:not(.unapi *)) td {
  border-bottom: 1px solid var(--border-subtle);
  padding: 10px 12px;
  text-align: left;
  vertical-align: middle;
}

table:where(:not(.unapi *)) tbody tr:last-child td {
  border-bottom: none;
}

table:where(:not(.unapi *)) thead th,
table:where(:not(.unapi *)) th.tablesorter-header {
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 12px;
}

// Even-row tinting (Unraid does this on table.unraid)
table.unraid tr:nth-child(even),
table.tablesorter tbody tr:nth-child(even) {
  background-color: var(--bg-base);
}

// Row hover
table:where(:not(.unapi *)) tbody tr:hover {
  background-color: var(--bg-elevated);
}

// Row state classes — preserve Unraid's semantic colors
tr.alert {
  background-color: rgba(239, 68, 68, 0.08) !important;
  border-left: 3px solid var(--danger);
}

tr.warn {
  background-color: rgba(245, 158, 11, 0.08) !important;
  border-left: 3px solid var(--warning);
}

// Sortable indicators — Unraid uses .tablesorter-headerAsc / -headerDesc
.tablesorter-headerAsc,
.tablesorter-headerDesc {
  background-color: var(--bg-elevated);
  color: var(--text-primary);
}

// TableContainer wrapper — modern scroll behavior
.TableContainer {
  overflow-x: auto;
  border-radius: var(--radius-md);
  margin: 12px 0;
}

.TableContainer table {
  min-width: 720px;  // narrower than Unraid's 1000px default
  margin: 0;
  border-radius: 0;  // wrapper has the radius now
  border: none;
}

.TableContainer--no-min-width table {
  min-width: 0;
}

// Stopgap cells used in dashboard tables — flatten
table.dashboard td.stopgap {
  background: var(--bg-elevated);
  padding: 4px 0;
}

table.dashboard div.section {
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
}

table.dashboard div.section:last-child {
  border-bottom: none;
}
```

- [ ] **Step 2: Add to components index**

Replace contents of `src/styles/components/_index.scss`:

```scss
@forward "buttons";
@forward "tables";
```

- [ ] **Step 3: Build, deploy, verify**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

In browser:
- `/Main` — disk array table should have sticky-looking header, uppercase tiny labels, even/odd row tinting, row hover lift
- `/Shares` — shares table same treatment
- `/Docker` — containers list
- `/Plugins` — plugin list with `.tablesorter` sortable headers should show the sort arrow with our muted background

- [ ] **Step 4: Commit**

```powershell
git add src/styles/components/tables.scss src/styles/components/_index.scss
git commit -m "feat(phase2): restyle tables with modern headers, hover, and state rows"
```

---

## Task 4: Form inputs

**Files:**
- Create: `src/styles/components/forms.scss`
- Modify: `src/styles/components/_index.scss`

- [ ] **Step 1: Create the form styles**

Contents of `src/styles/components/forms.scss`:

```scss
// Unraid form inputs use bottom-border-only style + transparent backgrounds.
// We give them a full border, surface background, and modern focus ring.
// Selectors include the .unapi guard.
//
// Settings rows use a dl/dt/dd grid (35% / 1fr at ≥769px) — preserved, just
// retoned. Inputs inside dd cap at 400px (Unraid default).

input[type="text"]:where(:not(.unapi *)),
input[type="password"]:where(:not(.unapi *)),
input[type="number"]:where(:not(.unapi *)),
input[type="url"]:where(:not(.unapi *)),
input[type="email"]:where(:not(.unapi *)),
input[type="date"]:where(:not(.unapi *)),
input[type="search"]:where(:not(.unapi *)),
input[type="tel"]:where(:not(.unapi *)),
input[type="file"]:where(:not(.unapi *)),
textarea:where(:not(.unapi *)),
select:where(:not(.unapi *)) {
  background-color: var(--bg-surface);
  background-image: none;  // override Unraid's chevron-via-gradient for selects
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 13px;
  padding: 8px 12px;
  min-height: 36px;
  box-shadow: none;
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}

input:where(:not(.unapi *)):focus,
textarea:where(:not(.unapi *)):focus,
select:where(:not(.unapi *)):focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-muted);
  background-color: var(--bg-surface);
}

input:where(:not(.unapi *)):disabled,
textarea:where(:not(.unapi *)):disabled,
select:where(:not(.unapi *)):disabled {
  border-color: var(--border-subtle);
  color: var(--text-muted);
  cursor: not-allowed;
}

textarea:where(:not(.unapi *)) {
  min-height: 80px;
  resize: vertical;
}

// Selects need a custom chevron since we removed Unraid's gradient
select:where(:not(.unapi *)) {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%239aa4b2' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 12px 12px;
  padding-right: 30px;
  appearance: none;
  -webkit-appearance: none;
}

// Unraid input variants
input.narrow:where(:not(.unapi *)) { width: 150px; }
input.trim:where(:not(.unapi *))   { width: 10rem; }
select.narrow:where(:not(.unapi *)) { width: 150px; }

// Settings row grid (Unraid's dl/dt/dd pattern) — preserve layout, retune spacing
dl {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px 16px;
  margin: 12px 0;

  @media (min-width: 769px) {
    grid-template-columns: 35% 1fr;
    gap: 12px 16px;
  }
}

dl dt {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
  align-self: center;

  @media (min-width: 769px) {
    text-align: right;
  }
}

dl dd {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

dl dd input:where(:not(.unapi *)),
dl dd select:where(:not(.unapi *)),
dl dd textarea:where(:not(.unapi *)) {
  max-width: 400px;
}

// Checkbox + radio
input[type="checkbox"]:where(:not(.unapi *)),
input[type="radio"]:where(:not(.unapi *)) {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
  margin-right: 6px;
  vertical-align: middle;
}
```

- [ ] **Step 2: Add to components index**

Replace contents of `src/styles/components/_index.scss`:

```scss
@forward "buttons";
@forward "tables";
@forward "forms";
```

- [ ] **Step 3: Build, deploy, verify**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

In browser:
- `Settings > Display Settings` — every dropdown should have a chevron from our SVG, full border, focus ring matches accent
- `Settings > Identification` — text inputs should have full border instead of bottom-only line
- Any page with a form — focus should produce the orange glow, not Unraid's previous treatment

- [ ] **Step 4: Commit**

```powershell
git add src/styles/components/forms.scss src/styles/components/_index.scss
git commit -m "feat(phase2): full-border inputs with accent focus ring and custom select chevron"
```

---

## Task 5: Containers (.shade, .Panels, div.title, dashboard sections)

**Files:**
- Create: `src/styles/components/containers.scss`
- Modify: `src/styles/components/_index.scss`

- [ ] **Step 1: Create the container styles**

Contents of `src/styles/components/containers.scss`:

```scss
// Unraid's primary "box" primitive is .shade. Section headers use div.title.
// Menu overview pages use .Panels (grid of icon tiles) / .Panel.
// Dashboard widgets use table.dashboard td div.section for grouping.

// .shade — the workhorse container
.shade {
  margin-top: 16px;
  padding: 16px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: none;

  @media (min-width: 769px) {
    padding: 24px;
  }
}

// div.title — section header bar (replaces Unraid's bordered uppercase)
div.title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  margin: 0 0 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  background-color: transparent;  // Unraid had a tinted background
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

// Inside .title, secondary text gets muted
div.title small,
div.title span.title-sub {
  color: var(--text-secondary);
  font-weight: 400;
  font-size: 13px;
}

// .Panels grid — icon-tile menu pages (Tools, Plugins, etc.)
.Panels {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.Panel {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px 12px;
  transition: border-color var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out);
}

.Panel:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.Panel a {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  text-decoration: none;
  font-size: 13px;
  text-align: center;
}

.Panel a:hover {
  color: var(--accent);
}

.Panel .PanelText {
  font-size: 13px;
  font-weight: 500;
}

// Dashboard widget sections (table.dashboard td div.section already styled in tables.scss)
// Add slight surface contrast for inner widgets
table.dashboard td.stopgap {
  background: var(--bg-elevated);
}
```

- [ ] **Step 2: Add to components index**

Replace contents of `src/styles/components/_index.scss`:

```scss
@forward "buttons";
@forward "tables";
@forward "forms";
@forward "containers";
```

- [ ] **Step 3: Build, deploy, verify**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

In browser:
- `/Tools` and `/Settings` — the icon-tile grid (`.Panels`) should be modern cards with subtle hover lift
- Any page with section headers — `div.title` should be clean horizontal line with text, no chunky border or background
- `/Dashboard` — widgets should sit on slightly-elevated surface, separators clean

- [ ] **Step 4: Commit**

```powershell
git add src/styles/components/containers.scss src/styles/components/_index.scss
git commit -m "feat(phase2): modern containers (.shade, .Panels, div.title) with hover affordances"
```

---

## Task 6: Dialogs (SweetAlert)

**Files:**
- Create: `src/styles/components/dialogs.scss`
- Modify: `src/styles/components/_index.scss`

- [ ] **Step 1: Create the dialog styles**

Contents of `src/styles/components/dialogs.scss`:

```scss
// Unraid uses jquery.sweetalert for nearly all dialogs (confirms, errors, logs).
// Selectors: .sweet-overlay (backdrop), .sweet-alert (dialog container),
// .sa-icon + .sa-error/.sa-warning/.sa-info/.sa-success, .sa-button-container.
// Special variant: .sweet-alert.nchan for live log streams.

.sweet-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 10000;
}

[data-theme="light"] .sweet-overlay {
  background: rgba(15, 20, 25, 0.4);
}

.sweet-alert {
  width: 90vw;
  max-width: 480px;
  max-height: 90vh;
  padding: 24px;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
  z-index: 99999;
  overflow: auto;
}

// Title (h2)
.sweet-alert h2 {
  color: var(--text-primary) !important;  // Unraid forces a literal #575757
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px 0;
  letter-spacing: 0;
}

// Body text
.sweet-alert p {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
  margin: 0 0 16px 0;
}

// Icons — Unraid renders 80×80 circular icons; shrink slightly and align left
.sweet-alert .sa-icon {
  width: 56px;
  height: 56px;
  margin: 8px auto 16px;
  border-width: 3px;
}

.sweet-alert .sa-error  { border-color: var(--danger); }
.sweet-alert .sa-warning { border-color: var(--warning); }
.sweet-alert .sa-info    { border-color: var(--info); }
.sweet-alert .sa-success { border-color: var(--success); }

// Button container — right-align, primary on the right per modern convention
.sweet-alert .sa-button-container,
.sweet-alert .sa-confirm-button-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
  justify-content: flex-end;
}

// Buttons inside dialog — let buttons.scss handle visual; just ensure spacing
.sweet-alert button.confirm,
.sweet-alert button.cancel {
  min-width: 80px;
}

// Cancel button — outline variant (secondary)
.sweet-alert button.cancel {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-default);
}

.sweet-alert button.cancel:hover:not([disabled]) {
  background: var(--bg-elevated);
  border-color: var(--text-secondary);
}

// .nchan variant — live log streams need wide layout
.sweet-alert.nchan {
  max-width: 1200px;
  width: 95vw;
  height: 90vh;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.sweet-alert.nchan pre#swalbody,
.sweet-alert.nchan pre#swaltext {
  flex: 1;
  background: var(--bg-base);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 12px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
```

- [ ] **Step 2: Add to components index**

Replace contents of `src/styles/components/_index.scss`:

```scss
@forward "buttons";
@forward "tables";
@forward "forms";
@forward "containers";
@forward "dialogs";
```

- [ ] **Step 3: Build, deploy, verify**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

In browser, trigger a dialog:
- `/Main` → click "Stop" on the array (don't confirm — just trigger the dialog) → modern card with backdrop blur, right-aligned buttons
- Any plugin action that prompts confirmation
- View a log stream via `/Logs` or `/Tools` (uses `.nchan` variant) → mono font, full-height

- [ ] **Step 4: Commit**

```powershell
git add src/styles/components/dialogs.scss src/styles/components/_index.scss
git commit -m "feat(phase2): modern sweetalert dialogs with backdrop blur and right-aligned actions"
```

---

## Task 7: Feedback (badges, alerts, progress, scrollbar)

**Files:**
- Create: `src/styles/components/feedback.scss`
- Modify: `src/styles/components/_index.scss`

- [ ] **Step 1: Create the feedback styles**

Contents of `src/styles/components/feedback.scss`:

```scss
// Inline status indicators: badges, alerts, progress bars. Plus scrollbar polish.
// Unraid uses ad-hoc class names — these cover the common ones discovered in
// the exploration probe (tr.alert/.warn already in tables.scss).

// Generic badge — applied to <span class="badge">...</span> if Unraid uses it.
// Also paint .led-* and .status-* indicators with the semantic palette.
.badge,
span.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: var(--bg-elevated);
  color: var(--text-primary);
  white-space: nowrap;
}

.badge--success { background: rgba(34, 197, 94, 0.15); color: var(--success); }
.badge--warning { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
.badge--danger  { background: rgba(239, 68, 68, 0.15); color: var(--danger); }
.badge--info    { background: rgba(59, 130, 246, 0.15); color: var(--info); }

// Unraid's notice / warning / error inline boxes
.notice,
.message {
  padding: 12px 16px;
  border-left: 4px solid var(--info);
  background: rgba(59, 130, 246, 0.06);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-primary);
  margin: 12px 0;
  font-size: 13px;
}

.notice--warning,
.warning {
  border-left-color: var(--warning);
  background: rgba(245, 158, 11, 0.08);
}

.notice--danger,
.notice--error,
.error {
  border-left-color: var(--danger);
  background: rgba(239, 68, 68, 0.08);
}

.notice--success {
  border-left-color: var(--success);
  background: rgba(34, 197, 94, 0.08);
}

// Progress bars — Unraid uses <progress> in places, also div-based bars
progress {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--bg-elevated);
  border: none;
  overflow: hidden;
}

progress::-webkit-progress-bar {
  background: var(--bg-elevated);
  border-radius: var(--radius-full);
}

progress::-webkit-progress-value {
  background: var(--accent);
  border-radius: var(--radius-full);
  transition: width var(--duration-base) var(--ease-out);
}

progress::-moz-progress-bar {
  background: var(--accent);
  border-radius: var(--radius-full);
}

// Scrollbar styling (WebKit)
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: var(--radius-full);
  border: 2px solid var(--bg-base);
  background-clip: padding-box;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
  background-clip: padding-box;
}

// Firefox scrollbar
* {
  scrollbar-width: thin;
  scrollbar-color: var(--border-default) transparent;
}

// Horizontal rule
hr {
  border: none;
  border-top: 1px solid var(--border-subtle);
  margin: 16px 0;
}
```

- [ ] **Step 2: Add to components index**

Replace contents of `src/styles/components/_index.scss`:

```scss
@forward "buttons";
@forward "tables";
@forward "forms";
@forward "containers";
@forward "dialogs";
@forward "feedback";
```

- [ ] **Step 3: Build, deploy, verify**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

In browser:
- Any page with a `.notice` or `.warning` message — should have semantic left border
- Parity check page (if running) — progress bar should be 4px accent
- Scrollbars (e.g., long logs page) — thin, themed
- `tr.alert` / `tr.warn` rows from Task 3 should remain styled correctly (already verified)

- [ ] **Step 4: Commit**

```powershell
git add src/styles/components/feedback.scss src/styles/components/_index.scss
git commit -m "feat(phase2): badges, notices, progress bars, and themed scrollbars"
```

---

## Task 8: Phase 2 release (v0.2.0)

**Files:**
- Modify: `package.json`
- Modify: `unraid-modernui.plg`

- [ ] **Step 1: Run full test suite**

```powershell
cd "C:\Users\<user>\Documents\Projects\Unraid Theme"; npm test
```

Expected: 13 TS tests + 4 PHP tests still pass (Phase 2 is CSS-only, no test regression).

- [ ] **Step 2: Run integration test**

```powershell
$env:MODERNUI_SSH_PORT="22"; $env:MODERNUI_TEST_HOST="<your-unraid-host>"; npm run test:integration
```

Expected: install → uninstall → install round-trip passes, dynamix.cfg still has 0 markers (Phase 1 cleanup invariant), layout file has the link+script injection.

- [ ] **Step 3: Bump versions**

Edit `package.json`:

```json
  "version": "0.2.0",
```

Edit `unraid-modernui.plg` — change the version entity and prepend a CHANGES entry:

```xml
<!ENTITY version   "0.2.0">
```

And in `<CHANGES>`, add at the top:

```
###v0.2.0 (2026-05-24)
- Phase 2: component re-skin — buttons, tables, forms, containers, dialogs, badges
- Remap Unraid's semantic CSS variables to our design tokens (no per-theme CSS branching needed)
- All overrides honor Unraid's `.unapi *` scope-exclusion convention
- No DOM manipulation, no shell template changes beyond the existing v0.1.1 injection
```

- [ ] **Step 4: Final build + deploy**

```powershell
npm run build
$env:MODERNUI_SSH_PORT="22"; npm run dev-mirror -- <your-unraid-host>
```

- [ ] **Step 5: Walk the manual visual checklist**

Open `http://<your-unraid-host>/` (hard-refresh) and walk through:
- [ ] Dashboard — widgets in cards, status indicators legible
- [ ] Main (array) — table with sticky-looking header, row hover, alert rows highlighted
- [ ] Shares — same table treatment
- [ ] Users — table treatment, edit dialog modern
- [ ] Docker — container list, action buttons orange fill
- [ ] VMs — same
- [ ] Settings → Theme — our own settings page still renders fine
- [ ] Settings → Display Settings — form inputs full borders, dropdowns custom chevron
- [ ] Tools → menu — `.Panels` grid hover lift, accent border on hover
- [ ] Logs — scrollbar themed, mono font on log content
- [ ] Trigger any confirm dialog (e.g., stop array) → backdrop blur, right-aligned buttons
- [ ] Toggle Settings → Theme between dark and light → all components re-tone correctly
- [ ] Settings → Theme → Disable theme → stock UI returns; floating pill works; re-enable

If everything looks right, proceed. If any component looks broken, file a follow-up — don't block the release on cosmetic issues.

- [ ] **Step 6: Commit + tag**

```powershell
git add package.json unraid-modernui.plg
git commit -m "chore(release): v0.2.0 — Phase 2 component re-skin"
git tag -a v0.2.0 -m "Phase 2: component re-skin (buttons, tables, forms, containers, dialogs, feedback)"
```

- [ ] **Step 7: Confirm final state**

```powershell
git log --oneline -10
git tag
```

Expected: v0.2.0 tag present, ~8 new Phase 2 commits since v0.1.1.

---

## Phase 2 done

End state:
- All component patterns from spec §4 implemented as CSS overrides
- Unraid's semantic token system fully remapped to our palette
- Full integration test still passes; reversibility unchanged from Phase 1
- v0.2.0 tagged
- Phase 3 (left-sidebar shell replacement) is the next big swing

**Not yet** (deferred):

Within Phase 2 scope but deferred to a follow-up:
- **Toast notifications** — Unraid uses `ToastSetup.php`; the toast container selectors weren't surveyed in pre-plan exploration. Defer until we audit them or until Phase 3 (which rewrites the header anyway).
- **Toggle widget (pill switch)** — spec calls for 36×20 px pill switches replacing checkboxes. Unraid markup uses native checkboxes; introducing toggles requires rewriting upstream `.page` templates, which Phase 2 declined to do. Phase 3 can revisit when we touch templates.
- **Icon sprite swap (Font Awesome → Lucide-style SVG sprite)** — bigger scope. Unraid's Font Awesome usage is pervasive (`<i class="fa fa-...">` in many `.page` files). A swap touches a lot of markup. Defer to Phase 3 or a dedicated polish pass.

Later phases:
- Left sidebar replacing the top nav — **Phase 3**
- Plugin-safe footer proxy for temps/UPS/stats — **Phase 3**
- Mobile responsive transforms beyond what tokens give us — **Phase 4**
- Playwright visual regression — **Phase 5**
