# Main page fixtures

Captured (read-only) from the live rig **Unraid 7.3.1** (`HL15Rack`) and hand-authored
state variants. These are the empirical surface `main-state.php`, `derive.ts`, and
`actions.ts` bind against. Serials are retained intentionally (the box owner wants them
shown); `csrf_token` is `REDACTED` in every fixture.

## Inventory

| File | Source | Represents |
|---|---|---|
| `disks.ini.sample` | captured | Live device list: 2 parity (HDD), 12 data (luks:xfs, spun-down), 4-disk NVMe `cache` pool (luks:zfs raidz1), `flash`. Encryption `luksState=1` (unlocked). |
| `var.ini.sample` | captured | Array **STARTED / Started**, protected (`mdColor=green-on`), parity idle (`mdResync=0`), config valid. |
| `var-stopped.ini` | authored | Array cleanly **STOPPED**, config valid → Start enabled. |
| `var-new-array.ini` | authored | **NEW_ARRAY** / new data disks → Start enabled with parity-overwrite/new-disk note. |
| `var-disable-disk.ini` | authored | **DISABLE_DISK** → Start gated behind `confirmStart`. |
| `var-config-invalid.ini` | authored | `configValid=invalid` → Start disabled with reason. |
| `var-parity-running.ini` | authored | **STARTED** + correcting parity check in progress (`mdResync>0`, `mdResyncCorr=1`). |
| `disks-enc-missing.ini` | authored | luks data disks `luksState=2` → encryption mode **missing-key**. Pair with `var-stopped.ini`. |
| `disks-enc-wrong.ini` | authored | `luksState=3` → **wrong-key** (offers guarded "permit reformat"). |
| `disks-enc-enter-new.ini` | authored | luks members, `luksState=0` → **enter-new** (passphrase + retype). |
| (unlocked mode) | — | use `disks.ini.sample` (`luksState=1`) → **unlocked**, no key inputs. |

> **Encryption mode lives in `disks.ini`, not `var.ini`.** `deriveEncryption(disks, var)`
> reads per-disk `luksState` (1=present/unlocked, 2=missing, 3=wrong; 0 + luks/auto fsType
> = enter-new) per `ArrayOperation.page` lines 19–50. The plan's original `var-encrypted-*.ini`
> naming was corrected to `disks-enc-*.ini` to reflect this.

## nchan channels (subscribe `/sub/<chan>`)

Documented from `ArrayOperation.page` JS (browser capture is auth-gated on the rig).
The overlay `ArrayOperation.page` must preserve `Nchan="device_list,disk_load,parity_list"`
so `emhttp` keeps publishing these.

| Channel | Payload | Use |
|---|---|---|
| `/sub/devices` | JSON map `{ "<rowId>": "<td>…</td>…", …, "stop": 0\|1 }`; `meta.id.channel()` 0=device rows, 1=running-parity status lines `#line0..#line5` | live temps / reads / writes / errors / spin state / FS used-free; trigger snapshot resync |
| `/sub/mymonitor` | single int: `0` idle, `1` parity, `2` mover, `3` btrfs op | gate Stop/Mover/Spin enabled state + reason text |
| `/sub/arraymonitor` | `1` → array config changed | schedule resync |
| `/sub/fsState` | transitional state string (`*ing`) into `#fsState`, or `stop` | reflect Starting/Stopping/… |
| `/sub/paritymonitor` | `1` → parity started/stopped while idle | resync |
| `/sub/mainPingListener` | liveness ping | keep daemon publishing |

v1 plan: on any signal → debounced (200ms) `fetchSnapshot()` (re-parse `disks.ini`+`var.ini`).
`mymonitor` int is parsed directly into `operation.busy` for instant button gating.

## Action endpoints & params (from ArrayOperation.page / ToggleState.php / Boot.php)

All actions reuse Unraid's stock endpoints; `emhttp` executes. Include `csrf_token`.

| Action | Endpoint | Params |
|---|---|---|
| Start | `POST /update.htm` (target `progressFrame`) | `startState=<mdState>`, `cmdStart=Start` (+`startMode=Maintenance`, +`luksKey=base64(pass)`, +`luksReformat`, +`md_invalidslot=99`) |
| Encrypted-Start precheck | `POST /webGui/include/Report.php` | `cmd=state`, `pools=<csv>` — non-empty response aborts |
| Keyfile upload (pre-Start) | `POST /update.php` | `#file=unused`, `#include=webGui/include/KeyUpload.php`, `file=<base64 dataURL>` |
| Stop | `POST /update.htm` | `startState=<mdState>`, `cmdStop=Stop` |
| Format | `POST /update.htm` | `cmdFormat=Format`, `unmountable_mask=<fsUnmountableMask>`, `confirmFormat` |
| Parity Check | `POST /update.htm` | `cmdCheck=Check` (+`optionCorrect=correct`) |
| Sync / Clear | `POST /update.htm` | `cmdCheckSync=Sync` / `cmdCheckClear=Clear` |
| Pause / Resume | `POST /webGui/include/ParityControl.php {action:'pause'\|'resume'}` then `POST /update.htm cmdCheckPause`/`cmdCheckResume` |
| Cancel | `POST /update.htm` | `cmdCheckCancel=` |
| Spin up/down (all/disk/pool) | `POST /webGui/include/ToggleState.php` | `device=up`\|`down` (+`name=<disk>` \| `poolName=<pool>`) |
| Clear stats | `POST /webGui/include/ToggleState.php` | `device=Clear` |
| Mover | `POST /update.htm` | `cmdStartMover=Move`\|`Empty` |
| Reboot / Shutdown | `POST /webGui/include/Boot.php` | `cmd=reboot`\|`shutdown` (+`safemode`) |
| Delete keyfile | `POST /update.php` | `#file=unused`, `#include=webGui/include/KeyUpload.php`, `#apply=Delete` |

### Encrypted Start flow (prepareInput, ArrayOperation.page 207–246)
1. `Report.php {cmd:state, pools}` → if non-empty, swal "Wrong Pool State", abort.
2. append `cmdStart=Start`.
3. passphrase: validate `^[ -~]+$` (else "Printable Characters Only", abort) → append `luksKey=base64(text)` → submit.
4. keyfile: `update.php` KeyUpload with `file=<dataURL>` → then submit.

> **TODO (rig, when convenient):** capture a real `/sub/devices` and `/sub/mymonitor`
> message and a live Start/Spin-down POST (DevTools → Network) to confirm header/body
> shape against the above. Source-derived params are believed correct; `emhttp` validates
> server-side regardless.
