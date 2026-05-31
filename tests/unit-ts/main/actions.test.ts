import { describe, it, expect, vi, afterEach } from 'vitest';
import * as A from '../../../src/ts/main/actions';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('action builders → exact {url, params}', () => {
  it('start (plain)', () => {
    expect(A.buildStart({ mdState: 'STOPPED' })).toEqual({
      url: '/update.htm',
      params: { startState: 'STOPPED', cmdStart: 'Start' },
    });
  });
  it('start (maintenance + confirm + parity-valid + reformat + luksKey)', () => {
    const r = A.buildStart({
      mdState: 'DISABLE_DISK',
      startMode: 'Maintenance',
      confirmStart: true,
      parityValid: true,
      luksReformat: true,
      luksKeyB64: 'YWJj',
    });
    expect(r.params).toEqual({
      startState: 'DISABLE_DISK',
      cmdStart: 'Start',
      startMode: 'Maintenance',
      luksKey: 'YWJj',
      luksReformat: 'on',
      md_invalidslot: '99',
      confirmStart: 'OFF',
    });
  });
  it('stop', () => {
    expect(A.buildStop('STARTED')).toEqual({
      url: '/update.htm',
      params: { startState: 'STARTED', cmdStop: 'Stop' },
    });
  });
  it('format', () => {
    expect(A.buildFormat('4')).toEqual({
      url: '/update.htm',
      params: { cmdFormat: 'Format', unmountable_mask: '4', confirmFormat: 'OFF' },
    });
  });
  it('parity check / correcting', () => {
    expect(A.buildParityCheck(false).params).toEqual({ cmdCheck: 'Check' });
    expect(A.buildParityCheck(true).params).toEqual({
      cmdCheck: 'Check',
      optionCorrect: 'correct',
    });
  });
  it('sync / clear / pause / resume / cancel', () => {
    expect(A.buildSync().params).toEqual({ cmdCheckSync: 'Sync' });
    expect(A.buildClear().params).toEqual({ cmdCheckClear: 'Clear' });
    expect(A.buildParityPause().params).toEqual({ cmdCheckPause: 'Pause' });
    expect(A.buildParityResume().params).toEqual({ cmdCheckResume: 'Resume' });
    expect(A.buildParityCancel().params).toEqual({ cmdCheckCancel: '' });
    expect(A.buildParityControlStamp('pause')).toEqual({
      url: '/webGui/include/ParityControl.php',
      params: { action: 'pause' },
    });
  });
  it('spin all / disk / pool / clear stats', () => {
    expect(A.buildSpinAll('up')).toEqual({
      url: '/webGui/include/ToggleState.php',
      params: { device: 'up' },
    });
    expect(A.buildSpinDisk('down', 'disk3').params).toEqual({ device: 'down', name: 'disk3' });
    expect(A.buildSpinPool('up', 'cache').params).toEqual({ device: 'up', poolName: 'cache' });
    expect(A.buildClearStats().params).toEqual({ device: 'Clear' });
  });
  it('mover / reboot / shutdown', () => {
    expect(A.buildMover(false).params).toEqual({ cmdStartMover: 'Move' });
    expect(A.buildMover(true).params).toEqual({ cmdStartMover: 'Empty' });
    expect(A.buildReboot()).toEqual({ url: '/webGui/include/Boot.php', params: { cmd: 'reboot' } });
    expect(A.buildReboot(true).params).toEqual({ cmd: 'reboot', safemode: '1' });
    expect(A.buildShutdown().params).toEqual({ cmd: 'shutdown' });
  });
  it('unassigned mount / umount → plugin endpoint', () => {
    expect(A.buildUdMount('SMB_x')).toEqual({
      url: '/plugins/unassigned.devices/include/UnassignedDevices.php',
      params: { action: 'mount', device: 'SMB_x' },
    });
    expect(A.buildUdUmount('sdz1').params).toEqual({ action: 'umount', device: 'sdz1' });
  });
  it('spin-down delay → diskSpindownDelay.<idx>', () => {
    expect(A.buildSpindownDelay(0, '-1')).toEqual({
      url: '/update.htm',
      params: { 'diskSpindownDelay.0': '-1' },
    });
    expect(A.buildSpindownDelay(3, '30').params).toEqual({ 'diskSpindownDelay.3': '30' });
  });
  it('SMART settings → smart-one.cfg via update.php (no undefined leakage)', () => {
    const r = A.buildSmartSettings({
      id: 'MODEL_SERIAL',
      hotTemp: '45',
      maxTemp: '55',
      smSelect: '1',
    });
    expect(r.url).toBe('/update.php');
    expect(r.params).toEqual({
      '#file': '/boot/config/smart-one.cfg',
      '#include': 'webGui/include/update.smart.php',
      '#section': 'MODEL_SERIAL',
      '#cleanup': 'true',
      '#apply': 'Apply',
      smEvents: '',
      hotTemp: '45',
      maxTemp: '55',
      smSelect: '1',
    });
    // smLevel/smType/smCustom omitted → must not appear as keys
    expect('smLevel' in r.params).toBe(false);
    expect('smType' in r.params).toBe(false);
  });
  it('self-test → main-smart.php endpoint', () => {
    expect(A.buildSelfTest('disk1', 'short')).toEqual({
      url: '/plugins/unraid-modernui/include/main-smart.php',
      params: { name: 'disk1', action: 'short' },
    });
    expect(A.buildSelfTest('cache', 'abort').params).toEqual({ name: 'cache', action: 'abort' });
  });
  it('keyfile upload / delete / pool precheck', () => {
    expect(A.buildKeyfileUpload('data:abc').params).toEqual({
      '#file': 'unused',
      '#include': 'webGui/include/KeyUpload.php',
      file: 'data:abc',
    });
    expect(A.buildDeleteKeyfile().params).toEqual({
      '#file': 'unused',
      '#include': 'webGui/include/KeyUpload.php',
      '#apply': 'Delete',
    });
    expect(A.buildPoolPrecheck(['cache', 'cache_apps']).params).toEqual({
      cmd: 'state',
      pools: 'cache,cache_apps',
    });
  });
});

