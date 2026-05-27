# Phase 5: Docker tab rebuild — replace, with built-in folders + tags

**Date:** 2026-05-27
**Scope:** Replace Unraid's `/Docker` page rendering surface with a clean Lit-based UI that bundles folder management, tagging, search, and filtered/bulk operations. Reuses Unraid's existing docker backend (action endpoints, nchan streams) — we replace **only the front-end**. Ships as v0.5.0.
**Status:** Draft for review

## Problem

Unraid's stock `/Docker` page (`dynamix.docker.manager/DockerContainers.page`) has three layered problems:

1. **Performance bugs by design.** As documented in [unraid/webgui#2641](https://github.com/unraid/webgui/pull/2641), the page does synchronous external network calls (Tailscale DERP map, version JSON), `docker exec` shells per container per poll, and N×N filesystem scans for icon resolution — all on the request thread. Even after that fix lands, the front end remains a jQuery + table + per-row context-menu architecture that's hard to extend.
2. **Categorisation requires a community plugin.** Container grouping is provided by the third-party `folder.view2` plugin. Users without it get a flat list of N tiles; users with it get groups but no tags, no cross-cutting filters, no search across groupings.
3. **No first-class search/filter/bulk actions.** Stock UX is "scroll, right-click, action one container at a time". Power users with 30+ containers (the project author included) need filter chips, tag filters, multi-select bulk actions.

Phase 3 added a *summary* of docker state to the dashboard ([md-docker-card.ts](../../../src/ts/dashboard/components/md-docker-card.ts)) that reads from the stock page DOM. The dashboard pattern *overlays* — keep stock alive, hide it, render over it. That works for read-only summaries but fails for `/Docker` itself, where users actually manage containers.

## Solution

### Architecture: replace, don't overlay

We extend the existing SHA-keyed backup-and-replace mechanism from [install.php](../../../package/include/install.php) (currently used for `DefaultPageLayout.php`) to cover **one** new file:

| Path | Action | Why |
|---|---|---|
| `dynamix.docker.manager/DockerContainers.page` | **Replace** with our ~50-line shell that mounts `<modernui-docker-page>` | Only file we own; deterministic, one-shot SHA backup |
| `dynamix.docker.manager/include/DockerContainers.php` | **Untouched** | Backend stays Unraid's — including #2641's `getAllInfo()` caching |
| `dynamix.docker.manager/include/Events.php` | **Untouched** | Action API (start/stop/restart/pause/remove). We POST to it like the stock UI does. |
| `dynamix.docker.manager/nchan/*` | **Untouched** | Live updates stay on Unraid's existing streams |

Safe-mode behaviour: at every `disks_mounted` event, `upgrade.php` SHAs the current `DockerContainers.page` against the recorded original. If Unraid changed it underneath us, we restore the original and add `data-modernui-docker="safe-mode"` to `<html>` so the front-end skips its overlay. A dashboard banner offers an update check.

### Why replace, not overlay (vs Phase 3)

| Concern | Overlay (dashboard) | Replace (docker) |
|---|---|---|
| Initial paint | Stock paints, then we cover with opaque background | Only our UI ever paints |
| Live data path | Read hidden DOM after each mutation | Subscribe directly to nchan; no DOM parsing |
| Brittleness to Unraid class renames | High — extractor selectors break | None — we own the markup |
| Brittleness to upstream PHP changes | None | Mitigated by SHA check + safe mode |
| Performance | Double-render (stock + ours) | Single render |
| Fit for *management* surfaces (vs read-only) | Awkward — actions must go through stock JS globals | Native — wired to documented endpoints |

`/Dashboard` is read-only, summarises 15 widget types, and stock JS keeps live `usage-disk` bars updating that we want to consume — overlay is correct. `/Docker` is one widget type, action-heavy, and we want to remove the stock rendering anyway — replace is correct.

### Bugs from #2641 we explicitly avoid

The new front-end enforces these as architectural invariants, not best-effort guidelines:

| Bug class | Our enforcement |
|---|---|
| Synchronous external network calls in page render | Page template is data-less. All data comes from a single one-shot `docker-state.php` fetch + the existing nchan subscription. No `wget`/`curl` anywhere in our code path. |
| Blocking `docker exec` per container per poll | We never shell into containers. If a future feature needs container introspection, it lives in a self-exiting nchan worker under our `nchan/` directory (the pattern #2641 introduced). |
| N×N filesystem scans per render | Icon URLs come from `getAllInfo()`'s already-cached `$tmp['icon']` field. We never re-resolve client-side. |
| `<script>` tag accumulation on every poll | Lit's reactive store + targeted `render()`. Zero `document.createElement('script')` in our code. ESLint rule + grep test in CI. |
| Polling when tab hidden | Single `src/ts/docker/lifecycle.ts` helper wraps every subscription. Pauses message processing on `document.hidden`, triggers a one-shot resync on `visibilitychange`. |
| Per-row event handler explosion | One subscription, one store. Components receive slices via Lit `@property`. |

### Data model

```ts
// src/ts/docker/types.ts
interface DockerContainerFull {
  name: string;
  id: string;                    // short docker id
  image: string;
  state: 'started' | 'stopped' | 'paused' | 'unknown';
  autostart: boolean;
  uptime: string | null;
  cpuPct: number | null;         // live from nchan
  memBytes: number | null;       // live from nchan
  webuiUrl: string | null;
  iconUrl: string;               // pre-resolved by backend
  ports: { host: string; container: string; proto: string }[];
  updateAvailable: boolean;
  templatePath: string;          // /boot/config/plugins/dockerMan/templates-user/my-X.xml
}

interface DockerFolder {
  id: string;                    // uuid (stable across rename)
  name: string;
  icon: string;                  // lucide icon name
  color: string;                 // hex
  containerNames: string[];      // ordered membership
}

interface DockerTag {
  id: string;
  name: string;
  color: string;
}

interface DockerPageState {
  containers: DockerContainerFull[];
  folders: DockerFolder[];
  tags: DockerTag[];
  tagAssignments: Record<string, string[]>;  // containerName → tagId[]
}
```

### Persistence

Two new JSON files on the flash drive (survives reboots, included in Unraid flash backups):

```
/boot/config/plugins/unraid-modernui/
├── settings.cfg              (existing)
├── docker-folders.json       NEW
├── docker-tags.json          NEW
└── disabled                  (existing)
```

`docker-folders.json` shape:
```json
{
  "version": 1,
  "folders": [
    { "id": "f-7d3e", "name": "Media", "icon": "film", "color": "#ff8c2f",
      "containerNames": ["plex", "sonarr", "radarr", "tautulli"] }
  ]
}
```

`docker-tags.json` shape:
```json
{
  "version": 1,
  "tags": [
    { "id": "t-9a1c", "name": "gpu", "color": "#22c55e" },
    { "id": "t-4b2e", "name": "external", "color": "#3b82f6" }
  ],
  "assignments": {
    "plex": ["t-9a1c", "t-4b2e"],
    "ollama": ["t-9a1c"]
  }
}
```

Stored by container *name* (not docker id) because ids change on recreate. If a container is renamed, the user's folder/tag membership is best-effort recovered via a small UI nudge ("X containers in folder Media no longer exist — clean up?").

### Endpoints (new, under our plugin)

| Method | Path | Purpose |
|---|---|---|
| GET | `/plugins/unraid-modernui/include/docker-state.php` | One-shot snapshot. Calls Unraid's `DockerContainers::getAllInfo()`, layers our folders/tags, returns typed JSON. Replaces HTML-scraping. |
| POST | `/plugins/unraid-modernui/include/save-docker-folders.php` | CSRF-checked, validates JSON shape, atomic `LOCK_EX` write to `docker-folders.json`. |
| POST | `/plugins/unraid-modernui/include/save-docker-tags.php` | Same, for `docker-tags.json`. |

All actions (start/stop/restart/pause/remove/update) POST to **Unraid's** `/plugins/dynamix.docker.manager/include/Events.php` — same endpoint stock UI uses.

### Page-level data flow

```
User navigates to /Docker
  ↓
DockerContainers.page (our replacement, ~50 lines of PHP — mounts <modernui-docker-page>)
  ↓
Lit boot, in parallel:
  • GET /plugins/unraid-modernui/include/docker-state.php   (full snapshot, ~1 KB per container)
  • new NchanSubscriber('/sub/dockerload')                  (live cpu/mem/state deltas)
  ↓
First paint (~1 frame after fetch resolves)
  ↓
Reactive store; Lit components re-render slices on delta
  ↓
visibilitychange listener:
  • on hide: stop processing nchan messages (socket stays open, cheap)
  • on show: one-shot /docker-state.php resync, then resume delta processing
```

No `setTimeout` polling. No `$('head').append('<script>')`. No `docker exec`. No `wget`.

### Component tree

```
<modernui-docker-page>             Owns store + nchan subscription + URL state (search/filter via querystring)
├── <md-docker-toolbar>            Search box · filter chips (state/folder/tag) · density toggle · "Add container" link to stock
├── <md-docker-bulk-bar>           Visible only on selection. Start/Stop/Restart/Update/Remove on N selected.
├── <md-docker-folder-section>     One per folder (collapsible). Header has bulk-select-folder + folder edit.
│   └── <md-docker-row>            Per container — icon · name · image · ports · uptime · tags · state · actions menu
├── <md-docker-folder-section>     "Ungrouped" — implicit, always last
├── <md-docker-folder-modal>       Hidden until invoked. CRUD folders + drag-drop assignment.
└── <md-docker-tag-modal>          Hidden until invoked. CRUD tags + per-container chip assignment.
```

### Folder management — out of the box

Replaces the role of `folder.view2`. Migration path:

1. On first boot of v0.5.0, if `/boot/config/plugins/folder.view/folder.cfg` exists AND our `docker-folders.json` doesn't, show a one-time migration dialog: *"Import 4 folders from folder.view? [Import] [Skip]"*.
2. On Import, we parse `folder.cfg`, create equivalent ModernUI folders, write `docker-folders.json`. folder.view2 stays installed; its mutations no longer have a render target (because we replaced the page).
3. Document folder.view2 as "superseded" in [docs/compatibility.md](../../compatibility.md). Recommend (but don't force) uninstalling it.

Folder operations:
- **Create** — name + icon picker (Lucide subset) + color picker (8 swatches)
- **Rename / recolor / change icon** — inline
- **Delete** — containers fall back to Ungrouped, never deleted
- **Reorder folders** — drag handles
- **Assign containers** — drag-drop between folders in the manager modal; also via "Move to folder" item in the per-container action menu

### Tagging — out of the box

Independent of folders. A container can be in 0–1 folder AND have 0–N tags. Use cases: cross-cut by purpose (`gpu`, `arr-stack`, `external`), by health (`needs-attention`), by lifecycle (`experimental`).

Tag operations:
- **Create** — name + color
- **Edit / delete** — confirmation if assigned
- **Assign / unassign** — chip click in row's tag area opens a popover with checkbox list; also drag chips from manager modal onto rows
- **Filter** — click a tag chip in the toolbar to filter the list to containers carrying it; multi-tag = AND

### Search

Single text input. Matches case-insensitively across:
- Container name (`plex`)
- Image name (`linuxserver/plex`)
- Folder name (`Media`)
- Tag names (`gpu`)
- Port numbers (`32400`)

URL-synced (`/Docker?q=plex&tag=gpu&state=stopped`) so users can bookmark a filtered view.

### Bulk actions

Row checkbox selection. Bulk bar appears at top when N > 0:

| Action | Behaviour |
|---|---|
| Start / Stop / Restart / Pause | Sequential POST to `Events.php` with `concurrency=4` cap. Per-row status indicator while pending. |
| Update check | Spawns Unraid's existing update path per container |
| Move to folder | Single update to `docker-folders.json` |
| Add / remove tag | Single update to `docker-tags.json` |
| Remove | Confirmation modal listing N containers. Same path as stock Remove. |

### Per-container actions (single-row menu)

Same set, plus:
- **WebUI** — opens the URL from `getAllInfo()`'s resolved `Url`
- **Logs** — opens stock log window via `popup('/plugins/dynamix.docker.manager/include/Logging.php?container=...')`
- **Console** — opens stock console window
- **Edit** — navigates to `/Docker/UpdateContainer?xmlTemplate=...` (stock form, out of scope to rewrite)

### Density + responsive

Respects `<html data-modernui-density>` from the shared settings:
- **Comfortable**: row height 56px, icon 32×32, ports visible inline
- **Compact**: row height 40px, icon 24×24, ports collapse into a hover tooltip

Below 640px: rows become two-line cards, action menu becomes a long-press / overflow button, bulk bar slides up from bottom.

## Out of scope for v0.5.0

- Replacing **Add Container** / **Edit Container** forms (`dynamix.docker.manager/DockerTemplate.php`). Huge PHP form, would double the implementation cost. We link out to it.
- Custom networks management (`/Docker/Network*`).
- Docker settings page (`/Settings/DockerSettings`).
- Container console terminal (we link to the stock popup).

## Acceptance criteria for v0.5.0

1. `/Docker` renders the modern page on fresh install; `?modernui=off` falls back to stock instantly.
2. SHA-keyed backup of `DockerContainers.page` exists in `/usr/local/emhttp/plugins/unraid-modernui/backups/`; uninstall byte-restores it.
3. Page first-paint completes in <250ms on a box with 30 containers (measured via Lighthouse on the test rig).
4. Zero synchronous external HTTP and zero `docker exec` calls in our PHP code path (verified by `grep -E 'curl|wget|docker exec'` against `package/include/`).
5. Zero `<script>` element creation post-boot (verified by a Playwright test that polls `document.scripts.length` for 30 seconds — must stay constant).
6. Hidden-tab pause: with tab backgrounded for 60s, no nchan message processing on the JS side (verified by a counter in the lifecycle helper).
7. Folder migration from `folder.view2` works one-shot; subsequent edits don't re-trigger it.
8. Search + filter + tag chip combinations work; URL reflects state; bookmarkable.
9. Bulk start/stop on 10 containers completes without UI freeze (concurrency=4).
10. Safe mode triggers when `DockerContainers.page` SHA drifts from backup; banner appears; stock UI renders.

## Open questions

- Exact action shape for `Events.php` POST body — needs a fixture capture from the test rig.
- Whether `getAllInfo()` returns `Url` and `Icon` consistently after #2641 lands vs before (we should test both).
- Whether nchan `/sub/dockerload` is the only stream we need or if state changes use a separate channel.
- Whether `folder.view2`'s `folder.cfg` is named `folder.cfg` or something else on disk (confirm against a test install).

## Implementation note for the planning phase

Before writing the plan, capture three live fixtures from the test rig (under `src/ts/docker/__fixtures__/`):
- `DockerContainers.page` rendered HTML
- Response body of one `/plugins/dynamix.docker.manager/include/Events.php?action=start&...` POST
- One full nchan message from `/sub/dockerload`

These are the empirical surface our front-end binds against. Without them we're designing on assumptions.
