// Action proxies for the /Main page. Every state-changing operation POSTs to
// Unraid's STOCK endpoints with the exact field names the stock page uses —
// emhttp does all the work, we just build and send the request. The builders
// are pure ({url, params}) so the params are unit-testable without a network;
// submit() adds csrf_token and performs the form-urlencoded POST.
//
// Endpoint/param reference: src/ts/main/__fixtures__/README.md + the captured
// ArrayOperation.page / ToggleState.php / Boot.php.

export interface ActionRequest {
  url: string;
  params: Record<string, string>;
}

const UPDATE_HTM = '/update.htm'; // array/parity/mover cmds → emcmd
const UPDATE_PHP = '/update.php'; // keyfile upload / delete
const TOGGLE = '/webGui/include/ToggleState.php'; // spin up/down, clear stats
const BOOT = '/webGui/include/Boot.php'; // reboot / shutdown
const PARITY_CTL = '/webGui/include/ParityControl.php'; // pause/resume timestamps
const REPORT = '/webGui/include/Report.php'; // pool-state precheck

const KEYUPLOAD_INCLUDE = 'webGui/include/KeyUpload.php';

// ---- Array start / stop / format ----------------------------------------

export interface StartOpts {
  mdState: string; // current var.ini mdState → startState hidden field
  startMode?: 'Normal' | 'Maintenance';
  luksKeyB64?: string; // base64 of the passphrase, when encrypted
  luksReformat?: boolean; // "permit reformat" (data-destructive; guarded in UI)
  parityValid?: boolean; // NEW_ARRAY "Parity is already valid" → md_invalidslot=99
  confirmStart?: boolean; // DISABLE_DISK / missing-pool-disk confirm checkbox
}

export function buildStart(opts: StartOpts): ActionRequest {
  const params: Record<string, string> = { startState: opts.mdState, cmdStart: 'Start' };
  if (opts.startMode === 'Maintenance') params.startMode = 'Maintenance';
  if (opts.luksKeyB64) params.luksKey = opts.luksKeyB64;
  if (opts.luksReformat) params.luksReformat = 'on';
  if (opts.parityValid) params.md_invalidslot = '99';
  if (opts.confirmStart) params.confirmStart = 'OFF'; // stock checkbox value; presence = confirmed
  return { url: UPDATE_HTM, params };
}

export function buildStop(mdState: string): ActionRequest {
  return { url: UPDATE_HTM, params: { startState: mdState, cmdStop: 'Stop' } };
}

export function buildFormat(unmountableMask: string): ActionRequest {
  return {
    url: UPDATE_HTM,
    params: { cmdFormat: 'Format', unmountable_mask: unmountableMask, confirmFormat: 'OFF' },
  };
}

// ---- Parity / sync / clear ------------------------------------------------

export function buildParityCheck(correcting: boolean): ActionRequest {
  const params: Record<string, string> = { cmdCheck: 'Check' };
  if (correcting) params.optionCorrect = 'correct';
  return { url: UPDATE_HTM, params };
}
export function buildSync(): ActionRequest {
  return { url: UPDATE_HTM, params: { cmdCheckSync: 'Sync' } };
}
export function buildClear(): ActionRequest {
  return { url: UPDATE_HTM, params: { cmdCheckClear: 'Clear' } };
}
export function buildParityPause(): ActionRequest {
  return { url: UPDATE_HTM, params: { cmdCheckPause: 'Pause' } };
}
export function buildParityResume(): ActionRequest {
  return { url: UPDATE_HTM, params: { cmdCheckResume: 'Resume' } };
}
export function buildParityCancel(): ActionRequest {
  return { url: UPDATE_HTM, params: { cmdCheckCancel: '' } };
}
// Pause/resume first stamp ParityControl.php, then the cmd above is posted.
export function buildParityControlStamp(action: 'pause' | 'resume'): ActionRequest {
  return { url: PARITY_CTL, params: { action } };
}

// ---- Spin / clear stats ---------------------------------------------------

export function buildSpinAll(dir: 'up' | 'down'): ActionRequest {
  return { url: TOGGLE, params: { device: dir } };
}
export function buildSpinDisk(dir: 'up' | 'down', name: string): ActionRequest {
  return { url: TOGGLE, params: { device: dir, name } };
}
export function buildSpinPool(dir: 'up' | 'down', poolName: string): ActionRequest {
  return { url: TOGGLE, params: { device: dir, poolName } };
}
export function buildClearStats(): ActionRequest {
  return { url: TOGGLE, params: { device: 'Clear' } };
}

// ---- Mover / power --------------------------------------------------------

export function buildMover(empty: boolean): ActionRequest {
  return { url: UPDATE_HTM, params: { cmdStartMover: empty ? 'Empty' : 'Move' } };
}
export function buildReboot(safemode = false): ActionRequest {
  const params: Record<string, string> = { cmd: 'reboot' };
  if (safemode) params.safemode = '1';
  return { url: BOOT, params };
}
export function buildShutdown(): ActionRequest {
  return { url: BOOT, params: { cmd: 'shutdown' } };
}