describe('passphrase validation + base64', () => {
  it('accepts printable ASCII, rejects empty / non-ASCII', () => {
    expect(A.isValidPassphrase('hunter2!')).toBe(true);
    expect(A.isValidPassphrase('')).toBe(false);
    expect(A.isValidPassphrase('café')).toBe(false); // é is outside space..tilde
    expect(A.isValidPassphrase('emoji😀')).toBe(false);
  });
  it('base64-encodes the passphrase', () => {
    expect(A.base64Passphrase('abc')).toBe('YWJj');
  });
});

describe('submit() adds csrf and form-encodes', () => {
  it('posts form-urlencoded with csrf_token appended', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    await A.submit(
      { url: '/update.htm', params: { cmdStop: 'Stop', startState: 'STARTED' } },
      'TKN',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/update.htm');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(init.body).toContain('cmdStop=Stop');
    expect(init.body).toContain('startState=STARTED');
    expect(init.body).toContain('csrf_token=TKN');
  });
});

describe('submitEncryptedStart — prepareInput sequence', () => {
  it('aborts on non-empty pool-state precheck (wrong pool state)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, text: async () => 'pool degraded' })),
    );
    const r = await A.submitEncryptedStart(
      { start: { mdState: 'STOPPED' }, poolNames: ['cache'], passphrase: 'pw' },
      'T',
    );
    expect(r).toMatchObject({ ok: false, error: 'wrong-pool-state' });
  });

  it('rejects a non-ASCII passphrase without starting', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await A.submitEncryptedStart(
      { start: { mdState: 'STOPPED' }, poolNames: ['cache'], passphrase: 'café' },
      'T',
    );
    expect(r).toMatchObject({ ok: false, error: 'bad-passphrase' });
    // precheck happened (1 call), but no start was posted
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it('passphrase path: precheck → start with base64 luksKey', async () => {
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(init?.body ?? '');
      return { ok: true, status: 200, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await A.submitEncryptedStart(
      { start: { mdState: 'STOPPED' }, poolNames: ['cache'], passphrase: 'abc' },
      'T',
    );
    expect(r).toEqual({ ok: true });
    expect(bodies.length).toBe(2); // precheck + start
    expect(bodies[1]).toContain('luksKey=YWJj');
    expect(bodies[1]).toContain('cmdStart=Start');
  });

  it('keyfile path: precheck → upload → start', async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await A.submitEncryptedStart(
      { start: { mdState: 'STOPPED' }, poolNames: ['cache'], keyfileDataUrl: 'data:key' },
      'T',
    );
    expect(r).toEqual({ ok: true });
    expect(urls).toEqual([
      '/webGui/include/Report.php',
      '/update.php', // keyfile upload
      '/update.htm', // start
    ]);
  });

  it('reformat flag flows into the start request', async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: { body: string }) => {
        bodies.push(init?.body ?? '');
        return { ok: true, status: 200, text: async () => '' };
      }),
    );
    await A.submitEncryptedStart(
      { start: { mdState: 'STOPPED' }, poolNames: [], passphrase: 'abc', reformat: true },
      'T',
    );
    expect(bodies[1]).toContain('luksReformat=on');
  });
});
