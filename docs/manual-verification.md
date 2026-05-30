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

## Pre-release: /Main rebuild (Phase 6, v0.6.0)

Open `<host>/Main` (hard-refresh) with the array **Started**:

- [ ] **Devices 1:1** — every device the stock page lists appears with matching name, **model + serial**, state orb (active/standby/disabled/missing), temperature, reads, writes, errors, FS type, size, used, free, utilization. Spot-check 2–3 against `cat /var/local/emhttp/disks.ini`.
- [ ] Array totals, each pool (status pill + profile + usage), and the Boot/flash device render.
- [ ] **Array Operation** — Start/Stop label + enabled state match stock; busy (parity/mover) disables Stop with a reason.
- [ ] Parity **Check** (+ "Write corrections"), Pause/Resume/Cancel + progress while running, last-check summary.
- [ ] Spin Up all / Spin Down all / Clear Stats; Move (if mover enabled); Reboot/Shutdown confirm first.
- [ ] **Encrypted array** (if applicable, array Stopped): passphrase/keyfile inputs appear only when a key is needed; Start disabled until valid; "permit reformat" is off by default and requires the second acknowledgement before Start enables.
- [ ] **Actions hit stock backend** — Stop then Start the array; Spin Down all; Clear Stats → each produces the same `emhttp` result as the stock button (verify in DevTools Network: POST to `/update.htm` / `ToggleState.php`).
- [ ] **Live updates** — spin a disk down/up; the row + button gating update within a debounce window without a manual reload.
- [ ] **Unassigned Devices** (if plugin installed) — card shows unassigned disks, Remote SMB/NFS/ISO shares, and Historical (previous) devices; Mount/Unmount a remote works; **no share password appears** in the `ud-state.php` response (DevTools → Network).
- [ ] **Fallbacks** — Settings → Theme → **Main: Stock** restores the stock `/Main` (and the stock Unassigned Devices section returns); switching back to Modern re-applies. `?modernui=off` bypasses for one load. Uninstall restores all replaced pages byte-for-byte.
- [ ] No console errors on `/Main`.
