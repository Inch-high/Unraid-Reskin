import { describe, it, expect, vi, afterEach } from 'vitest';
import '../../../src/ts/main/components/md-main-unassigned-card';
import type { MdMainUnassignedCard } from '../../../src/ts/main/components/md-main-unassigned-card';
import type { UnassignedState, UnassignedRemote } from '../../../src/ts/main/types';

function remote(over: Partial<UnassignedRemote> = {}): UnassignedRemote {
  return {
    protocol: 'smb', name: '192.168.10.99_Backups', ip: '192.168.10.99', share: 'Backups',
    mountpoint: '/mnt/remotes/192.168.10.99_Backups', fsType: 'cifs', device: 'SMB_192.168.10.99_Backups',
    mounted: true, alive: true, readOnly: false,
    sizeBytes: 1_000_000_000_000, usedBytes: 400_000_000_000, freeBytes: 600_000_000_000, ...over,
  };
}

async function mount(state: UnassignedState): Promise<MdMainUnassignedCard> {
  const el = document.createElement('md-main-unassigned-card') as MdMainUnassignedCard;
  el.state = state; el.csrf = 'C';
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el;
}

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('md-main-unassigned-card', () => {
  it('renders nothing when unavailable', async () => {
    const el = await mount({ available: false, disks: [], remotes: [] });
    expect(el.shadowRoot!.querySelector('.card')).toBeNull();
  });

  it('renders remote shares with mount state and an Unmount button', async () => {
    const el = await mount({ available: true, disks: [], remotes: [remote()] });
    const txt = el.shadowRoot!.textContent ?? '';
    expect(txt).toContain('Unassigned Devices');
    expect(txt).toContain('192.168.10.99_Backups');
    expect(txt).toContain('Remote shares');
    const btn = el.shadowRoot!.querySelector('button') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe('Unmount');   // mounted → Unmount
  });

  it('Mount/Unmount POSTs to the plugin endpoint with the device id', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'true' }));
    vi.stubGlobal('fetch', fetchMock);
    const el = await mount({ available: true, disks: [], remotes: [remote({ mounted: false })] });
    const btn = el.shadowRoot!.querySelector('button') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe('Mount');
    btn.click();
    await Promise.resolve();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/plugins/unassigned.devices/include/UnassignedDevices.php');
    expect((init as { body: string }).body).toContain('action=mount');
    expect((init as { body: string }).body).toContain('device=SMB_192.168.10.99_Backups');
  });

  it('shows the empty-disks note and the advanced-ops footnote', async () => {
    const el = await mount({ available: true, disks: [], remotes: [] });
    const txt = el.shadowRoot!.textContent ?? '';
    expect(txt).toContain('No unassigned disks');
    expect(txt).toMatch(/Main: Stock/);
  });
});
