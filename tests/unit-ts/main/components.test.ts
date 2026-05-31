import { describe, it, expect } from 'vitest';
import '../../../src/ts/main/components/md-main-array-card';
import '../../../src/ts/main/components/md-main-pool-card';
import '../../../src/ts/main/components/md-main-boot-card';
import type { MdMainArrayCard } from '../../../src/ts/main/components/md-main-array-card';
import type { MdMainPoolCard } from '../../../src/ts/main/components/md-main-pool-card';
import type { MainDevice, MainArray, MainPool } from '../../../src/ts/main/types';

function device(over: Partial<MainDevice> = {}): MainDevice {
  return {
    name: 'disk1',
    idx: 1,
    role: 'data',
    deviceType: 'hdd',
    linuxDevice: 'sdk',
    id: 'ST12000VN0008-2YS101_ZRT0Q2AK',
    model: 'ST12000VN0008-2YS101',
    serial: 'ZRT0Q2AK',
    spindownDelay: null,
    status: 'ok',
    spin: 'standby',
    spunDown: true,
    tempC: null,
    numReads: 1611274,
    numWrites: 909,
    numErrors: 0,
    fsType: 'luks:xfs',
    encrypted: true,
    luksState: 1,
    sizeBytes: 12_000_138_571_776,
    fsSizeBytes: 11_997_984_796_672,
    fsUsedBytes: 9_000_020_344_832,
    fsFreeBytes: 2_997_964_451_840,
    utilizationPct: 75,
    color: 'green-blink',
    orb: 'grey',
    smart: 'healthy',
    detailHref: '/Main/Device?name=disk1',
    ...over,
  };
}

async function mount<T extends HTMLElement>(el: T): Promise<T> {
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el;
}

describe('md-main-array-card', () => {
  it('renders the section title and one tile per device, with a LED per device', async () => {
    const array: MainArray = {
      devices: [
        device({ name: 'parity', role: 'parity', fsType: null }),
        device({ name: 'disk1' }),
      ],
      sizeBytes: 12_000_138_571_776,
      usedBytes: 9_000_020_344_832,
      freeBytes: 2_997_964_451_840,
      utilizationPct: 75,
    };
    const el = document.createElement('md-main-array-card') as MdMainArrayCard;
    el.array = array;
    el.util = 'ring';
    await mount(el);
    expect(el.shadowRoot!.textContent ?? '').toContain('Array');
    const tiles = el.shadowRoot!.querySelectorAll('md-main-device-tile');
    expect(tiles.length).toBe(2);
    expect((tiles[0] as { util?: string }).util).toBe('ring'); // util threaded down
    expect(el.shadowRoot!.querySelectorAll('.led').length).toBe(2);
  });
});

describe('md-main-pool-card', () => {
  it('renders pool name, status pill, and members', async () => {
    const pool: MainPool = {
      id: 'cache',
      label: 'cache',
      status: 'online',
      statusText: 'ONLINE',
      fsType: 'luks:zfs',
      fsProfile: 'raidz1',
      sizeBytes: 5_533_990_935_000,
      usedBytes: 327_097_705_000,
      freeBytes: 5_206_893_230_000,
      utilizationPct: 8.9,
      devices: [device({ name: 'cache', role: 'pool', spunDown: false, tempC: 42, orb: 'green' })],
    };
    const el = document.createElement('md-main-pool-card') as MdMainPoolCard;
    el.pool = pool;
    await mount(el);
    const txt = el.shadowRoot!.textContent ?? '';
    expect(txt).toContain('cache');
    expect(txt).toContain('ONLINE');
    expect(txt).toContain('raidz1');
    expect(el.shadowRoot!.querySelector('.pill.online')).not.toBeNull();
  });
});
