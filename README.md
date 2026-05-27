# Unraid ModernUI

A clean, flat, responsive theme for Unraid 7.x. Inspired by TrueNAS SCALE with refined Unraid orange accent.

> ⚠️ **Unofficial hobby project — not affiliated with, endorsed by, or supported by Lime Technology, Inc.** See [Disclaimer](#disclaimer) before installing.

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

## Disclaimer

**This is a personal hobby project. Install at your own risk.**

- **Not affiliated.** I'm not affiliated with, endorsed by, sponsored by, or in any way officially connected to Lime Technology, Inc., the makers of Unraid®. "Unraid" and the Unraid logo are trademarks of Lime Technology, Inc. — all rights reserved by their respective owners. This project is independent fan work that re-skins the stock web UI on a user's own server; it is not a fork of Unraid and does not redistribute any Unraid code.
- **Not supported by Unraid.** Don't ask the Unraid forums or Lime Tech for help with this theme. Bugs / questions / feature requests go in [GitHub Issues](https://github.com/Inch-high/Unraid-Reskin/issues) on this repo only. If you have a Lime Technology support contract, this plugin is **not** covered by it.
- **Hobby quality.** This is something I built for my own server in my spare time. There is no roadmap, no SLA, no guarantee of compatibility with future Unraid releases, and no promise that I'll keep maintaining it. Stuff will break. Some of it has not been tested outside my own homelab.
- **Vibe coded.** Roughly ~90% of the code in this repo was written with heavy AI assistance (Claude). I review and test the output, but the volume of code is far greater than I could hand-write in spare-time hours, and AI-generated code can absolutely contain subtle bugs, edge cases, or security mistakes that a human reviewer (me) misses. Read the code before trusting it.
- **No warranty.** The plugin is provided "AS IS", without warranty of any kind, express or implied — including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement. In no event shall the author be liable for any claim, damages, or other liability — including data loss, downtime, container breakage, or anything else — arising from or in connection with the plugin or its use. **You take full responsibility for installing it on your server.**
- **It's a theme, but Unraid is your data.** Always have working backups before installing any third-party plugin. Four independent fallback paths back to the stock UI are documented above ([Fallback to stock UI](#fallback-to-stock-ui-any-time-instantly)) — know how to use them before you need them.

If any of the above makes you uncomfortable, don't install this. Stick with the stock UI — it's good.

## License

MIT (see source). The MIT license governs *this project's own code*. It does **not** grant any rights to Unraid, the Unraid name, the Unraid logo, or any Lime Technology trademarks or copyrighted material.
