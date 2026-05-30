# Plugin compatibility matrix

Status of community plugins that contribute UI into Unraid's footer or other shared surfaces.

| Plugin | Last tested version | Status | Notes |
|---|---|---|---|
| Dynamix System Temperature | _untested_ | — | Phase 3: render in sidebar System Status footer |
| Dynamix System Statistics | _untested_ | — | Phase 3: render in sidebar System Status footer |
| Dynamix UPS | _untested_ | — | Phase 3: render in sidebar System Status footer |
| Unassigned Devices | tested on 7.3.1 | generic-mirrored | Phase 6: its `/Main` section (`UnassignedDevices.page`, `Main:4`) is suppressed and folded into the Modern UI Unassigned Devices card (disks + remote SMB/NFS/ISO shares + historical, with Mount/Unmount). Tracked **separately** from the core Main pages and **excluded from the safe-mode loop** — a plugin update can't disable the Main rebuild; if UD reclaims its page on update, the modern card auto-hides and the stock section returns until the theme is reinstalled. Advanced ops (format/preclear/settings/scripts/add-share) → Main: Stock. |

**Status meanings:**
- **first-class** — recognized by selector, styled to match the theme
- **generic-mirrored** — content preserved in a generic "Plugins" sidebar slot, basic styling
- **known-broken** — actively breaks under the theme; tracked in GitHub issues until fixed

Phase 1 does not interact with these plugins — bottom bar remains in stock Unraid form.

## Replaced stock files (SHA-backed up, safe-mode guarded)

Phases 5–6 replace whole Unraid `.page` files (not in-place patches). Each original is SHA-backed-up under `/usr/local/emhttp/plugins/unraid-modernui/backups/` on install; uninstall, Disable, and the per-page Stock toggle restore it byte-for-byte. On each `disks_mounted`, `upgrade.php` re-verifies the SHA — if Unraid changed a file underneath us, the original is restored and `safemode` is set so the stock page renders.

| File | Phase | Notes |
|---|---|---|
| `dynamix.docker.manager/DockerContainers.page` | 5 | `/Docker` rebuild |
| `dynamix/ArrayDevices.page` (`Main:1`) | 6 | carries the single `#modernui-main-root` mount |
| `dynamix/CacheDevices.page` (`Main:2`) | 6 | emptied (content rendered by the mount) |
| `dynamix/BootDevice.page` (`Main:3`) | 6 | emptied |
| `dynamix/ArrayOperation.page` (`Main:5`) | 6 | emptied; **`Nchan` attribute preserved** so emhttp keeps publishing the live channels |
| `unassigned.devices/UnassignedDevices.page` (`Main:4`) | 6 | only if the plugin is present; **not** in the safe-mode loop (see table above) |
