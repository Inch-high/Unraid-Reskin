# Manual verification checklist (run before every release)

## Fallback paths

1. **In-theme Disable button** — Settings > Theme > Disable theme -> body returns to stock, pill appears, loader.js targets re-enable.js
2. **Floating re-enable pill** — Click pill -> theme returns, loader.js targets modernui.js
3. **URL parameter** — `?modernui=off` -> stock UI for that load only, no `[modernui]` console log
4. **SSH disabled flag** — `touch /boot/config/plugins/unraid-modernui/disabled` + reinstall -> stock UI; remove flag + reinstall -> theme back

## Other v0.1 acceptance criteria

5. Install/uninstall round-trip leaves dynamix.cfg byte-identical (covered by `tests/integration/install-uninstall.mjs`)
6. Settings page persists values across reloads
7. `<html data-theme>` matches the Settings > Theme > Color mode choice (Dark/Light/System honoring prefers-color-scheme)

## Pre-release: automated checks

Run:

```bash
# Local unit tests
npm test

# Live install round-trip
MODERNUI_TEST_HOST=<your-unraid-host> MODERNUI_SSH_PORT=22 npm run test:integration
```

Both must pass before tagging a release.

## Pre-release: manual browser checks (cannot be automated)

After the integration test, the theme should be installed. Open the Unraid webGui (hard-refresh: Ctrl+Shift+R) and verify:

- [ ] Body background changes (dark/light per system pref) — DevTools -> Elements -> `<body>` -> `background-color`
- [ ] Settings > Theme appears in nav and renders the five-toggle form
- [ ] Toggling color mode in the form changes the `<html data-theme>` attribute on next reload
- [ ] Clicking "Disable theme" reloads to stock UI with the orange floating pill bottom-right
- [ ] Clicking the floating pill re-enables the theme
- [ ] Navigating to `<host>/Main?modernui=off` shows stock UI for that page only (param doesn't persist)
- [ ] Browser console has `[modernui] booting v0.1.0` log when enabled, nothing when `?modernui=off`
