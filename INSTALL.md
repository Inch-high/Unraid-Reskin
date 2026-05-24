# Install troubleshooting

## Symptoms and fixes

### "Theme installed but the webGui looks unchanged"

1. Hard-refresh your browser (Ctrl+Shift+R / Cmd+Shift+R) — Unraid caches CSS aggressively.
2. Check that `/boot/config/plugins/dynamix/dynamix.cfg` contains the `# >>> unraid-modernui begin >>>` block. If missing, re-run `php /usr/local/emhttp/plugins/unraid-modernui/include/install.php`.
3. Check that the theme isn't disabled: `ls /boot/config/plugins/unraid-modernui/disabled` — if that file exists, delete it and reinstall.

### "I broke the webGui and can't reach it"

SSH into the box and run:

```bash
touch /boot/config/plugins/unraid-modernui/disabled
php /usr/local/emhttp/plugins/unraid-modernui/include/install.php
```

This swaps the active JS to `re-enable.js` (just the pill) — your next page load will be stock Unraid with a single small pill in the corner.

If even that fails, fully remove the dynamix.cfg block and restore the layout file:

```bash
php /usr/local/emhttp/plugins/unraid-modernui/include/uninstall.php
```

### "Uninstall didn't fully revert dynamix.cfg or DefaultPageLayout.php"

The SHA-keyed backup should restore the original. If you've manually edited dynamix.cfg or the layout file since install, the backup may be older than your changes — check `/usr/local/emhttp/plugins/unraid-modernui/backups/` for the most recent `dynamix.cfg.<sha>` or `DefaultPageLayout.php.<sha>` and restore manually.

### "Settings page isn't appearing"

The page registers under `Settings > Theme`. If it's not there:

1. Confirm `/usr/local/emhttp/plugins/unraid-modernui/pages/Theme.page` exists.
2. Restart emhttpd: `/etc/rc.d/rc.nginx restart` (or simply reboot).

## Where things live

| Path | Contents |
|---|---|
| `/boot/config/plugins/unraid-modernui/settings.cfg` | Your saved preferences (persisted across reboots, flash-backed up) |
| `/boot/config/plugins/unraid-modernui/disabled` | Presence = theme disabled |
| `/boot/config/plugins/unraid-modernui/safemode` | Presence = Phase 3 safe-mode (no shell overrides applied) |
| `/usr/local/emhttp/plugins/unraid-modernui/` | The plugin payload (CSS, JS, PHP) |
| `/usr/local/emhttp/plugins/unraid-modernui/backups/dynamix.cfg.<sha>` | Pre-install backup of dynamix.cfg |
| `/usr/local/emhttp/plugins/unraid-modernui/backups/DefaultPageLayout.php.<sha>` | Pre-install backup of the layout file |
| `/usr/local/emhttp/plugins/unraid-modernui/theme/dist/loader.js` | Install-time-generated bootstrap — sets data-modernui-* attrs and loads modernui.js or re-enable.js |
