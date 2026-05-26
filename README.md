# Unraid ModernUI

A clean, flat, responsive theme for Unraid 7.x. Inspired by TrueNAS SCALE with refined Unraid orange accent.

> **v0.4.0-beta status:** Phase 4 shell (left sidebar + slim topbar) shipping alongside the Phase 3 Modern Dashboard. Plugin proxy targets the Unraid 7.2 DOM; the v0.4.1 follow-up re-sources it for Unraid 7.3 Vue chrome.

## Install

Two options:

**1. Community Apps** (once published) — search for "Modern UI".

**2. Direct URL** — Unraid → Plugins → Install Plugin → paste:
```
https://raw.githubusercontent.com/Inch-high/Unraid-Reskin/main/unraid-modernui.plg
```

After install, open **Settings → Theme** to configure.

## Optional plugin dependencies

The base theme (tokens, components, shell) works on any Unraid 7.x install with no extra plugins. Some Modern Dashboard cards pull their data from third-party plugins — install only the ones you want to surface. If a plugin is absent the corresponding card is skipped, the rest of the dashboard renders normally.

| Dashboard card | Required plugin (Community Apps name) |
|---|---|
| Disk Location | **Disk Location** |
| GPU | **GPU Statistics** |
| IPMI | **IPMI** (ipmi-tools) |
| UPS | **NUT** (Network UPS Tools) or **APC UPS** (stock apcupsd, configured via Settings → UPS Settings) — either works |
| Processor → CPU temperature line | **Dynamix System Temperature** |
| Processor → Total Power line | A power-monitoring plugin (e.g. Dynamix System Statistics with RAPL/IPMI, or PerfMon) |

Built-in cards (Array, Cache, Parity, Memory, Docker, VMs, Interface, Identity, Motherboard, Shares, Users) need nothing extra.

## Fallback to stock UI (any time, instantly)

Four independent escape hatches — all safe to use on a production install:

1. **Settings → Theme → Disable theme** — instant revert, plugin stays installed
2. **Floating pill** — appears in the bottom-right when theme is disabled, click to re-enable
3. **URL param** — append `?modernui=off` to any Unraid page for a single-load bypass
4. **SSH** — `touch /boot/config/plugins/unraid-modernui/disabled` then restart Unraid

## Develop

Requires Node.js 20+, PHP 8.x on PATH, OpenSSH client (Windows 10+ has it built-in).

```bash
npm install
npm run build        # Sass + Vite → package/theme/dist/
npm test             # Unit tests (TypeScript + PHP)
MODERNUI_SSH_PORT=22 npm run dev-mirror -- root@<your-unraid-host>   # Build + scp + remote install
```

Run the integration test (assumes you have a test Unraid box reachable over SSH):

```bash
MODERNUI_TEST_HOST=root@<host> MODERNUI_SSH_PORT=22 npm run test:integration
```

See [INSTALL.md](INSTALL.md) for install troubleshooting and [docs/manual-verification.md](docs/manual-verification.md) for the pre-release checklist.

## License

MIT
