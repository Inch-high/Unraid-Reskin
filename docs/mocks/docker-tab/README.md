# Docker tab — design mocks

Static HTML/CSS mocks of the proposed `/Docker` rebuild. Visual review **before** any Lit components or PHP endpoints are written.

Tokens, fonts, radii, dot colours all mirror [src/styles/tokens.scss](../../../src/styles/tokens.scss) so what you see here is what the shipped UI will look like.

## Open the mocks

Double-click any file (Windows opens it in the default browser), or in a terminal:

```bash
# from repo root
start docs/mocks/docker-tab/index.html
```

| File | Shows |
|---|---|
| [index.html](index.html) | Main `/Docker` page — folder sections, search, filter chips, row state badges, action menu, bulk-action bar (sticky, visible because 2 rows are selected) |
| [folder-manager.html](folder-manager.html) | Folder Manager modal — CRUD folders, color/icon picker, drag-drop container assignment, system "Ungrouped" folder |
| [tag-manager.html](tag-manager.html) | Tag Manager modal — CRUD tags, per-container chip assignment with search filter |

## What the mocks demonstrate

- **Replace, not overlay.** Only ModernUI markup paints. Compare to the dashboard pattern at [src/styles/dashboard-overlay.scss](../../../src/styles/dashboard-overlay.scss) which stacks stock + ours.
- **Folders + tags out of the box.** No dependency on `folder.view2`. See [docs/superpowers/specs/2026-05-27-docker-tab-rebuild-design.md](../../superpowers/specs/2026-05-27-docker-tab-rebuild-design.md) for the persistence model.
- **Search · filter · bulk actions** as first-class UI. Stock `/Docker` has none of these.
- **Performance discipline from [unraid/webgui#2641](https://github.com/unraid/webgui/pull/2641):** zero `<script>` injection, zero blocking I/O on the request path, single nchan subscription, hidden-tab pause. The mocks don't *demonstrate* this (they're static), but the spec encodes it as acceptance criteria.

## What's NOT in scope for the rebuild (intentionally)

- Add Container / Edit Container forms — link out to stock
- Custom networks UI
- Settings → Docker Settings page
- Container console terminal — link to stock popup

## Iterating on the visual design

All visual values flow from [mock.css](mock.css). Tweak there to evolve the look. Once the design is signed off:

1. Build the real components under `src/ts/docker/components/*.ts` (Lit, same pattern as `src/ts/dashboard/components/`)
2. Move per-component styles from `mock.css` into each component's `static styles = css\`...\`` block
3. Wire the data layer (`docker-state.php` + nchan subscription + `docker-folders.json` / `docker-tags.json` endpoints)

## Real container data

Container names + states in the mocks are taken from the project's existing dashboard fixture at [src/ts/dashboard/extractors/__fixtures__/docker_view.html](../../../src/ts/dashboard/extractors/__fixtures__/docker_view.html) — the same 47-container set, so the visual density is honest.

Container icons in the mocks come from [walkxcode/dashboard-icons](https://github.com/walkxcode/dashboard-icons) for convenience. The real plugin uses Unraid's resolved icon path from `getAllInfo()` (see [DockerClient.php](https://github.com/unraid/webgui/blob/main/emhttp/plugins/dynamix.docker.manager/include/DockerClient.php) — `$tmp['icon']`).
