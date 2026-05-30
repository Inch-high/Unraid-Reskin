import { describe, it, expect } from 'vitest';
import '../../../src/ts/main/components/md-main-device-row';
import '../../../src/ts/main/components/md-main-array-card';
import '../../../src/ts/main/components/md-main-pool-card';
import '../../../src/ts/main/components/md-main-boot-card';
import type { MdMainDeviceRow } from '../../../src/ts/main/components/md-main-device-row';
import type { MdMainArrayCard } from '../../../src/ts/main/components/md-main-array-card';
import type { MdMainPoolCard } from '../../../src/ts/main/components/md-main-pool-card';
import type { MainDevice, MainArray, MainPool } from '../../../src/ts/main/types';

function device(over: Partial<MainDevice> = {}): MainDevice {
  return {
    name: 'disk1', role: 'data', linuxDevice: 'sdk',
    model: 'ST12000VN0008-2YS101', serial: 'ZRT0Q2AK',
    status: 'ok', spin: 'standby', spunDown: true, tempC: null,
    numReads: 1611274, numWrites: 909, numErrors: 0,
    fsType: 'luks:xfs', encrypted: true, luksState: 1,
    sizeBytes: 12_000_138_571_776, fsSizeBytes: 11_997_984_796_672,
    fsUsedBytes: 9_000_020_344_832, fsFreeBytes: 2_997_964_451_840,
    utilizationPct: 75, color: 'green-blink', orb: 'grey', smart: 'healthy',
    detailHref: '/Main/Device?name=disk1', ...over,
  };
}

async function mount<T extends HTMLElement>(el: T): Promise<T> {
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el;
}

describe('md-main-device-row', () => {
  it('renders model, serial, reads, and detail link (the 1:1 fields)', async () => {
    const el = document.createElement('md-main-device-row') as MdMainDeviceRow;
    el.device = device();
    await mount(el);
    const txt = el.shadowRoot!.textContent ?? '';
    expect(txt).toContain('disk1');
    expect(txt).toContain('ST12000VN0008-2YS101');
    expect(txt).toContain('ZRT0Q2AK');           // serial
    expect(txt).toContain('1,611,274');          // reads grouped
    expect(txt).toContain('standby');            // spun-down state label
    expect(txt).toContain('luks:xfs');           // fs
    const link = el.shadowRoot!.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/Main/Device?name=disk1');
  });

  it('shows a dash temp when spun down and 75% utilization', async () => {
    const el = document.createElement('md-main-device-row') as MdMainDeviceRow;
    el.device = device();
    await mount(el);
    const txt = el.shadowRoot!.textContent ?? '';
    expect(txt).toContain('—');     // temp '*' → dash
    expect(txt).toContain('75%');
  });

  it('flags non-zero errors', async () => {
    const el = document.createElement('md-main-device-row') as MdMainDeviceRow;
    el.device = device({ numErrors: 5 });
    await mount(el);
    expect(el.shadowRoot!.querySelector('.err-bad')).not.toBeNull();
  });
});

describe('md-main-array-card', () => {
  it('renders title, totals, and one row per device', async () => {
    const array: MainArray = {
      devices: [device({ name: 'parity', role: 'parity', fsType: null }), device({ name: 'disk1' })],
      sizeBytes: 12_000_138_571_776, usedBytes: 9_000_020_344_832,
      freeBytes: 2_997_964_451_840, utilizationPct: 75,
    };
    const el = document.createElement('md-main-array-card') as MdMainArrayCard;
    el.array = array;
    await mount(el);
    const txt = el.shadowRoot!.textContent ?? '';
    expect(txt).toContain('Array Devices');
    expect(txt).toContain('used of');
    expect(el.shadowRoot!.querySelectorAll('md-main-device-row').length).toBe(2);
  });
});

describe('md-main-pool-card', () => {
  it('renders pool name, status pill, and members', async () => {
    const pool: MainPool = {
      id: 'cache', label: 'cache', status: 'online', statusText: 'ONLINE',
      fsType: 'luks:zfs', fsProfile: 'raidz1',
      sizeBytes: 5_533_990_935_000, usedBytes: 327_097_705_000, freeBytes: 5_206_893_230_000,
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