// ---- Encryption -----------------------------------------------------------

export function buildKeyfileUpload(dataUrl: string): ActionRequest {
  return {
    url: UPDATE_PHP,
    params: { '#file': 'unused', '#include': KEYUPLOAD_INCLUDE, file: dataUrl },
  };
}
export function buildDeleteKeyfile(): ActionRequest {
  return {
    url: UPDATE_PHP,
    params: { '#file': 'unused', '#include': KEYUPLOAD_INCLUDE, '#apply': 'Delete' },
  };
}
export function buildPoolPrecheck(poolNames: string[]): ActionRequest {
  return { url: REPORT, params: { cmd: 'state', pools: poolNames.join(',') } };
}

// Printable-ASCII only (space..tilde), matching prepareInput()'s passphrase
// guard. Non-conforming passphrases must use the keyfile method instead.
const PRINTABLE_ASCII = /^[ -~]+$/;
export function isValidPassphrase(text: string): boolean {
  return text.length > 0 && PRINTABLE_ASCII.test(text);
}

// base64 of a UTF-8(-safe printable-ASCII) passphrase for the luksKey field.
export function base64Passphrase(text: string): string {
  // btoa is fine here because isValidPassphrase() guarantees ASCII.
  return btoa(text);
}

// ---- Unassigned Devices (optional plugin) ---------------------------------
// Mount/unmount proxy to the plugin's OWN endpoint with its exact params
// (POST .../UnassignedDevices.php {action:'mount'|'umount', device}). All other
// UD operations stay in the stock plugin UI (Main: Stock).
const UD_ENDPOINT = '/plugins/unassigned.devices/include/UnassignedDevices.php';
export function buildUdMount(device: string): ActionRequest {
  return { url: UD_ENDPOINT, params: { action: 'mount', device } };
}
export function buildUdUmount(device: string): ActionRequest {
  return { url: UD_ENDPOINT, params: { action: 'umount', device } };
}

// ---- Submit ---------------------------------------------------------------

// POST an ActionRequest as application/x-www-form-urlencoded with the csrf
// token appended. Mirrors how the stock form posts to update.htm (we use fetch
// + a caller-driven resync instead of the hidden progressFrame reload, so the
// modern page stays mounted). Returns the Response for callers that care.
export async function submit(req: ActionRequest, csrfToken: string): Promise<Response> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(req.params)) body.append(k, v);
  if (csrfToken) body.append('csrf_token', csrfToken);
  return fetch(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'same-origin',
    body: body.toString(),
  });
}

// ---- Encrypted-start sequencer (prepareInput 1:1) -------------------------

export interface EncryptedStartInput {
  start: StartOpts; // base start opts (mdState, startMode, parityValid, confirmStart)
  poolNames: string[]; // for the Report.php precheck
  passphrase?: string; // text method
  keyfileDataUrl?: string; // keyfile method (already read to a base64 data URL)
  reformat?: boolean; // permit reformat (guarded upstream)
}

export type EncryptedStartResult =
  | { ok: true }
  | { ok: false; error: 'wrong-pool-state' | 'bad-passphrase' | 'no-key'; detail?: string };

// Reproduces prepareInput(): pool-state precheck → (passphrase: validate ASCII
// → luksKey=base64 → start) | (keyfile: upload → start). Returns a structured
// result so the panel can surface the same swal-style errors stock shows.
export async function submitEncryptedStart(
  input: EncryptedStartInput,
  csrfToken: string,
): Promise<EncryptedStartResult> {
  // 1) Pool-state precheck — a non-empty body means "wrong pool state", abort.
  const pre = await submit(buildPoolPrecheck(input.poolNames), csrfToken);
  const preText = (await pre.text()).trim();
  if (preText.length > 0) return { ok: false, error: 'wrong-pool-state', detail: preText };

  const startOpts: StartOpts = { ...input.start, luksReformat: input.reformat };

  // 2) Passphrase method.
  if (input.passphrase !== undefined && input.passphrase !== '') {
    if (!isValidPassphrase(input.passphrase)) return { ok: false, error: 'bad-passphrase' };
    startOpts.luksKeyB64 = base64Passphrase(input.passphrase);
    await submit(buildStart(startOpts), csrfToken);
    return { ok: true };
  }

  // 3) Keyfile method — upload, then start.
  if (input.keyfileDataUrl) {
    await submit(buildKeyfileUpload(input.keyfileDataUrl), csrfToken);
    await submit(buildStart(startOpts), csrfToken);
    return { ok: true };
  }

  return { ok: false, error: 'no-key' };
}

// Pause/resume are two-step: stamp ParityControl then post the cmd.
export async function submitParityPause(csrfToken: string): Promise<void> {
  await submit(buildParityControlStamp('pause'), csrfToken);
  await submit(buildParityPause(), csrfToken);
}
export async function submitParityResume(csrfToken: string): Promise<void> {
  await submit(buildParityControlStamp('resume'), csrfToken);
  await submit(buildParityResume(), csrfToken);
}
