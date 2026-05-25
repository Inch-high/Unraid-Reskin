import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharesExtractor } from '../../../../src/ts/dashboard/extractors/shares';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

function makeTbody(html: string): HTMLTableSectionElement {
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('sharesExtractor', () => {
  const tbody = loadFixture('Shares_Information.html');

  it('matches the shares fixture via title attribute', () => {
    expect(sharesExtractor.match({ source: tbody })).toBe(true);
  });

  it('matches when only the share select is present', () => {
    const other = makeTbody(
      '<tbody><tr><td><select name="enter_share"><option>SMB</option></select></td></tr></tbody>',
    );
    expect(sharesExtractor.match({ source: other })).toBe(true);
  });

  it('matches when the header h3 contains SHARES', () => {
    const other = makeTbody('<tbody class="mixed"><tr><td><h3>Shares</h3></td></tr></tbody>');
    expect(sharesExtractor.match({ source: other })).toBe(true);
  });

  it('does not match a non-shares tbody', () => {
    const other = makeTbody(
      '<tbody title="Parity Information"><tr><td><h3>Parity</h3></td></tr></tbody>',
    );
    expect(sharesExtractor.match({ source: other })).toBe(false);
  });

  it('extracts 10 shares from the fixture', () => {
    const result = sharesExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('shares');
    expect(result?.shares).toHaveLength(10);
  });

  it('extracts header counts from the fixture', () => {
    const result = sharesExtractor.extract({ source: tbody });
    expect(result?.totalCount).toBe(10);
    expect(result?.publicSmbCount).toBe(0);
    expect(result?.publicNfsCount).toBe(0);
  });

  it('parses Plex as private (em tag present)', () => {
    const result = sharesExtractor.extract({ source: tbody });
    const plex = result?.shares.find((s) => s.name === 'Plex');
    expect(plex?.security).toBe('private');
  });

  it('parses Backups as public (no em tag)', () => {
    const result = sharesExtractor.extract({ source: tbody });
    const backups = result?.shares.find((s) => s.name === 'Backups');
    expect(backups?.security).toBe('public');
  });

  it('treats dash description as empty string', () => {
    const result = sharesExtractor.extract({ source: tbody });
    const backups = result?.shares.find((s) => s.name === 'Backups');
    expect(backups?.description).toBe('');
  });

  it('extracts a real description when present', () => {
    const result = sharesExtractor.extract({ source: tbody });
    const appdata = result?.shares.find((s) => s.name === 'appdata');
    expect(appdata?.description).toBe('application data');
  });

  it('parses stream counts (all zero in fixture)', () => {
    const result = sharesExtractor.extract({ source: tbody });
    for (const s of result!.shares) {
      expect(s.streams).toBe(0);
    }
  });

  it('header regex captures different counts', () => {
    const other = makeTbody(
      '<tbody title="Shares Information"><tr><td><span>Share count: 25 with 3 public SMB and 1 public NFS</span></td></tr></tbody>',
    );
    const result = sharesExtractor.extract({ source: other });
    expect(result?.totalCount).toBe(25);
    expect(result?.publicSmbCount).toBe(3);
    expect(result?.publicNfsCount).toBe(1);
  });

  it('defaults all header counts to 0 when missing', () => {
    const other = makeTbody(
      '<tbody title="Shares Information"><tr><td><h3>Shares</h3></td></tr></tbody>',
    );
    const result = sharesExtractor.extract({ source: other });
    expect(result?.totalCount).toBe(0);
    expect(result?.publicSmbCount).toBe(0);
    expect(result?.publicNfsCount).toBe(0);
  });

  it('parses streams: numeric, empty, and non-numeric', () => {
    const other = makeTbody(
      `<tbody title="Shares Information">
        <tr class="smb share"><td><span class='w26'><a>A</a></span><span class='w44'>-</span><span class='w18'>-</span><span id='share0'>0</span></td></tr>
        <tr class="smb share"><td><span class='w26'><a>B</a></span><span class='w44'>-</span><span class='w18'>-</span><span id='share1'></span></td></tr>
        <tr class="smb share"><td><span class='w26'><a>C</a></span><span class='w44'>-</span><span class='w18'>-</span><span id='share2'>5</span></td></tr>
      </tbody>`,
    );
    const result = sharesExtractor.extract({ source: other });
    expect(result?.shares.map((s) => s.streams)).toEqual([0, null, 5]);
  });

  it('returns an empty share list when no share rows exist', () => {
    const other = makeTbody(
      '<tbody title="Shares Information"><tr><td><h3>Shares</h3></td></tr></tbody>',
    );
    const result = sharesExtractor.extract({ source: other });
    expect(result?.shares).toEqual([]);
  });

  it('maps "Secure" em text to secure security', () => {
    const other = makeTbody(
      `<tbody title="Shares Information">
        <tr class="smb share"><td><span class='w26'><a>X</a></span><span class='w44'>-</span><span class='w18'><em>Secure</em></span><span id='share0'>0</span></td></tr>
      </tbody>`,
    );
    const result = sharesExtractor.extract({ source: other });
    expect(result?.shares[0].security).toBe('secure');
  });
});
