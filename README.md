# Unraid ModernUI

A clean, flat, responsive theme for Unraid 7.x. Inspired by TrueNAS SCALE with refined Unraid orange accent.

> **Phase 1 status:** Design-token-only re-tone (dark/light body color, accent, focus rings). Full UI overhaul — sidebar, restyled components, mobile responsive — lands in later phases.

## Install

Two options:

**1. Community Apps** (once published) — search for "Modern UI".

**2. Direct URL** — Unraid → Plugins → Install Plugin → paste:
```
https://raw.githubusercontent.com/EXAMPLE/unraid-modernui/main/unraid-modernui.plg
```

After install, open **Settings → Theme** to configure.

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
